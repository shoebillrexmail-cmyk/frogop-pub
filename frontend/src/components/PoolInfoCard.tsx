/**
 * PoolInfoCard — displays pool metadata (tokens, fees, option count, grace period).
 */
import type { PoolInfo } from '../services/types.ts';
import { formatAddress } from '../config/index.ts';

interface PoolInfoCardProps {
    poolInfo: PoolInfo;
    poolAddress: string;
    motoPillRatio?: number | null;
    priceLastUpdated?: Date | null;
    onWriteOption?: () => void;
}

function freshnessLabel(lastUpdated: Date | null | undefined): { text: string; color: string } | null {
    if (!lastUpdated) return null;
    const mins = Math.round((Date.now() - lastUpdated.getTime()) / 60_000);
    if (mins < 1) return { text: 'just now', color: 'text-green-400' };
    if (mins <= 5) return { text: `${mins}m ago`, color: 'text-green-400' };
    if (mins <= 30) return { text: `${mins}m ago`, color: 'text-amber-400' };
    return { text: `${mins}m ago`, color: 'text-rose-400' };
}

function bpsToPct(bps: bigint): string {
    return `${Number(bps) / 100}%`;
}

export function PoolInfoCard({ poolInfo, poolAddress, motoPillRatio, priceLastUpdated, onWriteOption }: PoolInfoCardProps) {
    const freshness = freshnessLabel(priceLastUpdated);
    const inverse = motoPillRatio != null && motoPillRatio > 0 ? 1 / motoPillRatio : null;
    return (
        <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
                <div>
                    <h2 className="text-lg font-bold text-terminal-text-primary font-mono">
                        MOTO / PILL Pool
                    </h2>
                    <p className="text-xs text-terminal-text-muted font-mono mt-0.5">
                        {formatAddress(poolAddress)}
                    </p>
                </div>
                <button
                    onClick={onWriteOption}
                    disabled={!onWriteOption}
                    className="btn-primary px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                    title={onWriteOption ? undefined : 'Connect wallet to write options'}
                >
                    {onWriteOption ? 'Write Option' : 'Connect wallet'}
                    <span className="text-base leading-none">+</span>
                </button>
            </div>

            <hr className="border-terminal-border-subtle mb-3" />

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm font-mono">
                <span className="text-terminal-text-muted">
                    Options:{' '}
                    <span className="text-terminal-text-primary">{poolInfo.optionCount.toString()}</span>
                </span>
                <span className="text-terminal-text-muted">
                    Buy fee:{' '}
                    <span className="text-terminal-text-primary">{bpsToPct(poolInfo.buyFeeBps)}</span>
                </span>
                <span className="text-terminal-text-muted">
                    Exercise fee:{' '}
                    <span className="text-terminal-text-primary">{bpsToPct(poolInfo.exerciseFeeBps)}</span>
                </span>
                <span className="text-terminal-text-muted">
                    Cancel fee:{' '}
                    <span className="text-terminal-text-primary">{bpsToPct(poolInfo.cancelFeeBps)}</span>
                </span>
                <span className="text-terminal-text-muted">
                    Grace period:{' '}
                    <span className="text-terminal-text-primary">
                        {poolInfo.gracePeriodBlocks.toString()} blocks (~24h)
                    </span>
                </span>
                <span className="text-terminal-text-muted">
                    1 MOTO ={' '}
                    <span className="text-terminal-text-primary">
                        {motoPillRatio != null ? `~${motoPillRatio.toFixed(4)} PILL` : 'N/A'}
                    </span>
                </span>
                {inverse != null && (
                    <span className="text-terminal-text-muted">
                        1 PILL ={' '}
                        <span className="text-terminal-text-primary">
                            ~{inverse.toFixed(4)} MOTO
                        </span>
                    </span>
                )}
                {freshness && (
                    <span className={`${freshness.color}`} data-testid="price-freshness">
                        updated {freshness.text}
                    </span>
                )}
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono mt-2 text-terminal-text-muted">
                <span>
                    Underlying:{' '}
                    <span className="text-terminal-text-secondary">{formatAddress(poolInfo.underlying)}</span>
                </span>
                <span>
                    Premium:{' '}
                    <span className="text-terminal-text-secondary">{formatAddress(poolInfo.premiumToken)}</span>
                </span>
            </div>
        </div>
    );
}
