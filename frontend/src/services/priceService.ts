/**
 * PriceService — stateless HTTP client for the FroGop indexer price endpoints.
 *
 * Same pattern as indexerService.ts: returns `null` on any failure.
 * Callers gracefully degrade (no chart) when indexer is unavailable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CandleData {
    time: number;        // unix timestamp (seconds) — what lightweight-charts expects
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;      // volume_sats as number
    tradeCount: number;
}

export interface PriceSnapshot {
    token: string;
    blockNumber: number;
    timestamp: string;
    price: string;
}

/** Raw candle row from indexer API (snake_case, strings). */
interface CandleRow {
    token: string;
    interval: string;
    open_time: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume_sats: string;
    volume_tokens: string;
    trade_count: number;
}

/** Raw snapshot row from indexer API. */
interface SnapshotRow {
    token: string;
    block_number: number;
    timestamp: string;
    price: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getBaseUrl(): string | undefined {
    return import.meta.env.VITE_INDEXER_URL as string | undefined;
}

async function fetchJson<T>(path: string): Promise<T | null> {
    const base = getBaseUrl();
    if (!base) return null;
    try {
        const res = await fetch(`${base}${path}`);
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

/** Convert a bigint decimal string to a float (divide by 10^18). */
function toFloat(s: string): number {
    if (!s || s === '0') return 0;
    // For very large numbers, use BigInt division to avoid precision loss
    const val = BigInt(s);
    const divisor = 10n ** 18n;
    const whole = val / divisor;
    const frac = val % divisor;
    return Number(whole) + Number(frac) / 1e18;
}

/**
 * Tokens whose raw indexer data (tokens-per-100k-sats) should be inverted to
 * sats-per-token for intuitive charting (higher = more expensive).
 */
const SATS_PER_QUOTE = 100_000;
const INVERTED_TOKENS = new Set(['MOTO', 'PILL']);

function safeInvert(v: number): number {
    return v > 0 ? SATS_PER_QUOTE / v : 0;
}

/**
 * Invert a candle from tokens-per-100k-sats to sats-per-token.
 * Note: high/low swap because inverting flips the ordering.
 */
function invertCandle(c: CandleData): CandleData {
    return {
        ...c,
        open: safeInvert(c.open),
        high: safeInvert(c.low),    // raw low (fewest tokens) = highest sats/token
        low: safeInvert(c.high),    // raw high (most tokens) = lowest sats/token
        close: safeInvert(c.close),
    };
}

function mapCandleRow(row: CandleRow): CandleData {
    return {
        time: Math.floor(new Date(row.open_time).getTime() / 1000),
        open: toFloat(row.open),
        high: toFloat(row.high),
        low: toFloat(row.low),
        close: toFloat(row.close),
        volume: Number(row.volume_sats),
        tradeCount: row.trade_count,
    };
}

function mapSnapshotRow(row: SnapshotRow): PriceSnapshot {
    return {
        token: row.token,
        blockNumber: row.block_number,
        timestamp: row.timestamp,
        price: row.price,
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getCandles(
    token: string,
    interval: string,
    opts?: { from?: string; to?: string; limit?: number },
): Promise<CandleData[] | null> {
    const params = new URLSearchParams();
    params.set('interval', interval);
    if (opts?.from) params.set('from', opts.from);
    if (opts?.to) params.set('to', opts.to);
    if (opts?.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    const rows = await fetchJson<CandleRow[]>(`/prices/${token}/candles?${qs}`);
    if (!rows) return null;
    const candles = rows.map(mapCandleRow);
    // Invert MOTO/PILL to sats-per-token (intuitive: up = more expensive)
    return INVERTED_TOKENS.has(token) ? candles.map(invertCandle) : candles;
}

export async function getLatestPrice(token: string): Promise<PriceSnapshot | null> {
    const row = await fetchJson<SnapshotRow>(`/prices/${token}/latest`);
    if (!row) return null;
    return mapSnapshotRow(row);
}
