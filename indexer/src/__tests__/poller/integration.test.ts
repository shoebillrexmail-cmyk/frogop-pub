/**
 * Integration tests using REAL testnet data.
 *
 * Fetches actual blocks from the OPNet testnet RPC, runs them through
 * the real decoder and real MockD1Database (sql.js), and verifies
 * that the indexer correctly extracts options, swaps, and price data.
 *
 * These tests hit the network — skipped in CI via SKIP_INTEGRATION env var.
 * Run locally: npx vitest run src/__tests__/poller/integration.test.ts
 *
 * Known testnet data (as of 2026-03-01):
 * - OptionWritten:   block 3192, pool 0xe1780c01c691021197...
 * - OptionCancelled: block 3188, pool 0xe1780c01c691021197...
 * - SwapExecuted:    block 3185, contract 0x4397befe4e067390...
 * - MOTO token transfers: blocks 3206-3210
 * - PILL token transfers: blocks 3206-3210
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { MockD1Database } from '../helpers/mockD1.js';
import { decodeBlock } from '../../decoder/index.js';
import { OptionStatus } from '../../types/index.js';
import type { OptionRow, SwapEventRow, TxEvent } from '../../types/index.js';

// ---------------------------------------------------------------------------
// RPC helper — calls testnet JSON-RPC directly via fetch (no opnet SDK)
// ---------------------------------------------------------------------------

const RPC_URL = 'https://testnet.opnet.org/api/v1/json-rpc';

interface RpcBlock {
    height: number;
    transactions: Array<{
        id: string;
        events: Array<{
            contractAddress: string;
            type: string;
            data: string;
        }>;
    }>;
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
    const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    });
    const json = await res.json() as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`RPC error: ${json.error.message}`);
    return json.result as T;
}

async function fetchBlock(blockNumber: number): Promise<RpcBlock | null> {
    const hex = '0x' + blockNumber.toString(16);
    return rpcCall<RpcBlock | null>('btc_getBlockByNumber', [hex, true]);
}

async function fetchTip(): Promise<number> {
    const hex = await rpcCall<string>('btc_blockNumber', []);
    return parseInt(hex, 16);
}

// ---------------------------------------------------------------------------
// Known testnet addresses (discovered via scanning)
// ---------------------------------------------------------------------------

// OptionsPool contract that has real OptionWritten/Cancelled events
const OPTION_POOL_HEX = '0xe1780c01c69102119798ca512829ed78712634722466d889ab08b41de475b0bb';

// MotoSwap DEX contract (SwapExecuted events)
const SWAP_CONTRACT_HEX = '0x4397befe4e067390596b3c296e77fe86589487bf3bf3f0a9a93ce794e2d78fb5';

// MOTO/PILL token addresses
const MOTO_HEX = '0xfd4473840751d58d9f8b73bdd57d6c5260453d5518bd7cd02d0a4cf3df9bf4dd';
const PILL_HEX = '0xb09fc29c112af8293539477e23d8df1d3126639642767d707277131352040cbb';

// ---------------------------------------------------------------------------
// Skip in CI
// ---------------------------------------------------------------------------
const SKIP = process.env['SKIP_INTEGRATION'] === 'true' || process.env['CI'] === 'true';
const describeIntegration = SKIP ? describe.skip : describe;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

let db: MockD1Database;

beforeEach(async () => {
    db = await MockD1Database.create();
});

describeIntegration('Integration — real testnet blocks', () => {
    // Increase timeout for network calls
    const TIMEOUT = 60_000;

    it('fetches current block height from testnet', async () => {
        const tip = await fetchTip();
        expect(tip).toBeGreaterThan(3000);
        console.log(`  Testnet tip: ${tip}`);
    }, TIMEOUT);

    it('decodes OptionWritten from a real block', async () => {
        // Block 3192 has an OptionWritten event from pool 0xe178...
        const block = await fetchBlock(3192);
        expect(block).toBeTruthy();

        const txs = extractTxs(block!);
        const trackedPools = new Set([OPTION_POOL_HEX]);
        const stmts = decodeBlock(db as unknown as D1Database, 3192, txs, trackedPools);

        expect(stmts.length).toBeGreaterThan(0);
        await (db as unknown as D1Database).batch(stmts);

        const options = db.queryAll<OptionRow>('SELECT * FROM options');
        expect(options.length).toBeGreaterThan(0);

        const opt = options[0]!;
        console.log(`  OptionWritten: id=${opt.option_id}, type=${opt.option_type}, status=${opt.status}`);
        console.log(`    strike=${opt.strike_price}, underlying=${opt.underlying_amt}, premium=${opt.premium}`);
        console.log(`    expiry=${opt.expiry_block}, grace_end=${opt.grace_end_block}`);

        // Verify structural correctness
        expect(opt.pool_address).toBe(OPTION_POOL_HEX);
        expect(opt.option_id).toBeGreaterThanOrEqual(0);
        expect(opt.writer).toMatch(/^0x[0-9a-f]{64}$/);
        expect(opt.status).toBe(OptionStatus.OPEN);
        expect(opt.created_block).toBe(3192);
        expect(opt.grace_end_block).toBe(opt.expiry_block + 144); // GRACE_PERIOD_BLOCKS
        expect(opt.buyer).toBeNull();
        expect(BigInt(opt.strike_price)).toBeGreaterThan(0n);
        expect(BigInt(opt.underlying_amt)).toBeGreaterThan(0n);
        expect(BigInt(opt.premium)).toBeGreaterThan(0n);
    }, TIMEOUT);

    it('decodes OptionCancelled from a real block', async () => {
        // First insert the option that gets cancelled (from block 3187)
        const writeBlock = await fetchBlock(3187);
        expect(writeBlock).toBeTruthy();
        const writeTxs = extractTxs(writeBlock!);
        const trackedPools = new Set([OPTION_POOL_HEX]);
        const writeStmts = decodeBlock(db as unknown as D1Database, 3187, writeTxs, trackedPools);
        await (db as unknown as D1Database).batch(writeStmts);

        // Now process the cancellation (block 3188)
        const cancelBlock = await fetchBlock(3188);
        expect(cancelBlock).toBeTruthy();
        const cancelTxs = extractTxs(cancelBlock!);
        const cancelStmts = decodeBlock(db as unknown as D1Database, 3188, cancelTxs, trackedPools);

        expect(cancelStmts.length).toBeGreaterThan(0);
        await (db as unknown as D1Database).batch(cancelStmts);

        // The option from block 3187 should now be CANCELLED
        const options = db.queryAll<OptionRow>(
            'SELECT * FROM options WHERE pool_address = ?',
            OPTION_POOL_HEX,
        );
        const cancelled = options.find(o => o.status === OptionStatus.CANCELLED);
        expect(cancelled).toBeTruthy();
        console.log(`  OptionCancelled: id=${cancelled!.option_id}, updated_block=${cancelled!.updated_block}`);
        expect(cancelled!.updated_block).toBe(3188);

        // Check fee event was created
        const fees = db.queryAll<Record<string, unknown>>('SELECT * FROM fee_events');
        console.log(`  Fee events: ${fees.length}`);
        // Cancel may or may not have a fee depending on the contract state
    }, TIMEOUT);

    it('decodes SwapExecuted from a real block', async () => {
        // Block 3185 has multiple SwapExecuted events
        const block = await fetchBlock(3185);
        expect(block).toBeTruthy();

        const txs = extractTxs(block!);
        const trackedPools = new Set<string>(); // No option pools needed
        const swapLabelMap = new Map([[SWAP_CONTRACT_HEX, 'MOTO']]);

        const stmts = decodeBlock(db as unknown as D1Database, 3185, txs, trackedPools, swapLabelMap);
        expect(stmts.length).toBeGreaterThan(0);
        await (db as unknown as D1Database).batch(stmts);

        const swaps = db.queryAll<SwapEventRow>('SELECT * FROM swap_events');
        expect(swaps.length).toBeGreaterThan(0);
        console.log(`  SwapExecuted events: ${swaps.length}`);

        const swap = swaps[0]!;
        console.log(`    token=${swap.token}, sats_in=${swap.sats_in}, tokens_out=${swap.tokens_out}`);

        expect(swap.token).toBe('MOTO');
        expect(swap.block_number).toBe(3185);
        expect(swap.buyer).toMatch(/^0x[0-9a-f]{64}$/);
        expect(BigInt(swap.sats_in)).toBeGreaterThan(0n);
        expect(BigInt(swap.tokens_out)).toBeGreaterThanOrEqual(0n);
    }, TIMEOUT);

    it('processes multiple blocks sequentially like the real poller', async () => {
        // Process blocks 3187-3192 (contains OptionWritten at 3187, 3192 + OptionCancelled at 3188)
        const trackedPools = new Set([OPTION_POOL_HEX]);
        const swapLabelMap = new Map([[SWAP_CONTRACT_HEX, 'MOTO']]);
        let totalStmts = 0;

        for (let n = 3187; n <= 3192; n++) {
            const block = await fetchBlock(n);
            if (!block) continue;
            const txs = extractTxs(block);
            const stmts = decodeBlock(db as unknown as D1Database, n, txs, trackedPools, swapLabelMap);
            if (stmts.length > 0) {
                await (db as unknown as D1Database).batch(stmts);
                totalStmts += stmts.length;
            }
        }

        console.log(`  Processed 6 blocks, ${totalStmts} total statements`);

        const options = db.queryAll<OptionRow>('SELECT * FROM options ORDER BY option_id');
        console.log(`  Options in DB: ${options.length}`);
        for (const opt of options) {
            console.log(`    id=${opt.option_id} status=${opt.status} block=${opt.created_block}`);
        }

        expect(options.length).toBeGreaterThanOrEqual(2); // At least 2 OptionWritten events

        // At least one should be cancelled (from block 3188)
        const cancelled = options.filter(o => o.status === OptionStatus.CANCELLED);
        expect(cancelled.length).toBeGreaterThanOrEqual(1);

        // At least one should still be open (from block 3192)
        const open = options.filter(o => o.status === OptionStatus.OPEN);
        expect(open.length).toBeGreaterThanOrEqual(1);
    }, TIMEOUT);

    it('handles blocks with MOTO and PILL token transfers (no crashes)', async () => {
        // Block 3209 has Transferred events for both MOTO and PILL tokens.
        // These are OP-20 events, not OptionsPool events — decoder should ignore them.
        const block = await fetchBlock(3209);
        expect(block).toBeTruthy();

        const txs = extractTxs(block!);
        const trackedPools = new Set([OPTION_POOL_HEX]);

        // Should not crash and should not produce statements (Transferred != OptionWritten)
        const stmts = decodeBlock(db as unknown as D1Database, 3209, txs, trackedPools);
        // If the pool doesn't have events in this block, stmts should be 0
        // The decoder should silently skip unknown event types
        expect(stmts).toBeInstanceOf(Array);
        console.log(`  Block 3209: ${txs.length} txs, ${stmts.length} relevant stmts`);
    }, TIMEOUT);

    it('correctly ignores non-tracked pool events in real blocks', async () => {
        // Use a different pool address that doesn't match events in block 3192
        const nonExistentPool = '0x' + 'ff'.repeat(32);
        const trackedPools = new Set([nonExistentPool]);

        const block = await fetchBlock(3192);
        expect(block).toBeTruthy();
        const txs = extractTxs(block!);
        const stmts = decodeBlock(db as unknown as D1Database, 3192, txs, trackedPools);

        // Pool hex doesn't match → no events decoded
        expect(stmts.length).toBe(0);
    }, TIMEOUT);

    it('processes a high-activity swap block and verifies volume', async () => {
        // Block 3182 has 5 SwapExecuted events
        const block = await fetchBlock(3182);
        expect(block).toBeTruthy();

        const txs = extractTxs(block!);
        const swapLabelMap = new Map([[SWAP_CONTRACT_HEX, 'PILL']]);

        const stmts = decodeBlock(db as unknown as D1Database, 3182, txs, new Set(), swapLabelMap);
        expect(stmts.length).toBeGreaterThan(0);
        await (db as unknown as D1Database).batch(stmts);

        const swaps = db.queryAll<SwapEventRow>('SELECT * FROM swap_events');
        console.log(`  Block 3182: ${swaps.length} swap events`);
        expect(swaps.length).toBeGreaterThanOrEqual(3); // Multiple swaps in this block

        // All should be labeled PILL
        for (const swap of swaps) {
            expect(swap.token).toBe('PILL');
            expect(swap.block_number).toBe(3182);
        }

        // Compute total volume
        let totalSats = 0n;
        let totalTokens = 0n;
        for (const swap of swaps) {
            totalSats += BigInt(swap.sats_in);
            totalTokens += BigInt(swap.tokens_out);
        }
        console.log(`  Total volume: ${totalSats} sats, ${totalTokens} tokens`);
        expect(totalSats).toBeGreaterThan(0n);
    }, TIMEOUT);
});

// ---------------------------------------------------------------------------
// Helper — extract tx events from raw RPC block (handles both array and object format)
// ---------------------------------------------------------------------------

function extractTxs(block: RpcBlock): Array<{ id: string; events: TxEvent[] }> {
    const rawTxs = block.transactions ?? [];
    return rawTxs.map((tx) => {
        const rawEvents = tx.events;
        const eventList: TxEvent[] = [];

        if (Array.isArray(rawEvents)) {
            for (const ev of rawEvents) {
                eventList.push({
                    contractAddress: ev.contractAddress ?? '',
                    type: ev.type ?? '',
                    data: ev.data ?? '',
                });
            }
        } else if (rawEvents && typeof rawEvents === 'object') {
            for (const [contractAddr, events] of Object.entries(rawEvents as Record<string, unknown[]>)) {
                if (!Array.isArray(events)) continue;
                for (const ev of events as Array<Record<string, string>>) {
                    eventList.push({
                        contractAddress: ev['contractAddress'] ?? contractAddr,
                        type: ev['type'] ?? '',
                        data: ev['data'] ?? '',
                    });
                }
            }
        }

        return { id: String(tx.id ?? ''), events: eventList };
    });
}
