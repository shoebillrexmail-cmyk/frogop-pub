/**
 * useDiscoverPools — discovers available pools via the factory registry,
 * falling back to a single env-configured pool when no factory is available.
 */
import { useState, useEffect, useCallback } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { FactoryService } from '../services/factory.ts';
import { CONTRACT_ADDRESSES } from '../config/index.ts';
import type { PoolEntry } from '../services/types.ts';

export type PoolSource = 'factory' | 'env' | null;

export interface UseDiscoverPoolsResult {
    pools: PoolEntry[];
    loading: boolean;
    error: string | null;
    /** Where the pool list came from */
    source: PoolSource;
    /** Re-fetch pools from the factory / env */
    refetch: () => void;
}

export function useDiscoverPools(): UseDiscoverPoolsResult {
    const { provider } = useWalletConnect();

    const [pools, setPools] = useState<PoolEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [source, setSource] = useState<PoolSource>(null);
    const [fetchCount, setFetchCount] = useState(0);

    const refetch = useCallback(() => {
        setFetchCount((n) => n + 1);
    }, []);

    useEffect(() => {
        if (!provider) {
            setPools([]);
            setError(null);
            setSource(null);
            return;
        }

        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);

            const factoryAddr = CONTRACT_ADDRESSES.factory;

            // Strategy 1: try factory if configured
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

            // Strategy 2: fall back to single env pool
            const envPool = CONTRACT_ADDRESSES.pool;
            if (!cancelled && envPool) {
                setPools([{ address: envPool, underlying: '', premiumToken: '' }]);
                setSource('env');
            } else if (!cancelled) {
                setPools([]);
                setSource(null);
                if (!factoryAddr && !envPool) {
                    setError('No pool source configured. Set VITE_FACTORY_ADDRESS or VITE_POOL_ADDRESS.');
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

    return { pools, loading, error, source, refetch };
}
