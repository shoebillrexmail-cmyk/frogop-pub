/**
 * DB query integration tests.
 *
 * Uses MockD1Database (sql.js in-memory) to run real SQL statements against
 * the actual schema.  No mocking of queries.ts — the full SQL is exercised.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MockD1Database } from '../helpers/mockD1.js';
import type { PoolRow, OptionRow, FeeEventRow, PriceSnapshotRow, SwapEventRow, PriceCandleRow } from '../../types/index.js';
import {
    getLastIndexedBlock,
    stmtSetLastIndexedBlock,
    upsertPool,
    getAllPools,
    getPool,
    stmtInsertOption,
    stmtUpdateOptionStatus,
    stmtInsertFeeEvent,
    stmtInsertOptionTransfer,
    stmtUpdateOptionBuyer,
    getOption,
    getOptionsByPool,
    getOptionsByWriter,
    getOptionsByBuyer,
    getOptionsByUser,
    getTransfersByOption,
    getTransfersByUser,
    stmtInsertPriceSnapshot,
    stmtInsertSwapEvent,
    stmtUpsertCandle,
    stmtPruneOldSnapshots,
    stmtPruneOldSwapEvents,
    getCandles,
    getLatestPrice,
    getPriceHistory,
    getSnapshotsInRange,
    getSwapEventsInBlockRange,
} from '../../db/queries.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const POOL_ADDR  = 'opt1pool000';
const POOL_ADDR2 = 'opt1pool111';

function makePool(address: string, createdBlock = 100): PoolRow {
    return {
        address,
        address_hex:   `0x${address}`,
        underlying:    '0xtokenA',
        premium_token: '0xtokenB',
        fee_recipient: '0xfee',
        created_block: createdBlock,
        created_tx:    '0xtx1',
        indexed_at:    '2025-01-01T00:00:00Z',
    };
}

function makeOption(optionId: number, overrides: Partial<OptionRow> = {}): OptionRow {
    return {
        pool_address:    POOL_ADDR,
        option_id:       optionId,
        writer:          '0xwriter',
        buyer:           null,
        option_type:     0,
        strike_price:    '50000',
        underlying_amt:  '1000',
        premium:         '500',
        expiry_block:    6000,
        grace_end_block: 6144,
        status:          0,
        created_block:   200,
        created_tx:      '0xtx2',
        updated_block:   null,
        updated_tx:      null,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let db: MockD1Database;

beforeEach(async () => {
    db = await MockD1Database.create();
});

/** Cast MockD1Database as D1Database for passing to query helpers. */
function d1(): D1Database {
    return db as unknown as D1Database;
}

// ---------------------------------------------------------------------------
describe('indexer_state cursor', () => {
    it('getLastIndexedBlock returns 0 when no state exists', async () => {
        expect(await getLastIndexedBlock(d1())).toBe(0);
    });

    it('stmtSetLastIndexedBlock persists and getLastIndexedBlock reads it', async () => {
        await db.batch([stmtSetLastIndexedBlock(d1(), 9999)]);
        expect(await getLastIndexedBlock(d1())).toBe(9999);
    });

    it('is idempotent (INSERT OR REPLACE overwrites)', async () => {
        await db.batch([stmtSetLastIndexedBlock(d1(), 100)]);
        await db.batch([stmtSetLastIndexedBlock(d1(), 200)]);
        expect(await getLastIndexedBlock(d1())).toBe(200);
    });
});

// ---------------------------------------------------------------------------
describe('Pools', () => {
    it('upsertPool inserts a row', async () => {
        await upsertPool(d1(), makePool(POOL_ADDR));
        const row = db.queryFirst<PoolRow>('SELECT * FROM pools WHERE address = ?', POOL_ADDR);
        expect(row?.address).toBe(POOL_ADDR);
        expect(row?.underlying).toBe('0xtokenA');
    });

    it('upsertPool is idempotent (INSERT OR IGNORE)', async () => {
        await upsertPool(d1(), makePool(POOL_ADDR));
        await upsertPool(d1(), makePool(POOL_ADDR));
        expect(db.queryAll('SELECT * FROM pools WHERE address = ?', POOL_ADDR)).toHaveLength(1);
    });

    it('getAllPools returns rows ordered by created_block ascending', async () => {
        await upsertPool(d1(), makePool(POOL_ADDR2, 200));
        await upsertPool(d1(), makePool(POOL_ADDR,  100));
        const pools = await getAllPools(d1());
        expect(pools).toHaveLength(2);
        expect(pools[0]?.address).toBe(POOL_ADDR);   // block 100
        expect(pools[1]?.address).toBe(POOL_ADDR2);  // block 200
    });

    it('getPool returns the correct row', async () => {
        await upsertPool(d1(), makePool(POOL_ADDR));
        const pool = await getPool(d1(), POOL_ADDR);
        expect(pool?.address).toBe(POOL_ADDR);
    });

    it('getPool returns null for unknown address', async () => {
        expect(await getPool(d1(), 'unknown')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
describe('Options — writes', () => {
    beforeEach(async () => {
        await upsertPool(d1(), makePool(POOL_ADDR));
    });

    it('stmtInsertOption inserts a row', async () => {
        await db.batch([stmtInsertOption(d1(), makeOption(1))]);
        const row = db.queryFirst<OptionRow>(
            'SELECT * FROM options WHERE pool_address = ? AND option_id = ?', POOL_ADDR, 1,
        );
        expect(row?.option_id).toBe(1);
        expect(row?.strike_price).toBe('50000');
        expect(row?.buyer).toBeNull();
    });

    it('stmtInsertOption is idempotent (INSERT OR IGNORE)', async () => {
        await db.batch([stmtInsertOption(d1(), makeOption(1))]);
        await db.batch([stmtInsertOption(d1(), makeOption(1))]);
        expect(db.queryAll('SELECT * FROM options WHERE option_id = 1')).toHaveLength(1);
    });

    it('stmtUpdateOptionStatus updates status and sets buyer', async () => {
        await db.batch([stmtInsertOption(d1(), makeOption(2))]);
        await db.batch([stmtUpdateOptionStatus(d1(), POOL_ADDR, 2, 1, '0xbuyer', 300, '0xtxupd')]);
        const row = db.queryFirst<OptionRow>('SELECT * FROM options WHERE option_id = 2');
        expect(row?.status).toBe(1);
        expect(row?.buyer).toBe('0xbuyer');
        expect(row?.updated_block).toBe(300);
        expect(row?.updated_tx).toBe('0xtxupd');
    });

    it('stmtUpdateOptionStatus with null buyer preserves existing buyer (COALESCE)', async () => {
        await db.batch([stmtInsertOption(d1(), makeOption(3))]);
        await db.batch([stmtUpdateOptionStatus(d1(), POOL_ADDR, 3, 1, '0xbuyer', 300, '0xtx')]);
        await db.batch([stmtUpdateOptionStatus(d1(), POOL_ADDR, 3, 2, null, 400, '0xtx2')]);
        const row = db.queryFirst<OptionRow>('SELECT * FROM options WHERE option_id = 3');
        expect(row?.buyer).toBe('0xbuyer');  // preserved by COALESCE
        expect(row?.status).toBe(2);
    });

    it('stmtInsertFeeEvent inserts a fee row', async () => {
        await db.batch([stmtInsertOption(d1(), makeOption(4))]);
        const feeEv: Omit<FeeEventRow, 'id'> = {
            pool_address:  POOL_ADDR,
            option_id:     4,
            event_type:    'CANCEL',
            fee_recipient: '0xfeerecip',
            token:         '0xtok',
            amount:        '10000',
            block_number:  500,
            tx_id:         '0xfeetx',
        };
        await db.batch([stmtInsertFeeEvent(d1(), feeEv)]);
        const row = db.queryFirst<Record<string, unknown>>('SELECT * FROM fee_events WHERE option_id = 4');
        expect(row).toBeTruthy();
        expect(row?.['amount']).toBe('10000');
        expect(row?.['event_type']).toBe('CANCEL');
    });
});

// ---------------------------------------------------------------------------
describe('Options — reads', () => {
    beforeEach(async () => {
        await upsertPool(d1(), makePool(POOL_ADDR));
        await upsertPool(d1(), makePool(POOL_ADDR2, 200));
        await db.batch([
            stmtInsertOption(d1(), makeOption(1, { writer: '0xwriter1', buyer: null,      status: 0 })),
            stmtInsertOption(d1(), makeOption(2, { writer: '0xwriter1', buyer: '0xbuyer1', status: 1 })),
            stmtInsertOption(d1(), makeOption(3, { writer: '0xwriter2', buyer: null,      status: 0 })),
            stmtInsertOption(d1(), makeOption(4, { pool_address: POOL_ADDR2, writer: '0xwriter1', buyer: null, status: 0 })),
        ]);
    });

    it('getOption returns the correct row', async () => {
        const row = await getOption(d1(), POOL_ADDR, 2);
        expect(row?.option_id).toBe(2);
        expect(row?.buyer).toBe('0xbuyer1');
    });

    it('getOption returns null for unknown (pool, id) pair', async () => {
        expect(await getOption(d1(), POOL_ADDR, 999)).toBeNull();
    });

    it('getOptionsByPool returns all options for the pool', async () => {
        const rows = await getOptionsByPool(d1(), POOL_ADDR);
        expect(rows).toHaveLength(3);
        expect(rows.every(r => r.pool_address === POOL_ADDR)).toBe(true);
    });

    it('getOptionsByPool filters by status', async () => {
        const rows = await getOptionsByPool(d1(), POOL_ADDR, { status: 1 });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.option_id).toBe(2);
    });

    it('getOptionsByPool respects limit and offset (pagination)', async () => {
        const page1 = await getOptionsByPool(d1(), POOL_ADDR, { limit: 2, offset: 0 });
        const page2 = await getOptionsByPool(d1(), POOL_ADDR, { limit: 2, offset: 2 });
        expect(page1).toHaveLength(2);
        expect(page2).toHaveLength(1);
    });

    it('getOptionsByWriter returns all options by that writer in the pool', async () => {
        const rows = await getOptionsByWriter(d1(), POOL_ADDR, '0xwriter1');
        expect(rows).toHaveLength(2);
        expect(rows.every(r => r.writer === '0xwriter1')).toBe(true);
    });

    it('getOptionsByBuyer returns options by buyer', async () => {
        const rows = await getOptionsByBuyer(d1(), POOL_ADDR, '0xbuyer1');
        expect(rows).toHaveLength(1);
        expect(rows[0]?.buyer).toBe('0xbuyer1');
    });

    it('getOptionsByUser returns options where user is writer OR buyer (across pools)', async () => {
        // 0xwriter1: writer on opts 1,2 (POOL_ADDR) and 4 (POOL_ADDR2) → 3 total
        const rows = await getOptionsByUser(d1(), '0xwriter1');
        expect(rows).toHaveLength(3);
    });

    it('getOptionsByUser includes buyer-only options', async () => {
        const rows = await getOptionsByUser(d1(), '0xbuyer1');
        expect(rows).toHaveLength(1);
        expect(rows[0]?.option_id).toBe(2);
    });
});

// ---------------------------------------------------------------------------
describe('Price snapshots', () => {
    it('stmtInsertPriceSnapshot inserts a row', async () => {
        await db.batch([stmtInsertPriceSnapshot(d1(), {
            token: 'MOTO', block_number: 1000,
            timestamp: '2026-02-28T12:00:00Z', price: '150000000000000000000',
        })]);
        const row = db.queryFirst<PriceSnapshotRow>('SELECT * FROM price_snapshots WHERE token = ? AND block_number = ?', 'MOTO', 1000);
        expect(row?.price).toBe('150000000000000000000');
    });

    it('stmtInsertPriceSnapshot is idempotent (INSERT OR REPLACE)', async () => {
        await db.batch([stmtInsertPriceSnapshot(d1(), {
            token: 'MOTO', block_number: 1000,
            timestamp: '2026-02-28T12:00:00Z', price: '100',
        })]);
        await db.batch([stmtInsertPriceSnapshot(d1(), {
            token: 'MOTO', block_number: 1000,
            timestamp: '2026-02-28T12:00:00Z', price: '200',
        })]);
        const rows = db.queryAll('SELECT * FROM price_snapshots WHERE token = ? AND block_number = ?', 'MOTO', 1000);
        expect(rows).toHaveLength(1);
        expect((rows[0] as unknown as PriceSnapshotRow).price).toBe('200');
    });

    it('getLatestPrice returns most recent snapshot', async () => {
        await db.batch([
            stmtInsertPriceSnapshot(d1(), { token: 'MOTO', block_number: 100, timestamp: '2026-02-28T10:00:00Z', price: '100' }),
            stmtInsertPriceSnapshot(d1(), { token: 'MOTO', block_number: 200, timestamp: '2026-02-28T11:00:00Z', price: '200' }),
        ]);
        const latest = await getLatestPrice(d1(), 'MOTO');
        expect(latest?.block_number).toBe(200);
        expect(latest?.price).toBe('200');
    });

    it('getLatestPrice returns null when no snapshots', async () => {
        expect(await getLatestPrice(d1(), 'MOTO')).toBeNull();
    });

    it('getPriceHistory returns snapshots ordered by block_number ASC', async () => {
        await db.batch([
            stmtInsertPriceSnapshot(d1(), { token: 'PILL', block_number: 300, timestamp: '2026-02-28T12:00:00Z', price: '300' }),
            stmtInsertPriceSnapshot(d1(), { token: 'PILL', block_number: 100, timestamp: '2026-02-28T10:00:00Z', price: '100' }),
            stmtInsertPriceSnapshot(d1(), { token: 'PILL', block_number: 200, timestamp: '2026-02-28T11:00:00Z', price: '200' }),
        ]);
        const rows = await getPriceHistory(d1(), 'PILL');
        expect(rows).toHaveLength(3);
        expect(rows[0]?.block_number).toBe(100);
        expect(rows[2]?.block_number).toBe(300);
    });

    it('getPriceHistory respects from/to filters', async () => {
        await db.batch([
            stmtInsertPriceSnapshot(d1(), { token: 'MOTO', block_number: 100, timestamp: '2026-02-28T10:00:00Z', price: '100' }),
            stmtInsertPriceSnapshot(d1(), { token: 'MOTO', block_number: 200, timestamp: '2026-02-28T11:00:00Z', price: '200' }),
            stmtInsertPriceSnapshot(d1(), { token: 'MOTO', block_number: 300, timestamp: '2026-02-28T12:00:00Z', price: '300' }),
        ]);
        const rows = await getPriceHistory(d1(), 'MOTO', { from: '2026-02-28T10:30:00Z', to: '2026-02-28T12:00:00Z' });
        expect(rows).toHaveLength(2);
    });

    it('getSnapshotsInRange returns snapshots within time range', async () => {
        await db.batch([
            stmtInsertPriceSnapshot(d1(), { token: 'MOTO', block_number: 100, timestamp: '2026-02-28T10:00:00Z', price: '100' }),
            stmtInsertPriceSnapshot(d1(), { token: 'MOTO', block_number: 200, timestamp: '2026-02-28T11:00:00Z', price: '200' }),
            stmtInsertPriceSnapshot(d1(), { token: 'MOTO', block_number: 300, timestamp: '2026-02-28T13:00:00Z', price: '300' }),
        ]);
        const rows = await getSnapshotsInRange(d1(), 'MOTO', '2026-02-28T10:00:00Z', '2026-02-28T12:00:00Z');
        expect(rows).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
describe('Swap events', () => {
    it('stmtInsertSwapEvent inserts a row', async () => {
        await db.batch([stmtInsertSwapEvent(d1(), {
            token: 'MOTO', block_number: 500, tx_id: '0xtx1',
            buyer: '0xbuyer', sats_in: '100000', tokens_out: '5000000', fees: '500',
        })]);
        const row = db.queryFirst<SwapEventRow>('SELECT * FROM swap_events WHERE tx_id = ?', '0xtx1');
        expect(row?.token).toBe('MOTO');
        expect(row?.sats_in).toBe('100000');
    });

    it('getSwapEventsInBlockRange returns swaps in range', async () => {
        await db.batch([
            stmtInsertSwapEvent(d1(), { token: 'MOTO', block_number: 100, tx_id: '0xtx1', buyer: '0xa', sats_in: '1000', tokens_out: '5000', fees: '10' }),
            stmtInsertSwapEvent(d1(), { token: 'MOTO', block_number: 200, tx_id: '0xtx2', buyer: '0xb', sats_in: '2000', tokens_out: '10000', fees: '20' }),
            stmtInsertSwapEvent(d1(), { token: 'MOTO', block_number: 300, tx_id: '0xtx3', buyer: '0xc', sats_in: '3000', tokens_out: '15000', fees: '30' }),
        ]);
        const rows = await getSwapEventsInBlockRange(d1(), 'MOTO', 100, 250);
        expect(rows).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
describe('Price candles', () => {
    it('stmtUpsertCandle inserts a candle', async () => {
        await db.batch([stmtUpsertCandle(d1(), {
            token: 'MOTO', interval: '1h', open_time: '2026-02-28T12:00:00Z',
            open: '100', high: '110', low: '90', close: '105',
            volume_sats: '500000', volume_tokens: '75000', trade_count: 3,
        })]);
        const row = db.queryFirst<PriceCandleRow>('SELECT * FROM price_candles WHERE token = ? AND interval = ?', 'MOTO', '1h');
        expect(row?.open).toBe('100');
        expect(row?.trade_count).toBe(3);
    });

    it('stmtUpsertCandle upserts (replaces) on same PK', async () => {
        await db.batch([stmtUpsertCandle(d1(), {
            token: 'MOTO', interval: '1h', open_time: '2026-02-28T12:00:00Z',
            open: '100', high: '110', low: '90', close: '105',
            volume_sats: '0', volume_tokens: '0', trade_count: 0,
        })]);
        await db.batch([stmtUpsertCandle(d1(), {
            token: 'MOTO', interval: '1h', open_time: '2026-02-28T12:00:00Z',
            open: '100', high: '120', low: '85', close: '115',
            volume_sats: '50000', volume_tokens: '7500', trade_count: 5,
        })]);
        const rows = db.queryAll('SELECT * FROM price_candles WHERE token = ? AND interval = ? AND open_time = ?', 'MOTO', '1h', '2026-02-28T12:00:00Z');
        expect(rows).toHaveLength(1);
        expect((rows[0] as unknown as PriceCandleRow).high).toBe('120');
        expect((rows[0] as unknown as PriceCandleRow).trade_count).toBe(5);
    });

    it('getCandles returns candles ordered by open_time ASC', async () => {
        await db.batch([
            stmtUpsertCandle(d1(), { token: 'MOTO', interval: '1d', open_time: '2026-02-27T00:00:00Z', open: '100', high: '110', low: '90', close: '105', volume_sats: '0', volume_tokens: '0', trade_count: 0 }),
            stmtUpsertCandle(d1(), { token: 'MOTO', interval: '1d', open_time: '2026-02-28T00:00:00Z', open: '105', high: '115', low: '95', close: '110', volume_sats: '0', volume_tokens: '0', trade_count: 0 }),
        ]);
        const candles = await getCandles(d1(), 'MOTO', '1d');
        expect(candles).toHaveLength(2);
        expect(candles[0]?.open_time).toBe('2026-02-27T00:00:00Z');
    });

    it('getCandles filters by from/to', async () => {
        await db.batch([
            stmtUpsertCandle(d1(), { token: 'PILL', interval: '1h', open_time: '2026-02-28T10:00:00Z', open: '50', high: '55', low: '48', close: '52', volume_sats: '0', volume_tokens: '0', trade_count: 0 }),
            stmtUpsertCandle(d1(), { token: 'PILL', interval: '1h', open_time: '2026-02-28T11:00:00Z', open: '52', high: '58', low: '50', close: '55', volume_sats: '0', volume_tokens: '0', trade_count: 0 }),
            stmtUpsertCandle(d1(), { token: 'PILL', interval: '1h', open_time: '2026-02-28T12:00:00Z', open: '55', high: '60', low: '53', close: '57', volume_sats: '0', volume_tokens: '0', trade_count: 0 }),
        ]);
        const candles = await getCandles(d1(), 'PILL', '1h', { from: '2026-02-28T10:30:00Z' });
        expect(candles).toHaveLength(2);
    });

    it('getCandles respects limit', async () => {
        await db.batch([
            stmtUpsertCandle(d1(), { token: 'MOTO', interval: '1h', open_time: '2026-02-28T10:00:00Z', open: '50', high: '55', low: '48', close: '52', volume_sats: '0', volume_tokens: '0', trade_count: 0 }),
            stmtUpsertCandle(d1(), { token: 'MOTO', interval: '1h', open_time: '2026-02-28T11:00:00Z', open: '52', high: '58', low: '50', close: '55', volume_sats: '0', volume_tokens: '0', trade_count: 0 }),
        ]);
        const candles = await getCandles(d1(), 'MOTO', '1h', { limit: 1 });
        expect(candles).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
describe('Pruning', () => {
    it('stmtPruneOldSnapshots deletes snapshots before cutoff', async () => {
        await db.batch([
            stmtInsertPriceSnapshot(d1(), { token: 'MOTO', block_number: 100, timestamp: '2025-06-01T00:00:00Z', price: '100' }),
            stmtInsertPriceSnapshot(d1(), { token: 'MOTO', block_number: 200, timestamp: '2026-02-28T00:00:00Z', price: '200' }),
        ]);
        await db.batch([stmtPruneOldSnapshots(d1(), '2026-01-01T00:00:00Z')]);
        const rows = db.queryAll('SELECT * FROM price_snapshots');
        expect(rows).toHaveLength(1);
        expect((rows[0] as unknown as PriceSnapshotRow).block_number).toBe(200);
    });

    it('stmtPruneOldSwapEvents deletes swaps before cutoff block', async () => {
        await db.batch([
            stmtInsertSwapEvent(d1(), { token: 'MOTO', block_number: 50, tx_id: '0xtx1', buyer: '0xa', sats_in: '1000', tokens_out: '5000', fees: '10' }),
            stmtInsertSwapEvent(d1(), { token: 'MOTO', block_number: 200, tx_id: '0xtx2', buyer: '0xb', sats_in: '2000', tokens_out: '10000', fees: '20' }),
        ]);
        await db.batch([stmtPruneOldSwapEvents(d1(), 100)]);
        const rows = db.queryAll('SELECT * FROM swap_events');
        expect(rows).toHaveLength(1);
        expect((rows[0] as unknown as SwapEventRow).block_number).toBe(200);
    });
});

// ---------------------------------------------------------------------------
describe('Option transfers', () => {
    it('stmtInsertOptionTransfer inserts a transfer record', async () => {
        await upsertPool(d1(), makePool(POOL_ADDR));
        await db.batch([stmtInsertOption(d1(), makeOption(1))]);
        await db.batch([stmtInsertOptionTransfer(d1(), {
            pool_address: POOL_ADDR, option_id: 1,
            from_address: '0xfrom', to_address: '0xto',
            block_number: 200, tx_id: '0xtx_transfer',
        })]);
        const rows = db.queryAll('SELECT * FROM option_transfers');
        expect(rows).toHaveLength(1);
        const row = rows[0] as Record<string, unknown>;
        expect(row['from_address']).toBe('0xfrom');
        expect(row['to_address']).toBe('0xto');
    });

    it('stmtUpdateOptionBuyer updates buyer and updated fields', async () => {
        await upsertPool(d1(), makePool(POOL_ADDR));
        await db.batch([stmtInsertOption(d1(), makeOption(1, { buyer: '0xoldbuyer' }))]);
        await db.batch([stmtUpdateOptionBuyer(d1(), POOL_ADDR, 1, '0xnewbuyer', 300, '0xtx_update')]);
        const opt = await getOption(d1(), POOL_ADDR, 1);
        expect(opt?.buyer).toBe('0xnewbuyer');
        expect(opt?.updated_block).toBe(300);
        expect(opt?.updated_tx).toBe('0xtx_update');
    });

    it('getTransfersByOption returns transfers for specific option', async () => {
        await upsertPool(d1(), makePool(POOL_ADDR));
        await db.batch([stmtInsertOption(d1(), makeOption(1))]);
        await db.batch([
            stmtInsertOptionTransfer(d1(), { pool_address: POOL_ADDR, option_id: 1, from_address: '0xa', to_address: '0xb', block_number: 100, tx_id: '0xtx1' }),
            stmtInsertOptionTransfer(d1(), { pool_address: POOL_ADDR, option_id: 1, from_address: '0xb', to_address: '0xc', block_number: 200, tx_id: '0xtx2' }),
            stmtInsertOptionTransfer(d1(), { pool_address: POOL_ADDR, option_id: 2, from_address: '0xd', to_address: '0xe', block_number: 300, tx_id: '0xtx3' }),
        ]);
        const transfers = await getTransfersByOption(d1(), POOL_ADDR, 1);
        expect(transfers).toHaveLength(2);
        expect(transfers[0]!.block_number).toBe(100);
        expect(transfers[1]!.block_number).toBe(200);
    });

    it('getTransfersByUser returns transfers involving address (from or to)', async () => {
        await upsertPool(d1(), makePool(POOL_ADDR));
        await db.batch([stmtInsertOption(d1(), makeOption(1))]);
        await db.batch([
            stmtInsertOptionTransfer(d1(), { pool_address: POOL_ADDR, option_id: 1, from_address: '0xalice', to_address: '0xbob', block_number: 100, tx_id: '0xtx1' }),
            stmtInsertOptionTransfer(d1(), { pool_address: POOL_ADDR, option_id: 1, from_address: '0xbob', to_address: '0xcharlie', block_number: 200, tx_id: '0xtx2' }),
            stmtInsertOptionTransfer(d1(), { pool_address: POOL_ADDR, option_id: 2, from_address: '0xdave', to_address: '0xeve', block_number: 300, tx_id: '0xtx3' }),
        ]);
        const bobTransfers = await getTransfersByUser(d1(), '0xbob');
        expect(bobTransfers).toHaveLength(2);
        const daveTransfers = await getTransfersByUser(d1(), '0xdave');
        expect(daveTransfers).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
describe('Address case-insensitive queries', () => {
    beforeEach(async () => {
        await upsertPool(d1(), makePool(POOL_ADDR));
    });

    it('getOptionsByUser matches regardless of hex case (decoder stores lowercase)', async () => {
        // Decoder normalizes all addresses to lowercase before inserting
        await db.batch([
            stmtInsertOption(d1(), makeOption(10, {
                writer: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
                buyer:  '0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
                status: 1,
            })),
        ]);

        // Query with UPPERCASE — getOptionsByUser normalizes to lowercase → match
        const writerResults = await getOptionsByUser(d1(),
            '0xABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890',
        );
        expect(writerResults).toHaveLength(1);
        expect(writerResults[0]?.option_id).toBe(10);

        // Query with mixed case — should also match buyer
        const buyerResults = await getOptionsByUser(d1(),
            '0xFEDCBA9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
        );
        expect(buyerResults).toHaveLength(1);
        expect(buyerResults[0]?.option_id).toBe(10);
    });

    it('getOptionsByUser with uppercase query matches lowercase DB data', async () => {
        // Insert with lowercase addresses (normal case after decoder normalization)
        await db.batch([
            stmtInsertOption(d1(), makeOption(11, {
                writer: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
                status: 0,
            })),
        ]);

        // Query with uppercase — getOptionsByUser normalizes to lowercase
        const results = await getOptionsByUser(d1(),
            '0xABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890',
        );
        expect(results).toHaveLength(1);
        expect(results[0]?.option_id).toBe(11);
    });
});
