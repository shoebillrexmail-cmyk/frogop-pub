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
    | 'bear-put-spread';

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
    if (type === 'protective-put') {
        return options.filter(o =>
            o.optionType === OptionType.PUT &&
            o.status === OptionStatus.OPEN &&
            Number(o.strikePrice) / 1e18 <= spot &&
            notSelf(o),
        ).length;
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
    return 0;
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

            return {
                ...meta,
                metrics: [
                    { label: 'Fee you set', value: `${totalPremium.toFixed(2)} ${premiumSymbol} (earned when someone buys your listing)`, color: 'green' },
                    { label: 'Potential return', value: `${yieldPct.toFixed(2)}% for ${days}d (${annYield.toFixed(1)}% ann.)` },
                    { label: 'Sell price', value: `${strike.toFixed(2)} ${premiumSymbol} — if price goes above this, buyer can take your tokens` },
                    { label: 'Best case', value: `Price stays below ${strike.toFixed(2)} — you keep tokens + fee`, color: 'green' },
                    { label: 'Worst case', value: `Price rises above ${strike.toFixed(2)} — you sell tokens at that price (miss further upside)`, color: 'red' },
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

            return {
                ...meta,
                metrics: [
                    { label: 'Fee you set', value: `${totalPremium.toFixed(2)} ${premiumSymbol} (earned when someone takes your offer)`, color: 'green' },
                    { label: 'Potential return', value: `${yieldPct.toFixed(2)}% for ${days}d (${annYield.toFixed(1)}% ann.)` },
                    { label: 'Buy price', value: `${strike.toFixed(2)} ${premiumSymbol} — if price drops below this, the other party can sell to you` },
                    { label: 'Collateral locked', value: `${collateral.toFixed(2)} ${premiumSymbol}` },
                    { label: 'Best case', value: `Price stays above ${strike.toFixed(2)} — you keep collateral + fee`, color: 'green' },
                    { label: 'Worst case', value: `Price drops below ${strike.toFixed(2)} — you buy ${underlyingSymbol} at that price (above market)`, color: 'red' },
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
            const maxProfit = (callStrike - spot + callPrem - putPrem) * amount;
            const maxLoss = (spot - putStrike - callPrem + putPrem) * amount;

            return {
                ...meta,
                metrics: [
                    { label: 'Net premium', value: `${netPremium >= 0 ? '+' : ''}${netPremium.toFixed(2)} ${premiumSymbol}`, color: netPremium >= 0 ? 'green' : 'red' },
                    { label: 'Price range', value: `${putStrike.toFixed(2)} — ${callStrike.toFixed(2)} ${premiumSymbol}` },
                    { label: 'Max profit', value: `${maxProfit.toFixed(2)} ${premiumSymbol}`, color: 'green' },
                    { label: 'Max loss', value: `${Math.abs(maxLoss).toFixed(2)} ${premiumSymbol}`, color: 'red' },
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

            return {
                ...meta,
                metrics: [
                    { label: 'Net cost', value: `${netCost.toFixed(2)} ${premiumSymbol}`, color: 'red' },
                    { label: 'Max profit', value: `${maxProfit.toFixed(2)} ${premiumSymbol}`, color: 'green' },
                    { label: 'Max loss', value: `${Math.abs(maxLoss).toFixed(2)} ${premiumSymbol}`, color: 'red' },
                    { label: 'Break-even', value: `${(buyStrike + netCost / amount).toFixed(2)} ${premiumSymbol}` },
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

            return {
                ...meta,
                metrics: [
                    { label: 'Net cost', value: `${netCost.toFixed(2)} ${premiumSymbol}`, color: 'red' },
                    { label: 'Max profit', value: `${maxProfit.toFixed(2)} ${premiumSymbol}`, color: 'green' },
                    { label: 'Max loss', value: `${Math.abs(maxLoss).toFixed(2)} ${premiumSymbol}`, color: 'red' },
                    { label: 'Break-even', value: `${(buyStrike - netCost / amount).toFixed(2)} ${premiumSymbol}` },
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

            return {
                ...meta,
                metrics: [
                    { label: 'You pay', value: `${cost.toFixed(2)} ${premiumSymbol} (one-time fee to the seller)`, color: 'red' },
                    { label: 'Guaranteed sell price', value: `${strike.toFixed(2)} ${premiumSymbol} — you can sell at this price no matter how far it drops`, color: 'green' },
                    { label: 'Protection covers', value: `Drops beyond ${protectionLevel}% from current price` },
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
    }
}
