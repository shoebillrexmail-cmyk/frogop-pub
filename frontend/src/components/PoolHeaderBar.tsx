/**
 * PoolHeaderBar — compact horizontal header bar showing pool essentials.
 *
 * Replaces the larger PoolInfoCard on the redesigned pool page.
 * Collapsible "Pool Details" section for addresses and grace period.
 */
import { useState } from 'react';
import type { PoolInfo } from '../services/types.ts';
import { formatAddress, blocksToTime } from '../config/index.ts';
import { PoolTypeBadge } from './PoolTypeBadge.tsx';
import type { PoolType } from '../../../shared/pool-config.types.ts';

interface PoolHeaderBarProps {
    poolInfo: PoolInfo;
    poolAddress: string;
    motoPillRatio?: number | null;
    priceLastUpdated?: Date | null;
    underlyingSymbol?: string;
    premiumSymbol?: string;
    poolType?: PoolType;
}

function bpsToPct(bps: bigint): string {
    return `${Number(bps) / 100}%`;
}

function freshnessLabel(lastUpdated: Date | null | undefined): { text: string; color: string } | null {
    if (!lastUpdated) return null;
    const mins = Math.round((Date.now() - lastUpdated.getTime()) / 60_000);
    if (mins < 1) return { text: 'just now', color: 'text-green-400' };
    if (mins <= 5) return { text: `${mins}m ago`, color: 'text-green-400' };
    if (mins <= 30) return { text: `${mins}m ago`, color: 'text-amber-400' };
    return { text: `${mins}m ago`, color: 'text-rose-400' };
}

export function PoolHeaderBar({ poolInfo, poolAddress, motoPillRatio, priceLastUpdated, underlyingSymbol = 'MOTO', premiumSymbol = 'PILL', poolType = 0 }: PoolHeaderBarProps) {
    const [detailsOpen, setDetailsOpen] = useState(false);
    const freshness = freshnessLabel(priceLastUpdated);
    const feeSummary = `${bpsToPct(poolInfo.buyFeeBps)} / ${bpsToPct(poolInfo.exerciseFeeBps)} / ${bpsToPct(poolInfo.cancelFeeBps)}`;

    return (
        <div
            className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl px-4 py-3"
            data-testid="pool-header-bar"
        >
            {/* Top row */}
            <div className="flex items-center gap-4 flex-wrap text-sm font-mono">
                <span className="font-bold text-terminal-text-primary" data-testid="pool-name">
                    {underlyingSymbol} / {premiumSymbol} Pool
                </span>
                {poolType !== 0 && <PoolTypeBadge poolType={poolType} />}

                <span className="text-terminal-text-muted">
                    Spot:{' '}
                    <span className="text-terminal-text-primary" data-testid="spot-price">
                        {motoPillRatio != null && motoPillRatio > 0
                            ? `${motoPillRatio.toFixed(4)} ${premiumSymbol}`
                            : 'N/A'}
                    </span>
                    {freshness && (
                        <span className={`ml-1 text-xs ${freshness.color}`} data-testid="price-freshness">
                            ({freshness.text})
                        </span>
                    )}
                </span>

                <span className="text-terminal-text-muted" data-testid="fees-summary">
                    Fees: <span className="text-terminal-text-primary">{feeSummary}</span>
                </span>

                <span className="text-terminal-text-muted">
                    Options: <span className="text-terminal-text-primary">{poolInfo.optionCount.toString()}</span>
                </span>

                <span className="text-terminal-text-muted" title="Exercise window after option expiry">
                    Grace: <span className="text-terminal-text-primary">{blocksToTime(poolInfo.gracePeriodBlocks)}</span>
                </span>

                <button
                    onClick={() => setDetailsOpen((v) => !v)}
                    className="text-xs text-terminal-text-muted hover:text-terminal-text-primary transition-colors flex items-center gap-1 ml-auto"
                    data-testid="toggle-pool-details"
                >
                    <span className={`transition-transform ${detailsOpen ? 'rotate-90' : ''}`}>&#9654;</span>
                    Pool Details
                </button>
            </div>

            {/* Collapsible details */}
            {detailsOpen && (
                <div
                    className="mt-2 pt-2 border-t border-terminal-border-subtle flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-terminal-text-muted"
                    data-testid="pool-details"
                >
                    <span>
                        Pool: <span className="text-terminal-text-secondary">{formatAddress(poolAddress)}</span>
                    </span>
                    <span>
                        Underlying: <span className="text-terminal-text-secondary">{formatAddress(poolInfo.underlying)}</span>
                    </span>
                    <span>
                        Premium token: <span className="text-terminal-text-secondary">{formatAddress(poolInfo.premiumToken)}</span>
                    </span>
                    <span>
                        Grace period: <span className="text-terminal-text-secondary">{poolInfo.gracePeriodBlocks.toString()} blocks (~{blocksToTime(poolInfo.gracePeriodBlocks)})</span>
                    </span>
                    <span>
                        Buy: <span className="text-terminal-text-secondary">{bpsToPct(poolInfo.buyFeeBps)}</span>
                        {' | '}Exercise: <span className="text-terminal-text-secondary">{bpsToPct(poolInfo.exerciseFeeBps)}</span>
                        {' | '}Cancel: <span className="text-terminal-text-secondary">{bpsToPct(poolInfo.cancelFeeBps)}</span>
                    </span>
                </div>
            )}
        </div>
    );
}
