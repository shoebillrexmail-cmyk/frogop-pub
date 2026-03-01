/**
 * useSuggestedPremium — Black-Scholes suggested premium for option writers.
 *
 * Synchronous useMemo hook — no RPC calls. Returns null when inputs incomplete.
 */
import { useMemo } from 'react';
import { blackScholesPremium, blocksToYears } from '../utils/optionMath.js';

const DEFAULT_VOLATILITY = 0.8; // 80% annualized — typical for altcoins

interface SuggestedPremiumResult {
    /** Suggested premium in 18-decimal bigint, or null if inputs incomplete */
    suggestedPremium: bigint | null;
    /** Annualized volatility used */
    annualizedVol: number;
}

/**
 * Compute Black-Scholes suggested premium for an option.
 *
 * @param optionType - CALL (0) or PUT (1)
 * @param strikeStr - Strike price as decimal string (e.g. "50")
 * @param amountStr - Underlying amount as decimal string (e.g. "1")
 * @param expiryBlocks - Duration in blocks
 * @param motoPillRatio - Current MOTO/PILL spot price (float), or null
 * @param volatility - Annualized vol, default 0.8 (80%)
 */
export function useSuggestedPremium(
    optionType: number,
    strikeStr: string,
    amountStr: string,
    expiryBlocks: number,
    motoPillRatio: number | null,
    volatility: number = DEFAULT_VOLATILITY,
): SuggestedPremiumResult {
    const suggestedPremium = useMemo(() => {
        if (motoPillRatio === null || motoPillRatio <= 0) return null;

        const strike = parseFloat(strikeStr);
        const amount = parseFloat(amountStr);
        if (!strike || strike <= 0 || !amount || amount <= 0 || expiryBlocks <= 0) return null;

        const timeYears = blocksToYears(expiryBlocks);

        // BS gives premium per unit of underlying
        const perUnit = blackScholesPremium({
            spot: motoPillRatio,
            strike,
            timeYears,
            volatility,
            optionType,
        });

        if (perUnit <= 0n) return null;

        // Scale by amount: multiply by amount and normalize (amount is float, perUnit is 18-dec)
        // perUnit is already in PILL with 18 decimals, so multiply by amount
        const amountBig = BigInt(Math.round(amount * 1e18));
        return (perUnit * amountBig) / (10n ** 18n);
    }, [optionType, strikeStr, amountStr, expiryBlocks, motoPillRatio, volatility]);

    return { suggestedPremium, annualizedVol: volatility };
}
