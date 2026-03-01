/**
 * optionMath tests — pure math functions for option pricing, Greeks, P&L.
 *
 * Tests extracted inline calculations + new Black-Scholes functions.
 */
import { describe, it, expect } from 'vitest';
import {
    calcTotalCost,
    calcBreakeven,
    calcYield,
    calcExercisePnl,
    blackScholesPremium,
    calcDelta,
    calcTheta,
    calcPayoffCurve,
    blocksToYears,
    cumulativeNormal,
} from '../optionMath.js';
import { OptionType, OptionStatus } from '../../services/types.js';
import type { OptionData, PoolInfo } from '../../services/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOption(overrides: Partial<OptionData> = {}): OptionData {
    return {
        id: 1n,
        writer: '0x' + 'aa'.repeat(32),
        buyer: '0x' + 'bb'.repeat(32),
        optionType: OptionType.CALL,
        strikePrice: 50n * 10n ** 18n,  // 50 PILL
        underlyingAmount: 1n * 10n ** 18n, // 1 MOTO
        premium: 5n * 10n ** 18n, // 5 PILL
        expiryBlock: 1000n,
        status: OptionStatus.OPEN,
        ...overrides,
    };
}

function makePoolInfo(overrides: Partial<PoolInfo> = {}): PoolInfo {
    return {
        underlying: '0xmoto',
        premiumToken: '0xpill',
        optionCount: 10n,
        cancelFeeBps: 100n,  // 1%
        buyFeeBps: 100n,     // 1%
        exerciseFeeBps: 10n, // 0.1%
        gracePeriodBlocks: 144n,
        ...overrides,
    };
}

const ONE = 10n ** 18n;

// ---------------------------------------------------------------------------
// calcTotalCost
// ---------------------------------------------------------------------------
describe('calcTotalCost', () => {
    it('computes premium + ceiling fee', () => {
        const premium = 1000n;
        const result = calcTotalCost(premium, 100n); // 1%
        // fee = ceil(1000 * 100 / 10000) = ceil(10) = 10
        expect(result).toBe(1010n);
    });

    it('uses ceiling division (rounds up)', () => {
        const premium = 1001n;
        const result = calcTotalCost(premium, 100n);
        // fee = ceil(1001 * 100 / 10000) = ceil(10.01) = 11
        expect(result).toBe(1001n + 11n);
    });

    it('returns premium when feeBps is 0', () => {
        expect(calcTotalCost(1000n, 0n)).toBe(1000n);
    });

    it('handles zero premium', () => {
        expect(calcTotalCost(0n, 100n)).toBe(0n);
    });
});

// ---------------------------------------------------------------------------
// calcBreakeven
// ---------------------------------------------------------------------------
describe('calcBreakeven', () => {
    it('CALL breakeven = strike + premium', () => {
        const opt = makeOption({ optionType: OptionType.CALL });
        expect(calcBreakeven(opt)).toBe(opt.strikePrice + opt.premium);
    });

    it('PUT breakeven = strike - premium (clamped to 0)', () => {
        const opt = makeOption({
            optionType: OptionType.PUT,
            strikePrice: 50n * ONE,
            premium: 5n * ONE,
        });
        expect(calcBreakeven(opt)).toBe(45n * ONE);
    });

    it('PUT breakeven clamps to 0 when premium > strike', () => {
        const opt = makeOption({
            optionType: OptionType.PUT,
            strikePrice: 5n * ONE,
            premium: 10n * ONE,
        });
        expect(calcBreakeven(opt)).toBe(0n);
    });

    it('returns null for exercised/expired/cancelled', () => {
        expect(calcBreakeven(makeOption({ status: OptionStatus.EXERCISED }))).toBeNull();
        expect(calcBreakeven(makeOption({ status: OptionStatus.EXPIRED }))).toBeNull();
        expect(calcBreakeven(makeOption({ status: OptionStatus.CANCELLED }))).toBeNull();
    });

    it('works for OPEN and PURCHASED', () => {
        expect(calcBreakeven(makeOption({ status: OptionStatus.OPEN }))).not.toBeNull();
        expect(calcBreakeven(makeOption({ status: OptionStatus.PURCHASED }))).not.toBeNull();
    });
});

// ---------------------------------------------------------------------------
// calcYield
// ---------------------------------------------------------------------------
describe('calcYield', () => {
    it('CALL yield = premium / underlyingAmount * 100', () => {
        const opt = makeOption({
            optionType: OptionType.CALL,
            premium: 5n * ONE,
            underlyingAmount: 100n * ONE,
        });
        expect(calcYield(opt)).toBeCloseTo(5.0, 1);
    });

    it('PUT yield = premium / (strike * amount) * 100', () => {
        const opt = makeOption({
            optionType: OptionType.PUT,
            strikePrice: 50n * ONE,
            underlyingAmount: 2n * ONE,
            premium: 10n * ONE,
        });
        // collateral = 50 * 2 = 100; yield = 10/100 * 100 = 10%
        expect(calcYield(opt)).toBeCloseTo(10.0, 1);
    });

    it('returns null when premium is 0', () => {
        expect(calcYield(makeOption({ premium: 0n }))).toBeNull();
    });

    it('returns null when amount is 0', () => {
        expect(calcYield(makeOption({ underlyingAmount: 0n }))).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// calcExercisePnl
// ---------------------------------------------------------------------------
describe('calcExercisePnl', () => {
    it('CALL: pnl = receive_moto_in_pill - premium - exercise_cost', () => {
        const opt = makeOption({
            optionType: OptionType.CALL,
            strikePrice: 40n * ONE,   // 40 PILL
            underlyingAmount: 1n * ONE,
            premium: 5n * ONE,
        });
        const pool = makePoolInfo({ exerciseFeeBps: 10n }); // 0.1%
        const ratio = 50; // 1 MOTO = 50 PILL currently

        const pnl = calcExercisePnl(opt, pool, ratio);
        // pay: 40 PILL (strike * amount), receive: ~0.999 MOTO (after 0.1% fee)
        // ~0.999 MOTO * 50 ratio = ~49.95 PILL received
        // PnL = 49.95 - 5 (premium) - 40 (paid) = ~4.95
        expect(pnl).not.toBeNull();
        expect(pnl!).toBeGreaterThan(0);
    });

    it('returns null when motoPillRatio is null', () => {
        expect(calcExercisePnl(makeOption(), makePoolInfo(), null)).toBeNull();
    });

    it('returns null when motoPillRatio is 0', () => {
        expect(calcExercisePnl(makeOption(), makePoolInfo(), 0)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// blocksToYears
// ---------------------------------------------------------------------------
describe('blocksToYears', () => {
    it('converts blocks to years (52560 blocks/year)', () => {
        expect(blocksToYears(52560)).toBeCloseTo(1.0, 2);
        expect(blocksToYears(26280)).toBeCloseTo(0.5, 2);
    });

    it('returns 0 for 0 blocks', () => {
        expect(blocksToYears(0)).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// cumulativeNormal
// ---------------------------------------------------------------------------
describe('cumulativeNormal', () => {
    it('N(0) = 0.5', () => {
        expect(cumulativeNormal(0)).toBeCloseTo(0.5, 6);
    });

    it('N(+inf) approaches 1', () => {
        expect(cumulativeNormal(10)).toBeCloseTo(1.0, 6);
    });

    it('N(-inf) approaches 0', () => {
        expect(cumulativeNormal(-10)).toBeCloseTo(0.0, 6);
    });

    it('N(1) ≈ 0.8413', () => {
        expect(cumulativeNormal(1)).toBeCloseTo(0.8413, 3);
    });

    it('N(-1) ≈ 0.1587', () => {
        expect(cumulativeNormal(-1)).toBeCloseTo(0.1587, 3);
    });
});

// ---------------------------------------------------------------------------
// blackScholesPremium
// ---------------------------------------------------------------------------
describe('blackScholesPremium', () => {
    it('ATM CALL has positive premium', () => {
        const premium = blackScholesPremium({
            spot: 50,
            strike: 50,
            timeYears: 30 / 365,  // 30 days
            volatility: 0.8,
            optionType: OptionType.CALL,
        });
        expect(premium).toBeGreaterThan(0n);
    });

    it('deep OTM CALL has small premium', () => {
        const otm = blackScholesPremium({
            spot: 50,
            strike: 200,
            timeYears: 7 / 365,
            volatility: 0.8,
            optionType: OptionType.CALL,
        });
        const atm = blackScholesPremium({
            spot: 50,
            strike: 50,
            timeYears: 7 / 365,
            volatility: 0.8,
            optionType: OptionType.CALL,
        });
        expect(otm).toBeLessThan(atm);
    });

    it('PUT premium via put-call parity', () => {
        const callPremium = blackScholesPremium({
            spot: 50,
            strike: 50,
            timeYears: 30 / 365,
            volatility: 0.8,
            optionType: OptionType.CALL,
        });
        const putPremium = blackScholesPremium({
            spot: 50,
            strike: 50,
            timeYears: 30 / 365,
            volatility: 0.8,
            optionType: OptionType.PUT,
        });
        // ATM: call ≈ put when r=0
        // With r=0, put-call parity: C - P = S - K, so for ATM (S=K): C ≈ P
        const callFloat = Number(callPremium) / 1e18;
        const putFloat = Number(putPremium) / 1e18;
        expect(Math.abs(callFloat - putFloat)).toBeLessThan(0.01);
    });

    it('longer expiry increases premium', () => {
        const short = blackScholesPremium({
            spot: 50,
            strike: 50,
            timeYears: 7 / 365,
            volatility: 0.8,
            optionType: OptionType.CALL,
        });
        const long = blackScholesPremium({
            spot: 50,
            strike: 50,
            timeYears: 90 / 365,
            volatility: 0.8,
            optionType: OptionType.CALL,
        });
        expect(long).toBeGreaterThan(short);
    });

    it('higher volatility increases premium', () => {
        const lowVol = blackScholesPremium({
            spot: 50,
            strike: 50,
            timeYears: 30 / 365,
            volatility: 0.3,
            optionType: OptionType.CALL,
        });
        const highVol = blackScholesPremium({
            spot: 50,
            strike: 50,
            timeYears: 30 / 365,
            volatility: 1.5,
            optionType: OptionType.CALL,
        });
        expect(highVol).toBeGreaterThan(lowVol);
    });

    it('returns 0n when timeYears is 0', () => {
        const result = blackScholesPremium({
            spot: 50,
            strike: 50,
            timeYears: 0,
            volatility: 0.8,
            optionType: OptionType.CALL,
        });
        expect(result).toBe(0n);
    });

    it('returns 0n when spot is 0', () => {
        const result = blackScholesPremium({
            spot: 0,
            strike: 50,
            timeYears: 30 / 365,
            volatility: 0.8,
            optionType: OptionType.CALL,
        });
        expect(result).toBe(0n);
    });
});

// ---------------------------------------------------------------------------
// calcDelta
// ---------------------------------------------------------------------------
describe('calcDelta', () => {
    it('ATM CALL delta ≈ 0.5', () => {
        const delta = calcDelta({
            spot: 50,
            strike: 50,
            timeYears: 30 / 365,
            volatility: 0.8,
            optionType: OptionType.CALL,
        });
        expect(delta).toBeGreaterThan(0.4);
        expect(delta).toBeLessThan(0.7);
    });

    it('deep ITM CALL delta approaches 1', () => {
        const delta = calcDelta({
            spot: 200,
            strike: 50,
            timeYears: 30 / 365,
            volatility: 0.8,
            optionType: OptionType.CALL,
        });
        expect(delta).toBeGreaterThan(0.95);
    });

    it('PUT delta is negative', () => {
        const delta = calcDelta({
            spot: 50,
            strike: 50,
            timeYears: 30 / 365,
            volatility: 0.8,
            optionType: OptionType.PUT,
        });
        expect(delta).toBeLessThan(0);
        expect(delta).toBeGreaterThan(-1);
    });

    it('CALL delta + |PUT delta| ≈ 1', () => {
        const params = { spot: 50, strike: 60, timeYears: 30 / 365, volatility: 0.8 };
        const callDelta = calcDelta({ ...params, optionType: OptionType.CALL });
        const putDelta = calcDelta({ ...params, optionType: OptionType.PUT });
        expect(callDelta + Math.abs(putDelta)).toBeCloseTo(1.0, 2);
    });
});

// ---------------------------------------------------------------------------
// calcTheta
// ---------------------------------------------------------------------------
describe('calcTheta', () => {
    it('theta is negative (time decay costs the holder)', () => {
        const theta = calcTheta({
            spot: 50,
            strike: 50,
            timeYears: 30 / 365,
            volatility: 0.8,
            optionType: OptionType.CALL,
        });
        expect(theta).toBeLessThan(0);
    });

    it('ATM option has larger theta than OTM', () => {
        const params = { timeYears: 30 / 365, volatility: 0.8, optionType: OptionType.CALL as number };
        const atmTheta = calcTheta({ ...params, spot: 50, strike: 50 });
        const otmTheta = calcTheta({ ...params, spot: 50, strike: 200 });
        // Both negative; ATM more negative = more decay
        expect(Math.abs(atmTheta)).toBeGreaterThan(Math.abs(otmTheta));
    });

    it('returns 0 when time is 0', () => {
        expect(calcTheta({
            spot: 50,
            strike: 50,
            timeYears: 0,
            volatility: 0.8,
            optionType: OptionType.CALL,
        })).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// calcPayoffCurve
// ---------------------------------------------------------------------------
describe('calcPayoffCurve', () => {
    it('returns ~100 data points', () => {
        const opt = makeOption();
        const curve = calcPayoffCurve(opt, 50, 100n);
        expect(curve.length).toBeGreaterThanOrEqual(90);
        expect(curve.length).toBeLessThanOrEqual(110);
    });

    it('CALL payoff: negative at low prices, positive at high prices', () => {
        const opt = makeOption({
            optionType: OptionType.CALL,
            strikePrice: 50n * ONE,
            premium: 5n * ONE,
        });
        const curve = calcPayoffCurve(opt, 50, 100n);

        // Far below strike → negative (lost premium)
        const lowPoint = curve.find(p => p.price < 30);
        expect(lowPoint).toBeTruthy();
        expect(lowPoint!.pnl).toBeLessThan(0);

        // Far above strike → positive
        const highPoint = curve.find(p => p.price > 80);
        expect(highPoint).toBeTruthy();
        expect(highPoint!.pnl).toBeGreaterThan(0);
    });

    it('PUT payoff: positive at low prices, negative at high prices', () => {
        const opt = makeOption({
            optionType: OptionType.PUT,
            strikePrice: 50n * ONE,
            premium: 5n * ONE,
        });
        const curve = calcPayoffCurve(opt, 50, 100n);

        // Far below strike → positive
        const lowPoint = curve.find(p => p.price < 20);
        expect(lowPoint).toBeTruthy();
        expect(lowPoint!.pnl).toBeGreaterThan(0);

        // Far above strike → negative (lost premium)
        const highPoint = curve.find(p => p.price > 80);
        expect(highPoint).toBeTruthy();
        expect(highPoint!.pnl).toBeLessThan(0);
    });

    it('max loss for CALL buyer is premium + fee', () => {
        const premium = 5n * ONE;
        const opt = makeOption({
            optionType: OptionType.CALL,
            strikePrice: 50n * ONE,
            premium,
        });
        const curve = calcPayoffCurve(opt, 50, 100n);
        const minPnl = Math.min(...curve.map(p => p.pnl));
        const totalCostFloat = Number(calcTotalCost(premium, 100n)) / 1e18;
        expect(Math.abs(minPnl + totalCostFloat)).toBeLessThan(0.01);
    });
});
