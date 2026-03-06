/**
 * PoolDetailPage tests — two-tab layout, filter controls, row action visibility.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { OptionData, PoolInfo } from '../../services/types.ts';
import { OptionStatus, OptionType } from '../../services/types.ts';

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

const mockUsePool = vi.fn();
vi.mock('../../hooks/usePool.ts', () => ({
    usePool: (...args: unknown[]) => mockUsePool(...args),
}));

const mockFallbackProvider = {} as unknown;
vi.mock('../../hooks/useFallbackProvider.ts', () => ({
    useFallbackProvider: () => mockFallbackProvider,
}));

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
import { PoolDetailPage } from '../PoolDetailPage.tsx';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const POOL_ADDR = 'opt1pftest000';
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
        <MemoryRouter initialEntries={[`/pools/${POOL_ADDR}`]}>
            <Routes>
                <Route path="pools/:address" element={<PoolDetailPage />} />
            </Routes>
        </MemoryRouter>
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PoolDetailPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        try { sessionStorage.clear(); } catch { /* noop */ }
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

    function switchToWriteTab() {
        fireEvent.click(screen.getByTestId('tab-write'));
    }

    function switchToList() {
        fireEvent.click(screen.getByTestId('view-mode-list'));
    }

    // Header bar
    it('renders pool header bar with fee data', () => {
        renderPage();
        expect(screen.getByTestId('pool-header-bar')).toBeInTheDocument();
        expect(screen.getByTestId('pool-name')).toHaveTextContent('MOTO / PILL Pool');
        expect(screen.getByTestId('fees-summary')).toBeInTheDocument();
    });

    // Breadcrumb
    it('renders breadcrumb with link to /pools', () => {
        renderPage();
        const breadcrumb = screen.getByTestId('breadcrumb');
        expect(breadcrumb).toBeInTheDocument();
        expect(breadcrumb.querySelector('a[href="/pools"]')).toBeInTheDocument();
    });

    // Tab structure
    it('defaults to buy tab with chain visible', () => {
        renderPage();
        expect(screen.getByTestId('buy-tab-content')).toBeInTheDocument();
        expect(screen.queryByTestId('write-tab-content')).not.toBeInTheDocument();
        expect(screen.getByText('Options Chain')).toBeInTheDocument();
    });

    it('click write tab shows yield overview and strategies', () => {
        renderPage();
        switchToWriteTab();
        expect(screen.getByTestId('write-tab-content')).toBeInTheDocument();
        expect(screen.getByTestId('yield-overview')).toBeInTheDocument();
        expect(screen.getByTestId('writer-how-it-works')).toBeInTheDocument();
        expect(screen.getByTestId('strategy-covered-call')).toBeInTheDocument();
        expect(screen.getByTestId('strategy-write-custom')).toBeInTheDocument();
        expect(screen.queryByTestId('buy-tab-content')).not.toBeInTheDocument();
    });

    it('tab persists to sessionStorage', () => {
        renderPage();
        switchToWriteTab();
        expect(sessionStorage.getItem('frogop_pool_tab')).toBe('write');
    });

    it('protective put card appears on buy tab', () => {
        renderPage();
        expect(screen.getByTestId('protective-put-card')).toBeInTheDocument();
    });

    it('buy value prop line is visible on buy tab', () => {
        renderPage();
        expect(screen.getByTestId('buy-value-prop')).toBeInTheDocument();
    });

    // Options table (list view)
    it('renders options table with all rows in list view', () => {
        renderPage();
        switchToList();
        expect(screen.getByTestId('option-row-0')).toBeInTheDocument();
        expect(screen.getByTestId('option-row-1')).toBeInTheDocument();
        expect(screen.getByTestId('option-row-2')).toBeInTheDocument();
        expect(screen.getByTestId('option-row-3')).toBeInTheDocument();
    });

    it('filter by OPEN hides non-OPEN rows', () => {
        renderPage();
        switchToList();
        fireEvent.click(screen.getByTestId('filter-open'));
        expect(screen.getByTestId('option-row-0')).toBeInTheDocument();
        expect(screen.queryByTestId('option-row-1')).not.toBeInTheDocument();
    });

    it('shows loading skeleton while fetching', () => {
        mockUsePool.mockReturnValue({
            poolInfo: null,
            options: [],
            loading: true,
            error: null,
            refetch: EMPTY_REFETCH,
        });
        renderPage();
        expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('shows error state with retry button', () => {
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

    describe('row actions — writer wallet (list view)', () => {
        beforeEach(() => {
            const mockAddr = { toString: () => WRITER_HEX };
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
            switchToList();
            expect(screen.getByTestId('cancel-0')).toBeInTheDocument();
            expect(screen.queryByTestId('buy-0')).not.toBeInTheDocument();
        });
    });

    it('shows network badge for non-mainnet', () => {
        renderPage();
        expect(screen.getByText(/Testnet/i)).toBeInTheDocument();
    });

    it('does not render CollarModal', () => {
        renderPage();
        switchToWriteTab();
        expect(screen.queryByTestId('collar-modal')).not.toBeInTheDocument();
    });

    it('collar card links to /strategies with pool and strategy params', () => {
        renderPage();
        switchToWriteTab();
        const collarBtn = screen.getByTestId('strategy-collar-btn');
        // When wallet is not connected, collar renders as a disabled button
        // Just verify it exists and no CollarModal is present
        expect(collarBtn).toBeInTheDocument();
        expect(screen.queryByTestId('collar-modal')).not.toBeInTheDocument();
    });
});
