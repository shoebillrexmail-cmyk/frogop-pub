/**
 * PoolCard — clickable card linking to a pool's detail page.
 * Shows token pair, pool ID badge, truncated address, fees, and option count.
 * Fetches pool info on mount for live data.
 */
import { Link } from 'react-router-dom';
import { formatAddress, bpsToPct, findPoolConfigByAddress, getPoolType } from '../config/index.ts';
import { usePool } from '../hooks/usePool.ts';
import { PoolTypeBadge } from './PoolTypeBadge.tsx';
import type { AbstractRpcProvider } from 'opnet';
import type { PoolEntry } from '../services/types.ts';

interface PoolCardProps {
    pool: PoolEntry;
    provider?: AbstractRpcProvider | null;
}

export function PoolCard({ pool, provider }: PoolCardProps) {
    const { poolInfo, loading } = usePool(pool.address, provider ?? null);
    const poolConfig = findPoolConfigByAddress(pool.address);
    const poolType = getPoolType(poolConfig);

    const pairLabel =
        pool.underlyingSymbol && pool.premiumSymbol
            ? `${pool.underlyingSymbol} / ${pool.premiumSymbol}`
            : formatAddress(pool.address);

    return (
        <Link
            to={`/pools/${pool.address}`}
            className="block bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-5 hover:border-accent/50 transition-colors group"
            data-testid={`pool-card-${pool.address}`}
        >
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-terminal-text-primary font-mono group-hover:text-accent transition-colors">
                        {pairLabel}
                    </h3>
                    <PoolTypeBadge poolType={poolType} />
                </div>
                {pool.poolId && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-terminal-bg-primary border border-terminal-border-subtle text-terminal-text-muted">
                        {pool.poolId}
                    </span>
                )}
            </div>

            <p className="text-xs text-terminal-text-muted font-mono truncate mb-3" title={pool.address}>
                {formatAddress(pool.address)}
            </p>

            {/* Pool details */}
            {loading && (
                <div className="flex gap-3">
                    <div className="h-3 w-16 skeleton rounded" />
                    <div className="h-3 w-20 skeleton rounded" />
                </div>
            )}
            {!loading && poolInfo && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-terminal-text-muted">
                    <span>
                        Options: <span className="text-terminal-text-secondary">{poolInfo.optionCount.toString()}</span>
                    </span>
                    <span>
                        Buy: <span className="text-terminal-text-secondary">{bpsToPct(poolInfo.buyFeeBps)}</span>
                    </span>
                    <span>
                        Cancel: <span className="text-terminal-text-secondary">{bpsToPct(poolInfo.cancelFeeBps)}</span>
                    </span>
                    <span>
                        Exercise: <span className="text-terminal-text-secondary">{bpsToPct(poolInfo.exerciseFeeBps)}</span>
                    </span>
                </div>
            )}
        </Link>
    );
}
