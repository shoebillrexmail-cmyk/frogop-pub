/**
 * PoolListPage — searchable grid of all discovered pools.
 * Route: /pools
 */
import { useState, useMemo } from 'react';
import { useFallbackProvider } from '../hooks/useFallbackProvider.ts';
import { useDiscoverPools } from '../hooks/useDiscoverPools.ts';
import { CONTRACT_ADDRESSES } from '../config/index.ts';
import { PoolCard } from '../components/PoolCard.tsx';
import { PoolListSkeleton } from '../components/LoadingSkeletons.tsx';

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

            {/* Search + grid */}
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

                    {filtered.length === 0 ? (
                        <p className="text-terminal-text-muted font-mono text-sm" data-testid="no-match">
                            No pools match &quot;{search}&quot;
                        </p>
                    ) : (
                        <div
                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                            data-testid="pool-grid"
                        >
                            {filtered.map((pool) => (
                                <PoolCard key={pool.address} pool={pool} provider={readProvider} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
