/**
 * Subrequest budget tests — ensures the poller stays under
 * Cloudflare's free-tier limit of 50 subrequests per invocation.
 *
 * This test would have prevented the production outage where
 * per-block db.batch() calls exceeded the limit.
 *
 * Uses: real MockD1Database + real decoder + real db/queries + mocked RPC.
 * The SubrequestCounter wraps both DB and provider to count every operation.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockD1Database } from '../helpers/mockD1.js';
import { SubrequestCounter } from '../helpers/subrequestCounter.js';
import {
    buildOptionWrittenBlock,
    buildSwapExecutedBlock,
    buildEmptyBlock,
    DEFAULT_POOL,
    DEFAULT_ROUTER,
} from '../helpers/blockFixtures.js';

// Mock only the opnet module (RPC provider) — decoder and queries run for real.
vi.mock('opnet', () => ({
    JSONRpcProvider: vi.fn(),
    CallResult: class MockCallResult {
        result: { readU256: () => bigint };
        constructor(price: bigint) {
            this.result = { readU256: () => price };
        }
    },
}));

import { pollNewBlocks } from '../../poller/index.js';
import { JSONRpcProvider, CallResult } from 'opnet';
import type { Env } from '../../types/index.js';

const MockJSONRpcProvider = vi.mocked(JSONRpcProvider);

let db: MockD1Database;
let counter: SubrequestCounter;
interface MockProvider {
    getBlockNumber: ReturnType<typeof vi.fn>;
    getBlock: ReturnType<typeof vi.fn>;
    getPublicKeyInfo: ReturnType<typeof vi.fn>;
    call: ReturnType<typeof vi.fn>;
}
let mockProvider: MockProvider;
let wrappedProvider: MockProvider;
const FREE_TIER_LIMIT = 50;

function makeEnv(overrides: Partial<Env> = {}): Env {
    return {
        DB: db as unknown as D1Database,
        OPNET_NETWORK: 'opnetTestnet',
        OPNET_RPC_URL: 'https://testnet.opnet.org',
        POOL_ADDRESSES: 'opt1pool1',
        FACTORY_ADDRESS: '',
        MAX_BLOCKS_PER_RUN: '20',
        NATIVESWAP_CONTRACT: '0xrouter',
        NATIVESWAP_TOKEN_ADDRESSES: '0xmoto 0xpill',
        NATIVESWAP_LABELS: 'MOTO,PILL',
        ...overrides,
    };
}

beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    db = await MockD1Database.create();
    counter = new SubrequestCounter();
    counter.wrapDb(db);

    mockProvider = {
        getBlockNumber:   vi.fn(),
        getBlock:         vi.fn(),
        getPublicKeyInfo: vi.fn(),
        call:             vi.fn(),
    };

    mockProvider.getPublicKeyInfo.mockResolvedValue({
        toString: () => DEFAULT_POOL,
    });

    // Proxy wraps the provider — mock methods stay accessible on mockProvider
    wrappedProvider = counter.wrapProvider(mockProvider as unknown as Record<string, unknown>) as unknown as MockProvider;
    MockJSONRpcProvider.mockImplementation(() => wrappedProvider as never);
});

afterEach(() => {
    vi.restoreAllMocks();
});

/** Seed cursor in DB so poller starts from `lastBlock` */
function seedCursor(lastBlock: number): void {
    db.queryAll(
        "INSERT OR REPLACE INTO indexer_state (key, value) VALUES ('last_indexed_block', ?)",
        String(lastBlock),
    );
}

/** Create a mock CallResult that passes instanceof check */
function makeCallResult(price: bigint): unknown {
    return new (CallResult as unknown as new (p: bigint) => unknown)(price);
}

// ---------------------------------------------------------------------------
describe('Subrequest budget — caught up, 1 block', () => {
    it('stays under 50 subrequests when processing 1 block near tip', async () => {
        const tip = 1000;
        seedCursor(tip - 1);
        mockProvider.getBlockNumber.mockResolvedValue(tip);
        mockProvider.getBlock.mockResolvedValue(
            buildOptionWrittenBlock(tip, DEFAULT_POOL),
        );
        mockProvider.call.mockResolvedValue(makeCallResult(1_000_000n));

        await pollNewBlocks(makeEnv());

        expect(counter.count).toBeLessThanOrEqual(FREE_TIER_LIMIT);
        // Sanity: should have actually done meaningful work
        expect(counter.count).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
describe('Subrequest budget — catch-up, 20 blocks', () => {
    it('stays under 50 subrequests when processing 12 blocks caught-up (with 5-token rollup)', async () => {
        // With 5 candle tokens (MOTO, PILL, MOTO_PILL, MOTO_BTC, PILL_BTC), rollup uses
        // 5×4=20 snapshot queries + 2×4=8 swap queries = 28 subrequests for candles alone.
        // 12 caught-up blocks + rollup + prices fits under 50.
        const tip = 1000;
        seedCursor(tip - 12);
        mockProvider.getBlockNumber.mockResolvedValue(tip);

        for (let n = tip - 11; n <= tip; n++) {
            mockProvider.getBlock.mockResolvedValueOnce(
                buildOptionWrittenBlock(n, DEFAULT_POOL),
            );
        }
        mockProvider.call.mockResolvedValue(makeCallResult(1_000_000n));

        await pollNewBlocks(makeEnv());

        expect(counter.count).toBeLessThanOrEqual(FREE_TIER_LIMIT);
    });

    it('skips candle rollup during catch-up (saves ~20 subrequests)', async () => {
        const tip = 1050;
        // behind by 21 blocks: to = 1029+20 = 1049 < 1050, so catching_up = true
        seedCursor(tip - 21);
        mockProvider.getBlockNumber.mockResolvedValue(tip);
        mockProvider.getBlock.mockResolvedValue(buildEmptyBlock());
        mockProvider.call.mockResolvedValue(makeCallResult(1_000_000n));

        await pollNewBlocks(makeEnv());

        // During catch-up, rollUpAllCandles is skipped (no getSnapshotsInRange calls)
        const allCalls = counter.calls.filter(c => c.label === 'd1.all');
        // Candle rollup does 5 tokens × 4 intervals = 20+ d1.all calls
        // When skipped, should have 0 d1.all calls
        expect(allCalls.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
describe('Subrequest budget — multiple pool addresses', () => {
    it('resolving multiple pools adds RPC calls but stays under limit', async () => {
        const tip = 1000;
        seedCursor(tip - 1);
        mockProvider.getBlockNumber.mockResolvedValue(tip);
        mockProvider.getBlock.mockResolvedValue(buildEmptyBlock());
        mockProvider.getPublicKeyInfo.mockResolvedValue({ toString: () => DEFAULT_POOL });
        mockProvider.call.mockResolvedValue(makeCallResult(1_000_000n));

        await pollNewBlocks(makeEnv({
            POOL_ADDRESSES: 'opt1pool1 opt1pool2 opt1pool3',
        }));

        // 3 pool resolves = 3 getPublicKeyInfo calls
        const pubKeyCalls = counter.calls.filter(c => c.label === 'rpc.getPublicKeyInfo');
        expect(pubKeyCalls.length).toBe(3);
        expect(counter.count).toBeLessThanOrEqual(FREE_TIER_LIMIT);
    });
});

// ---------------------------------------------------------------------------
describe('Subrequest budget — regression guard', () => {
    it('30 blocks during catch-up stays under limit (candle rollup skipped)', async () => {
        // When catching up (to < tip), candle rollup is skipped → 30 blocks fits.
        const tip = 1100;
        seedCursor(tip - 30); // to = 1070 + 30 = 1100... actually need to be behind
        // With MAX_BLOCKS_PER_RUN=30: to = lastIndexed + 30 = 1070 + 30 = 1100 = tip → caught up
        // So use tip - 31 to ensure catching_up = true
        seedCursor(tip - 31);
        mockProvider.getBlockNumber.mockResolvedValue(tip);
        mockProvider.getBlock.mockResolvedValue(buildEmptyBlock());
        mockProvider.call.mockResolvedValue(makeCallResult(1_000_000n));

        await pollNewBlocks(makeEnv({ MAX_BLOCKS_PER_RUN: '30' }));

        // With batched writes + catch-up (no candle rollup), 30 blocks fits:
        // 1 (cursor read) + 1 (getBlockNumber) + 1 (getPublicKeyInfo) +
        // 30 (getBlock) + 1 (batch write) + 2 (rpc.call for prices) +
        // 1 (batch prices) = ~37 subrequests
        expect(counter.count).toBeLessThanOrEqual(FREE_TIER_LIMIT);
    });

    it('30 blocks when caught up exceeds limit (candle rollup runs)', async () => {
        // When caught up (to == tip), candle rollup runs → 30+ blocks + rollup > 50.
        // This documents the constraint: don't raise MAX_BLOCKS_PER_RUN too high.
        const tip = 1000;
        seedCursor(tip - 30); // to = 970+30 = 1000 = tip → caught up, rollup runs
        mockProvider.getBlockNumber.mockResolvedValue(tip);
        mockProvider.getBlock.mockResolvedValue(buildEmptyBlock());
        mockProvider.call.mockResolvedValue(makeCallResult(1_000_000n));

        await pollNewBlocks(makeEnv({ MAX_BLOCKS_PER_RUN: '30' }));

        // 30 getBlock + candle rollup (5×4 intervals × d1.all queries) → exceeds 50
        expect(counter.count).toBeGreaterThan(FREE_TIER_LIMIT);
    });

    it('logs subrequest breakdown for debugging', async () => {
        const tip = 1000;
        seedCursor(tip - 1);
        mockProvider.getBlockNumber.mockResolvedValue(tip);
        mockProvider.getBlock.mockResolvedValue(buildEmptyBlock());
        mockProvider.call.mockResolvedValue(makeCallResult(1_000_000n));

        await pollNewBlocks(makeEnv());

        // Verify we can inspect the breakdown
        const breakdown: Record<string, number> = {};
        for (const c of counter.calls) {
            breakdown[c.label] = (breakdown[c.label] ?? 0) + 1;
        }

        // Basic sanity: at least these categories should be present
        expect(breakdown['d1.first']).toBeGreaterThanOrEqual(1); // cursor read
        expect(breakdown['rpc.getBlockNumber']).toBe(1);
        expect(breakdown['rpc.getPublicKeyInfo']).toBe(1);
        expect(breakdown['rpc.getBlock']).toBe(1);
    });
});

// ---------------------------------------------------------------------------
describe('Subrequest budget — swap events in blocks', () => {
    it('stays under limit with blocks containing swap events', async () => {
        const tip = 1000;
        seedCursor(tip - 5);
        mockProvider.getBlockNumber.mockResolvedValue(tip);

        // Mix of swap and option events
        for (let n = tip - 4; n <= tip; n++) {
            if (n % 2 === 0) {
                mockProvider.getBlock.mockResolvedValueOnce(
                    buildSwapExecutedBlock(n, DEFAULT_ROUTER),
                );
            } else {
                mockProvider.getBlock.mockResolvedValueOnce(
                    buildOptionWrittenBlock(n, DEFAULT_POOL),
                );
            }
        }
        mockProvider.call.mockResolvedValue(makeCallResult(1_000_000n));

        await pollNewBlocks(makeEnv());
        expect(counter.count).toBeLessThanOrEqual(FREE_TIER_LIMIT);
    });
});
