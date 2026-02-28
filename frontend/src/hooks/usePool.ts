/**
 * usePool — React hook for loading all options from a single OptionsPool contract.
 *
 * Requires the walletconnect provider (read-only; no wallet needed for view calls).
 */
import { useState, useEffect, useCallback } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { PoolService } from '../services/pool.ts';
import type { OptionData, PoolInfo } from '../services/types.ts';

export interface UsePoolResult {
    poolInfo: PoolInfo | null;
    options: OptionData[];
    loading: boolean;
    error: string | null;
    /** Re-fetch pool info and all options */
    refetch: () => void;
}

/**
 * Loads pool configuration and all options from the given pool contract address.
 *
 * @param poolAddress - bech32 (opt1...) or hex (0x...) pool contract address.
 *                      Pass null/empty to disable fetching.
 */
export function usePool(poolAddress: string | null | undefined): UsePoolResult {
    const { provider } = useWalletConnect();

    const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
    const [options, setOptions] = useState<OptionData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetchCount, setFetchCount] = useState(0);

    const refetch = useCallback(() => {
        setFetchCount((n) => n + 1);
    }, []);

    useEffect(() => {
        if (!poolAddress || !provider) {
            setPoolInfo(null);
            setOptions([]);
            setError(null);
            return;
        }

        let cancelled = false;
        const service = new PoolService(provider, poolAddress);

        async function load() {
            setLoading(true);
            setError(null);
            try {
                const [info, opts] = await Promise.all([
                    service.getPoolInfo(),
                    service.getAllOptions(),
                ]);
                if (!cancelled) {
                    setPoolInfo(info);
                    setOptions(opts);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load pool data');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        void load();
        return () => {
            cancelled = true;
        };
    }, [poolAddress, provider, fetchCount]);

    return { poolInfo, options, loading, error, refetch };
}
