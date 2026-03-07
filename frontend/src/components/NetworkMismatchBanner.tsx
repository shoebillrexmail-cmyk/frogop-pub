/**
 * NetworkMismatchBanner — warns when the connected wallet is on a different
 * network than the app expects. Offers a "Switch Network" button.
 */
import { useState, useCallback } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { UnisatChainType, WalletNetworks } from '@btc-vision/transaction';
import { currentNetwork, type NetworkName } from '../config/index.ts';

const EXPECTED_CHAIN: Record<NetworkName, UnisatChainType> = {
    testnet: UnisatChainType.OPNET_TESTNET,
    mainnet: UnisatChainType.BITCOIN_MAINNET,
    regtest: UnisatChainType.BITCOIN_REGTEST,
};

const SWITCH_TARGET: Record<NetworkName, WalletNetworks> = {
    testnet: WalletNetworks.OpnetTestnet,
    mainnet: WalletNetworks.Mainnet,
    regtest: WalletNetworks.Regtest,
};

const CHAIN_LABELS: Partial<Record<UnisatChainType, string>> = {
    [UnisatChainType.BITCOIN_MAINNET]: 'Bitcoin Mainnet',
    [UnisatChainType.BITCOIN_TESTNET]: 'Bitcoin Testnet',
    [UnisatChainType.BITCOIN_TESTNET4]: 'Bitcoin Testnet4',
    [UnisatChainType.BITCOIN_SIGNET]: 'Bitcoin Signet',
    [UnisatChainType.BITCOIN_REGTEST]: 'Bitcoin Regtest',
    [UnisatChainType.OPNET_TESTNET]: 'OPNet Testnet',
};

function chainLabel(chainType: UnisatChainType): string {
    return CHAIN_LABELS[chainType] ?? chainType;
}

const NETWORK_LABELS: Record<NetworkName, string> = {
    testnet: 'OPNet Testnet',
    mainnet: 'Bitcoin Mainnet',
    regtest: 'Bitcoin Regtest',
};

export function NetworkMismatchBanner() {
    const { walletAddress, network, walletInstance } = useWalletConnect();
    const [switching, setSwitching] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    const expected = EXPECTED_CHAIN[currentNetwork];
    const isMismatch = !!walletAddress && !!network && network.chainType !== expected;

    const handleSwitch = useCallback(async () => {
        if (!walletInstance) return;
        setSwitching(true);
        try {
            await walletInstance.switchNetwork(SWITCH_TARGET[currentNetwork]);
        } catch {
            // Wallet may reject — user can retry or switch manually
        } finally {
            setSwitching(false);
        }
    }, [walletInstance]);

    if (!isMismatch || dismissed) return null;

    return (
        <div
            className="sticky top-0 z-[60] w-full bg-amber-900/90 border-b border-amber-600 px-4 py-2 flex items-center justify-center gap-3 text-sm font-mono"
            data-testid="network-mismatch-banner"
        >
            <span className="text-amber-200">
                Your wallet is connected to <strong>{chainLabel(network!.chainType)}</strong>.
                FroGop requires <strong>{NETWORK_LABELS[currentNetwork]}</strong>.
            </span>
            <button
                onClick={handleSwitch}
                disabled={switching}
                className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium disabled:opacity-50"
                data-testid="switch-network-btn"
            >
                {switching ? 'Switching...' : 'Switch Network'}
            </button>
            <button
                onClick={() => setDismissed(true)}
                className="text-amber-400 hover:text-amber-200 ml-1"
                aria-label="Dismiss"
                data-testid="dismiss-mismatch-btn"
            >
                &times;
            </button>
        </div>
    );
}
