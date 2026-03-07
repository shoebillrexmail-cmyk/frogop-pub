/**
 * BatchSettleModal tests — renders option list and calls batchSettle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { OptionData } from '../../services/types.ts';
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

import { BatchSettleModal } from '../BatchSettleModal.tsx';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const POOL_ADDRESS = '0xcccc000000000000000000000000000000000000000000000000000000000003';

const makeOption = (id: bigint): OptionData => ({
    id,
    writer: '0xdead000000000000000000000000000000000000000000000000000000000001',
    buyer: '0xbeef000000000000000000000000000000000000000000000000000000000002',
    optionType: OptionType.CALL,
    strikePrice: 50n * 10n ** 18n,   // 50 PILL per MOTO (18-decimal)
    underlyingAmount: 10n ** 18n,
    premium: 5n * 10n ** 18n,
    expiryBlock: 800000n,
    status: OptionStatus.PURCHASED,
});

const SELECTED_OPTIONS: OptionData[] = [makeOption(10n), makeOption(11n)];

const makeAddress = (hex: string) => ({ toString: () => hex });
const WALLET_HEX = '0xbeef000000000000000000000000000000000000000000000000000000000002';

function makeProvider() {
    return {
        getBlockNumber: vi.fn().mockResolvedValue(900000n),
    } as unknown as import('opnet').AbstractRpcProvider;
}

const DEFAULT_PROPS = {
    options: SELECTED_OPTIONS,
    poolAddress: POOL_ADDRESS,
    walletAddress: 'opt1pftest',
    address: makeAddress(WALLET_HEX) as ReturnType<typeof import('@btc-vision/transaction').Address['fromString']>,
    provider: makeProvider(),
    network: {} as import('@btc-vision/walletconnect').WalletConnectNetwork,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BatchSettleModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders modal with option count', () => {
        render(<BatchSettleModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('batch-settle-modal')).toBeInTheDocument();
        expect(screen.getByText(/Batch Settle/i)).toBeInTheDocument();
        expect(screen.getAllByText(/2 option/i).length).toBeGreaterThanOrEqual(1);
    });

    it('shows per-option list', () => {
        render(<BatchSettleModal {...DEFAULT_PROPS} />);
        expect(screen.getByText(/#10/)).toBeInTheDocument();
        expect(screen.getByText(/#11/)).toBeInTheDocument();
    });

    it('shows total collateral and no-fee message', () => {
        render(<BatchSettleModal {...DEFAULT_PROPS} />);
        expect(screen.getByText(/Total collateral returned/i)).toBeInTheDocument();
        expect(screen.getByText(/No settle fee/i)).toBeInTheDocument();
    });

    it('closes when close button clicked', () => {
        const onClose = vi.fn();
        render(<BatchSettleModal {...DEFAULT_PROPS} onClose={onClose} />);
        fireEvent.click(screen.getByLabelText('Close modal'));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls batchSettle and sendTransaction', async () => {
        mockSendTransaction.mockResolvedValue({ transactionId: 'batch-settle-tx-001' });
        render(<BatchSettleModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-batch-settle'));

        await waitFor(() => {
            expect(mockGetContract).toHaveBeenCalled();
            expect(mockContractMethod).toHaveBeenCalled();
            expect(mockSendTransaction).toHaveBeenCalled();
        });

        const [params] = mockSendTransaction.mock.calls[0] as [Record<string, unknown>];
        expect(params.signer).toBeNull();
        expect(params.mldsaSigner).toBeNull();
    });

    it('shows success after batch settle', async () => {
        mockSendTransaction.mockResolvedValue({ transactionId: 'batch-settle-tx-001' });
        render(<BatchSettleModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-batch-settle'));

        await waitFor(() => {
            expect(screen.getByTestId('transaction-receipt')).toBeInTheDocument();
        });
    });

    it('shows error on failure', async () => {
        mockSendTransaction.mockRejectedValue(new Error('Gas exceeded'));
        render(<BatchSettleModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-batch-settle'));

        await waitFor(() => {
            expect(screen.getByTestId('tx-error')).toBeInTheDocument();
        });
    });

    it('disables button while settling', async () => {
        mockSendTransaction.mockReturnValue(new Promise(() => {}));
        render(<BatchSettleModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-batch-settle'));

        await waitFor(() => {
            expect(screen.getByTestId('btn-batch-settle')).toBeDisabled();
        });
    });
});
