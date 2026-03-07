/**
 * useUserOptions — fetches the connected wallet's written/purchased options.
 *
 * Fast path: indexer REST API via getOptionsByUser().
 * Fallback: full on-chain scan via PoolService.getAllOptions() (filtered client-side).
 */
import { useState, useEffect, useCallback } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { PoolService } from '../services/pool.ts';
import { getOptionsByUser } from '../services/indexerService.ts';
import type { OptionData } from '../services/types.ts';

const ZERO_HEX = '0x' + '0'.repeat(64);

export interface UseUserOptionsResult {
    writtenOptions:   OptionData[];
    purchasedOptions: OptionData[];
    loading: boolean;
    error:   string | null;
    source:  'indexer' | 'chain' | null;
    refetch: () => void;
}

export function useUserOptions(
    walletHex: string | null,
    poolAddress: string | null | undefined,
): UseUserOptionsResult {
    const { provider } = useWalletConnect();

    const [writtenOptions,   setWrittenOptions]   = useState<OptionData[]>([]);
    const [purchasedOptions, setPurchasedOptions] = useState<OptionData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState<string | null>(null);
    const [source,  setSource]  = useState<'indexer' | 'chain' | null>(null);
    const [fetchCount, setFetchCount] = useState(0);

    const refetch = useCallback(() => {
        setFetchCount((n) => n + 1);
    }, []);

    useEffect(() => {
        if (!walletHex || !poolAddress) {
            setWrittenOptions([]);
            setPurchasedOptions([]);
            setError(null);
            setSource(null);
            return;
        }

        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);
            try {
                // --- Fast path: indexer ---
                const indexerResult = await getOptionsByUser(walletHex!);

                if (indexerResult !== null) {
                    const written   = indexerResult.filter(
                        (o) => o.writer.toLowerCase() === walletHex!.toLowerCase(),
                    );
                    const purchased = indexerResult.filter(
                        (o) => !!o.buyer && o.buyer.toLowerCase() === walletHex!.toLowerCase(),
                    );
                    if (!cancelled) {
                        setWrittenOptions(written);
                        setPurchasedOptions(purchased);
                        setSource('indexer');
                    }
                    return;
                }

                // --- Chain fallback ---
                if (!provider) {
                    if (!cancelled) setError('Indexer unavailable, no provider for fallback');
                    return;
                }

                const service = new PoolService(provider, poolAddress!);
                const all = await service.getAllOptions();

                const written   = all.filter(
                    (o) => o.writer.toLowerCase() === walletHex!.toLowerCase(),
                );
                const purchased = all.filter(
                    (o) =>
                        o.buyer !== ZERO_HEX &&
                        o.buyer.toLowerCase() === walletHex!.toLowerCase(),
                );

                if (!cancelled) {
                    setWrittenOptions(written);
                    setPurchasedOptions(purchased);
                    setSource('chain');
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load user options');
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
    }, [walletHex, poolAddress, provider, fetchCount]);

    return { writtenOptions, purchasedOptions, loading, error, source, refetch };
}
