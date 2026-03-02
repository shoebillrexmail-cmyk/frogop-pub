/**
 * optionMath — pure math functions for option pricing, Greeks, and P&L.
 *
 * All token values use 18-decimal bigint (1 token = 10^18).
 * Spot/strike for BS functions are floats (already divided by 1e18).
 */
import erfc from '@stdlib/math-base-special-erfc';
import { OptionType, OptionStatus } from '../services/types.js';
import type { OptionData, PoolInfo } from '../services/types.js';

const ONE = 10n ** 18n;
const BLOCKS_PER_YEAR = 52560;

// ---------------------------------------------------------------------------
// Extracted inline calculations
// ---------------------------------------------------------------------------

/** Total cost = premium + ceil(premium * buyFeeBps / 10000). Matches contract. */
export function calcTotalCost(premium: bigint, buyFeeBps: bigint): bigint {
    if (buyFeeBps <= 0n || premium <= 0n) return premium;
    const fee = (premium * buyFeeBps + 9999n) / 10000n;
    return premium + fee;
}

/** Breakeven price for OPEN/PURCHASED options. Null for settled states. */
export function calcBreakeven(option: OptionData): bigint | null {
    if (option.status !== OptionStatus.OPEN && option.status !== OptionStatus.PURCHASED) return null;
    if (option.optionType === OptionType.CALL) return option.strikePrice + option.premium;
    return option.strikePrice > option.premium ? option.strikePrice - option.premium : 0n;
}

/**
 * Yield = premium earned / collateral locked × 100 (as percentage).
 *
 * CALL: collateral is MOTO but premium is PILL — need spot price to normalize.
 *   yield = premium_pill / (amount_moto × spot_pill_per_moto) × 100
 *   Returns null if motoPillRatio unavailable.
 *
 * PUT: both collateral and premium are PILL-denominated — no conversion needed.
 */
export function calcYield(option: OptionData, motoPillRatio?: number | null): number | null {
    if (option.premium <= 0n || option.underlyingAmount <= 0n) return null;
    if (option.optionType === OptionType.CALL) {
        if (!motoPillRatio || motoPillRatio <= 0) return null;
        // Convert MOTO collateral to PILL equivalent, then compute yield
        const collateralInPill = Number(option.underlyingAmount) / 1e18 * motoPillRatio;
        if (collateralInPill <= 0) return null;
        return Number(option.premium) / 1e18 / collateralInPill * 100;
    }
    // PUT collateral = strikePrice × underlyingAmount / ONE (normalize 36-dec → 18-dec)
    const collateral = (option.strikePrice * option.underlyingAmount) / ONE;
    if (collateral <= 0n) return null;
    return Number(option.premium) / Number(collateral) * 100;
}

/** Estimated PnL from exercising, in PILL terms. Null when ratio unavailable. */
export function calcExercisePnl(
    option: OptionData,
    poolInfo: PoolInfo,
    motoPillRatio: number | null,
): number | null {
    if (!motoPillRatio || motoPillRatio <= 0) return null;

    const isCall = option.optionType === OptionType.CALL;
    // Normalize: both are 18-decimal, product is 36-decimal → divide by ONE
    const strikeValue = (option.strikePrice * option.underlyingAmount) / ONE;

    const feeBase = isCall ? option.underlyingAmount : strikeValue;
    const exerciseFee = poolInfo.exerciseFeeBps > 0n
        ? (feeBase * poolInfo.exerciseFeeBps + 9999n) / 10000n
        : 0n;

    const receiveAmount = feeBase - exerciseFee;
    const payAmount = isCall ? strikeValue : option.underlyingAmount;

    const receiveInPill = isCall
        ? Number(receiveAmount) / 1e18 * motoPillRatio
        : Number(receiveAmount) / 1e18;
    const costInPill = isCall
        ? Number(option.premium) / 1e18 + Number(payAmount) / 1e18
        : Number(option.premium) / 1e18 + Number(payAmount) / 1e18 * motoPillRatio;

    return receiveInPill - costInPill;
}

// ---------------------------------------------------------------------------
// Time conversion
// ---------------------------------------------------------------------------

export function blocksToYears(blocks: number): number {
    return blocks / BLOCKS_PER_YEAR;
}

// ---------------------------------------------------------------------------
// Cumulative Normal Distribution
// ---------------------------------------------------------------------------

/** Standard cumulative normal distribution N(x) using erfc. */
export function cumulativeNormal(x: number): number {
    return 0.5 * erfc(-x / Math.SQRT2);
}

/** Standard normal PDF. */
function normalPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// ---------------------------------------------------------------------------
// Black-Scholes
// ---------------------------------------------------------------------------

interface BSParams {
    /** Spot price (float, e.g. 50.0 PILL per MOTO) */
    spot: number;
    /** Strike price (float) */
    strike: number;
    /** Time to expiry in years */
    timeYears: number;
    /** Annualized volatility (e.g. 0.8 = 80%) */
    volatility: number;
    /** Risk-free rate (default 0) */
    riskFreeRate?: number;
    /** Option type: CALL or PUT */
    optionType: number;
}

/**
 * Black-Scholes option premium.
 * Returns 18-decimal bigint (same scale as on-chain token amounts).
 */
export function blackScholesPremium(params: BSParams): bigint {
    const { spot, strike, timeYears, volatility, optionType, riskFreeRate = 0 } = params;

    if (spot <= 0 || strike <= 0 || timeYears <= 0 || volatility <= 0) return 0n;

    const sqrtT = Math.sqrt(timeYears);
    const d1 = (Math.log(spot / strike) + (riskFreeRate + 0.5 * volatility * volatility) * timeYears)
        / (volatility * sqrtT);
    const d2 = d1 - volatility * sqrtT;

    const discountFactor = Math.exp(-riskFreeRate * timeYears);

    let premium: number;
    if (optionType === OptionType.CALL) {
        premium = spot * cumulativeNormal(d1) - strike * discountFactor * cumulativeNormal(d2);
    } else {
        premium = strike * discountFactor * cumulativeNormal(-d2) - spot * cumulativeNormal(-d1);
    }

    if (premium <= 0) return 0n;

    // Convert float → 18-decimal bigint
    return BigInt(Math.round(premium * 1e18));
}

// ---------------------------------------------------------------------------
// Greeks
// ---------------------------------------------------------------------------

interface GreekParams {
    spot: number;
    strike: number;
    timeYears: number;
    volatility: number;
    riskFreeRate?: number;
    optionType: number;
}

/** Delta: rate of change of option price w.r.t. spot. CALL: [0,1], PUT: [-1,0]. */
export function calcDelta(params: GreekParams): number {
    const { spot, strike, timeYears, volatility, optionType, riskFreeRate = 0 } = params;

    if (spot <= 0 || strike <= 0 || timeYears <= 0 || volatility <= 0) return 0;

    const sqrtT = Math.sqrt(timeYears);
    const d1 = (Math.log(spot / strike) + (riskFreeRate + 0.5 * volatility * volatility) * timeYears)
        / (volatility * sqrtT);

    if (optionType === OptionType.CALL) {
        return cumulativeNormal(d1);
    }
    return cumulativeNormal(d1) - 1;
}

/**
 * Theta: daily time decay of option value (in spot-price units per day).
 * Negative value = option loses value over time (expected for long positions).
 */
export function calcTheta(params: GreekParams): number {
    const { spot, strike, timeYears, volatility, optionType, riskFreeRate = 0 } = params;

    if (spot <= 0 || strike <= 0 || timeYears <= 0 || volatility <= 0) return 0;

    const sqrtT = Math.sqrt(timeYears);
    const d1 = (Math.log(spot / strike) + (riskFreeRate + 0.5 * volatility * volatility) * timeYears)
        / (volatility * sqrtT);
    const d2 = d1 - volatility * sqrtT;

    const discountFactor = Math.exp(-riskFreeRate * timeYears);

    // Common term: -S * N'(d1) * sigma / (2 * sqrt(T))
    const commonTerm = -spot * normalPdf(d1) * volatility / (2 * sqrtT);

    let theta: number;
    if (optionType === OptionType.CALL) {
        theta = commonTerm - riskFreeRate * strike * discountFactor * cumulativeNormal(d2);
    } else {
        theta = commonTerm + riskFreeRate * strike * discountFactor * cumulativeNormal(-d2);
    }

    // Convert from per-year to per-day
    return theta / 365;
}

// ---------------------------------------------------------------------------
// Payoff curve
// ---------------------------------------------------------------------------

interface PayoffPoint {
    price: number;
    pnl: number;
}

/**
 * Generate payoff curve at expiry for a buyer.
 * Returns ~100 points across 0.25x–2.5x current spot.
 */
export function calcPayoffCurve(
    option: OptionData,
    currentSpot: number,
    buyFeeBps: bigint,
): PayoffPoint[] {
    const totalCostFloat = Number(calcTotalCost(option.premium, buyFeeBps)) / 1e18;
    const strikeFloat = Number(option.strikePrice) / 1e18;
    const amountFloat = Number(option.underlyingAmount) / 1e18;
    const isCall = option.optionType === OptionType.CALL;

    const minPrice = currentSpot * 0.25;
    const maxPrice = currentSpot * 2.5;
    const step = (maxPrice - minPrice) / 100;
    const points: PayoffPoint[] = [];

    for (let price = minPrice; price <= maxPrice; price += step) {
        let intrinsic: number;
        if (isCall) {
            intrinsic = Math.max(price - strikeFloat, 0) * amountFloat;
        } else {
            intrinsic = Math.max(strikeFloat - price, 0) * amountFloat;
        }
        points.push({ price, pnl: intrinsic - totalCostFloat });
    }

    return points;
}
