/**
 * DB query integration tests.
 *
 * Uses MockD1Database (sql.js in-memory) to run real SQL statements against
 * the actual schema.  No mocking of queries.ts — the full SQL is exercised.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MockD1Database } from '../helpers/mockD1.js';
import type { PoolRow, OptionRow, FeeEventRow } from '../../types/index.js';
import {
    getLastIndexedBlock,
    stmtSetLastIndexedBlock,
    upsertPool,
    getAllPools,
    getPool,
    stmtInsertOption,
    stmtUpdateOptionStatus,
    stmtInsertFeeEvent,
    getOption,
    getOptionsByPool,
    getOptionsByWriter,
    getOptionsByBuyer,
    getOptionsByUser,
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
