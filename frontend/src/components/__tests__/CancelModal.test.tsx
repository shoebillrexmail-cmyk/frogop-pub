/**
 * CancelModal tests — renders collateral breakdown, cancel fee (0% if expired).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { OptionData, PoolInfo } from '../../services/types.ts';
import { OptionStatus, OptionType } from '../../services/types.ts';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

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

import { CancelModal } from '../CancelModal.tsx';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const POOL_INFO: PoolInfo = {
    underlying: '0xaaaa000000000000000000000000000000000000000000000000000000000001',
    premiumToken: '0xbbbb000000000000000000000000000000000000000000000000000000000002',
    optionCount: 1n,
    cancelFeeBps: 100n,   // 1%
    buyFeeBps: 100n,
    exerciseFeeBps: 10n,
    gracePeriodBlocks: 144n,
};

const POOL_ADDRESS = '0xcccc000000000000000000000000000000000000000000000000000000000003';

const OPEN_OPTION: OptionData = {
    id: 5n,
    writer: '0xdead000000000000000000000000000000000000000000000000000000000001',
    buyer: '0x' + '0'.repeat(64),
    optionType: OptionType.CALL,
    strikePrice: 50n * 10n ** 18n,   // 50 PILL per MOTO (18-decimal)
    underlyingAmount: 10n ** 18n,   // 1 MOTO
    premium: 5n * 10n ** 18n,
    expiryBlock: 900000n,
    status: OptionStatus.OPEN,
};

const makeAddress = (hex: string) => ({ toString: () => hex });
const WALLET_HEX = '0xbeef000000000000000000000000000000000000000000000000000000000002';

function makeProvider(blockNumber: bigint) {
    return {
        getBlockNumber: vi.fn().mockResolvedValue(blockNumber),
    } as unknown as import('opnet').AbstractRpcProvider;
}

const DEFAULT_PROPS = {
    option: OPEN_OPTION,
    poolInfo: POOL_INFO,
    poolAddress: POOL_ADDRESS,
    walletAddress: 'opt1pftest',
    address: makeAddress(WALLET_HEX) as ReturnType<typeof import('@btc-vision/transaction').Address['fromString']>,
    provider: makeProvider(800000n),   // before expiry
    network: {} as import('@btc-vision/walletconnect').WalletConnectNetwork,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CancelModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders modal with collateral breakdown', async () => {
        render(<CancelModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('cancel-option-modal')).toBeInTheDocument();
        expect(screen.getByText(/Collateral locked/i)).toBeInTheDocument();
        expect(screen.getByText(/Cancel fee/i)).toBeInTheDocument();
        expect(screen.getByText(/You receive/i)).toBeInTheDocument();
    });

    it('shows cancel button', () => {
        render(<CancelModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('btn-cancel-confirm')).toBeInTheDocument();
    });

    it('shows 1% fee when option is not expired', async () => {
        render(<CancelModal {...DEFAULT_PROPS} />);
        // Wait for block number to load
        await waitFor(() => {
            expect(screen.getByText(/1%/)).toBeInTheDocument();
        });
    });

    it('shows 0% fee and "waived" when option has expired', async () => {
        const expiredProvider = makeProvider(1000000n);  // after expiry block 900000
        render(<CancelModal {...DEFAULT_PROPS} provider={expiredProvider} />);
        await waitFor(() => {
            expect(screen.getByText(/0%/)).toBeInTheDocument();
            expect(screen.getByText(/waived/i)).toBeInTheDocument();
        });
    });

    it('closes when ✕ is clicked', () => {
        const onClose = vi.fn();
        render(<CancelModal {...DEFAULT_PROPS} onClose={onClose} />);
        fireEvent.click(screen.getByLabelText('Close modal'));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls cancelOption and sendTransaction on Confirm Cancel', async () => {
        mockSendTransaction.mockResolvedValue({ transactionId: 'cancel-tx-001' });
        render(<CancelModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-cancel-confirm'));

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

    it('shows success after cancellation', async () => {
        mockSendTransaction.mockResolvedValue({ transactionId: 'cancel-tx-001' });
        render(<CancelModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-cancel-confirm'));

        await waitFor(() => {
            expect(screen.getByTestId('transaction-receipt')).toBeInTheDocument();
        });
    });

    it('shows tx error on failure', async () => {
        mockSendTransaction.mockRejectedValue(new Error('Not the writer'));
        render(<CancelModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-cancel-confirm'));

        await waitFor(() => {
            expect(screen.getByTestId('tx-error')).toBeInTheDocument();
        });
        expect(screen.getByTestId('tx-error').textContent).toMatch(/Not the writer/i);
    });

    it('disables button while cancelling', async () => {
        // Never resolves
        mockSendTransaction.mockReturnValue(new Promise(() => {}));
        render(<CancelModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-cancel-confirm'));

        await waitFor(() => {
            expect(screen.getByTestId('btn-cancel-confirm')).toBeDisabled();
        });
    });
});
