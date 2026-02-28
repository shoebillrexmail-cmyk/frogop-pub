/**
 * usePriceRatio — MOTO/PILL cross-rate.
 *
 * Primary: fetches from the indexer (/prices/MOTO_PILL/latest) — works
 * without wallet connection or NativeSwap address configuration.
 *
 * Fallback: calls NativeSwap getQuote() on-chain when the indexer is
 * unavailable AND wallet + NativeSwap address are available.
 */
import { useState, useEffect, useCallback } from 'react';
import { getContract } from 'opnet';
import type { AbstractRpcProvider } from 'opnet';
import { NativeSwapAbi } from 'opnet';
import type { INativeSwapContract } from 'opnet';
import { Address } from '@btc-vision/transaction';
import type { WalletConnectNetwork } from '@btc-vision/walletconnect';
import { getLatestPrice } from '../services/priceService.ts';

export interface UsePriceRatioResult {
    motoPillRatio: number | null;
    loading: boolean;
    error: string | null;
}

const QUOTE_SATS = 100_000n;
const POLL_INTERVAL_MS = 60_000;

/** Convert an 18-decimal BigInt string to a float. */
function priceToFloat(s: string): number {
    if (!s || s === '0') return 0;
    const val = BigInt(s);
    const divisor = 10n ** 18n;
    const whole = val / divisor;
    const frac = val % divisor;
    return Number(whole) + Number(frac) / 1e18;
}

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
        let cancelled = false;

        async function fetchRatio() {
            setLoading(true);

            // ---- Try indexer first (no wallet needed) ----
            try {
                const snapshot = await getLatestPrice('MOTO_PILL');
                if (snapshot && !cancelled) {
                    const ratio = priceToFloat(snapshot.price);
                    if (ratio > 0) {
                        setMotoPillRatio(ratio);
                        setError(null);
                        setLoading(false);
                        return;
                    }
                }
            } catch {
                // Indexer unavailable — fall through to on-chain
            }

            // ---- Fallback: on-chain NativeSwap getQuote ----
            if (!nativeSwapAddress || !motoAddress || !pillAddress || !provider || !network) {
                if (!cancelled) {
                    setLoading(false);
                }
                return;
            }

            try {
                const contract = getContract<INativeSwapContract>(
                    nativeSwapAddress,
                    NativeSwapAbi,
                    provider,
                    network,
                );

                const motoAddr = Address.fromString(motoAddress);
                const pillAddr = Address.fromString(pillAddress);

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
