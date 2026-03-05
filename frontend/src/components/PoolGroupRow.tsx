/**
 * PoolGroupRow — renders a market group header with side-by-side pool cards.
 * Groups inverse pairs (e.g. MOTO/BTC ↔ BTC/MOTO) under a shared header.
 */
import type { AbstractRpcProvider } from 'opnet';
import type { PoolGroup } from '../utils/poolGrouping.ts';
import { getPoolType } from '../config/index.ts';
import { PoolCard } from './PoolCard.tsx';
import { PoolTypeBadge } from './PoolTypeBadge.tsx';

interface PoolGroupRowProps {
    group: PoolGroup;
    provider?: AbstractRpcProvider | null;
}

export function PoolGroupRow({ group, provider }: PoolGroupRowProps) {
    const { market, pools, configs } = group;
    const hasTwoPools = pools[1] !== undefined;

    return (
        <div
            className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl overflow-hidden"
            data-testid={`pool-group-${group.sortKey}`}
        >
            {/* Group header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border-subtle bg-terminal-bg-primary/50">
                <div className="flex items-center gap-3">
                    <h2 className="text-sm font-bold text-terminal-text-primary font-mono">
                        {market}
                    </h2>
                    <div className="flex gap-1">
                        {configs[0] && <PoolTypeBadge poolType={getPoolType(configs[0])} />}
                        {configs[1] && getPoolType(configs[1]) !== getPoolType(configs[0]) && (
                            <PoolTypeBadge poolType={getPoolType(configs[1])} />
                        )}
                    </div>
                </div>
            </div>

            {/* Pool cards — side by side on md+, stacked on mobile */}
            <div className={`grid gap-0 divide-x divide-terminal-border-subtle ${hasTwoPools ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
                <PoolCard
                    pool={pools[0]}
                    provider={provider}
                    compact
                />
                {pools[1] && (
                    <PoolCard
                        pool={pools[1]}
                        provider={provider}
                        compact
                    />
                )}
            </div>
        </div>
    );
}
