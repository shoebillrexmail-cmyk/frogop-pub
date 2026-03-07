/**
 * useSuggestedPremium tests — Black-Scholes suggested premium hook.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Override global mock from setup.ts — use real implementation
vi.unmock('../useSuggestedPremium.ts');

import { useSuggestedPremium } from '../useSuggestedPremium.js';
import { OptionType } from '../../services/types.js';

describe('useSuggestedPremium', () => {
    it('returns null when motoPillRatio is null', () => {
        const { result } = renderHook(() =>
            useSuggestedPremium(OptionType.CALL, '50', '1', 1008, null),
        );
        expect(result.current.suggestedPremium).toBeNull();
    });

    it('returns null when strike is empty', () => {
        const { result } = renderHook(() =>
            useSuggestedPremium(OptionType.CALL, '', '1', 1008, 50),
        );
        expect(result.current.suggestedPremium).toBeNull();
    });

    it('returns null when amount is empty', () => {
        const { result } = renderHook(() =>
            useSuggestedPremium(OptionType.CALL, '50', '', 1008, 50),
        );
        expect(result.current.suggestedPremium).toBeNull();
    });

    it('returns null when expiryBlocks is 0', () => {
        const { result } = renderHook(() =>
            useSuggestedPremium(OptionType.CALL, '50', '1', 0, 50),
        );
        expect(result.current.suggestedPremium).toBeNull();
    });

    it('computes positive premium for ATM CALL', () => {
        const { result } = renderHook(() =>
            useSuggestedPremium(OptionType.CALL, '50', '1', 1008, 50),
        );
        expect(result.current.suggestedPremium).not.toBeNull();
        expect(result.current.suggestedPremium!).toBeGreaterThan(0n);
    });

    it('computes positive premium for ATM PUT', () => {
        const { result } = renderHook(() =>
            useSuggestedPremium(OptionType.PUT, '50', '1', 1008, 50),
        );
        expect(result.current.suggestedPremium).not.toBeNull();
        expect(result.current.suggestedPremium!).toBeGreaterThan(0n);
    });

    it('scales with amount (2x amount ≈ 2x premium)', () => {
        const { result: r1 } = renderHook(() =>
            useSuggestedPremium(OptionType.CALL, '50', '1', 1008, 50),
        );
        const { result: r2 } = renderHook(() =>
            useSuggestedPremium(OptionType.CALL, '50', '2', 1008, 50),
        );
        const p1 = Number(r1.current.suggestedPremium!);
        const p2 = Number(r2.current.suggestedPremium!);
        expect(p2 / p1).toBeCloseTo(2.0, 1);
    });

    it('uses default 80% volatility', () => {
        const { result } = renderHook(() =>
            useSuggestedPremium(OptionType.CALL, '50', '1', 1008, 50),
        );
        expect(result.current.annualizedVol).toBe(0.8);
    });

    it('accepts custom volatility', () => {
        const { result } = renderHook(() =>
            useSuggestedPremium(OptionType.CALL, '50', '1', 1008, 50, 1.2),
        );
        expect(result.current.annualizedVol).toBe(1.2);
    });
});
