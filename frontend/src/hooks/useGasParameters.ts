/**
 * useGasParameters — fetches BlockGasParameters from provider.
 *
 * Primary: re-fetches when wsBlock changes (block-triggered).
 * Fallback: polls every 60s when WS is unavailable.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { AbstractRpcProvider, BlockGasParameters } from 'opnet';
import { useWsBlock } from './useWebSocketProvider.ts';

const POLL_INTERVAL_MS = 60_000;

export interface UseGasParametersResult {
    gasParams: BlockGasParameters | null;
    loading: boolean;
    error: string | null;
    refetch: () => void;
}

export function useGasParameters(
    provider: AbstractRpcProvider | null,
): UseGasParametersResult {
    const wsBlockInfo = useWsBlock();
    const [gasParams, setGasParams] = useState<BlockGasParameters | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);
    const fetchingRef = useRef(false);

    const refetch = useCallback(() => setTick((t) => t + 1), []);

    // Fetch gas parameters
    useEffect(() => {
        if (!provider) return;
        let cancelled = false;

        async function fetch() {
            if (fetchingRef.current) return;
            fetchingRef.current = true;
            setLoading(true);
            try {
                const params = await provider!.gasParameters();
                if (!cancelled) {
                    setGasParams(params);
                    setError(null);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to fetch gas parameters');
                }
            } finally {
                if (!cancelled) setLoading(false);
                fetchingRef.current = false;
            }
        }

        void fetch();

        return () => { cancelled = true; };
    }, [provider, wsBlockInfo?.blockNumber, tick]);

    // Fallback polling when WS is unavailable
    useEffect(() => {
        if (!provider) return;
        if (wsBlockInfo !== null) return; // WS is active, no polling needed

        const id = setInterval(() => {
            setTick((t) => t + 1);
        }, POLL_INTERVAL_MS);

        return () => clearInterval(id);
    }, [provider, wsBlockInfo]);

    return { gasParams, loading, error, refetch };
}
