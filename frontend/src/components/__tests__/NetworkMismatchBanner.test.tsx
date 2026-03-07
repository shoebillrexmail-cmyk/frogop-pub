/**
 * NetworkMismatchBanner tests — wallet network vs app network guard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NetworkMismatchBanner } from '../NetworkMismatchBanner.tsx';

// Mock currentNetwork — defaults to 'testnet'
vi.mock('../../config/index.ts', () => ({
    currentNetwork: 'testnet',
}));

const mockSwitchNetwork = vi.fn().mockResolvedValue(undefined);

const mockUseWalletConnect = vi.fn();
vi.mock('@btc-vision/walletconnect', () => ({
    useWalletConnect: () => mockUseWalletConnect(),
}));

// Import the real enum values for assertions
const UnisatChainType = {
    BITCOIN_MAINNET: 'BITCOIN_MAINNET',
    OPNET_TESTNET: 'OPNET_TESTNET',
    BITCOIN_REGTEST: 'BITCOIN_REGTEST',
} as const;

beforeEach(() => {
    vi.clearAllMocks();
});

describe('NetworkMismatchBanner', () => {
    it('renders nothing when wallet is disconnected', () => {
        mockUseWalletConnect.mockReturnValue({
            walletAddress: null,
            network: null,
            walletInstance: null,
        });
        const { container } = render(<NetworkMismatchBanner />);
        expect(container.innerHTML).toBe('');
    });

    it('renders nothing when wallet is on correct network (testnet)', () => {
        mockUseWalletConnect.mockReturnValue({
            walletAddress: 'tb1qtest...',
            network: { chainType: UnisatChainType.OPNET_TESTNET, network: 'opnetTestnet' },
            walletInstance: { switchNetwork: mockSwitchNetwork },
        });
        const { container } = render(<NetworkMismatchBanner />);
        expect(container.innerHTML).toBe('');
    });

    it('shows banner when wallet is on mainnet but app is testnet', () => {
        mockUseWalletConnect.mockReturnValue({
            walletAddress: 'bc1qmain...',
            network: { chainType: UnisatChainType.BITCOIN_MAINNET, network: 'mainnet' },
            walletInstance: { switchNetwork: mockSwitchNetwork },
        });
        render(<NetworkMismatchBanner />);
        expect(screen.getByTestId('network-mismatch-banner')).toBeInTheDocument();
        expect(screen.getByText(/Bitcoin Mainnet/)).toBeInTheDocument();
        expect(screen.getByText(/OPNet Testnet/)).toBeInTheDocument();
    });

    it('calls switchNetwork when "Switch Network" button is clicked', async () => {
        mockUseWalletConnect.mockReturnValue({
            walletAddress: 'bc1qmain...',
            network: { chainType: UnisatChainType.BITCOIN_MAINNET, network: 'mainnet' },
            walletInstance: { switchNetwork: mockSwitchNetwork },
        });
        render(<NetworkMismatchBanner />);
        fireEvent.click(screen.getByTestId('switch-network-btn'));
        await waitFor(() => {
            expect(mockSwitchNetwork).toHaveBeenCalledWith('opnetTestnet');
        });
    });

    it('dismisses the banner when X is clicked', () => {
        mockUseWalletConnect.mockReturnValue({
            walletAddress: 'bc1qmain...',
            network: { chainType: UnisatChainType.BITCOIN_MAINNET, network: 'mainnet' },
            walletInstance: { switchNetwork: mockSwitchNetwork },
        });
        render(<NetworkMismatchBanner />);
        expect(screen.getByTestId('network-mismatch-banner')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('dismiss-mismatch-btn'));
        expect(screen.queryByTestId('network-mismatch-banner')).not.toBeInTheDocument();
    });

    it('handles switchNetwork rejection gracefully', async () => {
        mockSwitchNetwork.mockRejectedValueOnce(new Error('User rejected'));
        mockUseWalletConnect.mockReturnValue({
            walletAddress: 'bc1qmain...',
            network: { chainType: UnisatChainType.BITCOIN_MAINNET, network: 'mainnet' },
            walletInstance: { switchNetwork: mockSwitchNetwork },
        });
        render(<NetworkMismatchBanner />);
        fireEvent.click(screen.getByTestId('switch-network-btn'));
        // Should not crash — banner stays visible
        await waitFor(() => {
            expect(screen.getByTestId('network-mismatch-banner')).toBeInTheDocument();
        });
    });
});
