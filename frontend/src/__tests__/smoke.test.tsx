/**
 * Smoke tests — verify pages render without crashing.
 * More detailed tests live alongside each component (*.test.tsx).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock walletconnect so tests don't rely on window.opwallet / browser extension
vi.mock('@btc-vision/walletconnect', () => ({
    default: ({ children }: { children: unknown }) => children,
    useWalletConnect: vi.fn(() => ({
        walletAddress: null,
        connecting: false,
        openConnectModal: vi.fn(),
        disconnect: vi.fn(),
        address: null,
        provider: null,
        network: null,
    })),
}));

vi.mock('../hooks/usePool.ts', () => ({
    usePool: () => ({ poolInfo: null, options: [], loading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('../hooks/useDiscoverPools.ts', () => ({
    useDiscoverPools: () => ({ pools: [], loading: false, error: null, source: null, refetch: vi.fn() }),
}));

vi.mock('../hooks/useUserOptions.ts', () => ({
    useUserOptions: () => ({
        writtenOptions: [], purchasedOptions: [], loading: false, error: null, source: null, refetch: vi.fn(),
    }),
}));

vi.mock('../hooks/useTokenInfo.ts', () => ({
    useTokenInfo: () => ({ info: null, loading: false, error: null, refetch: vi.fn() }),
}));

import { PoolListPage } from '../pages/PoolListPage';
import { PoolDetailPage } from '../pages/PoolDetailPage';
import { PortfolioPage } from '../pages/PortfolioPage';

describe('Smoke tests — pages render without crashing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('PoolListPage renders', () => {
        const { container } = render(
            <MemoryRouter>
                <PoolListPage />
            </MemoryRouter>
        );
        expect(container.firstChild).toBeInTheDocument();
    });

    it('PoolDetailPage renders', () => {
        const { container } = render(
            <MemoryRouter initialEntries={['/markets/opt1test']}>
                <Routes>
                    <Route path="markets/:address" element={<PoolDetailPage />} />
                </Routes>
            </MemoryRouter>
        );
        expect(container.firstChild).toBeInTheDocument();
    });

    it('PortfolioPage renders', () => {
        render(
            <MemoryRouter>
                <PortfolioPage />
            </MemoryRouter>
        );
        // Without a wallet connected, the page shows the connect gate
        expect(screen.getByText(/Connect your OPWallet/i)).toBeInTheDocument();
    });
});
