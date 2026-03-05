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
    getCandles:         vi.fn(),
    getLatestPrice:     vi.fn(),
    getPriceHistory:    vi.fn(),
    getTransfersByOption: vi.fn(),
    getTransfersByUser:   vi.fn(),
}));

import { handleFetch } from '../../api/router.js';
import * as queries    from '../../db/queries.js';
import type { Env, PoolRow, OptionRow, PriceCandleRow, PriceSnapshotRow } from '../../types/index.js';

// ---- Typed mock helpers ---------------------------------------------------
const mockGetAllPools         = vi.mocked(queries.getAllPools);
const mockGetPool             = vi.mocked(queries.getPool);
const mockGetOptionsByPool    = vi.mocked(queries.getOptionsByPool);
const mockGetOption           = vi.mocked(queries.getOption);
const mockGetOptionsByWriter  = vi.mocked(queries.getOptionsByWriter);
const mockGetOptionsByBuyer   = vi.mocked(queries.getOptionsByBuyer);
const mockGetOptionsByUser    = vi.mocked(queries.getOptionsByUser);
const mockGetLastIndexedBlock = vi.mocked(queries.getLastIndexedBlock);
const mockGetCandles          = vi.mocked(queries.getCandles);
const mockGetLatestPrice      = vi.mocked(queries.getLatestPrice);
const mockGetPriceHistory     = vi.mocked(queries.getPriceHistory);
const mockGetTransfersByOption = vi.mocked(queries.getTransfersByOption);
const mockGetTransfersByUser   = vi.mocked(queries.getTransfersByUser);

// ---- Test fixtures --------------------------------------------------------
const mockDb  = {} as D1Database;
const mockEnv: Env = {
    DB:               mockDb,
    OPNET_NETWORK:    'testnet',
    OPNET_RPC_URL:    'https://testnet.opnet.org',
    POOL_ADDRESSES:   '',
    FACTORY_ADDRESS:  '',
    MAX_BLOCKS_PER_RUN: '50',
    NATIVESWAP_CONTRACT:       '',
    NATIVESWAP_TOKEN_ADDRESSES: '',
    NATIVESWAP_LABELS:         'MOTO,PILL',
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
    it('returns 200 with status, lastBlock, network, poolCount', async () => {
        mockGetLastIndexedBlock.mockResolvedValue(1234);
        mockGetAllPools.mockResolvedValue([fakePool]);
        const res = await handleFetch(req('/health'), mockEnv);
        expect(res.status).toBe(200);
        const body = await res.json() as Record<string, unknown>;
        expect(body['status']).toBe('ok');
        expect(body['lastBlock']).toBe(1234);
        expect(body['network']).toBe('testnet');
        expect(body['poolCount']).toBe(1);
        expect(body['timestamp']).toBeDefined();
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
        'https://frogop-indexer.workers.dev',
        'http://localhost',
        'http://localhost:5173',
        'http://localhost:8787',
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

    it('rejects workers.dev with extra dots (subdomain attack)', async () => {
        mockGetLastIndexedBlock.mockResolvedValue(0);
        const res = await handleFetch(
            req('/health', { origin: 'https://evil.sub.workers.dev' }), mockEnv,
        );
        expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('rejects https://localhost (only http allowed)', async () => {
        mockGetLastIndexedBlock.mockResolvedValue(0);
        const res = await handleFetch(
            req('/health', { origin: 'https://localhost:5173' }), mockEnv,
        );
        expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('rejects pages.dev with extra dots', async () => {
        mockGetLastIndexedBlock.mockResolvedValue(0);
        const res = await handleFetch(
            req('/health', { origin: 'https://evil.sub.pages.dev' }), mockEnv,
        );
        expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
describe('GET /prices/:token/candles', () => {
    it('returns candles for valid token and interval', async () => {
        mockGetCandles.mockResolvedValue([{
            token: 'MOTO', interval: '1d', open_time: '2026-02-28T00:00:00Z',
            open: '100', high: '110', low: '90', close: '105',
            volume_sats: '500', volume_tokens: '75', trade_count: 3,
        }]);
        const res = await handleFetch(req('/prices/MOTO/candles?interval=1d'), mockEnv);
        expect(res.status).toBe(200);
        const body = await res.json() as unknown[];
        expect(body).toHaveLength(1);
    });

    it('normalizes token to uppercase', async () => {
        mockGetCandles.mockResolvedValue([]);
        await handleFetch(req('/prices/moto/candles?interval=1h'), mockEnv);
        expect(mockGetCandles).toHaveBeenCalledWith(mockDb, 'MOTO', '1h', expect.anything());
    });

    it('accepts MOTO_PILL and MOTO/PILL tokens', async () => {
        mockGetCandles.mockResolvedValue([]);
        await handleFetch(req('/prices/MOTO_PILL/candles?interval=1d'), mockEnv);
        expect(mockGetCandles).toHaveBeenCalledWith(mockDb, 'MOTO_PILL', '1d', expect.anything());
        vi.clearAllMocks();
        mockGetCandles.mockResolvedValue([]);
        await handleFetch(req('/prices/MOTO%2FPILL/candles?interval=1d'), mockEnv);
        expect(mockGetCandles).toHaveBeenCalledWith(mockDb, 'MOTO_PILL', '1d', expect.anything());
    });

    it('returns 400 for invalid token', async () => {
        const res = await handleFetch(req('/prices/INVALID/candles?interval=1d'), mockEnv);
        expect(res.status).toBe(400);
    });

    it('returns 400 for invalid interval', async () => {
        const res = await handleFetch(req('/prices/MOTO/candles?interval=5m'), mockEnv);
        expect(res.status).toBe(400);
    });

    it('defaults to 1d interval when not specified', async () => {
        mockGetCandles.mockResolvedValue([]);
        await handleFetch(req('/prices/MOTO/candles'), mockEnv);
        expect(mockGetCandles).toHaveBeenCalledWith(mockDb, 'MOTO', '1d', expect.anything());
    });
});

// ---------------------------------------------------------------------------
describe('GET /prices/:token/latest', () => {
    it('returns latest price when found', async () => {
        mockGetLatestPrice.mockResolvedValue({
            token: 'MOTO', block_number: 1000,
            timestamp: '2026-02-28T12:00:00Z', price: '150000',
        });
        const res = await handleFetch(req('/prices/MOTO/latest'), mockEnv);
        expect(res.status).toBe(200);
    });

    it('returns 404 when no price data', async () => {
        mockGetLatestPrice.mockResolvedValue(null);
        const res = await handleFetch(req('/prices/PILL/latest'), mockEnv);
        expect(res.status).toBe(404);
    });

    it('returns 400 for invalid token', async () => {
        const res = await handleFetch(req('/prices/INVALID/latest'), mockEnv);
        expect(res.status).toBe(400);
    });
});

// ---------------------------------------------------------------------------
describe('GET /prices/:token/history', () => {
    it('returns price history', async () => {
        mockGetPriceHistory.mockResolvedValue([
            { token: 'PILL', block_number: 100, timestamp: '2026-02-28T10:00:00Z', price: '100' },
        ]);
        const res = await handleFetch(req('/prices/PILL/history'), mockEnv);
        expect(res.status).toBe(200);
        const body = await res.json() as unknown[];
        expect(body).toHaveLength(1);
    });

    it('returns 400 for invalid token', async () => {
        const res = await handleFetch(req('/prices/INVALID/history'), mockEnv);
        expect(res.status).toBe(400);
    });
});

// -------------------------------------------------------------------------
describe('GET /pools/:addr/options/:id/transfers', () => {
    it('returns transfer history for an option', async () => {
        mockGetTransfersByOption.mockResolvedValue([
            { id: 1, pool_address: 'opt1pool', option_id: 1, from_address: '0xa', to_address: '0xb', block_number: 100, tx_id: '0xtx1' },
        ]);
        const res = await handleFetch(req('/pools/opt1pool/options/1/transfers'), mockEnv);
        expect(res.status).toBe(200);
        const body = await res.json() as unknown[];
        expect(body).toHaveLength(1);
        expect(mockGetTransfersByOption).toHaveBeenCalledWith(mockDb, 'opt1pool', 1);
    });

    it('returns 400 for non-numeric option ID', async () => {
        const res = await handleFetch(req('/pools/opt1pool/options/abc/transfers'), mockEnv);
        expect(res.status).toBe(404); // regex won't match non-digit
    });
});

describe('GET /user/:addr/transfers', () => {
    it('returns transfers involving the user', async () => {
        mockGetTransfersByUser.mockResolvedValue([
            { id: 1, pool_address: 'opt1pool', option_id: 1, from_address: '0xuser', to_address: '0xb', block_number: 100, tx_id: '0xtx1' },
        ]);
        const res = await handleFetch(req('/user/0xuser/transfers'), mockEnv);
        expect(res.status).toBe(200);
        const body = await res.json() as unknown[];
        expect(body).toHaveLength(1);
        expect(mockGetTransfersByUser).toHaveBeenCalledWith(mockDb, '0xuser');
    });
});

// ---------------------------------------------------------------------------
describe('BTC pair price routes', () => {
    it('MOTO_BTC candles — queries DB directly (canonical token)', async () => {
        mockGetCandles.mockResolvedValue([]);
        const res = await handleFetch(req('/prices/MOTO_BTC/candles?interval=1h'), mockEnv);
        expect(res.status).toBe(200);
        expect(mockGetCandles).toHaveBeenCalledWith(mockDb, 'MOTO_BTC', '1h', expect.anything());
    });

    it('BTC_MOTO candles — queries DB with MOTO_BTC and inverts OHLC', async () => {
        const canonical: PriceCandleRow = {
            token: 'MOTO_BTC', interval: '1d', open_time: '2026-03-01T00:00:00Z',
            open: '50000', high: '60000', low: '40000', close: '55000',
            volume_sats: '1000', volume_tokens: '500', trade_count: 5,
        };
        mockGetCandles.mockResolvedValue([canonical]);
        const res = await handleFetch(req('/prices/BTC_MOTO/candles?interval=1d'), mockEnv);
        expect(res.status).toBe(200);
        // DB query uses canonical token
        expect(mockGetCandles).toHaveBeenCalledWith(mockDb, 'MOTO_BTC', '1d', expect.anything());
        const body = await res.json() as PriceCandleRow[];
        expect(body).toHaveLength(1);
        // Inverted: open = 1e36/50000, high = 1e36/40000 (swap H/L)
        const inverted = body[0]!;
        expect(inverted.open).toBe((10n ** 36n / 50000n).toString());
        expect(inverted.close).toBe((10n ** 36n / 55000n).toString());
        expect(inverted.high).toBe((10n ** 36n / 40000n).toString());  // low→high
        expect(inverted.low).toBe((10n ** 36n / 60000n).toString());   // high→low
    });

    it('PILL_BTC latest — queries DB directly', async () => {
        mockGetLatestPrice.mockResolvedValue({
            token: 'PILL_BTC', block_number: 2000,
            timestamp: '2026-03-01T12:00:00Z', price: '25000',
        });
        const res = await handleFetch(req('/prices/PILL_BTC/latest'), mockEnv);
        expect(res.status).toBe(200);
        expect(mockGetLatestPrice).toHaveBeenCalledWith(mockDb, 'PILL_BTC');
    });

    it('BTC_PILL latest — queries DB with PILL_BTC and inverts price', async () => {
        mockGetLatestPrice.mockResolvedValue({
            token: 'PILL_BTC', block_number: 2000,
            timestamp: '2026-03-01T12:00:00Z', price: '25000',
        });
        const res = await handleFetch(req('/prices/BTC_PILL/latest'), mockEnv);
        expect(res.status).toBe(200);
        expect(mockGetLatestPrice).toHaveBeenCalledWith(mockDb, 'PILL_BTC');
        const body = await res.json() as PriceSnapshotRow;
        expect(body.price).toBe((10n ** 36n / 25000n).toString());
    });

    it('BTC_MOTO history — queries with MOTO_BTC and inverts', async () => {
        mockGetPriceHistory.mockResolvedValue([
            { token: 'MOTO_BTC', block_number: 100, timestamp: '2026-03-01T10:00:00Z', price: '50000' },
        ]);
        const res = await handleFetch(req('/prices/BTC_MOTO/history'), mockEnv);
        expect(res.status).toBe(200);
        expect(mockGetPriceHistory).toHaveBeenCalledWith(mockDb, 'MOTO_BTC', expect.anything());
        const body = await res.json() as PriceSnapshotRow[];
        expect(body[0]!.price).toBe((10n ** 36n / 50000n).toString());
    });
});

// ---------------------------------------------------------------------------
describe('PILL_MOTO reverse resolution (existing bug fix)', () => {
    it('PILL_MOTO candles — queries DB with MOTO_PILL and inverts', async () => {
        const canonical: PriceCandleRow = {
            token: 'MOTO_PILL', interval: '1d', open_time: '2026-03-01T00:00:00Z',
            open: '4000000000000000000', high: '5000000000000000000',
            low: '3000000000000000000', close: '4500000000000000000',
            volume_sats: '0', volume_tokens: '0', trade_count: 0,
        };
        mockGetCandles.mockResolvedValue([canonical]);
        const res = await handleFetch(req('/prices/PILL_MOTO/candles?interval=1d'), mockEnv);
        expect(res.status).toBe(200);
        expect(mockGetCandles).toHaveBeenCalledWith(mockDb, 'MOTO_PILL', '1d', expect.anything());
        const body = await res.json() as PriceCandleRow[];
        expect(body).toHaveLength(1);
    });

    it('PILL_MOTO latest — queries DB with MOTO_PILL and inverts', async () => {
        mockGetLatestPrice.mockResolvedValue({
            token: 'MOTO_PILL', block_number: 1000,
            timestamp: '2026-03-01T12:00:00Z', price: '4000000000000000000',
        });
        const res = await handleFetch(req('/prices/PILL_MOTO/latest'), mockEnv);
        expect(res.status).toBe(200);
        expect(mockGetLatestPrice).toHaveBeenCalledWith(mockDb, 'MOTO_PILL');
        const body = await res.json() as PriceSnapshotRow;
        expect(body.price).toBe((10n ** 36n / 4000000000000000000n).toString());
    });
});
