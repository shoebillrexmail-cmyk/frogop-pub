/**
 * strategyMath — pure functions for strategy template parameter computation.
 *
 * No React dependencies. Uses optionMath for Black-Scholes pricing.
 */
import { blackScholesPremium, blocksToYears } from './optionMath.js';
import { OptionType, OptionStatus } from '../services/types.js';
import type { OptionData } from '../services/types.js';
import { BLOCK_CONSTANTS } from '../config/index.js';

const DEFAULT_VOL = 0.8;         // 80% annualized
const DEFAULT_DAYS = 30;
const CALL_STRIKE_MULT = 1.20;   // 120% OTM
const PUT_STRIKE_MULT = 0.80;    // 80% OTM
const PUT_MID = 0.875;           // Prefer strikes closest to 87.5% of spot

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WriteOptionInitialValues {
    optionType: number;
    amountStr: string;
    strikeStr: string;
    premiumStr: string;
    selectedDays: number;
}

export interface CollarParams {
    callLeg: WriteOptionInitialValues;
    putStrikeStr: string;
    putPremiumStr: string;
    netPremiumDisplay: string;
}

export type StrategyType =
    | 'covered-call'
    | 'write-put'
    | 'protective-put'
    | 'collar'
    | 'bull-call-spread'
    | 'bear-put-spread'
    | 'long-call'
    | 'long-put'
    | 'long-straddle'
    | 'long-strangle';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface StrategyOutcome {
    goalTitle: string;
    goalDescription: string;
    riskLevel: RiskLevel;
    actionLabel: string;
    metrics: { label: string; value: string; color?: string }[];
    initialValues: WriteOptionInitialValues;
}

export interface StrategyFilter {
    type: StrategyType;
    optionType: number;
    strikeMin: number;
    strikeMax: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a float to 4 decimal places. */
export function formatDecimal(value: number): string {
    return value.toFixed(4);
}

/** Format an 18-decimal bigint as a 4-decimal string. */
function formatBigint18(value: bigint): string {
    const whole = value / (10n ** 18n);
    const frac = value % (10n ** 18n);
    const fracStr = frac.toString().padStart(18, '0').slice(0, 4);
    return `${whole}.${fracStr}`;
}

/** Compute BS premium as a formatted string. */
function bsPremiumStr(spot: number, strike: number, days: number, optionType: number): string {
    const timeYears = blocksToYears(days * BLOCK_CONSTANTS.BLOCKS_PER_DAY);
    const premium = blackScholesPremium({
        spot,
        strike,
        timeYears,
        volatility: DEFAULT_VOL,
        optionType,
    });
    return formatBigint18(premium);
}

// ---------------------------------------------------------------------------
// Covered Call
// ---------------------------------------------------------------------------

/**
 * Compute covered call parameters: CALL at 120% spot, 30-day expiry.
 * Returns null when spot is invalid.
 */
export function calcCoveredCallParams(
    spot: number,
    motoBal: number | null,
): WriteOptionInitialValues | null {
    if (spot <= 0) return null;

    const strike = spot * CALL_STRIKE_MULT;

    return {
        optionType: OptionType.CALL,
        amountStr: motoBal !== null ? formatDecimal(motoBal) : '1',
        strikeStr: formatDecimal(strike),
        premiumStr: bsPremiumStr(spot, strike, DEFAULT_DAYS, OptionType.CALL),
        selectedDays: DEFAULT_DAYS,
    };
}

// ---------------------------------------------------------------------------
// Protective Put
// ---------------------------------------------------------------------------

/**
 * Find the best protective put from available OPEN options.
 * Considers ALL open PUTs below spot, prefers strike closest to 87.5% of spot.
 * Excludes the connected wallet's own options (can't buy your own).
 * Returns null if no suitable option found.
 */
export function findBestProtectivePut(
    options: OptionData[],
    spot: number,
    walletHex?: string | null,
): OptionData | null {
    if (spot <= 0) return null;

    const target = spot * PUT_MID;
    const walletLower = walletHex?.toLowerCase() ?? null;

    const candidates = options.filter((o) =>
        o.status === OptionStatus.OPEN &&
        o.optionType === OptionType.PUT &&
        Number(o.strikePrice) / 1e18 <= spot &&
        (walletLower === null || o.writer.toLowerCase() !== walletLower),
    );

    if (candidates.length === 0) return null;

    // Pick the one closest to 87.5% of spot
    return candidates.reduce((best, curr) => {
        const bestDist = Math.abs(Number(best.strikePrice) / 1e18 - target);
        const currDist = Math.abs(Number(curr.strikePrice) / 1e18 - target);
        return currDist < bestDist ? curr : best;
    });
}

// ---------------------------------------------------------------------------
// Write Put (writer-side fallback for Protective Put)
// ---------------------------------------------------------------------------

/**
 * Compute parameters for writing a protective put: PUT at 87.5% spot, 30-day expiry.
 * Used when no existing puts are available in the 80–95% range.
 */
export function calcWritePutParams(
    spot: number,
    motoBal: number | null,
): WriteOptionInitialValues | null {
    if (spot <= 0) return null;

    const strike = spot * PUT_MID; // 87.5% — midpoint of protective range

    return {
        optionType: OptionType.PUT,
        amountStr: motoBal !== null ? formatDecimal(motoBal) : '1',
        strikeStr: formatDecimal(strike),
        premiumStr: bsPremiumStr(spot, strike, DEFAULT_DAYS, OptionType.PUT),
        selectedDays: DEFAULT_DAYS,
    };
}

// ---------------------------------------------------------------------------
// Collar
// ---------------------------------------------------------------------------

/**
 * Compute collar parameters: write CALL at 120% + buy PUT at 80%.
 * Returns null when spot is invalid.
 */
export function calcCollarParams(
    spot: number,
    motoBal: number | null,
): CollarParams | null {
    const callLeg = calcCoveredCallParams(spot, motoBal);
    if (!callLeg) return null;

    const putStrike = spot * PUT_STRIKE_MULT;
    const putPremium = bsPremiumStr(spot, putStrike, DEFAULT_DAYS, OptionType.PUT);

    const callPremFloat = parseFloat(callLeg.premiumStr);
    const putPremFloat = parseFloat(putPremium);
    const net = callPremFloat - putPremFloat;

    return {
        callLeg,
        putStrikeStr: formatDecimal(putStrike),
        putPremiumStr: putPremium,
        netPremiumDisplay: (net >= 0 ? '+' : '') + formatDecimal(net),
    };
}

// ---------------------------------------------------------------------------
// Liquidity check — count open options matching a buy-side strategy
// ---------------------------------------------------------------------------

/**
 * Count OPEN options matching the criteria for a buy-side strategy.
 * Used to gate buy-side cards when no matching liquidity exists.
 * Excludes the connected wallet's own options (can't buy your own).
 */
export function countOpenOptionsForStrategy(
    options: OptionData[], type: StrategyType, spot: number, walletHex?: string | null,
): number {
    const walletLower = walletHex?.toLowerCase() ?? null;
    const notSelf = (o: OptionData) => walletLower === null || o.writer.toLowerCase() !== walletLower;
    if (type === 'protective-put' || type === 'long-put') {
        return options.filter(o =>
            o.optionType === OptionType.PUT &&
            o.status === OptionStatus.OPEN &&
            Number(o.strikePrice) / 1e18 <= spot &&
            notSelf(o),
        ).length;
    }
    if (type === 'long-call') {
        return options.filter(o =>
            o.optionType === OptionType.CALL &&
            o.status === OptionStatus.OPEN &&
            Number(o.strikePrice) / 1e18 >= spot &&
            notSelf(o),
        ).length;
    }
    if (type === 'long-straddle' || type === 'long-strangle') {
        const calls = options.filter(o => o.optionType === OptionType.CALL && o.status === OptionStatus.OPEN && notSelf(o)).length;
        const puts = options.filter(o => o.optionType === OptionType.PUT && o.status === OptionStatus.OPEN && notSelf(o)).length;
        return Math.min(calls, puts);
    }
    return 0;
}

/**
 * Count open (buyable) options relevant to a buyer intent.
 * Excludes the connected wallet's own options (can't buy your own).
 * - protect: open PUTs (not written by wallet)
 * - speculate-up: open CALLs (not written by wallet)
 * - speculate-down: open PUTs (not written by wallet)
 */
export function countBuyableOptionsForIntent(
    options: OptionData[],
    intentId: string,
    walletHex?: string | null,
): number {
    const walletLower = walletHex?.toLowerCase() ?? null;
    const notSelf = (o: OptionData) => walletLower === null || o.writer.toLowerCase() !== walletLower;

    if (intentId === 'protect' || intentId === 'speculate-down') {
        return options.filter(o => o.status === OptionStatus.OPEN && o.optionType === OptionType.PUT && notSelf(o)).length;
    }
    if (intentId === 'speculate-up') {
        return options.filter(o => o.status === OptionStatus.OPEN && o.optionType === OptionType.CALL && notSelf(o)).length;
    }
    if (intentId === 'expect-volatility') {
        // Need at least one CALL and one PUT
        const calls = options.filter(o => o.status === OptionStatus.OPEN && o.optionType === OptionType.CALL && notSelf(o)).length;
        const puts = options.filter(o => o.status === OptionStatus.OPEN && o.optionType === OptionType.PUT && notSelf(o)).length;
        return Math.min(calls, puts);
    }
    return 0;
}

// ---------------------------------------------------------------------------
// Buy-side finders — long call, long put, straddle, strangle
// ---------------------------------------------------------------------------

const CALL_MID = 1.125; // Prefer strikes closest to 112.5% of spot

/**
 * Find the best CALL to buy for a long call strategy.
 * Prefers strike closest to 112.5% of spot (moderate OTM).
 * Excludes the connected wallet's own options.
 */
export function findBestCall(
    options: OptionData[],
    spot: number,
    walletHex?: string | null,
): OptionData | null {
    if (spot <= 0) return null;
    const target = spot * CALL_MID;
    const walletLower = walletHex?.toLowerCase() ?? null;

    const candidates = options.filter((o) =>
        o.status === OptionStatus.OPEN &&
        o.optionType === OptionType.CALL &&
        Number(o.strikePrice) / 1e18 >= spot &&
        (walletLower === null || o.writer.toLowerCase() !== walletLower),
    );

    if (candidates.length === 0) return null;

    return candidates.reduce((best, curr) => {
        const bestDist = Math.abs(Number(best.strikePrice) / 1e18 - target);
        const currDist = Math.abs(Number(curr.strikePrice) / 1e18 - target);
        return currDist < bestDist ? curr : best;
    });
}

/**
 * Find a straddle pair: CALL + PUT at the closest matching strike.
 * Both must be OPEN and not written by the connected wallet.
 */
export function findStraddlePair(
    options: OptionData[],
    spot: number,
    walletHex?: string | null,
): { call: OptionData; put: OptionData; totalPremium: bigint } | null {
    if (spot <= 0) return null;
    const walletLower = walletHex?.toLowerCase() ?? null;
    const notSelf = (o: OptionData) => walletLower === null || o.writer.toLowerCase() !== walletLower;

    const calls = options.filter(o => o.status === OptionStatus.OPEN && o.optionType === OptionType.CALL && notSelf(o));
    const puts = options.filter(o => o.status === OptionStatus.OPEN && o.optionType === OptionType.PUT && notSelf(o));

    if (calls.length === 0 || puts.length === 0) return null;

    // Find pair with closest matching strikes, preferring near ATM
    let bestPair: { call: OptionData; put: OptionData } | null = null;
    let bestScore = Infinity;

    for (const call of calls) {
        const callStrike = Number(call.strikePrice) / 1e18;
        for (const put of puts) {
            const putStrike = Number(put.strikePrice) / 1e18;
            const strikeDiff = Math.abs(callStrike - putStrike) / spot;
            const atmDist = Math.abs((callStrike + putStrike) / 2 - spot) / spot;
            const score = strikeDiff * 2 + atmDist; // Prioritize matching strikes, then ATM
            if (score < bestScore) {
                bestScore = score;
                bestPair = { call, put };
            }
        }
    }

    if (!bestPair) return null;
    return {
        ...bestPair,
        totalPremium: bestPair.call.premium + bestPair.put.premium,
    };
}

/**
 * Find a strangle pair: OTM CALL (above spot) + OTM PUT (below spot).
 * Prefers strikes roughly symmetric around spot.
 */
export function findStranglePair(
    options: OptionData[],
    spot: number,
    walletHex?: string | null,
): { call: OptionData; put: OptionData; totalPremium: bigint } | null {
    if (spot <= 0) return null;
    const walletLower = walletHex?.toLowerCase() ?? null;
    const notSelf = (o: OptionData) => walletLower === null || o.writer.toLowerCase() !== walletLower;

    const otmCalls = options.filter(o =>
        o.status === OptionStatus.OPEN && o.optionType === OptionType.CALL &&
        Number(o.strikePrice) / 1e18 > spot * 1.02 && notSelf(o),
    );
    const otmPuts = options.filter(o =>
        o.status === OptionStatus.OPEN && o.optionType === OptionType.PUT &&
        Number(o.strikePrice) / 1e18 < spot * 0.98 && notSelf(o),
    );

    if (otmCalls.length === 0 || otmPuts.length === 0) return null;

    // Find pair with most symmetric strikes around spot
    let bestPair: { call: OptionData; put: OptionData } | null = null;
    let bestScore = Infinity;

    for (const call of otmCalls) {
        const callDist = Number(call.strikePrice) / 1e18 - spot;
        for (const put of otmPuts) {
            const putDist = spot - Number(put.strikePrice) / 1e18;
            const asymmetry = Math.abs(callDist - putDist) / spot;
            if (asymmetry < bestScore) {
                bestScore = asymmetry;
                bestPair = { call, put };
            }
        }
    }

    if (!bestPair) return null;
    return {
        ...bestPair,
        totalPremium: bestPair.call.premium + bestPair.put.premium,
    };
}

// ---------------------------------------------------------------------------
// Live outcome computation (Story 3)
// ---------------------------------------------------------------------------

const STRATEGY_META: Record<StrategyType, {
    goalTitle: string;
    goalDescription: string;
    riskLevel: RiskLevel;
    actionLabel: string;
}> = {
    'covered-call': {
        goalTitle: 'Earn Premium on Tokens',
        goalDescription: 'List your tokens for sale above today\'s price. If another user buys the listing, you earn a fee immediately.',
        riskLevel: 'low',
        actionLabel: 'List on Marketplace',
    },
    'write-put': {
        goalTitle: 'Earn by Offering to Buy',
        goalDescription: 'List an offer to buy tokens at a lower price. If another user takes your offer, you earn a fee immediately.',
        riskLevel: 'medium',
        actionLabel: 'List on Marketplace',
    },
    'protective-put': {
        goalTitle: 'Protect Against Drops',
        goalDescription: 'Buy an existing listing that lets you sell at a guaranteed minimum price.',
        riskLevel: 'low',
        actionLabel: 'Get Protection',
    },
    'collar': {
        goalTitle: 'Earn on Both Sides',
        goalDescription: 'List both a sell-above and buy-below offer. Earn fees if other users take either side.',
        riskLevel: 'low',
        actionLabel: 'List on Marketplace',
    },
    'bull-call-spread': {
        goalTitle: 'Bet on Moderate Rise',
        goalDescription: 'Profit if the price rises, with both your cost and gain capped.',
        riskLevel: 'medium',
        actionLabel: 'Open Position',
    },
    'bear-put-spread': {
        goalTitle: 'Bet on Moderate Drop',
        goalDescription: 'Profit if the price drops, with both your cost and gain capped.',
        riskLevel: 'medium',
        actionLabel: 'Open Position',
    },
    'long-call': {
        goalTitle: 'Bet on Big Rise',
        goalDescription: 'Buy an existing listing to profit from a large price increase. Uncapped upside.',
        riskLevel: 'high',
        actionLabel: 'Buy Call',
    },
    'long-put': {
        goalTitle: 'Bet on Big Drop',
        goalDescription: 'Buy an existing listing to profit from a large price drop. Large profit potential.',
        riskLevel: 'high',
        actionLabel: 'Buy Put',
    },
    'long-straddle': {
        goalTitle: 'Bet on Big Move (Either Way)',
        goalDescription: 'Buy a CALL and a PUT at the same price level. Profit from a large move in either direction.',
        riskLevel: 'high',
        actionLabel: 'Buy Straddle',
    },
    'long-strangle': {
        goalTitle: 'Bet on Big Move (Cheaper)',
        goalDescription: 'Buy an OTM CALL and OTM PUT. Cheaper than a straddle but needs a bigger move to profit.',
        riskLevel: 'high',
        actionLabel: 'Buy Strangle',
    },
};

/**
 * Compute a BS premium as a float (not bigint) for live UI display.
 */
function bsPremiumFloat(spot: number, strike: number, days: number, optionType: number): number {
    const timeYears = blocksToYears(days * BLOCK_CONSTANTS.BLOCKS_PER_DAY);
    const premiumBi = blackScholesPremium({
        spot,
        strike,
        timeYears,
        volatility: DEFAULT_VOL,
        optionType,
    });
    return Number(premiumBi) / 1e18;
}

/**
 * Compute live strategy outcome from user-configurable parameters.
 *
 * @param strategyType - which strategy
 * @param spot - current underlying/premium ratio
 * @param moneyness - e.g. 1.2 for 120% of spot (for the primary leg)
 * @param days - expiry in days
 * @param amount - number of underlying tokens
 * @param premiumSymbol - display unit for labels
 * @param underlyingSymbol - display unit for underlying
 * @param moneyness2 - second leg moneyness (for collar/spreads)
 */
export function calcLiveOutcome(
    strategyType: StrategyType,
    spot: number,
    moneyness: number,
    days: number,
    amount: number,
    premiumSymbol: string,
    underlyingSymbol: string,
    moneyness2?: number,
): StrategyOutcome | null {
    if (spot <= 0 || amount <= 0 || days <= 0) return null;
    const meta = STRATEGY_META[strategyType];

    switch (strategyType) {
        case 'covered-call': {
            const strike = spot * moneyness;
            const premium = bsPremiumFloat(spot, strike, days, OptionType.CALL);
            const totalPremium = premium * amount;
            const collateralInPremium = amount * spot;
            const yieldPct = collateralInPremium > 0 ? (totalPremium / collateralInPremium) * 100 : 0;
            const annYield = days > 0 ? yieldPct * (365 / days) : 0;
            const deltaPct = Math.round((moneyness - 1) * 100);

            return {
                ...meta,
                metrics: [
                    { label: 'You lock', value: `${amount.toFixed(4)} ${underlyingSymbol} as collateral` },
                    { label: 'Fee you set', value: `${totalPremium.toFixed(2)} ${premiumSymbol}`, color: 'green' },
                    { label: 'Return', value: `${yieldPct.toFixed(2)}% for ${days}d (${annYield.toFixed(1)}% annualized)` },
                    { label: 'Sell price', value: `${strike.toFixed(2)} ${premiumSymbol} (+${deltaPct}% above current)` },
                    { label: '—', value: '' },
                    { label: 'If price stays below sell price', value: `You keep your ${underlyingSymbol} + the fee. Best outcome.`, color: 'green' },
                    { label: 'If price rises above sell price', value: `Buyer takes your ${underlyingSymbol} at ${strike.toFixed(2)}. You keep the fee but miss further gains.`, color: 'red' },
                    { label: 'If nobody buys your listing', value: `Nothing happens — your ${underlyingSymbol} unlock at expiry. No fee earned.` },
                ],
                initialValues: {
                    optionType: OptionType.CALL,
                    amountStr: amount.toString(),
                    strikeStr: formatDecimal(strike),
                    premiumStr: formatDecimal(premium * amount),
                    selectedDays: days,
                },
            };
        }

        case 'write-put': {
            const strike = spot * moneyness;
            const premium = bsPremiumFloat(spot, strike, days, OptionType.PUT);
            const totalPremium = premium * amount;
            const collateral = strike * amount; // PILL locked
            const yieldPct = collateral > 0 ? (totalPremium / collateral) * 100 : 0;
            const annYield = days > 0 ? yieldPct * (365 / days) : 0;
            const deltaPct = Math.abs(Math.round((moneyness - 1) * 100));

            return {
                ...meta,
                metrics: [
                    { label: 'You lock', value: `${collateral.toFixed(2)} ${premiumSymbol} as collateral` },
                    { label: 'Fee you set', value: `${totalPremium.toFixed(2)} ${premiumSymbol}`, color: 'green' },
                    { label: 'Return', value: `${yieldPct.toFixed(2)}% for ${days}d (${annYield.toFixed(1)}% annualized)` },
                    { label: 'Buy price', value: `${strike.toFixed(2)} ${premiumSymbol} (${deltaPct}% below current)` },
                    { label: '—', value: '' },
                    { label: 'If price stays above buy price', value: `You keep your collateral + the fee. Best outcome.`, color: 'green' },
                    { label: 'If price drops below buy price', value: `Other party sells you ${underlyingSymbol} at ${strike.toFixed(2)}. You keep the fee but buy above market.`, color: 'red' },
                    { label: 'If nobody takes your offer', value: `Nothing happens — your collateral unlocks at expiry. No fee earned.` },
                ],
                initialValues: {
                    optionType: OptionType.PUT,
                    amountStr: amount.toString(),
                    strikeStr: formatDecimal(strike),
                    premiumStr: formatDecimal(premium * amount),
                    selectedDays: days,
                },
            };
        }

        case 'collar': {
            const callStrike = spot * moneyness;
            const putStrike = spot * (moneyness2 ?? 0.8);
            const callPrem = bsPremiumFloat(spot, callStrike, days, OptionType.CALL);
            const putPrem = bsPremiumFloat(spot, putStrike, days, OptionType.PUT);
            const netPremium = (callPrem - putPrem) * amount;
            const callDelta = Math.round((moneyness - 1) * 100);
            const putDelta = Math.abs(Math.round(((moneyness2 ?? 0.8) - 1) * 100));

            return {
                ...meta,
                metrics: [
                    { label: 'Sell-above price', value: `${callStrike.toFixed(2)} ${premiumSymbol} (+${callDelta}% above current)` },
                    { label: 'Buy-below price', value: `${putStrike.toFixed(2)} ${premiumSymbol} (${putDelta}% below current)` },
                    { label: 'Net fee earned', value: `${netPremium >= 0 ? '+' : ''}${netPremium.toFixed(2)} ${premiumSymbol}`, color: netPremium >= 0 ? 'green' : 'red' },
                    { label: '—', value: '' },
                    { label: 'If price stays between', value: `${putStrike.toFixed(2)} and ${callStrike.toFixed(2)} — you keep ${underlyingSymbol} + net fee. Best outcome.`, color: 'green' },
                    { label: 'If price rises above sell price', value: `Buyer takes your ${underlyingSymbol} at ${callStrike.toFixed(2)}. You keep the fee.`, color: 'red' },
                    { label: 'If price drops below buy price', value: `You buy more ${underlyingSymbol} at ${putStrike.toFixed(2)} (above market). You keep the fee.`, color: 'red' },
                ],
                initialValues: {
                    optionType: OptionType.CALL,
                    amountStr: amount.toString(),
                    strikeStr: formatDecimal(callStrike),
                    premiumStr: formatDecimal(callPrem * amount),
                    selectedDays: days,
                },
            };
        }

        case 'bull-call-spread': {
            const buyStrike = spot * (moneyness2 ?? 1.0);
            const sellStrike = spot * moneyness;
            const buyPrem = bsPremiumFloat(spot, buyStrike, days, OptionType.CALL);
            const sellPrem = bsPremiumFloat(spot, sellStrike, days, OptionType.CALL);
            const netCost = (buyPrem - sellPrem) * amount;
            const maxProfit = (sellStrike - buyStrike) * amount - netCost;
            const maxLoss = netCost;
            const breakeven = buyStrike + netCost / amount;

            return {
                ...meta,
                metrics: [
                    { label: 'You pay', value: `${netCost.toFixed(2)} ${premiumSymbol} (net cost of both legs)`, color: 'red' },
                    { label: 'You can earn up to', value: `${maxProfit.toFixed(2)} ${premiumSymbol}`, color: 'green' },
                    { label: 'You can lose at most', value: `${Math.abs(maxLoss).toFixed(2)} ${premiumSymbol} (the net cost)`, color: 'red' },
                    { label: '—', value: '' },
                    { label: `If price rises above ${breakeven.toFixed(2)}`, value: `You profit — up to ${maxProfit.toFixed(2)} ${premiumSymbol} if price reaches ${sellStrike.toFixed(2)}`, color: 'green' },
                    { label: `If price stays below ${buyStrike.toFixed(2)}`, value: `You lose the ${netCost.toFixed(2)} ${premiumSymbol} net cost. Nothing else happens.`, color: 'red' },
                ],
                initialValues: {
                    optionType: OptionType.CALL,
                    amountStr: amount.toString(),
                    strikeStr: formatDecimal(sellStrike),
                    premiumStr: formatDecimal(sellPrem * amount),
                    selectedDays: days,
                },
            };
        }

        case 'bear-put-spread': {
            const buyStrike = spot * (moneyness2 ?? 1.0);
            const sellStrike = spot * moneyness;
            const buyPrem = bsPremiumFloat(spot, buyStrike, days, OptionType.PUT);
            const sellPrem = bsPremiumFloat(spot, sellStrike, days, OptionType.PUT);
            const netCost = (buyPrem - sellPrem) * amount;
            const maxProfit = (buyStrike - sellStrike) * amount - netCost;
            const maxLoss = netCost;
            const breakeven = buyStrike - netCost / amount;

            return {
                ...meta,
                metrics: [
                    { label: 'You pay', value: `${netCost.toFixed(2)} ${premiumSymbol} (net cost of both legs)`, color: 'red' },
                    { label: 'You can earn up to', value: `${maxProfit.toFixed(2)} ${premiumSymbol}`, color: 'green' },
                    { label: 'You can lose at most', value: `${Math.abs(maxLoss).toFixed(2)} ${premiumSymbol} (the net cost)`, color: 'red' },
                    { label: '—', value: '' },
                    { label: `If price drops below ${breakeven.toFixed(2)}`, value: `You profit — up to ${maxProfit.toFixed(2)} ${premiumSymbol} if price reaches ${sellStrike.toFixed(2)}`, color: 'green' },
                    { label: `If price stays above ${buyStrike.toFixed(2)}`, value: `You lose the ${netCost.toFixed(2)} ${premiumSymbol} net cost. Nothing else happens.`, color: 'red' },
                ],
                initialValues: {
                    optionType: OptionType.PUT,
                    amountStr: amount.toString(),
                    strikeStr: formatDecimal(sellStrike),
                    premiumStr: formatDecimal(sellPrem * amount),
                    selectedDays: days,
                },
            };
        }

        case 'protective-put': {
            const strike = spot * moneyness;
            const premium = bsPremiumFloat(spot, strike, days, OptionType.PUT);
            const cost = premium * amount;
            const protectionLevel = ((spot - strike) / spot * 100).toFixed(1);
            const netPayout = (strike * amount) - cost;

            return {
                ...meta,
                metrics: [
                    { label: 'You pay', value: `${cost.toFixed(2)} ${premiumSymbol} (one-time fee to the seller)`, color: 'red' },
                    { label: 'Guaranteed sell price', value: `${strike.toFixed(2)} ${premiumSymbol}`, color: 'green' },
                    { label: 'Protection kicks in', value: `If price drops more than ${protectionLevel}% from current` },
                    { label: '—', value: '' },
                    { label: `If price drops below ${strike.toFixed(2)}`, value: `You exercise and sell at ${strike.toFixed(2)} — receive ${netPayout.toFixed(2)} ${premiumSymbol} net`, color: 'green' },
                    { label: `If price stays above ${strike.toFixed(2)}`, value: `You don't exercise. You only lose the ${cost.toFixed(2)} ${premiumSymbol} fee.` },
                ],
                initialValues: {
                    optionType: OptionType.PUT,
                    amountStr: amount.toString(),
                    strikeStr: formatDecimal(strike),
                    premiumStr: formatDecimal(premium * amount),
                    selectedDays: days,
                },
            };
        }

        case 'long-call': {
            const strike = spot * moneyness;
            const premium = bsPremiumFloat(spot, strike, days, OptionType.CALL);
            const cost = premium * amount;
            const breakeven = strike + premium;
            const deltaPct = Math.round((moneyness - 1) * 100);

            return {
                ...meta,
                metrics: [
                    { label: 'You pay', value: `${cost.toFixed(2)} ${premiumSymbol} (one-time cost)`, color: 'red' },
                    { label: 'Strike price', value: `${strike.toFixed(2)} ${premiumSymbol} (+${deltaPct}% above current)` },
                    { label: 'Break-even', value: `${breakeven.toFixed(2)} ${premiumSymbol} — you profit above this price` },
                    { label: '—', value: '' },
                    { label: `If price rises above ${breakeven.toFixed(2)}`, value: `You profit — no cap on gains. The higher it goes, the more you earn.`, color: 'green' },
                    { label: `If price stays below ${strike.toFixed(2)}`, value: `You lose the ${cost.toFixed(2)} ${premiumSymbol} cost. Nothing else happens.`, color: 'red' },
                ],
                initialValues: {
                    optionType: OptionType.CALL,
                    amountStr: amount.toString(),
                    strikeStr: formatDecimal(strike),
                    premiumStr: formatDecimal(cost),
                    selectedDays: days,
                },
            };
        }

        case 'long-put': {
            const strike = spot * moneyness;
            const premium = bsPremiumFloat(spot, strike, days, OptionType.PUT);
            const cost = premium * amount;
            const breakeven = strike - premium;
            const deltaPct = Math.abs(Math.round((moneyness - 1) * 100));

            return {
                ...meta,
                metrics: [
                    { label: 'You pay', value: `${cost.toFixed(2)} ${premiumSymbol} (one-time cost)`, color: 'red' },
                    { label: 'Strike price', value: `${strike.toFixed(2)} ${premiumSymbol} (${deltaPct}% below current)` },
                    { label: 'Break-even', value: `${breakeven.toFixed(2)} ${premiumSymbol} — you profit below this price` },
                    { label: '—', value: '' },
                    { label: `If price drops below ${breakeven.toFixed(2)}`, value: `You profit — the further it drops, the more you earn.`, color: 'green' },
                    { label: `If price stays above ${strike.toFixed(2)}`, value: `You lose the ${cost.toFixed(2)} ${premiumSymbol} cost. Nothing else happens.`, color: 'red' },
                ],
                initialValues: {
                    optionType: OptionType.PUT,
                    amountStr: amount.toString(),
                    strikeStr: formatDecimal(strike),
                    premiumStr: formatDecimal(cost),
                    selectedDays: days,
                },
            };
        }

        case 'long-straddle': {
            const strike = spot * moneyness;
            const callPrem = bsPremiumFloat(spot, strike, days, OptionType.CALL);
            const putPrem = bsPremiumFloat(spot, strike, days, OptionType.PUT);
            const totalCost = (callPrem + putPrem) * amount;
            const upperBreakeven = strike + callPrem + putPrem;
            const lowerBreakeven = strike - callPrem - putPrem;

            return {
                ...meta,
                metrics: [
                    { label: 'Total cost', value: `${totalCost.toFixed(2)} ${premiumSymbol} (CALL + PUT premium)`, color: 'red' },
                    { label: 'Strike', value: `${strike.toFixed(2)} ${premiumSymbol}` },
                    { label: 'Break-even', value: `Below ${lowerBreakeven.toFixed(2)} or above ${upperBreakeven.toFixed(2)}` },
                    { label: '—', value: '' },
                    { label: 'If price moves a lot in either direction', value: `You profit — no cap on gains. The bigger the move, the more you earn.`, color: 'green' },
                    { label: `If price stays near ${strike.toFixed(2)}`, value: `You lose up to ${totalCost.toFixed(2)} ${premiumSymbol}. Maximum loss if price equals strike at expiry.`, color: 'red' },
                ],
                initialValues: {
                    optionType: OptionType.CALL,
                    amountStr: amount.toString(),
                    strikeStr: formatDecimal(strike),
                    premiumStr: formatDecimal(callPrem * amount),
                    selectedDays: days,
                },
            };
        }

        case 'long-strangle': {
            const callStrike = spot * moneyness;
            const putStrike = spot * (moneyness2 ?? 0.8);
            const callPrem = bsPremiumFloat(spot, callStrike, days, OptionType.CALL);
            const putPrem = bsPremiumFloat(spot, putStrike, days, OptionType.PUT);
            const totalCost = (callPrem + putPrem) * amount;
            const upperBreakeven = callStrike + callPrem + putPrem;
            const lowerBreakeven = putStrike - callPrem - putPrem;

            return {
                ...meta,
                metrics: [
                    { label: 'Total cost', value: `${totalCost.toFixed(2)} ${premiumSymbol} (CALL + PUT premium)`, color: 'red' },
                    { label: 'CALL strike', value: `${callStrike.toFixed(2)} ${premiumSymbol} (above spot)` },
                    { label: 'PUT strike', value: `${putStrike.toFixed(2)} ${premiumSymbol} (below spot)` },
                    { label: 'Break-even', value: `Below ${lowerBreakeven.toFixed(2)} or above ${upperBreakeven.toFixed(2)}` },
                    { label: '—', value: '' },
                    { label: 'If price moves big in either direction', value: `You profit — cheaper than a straddle but needs a bigger move.`, color: 'green' },
                    { label: `If price stays between ${putStrike.toFixed(2)} and ${callStrike.toFixed(2)}`, value: `You lose up to ${totalCost.toFixed(2)} ${premiumSymbol}.`, color: 'red' },
                ],
                initialValues: {
                    optionType: OptionType.CALL,
                    amountStr: amount.toString(),
                    strikeStr: formatDecimal(callStrike),
                    premiumStr: formatDecimal(callPrem * amount),
                    selectedDays: days,
                },
            };
        }
    }
}
