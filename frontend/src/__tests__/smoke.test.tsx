/**
 * Smoke tests — verify pages render without crashing.
 * More detailed tests live alongside each component (*.test.tsx).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock the wallet store so tests don't rely on window.opwallet
vi.mock('../stores/walletStore', () => ({
    useWalletStore: vi.fn(() => ({
        connected: false,
        address: null,
        publicKey: null,
        connecting: false,
        error: null,
        connect: vi.fn(),
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
