/**
 * BatchCancelModal tests — renders option list, totals, and calls batchCancel.
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

import { BatchCancelModal } from '../BatchCancelModal.tsx';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const POOL_INFO: PoolInfo = {
    underlying: '0xaaaa000000000000000000000000000000000000000000000000000000000001',
    premiumToken: '0xbbbb000000000000000000000000000000000000000000000000000000000002',
    optionCount: 5n,
    cancelFeeBps: 100n,
    buyFeeBps: 100n,
    exerciseFeeBps: 10n,
    gracePeriodBlocks: 144n,
};

const POOL_ADDRESS = '0xcccc000000000000000000000000000000000000000000000000000000000003';

const makeOption = (id: bigint): OptionData => ({
    id,
    writer: '0xdead000000000000000000000000000000000000000000000000000000000001',
    buyer: '0x' + '0'.repeat(64),
    optionType: OptionType.CALL,
    strikePrice: 50n * 10n ** 18n,   // 50 PILL per MOTO (18-decimal)
    underlyingAmount: 10n ** 18n,
    premium: 5n * 10n ** 18n,
    expiryBlock: 900000n,
    status: OptionStatus.OPEN,
});

const SELECTED_OPTIONS: OptionData[] = [makeOption(1n), makeOption(2n), makeOption(3n)];

const makeAddress = (hex: string) => ({ toString: () => hex });
const WALLET_HEX = '0xbeef000000000000000000000000000000000000000000000000000000000002';

function makeProvider(blockNumber: bigint) {
    return {
        getBlockNumber: vi.fn().mockResolvedValue(blockNumber),
    } as unknown as import('opnet').AbstractRpcProvider;
}

const DEFAULT_PROPS = {
    options: SELECTED_OPTIONS,
    poolInfo: POOL_INFO,
    poolAddress: POOL_ADDRESS,
    walletAddress: 'opt1pftest',
    address: makeAddress(WALLET_HEX) as ReturnType<typeof import('@btc-vision/transaction').Address['fromString']>,
    provider: makeProvider(800000n),
    network: {} as import('@btc-vision/walletconnect').WalletConnectNetwork,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BatchCancelModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders modal with option count', () => {
        render(<BatchCancelModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('batch-cancel-modal')).toBeInTheDocument();
        expect(screen.getByText(/Batch Cancel/i)).toBeInTheDocument();
        expect(screen.getAllByText(/3 option/i).length).toBeGreaterThanOrEqual(1);
    });

    it('shows per-option breakdown', () => {
        render(<BatchCancelModal {...DEFAULT_PROPS} />);
        expect(screen.getByText(/#1/)).toBeInTheDocument();
        expect(screen.getByText(/#2/)).toBeInTheDocument();
        expect(screen.getByText(/#3/)).toBeInTheDocument();
    });

    it('shows total fees and returned', () => {
        render(<BatchCancelModal {...DEFAULT_PROPS} />);
        expect(screen.getByText(/Total fees/i)).toBeInTheDocument();
        expect(screen.getByText(/Total returned/i)).toBeInTheDocument();
    });

    it('closes when close button clicked', () => {
        const onClose = vi.fn();
        render(<BatchCancelModal {...DEFAULT_PROPS} onClose={onClose} />);
        fireEvent.click(screen.getByLabelText('Close modal'));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls batchCancel and sendTransaction', async () => {
        mockSendTransaction.mockResolvedValue({ transactionId: 'batch-cancel-tx-001' });
        render(<BatchCancelModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-batch-cancel'));

        await waitFor(() => {
            expect(mockGetContract).toHaveBeenCalled();
            expect(mockContractMethod).toHaveBeenCalled();
            expect(mockSendTransaction).toHaveBeenCalled();
        });

        const [params] = mockSendTransaction.mock.calls[0] as [Record<string, unknown>];
        expect(params.signer).toBeNull();
        expect(params.mldsaSigner).toBeNull();
    });

    it('shows success after batch cancel', async () => {
        mockSendTransaction.mockResolvedValue({ transactionId: 'batch-cancel-tx-001' });
        render(<BatchCancelModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-batch-cancel'));

        await waitFor(() => {
            expect(screen.getByText(/Batch cancellation broadcast/i)).toBeInTheDocument();
        });
    });

    it('shows error on failure', async () => {
        mockSendTransaction.mockRejectedValue(new Error('Not writer'));
        render(<BatchCancelModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-batch-cancel'));

        await waitFor(() => {
            expect(screen.getByTestId('tx-error')).toBeInTheDocument();
        });
    });

    it('disables button while cancelling', async () => {
        mockSendTransaction.mockReturnValue(new Promise(() => {}));
        render(<BatchCancelModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-batch-cancel'));

        await waitFor(() => {
            expect(screen.getByTestId('btn-batch-cancel')).toBeDisabled();
        });
    });
});
