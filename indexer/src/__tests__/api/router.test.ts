/**
 * Router unit tests.
 *
 * All db/queries functions are mocked — handleFetch() is tested with a fake
 * Env object.  Response status, JSON body, CORS headers, and routing are
 * verified.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../db/queries.js', () => ({
    getAllPools:         vi.fn(),
    getPool:            vi.fn(),
    getOptionsByPool:   vi.fn(),
    getOption:          vi.fn(),
    getOptionsByWriter: vi.fn(),
    getOptionsByBuyer:  vi.fn(),
    getOptionsByUser:   vi.fn(),
    getLastIndexedBlock: vi.fn(),
}));

import { handleFetch } from '../../api/router.js';
import * as queries    from '../../db/queries.js';
import type { Env, PoolRow, OptionRow } from '../../types/index.js';

// ---- Typed mock helpers ---------------------------------------------------
const mockGetAllPools         = vi.mocked(queries.getAllPools);
const mockGetPool             = vi.mocked(queries.getPool);
const mockGetOptionsByPool    = vi.mocked(queries.getOptionsByPool);
const mockGetOption           = vi.mocked(queries.getOption);
const mockGetOptionsByWriter  = vi.mocked(queries.getOptionsByWriter);
const mockGetOptionsByBuyer   = vi.mocked(queries.getOptionsByBuyer);
const mockGetOptionsByUser    = vi.mocked(queries.getOptionsByUser);
const mockGetLastIndexedBlock = vi.mocked(queries.getLastIndexedBlock);

// ---- Test fixtures --------------------------------------------------------
const mockDb  = {} as D1Database;
const mockEnv: Env = {
    DB:               mockDb,
    OPNET_NETWORK:    'testnet',
    OPNET_RPC_URL:    'https://testnet.opnet.org',
    POOL_ADDRESSES:   '',
    FACTORY_ADDRESS:  '',
    MAX_BLOCKS_PER_RUN: '50',
};

const POOL_ADDR = 'opt1pool000';

const fakePool: PoolRow = {
    address:       POOL_ADDR,
    address_hex:   '0xpool',
    underlying:    '0xtoken1',
    premium_token: '0xtoken2',
    fee_recipient: '0xfee',
    created_block: 100,
    created_tx:    '0xtx',
    indexed_at:    '2025-01-01T00:00:00Z',
};

const fakeOption: OptionRow = {
    pool_address:   POOL_ADDR,
    option_id:      1,
    writer:         '0xwriter',
    buyer:          null,
    option_type:    0,
    strike_price:   '50000',
    underlying_amt: '1000',
    premium:        '500',
    expiry_block:   6000,
    grace_end_block: 6144,
    status:         0,
    created_block:  200,
    created_tx:     '0xtx2',
    updated_block:  null,
    updated_tx:     null,
};

/** Build a GET Request with optional Origin header */
function req(path: string, opts: { origin?: string; method?: string } = {}): Request {
    const url    = `https://api.frogop.net${path}`;
    const method = opts.method ?? 'GET';
    const headers: Record<string, string> = {};
    if (opts.origin) headers['Origin'] = opts.origin;
    return new Request(url, { method, headers });
}

beforeEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
describe('GET /health', () => {
    it('returns 200 with status, lastBlock, network', async () => {
        mockGetLastIndexedBlock.mockResolvedValue(1234);
        const res = await handleFetch(req('/health'), mockEnv);
        expect(res.status).toBe(200);
        const body = await res.json() as Record<string, unknown>;
        expect(body['status']).toBe('ok');
        expect(body['lastBlock']).toBe(1234);
        expect(body['network']).toBe('testnet');
    });
});

// ---------------------------------------------------------------------------
describe('GET /pools', () => {
    it('returns 200 with pool array', async () => {
        mockGetAllPools.mockResolvedValue([fakePool]);
        const res = await handleFetch(req('/pools'), mockEnv);
        expect(res.status).toBe(200);
        const body = await res.json() as PoolRow[];
        expect(body).toHaveLength(1);
        expect(body[0]?.address).toBe(POOL_ADDR);
    });
});

// ---------------------------------------------------------------------------
describe('GET /pools/:addr', () => {
    it('returns 200 with pool data when found', async () => {
        mockGetPool.mockResolvedValue(fakePool);
        const res = await handleFetch(req(`/pools/${POOL_ADDR}`), mockEnv);
        expect(res.status).toBe(200);
        const body = await res.json() as PoolRow;
        expect(body.address).toBe(POOL_ADDR);
    });

    it('returns 404 when pool not found', async () => {
        mockGetPool.mockResolvedValue(null);
        const res = await handleFetch(req(`/pools/unknown`), mockEnv);
        expect(res.status).toBe(404);
    });
});

// ---------------------------------------------------------------------------
describe('GET /pools/:addr/options', () => {
    it('returns all options for pool', async () => {
        mockGetOptionsByPool.mockResolvedValue([fakeOption]);
        const res = await handleFetch(req(`/pools/${POOL_ADDR}/options`), mockEnv);
        expect(res.status).toBe(200);
        const body = await res.json() as OptionRow[];
        expect(body).toHaveLength(1);
    });

    it('delegates to getOptionsByWriter when ?writer= is set', async () => {
        mockGetOptionsByWriter.mockResolvedValue([fakeOption]);
        const res = await handleFetch(req(`/pools/${POOL_ADDR}/options?writer=0xwriter`), mockEnv);
        expect(res.status).toBe(200);
        expect(mockGetOptionsByWriter).toHaveBeenCalledWith(mockDb, POOL_ADDR, '0xwriter');
        expect(mockGetOptionsByPool).not.toHaveBeenCalled();
    });

    it('delegates to getOptionsByBuyer when ?buyer= is set', async () => {
        mockGetOptionsByBuyer.mockResolvedValue([fakeOption]);
        await handleFetch(req(`/pools/${POOL_ADDR}/options?buyer=0xbuyer`), mockEnv);
        expect(mockGetOptionsByBuyer).toHaveBeenCalledWith(mockDb, POOL_ADDR, '0xbuyer');
    });

    it('passes status filter to getOptionsByPool', async () => {
        mockGetOptionsByPool.mockResolvedValue([]);
        await handleFetch(req(`/pools/${POOL_ADDR}/options?status=1`), mockEnv);
        expect(mockGetOptionsByPool).toHaveBeenCalledWith(
            mockDb, POOL_ADDR, expect.objectContaining({ status: 1 }),
        );
    });

    it('passes pagination (page + limit) to getOptionsByPool', async () => {
        mockGetOptionsByPool.mockResolvedValue([]);
        await handleFetch(req(`/pools/${POOL_ADDR}/options?page=2&limit=10`), mockEnv);
        expect(mockGetOptionsByPool).toHaveBeenCalledWith(
            mockDb, POOL_ADDR, expect.objectContaining({ limit: 10, offset: 20 }),
        );
    });

    it('clamps limit to max 200', async () => {
        mockGetOptionsByPool.mockResolvedValue([]);
        await handleFetch(req(`/pools/${POOL_ADDR}/options?limit=999`), mockEnv);
        expect(mockGetOptionsByPool).toHaveBeenCalledWith(
            mockDb, POOL_ADDR, expect.objectContaining({ limit: 200 }),
        );
    });
});

// ---------------------------------------------------------------------------
describe('GET /pools/:addr/options/:id', () => {
    it('returns 200 with option when found', async () => {
        mockGetOption.mockResolvedValue(fakeOption);
        const res = await handleFetch(req(`/pools/${POOL_ADDR}/options/1`), mockEnv);
        expect(res.status).toBe(200);
    });

    it('returns 404 when option not found', async () => {
        mockGetOption.mockResolvedValue(null);
        const res = await handleFetch(req(`/pools/${POOL_ADDR}/options/999`), mockEnv);
        expect(res.status).toBe(404);
    });

    it('returns 404 for non-numeric option ID (no route match)', async () => {
        // Router regex is /options\/(\d+)$/ — non-numeric path falls through to 404
        const res = await handleFetch(req(`/pools/${POOL_ADDR}/options/abc`), mockEnv);
        expect(res.status).toBe(404);
    });
});

// ---------------------------------------------------------------------------
describe('GET /user/:addr/options', () => {
    it('returns options where user is writer or buyer', async () => {
        mockGetOptionsByUser.mockResolvedValue([fakeOption]);
        const res = await handleFetch(req('/user/0xuser/options'), mockEnv);
        expect(res.status).toBe(200);
        expect(mockGetOptionsByUser).toHaveBeenCalledWith(mockDb, '0xuser');
    });
});

// ---------------------------------------------------------------------------
describe('Routing edge cases', () => {
    it('returns 404 for unknown path', async () => {
        const res = await handleFetch(req('/unknown'), mockEnv);
        expect(res.status).toBe(404);
    });

    it('returns 405 for non-GET methods', async () => {
        const res = await handleFetch(req('/health', { method: 'POST' }), mockEnv);
        expect(res.status).toBe(405);
    });

    it('strips trailing slash from path', async () => {
        mockGetAllPools.mockResolvedValue([]);
        const res = await handleFetch(req('/pools/'), mockEnv);
        expect(res.status).toBe(200);  // matches /pools (not /unknown)
    });
});

// ---------------------------------------------------------------------------
describe('CORS', () => {
    const ALLOWED_ORIGINS = [
        'https://frogop.net',
        'https://app.pages.dev',
        'https://feature-branch.pages.dev',
    ];

    for (const origin of ALLOWED_ORIGINS) {
        it(`OPTIONS preflight from ${origin} → 204 + CORS headers`, async () => {
            const res = await handleFetch(req('/health', { method: 'OPTIONS', origin }), mockEnv);
            expect(res.status).toBe(204);
            expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
        });

        it(`GET from ${origin} → CORS header present`, async () => {
            mockGetLastIndexedBlock.mockResolvedValue(0);
            const res = await handleFetch(req('/health', { origin }), mockEnv);
            expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
        });
    }

    it('OPTIONS preflight from unknown origin → 403', async () => {
        const res = await handleFetch(
            req('/health', { method: 'OPTIONS', origin: 'https://evil.com' }), mockEnv,
        );
        expect(res.status).toBe(403);
    });

    it('GET from unknown origin → no CORS header', async () => {
        mockGetLastIndexedBlock.mockResolvedValue(0);
        const res = await handleFetch(
            req('/health', { origin: 'https://evil.com' }), mockEnv,
        );
        expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('GET with no Origin → no CORS header', async () => {
        mockGetLastIndexedBlock.mockResolvedValue(0);
        const res = await handleFetch(req('/health'), mockEnv);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
});
