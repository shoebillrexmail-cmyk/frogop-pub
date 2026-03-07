/**
 * usePnL tests — unrealized P&L for purchased options.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Override global mock from setup.ts — use real implementation
vi.unmock('../usePnL.ts');

import { usePnL } from '../usePnL.js';
import { OptionType, OptionStatus } from '../../services/types.js';
import type { OptionData } from '../../services/types.js';

const ONE = 10n ** 18n;

function makeOption(overrides: Partial<OptionData> = {}): OptionData {
    return {
        id: 1n,
        writer: '0x' + 'aa'.repeat(32),
        buyer: '0x' + 'bb'.repeat(32),
        optionType: OptionType.CALL,
        strikePrice: 40n * ONE,
        underlyingAmount: 1n * ONE,
        premium: 5n * ONE,
        expiryBlock: 10000n,
        status: OptionStatus.PURCHASED,
        ...overrides,
    };
}

describe('usePnL', () => {
    it('returns null when motoPillRatio is null', () => {
        const { result } = renderHook(() =>
            usePnL([makeOption()], null),
        );
        expect(result.current.totalPnlPill).toBeNull();
    });

    it('returns null when options array is empty', () => {
        const { result } = renderHook(() =>
            usePnL([], 50),
        );
        expect(result.current.totalPnlPill).toBeNull();
    });

    it('computes positive PnL for ITM CALL', () => {
        // spot=60, strike=40, amount=1 → intrinsic = 20 PILL, premium paid = 5 → PnL = +15
        const { result } = renderHook(() =>
            usePnL([makeOption({ strikePrice: 40n * ONE })], 60),
        );
        expect(result.current.totalPnlPill).not.toBeNull();
        expect(result.current.totalPnlPill!).toBeCloseTo(15.0, 0);
    });

    it('computes negative PnL for OTM CALL', () => {
        // spot=30, strike=40 → intrinsic = 0, premium paid = 5 → PnL = -5
        const { result } = renderHook(() =>
            usePnL([makeOption({ strikePrice: 40n * ONE })], 30),
        );
        expect(result.current.totalPnlPill).not.toBeNull();
        expect(result.current.totalPnlPill!).toBeCloseTo(-5.0, 0);
    });

    it('computes positive PnL for ITM PUT', () => {
        // spot=30, strike=50, amount=1 → intrinsic = 20 PILL, premium = 5 → PnL = +15
        const { result } = renderHook(() =>
            usePnL([makeOption({
                optionType: OptionType.PUT,
                strikePrice: 50n * ONE,
                premium: 5n * ONE,
            })], 30),
        );
        expect(result.current.totalPnlPill).not.toBeNull();
        expect(result.current.totalPnlPill!).toBeCloseTo(15.0, 0);
    });

    it('sums PnL across multiple options', () => {
        const options = [
            makeOption({ id: 1n, strikePrice: 40n * ONE, premium: 5n * ONE }),  // ITM: +15
            makeOption({ id: 2n, strikePrice: 80n * ONE, premium: 3n * ONE }),  // OTM: -3
        ];
        const { result } = renderHook(() =>
            usePnL(options, 60),
        );
        // Option 1: max(60-40,0)*1 - 5 = +15
        // Option 2: max(60-80,0)*1 - 3 = -3
        // Total: +12
        expect(result.current.totalPnlPill).toBeCloseTo(12.0, 0);
    });

    it('populates perOption map', () => {
        const options = [
            makeOption({ id: 1n, strikePrice: 40n * ONE, premium: 5n * ONE }),
            makeOption({ id: 2n, strikePrice: 80n * ONE, premium: 3n * ONE }),
        ];
        const { result } = renderHook(() =>
            usePnL(options, 60),
        );
        expect(result.current.perOption.size).toBe(2);
        expect(result.current.perOption.get(1n)).toBeCloseTo(15.0, 0);
        expect(result.current.perOption.get(2n)).toBeCloseTo(-3.0, 0);
    });

    it('skips non-PURCHASED options', () => {
        const options = [
            makeOption({ id: 1n, status: OptionStatus.OPEN }),
            makeOption({ id: 2n, status: OptionStatus.PURCHASED, strikePrice: 40n * ONE }),
        ];
        const { result } = renderHook(() =>
            usePnL(options, 60),
        );
        expect(result.current.perOption.size).toBe(1);
        expect(result.current.perOption.has(2n)).toBe(true);
    });
});
