/**
 * Block poller — runs inside the Cron Trigger scheduled() handler.
 *
 * Uses JSONRpcProvider from opnet (works in Workers via fetch browser polyfill).
 * One RPC call per block: getBlock(n, prefetchTxs=true) returns all events embedded
 * on tx.events[] — confirmed via live testnet RPC. No per-tx getTransactionReceipt.
 */
import { JSONRpcProvider } from 'opnet';
import type { Env, BlockTx, TxEvent } from '../types/index.js';
import { getLastIndexedBlock, stmtSetLastIndexedBlock } from '../db/queries.js';
import { decodeBlock } from '../decoder/index.js';

export async function pollNewBlocks(env: Env): Promise<void> {
    const maxBlocksPerRun = parseInt(env.MAX_BLOCKS_PER_RUN, 10) || 50;
    const poolHexSet      = await resolvePoolAddresses(env);

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

    for (let n = from; n <= to; n++) {
        await processBlock(env.DB, provider, n, poolHexSet);
    }
}

async function processBlock(
    db: D1Database,
    provider: JSONRpcProvider,
    blockNumber: number,
    trackedPools: Set<string>,
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
    const eventStmts = decodeBlock(db, blockNumber, txs, trackedPools);

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
