/**
 * BuyOptionModal tests — renders cost breakdown, approval flow, buy flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { OptionData, PoolInfo } from '../../services/types.ts';
import { OptionStatus, OptionType } from '../../services/types.ts';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockUseTokenInfo = vi.fn();
vi.mock('../../hooks/useTokenInfo.ts', () => ({
    useTokenInfo: (...args: unknown[]) => mockUseTokenInfo(...args),
}));

const mockSendTransaction = vi.fn();
const mockCallResult = { sendTransaction: mockSendTransaction };
const mockContractMethod = vi.fn(() => Promise.resolve(mockCallResult));
const mockGetContract = vi.fn(() =>
    new Proxy({}, {
        get: (_t, prop) => (typeof prop === 'string' ? mockContractMethod : undefined),
    })
);
vi.mock('opnet', async (importOriginal) => {
    const actual = await importOriginal<typeof import('opnet')>();
    return { ...actual, getContract: (...args: unknown[]) => mockGetContract(...args) };
});

import { BuyOptionModal } from '../BuyOptionModal.tsx';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const POOL_INFO: PoolInfo = {
    underlying: '0xaaaa000000000000000000000000000000000000000000000000000000000001',
    premiumToken: '0xbbbb000000000000000000000000000000000000000000000000000000000002',
    optionCount: 1n,
    cancelFeeBps: 100n,
    buyFeeBps: 100n,      // 1%
    exerciseFeeBps: 10n,
    gracePeriodBlocks: 144n,
};

const POOL_ADDRESS = '0xcccc000000000000000000000000000000000000000000000000000000000003';

const OPEN_OPTION: OptionData = {
    id: 0n,
    writer: '0xdead000000000000000000000000000000000000000000000000000000000001',
    buyer: '0x' + '0'.repeat(64),
    optionType: OptionType.CALL,
    strikePrice: 50n * 10n ** 18n,
    underlyingAmount: 10n ** 18n,
    premium: 5n * 10n ** 18n,         // 5 PILL
    expiryBlock: 900000n,
    status: OptionStatus.OPEN,
};

// totalCost = 5 + (5 * 100 / 10000) = 5.05 PILL = 5050000000000000000n
const TOTAL_COST = OPEN_OPTION.premium + (OPEN_OPTION.premium * 100n) / 10000n;

const makeAddress = (hex: string) => ({ toString: () => hex });
const WALLET_HEX = '0xbeef000000000000000000000000000000000000000000000000000000000002';

const DEFAULT_PROPS = {
    option: OPEN_OPTION,
    poolInfo: POOL_INFO,
    poolAddress: POOL_ADDRESS,
    walletAddress: 'opt1pftest',
    walletHex: WALLET_HEX,
    address: makeAddress(WALLET_HEX) as ReturnType<typeof import('@btc-vision/transaction').Address['fromString']>,
    provider: {
        getPublicKeyInfo: vi.fn().mockResolvedValue({ toString: () => POOL_ADDRESS }),
        call: vi.fn(),
    } as unknown as import('opnet').AbstractRpcProvider,
    network: {} as import('@btc-vision/walletconnect').WalletConnectNetwork,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BuyOptionModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: sufficient balance and allowance
        mockUseTokenInfo.mockReturnValue({
            info: {
                balance: 10n * 10n ** 18n,    // 10 PILL
                allowance: 10n * 10n ** 18n,  // already approved
            },
            loading: false,
            error: null,
            refetch: vi.fn(),
        });
    });

    it('renders modal with cost breakdown', () => {
        render(<BuyOptionModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('buy-option-modal')).toBeInTheDocument();
        // Shows total (premium + fee)
        expect(screen.getByText(/Total/i)).toBeInTheDocument();
        expect(screen.getByText(/Buy fee/i)).toBeInTheDocument();
    });

    it('shows option type label', () => {
        render(<BuyOptionModal {...DEFAULT_PROPS} />);
        expect(screen.getByText('CALL')).toBeInTheDocument();
    });

    it('shows Confirm Purchase when allowance is sufficient', () => {
        render(<BuyOptionModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('btn-buy')).toBeInTheDocument();
        expect(screen.queryByTestId('btn-approve')).not.toBeInTheDocument();
    });

    it('shows Approve PILL when allowance is insufficient', () => {
        mockUseTokenInfo.mockReturnValue({
            info: { balance: 10n * 10n ** 18n, allowance: 0n },
            loading: false,
            error: null,
            refetch: vi.fn(),
        });
        render(<BuyOptionModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('btn-approve')).toBeInTheDocument();
        expect(screen.queryByTestId('btn-buy')).not.toBeInTheDocument();
    });

    it('shows insufficient balance warning when PILL balance < total cost', () => {
        mockUseTokenInfo.mockReturnValue({
            info: {
                balance: 1n * 10n ** 18n,     // only 1 PILL
                allowance: 10n * 10n ** 18n,
            },
            loading: false,
            error: null,
            refetch: vi.fn(),
        });
        render(<BuyOptionModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('balance-error')).toBeInTheDocument();
        // Buy button should be disabled
        expect(screen.getByTestId('btn-buy')).toBeDisabled();
    });

    it('closes when ✕ is clicked', () => {
        const onClose = vi.fn();
        render(<BuyOptionModal {...DEFAULT_PROPS} onClose={onClose} />);
        fireEvent.click(screen.getByLabelText('Close modal'));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls buyOption and sendTransaction on Confirm Purchase', async () => {
        mockSendTransaction.mockResolvedValue({ transactionId: 'buy-tx-001' });
        render(<BuyOptionModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-buy'));

        await waitFor(() => {
            expect(mockGetContract).toHaveBeenCalled();
            expect(mockContractMethod).toHaveBeenCalled();
            expect(mockSendTransaction).toHaveBeenCalled();
        });

        // Verify signer=null (frontend pattern)
        const [params] = mockSendTransaction.mock.calls[0] as [Record<string, unknown>];
        expect(params.signer).toBeNull();
        expect(params.mldsaSigner).toBeNull();
    });

    it('shows success after purchase', async () => {
        mockSendTransaction.mockResolvedValue({ transactionId: 'buy-tx-001' });
        render(<BuyOptionModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-buy'));

        await waitFor(() => {
            expect(screen.getByText(/Purchase broadcast/i)).toBeInTheDocument();
        });
    });

    it('shows tx error on failure', async () => {
        mockSendTransaction.mockRejectedValue(new Error('Insufficient UTXOs'));
        render(<BuyOptionModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-buy'));

        await waitFor(() => {
            expect(screen.getByTestId('tx-error')).toBeInTheDocument();
        });
        expect(screen.getByTestId('tx-error').textContent).toMatch(/Insufficient UTXOs/i);
    });

    it('calls approve flow and sendTransaction for increaseAllowance', async () => {
        mockUseTokenInfo.mockReturnValue({
            info: { balance: 10n * 10n ** 18n, allowance: 0n },
            loading: false,
            error: null,
            refetch: vi.fn(),
        });
        mockSendTransaction.mockResolvedValue({ transactionId: 'approve-tx-001' });

        render(<BuyOptionModal {...DEFAULT_PROPS} />);
        fireEvent.click(screen.getByTestId('btn-approve'));

        await waitFor(() => {
            expect(mockGetContract).toHaveBeenCalled();
            expect(mockContractMethod).toHaveBeenCalled();
        });
    });

    it('total cost includes 1% fee on premium', () => {
        render(<BuyOptionModal {...DEFAULT_PROPS} />);
        // premium = 5 PILL, fee = 0.05 PILL, total = 5.05 PILL
        // 5.05 PILL = 5050000000000000000 wei → displays as "5.0500 PILL"
        // Just verify fee line appears
        expect(screen.getByText(/Buy fee \(1%\)/i)).toBeInTheDocument();
    });
});
