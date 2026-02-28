/**
 * Block poller — runs inside the Cron Trigger scheduled() handler.
 *
 * Uses JSONRpcProvider from opnet (works in Workers via fetch browser polyfill).
 * One RPC call per block: getBlock(n, prefetchTxs=true) returns all events embedded
 * on tx.events[] — confirmed via live testnet RPC. No per-tx getTransactionReceipt.
 */
import { JSONRpcProvider } from 'opnet';
import type { Env, BlockTx, TxEvent, PriceCandleRow } from '../types/index.js';
import {
    getLastIndexedBlock,
    stmtSetLastIndexedBlock,
    stmtInsertPriceSnapshot,
    stmtUpsertCandle,
    stmtPruneOldSnapshots,
    stmtPruneOldSwapEvents,
    getSnapshotsInRange,
    getSwapEventsInBlockRange,
} from '../db/queries.js';
import { decodeBlock } from '../decoder/index.js';

export async function pollNewBlocks(env: Env): Promise<void> {
    const maxBlocksPerRun = parseInt(env.MAX_BLOCKS_PER_RUN, 10) || 50;
    const poolHexSet      = await resolvePoolAddresses(env);
    const swapConfig      = resolveSwapConfig(env);

    // JSONRpcProvider uses fetch() — browser polyfill active in Workers
    const provider = new JSONRpcProvider({ url: env.OPNET_RPC_URL, network: env.OPNET_NETWORK as never });

    const lastIndexed = await getLastIndexedBlock(env.DB);
    const latestBlock = Number(await provider.getBlockNumber());

    if (latestBlock <= lastIndexed) {
        console.log(`[poller] Already up to date at block ${lastIndexed}`);
        return;
    }

    const from = lastIndexed + 1;
    const to   = Math.min(latestBlock, lastIndexed + maxBlocksPerRun);
    console.log(`[poller] Syncing blocks ${from} → ${to} (latest=${latestBlock})`);

    // Build swap label map for event decoding (routerHex → label per token)
    // For SwapExecuted events, we track the router contract; labels are resolved
    // from event data, but we still need to know which contracts to watch.
    const swapLabelMap = new Map<string, string>();
    if (swapConfig) {
        // Map the router address so decodeBlock watches it for SwapExecuted events
        // Use first label as default — SwapExecuted events include buyer/amounts but
        // not which token was swapped, so event labeling is best-effort for now.
        const firstLabel = swapConfig.tokenMap.values().next().value as string;
        swapLabelMap.set(swapConfig.routerHex, firstLabel);
    }

    for (let n = from; n <= to; n++) {
        await processBlock(env.DB, provider, n, poolHexSet, swapLabelMap);
    }

    // After block sync: poll spot prices + rollup candles + prune old data
    await pollPrices(env, provider, swapConfig, latestBlock);
    await rollUpAllCandles(env.DB);
    await pruneOldData(env.DB, latestBlock);
}

async function processBlock(
    db: D1Database,
    provider: JSONRpcProvider,
    blockNumber: number,
    trackedPools: Set<string>,
    swapLabelMap: Map<string, string> = new Map(),
): Promise<void> {
    const block = await provider.getBlock(BigInt(blockNumber), true);
    if (!block) {
        console.warn(`[poller] Block ${blockNumber} not found, skipping`);
        return;
    }

    // OPNet getBlock response: transactions array with embedded events
    const rawTxs = (block as unknown as { transactions?: unknown[] }).transactions ?? [];
    const txs: BlockTx[] = rawTxs.map((tx: unknown) => {
        const t = tx as Record<string, unknown>;
        return {
            id:     String(t['id'] ?? ''),
            events: ((t['events'] as unknown[] | undefined) ?? []).map((ev: unknown) => {
                const e = ev as Record<string, string>;
                return {
                    contractAddress: e['contractAddress'] ?? '',
                    type:            e['type'] ?? '',
                    data:            e['data'] ?? '',
                } satisfies TxEvent;
            }),
        } satisfies BlockTx;
    });

    // Decode events → D1 prepared statements
    const eventStmts = decodeBlock(db, blockNumber, txs, trackedPools, swapLabelMap);

    // Always update the cursor, even if no events (so we don't re-scan empty blocks)
    const cursorStmt = stmtSetLastIndexedBlock(db, blockNumber);

    // Commit everything atomically in one D1 batch
    await db.batch([...eventStmts, cursorStmt]);

    if (eventStmts.length > 0) {
        console.log(`[poller] Block ${blockNumber}: wrote ${eventStmts.length} statement(s)`);
    }
}

// ---------------------------------------------------------------------------
// Address resolution
// ---------------------------------------------------------------------------
// OPNet events use 0x hex addresses. Pool addresses in config are bech32 (opt1...).
// We resolve them once per cron invocation using getPublicKeyInfo.
// TODO: cache resolved hex in D1 `indexer_state` to avoid repeated RPC calls.
async function resolvePoolAddresses(env: Env): Promise<Set<string>> {
    const bech32Addresses = env.POOL_ADDRESSES.split(' ').filter(Boolean);
    const provider = new JSONRpcProvider({ url: env.OPNET_RPC_URL, network: env.OPNET_NETWORK as never });
    const hexSet   = new Set<string>();

    for (const addr of bech32Addresses) {
        try {
            const pubKeyInfo = await provider.getPublicKeyInfo(addr, true);
            if (pubKeyInfo) hexSet.add(pubKeyInfo.toString());
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
interface SwapConfig {
    /** 0x-hex of the NativeSwap router contract (where we call getQuote) */
    routerHex: string;
    /** tokenHex → label (e.g. "0xfd44..." → "MOTO") */
    tokenMap: Map<string, string>;
}

function resolveSwapConfig(env: Env): SwapConfig | null {
    const router = (env.NATIVESWAP_CONTRACT ?? '').trim();
    if (!router) return null;

    const tokenAddrs = (env.NATIVESWAP_TOKEN_ADDRESSES ?? '').split(' ').filter(Boolean);
    const labels     = (env.NATIVESWAP_LABELS ?? '').split(',').filter(Boolean);
    if (tokenAddrs.length === 0 || labels.length === 0) return null;

    const tokenMap = new Map<string, string>();
    for (let i = 0; i < tokenAddrs.length; i++) {
        const label = labels[i];
        if (!label) continue;
        tokenMap.set(tokenAddrs[i]!, label);
    }

    if (tokenMap.size > 0) {
        console.log(`[poller] NativeSwap router: ${router}, tracking ${tokenMap.size} token(s)`);
    }
    return { routerHex: router, tokenMap };
}

// ---------------------------------------------------------------------------
// Spot price polling (getQuote via raw provider.call)
// ---------------------------------------------------------------------------

/** ABICoder.encodeSelector('getQuote') — precomputed 4-byte selector */
const GET_QUOTE_SELECTOR = '0c8b6164';

function encodeGetQuoteCalldata(tokenHex: string, satoshis: bigint): string {
    // selector (4 bytes) + token address (32 bytes, zero-padded left) + satoshis (8 bytes, big-endian)
    const addr = tokenHex.startsWith('0x') ? tokenHex.slice(2) : tokenHex;
    const addrPadded = addr.padStart(64, '0');
    const satsHex = satoshis.toString(16).padStart(16, '0');
    return '0x' + GET_QUOTE_SELECTOR + addrPadded + satsHex;
}

function decodeU256FromHex(hex: string): bigint {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (clean.length === 0) return 0n;
    return BigInt('0x' + clean);
}

async function pollPrices(
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
            if (result) {
                const price = decodeU256FromHex(String(result)).toString();
                prices[label] = price;
                stmts.push(stmtInsertPriceSnapshot(env.DB, {
                    token: label,
                    block_number: currentBlock,
                    timestamp,
                    price,
                }));
            }
        } catch (err) {
            console.warn(`[poller] getQuote failed for ${label}:`, err);
        }
    }

    // Compute MOTO_PILL cross-rate if both prices available
    if (prices['MOTO'] && prices['PILL']) {
        const motoTokens = BigInt(prices['MOTO']);
        const pillTokens = BigInt(prices['PILL']);
        if (motoTokens > 0n) {
            // Cross-rate: how many PILL per MOTO = pillTokens / motoTokens
            // Store with 18 decimal precision to avoid losing precision
            const precision = 10n ** 18n;
            const crossRate = (pillTokens * precision) / motoTokens;
            stmts.push(stmtInsertPriceSnapshot(env.DB, {
                token: 'MOTO_PILL',
                block_number: currentBlock,
                timestamp,
                price: crossRate.toString(),
            }));
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

const TOKENS = ['MOTO', 'PILL', 'MOTO_PILL'];

function floorToInterval(date: Date, intervalMs: number): Date {
    return new Date(Math.floor(date.getTime() / intervalMs) * intervalMs);
}

async function rollUpAllCandles(db: D1Database): Promise<void> {
    const now = new Date();
    const stmts: D1PreparedStatement[] = [];

    for (const token of TOKENS) {
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

            // Volume from swap events (only for MOTO and PILL, not cross-rate)
            let volumeSats = 0n;
            let volumeTokens = 0n;
            let tradeCount = 0;
            if (token !== 'MOTO_PILL') {
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
