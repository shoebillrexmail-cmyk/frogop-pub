/**
 * MarketPicker — market selection grid for Trade wizard Step 2.
 *
 * Shows available pools filtered/ranked by the selected intent.
 * Groups inverse pairs and displays pool type badges.
 * For buy-side intents, loads options to show liquidity indicators.
 */
import { useMemo } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useFallbackProvider } from '../hooks/useFallbackProvider.ts';
import { useDiscoverPools } from '../hooks/useDiscoverPools.ts';
import { useMultiPool } from '../hooks/useMultiPool.ts';
import { groupInversePairs, directionLabel } from '../utils/poolGrouping.ts';
import { countBuyableOptionsForIntent } from '../utils/strategyMath.ts';
import { intentNeedsLiquidity } from '../utils/intentDefs.ts';
import { findPoolConfigByAddress, getPoolType } from '../config/index.ts';
import { PoolTypeBadge } from './PoolTypeBadge.tsx';
import type { IntentId } from '../utils/intentDefs.ts';
import type { PoolEntry } from '../services/types.ts';

interface MarketPickerProps {
    intentId: IntentId;
    onSelect: (poolAddress: string) => void;
}

export function MarketPicker({ intentId, onSelect }: MarketPickerProps) {
    const { address } = useWalletConnect();
    const walletHex = address ? address.toString() : null;
    const readProvider = useFallbackProvider();
    const { pools, loading, error } = useDiscoverPools(readProvider);
    const needsLiquidity = intentNeedsLiquidity(intentId);

    // Only fetch options when the intent requires liquidity checks
    const poolAddresses = useMemo(
        () => needsLiquidity ? pools.map((p) => p.address) : [],
        [pools, needsLiquidity],
    );
    const { pools: multiPoolData } = useMultiPool(poolAddresses, readProvider);

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
                {intentId === 'expect-volatility' && 'Choose a market where you expect a big price move in either direction.'}
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

                                // Liquidity info for buy-side intents
                                const poolData = needsLiquidity ? multiPoolData.get(pool.address) : null;
                                const isLoadingOptions = poolData?.loading ?? false;
                                const buyableCount = poolData?.options
                                    ? countBuyableOptionsForIntent(poolData.options, intentId, walletHex)
                                    : 0;
                                const noLiquidity = needsLiquidity && !isLoadingOptions && buyableCount === 0;

                                return (
                                    <button
                                        key={pool.address}
                                        onClick={() => !noLiquidity && onSelect(pool.address)}
                                        disabled={noLiquidity}
                                        className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-colors ${
                                            noLiquidity
                                                ? 'border-terminal-border-subtle opacity-50 cursor-not-allowed'
                                                : 'border-terminal-border-subtle hover:border-accent/50 cursor-pointer'
                                        }`}
                                        data-testid={`market-pool-${pool.address}`}
                                    >
                                        <div className="min-w-0">
                                            <span className="text-xs font-mono text-terminal-text-primary">
                                                {pool.underlyingSymbol ?? 'Token A'}/{pool.premiumSymbol ?? 'Token B'}
                                            </span>
                                            <p className="text-[10px] font-mono text-terminal-text-muted">
                                                {directionLabel(pool, poolType)}
                                            </p>
                                            {/* Liquidity indicator for buy-side intents */}
                                            {needsLiquidity && (
                                                <p className="text-[10px] font-mono mt-0.5">
                                                    {isLoadingOptions ? (
                                                        <span className="text-terminal-text-muted">Loading options...</span>
                                                    ) : buyableCount > 0 ? (
                                                        <span className="text-green-400">
                                                            {buyableCount} option{buyableCount > 1 ? 's' : ''} available
                                                        </span>
                                                    ) : (
                                                        <span className="text-terminal-text-muted">No listings yet — waiting for writers</span>
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                        <PoolTypeBadge poolType={poolType} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Explain the P2P model for buy-side intents */}
            {needsLiquidity && (
                <div className="mt-4 bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-4 text-[11px] font-mono text-terminal-text-muted leading-relaxed">
                    <p className="font-bold text-terminal-text-primary mb-1">How does this work?</p>
                    <p>
                        This is a peer-to-peer marketplace. To buy an option, another user (a "writer") must first
                        list one for sale. If a market shows "No listings yet", you can either wait for a writer to
                        create one, or switch to the <span className="text-accent">Earn Yield</span> goal to list
                        your own options and earn fees from other users.
                    </p>
                </div>
            )}
        </div>
    );
}
