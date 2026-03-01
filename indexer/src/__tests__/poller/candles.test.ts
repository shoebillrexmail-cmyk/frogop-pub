/**
 * Candle rollup tests — tests rollUpAllCandles directly with MockD1Database.
 *
 * Uses vi.useFakeTimers() to control bucket boundaries and verify
 * OHLCV computation from price snapshots and swap events.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockD1Database } from '../helpers/mockD1.js';

// Mock opnet (not used by rollUpAllCandles, but needed to import poller)
vi.mock('opnet', () => ({
    JSONRpcProvider: vi.fn(),
    CallResult: vi.fn(),
}));

import { rollUpAllCandles } from '../../poller/index.js';
import type { PriceCandleRow } from '../../types/index.js';

let db: MockD1Database;

// Fixed time: 2026-03-01T12:00:00.000Z — middle of a 1h bucket
const FIXED_TIME = new Date('2026-03-01T12:00:00.000Z').getTime();

beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_TIME);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    db = await MockD1Database.create();
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

/** Insert a price snapshot directly */
function insertSnapshot(token: string, blockNumber: number, timestamp: string, price: string): void {
    db.queryAll(
        'INSERT INTO price_snapshots (token, block_number, timestamp, price) VALUES (?, ?, ?, ?)',
        token, blockNumber, timestamp, price,
    );
}

/** Insert a swap event directly */
function insertSwapEvent(
    token: string, blockNumber: number, txId: string,
    buyer: string, satsIn: string, tokensOut: string, fees: string,
): void {
    db.queryAll(
        'INSERT INTO swap_events (token, block_number, tx_id, buyer, sats_in, tokens_out, fees) VALUES (?, ?, ?, ?, ?, ?, ?)',
        token, blockNumber, txId, buyer, satsIn, tokensOut, fees,
    );
}

function getCandles(token?: string): PriceCandleRow[] {
    if (token) {
        return db.queryAll<PriceCandleRow>('SELECT * FROM price_candles WHERE token = ?', token);
    }
    return db.queryAll<PriceCandleRow>('SELECT * FROM price_candles');
}

// ---------------------------------------------------------------------------
describe('rollUpAllCandles — OHLCV from price snapshots', () => {
    it('computes open/high/low/close from snapshots in current bucket', async () => {
        // Current 1h bucket: 12:00:00 → 13:00:00
        insertSnapshot('MOTO', 100, '2026-03-01T12:05:00.000Z', '1000');
        insertSnapshot('MOTO', 101, '2026-03-01T12:10:00.000Z', '1500');
        insertSnapshot('MOTO', 102, '2026-03-01T12:15:00.000Z', '800');
        insertSnapshot('MOTO', 103, '2026-03-01T12:20:00.000Z', '1200');

        await rollUpAllCandles(db as unknown as D1Database);

        const candles = getCandles('MOTO');
        const hourly = candles.find(c => c.interval === '1h');
        expect(hourly).toBeTruthy();
        expect(hourly!.open).toBe('1000');   // first
        expect(hourly!.close).toBe('1200');  // last
        expect(hourly!.high).toBe('1500');   // max
        expect(hourly!.low).toBe('800');     // min
    });
});

// ---------------------------------------------------------------------------
describe('rollUpAllCandles — swap events affect volume and H/L', () => {
    it('factors swap prices into high/low and tracks volume', async () => {
        // Snapshot prices: 1000, 1200
        insertSnapshot('MOTO', 100, '2026-03-01T12:05:00.000Z', '1000');
        insertSnapshot('MOTO', 101, '2026-03-01T12:10:00.000Z', '1200');

        // Swap with effective price: tokensOut * 100k / satsIn = 2_000_000 * 100_000 / 50_000 = 4_000_000
        // This is higher than any snapshot → should become the high
        // Block range estimated from timestamps: floor(bucketStart.getTime() / 600_000) to ceil(bucketEnd.getTime() / 600_000)
        const bucketStartMs = new Date('2026-03-01T12:00:00.000Z').getTime();
        const bucketEndMs = new Date('2026-03-01T13:00:00.000Z').getTime();
        const fromBlock = Math.floor(bucketStartMs / 600_000);
        const toBlock = Math.ceil(bucketEndMs / 600_000);
        // Use a block number in the range
        const swapBlock = fromBlock + 1;

        insertSwapEvent('MOTO', swapBlock, '0xswaptx', '0xbuyer', '50000', '2000000', '100');

        await rollUpAllCandles(db as unknown as D1Database);

        const hourly = getCandles('MOTO').find(c => c.interval === '1h');
        expect(hourly).toBeTruthy();
        expect(hourly!.volume_sats).toBe('50000');
        expect(hourly!.volume_tokens).toBe('2000000');
        expect(hourly!.trade_count).toBe(1);
        // Swap price (4_000_000) > snapshot high (1200) → new high
        expect(BigInt(hourly!.high)).toBe(4_000_000n);
    });
});

// ---------------------------------------------------------------------------
describe('rollUpAllCandles — MOTO_PILL cross-rate', () => {
    it('produces candles with zero volume for cross-rate', async () => {
        insertSnapshot('MOTO_PILL', 100, '2026-03-01T12:05:00.000Z', '4000000000000000000');
        insertSnapshot('MOTO_PILL', 101, '2026-03-01T12:10:00.000Z', '5000000000000000000');

        await rollUpAllCandles(db as unknown as D1Database);

        const hourly = getCandles('MOTO_PILL').find(c => c.interval === '1h');
        expect(hourly).toBeTruthy();
        expect(hourly!.volume_sats).toBe('0');
        expect(hourly!.volume_tokens).toBe('0');
        expect(hourly!.trade_count).toBe(0);
        // OHLCV still computed from snapshots
        expect(hourly!.open).toBe('4000000000000000000');
        expect(hourly!.close).toBe('5000000000000000000');
    });
});

// ---------------------------------------------------------------------------
describe('rollUpAllCandles — all 4 intervals', () => {
    it('produces candles for 1h, 4h, 1d, 1w from same snapshot data', async () => {
        insertSnapshot('PILL', 100, '2026-03-01T12:05:00.000Z', '500');
        insertSnapshot('PILL', 101, '2026-03-01T12:15:00.000Z', '600');

        await rollUpAllCandles(db as unknown as D1Database);

        const candles = getCandles('PILL');
        const intervals = candles.map(c => c.interval).sort();
        expect(intervals).toEqual(['1d', '1h', '1w', '4h']);
    });
});

// ---------------------------------------------------------------------------
describe('rollUpAllCandles — no candles when no snapshots', () => {
    it('produces no candles when no snapshots exist in current bucket', async () => {
        // Snapshot from yesterday — outside the current 1h bucket
        insertSnapshot('MOTO', 50, '2026-02-28T12:05:00.000Z', '1000');

        await rollUpAllCandles(db as unknown as D1Database);

        // The 1h bucket has no data; 4h/1d/1w might depending on time alignment
        const hourly = getCandles('MOTO').find(c => c.interval === '1h');
        expect(hourly).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
describe('rollUpAllCandles — upsert replaces on same bucket', () => {
    it('overwrites existing candle for same token/interval/open_time', async () => {
        insertSnapshot('MOTO', 100, '2026-03-01T12:05:00.000Z', '1000');

        await rollUpAllCandles(db as unknown as D1Database);
        const first = getCandles('MOTO').find(c => c.interval === '1h');
        expect(first!.close).toBe('1000');

        // Add a new snapshot and roll up again
        insertSnapshot('MOTO', 102, '2026-03-01T12:30:00.000Z', '2000');
        await rollUpAllCandles(db as unknown as D1Database);

        // Should have updated (not duplicated) the candle
        const hourlyCandles = getCandles('MOTO').filter(c => c.interval === '1h');
        expect(hourlyCandles.length).toBe(1);
        expect(hourlyCandles[0]!.close).toBe('2000');
        expect(hourlyCandles[0]!.high).toBe('2000');
    });
});

// ---------------------------------------------------------------------------
describe('rollUpAllCandles — single snapshot', () => {
    it('sets O=H=L=C when only one snapshot exists', async () => {
        insertSnapshot('PILL', 100, '2026-03-01T12:05:00.000Z', '777');

        await rollUpAllCandles(db as unknown as D1Database);

        const hourly = getCandles('PILL').find(c => c.interval === '1h');
        expect(hourly!.open).toBe('777');
        expect(hourly!.high).toBe('777');
        expect(hourly!.low).toBe('777');
        expect(hourly!.close).toBe('777');
    });
});
