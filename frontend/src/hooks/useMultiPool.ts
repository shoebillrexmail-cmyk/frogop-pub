/**
 * useMultiPool — load pool info + options for multiple pools in parallel.
 *
 * Returns a Map keyed by pool address with the same shape as usePool results.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { AbstractRpcProvider } from 'opnet';
import { PoolService } from '../services/pool.ts';
import type { OptionData, PoolInfo } from '../services/types.ts';

export interface PoolData {
    poolInfo: PoolInfo | null;
    options: OptionData[];
    loading: boolean;
    error: string | null;
}

export function useMultiPool(
    poolAddresses: string[],
    provider: AbstractRpcProvider | null | undefined,
): { pools: Map<string, PoolData>; refetch: () => void } {
    const [poolsMap, setPoolsMap] = useState<Map<string, PoolData>>(new Map());
    const [fetchCount, setFetchCount] = useState(0);
    const prevKeyRef = useRef('');

    const refetch = useCallback(() => {
        setFetchCount((n) => n + 1);
    }, []);

    // Stable key for address list to avoid re-fetch on reference changes
    const addressKey = poolAddresses.slice().sort().join(',');

    useEffect(() => {
        if (!provider || poolAddresses.length === 0) {
            if (prevKeyRef.current !== '') {
                setPoolsMap(new Map());
                prevKeyRef.current = '';
            }
            return;
        }

        prevKeyRef.current = addressKey;
        let cancelled = false;

        // Set loading state for all pools
        const loadingMap = new Map<string, PoolData>();
        for (const addr of poolAddresses) {
            loadingMap.set(addr, { poolInfo: null, options: [], loading: true, error: null });
        }
        setPoolsMap(loadingMap);

        async function loadAll() {
            const results = await Promise.allSettled(
                poolAddresses.map(async (addr) => {
                    const svc = new PoolService(provider!, addr);
                    const [info, opts] = await Promise.all([
                        svc.getPoolInfo(),
                        svc.getAllOptions(),
                    ]);
                    return { addr, info, opts };
                }),
            );

            if (cancelled) return;

            const newMap = new Map<string, PoolData>();
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    const { addr, info, opts } = result.value;
                    newMap.set(addr, { poolInfo: info, options: opts, loading: false, error: null });
                } else {
                    // Find the address from the order
                    const idx = results.indexOf(result);
                    const addr = poolAddresses[idx];
                    const errMsg = result.reason instanceof Error ? result.reason.message : 'Failed to load pool';
                    newMap.set(addr, { poolInfo: null, options: [], loading: false, error: errMsg });
                }
            }

            setPoolsMap(newMap);
        }

        void loadAll();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addressKey, provider, fetchCount]);

    return { pools: poolsMap, refetch };
}
