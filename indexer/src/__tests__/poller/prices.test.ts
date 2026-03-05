/**
 * Price polling tests — tests pollPrices and encodeGetQuoteCalldata directly.
 *
 * Uses real MockD1Database for DB assertions. Mocks opnet for CallResult
 * so that instanceof checks pass.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockD1Database } from '../helpers/mockD1.js';

// Mock opnet with a real CallResult class that has a .result BinaryReader
vi.mock('opnet', () => {
    class MockCallResult {
        result: { readU256: () => bigint } | null;
        constructor(price: bigint | null) {
            this.result = price !== null ? { readU256: () => price } : null;
        }
    }
    return {
        JSONRpcProvider: vi.fn(),
        CallResult: MockCallResult,
    };
});

import { pollPrices, encodeGetQuoteCalldata } from '../../poller/index.js';
import type { SwapConfig } from '../../poller/index.js';
import { CallResult } from 'opnet';
import type { PriceSnapshotRow } from '../../types/index.js';

let db: MockD1Database;

function makeSwapConfig(overrides: Partial<SwapConfig> = {}): SwapConfig {
    const tokenMap = new Map<string, string>();
    tokenMap.set('0xmoto_hex', 'MOTO');
    tokenMap.set('0xpill_hex', 'PILL');
    return {
        routerHex: '0xrouter',
        tokenMap,
        ...overrides,
    };
}

function makeEnv(dbOverride?: D1Database) {
    return {
        DB: (dbOverride ?? db) as unknown as D1Database,
        OPNET_NETWORK: 'opnetTestnet',
        OPNET_RPC_URL: 'https://testnet.opnet.org',
        POOL_ADDRESSES: '',
        FACTORY_ADDRESS: '',
        MAX_BLOCKS_PER_RUN: '20',
        NATIVESWAP_CONTRACT: '',
        NATIVESWAP_TOKEN_ADDRESSES: '',
        NATIVESWAP_LABELS: '',
    };
}

function makeCallResult(price: bigint): unknown {
    return new (CallResult as unknown as new (p: bigint) => unknown)(price);
}

function makeNullCallResult(): unknown {
    return new (CallResult as unknown as new (p: null) => unknown)(null);
}

beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    db = await MockD1Database.create();
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
describe('encodeGetQuoteCalldata', () => {
    it('encodes selector + address + sats correctly', () => {
        const result = encodeGetQuoteCalldata('0xabcdef', 100_000n);
        // Selector: 51852102 = encodeSelector('getQuote(address,uint64)')
        expect(result).toMatch(/^0x51852102/);
        // Address should be left-padded to 64 hex chars (32 bytes)
        expect(result.length).toBe(2 + 8 + 64 + 16); // 0x + selector + addr + sats
    });

    it('strips 0x prefix from token address', () => {
        const with0x = encodeGetQuoteCalldata('0xabcd', 100_000n);
        const without = encodeGetQuoteCalldata('abcd', 100_000n);
        expect(with0x).toBe(without);
    });

    it('encodes 100k sats in big-endian hex', () => {
        const result = encodeGetQuoteCalldata('0x01', 100_000n);
        // 100_000 = 0x186A0, padded to 16 chars = 00000000000186a0
        expect(result).toMatch(/00000000000186a0$/);
    });

    it('uses the correct NativeSwap selector from ABICoder (regression)', async () => {
        // OPNet selector = first 4 bytes of SHA-256(methodSignature) as hex.
        // Compute independently to verify the hardcoded selector.
        // This would have caught the original bug: using 'getQuote' instead
        // of the full signature 'getQuote(address,uint64)'.
        const { createHash } = await import('node:crypto');
        const hash = createHash('sha256').update('getQuote(address,uint64)').digest();
        const expected = hash.subarray(0, 4).toString('hex');

        const result = encodeGetQuoteCalldata('0x01', 1n);
        const actualSelector = result.slice(2, 10);
        expect(actualSelector).toBe(expected);
    });
});

// ---------------------------------------------------------------------------
describe('pollPrices — successful getQuote', () => {
    it('saves price snapshot for each token', async () => {
        const env = makeEnv();
        const provider = {
            call: vi.fn().mockResolvedValue(makeCallResult(5_000_000_000n)),
        };
        const config = makeSwapConfig();

        await pollPrices(env, provider as never, config, 1000);

        const snapshots = db.queryAll<PriceSnapshotRow>('SELECT * FROM price_snapshots');
        // 2 tokens + 1 token cross-rate + 2 BTC cross-rates = 5 snapshots
        expect(snapshots.length).toBe(5);

        const moto = snapshots.find(s => s.token === 'MOTO');
        expect(moto).toBeTruthy();
        expect(moto!.price).toBe('5000000000');
        expect(moto!.block_number).toBe(1000);

        const pill = snapshots.find(s => s.token === 'PILL');
        expect(pill).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
describe('pollPrices — failed getQuote', () => {
    it('skips gracefully when getQuote throws', async () => {
        const env = makeEnv();
        const provider = {
            call: vi.fn().mockRejectedValue(new Error('RPC error')),
        };

        await expect(
            pollPrices(env, provider as never, makeSwapConfig(), 1000),
        ).resolves.not.toThrow();

        const snapshots = db.queryAll('SELECT * FROM price_snapshots');
        expect(snapshots.length).toBe(0);
    });

    it('skips when result is not a CallResult instance', async () => {
        const env = makeEnv();
        const provider = {
            call: vi.fn().mockResolvedValue('not a CallResult'),
        };

        await pollPrices(env, provider as never, makeSwapConfig(), 1000);

        const snapshots = db.queryAll('SELECT * FROM price_snapshots');
        expect(snapshots.length).toBe(0);
    });

    it('skips when result is null', async () => {
        const env = makeEnv();
        const provider = {
            call: vi.fn().mockResolvedValue(null),
        };

        await pollPrices(env, provider as never, makeSwapConfig(), 1000);

        const snapshots = db.queryAll('SELECT * FROM price_snapshots');
        expect(snapshots.length).toBe(0);
    });

    it('skips when CallResult.result is null', async () => {
        const env = makeEnv();
        const provider = {
            call: vi.fn().mockResolvedValue(makeNullCallResult()),
        };

        await pollPrices(env, provider as never, makeSwapConfig(), 1000);

        const snapshots = db.queryAll('SELECT * FROM price_snapshots');
        expect(snapshots.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
describe('pollPrices — MOTO_PILL cross-rate', () => {
    it('computes cross-rate as pillTokens * 1e18 / motoTokens', async () => {
        const env = makeEnv();
        const motoPrice = 2_000_000n;
        const pillPrice = 8_000_000n;
        const provider = {
            call: vi.fn()
                .mockResolvedValueOnce(makeCallResult(motoPrice))  // MOTO
                .mockResolvedValueOnce(makeCallResult(pillPrice)), // PILL
        };

        await pollPrices(env, provider as never, makeSwapConfig(), 1000);

        const crossSnap = db.queryFirst<PriceSnapshotRow>(
            "SELECT * FROM price_snapshots WHERE token = 'MOTO_PILL'",
        );
        expect(crossSnap).toBeTruthy();
        const expected = (pillPrice * (10n ** 18n)) / motoPrice;
        expect(crossSnap!.price).toBe(expected.toString());
    });

    it('skips cross-rate when one leg fails', async () => {
        const env = makeEnv();
        const provider = {
            call: vi.fn()
                .mockResolvedValueOnce(makeCallResult(2_000_000n))  // MOTO OK
                .mockRejectedValueOnce(new Error('PILL failed')),   // PILL fails
        };

        await pollPrices(env, provider as never, makeSwapConfig(), 1000);

        const crossSnap = db.queryFirst<PriceSnapshotRow>(
            "SELECT * FROM price_snapshots WHERE token = 'MOTO_PILL'",
        );
        expect(crossSnap).toBeNull();
    });

    it('guards against division by zero when MOTO price is 0', async () => {
        const env = makeEnv();
        const provider = {
            call: vi.fn()
                .mockResolvedValueOnce(makeCallResult(0n))          // MOTO = 0
                .mockResolvedValueOnce(makeCallResult(8_000_000n)), // PILL OK
        };

        await pollPrices(env, provider as never, makeSwapConfig(), 1000);

        const crossSnap = db.queryFirst<PriceSnapshotRow>(
            "SELECT * FROM price_snapshots WHERE token = 'MOTO_PILL'",
        );
        // motoTokens = 0 → skip cross-rate (guard: if motoTokens > 0n)
        expect(crossSnap).toBeNull();
    });
});

// ---------------------------------------------------------------------------
describe('pollPrices — no-op when swapConfig is null', () => {
    it('does nothing when swapConfig is null', async () => {
        const env = makeEnv();
        const provider = { call: vi.fn() };

        await pollPrices(env, provider as never, null, 1000);

        expect(provider.call).not.toHaveBeenCalled();
        const snapshots = db.queryAll('SELECT * FROM price_snapshots');
        expect(snapshots.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
describe('pollPrices — single token config', () => {
    it('works with only one token (no cross-rate)', async () => {
        const env = makeEnv();
        const provider = {
            call: vi.fn().mockResolvedValue(makeCallResult(1_000_000n)),
        };
        const config = makeSwapConfig({
            tokenMap: new Map([['0xmoto_hex', 'MOTO']]),
        });

        await pollPrices(env, provider as never, config, 1000);

        const snapshots = db.queryAll<PriceSnapshotRow>('SELECT * FROM price_snapshots');
        // MOTO + MOTO_BTC (no token cross-rate since only 1 token)
        expect(snapshots.length).toBe(2);
        expect(snapshots.find(s => s.token === 'MOTO')).toBeTruthy();
        expect(snapshots.find(s => s.token === 'MOTO_BTC')).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
describe('pollPrices — BTC cross-rates', () => {
    it('computes satsPerToken = (100_000 * 1e18) / tokensPerQuote for each token', async () => {
        const env = makeEnv();
        const motoTokensPerQuote = 2_000_000_000_000_000_000n; // 2e18
        const pillTokensPerQuote = 8_000_000_000_000_000_000n; // 8e18
        const provider = {
            call: vi.fn()
                .mockResolvedValueOnce(makeCallResult(motoTokensPerQuote))
                .mockResolvedValueOnce(makeCallResult(pillTokensPerQuote)),
        };

        await pollPrices(env, provider as never, makeSwapConfig(), 1000);

        const motoBtc = db.queryFirst<PriceSnapshotRow>(
            "SELECT * FROM price_snapshots WHERE token = 'MOTO_BTC'",
        );
        expect(motoBtc).toBeTruthy();
        const precision = 10n ** 18n;
        const expectedMoto = (100_000n * precision) / motoTokensPerQuote;
        expect(motoBtc!.price).toBe(expectedMoto.toString());

        const pillBtc = db.queryFirst<PriceSnapshotRow>(
            "SELECT * FROM price_snapshots WHERE token = 'PILL_BTC'",
        );
        expect(pillBtc).toBeTruthy();
        const expectedPill = (100_000n * precision) / pillTokensPerQuote;
        expect(pillBtc!.price).toBe(expectedPill.toString());
    });

    it('skips BTC cross-rate when tokensPerQuote is 0 (div-by-zero guard)', async () => {
        const env = makeEnv();
        const provider = {
            call: vi.fn()
                .mockResolvedValueOnce(makeCallResult(0n))            // MOTO = 0
                .mockResolvedValueOnce(makeCallResult(8_000_000n)),   // PILL OK
        };

        await pollPrices(env, provider as never, makeSwapConfig(), 1000);

        const motoBtc = db.queryFirst<PriceSnapshotRow>(
            "SELECT * FROM price_snapshots WHERE token = 'MOTO_BTC'",
        );
        // tokensPerQuote = 0 → skip (guard: if tokensPerQuote > 0n)
        expect(motoBtc).toBeNull();

        // PILL_BTC should still be present
        const pillBtc = db.queryFirst<PriceSnapshotRow>(
            "SELECT * FROM price_snapshots WHERE token = 'PILL_BTC'",
        );
        expect(pillBtc).toBeTruthy();
    });

    it('handles partial failure — BTC rate only for successful tokens', async () => {
        const env = makeEnv();
        const provider = {
            call: vi.fn()
                .mockResolvedValueOnce(makeCallResult(5_000_000n))
                .mockRejectedValueOnce(new Error('PILL RPC error')),
        };

        await pollPrices(env, provider as never, makeSwapConfig(), 1000);

        // MOTO_BTC should exist
        const motoBtc = db.queryFirst<PriceSnapshotRow>(
            "SELECT * FROM price_snapshots WHERE token = 'MOTO_BTC'",
        );
        expect(motoBtc).toBeTruthy();

        // PILL_BTC should NOT exist (PILL quote failed)
        const pillBtc = db.queryFirst<PriceSnapshotRow>(
            "SELECT * FROM price_snapshots WHERE token = 'PILL_BTC'",
        );
        expect(pillBtc).toBeNull();
    });
});
