/**
 * PoolListPage — searchable grouped list of all discovered pools.
 * Route: /pools
 *
 * Pools are grouped into inverse pairs (e.g. MOTO/BTC ↔ BTC/MOTO) for
 * clearer navigation. Each group shows a shared market header with
 * side-by-side pool cards.
 */
import { useState, useMemo } from 'react';
import { useFallbackProvider } from '../hooks/useFallbackProvider.ts';
import { useDiscoverPools } from '../hooks/useDiscoverPools.ts';
import { CONTRACT_ADDRESSES, findPoolConfigByAddress } from '../config/index.ts';
import { PoolGroupRow } from '../components/PoolGroupRow.tsx';
import { groupInversePairs } from '../utils/poolGrouping.ts';
import { PoolListSkeleton } from '../components/LoadingSkeletons.tsx';
import type { PoolEntry } from '../services/types.ts';

export function PoolListPage() {
    const readProvider = useFallbackProvider();
    const { pools, loading, error, refetch } = useDiscoverPools(readProvider);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search.trim()) return pools;
        const q = search.trim().toLowerCase();
        return pools.filter(
            (p) =>
                p.address.toLowerCase().includes(q) ||
                (p.poolId && p.poolId.toLowerCase().includes(q)) ||
                (p.underlyingSymbol && p.underlyingSymbol.toLowerCase().includes(q)) ||
                (p.premiumSymbol && p.premiumSymbol.toLowerCase().includes(q)),
        );
    }, [pools, search]);

    const groups = useMemo(
        () => groupInversePairs(filtered, (p: PoolEntry) => findPoolConfigByAddress(p.address)),
        [filtered],
    );

    // No pool source configured
    if (!CONTRACT_ADDRESSES.factory && !CONTRACT_ADDRESSES.pool) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-16 text-center">
                <p className="text-terminal-text-muted font-mono text-sm">
                    No pool source configured. Set{' '}
                    <code className="neon-orange">VITE_FACTORY_ADDRESS</code> or{' '}
                    <code className="neon-orange">VITE_POOL_ADDRESS</code> in your{' '}
                    <code className="neon-orange">.env</code> file.
                </p>
            </div>
        );
    }

    if (loading) return <PoolListSkeleton />;

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-4">
            <h1 className="text-lg font-bold text-terminal-text-primary font-mono">Pools</h1>

            {/* Error state */}
            {error && (
                <div className="bg-terminal-bg-elevated border border-rose-700 rounded-xl p-6 text-center">
                    <p className="text-rose-400 font-mono text-sm mb-3">{error}</p>
                    <button onClick={refetch} className="btn-secondary px-4 py-2 text-sm rounded">
                        Retry
                    </button>
                </div>
            )}

            {/* Empty state */}
            {!error && pools.length === 0 && (
                <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-8 text-center">
                    <p className="text-terminal-text-muted font-mono text-sm">
                        No pools discovered yet.
                    </p>
                </div>
            )}

            {/* Search + grouped list */}
            {!error && pools.length > 0 && (
                <>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by symbol, pool ID, or address..."
                        className="w-full max-w-sm bg-terminal-bg-elevated border border-terminal-border-subtle rounded px-3 py-2 text-sm font-mono text-terminal-text-primary placeholder:text-terminal-text-muted focus:outline-none focus:border-accent"
                        data-testid="pool-search"
                    />

                    {groups.length === 0 ? (
                        <p className="text-terminal-text-muted font-mono text-sm" data-testid="no-match">
                            No pools match &quot;{search}&quot;
                        </p>
                    ) : (
                        <div className="space-y-4" data-testid="pool-grid">
                            {groups.map((group) => (
                                <PoolGroupRow
                                    key={group.sortKey}
                                    group={group}
                                    provider={readProvider}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
