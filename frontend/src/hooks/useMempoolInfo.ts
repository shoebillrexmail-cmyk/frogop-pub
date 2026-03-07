/**
 * useMempoolInfo — fetches MempoolInfo from provider.
 *
 * Primary: re-fetches when wsBlock changes (block-triggered).
 * Fallback: polls every 60s when WS is unavailable.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { AbstractRpcProvider, MempoolInfo } from 'opnet';
import { useWsBlock } from './useWebSocketProvider.ts';

const POLL_INTERVAL_MS = 60_000;

export interface UseMempoolInfoResult {
    mempoolInfo: MempoolInfo | null;
    loading: boolean;
    error: string | null;
    refetch: () => void;
}

export function useMempoolInfo(
    provider: AbstractRpcProvider | null,
): UseMempoolInfoResult {
    const wsBlockInfo = useWsBlock();
    const [mempoolInfo, setMempoolInfo] = useState<MempoolInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);
    const fetchingRef = useRef(false);

    const refetch = useCallback(() => setTick((t) => t + 1), []);

    // Fetch mempool info
    useEffect(() => {
        if (!provider) return;
        let cancelled = false;

        async function fetch() {
            if (fetchingRef.current) return;
            fetchingRef.current = true;
            setLoading(true);
            try {
                const info = await provider!.getMempoolInfo();
                if (!cancelled) {
                    setMempoolInfo(info);
                    setError(null);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to fetch mempool info');
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
        if (wsBlockInfo !== null) return;

        const id = setInterval(() => {
            setTick((t) => t + 1);
        }, POLL_INTERVAL_MS);

        return () => clearInterval(id);
    }, [provider, wsBlockInfo]);

    return { mempoolInfo, loading, error, refetch };
}
