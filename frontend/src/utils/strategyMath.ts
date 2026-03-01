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
