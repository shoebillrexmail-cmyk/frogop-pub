/**
 * useFallbackProvider — creates a read-only JSONRpcProvider when no wallet is connected.
 *
 * Returns the wallet provider when available, otherwise creates a standalone
 * JSONRpcProvider from the configured RPC URL. This lets pages display pool
 * data without requiring wallet connection.
 */
import { useState } from 'react';
import { JSONRpcProvider } from 'opnet';
import type { AbstractRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { currentNetwork, NETWORKS } from '../config/index.ts';

const rpcUrl = import.meta.env.VITE_OPNET_RPC_URL || NETWORKS[currentNetwork].rpc;

/** Map our string network name to the actual bitcoin network object */
const NETWORK_MAP: Record<string, unknown> = {
    regtest: networks.regtest,
    testnet: networks.opnetTestnet,
    mainnet: networks.bitcoin,
};

export function useFallbackProvider(): AbstractRpcProvider | null {
    const { provider: walletProvider } = useWalletConnect();

    // Create a singleton fallback provider via lazy state init
    const [fallback] = useState<AbstractRpcProvider>(() =>
        new JSONRpcProvider({
            url: rpcUrl,
            network: NETWORK_MAP[currentNetwork] as never,
        }),
    );

    return walletProvider ?? fallback;
}
