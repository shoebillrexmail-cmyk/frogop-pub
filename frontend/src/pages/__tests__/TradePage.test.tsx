import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TradePage } from '../TradePage.tsx';

// Mock walletconnect
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

vi.mock('../../hooks/usePool.ts', () => ({
    usePool: () => ({ poolInfo: null, options: [], loading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('../../hooks/useDiscoverPools.ts', () => ({
    useDiscoverPools: () => ({ pools: [], loading: false, error: null, source: null, refetch: vi.fn() }),
}));

vi.mock('../../hooks/useTokenInfo.ts', () => ({
    useTokenInfo: () => ({ info: null, loading: false, error: null, refetch: vi.fn() }),
}));

function renderTrade(path = '/trade') {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="trade" element={<TradePage />} />
                <Route path="chain" element={<div data-testid="chain-page">Chain</div>} />
            </Routes>
        </MemoryRouter>
    );
}

describe('TradePage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('Step 1: shows intent grid when no params', () => {
        renderTrade('/trade');
        expect(screen.getByTestId('intent-grid')).toBeInTheDocument();
        expect(screen.getByTestId('wizard-breadcrumb')).toBeInTheDocument();
    });

    it('Step 2: shows market picker when intent param set', () => {
        renderTrade('/trade?intent=earn-yield');
        // MarketPicker renders (empty state since mock has no pools)
        expect(screen.getByTestId('market-picker-empty')).toBeInTheDocument();
        // Breadcrumb shows step 2 as current
        expect(screen.getByTestId('wizard-step-2').className).toContain('text-terminal-text-primary');
    });

    it('power-user redirects to /chain', () => {
        renderTrade('/trade?intent=power-user');
        expect(screen.getByTestId('chain-page')).toBeInTheDocument();
    });

    it('clicking intent updates URL to step 2', () => {
        renderTrade('/trade');
        fireEvent.click(screen.getByTestId('intent-earn-yield'));
        // After clicking, market picker appears (empty state)
        expect(screen.getByTestId('market-picker-empty')).toBeInTheDocument();
    });
});
