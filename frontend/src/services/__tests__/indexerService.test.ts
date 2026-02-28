/**
 * indexerService unit tests — mock global.fetch + import.meta.env
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getHealth, getOptionsByUser, getOptionsByPool, getOption } from '../indexerService.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.frogop.net';

/** Minimal OptionRow matching the indexer D1 schema */
function makeRow(overrides: Record<string, unknown> = {}) {
    return {
        pool_address: 'opt1pool000000000000000000000000',
        option_id: 1,
        writer: 'opt1writer0000000000000000000000',
        buyer: 'opt1buyer00000000000000000000000',
        option_type: 0,
        strike_price: '50000000000000000000',
        underlying_amt: '1000000000000000000',
        premium: '500000000000000000',
        expiry_block: 900000,
        grace_end_block: 900144,
        status: 0,
        created_block: 100,
        created_tx: 'abc123',
        updated_block: null,
        updated_tx: null,
        ...overrides,
    };
}

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
    vi.stubEnv('VITE_INDEXER_URL', BASE_URL);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// getHealth
// ---------------------------------------------------------------------------

describe('getHealth', () => {
    it('returns lastBlock and network on success', async () => {
        const mockFetch = vi.fn().mockResolvedValue(
            jsonResponse({ status: 'ok', lastBlock: 42000, network: 'testnet' }),
        );
        vi.stubGlobal('fetch', mockFetch);

        const result = await getHealth();
        expect(result).toEqual({ status: 'ok', lastBlock: 42000, network: 'testnet' });
        expect(mockFetch).toHaveBeenCalledWith(`${BASE_URL}/health`);
    });

    it('returns null on network error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failure')));
        expect(await getHealth()).toBeNull();
    });

    it('returns null on non-200 response', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'bad' }, 500)));
        expect(await getHealth()).toBeNull();
    });

    it('returns null when VITE_INDEXER_URL is not set', async () => {
        vi.stubEnv('VITE_INDEXER_URL', '');
        vi.stubGlobal('fetch', vi.fn());
        expect(await getHealth()).toBeNull();
        expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// getOptionsByUser
// ---------------------------------------------------------------------------

describe('getOptionsByUser', () => {
    it('maps rows to OptionData with correct bigint conversions', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([makeRow()])));

        const result = await getOptionsByUser('opt1user000');
        expect(result).toHaveLength(1);
        const opt = result![0];
        expect(opt.id).toBe(1n);
        expect(opt.writer).toBe('opt1writer0000000000000000000000');
        expect(opt.buyer).toBe('opt1buyer00000000000000000000000');
        expect(opt.optionType).toBe(0);
        expect(opt.strikePrice).toBe(50000000000000000000n);
        expect(opt.underlyingAmount).toBe(1000000000000000000n);
        expect(opt.premium).toBe(500000000000000000n);
        expect(opt.expiryBlock).toBe(900000n);
        expect(opt.status).toBe(0);
    });

    it('maps null buyer to empty string', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            jsonResponse([makeRow({ buyer: null })]),
        ));

        const result = await getOptionsByUser('opt1user000');
        expect(result![0].buyer).toBe('');
    });

    it('constructs correct URL', async () => {
        const mockFetch = vi.fn().mockResolvedValue(jsonResponse([]));
        vi.stubGlobal('fetch', mockFetch);

        await getOptionsByUser('opt1abc');
        expect(mockFetch).toHaveBeenCalledWith(`${BASE_URL}/user/opt1abc/options`);
    });
});

// ---------------------------------------------------------------------------
// getOptionsByPool
// ---------------------------------------------------------------------------

describe('getOptionsByPool', () => {
    it('fetches without query string when no opts provided', async () => {
        const mockFetch = vi.fn().mockResolvedValue(jsonResponse([]));
        vi.stubGlobal('fetch', mockFetch);

        await getOptionsByPool('opt1pool');
        expect(mockFetch).toHaveBeenCalledWith(`${BASE_URL}/pools/opt1pool/options`);
    });

    it('builds query string from opts', async () => {
        const mockFetch = vi.fn().mockResolvedValue(jsonResponse([]));
        vi.stubGlobal('fetch', mockFetch);

        await getOptionsByPool('opt1pool', { status: 0, page: 2, limit: 10 });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('status=0');
        expect(url).toContain('page=2');
        expect(url).toContain('limit=10');
    });

    it('maps multiple rows correctly', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            jsonResponse([makeRow({ option_id: 0 }), makeRow({ option_id: 1 })]),
        ));

        const result = await getOptionsByPool('opt1pool');
        expect(result).toHaveLength(2);
        expect(result![0].id).toBe(0n);
        expect(result![1].id).toBe(1n);
    });
});

// ---------------------------------------------------------------------------
// getOption
// ---------------------------------------------------------------------------

describe('getOption', () => {
    it('returns a single mapped OptionData', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(makeRow({ option_id: 5 }))));

        const result = await getOption('opt1pool', 5);
        expect(result).not.toBeNull();
        expect(result!.id).toBe(5n);
    });

    it('returns null on 404', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            jsonResponse({ error: 'Not found' }, 404),
        ));

        expect(await getOption('opt1pool', 999)).toBeNull();
    });

    it('constructs correct URL', async () => {
        const mockFetch = vi.fn().mockResolvedValue(jsonResponse(makeRow()));
        vi.stubGlobal('fetch', mockFetch);

        await getOption('opt1pool', 42);
        expect(mockFetch).toHaveBeenCalledWith(`${BASE_URL}/pools/opt1pool/options/42`);
    });
});

// ---------------------------------------------------------------------------
// JSON parse error
// ---------------------------------------------------------------------------

describe('error handling', () => {
    it('returns null when response body is not valid JSON', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            new Response('not json', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
        ));

        expect(await getHealth()).toBeNull();
    });
});
