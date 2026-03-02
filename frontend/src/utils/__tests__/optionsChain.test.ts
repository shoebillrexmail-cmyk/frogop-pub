import { describe, it, expect } from 'vitest';
import {
    classifyBucket,
    buildChain,
    findAtmStrikeIndex,
    isCallItm,
    isPutItm,
} from '../optionsChain.js';
import type { ChainRow } from '../optionsChain.js';
import { OptionType, OptionStatus } from '../../services/types.js';
import type { OptionData } from '../../services/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const e18 = 10n ** 18n;

function makeOption(overrides: Partial<OptionData> = {}): OptionData {
    return {
        id: 1n,
        writer: '0x' + 'aa'.repeat(32),
        buyer: '0x' + '00'.repeat(32),
        optionType: OptionType.CALL,
        strikePrice: 100n * e18,
        underlyingAmount: 1n * e18,
        premium: 5n * e18,
        expiryBlock: 1000n,
        status: OptionStatus.OPEN,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// classifyBucket
// ---------------------------------------------------------------------------

describe('classifyBucket', () => {
    it('< 144 blocks → lt1d', () => {
        expect(classifyBucket(0n)).toBe('lt1d');
        expect(classifyBucket(100n)).toBe('lt1d');
        expect(classifyBucket(143n)).toBe('lt1d');
    });

    it('144 (boundary) → 1to7d', () => {
        expect(classifyBucket(144n)).toBe('1to7d');
    });

    it('144–1007 → 1to7d', () => {
        expect(classifyBucket(500n)).toBe('1to7d');
        expect(classifyBucket(1007n)).toBe('1to7d');
    });

    it('1008 (boundary) → 7to30d', () => {
        expect(classifyBucket(1008n)).toBe('7to30d');
    });

    it('1008–4319 → 7to30d', () => {
        expect(classifyBucket(2000n)).toBe('7to30d');
        expect(classifyBucket(4319n)).toBe('7to30d');
    });

    it('4320 (boundary) → 30dplus', () => {
        expect(classifyBucket(4320n)).toBe('30dplus');
    });

    it('>= 4320 → 30dplus', () => {
        expect(classifyBucket(10000n)).toBe('30dplus');
    });
});

// ---------------------------------------------------------------------------
// buildChain
// ---------------------------------------------------------------------------

describe('buildChain', () => {
    it('empty options → empty chain with only "all" active', () => {
        const chain = buildChain([], 500n);
        expect(chain.activeBuckets).toEqual(['all']);
        expect(chain.buckets.get('all')).toEqual([]);
    });

    it('non-OPEN options are excluded', () => {
        const opts = [
            makeOption({ status: OptionStatus.PURCHASED }),
            makeOption({ status: OptionStatus.EXERCISED }),
            makeOption({ status: OptionStatus.CANCELLED }),
        ];
        const chain = buildChain(opts, 500n);
        expect(chain.buckets.get('all')).toEqual([]);
    });

    it('single option placed in correct bucket and "all"', () => {
        const opt = makeOption({ expiryBlock: 1100n }); // 1100 - 500 = 600 blocks → 1to7d
        const chain = buildChain([opt], 500n);

        expect(chain.activeBuckets).toContain('all');
        expect(chain.activeBuckets).toContain('1to7d');

        const allRows = chain.buckets.get('all')!;
        expect(allRows).toHaveLength(1);
        expect(allRows[0].strikePrice).toBe(100n * e18);
        expect(allRows[0].call).not.toBeNull();
        expect(allRows[0].put).toBeNull();

        const bucketRows = chain.buckets.get('1to7d')!;
        expect(bucketRows).toHaveLength(1);
        expect(bucketRows[0].call!.depth).toBe(1);
    });

    it('CALL + PUT at same strike → complete ChainRow', () => {
        const call = makeOption({ optionType: OptionType.CALL, expiryBlock: 700n });
        const put = makeOption({ id: 2n, optionType: OptionType.PUT, expiryBlock: 700n });
        const chain = buildChain([call, put], 500n);

        const allRows = chain.buckets.get('all')!;
        expect(allRows).toHaveLength(1);
        expect(allRows[0].call).not.toBeNull();
        expect(allRows[0].put).not.toBeNull();
    });

    it('bestPremium = min, depth = count, totalAmount = sum', () => {
        const opts = [
            makeOption({ id: 1n, premium: 10n * e18, underlyingAmount: 2n * e18, expiryBlock: 700n }),
            makeOption({ id: 2n, premium: 3n * e18, underlyingAmount: 5n * e18, expiryBlock: 700n }),
            makeOption({ id: 3n, premium: 7n * e18, underlyingAmount: 1n * e18, expiryBlock: 700n }),
        ];
        const chain = buildChain(opts, 500n);
        const cell = chain.buckets.get('all')![0].call!;

        expect(cell.bestPremium).toBe(3n * e18);
        expect(cell.depth).toBe(3);
        expect(cell.totalAmount).toBe(8n * e18);
    });

    it('options sorted by premium ascending within cell', () => {
        const opts = [
            makeOption({ id: 1n, premium: 10n * e18, expiryBlock: 700n }),
            makeOption({ id: 2n, premium: 3n * e18, expiryBlock: 700n }),
            makeOption({ id: 3n, premium: 7n * e18, expiryBlock: 700n }),
        ];
        const chain = buildChain(opts, 500n);
        const cell = chain.buckets.get('all')![0].call!;

        expect(cell.options[0].premium).toBe(3n * e18);
        expect(cell.options[1].premium).toBe(7n * e18);
        expect(cell.options[2].premium).toBe(10n * e18);
    });

    it('activeBuckets only includes populated buckets', () => {
        const opts = [
            makeOption({ id: 1n, expiryBlock: 550n }),  // 50 blocks → lt1d
            makeOption({ id: 2n, expiryBlock: 5500n }), // 5000 blocks → 30dplus
        ];
        const chain = buildChain(opts, 500n);

        expect(chain.activeBuckets).toContain('all');
        expect(chain.activeBuckets).toContain('lt1d');
        expect(chain.activeBuckets).toContain('30dplus');
        expect(chain.activeBuckets).not.toContain('1to7d');
        expect(chain.activeBuckets).not.toContain('7to30d');
    });

    it('multiple strikes sorted ascending', () => {
        const opts = [
            makeOption({ id: 1n, strikePrice: 200n * e18, expiryBlock: 700n }),
            makeOption({ id: 2n, strikePrice: 50n * e18, expiryBlock: 700n }),
            makeOption({ id: 3n, strikePrice: 150n * e18, expiryBlock: 700n }),
        ];
        const chain = buildChain(opts, 500n);
        const rows = chain.buckets.get('all')!;

        expect(rows).toHaveLength(3);
        expect(rows[0].strikePrice).toBe(50n * e18);
        expect(rows[1].strikePrice).toBe(150n * e18);
        expect(rows[2].strikePrice).toBe(200n * e18);
    });

    it('currentBlock undefined → all options go into "all" only', () => {
        const opts = [
            makeOption({ id: 1n, expiryBlock: 1000n }),
            makeOption({ id: 2n, expiryBlock: 5000n }),
        ];
        const chain = buildChain(opts, undefined);

        expect(chain.activeBuckets).toEqual(['all']);
        expect(chain.buckets.get('all')!).toHaveLength(1); // same strike
        expect(chain.buckets.size).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// findAtmStrikeIndex
// ---------------------------------------------------------------------------

describe('findAtmStrikeIndex', () => {
    const rows: ChainRow[] = [
        { strikePrice: 100n * e18, call: null, put: null },
        { strikePrice: 120n * e18, call: null, put: null },
        { strikePrice: 140n * e18, call: null, put: null },
    ];

    it('returns null when spot is null', () => {
        expect(findAtmStrikeIndex(rows, null)).toBeNull();
    });

    it('returns null when spot is 0', () => {
        expect(findAtmStrikeIndex(rows, 0)).toBeNull();
    });

    it('returns null when spot is NaN', () => {
        expect(findAtmStrikeIndex(rows, NaN)).toBeNull();
    });

    it('returns null for empty rows', () => {
        expect(findAtmStrikeIndex([], 130)).toBeNull();
    });

    it('returns index of closest strike', () => {
        expect(findAtmStrikeIndex(rows, 115)).toBe(1); // closest to 120
        expect(findAtmStrikeIndex(rows, 100)).toBe(0);
        expect(findAtmStrikeIndex(rows, 135)).toBe(2); // closest to 140
    });
});

// ---------------------------------------------------------------------------
// isCallItm / isPutItm
// ---------------------------------------------------------------------------

describe('isCallItm', () => {
    it('true when spot > strike', () => {
        expect(isCallItm(100n * e18, 110)).toBe(true);
    });

    it('false when spot < strike', () => {
        expect(isCallItm(100n * e18, 90)).toBe(false);
    });

    it('false when spot == strike', () => {
        expect(isCallItm(100n * e18, 100)).toBe(false);
    });

    it('false when spot is null', () => {
        expect(isCallItm(100n * e18, null)).toBe(false);
    });
});

describe('isPutItm', () => {
    it('true when spot < strike', () => {
        expect(isPutItm(100n * e18, 90)).toBe(true);
    });

    it('false when spot > strike', () => {
        expect(isPutItm(100n * e18, 110)).toBe(false);
    });

    it('false when spot == strike', () => {
        expect(isPutItm(100n * e18, 100)).toBe(false);
    });

    it('false when spot is null', () => {
        expect(isPutItm(100n * e18, null)).toBe(false);
    });
});
