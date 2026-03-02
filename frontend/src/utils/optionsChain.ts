import { BLOCK_CONSTANTS } from '../config';
import type { OptionData } from '../services/types';
import { OptionStatus, OptionType } from '../services/types';

// ── Types ──────────────────────────────────────────────────────────────

export type ExpiryBucket = 'lt1d' | '1to7d' | '7to30d' | '30dplus';

export interface ChainCell {
    /** Lowest premium in this cell (best for buyer) */
    bestPremium: bigint;
    /** Number of options at this strike/type */
    depth: number;
    /** Sum of underlyingAmount across all options */
    totalAmount: bigint;
    /** Individual options, sorted by premium ascending */
    options: OptionData[];
}

export interface ChainRow {
    strikePrice: bigint;
    call: ChainCell | null;
    put: ChainCell | null;
}

export interface ChainData {
    buckets: Map<ExpiryBucket | 'all', ChainRow[]>;
    activeBuckets: Array<ExpiryBucket | 'all'>;
}

// ── Bucket classification ──────────────────────────────────────────────

const BUCKET_THRESHOLDS: Array<[bigint, ExpiryBucket]> = [
    [BigInt(BLOCK_CONSTANTS.BLOCKS_PER_DAY), 'lt1d'],
    [BigInt(BLOCK_CONSTANTS.BLOCKS_PER_WEEK), '1to7d'],
    [BigInt(BLOCK_CONSTANTS.BLOCKS_PER_MONTH), '7to30d'],
];

export function classifyBucket(blocksLeft: bigint): ExpiryBucket {
    for (const [threshold, bucket] of BUCKET_THRESHOLDS) {
        if (blocksLeft < threshold) return bucket;
    }
    return '30dplus';
}

// ── Bucket labels (for UI) ─────────────────────────────────────────────

export const BUCKET_LABELS: Record<ExpiryBucket | 'all', string> = {
    all: 'All',
    lt1d: '<1d',
    '1to7d': '1-7d',
    '7to30d': '7-30d',
    '30dplus': '30d+',
};

// ── Build chain ────────────────────────────────────────────────────────

function buildCell(options: OptionData[]): ChainCell {
    const sorted = [...options].sort((a, b) => {
        if (a.premium < b.premium) return -1;
        if (a.premium > b.premium) return 1;
        return 0;
    });
    let totalAmount = 0n;
    let bestPremium = sorted[0].premium;
    for (const opt of sorted) {
        totalAmount += opt.underlyingAmount;
        if (opt.premium < bestPremium) bestPremium = opt.premium;
    }
    return { bestPremium, depth: sorted.length, totalAmount, options: sorted };
}

function buildRows(
    grouped: Map<string, OptionData[]>,
    strikes: bigint[],
): ChainRow[] {
    return strikes.map((strikePrice) => {
        const callKey = `${strikePrice}_${OptionType.CALL}`;
        const putKey = `${strikePrice}_${OptionType.PUT}`;
        const callOpts = grouped.get(callKey);
        const putOpts = grouped.get(putKey);
        return {
            strikePrice,
            call: callOpts && callOpts.length > 0 ? buildCell(callOpts) : null,
            put: putOpts && putOpts.length > 0 ? buildCell(putOpts) : null,
        };
    });
}

export function buildChain(
    options: OptionData[],
    currentBlock: bigint | undefined,
): ChainData {
    const open = options.filter((o) => o.status === OptionStatus.OPEN);

    if (open.length === 0) {
        const buckets = new Map<ExpiryBucket | 'all', ChainRow[]>();
        buckets.set('all', []);
        return { buckets, activeBuckets: ['all'] };
    }

    // Group by (bucket, strike, type)
    const bucketGroups = new Map<ExpiryBucket | 'all', Map<string, OptionData[]>>();
    const allGroup = new Map<string, OptionData[]>();
    const allStrikes = new Set<bigint>();
    const activeBucketSet = new Set<ExpiryBucket>();

    for (const opt of open) {
        const key = `${opt.strikePrice}_${opt.optionType}`;
        allStrikes.add(opt.strikePrice);

        // Always add to 'all'
        const existing = allGroup.get(key);
        if (existing) {
            existing.push(opt);
        } else {
            allGroup.set(key, [opt]);
        }

        // Add to specific bucket when currentBlock is available
        if (currentBlock !== undefined) {
            const blocksLeft = opt.expiryBlock - currentBlock;
            const bucket = classifyBucket(blocksLeft);
            activeBucketSet.add(bucket);

            let bucketMap = bucketGroups.get(bucket);
            if (!bucketMap) {
                bucketMap = new Map<string, OptionData[]>();
                bucketGroups.set(bucket, bucketMap);
            }
            const bucketExisting = bucketMap.get(key);
            if (bucketExisting) {
                bucketExisting.push(opt);
            } else {
                bucketMap.set(key, [opt]);
            }
        }
    }

    const sortedStrikes = [...allStrikes].sort((a, b) => {
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
    });

    const buckets = new Map<ExpiryBucket | 'all', ChainRow[]>();
    buckets.set('all', buildRows(allGroup, sortedStrikes));

    for (const [bucket, grouped] of bucketGroups) {
        // Per-bucket strikes: only strikes that appear in this bucket
        const bucketStrikes = new Set<bigint>();
        for (const key of grouped.keys()) {
            const strike = BigInt(key.split('_')[0]);
            bucketStrikes.add(strike);
        }
        const sortedBucketStrikes = [...bucketStrikes].sort((a, b) => {
            if (a < b) return -1;
            if (a > b) return 1;
            return 0;
        });
        buckets.set(bucket, buildRows(grouped, sortedBucketStrikes));
    }

    const activeBuckets: Array<ExpiryBucket | 'all'> = ['all'];
    const bucketOrder: ExpiryBucket[] = ['lt1d', '1to7d', '7to30d', '30dplus'];
    for (const b of bucketOrder) {
        if (activeBucketSet.has(b)) activeBuckets.push(b);
    }

    return { buckets, activeBuckets };
}

// ── Moneyness classification ──────────────────────────────────────────

export type Moneyness = 'ITM' | 'ATM' | 'OTM';

export interface MoneynessResult {
    moneyness: Moneyness;
    /** Signed percentage from spot (positive = above spot, negative = below) */
    pctFromSpot: number;
    /** Human-readable label, e.g. "OTM +20.0% from spot" */
    label: string;
    /** Soft guidance for deep ITM/OTM, or null */
    guidance: string | null;
}

const ATM_THRESHOLD = 0.05;       // ±5% of spot
const DEEP_ITM_THRESHOLD = 0.30;  // >30% toward ITM
const FAR_OTM_THRESHOLD = 0.50;   // >50% away OTM

/**
 * Classify strike vs spot for a CALL or PUT.
 * Returns null if spot is unavailable or zero.
 */
export function classifyMoneyness(
    optionType: number,
    strike: number,
    spot: number,
): MoneynessResult | null {
    if (!spot || spot === 0 || !Number.isFinite(spot)) return null;
    if (!strike || strike === 0 || !Number.isFinite(strike)) return null;

    const pctFromSpot = (strike - spot) / spot;
    const absPct = Math.abs(pctFromSpot);

    let moneyness: Moneyness;
    const isCall = optionType === OptionType.CALL;

    if (absPct <= ATM_THRESHOLD) {
        moneyness = 'ATM';
    } else if (isCall) {
        // CALL: strike < spot = ITM, strike > spot = OTM
        moneyness = strike < spot ? 'ITM' : 'OTM';
    } else {
        // PUT: strike > spot = ITM, strike < spot = OTM
        moneyness = strike > spot ? 'ITM' : 'OTM';
    }

    const sign = pctFromSpot >= 0 ? '+' : '';
    const label = `${moneyness} ${sign}${(pctFromSpot * 100).toFixed(1)}% from spot`;

    let guidance: string | null = null;
    if (moneyness === 'ITM' && absPct > DEEP_ITM_THRESHOLD) {
        guidance = 'Deep ITM — high chance of exercise, low time premium.';
    } else if (moneyness === 'OTM' && absPct > FAR_OTM_THRESHOLD) {
        guidance = 'Far OTM — low chance of exercise, may not attract buyers.';
    }

    return { moneyness, pctFromSpot, label, guidance };
}

// ── ATM helpers ────────────────────────────────────────────────────────

const PRECISION = 1e18;

export function findAtmStrikeIndex(
    rows: ChainRow[],
    spotPill: number | null,
): number | null {
    if (spotPill === null || spotPill === 0 || Number.isNaN(spotPill)) {
        return null;
    }
    if (rows.length === 0) return null;

    let bestIdx = 0;
    let bestDist = Math.abs(Number(rows[0].strikePrice) / PRECISION - spotPill);

    for (let i = 1; i < rows.length; i++) {
        const dist = Math.abs(Number(rows[i].strikePrice) / PRECISION - spotPill);
        if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
        }
    }
    return bestIdx;
}

export function isCallItm(
    strike: bigint,
    spot: number | null,
): boolean {
    if (spot === null || spot === 0 || Number.isNaN(spot)) return false;
    return spot > Number(strike) / PRECISION;
}

export function isPutItm(
    strike: bigint,
    spot: number | null,
): boolean {
    if (spot === null || spot === 0 || Number.isNaN(spot)) return false;
    return spot < Number(strike) / PRECISION;
}
