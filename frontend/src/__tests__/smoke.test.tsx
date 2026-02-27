/**
 * Smoke tests — verify pages render without crashing.
 * More detailed tests live alongside each component (*.test.tsx).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock walletconnect so tests don't rely on window.opwallet / browser extension
vi.mock('@btc-vision/walletconnect', () => ({
    default: ({ children }: { children: unknown }) => children,
    useWalletConnect: vi.fn(() => ({
        walletAddress: null,
        connecting: false,
        openConnectModal: vi.fn(),
        disconnect: vi.fn(),
    })),
}));

import { PoolsPage } from '../pages/PoolsPage';
import { PortfolioPage } from '../pages/PortfolioPage';

describe('Smoke tests — pages render without crashing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('PoolsPage renders', () => {
        render(
            <MemoryRouter>
                <PoolsPage />
            </MemoryRouter>
        );
        expect(screen.getByText(/Option Pools/i)).toBeInTheDocument();
    });

    it('PortfolioPage renders', () => {
        render(
            <MemoryRouter>
                <PortfolioPage />
            </MemoryRouter>
        );
        expect(screen.getByRole('heading', { name: /Portfolio/i })).toBeInTheDocument();
    });
});
