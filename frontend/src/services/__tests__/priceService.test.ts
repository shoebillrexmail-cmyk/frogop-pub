/**
 * priceService unit tests — candle fetching, price inversion, and formatting.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCandles, getLatestPrice } from '../priceService.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.frogop.net';

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/** Build a raw CandleRow as the indexer API returns. All prices are 18-decimal bigint strings. */
function makeCandleRow(overrides: Record<string, unknown> = {}) {
    return {
        token: 'MOTO',
        interval: '1d',
        open_time: '2026-03-01T00:00:00.000Z',
        // 50 tokens per 100k sats → 50 * 10^18
        open: '50000000000000000000',
        // 60 tokens → cheapest sats/token
        high: '60000000000000000000',
        // 40 tokens → most expensive sats/token
        low: '40000000000000000000',
        // 45 tokens
        close: '45000000000000000000',
        volume_sats: '500000',
        volume_tokens: '25000000000000000000',
        trade_count: 12,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    vi.stubEnv('VITE_INDEXER_URL', BASE_URL);
    fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
    vi.unstubAllEnvs();
    fetchSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// getCandles — basic fetching
// ---------------------------------------------------------------------------

describe('getCandles', () => {
    it('returns null when VITE_INDEXER_URL is not set', async () => {
        vi.stubEnv('VITE_INDEXER_URL', '');
        const result = await getCandles('MOTO', '1d');
        expect(result).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns null when API responds with non-200', async () => {
        fetchSpy.mockResolvedValueOnce(jsonResponse(null, 500));
        const result = await getCandles('MOTO', '1d');
        expect(result).toBeNull();
    });

    it('returns null when fetch throws', async () => {
        fetchSpy.mockRejectedValueOnce(new Error('network error'));
        const result = await getCandles('MOTO', '1d');
        expect(result).toBeNull();
    });

    it('passes query params correctly', async () => {
        fetchSpy.mockResolvedValueOnce(jsonResponse([]));
        await getCandles('PILL', '4h', { from: '2026-01-01', to: '2026-03-01', limit: 100 });
        const url = (fetchSpy.mock.calls[0]![0] as string);
        expect(url).toContain('/prices/PILL/candles?');
        expect(url).toContain('interval=4h');
        expect(url).toContain('from=2026-01-01');
        expect(url).toContain('to=2026-03-01');
        expect(url).toContain('limit=100');
    });

    it('converts timestamps to unix seconds', async () => {
        fetchSpy.mockResolvedValueOnce(jsonResponse([
            makeCandleRow({ token: 'MOTO_PILL' }),
        ]));
        const candles = await getCandles('MOTO_PILL', '1d');
        expect(candles).toHaveLength(1);
        expect(candles![0]!.time).toBe(Math.floor(new Date('2026-03-01T00:00:00.000Z').getTime() / 1000));
    });
});

// ---------------------------------------------------------------------------
// getCandles — price inversion for MOTO and PILL
// ---------------------------------------------------------------------------

describe('getCandles — MOTO/PILL inversion', () => {
    it('inverts MOTO candles to sats-per-token', async () => {
        fetchSpy.mockResolvedValueOnce(jsonResponse([makeCandleRow()]));
        const candles = await getCandles('MOTO', '1d');
        expect(candles).toHaveLength(1);
        const c = candles![0]!;

        // Raw: open=50 tokens/100k sats → inverted: 100000/50 = 2000 sats/MOTO
        expect(c.open).toBeCloseTo(2000, 2);
        // Raw: close=45 → 100000/45 ≈ 2222.22
        expect(c.close).toBeCloseTo(100_000 / 45, 2);
        // Raw low=40 (most expensive) → inverted high: 100000/40 = 2500
        expect(c.high).toBeCloseTo(2500, 2);
        // Raw high=60 (cheapest) → inverted low: 100000/60 ≈ 1666.67
        expect(c.low).toBeCloseTo(100_000 / 60, 2);
    });

    it('high > low after inversion', async () => {
        fetchSpy.mockResolvedValueOnce(jsonResponse([makeCandleRow()]));
        const candles = await getCandles('MOTO', '1d');
        const c = candles![0]!;
        expect(c.high).toBeGreaterThan(c.low);
    });

    it('inverts PILL candles the same way', async () => {
        fetchSpy.mockResolvedValueOnce(jsonResponse([
            makeCandleRow({ token: 'PILL', open: '200000000000000000000' }), // 200 tokens
        ]));
        const candles = await getCandles('PILL', '1d');
        const c = candles![0]!;
        // 200 tokens/100k sats → 100000/200 = 500 sats/PILL
        expect(c.open).toBeCloseTo(500, 2);
    });

    it('preserves volume unchanged for inverted tokens', async () => {
        fetchSpy.mockResolvedValueOnce(jsonResponse([
            makeCandleRow({ volume_sats: '750000' }),
        ]));
        const candles = await getCandles('MOTO', '1d');
        expect(candles![0]!.volume).toBe(750_000);
    });

    it('handles zero price gracefully (returns 0 instead of Infinity)', async () => {
        fetchSpy.mockResolvedValueOnce(jsonResponse([
            makeCandleRow({ open: '0', high: '0', low: '0', close: '0' }),
        ]));
        const candles = await getCandles('MOTO', '1d');
        const c = candles![0]!;
        expect(c.open).toBe(0);
        expect(c.high).toBe(0);
        expect(c.low).toBe(0);
        expect(c.close).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// getCandles — MOTO_PILL is NOT inverted
// ---------------------------------------------------------------------------

describe('getCandles — MOTO_PILL (no inversion)', () => {
    it('returns raw cross-rate values without inversion', async () => {
        // 2 PILL per MOTO stored as 2 * 10^18
        const crossRate = '2000000000000000000';
        fetchSpy.mockResolvedValueOnce(jsonResponse([
            makeCandleRow({
                token: 'MOTO_PILL',
                open: crossRate,
                high: '3000000000000000000',
                low: '1500000000000000000',
                close: '2500000000000000000',
            }),
        ]));
        const candles = await getCandles('MOTO_PILL', '1d');
        const c = candles![0]!;
        expect(c.open).toBeCloseTo(2.0, 6);
        expect(c.high).toBeCloseTo(3.0, 6);
        expect(c.low).toBeCloseTo(1.5, 6);
        expect(c.close).toBeCloseTo(2.5, 6);
    });
});

// ---------------------------------------------------------------------------
// getLatestPrice
// ---------------------------------------------------------------------------

describe('getLatestPrice', () => {
    it('returns mapped snapshot', async () => {
        fetchSpy.mockResolvedValueOnce(jsonResponse({
            token: 'MOTO',
            block_number: 12345,
            timestamp: '2026-03-01T12:00:00.000Z',
            price: '50000000000000000000',
        }));
        const snap = await getLatestPrice('MOTO');
        expect(snap).toEqual({
            token: 'MOTO',
            blockNumber: 12345,
            timestamp: '2026-03-01T12:00:00.000Z',
            price: '50000000000000000000',
        });
    });

    it('returns null on failure', async () => {
        fetchSpy.mockResolvedValueOnce(jsonResponse(null, 404));
        expect(await getLatestPrice('MOTO')).toBeNull();
    });
});
