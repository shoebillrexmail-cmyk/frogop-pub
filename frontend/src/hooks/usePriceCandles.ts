/**
 * usePriceCandles — fetches OHLCV candle data from the indexer and polls for updates.
 *
 * Returns empty array + no error if indexer URL is not configured (graceful degradation).
 */
import { useState, useEffect, useCallback } from 'react';
import { getCandles, type CandleData } from '../services/priceService.ts';

export interface UsePriceCandlesResult {
    candles: CandleData[];
    loading: boolean;
    error: string | null;
    refetch: () => void;
}

const POLL_INTERVAL_MS = 60_000; // 60s

export function usePriceCandles(
    token: string | null,
    interval: string,
    limit: number = 500,
): UsePriceCandlesResult {
    const [candles, setCandles] = useState<CandleData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetchCount, setFetchCount] = useState(0);

    const refetch = useCallback(() => {
        setFetchCount((n) => n + 1);
    }, []);

    useEffect(() => {
        if (!token) {
            setCandles([]);
            setError(null);
            return;
        }

        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);
            try {
                const data = await getCandles(token!, interval, { limit });
                if (!cancelled) {
                    setCandles(data ?? []);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load price data');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void load();

        // Poll for live updates
        const timer = setInterval(() => {
            if (!cancelled) void load();
        }, POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [token, interval, limit, fetchCount]);

    return { candles, loading, error, refetch };
}
