/**
 * PoolListPage tests — search, cards, empty/error states.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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

const mockUseDiscoverPools = vi.fn();
vi.mock('../../hooks/useDiscoverPools.ts', () => ({
    useDiscoverPools: (...args: unknown[]) => mockUseDiscoverPools(...args),
}));

vi.mock('../../hooks/useFallbackProvider.ts', () => ({
    useFallbackProvider: () => ({} as unknown),
}));

vi.mock('../../config/index.ts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../config/index.ts')>();
    return {
        ...actual,
        CONTRACT_ADDRESSES: {
            factory: 'opt1factory',
            poolTemplate: '',
            pool: '',
        },
        currentNetwork: 'testnet',
    };
});

import { PoolListPage } from '../PoolListPage.tsx';

const EMPTY_REFETCH = vi.fn();

function renderPage() {
    return render(
        <MemoryRouter>
            <PoolListPage />
        </MemoryRouter>
    );
}

describe('PoolListPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows loading skeleton while fetching', () => {
        mockUseDiscoverPools.mockReturnValue({
            pools: [],
            loading: true,
            error: null,
            source: null,
            refetch: EMPTY_REFETCH,
        });
        renderPage();
        expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('shows error state with retry button', () => {
        mockUseDiscoverPools.mockReturnValue({
            pools: [],
            loading: false,
            error: 'Factory RPC error',
            source: null,
            refetch: EMPTY_REFETCH,
        });
        renderPage();
        expect(screen.getByText(/Factory RPC error/)).toBeInTheDocument();
        expect(screen.getByText(/Retry/i)).toBeInTheDocument();
    });

    it('shows empty state when no pools', () => {
        mockUseDiscoverPools.mockReturnValue({
            pools: [],
            loading: false,
            error: null,
            source: null,
            refetch: EMPTY_REFETCH,
        });
        renderPage();
        expect(screen.getByText(/No pools discovered/)).toBeInTheDocument();
    });

    it('renders pool groups', () => {
        mockUseDiscoverPools.mockReturnValue({
            pools: [
                { address: 'opt1poolA', underlying: '0xaa', premiumToken: '0xbb', poolId: 'moto-pill', underlyingSymbol: 'MOTO', premiumSymbol: 'PILL' },
                { address: 'opt1poolB', underlying: '0xbb', premiumToken: '0xaa', poolId: 'pill-moto', underlyingSymbol: 'PILL', premiumSymbol: 'MOTO' },
            ],
            loading: false,
            error: null,
            source: 'factory',
            refetch: EMPTY_REFETCH,
        });
        renderPage();
        expect(screen.getByTestId('pool-grid')).toBeInTheDocument();
        // Both cards rendered inside one group
        expect(screen.getByTestId('pool-card-opt1poolA')).toBeInTheDocument();
        expect(screen.getByTestId('pool-card-opt1poolB')).toBeInTheDocument();
        // Group header with market label
        expect(screen.getByText('MOTO ↔ PILL')).toBeInTheDocument();
    });

    it('search filters at group level — matching pool keeps entire group', () => {
        mockUseDiscoverPools.mockReturnValue({
            pools: [
                { address: 'opt1poolA', underlying: '0xaa', premiumToken: '0xbb', poolId: 'moto-pill', underlyingSymbol: 'MOTO', premiumSymbol: 'PILL' },
                { address: 'opt1poolB', underlying: '0xcc', premiumToken: '0xdd', poolId: 'alpha-beta', underlyingSymbol: 'ALPHA', premiumSymbol: 'BETA' },
            ],
            loading: false,
            error: null,
            source: 'factory',
            refetch: EMPTY_REFETCH,
        });
        renderPage();
        fireEvent.change(screen.getByTestId('pool-search'), { target: { value: 'ALPHA' } });
        expect(screen.getByTestId('pool-card-opt1poolB')).toBeInTheDocument();
        expect(screen.queryByTestId('pool-card-opt1poolA')).not.toBeInTheDocument();
    });

    it('shows no-match message when search has no results', () => {
        mockUseDiscoverPools.mockReturnValue({
            pools: [
                { address: 'opt1poolA', underlying: '0xaa', premiumToken: '0xbb', underlyingSymbol: 'MOTO', premiumSymbol: 'PILL' },
            ],
            loading: false,
            error: null,
            source: 'factory',
            refetch: EMPTY_REFETCH,
        });
        renderPage();
        fireEvent.change(screen.getByTestId('pool-search'), { target: { value: 'zzz' } });
        expect(screen.getByTestId('no-match')).toBeInTheDocument();
    });
});
