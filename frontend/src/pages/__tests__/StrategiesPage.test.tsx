/**
 * StrategiesPage tests — atomic multi-leg strategy execution via SpreadRouter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

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

vi.mock('../../hooks/useFallbackProvider.ts', () => ({
    useFallbackProvider: () => null,
}));

const mockPools = [
    { address: 'opt1pool1', underlyingSymbol: 'MOTO', premiumSymbol: 'PILL', poolId: 'pool1' },
];
vi.mock('../../hooks/useDiscoverPools.ts', () => ({
    useDiscoverPools: () => ({ pools: mockPools, loading: false }),
}));

vi.mock('../../hooks/usePool.ts', () => ({
    usePool: () => ({ poolInfo: null, options: [], loading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('../../hooks/usePriceRatio.ts', () => ({
    usePriceRatio: () => ({ motoPillRatio: null }),
}));

import { StrategiesPage } from '../StrategiesPage.tsx';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage(initialEntry = '/strategies') {
    return render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <StrategiesPage />
        </MemoryRouter>,
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StrategiesPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the page with strategy selector', () => {
        renderPage();
        expect(screen.getByTestId('strategies-page')).toBeInTheDocument();
        expect(screen.getByTestId('strategy-selector')).toBeInTheDocument();
    });

    it('renders all four strategy type buttons', () => {
        renderPage();
        const selector = screen.getByTestId('strategy-selector');
        expect(selector.querySelectorAll('button')).toHaveLength(4);
        expect(selector).toHaveTextContent('Bull Call Spread');
        expect(selector).toHaveTextContent('Bear Put Spread');
        expect(selector).toHaveTextContent('Collar');
        expect(selector).toHaveTextContent('Custom');
    });

    it('does not show router warning when router address is configured', () => {
        renderPage();
        // Router address is set in pools.config.json — no warning should appear
        expect(screen.queryByText(/SpreadRouter not yet deployed/i)).not.toBeInTheDocument();
    });

    it('pre-selects collar strategy from URL params', () => {
        renderPage('/strategies?strategy=collar');
        const selectorDiv = screen.getByTestId('strategy-selector');
        const collarBtn = selectorDiv.querySelector('button:nth-child(3)');
        expect(collarBtn).toBeInTheDocument();
        expect(collarBtn?.textContent).toContain('Collar');
        expect(collarBtn?.className).toContain('accent');
    });

    it('renders pool selector with available pools', () => {
        renderPage();
        const select = screen.getByTestId('pool-select');
        expect(select).toBeInTheDocument();
        expect(screen.getByText('MOTO / PILL (pool1)')).toBeInTheDocument();
    });

    it('shows leg configurators after pool selection', () => {
        renderPage();
        fireEvent.change(screen.getByTestId('pool-select'), { target: { value: 'opt1pool1' } });
        expect(screen.getByTestId('leg-1')).toBeInTheDocument();
        expect(screen.getByTestId('leg-2')).toBeInTheDocument();
    });

    it('shows execute button after pool selection, disabled without wallet', () => {
        renderPage();
        fireEvent.change(screen.getByTestId('pool-select'), { target: { value: 'opt1pool1' } });
        const btn = screen.getByTestId('btn-execute-strategy');
        expect(btn).toBeDisabled();
        expect(btn).toHaveTextContent('Connect Wallet');
    });

    it('pre-selects pool from URL params', () => {
        renderPage('/strategies?pool=opt1pool1&strategy=collar');
        // Pool should be selected, so legs should render
        expect(screen.getByTestId('leg-1')).toBeInTheDocument();
        expect(screen.getByTestId('leg-2')).toBeInTheDocument();
    });
});
