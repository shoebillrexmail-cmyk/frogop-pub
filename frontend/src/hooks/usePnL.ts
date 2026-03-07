/**
 * usePnL — unrealized P&L for purchased options.
 *
 * Synchronous useMemo hook — no RPC calls.
 * Computes intrinsic value vs. premium paid, in PILL terms.
 */
import { useMemo } from 'react';
import { OptionType, OptionStatus } from '../services/types.js';
import type { OptionData } from '../services/types.js';

interface PnLResult {
    /** Total unrealized P&L in PILL (float), null if no data */
    totalPnlPill: number | null;
    /** Per-option P&L map: optionId → P&L in PILL */
    perOption: Map<bigint, number>;
}

/**
 * Compute unrealized P&L for purchased options using current spot.
 *
 * @param options - Array of options (filters to PURCHASED internally)
 * @param motoPillRatio - Current MOTO/PILL spot (float), e.g. 50 = 1 MOTO costs 50 PILL
 */
export function usePnL(
    options: OptionData[],
    motoPillRatio: number | null,
): PnLResult {
    return useMemo(() => {
        const perOption = new Map<bigint, number>();

        if (motoPillRatio === null || motoPillRatio <= 0 || options.length === 0) {
            return { totalPnlPill: null, perOption };
        }

        const purchased = options.filter(o => o.status === OptionStatus.PURCHASED);
        if (purchased.length === 0) {
            return { totalPnlPill: null, perOption };
        }

        let total = 0;
        for (const opt of purchased) {
            const spot = motoPillRatio;
            const strike = Number(opt.strikePrice) / 1e18;
            const amount = Number(opt.underlyingAmount) / 1e18;
            const premiumPaid = Number(opt.premium) / 1e18;

            let intrinsic: number;
            if (opt.optionType === OptionType.CALL) {
                intrinsic = Math.max(spot - strike, 0) * amount;
            } else {
                intrinsic = Math.max(strike - spot, 0) * amount;
            }

            const pnl = intrinsic - premiumPaid;
            perOption.set(opt.id, pnl);
            total += pnl;
        }

        return { totalPnlPill: total, perOption };
    }, [options, motoPillRatio]);
}
