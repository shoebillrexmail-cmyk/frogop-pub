/**
 * usePriceRatio — derives MOTO/PILL cross-rate via NativeSwap tBTC intermediary.
 *
 * Strategy: getQuote(MOTO, 100k sats) and getQuote(PILL, 100k sats), then
 * motoPillRatio = pillTokensOut / motoTokensOut (how much PILL 1 MOTO is worth).
 */
import { useState, useEffect, useCallback } from 'react';
import { getContract } from 'opnet';
import type { AbstractRpcProvider } from 'opnet';
import { NativeSwapAbi } from 'opnet';
import type { INativeSwapContract } from 'opnet';
import { Address } from '@btc-vision/transaction';
import type { WalletConnectNetwork } from '@btc-vision/walletconnect';

export interface UsePriceRatioResult {
    motoPillRatio: number | null;
    loading: boolean;
    error: string | null;
}

const QUOTE_SATS = 100_000n;
const POLL_INTERVAL_MS = 60_000;

export function usePriceRatio(
    nativeSwapAddress: string | null,
    motoAddress: string | null,
    pillAddress: string | null,
    provider: AbstractRpcProvider | null,
    network: WalletConnectNetwork | null,
): UsePriceRatioResult {
    const [motoPillRatio, setMotoPillRatio] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);

    const refresh = useCallback(() => setTick((t) => t + 1), []);

    useEffect(() => {
        if (!nativeSwapAddress || !motoAddress || !pillAddress || !provider || !network) {
            setMotoPillRatio(null);
            setLoading(false);
            return;
        }

        let cancelled = false;

        async function fetchRatio() {
            setLoading(true);
            try {
                const contract = getContract<INativeSwapContract>(
                    nativeSwapAddress!,
                    NativeSwapAbi,
                    provider!,
                    network!,
                );

                const motoAddr = Address.fromString(motoAddress!);
                const pillAddr = Address.fromString(pillAddress!);

                const [motoQuote, pillQuote] = await Promise.all([
                    contract.getQuote(motoAddr, QUOTE_SATS),
                    contract.getQuote(pillAddr, QUOTE_SATS),
                ]);

                if (cancelled) return;

                const motoOut = motoQuote.properties.tokensOut;
                const pillOut = pillQuote.properties.tokensOut;

                if (motoOut > 0n) {
                    const ratio = Number(pillOut) / Number(motoOut);
                    setMotoPillRatio(ratio);
                    setError(null);
                } else {
                    setMotoPillRatio(null);
                    setError('MOTO quote returned 0');
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to fetch price ratio');
                    setMotoPillRatio(null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchRatio();
        const id = setInterval(() => {
            if (!cancelled) refresh();
        }, POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [nativeSwapAddress, motoAddress, pillAddress, provider, network, tick, refresh]);

    return { motoPillRatio, loading, error };
}
