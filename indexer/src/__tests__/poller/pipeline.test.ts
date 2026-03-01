/**
 * Integration pipeline tests — full flow from mocked RPC through real decoder
 * and real DB (sql.js) to verify data integrity end-to-end.
 *
 * Uses: mocked RPC + real decoder + real db/queries + MockD1Database.
 * Verifies that events decoded from blocks produce correct DB rows.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockD1Database } from '../helpers/mockD1.js';
import {
    buildOptionWrittenBlock,
    buildOptionPurchasedBlock,
    buildOptionCancelledBlock,
    buildSwapExecutedBlock,
    buildMixedBlock,
    buildEmptyBlock,
    DEFAULT_POOL,
    DEFAULT_WRITER,
    DEFAULT_BUYER,
    DEFAULT_ROUTER,
} from '../helpers/blockFixtures.js';

// Mock only opnet — everything else is real
vi.mock('opnet', () => ({
    JSONRpcProvider: vi.fn(),
    CallResult: class MockCallResult {
        result: { readU256: () => bigint };
        constructor(price: bigint) {
            this.result = { readU256: () => price };
        }
    },
}));

import { collectBlockStatements } from '../../poller/index.js';
import { decodeBlock } from '../../decoder/index.js';
import * as queries from '../../db/queries.js';
import { OptionStatus, FeeEventType } from '../../types/index.js';
import type { OptionRow, SwapEventRow, PriceSnapshotRow } from '../../types/index.js';

let db: MockD1Database;

beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    db = await MockD1Database.create();
});

afterEach(() => {
    vi.restoreAllMocks();
});

const POOL_HEX = DEFAULT_POOL;
const WRITER_HEX = DEFAULT_WRITER;
const BUYER_HEX = DEFAULT_BUYER;
const ROUTER_HEX = DEFAULT_ROUTER;
const BLOCK = 5000;
const trackedPools = new Set([POOL_HEX]);

// ---------------------------------------------------------------------------
describe('Pipeline — OptionWritten → DB', () => {
    it('inserts option with correct fields and grace_end_block', async () => {
        const block = buildOptionWrittenBlock(BLOCK, POOL_HEX, {
            optionId: 42n,
            strikePrice: 50_000_000n,
            underlyingAmount: 1_000_000n,
            premium: 500_000n,
            expiryBlock: 6000n,
        });

        // Simulate what collectBlockStatements does: extract txs and decode
        const txs = block.transactions.map(tx => ({
            id: tx.id,
            events: tx.events.map(e => ({
                contractAddress: e.contractAddress,
                type: e.type,
                data: e.data,
            })),
        }));

        const stmts = decodeBlock(db as unknown as D1Database, BLOCK, txs, trackedPools);
        expect(stmts.length).toBeGreaterThan(0);

        await (db as unknown as D1Database).batch(stmts);

        const option = db.queryFirst<OptionRow>(
            'SELECT * FROM options WHERE pool_address = ? AND option_id = ?',
            POOL_HEX, 42,
        );
        expect(option).toBeTruthy();
        expect(option!.writer).toBe(WRITER_HEX);
        expect(option!.option_type).toBe(0); // CALL
        expect(option!.strike_price).toBe('50000000');
        expect(option!.underlying_amt).toBe('1000000');
        expect(option!.premium).toBe('500000');
        expect(option!.expiry_block).toBe(6000);
        expect(option!.grace_end_block).toBe(6000 + 144); // GRACE_PERIOD_BLOCKS
        expect(option!.status).toBe(OptionStatus.OPEN);
        expect(option!.created_block).toBe(BLOCK);
        expect(option!.buyer).toBeNull();
    });
});

// ---------------------------------------------------------------------------
describe('Pipeline — OptionPurchased → DB', () => {
    it('updates status and sets buyer, creates fee event', async () => {
        // First, write the option
        const writeBlock = buildOptionWrittenBlock(BLOCK, POOL_HEX, {
            optionId: 1n,
        });
        const writeTxs = writeBlock.transactions.map(tx => ({
            id: tx.id,
            events: tx.events,
        }));
        const writeStmts = decodeBlock(db as unknown as D1Database, BLOCK, writeTxs, trackedPools);
        await (db as unknown as D1Database).batch(writeStmts);

        // Then purchase it
        const purchaseBlock = buildOptionPurchasedBlock(BLOCK + 1, POOL_HEX, {
            optionId: 1n,
            premium: 500_000n,
            writerAmount: 495_000n,
        });
        const purchaseTxs = purchaseBlock.transactions.map(tx => ({
            id: tx.id,
            events: tx.events,
        }));
        const purchaseStmts = decodeBlock(db as unknown as D1Database, BLOCK + 1, purchaseTxs, trackedPools);
        await (db as unknown as D1Database).batch(purchaseStmts);

        // Verify option status updated
        const option = db.queryFirst<OptionRow>(
            'SELECT * FROM options WHERE pool_address = ? AND option_id = ?',
            POOL_HEX, 1,
        );
        expect(option!.status).toBe(OptionStatus.PURCHASED);
        expect(option!.buyer).toBe(BUYER_HEX);
        expect(option!.updated_block).toBe(BLOCK + 1);

        // Verify fee event created (premium - writerAmount = 5000)
        const fees = db.queryAll<Record<string, unknown>>(
            'SELECT * FROM fee_events WHERE pool_address = ? AND option_id = ?',
            POOL_HEX, 1,
        );
        expect(fees.length).toBe(1);
        expect(fees[0]!['event_type']).toBe(FeeEventType.BUY);
        expect(fees[0]!['amount']).toBe('5000');
    });
});

// ---------------------------------------------------------------------------
describe('Pipeline — OptionCancelled → DB', () => {
    it('updates status and creates fee event', async () => {
        // Write option first
        const writeBlock = buildOptionWrittenBlock(BLOCK, POOL_HEX, { optionId: 2n });
        const writeTxs = writeBlock.transactions.map(tx => ({ id: tx.id, events: tx.events }));
        await (db as unknown as D1Database).batch(
            decodeBlock(db as unknown as D1Database, BLOCK, writeTxs, trackedPools),
        );

        // Cancel it
        const cancelBlock = buildOptionCancelledBlock(BLOCK + 1, POOL_HEX, {
            optionId: 2n,
            fee: 10_000n,
        });
        const cancelTxs = cancelBlock.transactions.map(tx => ({ id: tx.id, events: tx.events }));
        await (db as unknown as D1Database).batch(
            decodeBlock(db as unknown as D1Database, BLOCK + 1, cancelTxs, trackedPools),
        );

        const option = db.queryFirst<OptionRow>(
            'SELECT * FROM options WHERE pool_address = ? AND option_id = ?',
            POOL_HEX, 2,
        );
        expect(option!.status).toBe(OptionStatus.CANCELLED);

        const fees = db.queryAll<Record<string, unknown>>(
            'SELECT * FROM fee_events WHERE pool_address = ? AND option_id = ?',
            POOL_HEX, 2,
        );
        expect(fees.length).toBe(1);
        expect(fees[0]!['event_type']).toBe(FeeEventType.CANCEL);
        expect(fees[0]!['amount']).toBe('10000');
    });
});

// ---------------------------------------------------------------------------
describe('Pipeline — SwapExecuted → DB', () => {
    it('inserts swap row with correct fields', async () => {
        const swapBlock = buildSwapExecutedBlock(BLOCK, ROUTER_HEX, {
            amountIn: 50_000n,
            amountOut: 750_000_000_000_000_000_000n,
            totalFees: 500n,
        });
        const swapLabelMap = new Map([[ROUTER_HEX, 'MOTO']]);
        const txs = swapBlock.transactions.map(tx => ({ id: tx.id, events: tx.events }));
        const stmts = decodeBlock(db as unknown as D1Database, BLOCK, txs, trackedPools, swapLabelMap);
        await (db as unknown as D1Database).batch(stmts);

        const swaps = db.queryAll<SwapEventRow>('SELECT * FROM swap_events');
        expect(swaps.length).toBe(1);
        expect(swaps[0]!.token).toBe('MOTO');
        expect(swaps[0]!.sats_in).toBe('50000');
        expect(swaps[0]!.tokens_out).toBe('750000000000000000000');
        expect(swaps[0]!.fees).toBe('500');
        expect(swaps[0]!.block_number).toBe(BLOCK);
    });
});

// ---------------------------------------------------------------------------
describe('Pipeline — non-tracked pool events ignored', () => {
    it('ignores events from pools not in the tracked set', async () => {
        const otherPool = '0x' + 'ff'.repeat(32);
        const block = buildOptionWrittenBlock(BLOCK, otherPool);
        const txs = block.transactions.map(tx => ({ id: tx.id, events: tx.events }));
        const stmts = decodeBlock(db as unknown as D1Database, BLOCK, txs, trackedPools);

        expect(stmts.length).toBe(0);

        await (db as unknown as D1Database).batch(stmts);
        const options = db.queryAll('SELECT * FROM options');
        expect(options.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
describe('Pipeline — object-keyed events format', () => {
    it('handles events keyed by contract address (legacy format)', async () => {
        // This tests the object-keyed format in collectBlockStatements
        const writtenData = buildOptionWrittenBlock(BLOCK, POOL_HEX).transactions[0]!.events[0]!.data;

        // Create block with object-keyed events
        const objectKeyedBlock = {
            transactions: [{
                id: '0xtx_objkeyed',
                events: {
                    [POOL_HEX]: [{
                        contractAddress: POOL_HEX,
                        type: 'OptionWritten',
                        data: writtenData,
                    }],
                },
            }],
        };

        // Use collectBlockStatements which handles the object-keyed format
        const mockProvider = {
            getBlock: vi.fn().mockResolvedValue(objectKeyedBlock),
        };

        const stmts = await collectBlockStatements(
            mockProvider as never,
            BLOCK,
            db as unknown as D1Database,
            trackedPools,
        );
        expect(stmts.length).toBeGreaterThan(0);

        await (db as unknown as D1Database).batch(stmts);
        const options = db.queryAll<OptionRow>('SELECT * FROM options');
        expect(options.length).toBe(1);
        expect(options[0]!.pool_address).toBe(POOL_HEX);
    });
});

// ---------------------------------------------------------------------------
describe('Pipeline — mixed block with multiple event types', () => {
    it('processes all event types in a single block', async () => {
        // First, write an option so purchase can update it
        const writeBlock = buildOptionWrittenBlock(BLOCK - 1, POOL_HEX, { optionId: 1n });
        const writeTxs = writeBlock.transactions.map(tx => ({ id: tx.id, events: tx.events }));
        await (db as unknown as D1Database).batch(
            decodeBlock(db as unknown as D1Database, BLOCK - 1, writeTxs, trackedPools),
        );

        // Mixed block: OptionWritten(id=1 again, ignored due to INSERT OR IGNORE) +
        // OptionPurchased(id=1) + SwapExecuted
        const mixed = buildMixedBlock(BLOCK, POOL_HEX, ROUTER_HEX);
        const swapLabelMap = new Map([[ROUTER_HEX, 'MOTO']]);
        const txs = mixed.transactions.map(tx => ({ id: tx.id, events: tx.events }));
        const stmts = decodeBlock(db as unknown as D1Database, BLOCK, txs, trackedPools, swapLabelMap);

        // Should have statements for all event types
        expect(stmts.length).toBeGreaterThanOrEqual(3); // written + purchased + (fee?) + swap

        await (db as unknown as D1Database).batch(stmts);

        // Option should exist and be purchased
        const option = db.queryFirst<OptionRow>(
            'SELECT * FROM options WHERE pool_address = ? AND option_id = ?',
            POOL_HEX, 1,
        );
        expect(option).toBeTruthy();
        expect(option!.status).toBe(OptionStatus.PURCHASED);

        // Swap should exist
        const swaps = db.queryAll<SwapEventRow>('SELECT * FROM swap_events');
        expect(swaps.length).toBe(1);
    });
});

// ---------------------------------------------------------------------------
describe('Pipeline — collectBlockStatements with null block', () => {
    it('returns empty array when block is null', async () => {
        const mockProvider = {
            getBlock: vi.fn().mockResolvedValue(null),
        };

        const stmts = await collectBlockStatements(
            mockProvider as never,
            BLOCK,
            db as unknown as D1Database,
            trackedPools,
        );
        expect(stmts).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
describe('Pipeline — collectBlockStatements with empty block', () => {
    it('returns empty array when block has no transactions', async () => {
        const mockProvider = {
            getBlock: vi.fn().mockResolvedValue(buildEmptyBlock()),
        };

        const stmts = await collectBlockStatements(
            mockProvider as never,
            BLOCK,
            db as unknown as D1Database,
            trackedPools,
        );
        expect(stmts).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
describe('Pipeline — end-to-end: write option + query via db/queries', () => {
    it('option inserted via decoder is queryable via getOption', async () => {
        const block = buildOptionWrittenBlock(BLOCK, POOL_HEX, {
            optionId: 99n,
            strikePrice: 100_000n,
        });
        const txs = block.transactions.map(tx => ({ id: tx.id, events: tx.events }));
        const stmts = decodeBlock(db as unknown as D1Database, BLOCK, txs, trackedPools);
        await (db as unknown as D1Database).batch(stmts);

        // Use the real db/queries function to read back
        const option = await queries.getOption(db as unknown as D1Database, POOL_HEX, 99);
        expect(option).toBeTruthy();
        expect(option!.strike_price).toBe('100000');
        expect(option!.status).toBe(OptionStatus.OPEN);
    });
});
