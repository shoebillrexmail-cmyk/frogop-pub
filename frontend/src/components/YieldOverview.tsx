/**
 * YieldOverview — stat-grid card showing current market yields for writers.
 *
 * Computes averages from existing option data (no new RPC calls).
 * Shows personal stats when wallet is connected.
 */
import { useMemo } from 'react';
import { OptionType, OptionStatus } from '../services/types.ts';
import type { OptionData } from '../services/types.ts';
import { calcYield } from '../utils/optionMath.js';

interface YieldOverviewProps {
    options: OptionData[];
    motoPillRatio: number | null;
    walletHex: string | null;
}

function avgYield(values: (number | null)[]): number | null {
    const valid = values.filter((v): v is number => v !== null);
    if (valid.length === 0) return null;
    return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function YieldOverview({ options, motoPillRatio, walletHex }: YieldOverviewProps) {
    const stats = useMemo(() => {
        const openOptions = options.filter((o) => o.status === OptionStatus.OPEN);
        const openCalls = openOptions.filter((o) => o.optionType === OptionType.CALL);
        const openPuts = openOptions.filter((o) => o.optionType === OptionType.PUT);

        const callYields = openCalls.map((o) => calcYield(o, motoPillRatio));
        const putYields = openPuts.map((o) => calcYield(o));

        const avgCallYield = avgYield(callYields);
        const avgPutYield = avgYield(putYields);

        // Personal stats (when connected)
        let activeWrites = 0;
        let totalPremiumEarned = 0n;
        if (walletHex) {
            const myWrites = options.filter(
                (o) => o.writer.toLowerCase() === walletHex.toLowerCase() &&
                       o.status === OptionStatus.PURCHASED,
            );
            activeWrites = myWrites.length;
            totalPremiumEarned = myWrites.reduce((sum, o) => sum + o.premium, 0n);
        }

        return { avgCallYield, avgPutYield, activeWrites, totalPremiumEarned, hasOptions: openOptions.length > 0 };
    }, [options, motoPillRatio, walletHex]);

    return (
        <div
            className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-4"
            data-testid="yield-overview"
        >
            <h3 className="text-sm font-bold text-terminal-text-primary font-mono mb-3">
                Market Yields
            </h3>

            {!stats.hasOptions ? (
                <p className="text-xs text-terminal-text-muted font-mono" data-testid="yield-empty">
                    No open options yet
                </p>
            ) : (
                <div className="grid grid-cols-2 gap-3 text-sm font-mono">
                    <div data-testid="avg-call-yield">
                        <p className="text-[10px] text-terminal-text-muted">Avg CALL Yield</p>
                        <p className="text-green-400 font-semibold">
                            {stats.avgCallYield !== null ? `${stats.avgCallYield.toFixed(2)}%` : '—'}
                        </p>
                    </div>
                    <div data-testid="avg-put-yield">
                        <p className="text-[10px] text-terminal-text-muted">Avg PUT Yield</p>
                        <p className="text-rose-400 font-semibold">
                            {stats.avgPutYield !== null ? `${stats.avgPutYield.toFixed(2)}%` : '—'}
                        </p>
                    </div>
                    {walletHex ? (
                        <>
                            <div data-testid="active-writes">
                                <p className="text-[10px] text-terminal-text-muted">Your Active Writes</p>
                                <p className="text-terminal-text-primary">{stats.activeWrites}</p>
                            </div>
                            <div data-testid="total-premium">
                                <p className="text-[10px] text-terminal-text-muted">Premium Earned</p>
                                <p className="text-terminal-text-primary">
                                    {stats.totalPremiumEarned > 0n
                                        ? `${(Number(stats.totalPremiumEarned) / 1e18).toFixed(4)} PILL`
                                        : '0 PILL'}
                                </p>
                            </div>
                        </>
                    ) : (
                        <p className="col-span-2 text-[10px] text-terminal-text-muted" data-testid="connect-hint">
                            Connect wallet for personal stats
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
