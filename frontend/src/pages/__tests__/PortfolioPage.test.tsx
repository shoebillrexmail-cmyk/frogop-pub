/**
 * PortfolioPage tests — connect gate, option filtering, empty states, grace banner, source badge.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

const mockUseUserOptions = vi.fn();
vi.mock('../../hooks/useUserOptions.ts', () => ({
    useUserOptions: (...args: unknown[]) => mockUseUserOptions(...args),
}));

const mockUseTokenInfo = vi.fn();
vi.mock('../../hooks/useTokenInfo.ts', () => ({
    useTokenInfo: (...args: unknown[]) => mockUseTokenInfo(...args),
}));

vi.mock('../../hooks/useDiscoverPools.ts', () => ({
    useDiscoverPools: () => ({
        pools: [{ address: 'opt1pftest000', underlying: '', premiumToken: '' }],
        loading: false,
        error: null,
        source: 'env',
        refetch: vi.fn(),
    }),
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
    };
});

import { useWalletConnect } from '@btc-vision/walletconnect';
import { PortfolioPage } from '../PortfolioPage.tsx';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const WALLET_HEX = '0xdead000000000000000000000000000000000000000000000000000000000001';
const BUYER_HEX  = '0xbeef000000000000000000000000000000000000000000000000000000000002';
const ZERO_HEX   = '0x' + '0'.repeat(64);

const MOCK_POOL_INFO: PoolInfo = {
    underlying: '0xaaaa000000000000000000000000000000000000000000000000000000000001',
    premiumToken: '0xbbbb000000000000000000000000000000000000000000000000000000000002',
    optionCount: 3n,
    cancelFeeBps: 100n,
    buyFeeBps: 100n,
    exerciseFeeBps: 10n,
    gracePeriodBlocks: 144n,
};

function makeOption(
    id: bigint,
    writer: string,
    buyer: string,
    status: number,
    optionType: number = OptionType.CALL,
): OptionData {
    return {
        id,
        writer,
        buyer,
        optionType,
        strikePrice: 50n * 10n ** 18n,
        underlyingAmount: 10n ** 18n,
        premium: 5n * 10n ** 17n,
        expiryBlock: 900000n,
        status,
    };
}

const EMPTY_REFETCH = vi.fn();

function mockWalletConnected() {
    vi.mocked(useWalletConnect).mockReturnValue({
        walletAddress: 'opt1pfwallet',
        connecting: false,
        openConnectModal: vi.fn(),
        disconnect: vi.fn(),
        address: { toString: () => WALLET_HEX } as ReturnType<typeof useWalletConnect>['address'],
        provider: null,
        network: null,
    } as ReturnType<typeof useWalletConnect>);
}

function renderPage() {
    return render(
        <MemoryRouter>
            <PortfolioPage />
        </MemoryRouter>
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PortfolioPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default pool response (poolInfo only — options no longer used here)
        mockUsePool.mockReturnValue({
            poolInfo: MOCK_POOL_INFO,
            options: [],
            loading: false,
            error: null,
            refetch: EMPTY_REFETCH,
        });

        // Default useUserOptions response
        mockUseUserOptions.mockReturnValue({
            writtenOptions: [
                makeOption(0n, WALLET_HEX, ZERO_HEX, OptionStatus.OPEN),
                makeOption(1n, WALLET_HEX, ZERO_HEX, OptionStatus.CANCELLED),
            ],
            purchasedOptions: [
                makeOption(2n, BUYER_HEX, WALLET_HEX, OptionStatus.PURCHASED),
            ],
            source: 'indexer',
            loading: false,
            error: null,
            refetch: EMPTY_REFETCH,
        });

        // Default token info (no balance needed for most tests)
        mockUseTokenInfo.mockReturnValue({
            info: { balance: 100n * 10n ** 18n, allowance: 0n },
            loading: false,
            error: null,
            refetch: vi.fn(),
        });

        // Default: disconnected
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

    // -------------------------------------------------------------------------
    // Connect gate
    // -------------------------------------------------------------------------

    it('shows connect gate when wallet is not connected', () => {
        renderPage();
        expect(screen.getByText(/Connect your OPWallet/i)).toBeInTheDocument();
        expect(screen.getByText(/Connect Wallet/i)).toBeInTheDocument();
    });

    it('does not show pool data when disconnected', () => {
        renderPage();
        expect(screen.queryByTestId('written-section')).not.toBeInTheDocument();
        expect(screen.queryByTestId('purchased-section')).not.toBeInTheDocument();
    });

    // -------------------------------------------------------------------------
    // Connected wallet — option filtering
    // -------------------------------------------------------------------------

    it('shows written and purchased sections when connected', () => {
        mockWalletConnected();
        renderPage();
        expect(screen.getByTestId('written-section')).toBeInTheDocument();
        expect(screen.getByTestId('purchased-section')).toBeInTheDocument();
    });

    it('filters written options by wallet address', () => {
        mockWalletConnected();
        renderPage();
        // Options 0 and 1 are written by WALLET_HEX
        expect(screen.getByTestId('option-row-0')).toBeInTheDocument();
        expect(screen.getByTestId('option-row-1')).toBeInTheDocument();
        // Option 3 is written by BUYER_HEX — should not appear in written section
        // (it may appear in purchased section if buyer matches, but not here)
    });

    it('filters purchased options by wallet address', () => {
        mockWalletConnected();
        renderPage();
        // Option 2 is purchased by WALLET_HEX
        expect(screen.getByTestId('option-row-2')).toBeInTheDocument();
        // Option 3 has buyer = ZERO_HEX, should not appear in purchased
    });

    // -------------------------------------------------------------------------
    // Empty states
    // -------------------------------------------------------------------------

    it('shows written empty state with Go to Pools link', () => {
        mockWalletConnected();
        mockUseUserOptions.mockReturnValue({
            writtenOptions: [],
            purchasedOptions: [],
            source: 'indexer',
            loading: false,
            error: null,
            refetch: EMPTY_REFETCH,
        });
        renderPage();
        expect(screen.getByText(/No written options yet/i)).toBeInTheDocument();
        expect(screen.getByTestId('go-to-pools-written')).toBeInTheDocument();
    });

    it('shows purchased empty state with Go to Pools link when no purchased options', () => {
        mockWalletConnected();
        mockUseUserOptions.mockReturnValue({
            writtenOptions: [makeOption(0n, WALLET_HEX, ZERO_HEX, OptionStatus.OPEN)],
            purchasedOptions: [],
            source: 'indexer',
            loading: false,
            error: null,
            refetch: EMPTY_REFETCH,
        });
        renderPage();
        expect(screen.getByText(/No purchased options/i)).toBeInTheDocument();
        expect(screen.getByTestId('go-to-pools-purchased')).toBeInTheDocument();
    });

    // -------------------------------------------------------------------------
    // Grace period warning banner
    // -------------------------------------------------------------------------

    it('shows grace period banner for PURCHASED options', () => {
        mockWalletConnected();
        renderPage();
        // option 2 is PURCHASED by WALLET_HEX
        expect(screen.getByTestId('grace-banner')).toBeInTheDocument();
    });

    it('does not show grace banner when no PURCHASED options', () => {
        mockWalletConnected();
        mockUseUserOptions.mockReturnValue({
            writtenOptions: [makeOption(0n, WALLET_HEX, ZERO_HEX, OptionStatus.OPEN)],
            purchasedOptions: [],
            source: 'indexer',
            loading: false,
            error: null,
            refetch: EMPTY_REFETCH,
        });
        renderPage();
        expect(screen.queryByTestId('grace-banner')).not.toBeInTheDocument();
    });

    // -------------------------------------------------------------------------
    // Balances card
    // -------------------------------------------------------------------------

    it('renders balances card with MOTO and PILL balances', () => {
        mockWalletConnected();
        mockUseTokenInfo.mockReturnValue({
            info: { balance: 1000n * 10n ** 18n, allowance: 0n },
            loading: false,
            error: null,
            refetch: vi.fn(),
        });
        renderPage();
        expect(screen.getByTestId('moto-balance')).toBeInTheDocument();
        expect(screen.getByTestId('pill-balance')).toBeInTheDocument();
    });

    // -------------------------------------------------------------------------
    // Loading / error states
    // -------------------------------------------------------------------------

    it('shows loading skeleton while fetching', () => {
        mockWalletConnected();
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

    it('shows error state with retry', () => {
        mockWalletConnected();
        mockUsePool.mockReturnValue({
            poolInfo: null,
            options: [],
            loading: false,
            error: 'Network error',
            refetch: EMPTY_REFETCH,
        });
        renderPage();
        expect(screen.getByText(/Network error/i)).toBeInTheDocument();
        expect(screen.getByText(/Retry/i)).toBeInTheDocument();
    });

    // -------------------------------------------------------------------------
    // Source badge
    // -------------------------------------------------------------------------

    it('shows "via Indexer" source badge when source is indexer', () => {
        mockWalletConnected();
        renderPage();
        expect(screen.getByTestId('source-badge')).toHaveTextContent('via Indexer');
    });

    it('shows "Live from chain" badge when source is chain', () => {
        mockWalletConnected();
        mockUseUserOptions.mockReturnValue({
            writtenOptions: [makeOption(0n, WALLET_HEX, ZERO_HEX, OptionStatus.OPEN)],
            purchasedOptions: [],
            source: 'chain',
            loading: false,
            error: null,
            refetch: EMPTY_REFETCH,
        });
        renderPage();
        expect(screen.getByTestId('source-badge')).toHaveTextContent('Live from chain');
    });
});
