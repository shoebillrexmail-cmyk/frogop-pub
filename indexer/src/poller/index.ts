/**
 * Block poller — runs inside the Cron Trigger scheduled() handler.
 *
 * Uses JSONRpcProvider from opnet (works in Workers via fetch browser polyfill).
 * One RPC call per block: getBlock(n, prefetchTxs=true) returns all events embedded
 * on tx.events[] — confirmed via live testnet RPC. No per-tx getTransactionReceipt.
 */
import { JSONRpcProvider } from 'opnet';
import { networks, type Network } from '@btc-vision/bitcoin';
import type { Env, BlockTx, TxEvent, PriceCandleRow } from '../types/index.js';

/** Resolve network string from env to actual network object */
function resolveNetwork(name: string): Network {
    switch (name) {
        case 'opnetTestnet': return networks.opnetTestnet;
        default: return networks.opnetTestnet;
    }
}
import {
    getLastIndexedBlock,
    stmtSetLastIndexedBlock,
    stmtInsertPriceSnapshot,
    stmtUpsertCandle,
    stmtPruneOldSnapshots,
    stmtPruneOldSwapEvents,
    getSnapshotsInRange,
    getSwapEventsInBlockRange,
    upsertPool,
} from '../db/queries.js';
import { decodeBlock } from '../decoder/index.js';

/** 18-decimal fixed-point precision constant for cross-rate math. */
const PRECISION = 10n ** 18n;

/** Cross-rate tokens contain an underscore (e.g. MOTO_PILL, MOTO_BTC). */
function isCrossRate(token: string): boolean {
    return token.includes('_');
}

export async function pollNewBlocks(env: Env): Promise<void> {
    const maxBlocksPerRun = parseInt(env.MAX_BLOCKS_PER_RUN, 10) || 20;

    const network = resolveNetwork(env.OPNET_NETWORK);
    const provider = new JSONRpcProvider({ url: env.OPNET_RPC_URL, network });

    const poolHexSet = await resolvePoolAddresses(env, provider);
    const swapConfig = resolveSwapConfig(env);

    // Ensure pool rows exist in D1 (FK constraint: options.pool_address → pools.address)
    for (const hex of poolHexSet) {
        await upsertPool(env.DB, {
            address: hex, address_hex: hex,
            underlying: '', premium_token: '', fee_recipient: '',
            created_block: 0, created_tx: '',
            indexed_at: new Date().toISOString(),
        });
    }

    const lastIndexed = await getLastIndexedBlock(env.DB);
    const latestBlock = Number(await provider.getBlockNumber());

    if (latestBlock <= lastIndexed) {
        console.log(`[poller] Already up to date at block ${lastIndexed}`);
        return;
    }

    const from = lastIndexed + 1;
    const to   = Math.min(latestBlock, lastIndexed + maxBlocksPerRun);
    const catching_up = to < latestBlock;
    console.log(`[poller] Syncing blocks ${from} → ${to} (latest=${latestBlock}, behind=${latestBlock - to})`);

    // Build swap label map for event decoding.
    // SwapExecuted events use the token contract address, not the router.
    // Map each token address (lowercased) → label, plus the router itself.
    const swapLabelMap = new Map<string, string>();
    if (swapConfig) {
        for (const [tokenHex, label] of swapConfig.tokenMap) {
            swapLabelMap.set(tokenHex.toLowerCase(), label);
        }
        // Also map the router address in case SwapExecuted comes from there
        const firstLabel = swapConfig.tokenMap.values().next().value as string;
        swapLabelMap.set(swapConfig.routerHex.toLowerCase(), firstLabel);
    }

    // Collect ALL block statements into a single batch to minimize D1 subrequests.
    // Previous approach: 1 db.batch() per block = N subrequests.
    // New approach: 1 db.batch() for all blocks = 1 subrequest.
    const allStmts: D1PreparedStatement[] = [];

    for (let n = from; n <= to; n++) {
        const stmts = await collectBlockStatements(provider, n, env.DB, poolHexSet, swapLabelMap);
        allStmts.push(...stmts);
    }

    // Final cursor update for the last block processed
    allStmts.push(stmtSetLastIndexedBlock(env.DB, to));

    // Commit everything atomically in one D1 batch
    await env.DB.batch(allStmts);
    console.log(`[poller] Committed ${allStmts.length} statement(s) for blocks ${from}-${to}`);

    // Post-sync tasks run with per-task isolation so partial failures
    // don't cascade. E.g. if price polling fails, candles still roll up.
    const postSyncTasks: Array<{ name: string; fn: () => Promise<void> }> = [
        { name: 'pollPrices', fn: () => pollPrices(env, provider, swapConfig, latestBlock) },
    ];

    // Only roll up candles + prune when near tip (saves ~20 D1 subrequests during catch-up)
    if (!catching_up) {
        const tokenLabels = swapConfig
            ? [...swapConfig.tokenMap.values()]
            : ['MOTO', 'PILL'];
        // Add cross-rate pairs for all combinations
        const allTokens = [...tokenLabels];
        if (tokenLabels.length >= 2) {
            allTokens.push(`${tokenLabels[0]}_${tokenLabels[1]}`);
        }
        // Add BTC cross-rate for each base token
        for (const label of tokenLabels) {
            allTokens.push(`${label}_BTC`);
        }
        // Result: ['MOTO', 'PILL', 'MOTO_PILL', 'MOTO_BTC', 'PILL_BTC']
        postSyncTasks.push(
            { name: 'rollUpCandles', fn: () => rollUpAllCandles(env.DB, allTokens) },
            { name: 'pruneOldData', fn: () => pruneOldData(env.DB, latestBlock) },
        );
    }

    const results = await Promise.allSettled(postSyncTasks.map((t) => t.fn()));
    for (let i = 0; i < results.length; i++) {
        const r = results[i]!;
        if (r.status === 'rejected') {
            console.error(`[poller] ${postSyncTasks[i]!.name} failed:`, r.reason);
        }
    }
}

/** Fetch a block and return D1 statements for its events (no DB writes). */
export async function collectBlockStatements(
    provider: JSONRpcProvider,
    blockNumber: number,
    db: D1Database,
    trackedPools: Set<string>,
    swapLabelMap: Map<string, string> = new Map(),
): Promise<D1PreparedStatement[]> {
    const block = await provider.getBlock(BigInt(blockNumber), true);
    if (!block) {
        console.warn(`[poller] Block ${blockNumber} not found, skipping`);
        return [];
    }

    // CRITICAL: use rawTransactions, NOT transactions.
    // The SDK's parsed .transactions getter converts events to NetEvent objects
    // (Uint8Array data, bech32 keys) — incompatible with our base64/hex decoder.
    // rawTransactions preserves the original RPC format: base64 data, hex addresses.
    const rawTxs = (block as unknown as { rawTransactions?: unknown[] }).rawTransactions ?? [];
    if (rawTxs.length > 0) {
        // Log event count per block for diagnostics (only first few blocks)
        let totalEvents = 0;
        for (const tx of rawTxs) {
            const t = tx as Record<string, unknown>;
            const ev = t['events'];
            if (Array.isArray(ev)) { totalEvents += ev.length; }
            else if (ev && typeof ev === 'object') {
                for (const v of Object.values(ev)) { if (Array.isArray(v)) totalEvents += v.length; }
            }
        }
        if (totalEvents > 0) {
            console.log(`[poller] Block ${blockNumber}: ${rawTxs.length} tx(s), ${totalEvents} raw event(s)`);
        }
    }
    const txs: BlockTx[] = rawTxs.map((tx: unknown) => {
        const t = tx as Record<string, unknown>;
        const rawEvents = t['events'];
        const eventList: TxEvent[] = [];

        if (Array.isArray(rawEvents)) {
            for (const ev of rawEvents) {
                const e = ev as Record<string, string>;
                eventList.push({
                    contractAddress: e['contractAddress'] ?? '',
                    type:            e['type'] ?? '',
                    data:            e['data'] ?? '',
                });
            }
        } else if (rawEvents && typeof rawEvents === 'object') {
            // Events keyed by contract address: { "0xabc...": [...], ... }
            for (const [contractAddr, events] of Object.entries(rawEvents)) {
                if (!Array.isArray(events)) continue;
                for (const ev of events) {
                    const e = ev as Record<string, string>;
                    eventList.push({
                        contractAddress: e['contractAddress'] ?? contractAddr,
                        type:            e['type'] ?? '',
                        data:            e['data'] ?? '',
                    });
                }
            }
        }

        return { id: String(t['id'] ?? ''), events: eventList } satisfies BlockTx;
    });

    // Decode events → D1 prepared statements
    const eventStmts = decodeBlock(db, blockNumber, txs, trackedPools, swapLabelMap);

    if (eventStmts.length > 0) {
        console.log(`[poller] Block ${blockNumber}: ${eventStmts.length} event statement(s)`);
    }

    return eventStmts;
}

// ---------------------------------------------------------------------------
// Address resolution
// ---------------------------------------------------------------------------
// OPNet events use 0x hex addresses. Pool addresses in config are bech32 (opt1...).
// We resolve them once per cron invocation using getPublicKeyInfo.
// TODO: cache resolved hex in D1 `indexer_state` to avoid repeated RPC calls.
async function resolvePoolAddresses(env: Env, provider: JSONRpcProvider): Promise<Set<string>> {
    const bech32Addresses = env.POOL_ADDRESSES.split(' ').filter(Boolean);
    const hexSet = new Set<string>();

    for (const addr of bech32Addresses) {
        try {
            const pubKeyInfo = await provider.getPublicKeyInfo(addr, true);
            if (pubKeyInfo) {
                // getPublicKeyInfo returns hex WITHOUT 0x prefix, but OPNet events
                // use 0x-prefixed hex in event.contractAddress — must match.
                const raw = pubKeyInfo.toString().toLowerCase();
                const hex = raw.startsWith('0x') ? raw : '0x' + raw;
                hexSet.add(hex);
                console.log(`[poller] Resolved ${addr} → ${hex}`);
            }
        } catch (err) {
            console.error(`[poller] Failed to resolve address ${addr}:`, err);
        }
    }

    console.log(`[poller] Tracking ${hexSet.size} pool(s) in hex format`);
    return hexSet;
}

// ---------------------------------------------------------------------------
// NativeSwap address resolution
// ---------------------------------------------------------------------------

/** Resolved NativeSwap config: one router contract + per-token addresses. */
export interface SwapConfig {
    /** 0x-hex of the NativeSwap router contract (where we call getQuote) */
    routerHex: string;
    /** tokenHex → label (e.g. "0xfd44..." → "MOTO") */
    tokenMap: Map<string, string>;
}

function resolveSwapConfig(env: Env): SwapConfig | null {
    const router = (env.NATIVESWAP_CONTRACT ?? '').trim().toLowerCase();
    if (!router) return null;

    const tokenAddrs = (env.NATIVESWAP_TOKEN_ADDRESSES ?? '').split(' ').filter(Boolean);
    const labels     = (env.NATIVESWAP_LABELS ?? '').split(',').filter(Boolean);
    if (tokenAddrs.length === 0 || labels.length === 0) return null;

    const tokenMap = new Map<string, string>();
    for (let i = 0; i < tokenAddrs.length; i++) {
        const label = labels[i];
        if (!label) continue;
        tokenMap.set(tokenAddrs[i]!.toLowerCase(), label);
    }

    if (tokenMap.size > 0) {
        console.log(`[poller] NativeSwap router: ${router}, tracking ${tokenMap.size} token(s)`);
    }
    return { routerHex: router, tokenMap };
}

// ---------------------------------------------------------------------------
// Spot price polling (getQuote via raw provider.call)
// ---------------------------------------------------------------------------

/** ABICoder.encodeSelector('getQuote(address,uint64)') — precomputed 4-byte selector */
const GET_QUOTE_SELECTOR = '51852102';

export function encodeGetQuoteCalldata(tokenHex: string, satoshis: bigint): string {
    // selector (4 bytes) + token address (32 bytes, zero-padded left) + satoshis (8 bytes, big-endian)
    const addr = tokenHex.startsWith('0x') ? tokenHex.slice(2) : tokenHex;
    const addrPadded = addr.padStart(64, '0');
    const satsHex = satoshis.toString(16).padStart(16, '0');
    return '0x' + GET_QUOTE_SELECTOR + addrPadded + satsHex;
}

export async function pollPrices(
    env: Env,
    provider: JSONRpcProvider,
    swapConfig: SwapConfig | null,
    currentBlock: number,
): Promise<void> {
    if (!swapConfig) return;

    const timestamp = new Date().toISOString();
    const stmts: D1PreparedStatement[] = [];
    const prices: Record<string, string> = {};

    // Call getQuote(tokenAddress, 100k sats) on the single NativeSwap router
    // for each tracked token. Returns how many tokens you get for 100k sats.
    for (const [tokenHex, label] of swapConfig.tokenMap) {
        try {
            const calldata = encodeGetQuoteCalldata(tokenHex, 100_000n);
            const result = await provider.call(swapConfig.routerHex, calldata);

            // Duck-type the result: bundled instanceof can fail across module boundaries
            const reader = result && typeof result === 'object' && 'result' in result
                ? (result as { result?: { readU256?: () => bigint } }).result
                : undefined;

            if (reader && typeof reader.readU256 === 'function') {
                const price = reader.readU256().toString();
                prices[label] = price;
                stmts.push(stmtInsertPriceSnapshot(env.DB, {
                    token: label,
                    block_number: currentBlock,
                    timestamp,
                    price,
                }));
                console.log(`[poller] ${label} price: ${price}`);
            } else {
                console.warn(`[poller] getQuote returned unexpected result for ${label}:`, typeof result, result);
            }
        } catch (err) {
            console.warn(`[poller] getQuote failed for ${label}:`, err);
        }
    }

    // Compute cross-rate for all pairs of tracked tokens
    const labels = [...swapConfig.tokenMap.values()];
    if (labels.length >= 2) {
        const labelA = labels[0]!;
        const labelB = labels[1]!;
        const priceA = prices[labelA];
        const priceB = prices[labelB];
        if (priceA && priceB) {
            const tokensA = BigInt(priceA);
            const tokensB = BigInt(priceB);
            if (tokensA > 0n) {
                const crossRate = (tokensB * PRECISION) / tokensA;
                const pairKey = `${labelA}_${labelB}`;
                stmts.push(stmtInsertPriceSnapshot(env.DB, {
                    token: pairKey,
                    block_number: currentBlock,
                    timestamp,
                    price: crossRate.toString(),
                }));
            }
        }
    }

    // BTC cross-rates: sats per token = (100_000 * 1e36) / tokensPerQuote
    // Numerator uses PRECISION² (1e36) so the result is 1e18-scaled, matching
    // the convention used by MOTO_PILL and expected by toFloat() / invertPrice().
    // One PRECISION cancels with the token's 18-decimal encoding; the second remains.
    const BTC_QUOTE_SATS = 100_000n;
    for (const [label, priceStr] of Object.entries(prices)) {
        const tokensPerQuote = BigInt(priceStr);
        if (tokensPerQuote > 0n) {
            const satsPerToken = (BTC_QUOTE_SATS * PRECISION * PRECISION) / tokensPerQuote;
            const pairKey = `${label}_BTC`;
            stmts.push(stmtInsertPriceSnapshot(env.DB, {
                token: pairKey,
                block_number: currentBlock,
                timestamp,
                price: satsPerToken.toString(),
            }));
            console.log(`[poller] ${pairKey} price: ${satsPerToken.toString()}`);
        }
    }

    if (stmts.length > 0) {
        await env.DB.batch(stmts);
        console.log(`[poller] Saved ${stmts.length} price snapshot(s)`);
    }
}

// ---------------------------------------------------------------------------
// Candle rollup
// ---------------------------------------------------------------------------

const INTERVALS: Array<{ key: string; ms: number }> = [
    { key: '1h', ms: 3_600_000 },
    { key: '4h', ms: 14_400_000 },
    { key: '1d', ms: 86_400_000 },
    { key: '1w', ms: 604_800_000 },
];

function floorToInterval(date: Date, intervalMs: number): Date {
    return new Date(Math.floor(date.getTime() / intervalMs) * intervalMs);
}

export async function rollUpAllCandles(db: D1Database, tokens: string[] = ['MOTO', 'PILL', 'MOTO_PILL']): Promise<void> {
    const now = new Date();
    const stmts: D1PreparedStatement[] = [];

    for (const token of tokens) {
        for (const { key, ms } of INTERVALS) {
            const bucketStart = floorToInterval(now, ms);
            const bucketEnd   = new Date(bucketStart.getTime() + ms);
            const fromIso     = bucketStart.toISOString();
            const toIso       = bucketEnd.toISOString();

            const snapshots = await getSnapshotsInRange(db, token, fromIso, toIso);
            if (snapshots.length === 0) continue;

            const snapshotPrices = snapshots.map(s => BigInt(s.price));
            const open  = snapshotPrices[0]!;
            const close = snapshotPrices[snapshotPrices.length - 1]!;
            let high = open;
            let low  = open;
            for (const p of snapshotPrices) {
                if (p > high) high = p;
                if (p < low) low = p;
            }

            // Volume from swap events (only for base tokens, not cross-rates)
            let volumeSats = 0n;
            let volumeTokens = 0n;
            let tradeCount = 0;
            if (!isCrossRate(token)) {
                // Estimate block range from timestamps (10 min per block)
                const fromBlock = Math.floor(bucketStart.getTime() / 600_000);
                const toBlock   = Math.ceil(bucketEnd.getTime() / 600_000);
                const swaps = await getSwapEventsInBlockRange(db, token, fromBlock, toBlock);
                for (const swap of swaps) {
                    volumeSats   += BigInt(swap.sats_in);
                    volumeTokens += BigInt(swap.tokens_out);
                    tradeCount++;
                    // Also factor swap prices into H/L
                    const satsIn = BigInt(swap.sats_in);
                    if (satsIn > 0n) {
                        // Price = tokens per 100k sats (normalized)
                        const swapPrice = (BigInt(swap.tokens_out) * 100_000n) / satsIn;
                        if (swapPrice > high) high = swapPrice;
                        if (swapPrice < low) low = swapPrice;
                    }
                }
            }

            const candle: PriceCandleRow = {
                token,
                interval: key,
                open_time:     fromIso,
                open:          open.toString(),
                high:          high.toString(),
                low:           low.toString(),
                close:         close.toString(),
                volume_sats:   volumeSats.toString(),
                volume_tokens: volumeTokens.toString(),
                trade_count:   tradeCount,
            };
            stmts.push(stmtUpsertCandle(db, candle));
        }
    }

    if (stmts.length > 0) {
        await db.batch(stmts);
        console.log(`[poller] Rolled up ${stmts.length} candle(s)`);
    }
}

// ---------------------------------------------------------------------------
// Data pruning (6-month rolling window)
// ---------------------------------------------------------------------------

async function pruneOldData(db: D1Database, currentBlock: number): Promise<void> {
    const sixMonthsAgo = new Date(Date.now() - 180 * 86_400_000).toISOString();
    // ~26280 blocks in 6 months (144 blocks/day * 182.5 days)
    const cutoffBlock = currentBlock - 26280;

    await db.batch([
        stmtPruneOldSnapshots(db, sixMonthsAgo),
        stmtPruneOldSwapEvents(db, cutoffBlock > 0 ? cutoffBlock : 0),
    ]);
}
