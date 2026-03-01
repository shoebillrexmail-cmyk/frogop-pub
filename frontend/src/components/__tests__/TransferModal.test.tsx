/**
 * TransferModal tests — address resolution, contract call, success/error states.
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

import { TransferModal } from '../TransferModal.tsx';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const POOL_ADDRESS = '0xcccc000000000000000000000000000000000000000000000000000000000003';
const RECIPIENT_HEX = '0xeeee000000000000000000000000000000000000000000000000000000000004';

const PURCHASED_OPTION: OptionData = {
    id: 7n,
    writer: '0xdead000000000000000000000000000000000000000000000000000000000001',
    buyer: '0xbeef000000000000000000000000000000000000000000000000000000000002',
    optionType: OptionType.CALL,
    strikePrice: 50n,
    underlyingAmount: 10n ** 18n,
    premium: 5n * 10n ** 18n,
    expiryBlock: 900000n,
    status: OptionStatus.PURCHASED,
};

const makeAddress = (hex: string) => ({ toString: () => hex });
const WALLET_HEX = PURCHASED_OPTION.buyer;

function makeProvider() {
    return {
        getBlockNumber: vi.fn().mockResolvedValue(800000n),
        getPublicKeyInfo: vi.fn().mockResolvedValue({ toString: () => RECIPIENT_HEX }),
    } as unknown as import('opnet').AbstractRpcProvider;
}

const DEFAULT_PROPS = {
    option: PURCHASED_OPTION,
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

describe('TransferModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders modal with recipient input', () => {
        render(<TransferModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('transfer-option-modal')).toBeInTheDocument();
        expect(screen.getByTestId('recipient-input')).toBeInTheDocument();
        expect(screen.getByText(/Transfer Option/i)).toBeInTheDocument();
        expect(screen.getByText(/#7/)).toBeInTheDocument();
    });

    it('shows Resolve Address button initially', () => {
        render(<TransferModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('btn-resolve')).toBeInTheDocument();
    });

    it('resolves hex address and shows Confirm Transfer', async () => {
        render(<TransferModal {...DEFAULT_PROPS} />);
        const input = screen.getByTestId('recipient-input');
        fireEvent.change(input, { target: { value: RECIPIENT_HEX } });
        fireEvent.click(screen.getByTestId('btn-resolve'));

        await waitFor(() => {
            expect(screen.getByTestId('resolved-hex')).toBeInTheDocument();
            expect(screen.getByTestId('btn-transfer-confirm')).toBeInTheDocument();
        });
    });

    it('resolves bech32 address via getPublicKeyInfo', async () => {
        const provider = makeProvider();
        render(<TransferModal {...DEFAULT_PROPS} provider={provider} />);
        const input = screen.getByTestId('recipient-input');
        fireEvent.change(input, { target: { value: 'opt1someaddress123' } });
        fireEvent.click(screen.getByTestId('btn-resolve'));

        await waitFor(() => {
            expect(provider.getPublicKeyInfo).toHaveBeenCalledWith('opt1someaddress123', true);
            expect(screen.getByTestId('resolved-hex')).toBeInTheDocument();
        });
    });

    it('shows error for invalid address', async () => {
        render(<TransferModal {...DEFAULT_PROPS} />);
        const input = screen.getByTestId('recipient-input');
        fireEvent.change(input, { target: { value: 'invalid-addr' } });
        fireEvent.click(screen.getByTestId('btn-resolve'));

        await waitFor(() => {
            expect(screen.getByTestId('tx-error')).toBeInTheDocument();
            expect(screen.getByTestId('tx-error').textContent).toMatch(/Invalid address/i);
        });
    });

    it('shows error for self-transfer', async () => {
        render(<TransferModal {...DEFAULT_PROPS} />);
        const input = screen.getByTestId('recipient-input');
        // Enter wallet's own hex address
        fireEvent.change(input, { target: { value: WALLET_HEX } });
        fireEvent.click(screen.getByTestId('btn-resolve'));

        await waitFor(() => {
            expect(screen.getByTestId('tx-error')).toBeInTheDocument();
            expect(screen.getByTestId('tx-error').textContent).toMatch(/yourself/i);
        });
    });

    it('calls transferOption and sendTransaction on Confirm', async () => {
        mockSendTransaction.mockResolvedValue({ transactionId: 'transfer-tx-001' });
        render(<TransferModal {...DEFAULT_PROPS} />);

        // Resolve first
        const input = screen.getByTestId('recipient-input');
        fireEvent.change(input, { target: { value: RECIPIENT_HEX } });
        fireEvent.click(screen.getByTestId('btn-resolve'));

        await waitFor(() => {
            expect(screen.getByTestId('btn-transfer-confirm')).toBeInTheDocument();
        });

        // Confirm transfer
        fireEvent.click(screen.getByTestId('btn-transfer-confirm'));

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

    it('shows success after transfer', async () => {
        mockSendTransaction.mockResolvedValue({ transactionId: 'transfer-tx-001' });
        render(<TransferModal {...DEFAULT_PROPS} />);

        const input = screen.getByTestId('recipient-input');
        fireEvent.change(input, { target: { value: RECIPIENT_HEX } });
        fireEvent.click(screen.getByTestId('btn-resolve'));

        await waitFor(() => {
            expect(screen.getByTestId('btn-transfer-confirm')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('btn-transfer-confirm'));

        await waitFor(() => {
            expect(screen.getByText(/Transfer broadcast/i)).toBeInTheDocument();
        });
    });

    it('shows tx error on failure', async () => {
        mockSendTransaction.mockRejectedValue(new Error('Not buyer'));
        render(<TransferModal {...DEFAULT_PROPS} />);

        const input = screen.getByTestId('recipient-input');
        fireEvent.change(input, { target: { value: RECIPIENT_HEX } });
        fireEvent.click(screen.getByTestId('btn-resolve'));

        await waitFor(() => {
            expect(screen.getByTestId('btn-transfer-confirm')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('btn-transfer-confirm'));

        await waitFor(() => {
            expect(screen.getByTestId('tx-error')).toBeInTheDocument();
        });
        expect(screen.getByTestId('tx-error').textContent).toMatch(/Not buyer/i);
    });

    it('closes when ✕ is clicked', () => {
        const onClose = vi.fn();
        render(<TransferModal {...DEFAULT_PROPS} onClose={onClose} />);
        fireEvent.click(screen.getByLabelText('Close modal'));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('disables resolve button when input is empty', () => {
        render(<TransferModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('btn-resolve')).toBeDisabled();
    });
});
