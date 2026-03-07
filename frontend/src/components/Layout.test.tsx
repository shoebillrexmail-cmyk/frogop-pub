/**
 * Layout component tests — wallet connect/disconnect UI states.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mockOpenConnectModal = vi.fn();
const mockDisconnect = vi.fn();

vi.mock('@btc-vision/walletconnect', () => ({
    default: ({ children }: { children: unknown }) => children,
    useWalletConnect: vi.fn(() => ({
        walletAddress: null,
        connecting: false,
        openConnectModal: mockOpenConnectModal,
        disconnect: mockDisconnect,
    })),
}));

import { useWalletConnect } from '@btc-vision/walletconnect';
import { Layout } from './Layout';

function renderLayout() {
    return render(
        <MemoryRouter>
            <Layout />
        </MemoryRouter>
    );
}

describe('Layout — wallet UI', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows Connect Wallet button when disconnected', () => {
        renderLayout();
        expect(screen.getByRole('button', { name: /connect wallet/i })).toBeInTheDocument();
    });

    it('calls openConnectModal when Connect Wallet is clicked', async () => {
        renderLayout();
        await userEvent.click(screen.getByRole('button', { name: /connect wallet/i }));
        expect(mockOpenConnectModal).toHaveBeenCalledOnce();
    });

    it('shows address and Disconnect button when connected', () => {
        vi.mocked(useWalletConnect).mockReturnValue({
            walletAddress: 'opt1pftest000000000000000000000000000000000',
            connecting: false,
            openConnectModal: mockOpenConnectModal,
            disconnect: mockDisconnect,
        } as ReturnType<typeof useWalletConnect>);

        renderLayout();

        expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /connect wallet/i })).not.toBeInTheDocument();
    });

    it('calls disconnect when Disconnect button is clicked', async () => {
        vi.mocked(useWalletConnect).mockReturnValue({
            walletAddress: 'opt1pftest000000000000000000000000000000000',
            connecting: false,
            openConnectModal: mockOpenConnectModal,
            disconnect: mockDisconnect,
        } as ReturnType<typeof useWalletConnect>);

        renderLayout();
        await userEvent.click(screen.getByRole('button', { name: /disconnect/i }));
        expect(mockDisconnect).toHaveBeenCalledOnce();
    });

    it('shows Connecting... and disables button while connecting', () => {
        vi.mocked(useWalletConnect).mockReturnValue({
            walletAddress: null,
            connecting: true,
            openConnectModal: mockOpenConnectModal,
            disconnect: mockDisconnect,
        } as ReturnType<typeof useWalletConnect>);

        renderLayout();
        const btn = screen.getByRole('button', { name: /connecting/i });
        expect(btn).toBeDisabled();
    });
});
