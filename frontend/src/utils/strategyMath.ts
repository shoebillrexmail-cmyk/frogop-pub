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
const PUT_LOWER = 0.80;          // Protective put search range
const PUT_UPPER = 0.95;
const PUT_MID = 0.875;           // Prefer strikes closest to midpoint

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
 * Searches for PUT options with strike in [80%–95% of spot].
 * Prefers strike closest to 87.5% (midpoint of range).
 * Returns null if no suitable option found.
 */
export function findBestProtectivePut(
    options: OptionData[],
    spot: number,
): OptionData | null {
    if (spot <= 0) return null;

    const lower = spot * PUT_LOWER;
    const upper = spot * PUT_UPPER;
    const target = spot * PUT_MID;

    const candidates = options.filter((o) =>
        o.status === OptionStatus.OPEN &&
        o.optionType === OptionType.PUT &&
        Number(o.strikePrice) / 1e18 >= lower &&
        Number(o.strikePrice) / 1e18 <= upper,
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
// Live outcome computation (Story 3)
// ---------------------------------------------------------------------------

const STRATEGY_META: Record<StrategyType, {
    goalTitle: string;
    goalDescription: string;
    riskLevel: RiskLevel;
    actionLabel: string;
}> = {
    'covered-call': {
        goalTitle: 'Earn Yield on Holdings',
        goalDescription: 'Write a CALL above spot. Earn premium upfront, cap upside at strike.',
        riskLevel: 'low',
        actionLabel: 'Start Earning',
    },
    'write-put': {
        goalTitle: 'Earn by Providing Insurance',
        goalDescription: 'Write a PUT below spot. Earn premium from buyers hedging downside.',
        riskLevel: 'medium',
        actionLabel: 'Start Earning',
    },
    'protective-put': {
        goalTitle: 'Protect Against Drops',
        goalDescription: 'Buy a PUT to limit downside. Pay a premium for peace of mind.',
        riskLevel: 'low',
        actionLabel: 'Get Protection',
    },
    'collar': {
        goalTitle: 'Lock In a Price Range',
        goalDescription: 'Write a CALL + PUT to limit both upside and downside. Often near-zero cost.',
        riskLevel: 'low',
        actionLabel: 'Setup Protection',
    },
    'bull-call-spread': {
        goalTitle: 'Bet on Moderate Rise',
        goalDescription: 'Write a higher-strike CALL and buy a lower-strike CALL. Limited risk and reward.',
        riskLevel: 'medium',
        actionLabel: 'Open Position',
    },
    'bear-put-spread': {
        goalTitle: 'Bet on Moderate Drop',
        goalDescription: 'Write a lower-strike PUT and buy a higher-strike PUT. Limited risk and reward.',
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
            const breakeven = strike + premium;
            const maxLoss = amount; // underlying locked

            return {
                ...meta,
                metrics: [
                    { label: 'You earn', value: `${totalPremium.toFixed(2)} ${premiumSymbol}`, color: 'green' },
                    { label: 'Yield', value: `${yieldPct.toFixed(2)}% (${annYield.toFixed(1)}% ann.)` },
                    { label: 'Risk', value: `Capped above ${strike.toFixed(2)} ${premiumSymbol}` },
                    { label: 'Breakeven', value: `${breakeven.toFixed(2)} ${premiumSymbol}` },
                    { label: 'Max loss', value: `${maxLoss.toFixed(4)} ${underlyingSymbol} (if exercised)`, color: 'red' },
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
            const breakeven = strike - premium;

            return {
                ...meta,
                metrics: [
                    { label: 'You earn', value: `${totalPremium.toFixed(2)} ${premiumSymbol}`, color: 'green' },
                    { label: 'Yield', value: `${yieldPct.toFixed(2)}% (${annYield.toFixed(1)}% ann.)` },
                    { label: 'Risk', value: `Must buy ${underlyingSymbol} at ${strike.toFixed(2)} if price drops` },
                    { label: 'Breakeven', value: `${breakeven.toFixed(2)} ${premiumSymbol}` },
                    { label: 'Collateral', value: `${collateral.toFixed(2)} ${premiumSymbol}`, color: 'red' },
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
                    { label: 'Cost', value: `${cost.toFixed(2)} ${premiumSymbol}`, color: 'red' },
                    { label: 'Protected below', value: `${strike.toFixed(2)} ${premiumSymbol}` },
                    { label: 'Max drop absorbed', value: `${protectionLevel}%` },
                    { label: 'Breakeven', value: `${(strike - premium).toFixed(2)} ${premiumSymbol}` },
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
