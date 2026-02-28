/**
 * useTokenInfo — queries token balance and allowance for the connected wallet.
 *
 * Uses raw provider.call() for read-only view methods (no wallet needed).
 */
import { useState, useEffect } from 'react';
import type { AbstractRpcProvider } from 'opnet';
import { BinaryWriter } from '@btc-vision/transaction';
import type { Address } from '@btc-vision/transaction';
import { TOKEN_VIEW_SELECTORS } from '../services/selectors.ts';

export interface TokenInfo {
    balance: bigint;
    allowance: bigint;
}

interface UseTokenInfoParams {
    /** Token contract address (bech32 or 0x hex) */
    tokenAddress: string | null;
    /** Spender contract address (0x hex) — for allowance query */
    spenderHex: string | null;
    /** Connected wallet address object (has toString() = MLDSA hash hex) */
    walletAddress: Address | null;
    provider: AbstractRpcProvider | null;
}

async function resolveHex(provider: AbstractRpcProvider, addr: string): Promise<string> {
    if (addr.startsWith('0x')) return addr;
    const info = await provider.getPublicKeyInfo(addr, true);
    return info.toString();
}

function buildAddressCalldata(selector: string, hexAddress: string): string {
    // selector = '0x' + 8 hex chars; address = '0x' + 64 hex chars
    // Strip 0x from address to form the 32-byte param hex
    const addrHex = hexAddress.replace('0x', '').padStart(64, '0');
    return selector + addrHex;
}

function buildTwoAddressCalldata(selector: string, hex1: string, hex2: string): string {
    const a1 = hex1.replace('0x', '').padStart(64, '0');
    const a2 = hex2.replace('0x', '').padStart(64, '0');
    return selector + a1 + a2;
}

export function useTokenInfo({
    tokenAddress,
    spenderHex,
    walletAddress,
    provider,
}: UseTokenInfoParams): { info: TokenInfo | null; loading: boolean; error: string | null; refetch: () => void } {
    const [info, setInfo] = useState<TokenInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);

    const refetch = () => setTick((n) => n + 1);

    useEffect(() => {
        if (!tokenAddress || !walletAddress || !provider) {
            setInfo(null);
            setError(null);
            return;
        }

        let cancelled = false;

        async function load() {
            if (!tokenAddress || !walletAddress || !provider) return;

            setLoading(true);
            setError(null);

            try {
                const tokenHex = await resolveHex(provider, tokenAddress);
                const ownerHex = walletAddress.toString(); // MLDSA hash (0x...)

                const balCalldata = buildAddressCalldata(TOKEN_VIEW_SELECTORS.balanceOf, ownerHex);
                const balResult = await provider.call(tokenHex, balCalldata);
                if (!balResult || 'error' in balResult) {
                    throw new Error('Failed to fetch balance');
                }
                if (balResult.revert) {
                    throw new Error(`Balance call reverted: ${balResult.revert}`);
                }
                const balance = balResult.result.readU256();

                let allowance = 0n;
                if (spenderHex) {
                    const allowCalldata = buildTwoAddressCalldata(
                        TOKEN_VIEW_SELECTORS.allowance,
                        ownerHex,
                        spenderHex,
                    );
                    const allowResult = await provider.call(tokenHex, allowCalldata);
                    if (!allowResult || 'error' in allowResult) {
                        throw new Error('Failed to fetch allowance');
                    }
                    if (!allowResult.revert) {
                        allowance = allowResult.result.readU256();
                    }
                }

                if (!cancelled) {
                    setInfo({ balance, allowance });
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to fetch token info');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void load();
        return () => {
            cancelled = true;
        };
    }, [tokenAddress, spenderHex, walletAddress, provider, tick]);

    return { info, loading, error, refetch };
}
