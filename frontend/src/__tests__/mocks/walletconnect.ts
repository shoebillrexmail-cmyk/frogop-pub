/**
 * Mock @btc-vision/walletconnect for Vitest tests.
 * Use vi.mock('@btc-vision/walletconnect', () => mockWalletConnect) in test files.
 */
import { vi } from 'vitest';

export const mockUseWalletConnect = vi.fn(() => ({
    walletAddress: null as string | null,
    connected: false,
    connecting: false,
    openConnectModal: vi.fn(),
    disconnect: vi.fn(),
    publicKey: null as string | null,
}));

/** Call in a test to simulate a connected wallet. */
export function mockConnectedWallet(address = 'opt1pftest000000000000000000000000000000000') {
    mockUseWalletConnect.mockReturnValue({
        walletAddress: address,
        connected: true,
        connecting: false,
        openConnectModal: vi.fn(),
        disconnect: vi.fn(),
        publicKey: '0xdeadbeef',
    });
}

/** Call in a test to simulate a disconnected wallet. */
export function mockDisconnectedWallet() {
    mockUseWalletConnect.mockReturnValue({
        walletAddress: null,
        connected: false,
        connecting: false,
        openConnectModal: vi.fn(),
        disconnect: vi.fn(),
        publicKey: null,
    });
}
