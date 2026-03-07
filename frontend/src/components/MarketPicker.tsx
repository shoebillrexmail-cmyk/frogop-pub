/**
 * MarketPicker — market selection grid for Trade wizard Step 2.
 *
 * Shows available pools filtered/ranked by the selected intent.
 * Groups inverse pairs and displays pool type badges.
 */
import { useFallbackProvider } from '../hooks/useFallbackProvider.ts';
import { useDiscoverPools } from '../hooks/useDiscoverPools.ts';
import { groupInversePairs, directionLabel } from '../utils/poolGrouping.ts';
import { findPoolConfigByAddress, getPoolType } from '../config/index.ts';
import { PoolTypeBadge } from './PoolTypeBadge.tsx';
import type { IntentId } from '../utils/intentDefs.ts';
import type { PoolEntry } from '../services/types.ts';

interface MarketPickerProps {
    intentId: IntentId;
    onSelect: (poolAddress: string) => void;
}

export function MarketPicker({ intentId, onSelect }: MarketPickerProps) {
    const readProvider = useFallbackProvider();
    const { pools, loading, error } = useDiscoverPools(readProvider);

    const findConfig = (pool: PoolEntry) => findPoolConfigByAddress(pool.address);
    const groups = groupInversePairs(pools, findConfig);

    if (loading) {
        return (
            <div data-testid="market-picker-loading" className="text-center py-8">
                <p className="text-sm text-terminal-text-muted font-mono">Loading markets...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div data-testid="market-picker-error" className="text-center py-8">
                <p className="text-sm text-rose-400 font-mono">{error}</p>
            </div>
        );
    }

    if (groups.length === 0) {
        return (
            <div data-testid="market-picker-empty" className="text-center py-8">
                <p className="text-sm text-terminal-text-muted font-mono">No markets available.</p>
            </div>
        );
    }

    return (
        <div data-testid="market-picker">
            <h2 className="text-lg font-bold text-terminal-text-primary font-mono mb-2">
                Pick a Market
            </h2>
            <p className="text-xs text-terminal-text-muted font-mono mb-4">
                {intentId === 'earn-yield' && 'Choose a market where you want to write options and earn premium.'}
                {intentId === 'protect' && 'Choose a market where you want to buy protection.'}
                {intentId === 'speculate-up' && 'Choose a market where you expect the price to rise.'}
                {intentId === 'speculate-down' && 'Choose a market where you expect the price to fall.'}
                {intentId === 'earn-both' && 'Choose a market where you want to earn premium from both sides.'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {groups.map((group) => (
                    <div
                        key={group.sortKey}
                        className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-4"
                    >
                        <h3 className="text-sm font-bold text-terminal-text-primary font-mono mb-2">
                            {group.market}
                        </h3>
                        <div className="space-y-2">
                            {group.pools.map((pool) => {
                                if (!pool) return null;
                                const config = findConfig(pool);
                                const poolType = getPoolType(config);
                                return (
                                    <button
                                        key={pool.address}
                                        onClick={() => onSelect(pool.address)}
                                        className="w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-terminal-border-subtle hover:border-accent/50 transition-colors"
                                        data-testid={`market-pool-${pool.address}`}
                                    >
                                        <div className="min-w-0">
                                            <span className="text-xs font-mono text-terminal-text-primary">
                                                {pool.underlyingSymbol ?? 'Token A'}/{pool.premiumSymbol ?? 'Token B'}
                                            </span>
                                            <p className="text-[10px] font-mono text-terminal-text-muted">
                                                {directionLabel(pool, poolType)}
                                            </p>
                                        </div>
                                        <PoolTypeBadge poolType={poolType} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
