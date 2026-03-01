/**
 * SettleModal tests — renders collateral recovery info, settle flow.
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

import { SettleModal } from '../SettleModal.tsx';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const POOL_ADDRESS = '0xcccc000000000000000000000000000000000000000000000000000000000003';

const PURCHASED_OPTION: OptionData = {
    id: 9n,
    writer: '0xdead000000000000000000000000000000000000000000000000000000000001',
    buyer: '0xbeef000000000000000000000000000000000000000000000000000000000002',
    optionType: OptionType.CALL,
    strikePrice: 50n * 10n ** 18n,   // 50 PILL per MOTO (18-decimal)
    underlyingAmount: 10n ** 18n,   // 1 MOTO collateral
    premium: 5n * 10n ** 18n,
    expiryBlock: 900000n,
    status: OptionStatus.PURCHASED,
};

const makeAddress = (hex: string) => ({ toString: () => hex });
const WALLET_HEX = '0xdead000000000000000000000000000000000000000000000000000000000001';

const DEFAULT_PROPS = {
    option: PURCHASED_OPTION,
    poolAddress: POOL_ADDRESS,
    walletAddress: 'opt1pftest',
    address: makeAddress(WALLET_HEX) as ReturnType<typeof import('@btc-vision/transaction').Address['fromString']>,
    provider: {} as import('opnet').AbstractRpcProvider,
    network: {} as import('@btc-vision/walletconnect').WalletConnectNetwork,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SettleModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders modal with collateral info', () => {
        render(<SettleModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('settle-option-modal')).toBeInTheDocument();
        expect(screen.getByText(/Collateral to recover/i)).toBeInTheDocument();
        expect(screen.getByText(/Settle fee/i)).toBeInTheDocument();
    });

    it('shows option ID in header', () => {
        render(<SettleModal {...DEFAULT_PROPS} />);
        expect(screen.getByText(/#9/)).toBeInTheDocument();
    });

    it('shows no fee', () => {
        render(<SettleModal {...DEFAULT_PROPS} />);
        expect(screen.getByText('None')).toBeInTheDocument();
    });

    it('shows settle button', () => {
        render(<SettleModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('btn-settle')).toBeInTheDocument();
    });

    it('closes when ✕ is clicked', () => {
        const onClose = vi.fn();
        render(<SettleModal {...DEFAULT_PROPS} onClose={onClose} />);
        fireEvent.click(screen.getByLabelText('Close modal'));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls settle and sendTransaction on Confirm Settle', async () => {
        mockSendTransaction.mockResolvedValue({ transactionId: 'settle-tx-001' });
        render(<SettleModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-settle'));

        await waitFor(() => {
            expect(mockGetContract).toHaveBeenCalled();
            expect(mockContractMethod).toHaveBeenCalled();
            expect(mockSendTransaction).toHaveBeenCalled();
        });

        // Verify frontend pattern: signer=null
        const [params] = mockSendTransaction.mock.calls[0] as [Record<string, unknown>];
        expect(params.signer).toBeNull();
        expect(params.mldsaSigner).toBeNull();
    });

    it('shows success after settlement', async () => {
        mockSendTransaction.mockResolvedValue({ transactionId: 'settle-tx-001' });
        render(<SettleModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-settle'));

        await waitFor(() => {
            expect(screen.getByText(/Settlement broadcast/i)).toBeInTheDocument();
        });
    });

    it('shows tx error on failure', async () => {
        mockSendTransaction.mockRejectedValue(new Error('Grace period active'));
        render(<SettleModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-settle'));

        await waitFor(() => {
            expect(screen.getByTestId('tx-error')).toBeInTheDocument();
        });
        expect(screen.getByTestId('tx-error').textContent).toMatch(/Grace period active/i);
    });

    it('disables button while settling', async () => {
        mockSendTransaction.mockReturnValue(new Promise(() => {}));
        render(<SettleModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-settle'));

        await waitFor(() => {
            expect(screen.getByTestId('btn-settle')).toBeDisabled();
        });
    });
});
