/**
 * IndexerService — stateless HTTP client for the FroGop indexer REST API.
 *
 * Every function returns `null` on failure (missing env var, network error,
 * non-200 response, parse error).  Callers fall back to PoolService on-chain
 * queries when they receive `null`.
 */
import type { OptionData } from './types.ts';

// ---------------------------------------------------------------------------
// Indexer row shape (matches D1 `options` table — snake_case, strings)
// ---------------------------------------------------------------------------

interface OptionRow {
    pool_address: string;
    option_id: number;
    writer: string;
    buyer: string | null;
    option_type: number;
    strike_price: string;
    underlying_amt: string;
    premium: string;
    expiry_block: number;
    grace_end_block: number;
    status: number;
    created_block: number;
    created_tx: string;
    updated_block: number | null;
    updated_tx: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Read the indexer base URL lazily so tests can stub `import.meta.env`. */
function getBaseUrl(): string | undefined {
    return import.meta.env.VITE_INDEXER_URL as string | undefined;
}

/** Fetch JSON from the indexer. Returns `null` on any failure. */
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

/** Map an indexer OptionRow to the frontend OptionData type. */
function mapOptionRow(row: OptionRow): OptionData {
    return {
        id: BigInt(row.option_id),
        writer: row.writer,
        buyer: row.buyer ?? '',
        optionType: row.option_type,
        strikePrice: BigInt(row.strike_price),
        underlyingAmount: BigInt(row.underlying_amt),
        premium: BigInt(row.premium),
        expiryBlock: BigInt(row.expiry_block),
        status: row.status,
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Check indexer health. */
export async function getHealth(): Promise<{ lastBlock: number; network: string } | null> {
    return fetchJson('/health');
}

/** Fetch all options for a user address (writer OR buyer). */
export async function getOptionsByUser(userAddress: string): Promise<OptionData[] | null> {
    const rows = await fetchJson<OptionRow[]>(`/user/${userAddress}/options`);
    if (!rows) return null;
    return rows.map(mapOptionRow);
}

/** Fetch options for a pool, with optional filters. */
export async function getOptionsByPool(
    poolAddress: string,
    opts?: { status?: number; page?: number; limit?: number },
): Promise<OptionData[] | null> {
    const params = new URLSearchParams();
    if (opts?.status !== undefined) params.set('status', String(opts.status));
    if (opts?.page !== undefined) params.set('page', String(opts.page));
    if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
    const qs = params.toString();
    const path = `/pools/${poolAddress}/options${qs ? `?${qs}` : ''}`;
    const rows = await fetchJson<OptionRow[]>(path);
    if (!rows) return null;
    return rows.map(mapOptionRow);
}

/** Fetch a single option by pool address and option ID. */
export async function getOption(
    poolAddress: string,
    optionId: number,
): Promise<OptionData | null> {
    const row = await fetchJson<OptionRow>(`/pools/${poolAddress}/options/${optionId}`);
    if (!row) return null;
    return mapOptionRow(row);
}
