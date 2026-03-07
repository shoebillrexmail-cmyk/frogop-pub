/**
 * ChainMarketTabs — tab bar for market switching on the Chain page.
 *
 * Shows a button per pool with pair label and pool type badge.
 */
import type { PoolEntry } from '../services/types.ts';
import { findPoolConfigByAddress, getPoolType } from '../config/index.ts';
import { PoolTypeBadge } from './PoolTypeBadge.tsx';

interface ChainMarketTabsProps {
    pools: PoolEntry[];
    selected: string | null;
    onSelect: (address: string) => void;
}

export function ChainMarketTabs({ pools, selected, onSelect }: ChainMarketTabsProps) {
    return (
        <div className="flex flex-wrap gap-2 mb-4" data-testid="chain-market-tabs">
            {pools.map((pool) => {
                const config = findPoolConfigByAddress(pool.address);
                const poolType = getPoolType(config);
                const isActive = selected === pool.address;
                const label = `${pool.underlyingSymbol ?? 'A'}/${pool.premiumSymbol ?? 'B'}`;

                return (
                    <button
                        key={pool.address}
                        onClick={() => onSelect(pool.address)}
                        className={`flex items-center gap-2 px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors ${
                            isActive
                                ? 'bg-accent text-terminal-bg-primary border-accent'
                                : 'text-terminal-text-muted border-terminal-border-subtle hover:text-terminal-text-primary hover:border-accent/50'
                        }`}
                        data-testid={`chain-tab-${pool.address}`}
                    >
                        <span>{label}</span>
                        {!isActive && <PoolTypeBadge poolType={poolType} />}
                    </button>
                );
            })}
        </div>
    );
}
