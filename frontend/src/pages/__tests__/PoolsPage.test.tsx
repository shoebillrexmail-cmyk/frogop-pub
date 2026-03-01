/**
 * PoolsPage tests — real data rendering, filter controls, row action visibility,
 * and factory-driven pool discovery.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { OptionData, PoolInfo } from '../../services/types.ts';
import { OptionStatus, OptionType } from '../../services/types.ts';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports so vi.mock hoisting works
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

const mockUsePool = vi.fn();
vi.mock('../../hooks/usePool.ts', () => ({
    usePool: (...args: unknown[]) => mockUsePool(...args),
}));

const mockUseDiscoverPools = vi.fn();
vi.mock('../../hooks/useDiscoverPools.ts', () => ({
    useDiscoverPools: (...args: unknown[]) => mockUseDiscoverPools(...args),
}));

const mockFallbackProvider = {} as unknown;
vi.mock('../../hooks/useFallbackProvider.ts', () => ({
    useFallbackProvider: () => mockFallbackProvider,
}));

// Pool address config — provide a non-empty pool address so the page renders data
vi.mock('../../config/index.ts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../config/index.ts')>();
    return {
        ...actual,
        CONTRACT_ADDRESSES: {
            factory: '',
            poolTemplate: '',
            pool: 'opt1pftest000',
        },
        currentNetwork: 'testnet',
    };
});

import { useWalletConnect } from '@btc-vision/walletconnect';
import { PoolsPage } from '../PoolsPage.tsx';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const WRITER_HEX = '0xdead000000000000000000000000000000000000000000000000000000000001';
const BUYER_HEX  = '0xbeef000000000000000000000000000000000000000000000000000000000002';
const ZERO_HEX   = '0x' + '0'.repeat(64);

const mockPoolInfo: PoolInfo = {
    underlying: '0xaaaa000000000000000000000000000000000000000000000000000000000001',
    premiumToken: '0xbbbb000000000000000000000000000000000000000000000000000000000002',
    optionCount: 4n,
    cancelFeeBps: 100n,
    buyFeeBps: 100n,
    exerciseFeeBps: 10n,
    gracePeriodBlocks: 144n,
};

const makeOption = (
    id: bigint,
    status: number,
    optionType: number = OptionType.CALL,
    writer = WRITER_HEX,
    buyer = ZERO_HEX,
): OptionData => ({
    id,
    writer,
    buyer,
    optionType,
    strikePrice: 50n * 10n ** 18n,
    underlyingAmount: 10n ** 18n,
    premium: 5n * 10n ** 17n,
    expiryBlock: 900000n,
    status,
});

const mockOptions: OptionData[] = [
    makeOption(0n, OptionStatus.OPEN),
    makeOption(1n, OptionStatus.PURCHASED, OptionType.PUT, WRITER_HEX, BUYER_HEX),
    makeOption(2n, OptionStatus.EXPIRED),
    makeOption(3n, OptionStatus.CANCELLED),
];

const EMPTY_REFETCH = vi.fn();

function renderPage() {
    return render(
        <MemoryRouter>
            <PoolsPage />
        </MemoryRouter>
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PoolsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: single pool from env, loaded successfully
        mockUseDiscoverPools.mockReturnValue({
            pools: [{ address: 'opt1pftest000', underlying: '', premiumToken: '' }],
            loading: false,
            error: null,
            source: 'env',
            refetch: EMPTY_REFETCH,
        });
        mockUsePool.mockReturnValue({
            poolInfo: mockPoolInfo,
            options: mockOptions,
            loading: false,
            error: null,
            refetch: EMPTY_REFETCH,
        });
        vi.mocked(useWalletConnect).mockReturnValue({
            walletAddress: null,
            connecting: false,
            openConnectModal: vi.fn(),
            disconnect: vi.fn(),
            address: null,
            provider: null,
            network: null,
        } as ReturnType<typeof useWalletConnect>);
    });

    it('renders pool info card with fee data', () => {
        renderPage();
        expect(screen.getByText(/MOTO \/ PILL Pool/i)).toBeInTheDocument();
        expect(screen.getByText(/Options:/)).toBeInTheDocument();
        expect(screen.getByText(/Buy fee:/)).toBeInTheDocument();
    });

    it('renders options table with all rows by default', () => {
        renderPage();
        expect(screen.getByTestId('option-row-0')).toBeInTheDocument();
        expect(screen.getByTestId('option-row-1')).toBeInTheDocument();
        expect(screen.getByTestId('option-row-2')).toBeInTheDocument();
        expect(screen.getByTestId('option-row-3')).toBeInTheDocument();
    });

    it('displays CALL and PUT type labels', () => {
        renderPage();
        expect(screen.getAllByText('CALL').length).toBeGreaterThan(0);
        expect(screen.getAllByText('PUT').length).toBeGreaterThan(0);
    });

    it('filter by OPEN hides non-OPEN rows', () => {
        renderPage();
        fireEvent.click(screen.getByTestId('filter-open'));

        expect(screen.getByTestId('option-row-0')).toBeInTheDocument();
        expect(screen.queryByTestId('option-row-1')).not.toBeInTheDocument();
        expect(screen.queryByTestId('option-row-2')).not.toBeInTheDocument();
        expect(screen.queryByTestId('option-row-3')).not.toBeInTheDocument();
    });

    it('filter by EXPIRED shows only expired rows', () => {
        renderPage();
        fireEvent.click(screen.getByTestId('filter-expired'));

        expect(screen.queryByTestId('option-row-0')).not.toBeInTheDocument();
        expect(screen.getByTestId('option-row-2')).toBeInTheDocument();
    });

    it('shows loading skeleton while fetching', () => {
        mockUseDiscoverPools.mockReturnValue({
            pools: [],
            loading: true,
            error: null,
            source: null,
            refetch: EMPTY_REFETCH,
        });
        mockUsePool.mockReturnValue({
            poolInfo: null,
            options: [],
            loading: false,
            error: null,
            refetch: EMPTY_REFETCH,
        });
        renderPage();
        // Skeleton divs have animate-pulse class
        expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('shows error state with retry button', () => {
        mockUseDiscoverPools.mockReturnValue({
            pools: [],
            loading: false,
            error: null,
            source: null,
            refetch: EMPTY_REFETCH,
        });
        mockUsePool.mockReturnValue({
            poolInfo: null,
            options: [],
            loading: false,
            error: 'RPC timeout',
            refetch: EMPTY_REFETCH,
        });
        renderPage();
        expect(screen.getByText(/RPC timeout/i)).toBeInTheDocument();
        expect(screen.getByText(/Retry/i)).toBeInTheDocument();
    });

    it('retry button calls refetch', () => {
        const poolRefetch = vi.fn();
        const discoveryRefetch = vi.fn();
        mockUseDiscoverPools.mockReturnValue({
            pools: [],
            loading: false,
            error: null,
            source: null,
            refetch: discoveryRefetch,
        });
        mockUsePool.mockReturnValue({
            poolInfo: null,
            options: [],
            loading: false,
            error: 'RPC timeout',
            refetch: poolRefetch,
        });
        renderPage();
        fireEvent.click(screen.getByText(/Retry/i));
        expect(poolRefetch).toHaveBeenCalledOnce();
        expect(discoveryRefetch).toHaveBeenCalledOnce();
    });

    describe('row actions — disconnected wallet', () => {
        it('OPEN option shows Buy button for disconnected user', () => {
            renderPage();
            expect(screen.getByTestId('buy-0')).toBeInTheDocument();
        });

        it('EXPIRED option shows Settle button', () => {
            renderPage();
            expect(screen.getByTestId('settle-2')).toBeInTheDocument();
        });

        it('CANCELLED option shows no action', () => {
            renderPage();
            expect(screen.queryByTestId('buy-3')).not.toBeInTheDocument();
            expect(screen.queryByTestId('cancel-3')).not.toBeInTheDocument();
        });
    });

    describe('row actions — writer wallet', () => {
        beforeEach(() => {
            // Simulate connected wallet = writer
            const mockAddr = {
                toString: () => WRITER_HEX,
            };
            vi.mocked(useWalletConnect).mockReturnValue({
                walletAddress: 'opt1pfwriter',
                connecting: false,
                openConnectModal: vi.fn(),
                disconnect: vi.fn(),
                address: mockAddr as ReturnType<typeof useWalletConnect>['address'],
                provider: null,
                network: null,
            } as ReturnType<typeof useWalletConnect>);
        });

        it('OPEN option shows Cancel for writer', () => {
            renderPage();
            expect(screen.getByTestId('cancel-0')).toBeInTheDocument();
            expect(screen.queryByTestId('buy-0')).not.toBeInTheDocument();
        });
    });

    it('shows network badge for non-mainnet', () => {
        renderPage();
        expect(screen.getByText(/Testnet/i)).toBeInTheDocument();
    });

    // ---------------------------------------------------------------------------
    // Multi-pool discovery tests
    // ---------------------------------------------------------------------------

    describe('multi-pool discovery', () => {
        const POOL_A = 'opt1poolAAAA';
        const POOL_B = 'opt1poolBBBB';

        beforeEach(() => {
            mockUseDiscoverPools.mockReturnValue({
                pools: [
                    { address: POOL_A, underlying: '0xaa', premiumToken: '0xbb' },
                    { address: POOL_B, underlying: '0xcc', premiumToken: '0xdd' },
                ],
                loading: false,
                error: null,
                source: 'factory',
                refetch: EMPTY_REFETCH,
            });
        });

        it('renders pool selector buttons when multiple pools exist', () => {
            renderPage();
            expect(screen.getByTestId(`pool-selector-${POOL_A}`)).toBeInTheDocument();
            expect(screen.getByTestId(`pool-selector-${POOL_B}`)).toBeInTheDocument();
        });

        it('auto-selects the first pool', () => {
            renderPage();
            // usePool should have been called with the first pool address + fallback provider
            expect(mockUsePool).toHaveBeenCalledWith(POOL_A, expect.anything());
        });

        it('switching pool updates usePool call', () => {
            renderPage();
            fireEvent.click(screen.getByTestId(`pool-selector-${POOL_B}`));
            // After click, the next render should call usePool with POOL_B + fallback provider
            expect(mockUsePool).toHaveBeenCalledWith(POOL_B, expect.anything());
        });

        it('shows source badge for factory', () => {
            renderPage();
            expect(screen.getByText(/source: factory/)).toBeInTheDocument();
        });
    });
});
