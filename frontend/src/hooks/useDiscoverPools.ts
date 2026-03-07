/**
 * useDiscoverPools — discovers available pools from pools.config.json.
 *
 * Primary source: pools.config.json (bundled at build time, all 6 pools).
 * Fallback: factory registry or single env-configured pool address.
 *
 * Using the config file avoids sequential RPC calls to the factory and
 * doesn't depend on whether pools are registered in the factory contract.
 */
import { useState, useEffect, useCallback } from 'react';
import type { AbstractRpcProvider } from 'opnet';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { FactoryService } from '../services/factory.ts';
import { CONTRACT_ADDRESSES, getAllPoolConfigs } from '../config/index.ts';
import type { PoolEntry } from '../services/types.ts';

export type PoolSource = 'config' | 'factory' | 'env' | null;

export interface UseDiscoverPoolsResult {
    pools: PoolEntry[];
    loading: boolean;
    error: string | null;
    /** Where the pool list came from */
    source: PoolSource;
    /** Re-fetch pools from the factory / env */
    refetch: () => void;
}

export function useDiscoverPools(providerOverride?: AbstractRpcProvider | null): UseDiscoverPoolsResult {
    const { provider: walletProvider } = useWalletConnect();
    const provider = providerOverride ?? walletProvider;

    const [pools, setPools] = useState<PoolEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [source, setSource] = useState<PoolSource>(null);
    const [fetchCount, setFetchCount] = useState(0);

    const refetch = useCallback(() => {
        setFetchCount((n) => n + 1);
    }, []);

    useEffect(() => {
        if (!provider) return;

        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);

            // Strategy 1: use pools.config.json (all pools with addresses on current network)
            const configPools = getAllPoolConfigs();
            if (configPools.length > 0) {
                const entries: PoolEntry[] = configPools.map((cfg) => ({
                    address: cfg.pool.addresses[
                        (import.meta.env.VITE_OPNET_NETWORK as 'testnet' | 'mainnet') || 'testnet'
                    ],
                    underlying: cfg.underlying.addresses[
                        (import.meta.env.VITE_OPNET_NETWORK as 'testnet' | 'mainnet') || 'testnet'
                    ] || '',
                    premiumToken: cfg.premium.addresses[
                        (import.meta.env.VITE_OPNET_NETWORK as 'testnet' | 'mainnet') || 'testnet'
                    ] || '',
                    poolId: cfg.id,
                    underlyingSymbol: cfg.underlying.symbol,
                    premiumSymbol: cfg.premium.symbol,
                }));
                if (!cancelled) {
                    setPools(entries);
                    setSource('config');
                    setLoading(false);
                }
                return;
            }

            // Strategy 2: try factory if configured
            const factoryAddr = CONTRACT_ADDRESSES.factory;
            if (factoryAddr) {
                try {
                    const svc = new FactoryService(provider!, factoryAddr);
                    const discovered = await svc.getAllPools();
                    if (!cancelled && discovered.length > 0) {
                        setPools(discovered);
                        setSource('factory');
                        setLoading(false);
                        return;
                    }
                } catch {
                    // Factory call failed — fall through to env fallback
                }
            }

            // Strategy 3: fall back to single env pool
            const envPool = CONTRACT_ADDRESSES.pool;
            if (!cancelled && envPool) {
                setPools([{ address: envPool, underlying: '', premiumToken: '' }]);
                setSource('env');
            } else if (!cancelled) {
                setPools([]);
                setSource(null);
                if (!factoryAddr && !envPool) {
                    setError('No pool source configured.');
                }
            }

            if (!cancelled) {
                setLoading(false);
            }
        }

        void load();
        return () => {
            cancelled = true;
        };
    }, [provider, fetchCount]);

    // When provider is absent, return empty defaults (derived, no setState needed)
    if (!provider) {
        return { pools: [], loading: false, error: null, source: null, refetch };
    }

    return { pools, loading, error, source, refetch };
}
