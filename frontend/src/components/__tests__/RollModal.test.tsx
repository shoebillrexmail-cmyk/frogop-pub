/**
 * RollModal tests — renders current option params, input fields for new params,
 * collateral breakdown with net change, and handles roll transaction.
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

import { RollModal } from '../RollModal.tsx';

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

describe('RollModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders modal with option ID', async () => {
        render(<RollModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('roll-option-modal')).toBeInTheDocument();
        expect(screen.getByText(/#5/)).toBeInTheDocument();
    });

    it('shows current option params', async () => {
        render(<RollModal {...DEFAULT_PROPS} />);
        expect(screen.getByText(/Current Option/i)).toBeInTheDocument();
        expect(screen.getByText(/CALL/)).toBeInTheDocument();
    });

    it('shows input fields for new strike, premium, expiry', async () => {
        render(<RollModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('input-new-strike')).toBeInTheDocument();
        expect(screen.getByTestId('input-new-premium')).toBeInTheDocument();
        expect(screen.getByTestId('input-new-expiry')).toBeInTheDocument();
    });

    it('closes when close button clicked', () => {
        const onClose = vi.fn();
        render(<RollModal {...DEFAULT_PROPS} onClose={onClose} />);
        fireEvent.click(screen.getByLabelText('Close modal'));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls rollOption and sendTransaction with correct params', async () => {
        mockSendTransaction.mockResolvedValue({ transactionId: 'roll-tx-001' });
        render(<RollModal {...DEFAULT_PROPS} />);

        // Wait for block number to load (populates expiry field)
        await waitFor(() => {
            expect(screen.getByTestId('btn-roll-confirm')).not.toBeDisabled();
        });

        fireEvent.click(screen.getByTestId('btn-roll-confirm'));

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

    it('shows success after roll', async () => {
        mockSendTransaction.mockResolvedValue({ transactionId: 'roll-tx-001' });
        render(<RollModal {...DEFAULT_PROPS} />);

        // Wait for block number to load
        await waitFor(() => {
            expect(screen.getByTestId('btn-roll-confirm')).not.toBeDisabled();
        });

        fireEvent.click(screen.getByTestId('btn-roll-confirm'));

        await waitFor(() => {
            expect(screen.getByText(/Roll broadcast/i)).toBeInTheDocument();
        });
    });

    it('shows error on failure', async () => {
        mockSendTransaction.mockRejectedValue(new Error('Not the writer'));
        render(<RollModal {...DEFAULT_PROPS} />);

        // Wait for block number to load
        await waitFor(() => {
            expect(screen.getByTestId('btn-roll-confirm')).not.toBeDisabled();
        });

        fireEvent.click(screen.getByTestId('btn-roll-confirm'));

        await waitFor(() => {
            expect(screen.getByTestId('tx-error')).toBeInTheDocument();
        });
        expect(screen.getByTestId('tx-error').textContent).toMatch(/Not the writer/i);
    });

    it('disables button while rolling', async () => {
        // Never resolves
        mockSendTransaction.mockReturnValue(new Promise(() => {}));
        render(<RollModal {...DEFAULT_PROPS} />);

        // Wait for block number to load
        await waitFor(() => {
            expect(screen.getByTestId('btn-roll-confirm')).not.toBeDisabled();
        });

        fireEvent.click(screen.getByTestId('btn-roll-confirm'));

        await waitFor(() => {
            expect(screen.getByTestId('btn-roll-confirm')).toBeDisabled();
        });
    });

    it('shows collateral breakdown with cancel fee', async () => {
        render(<RollModal {...DEFAULT_PROPS} />);
        await waitFor(() => {
            expect(screen.getByText(/Old collateral/i)).toBeInTheDocument();
            expect(screen.getByText(/Cancel fee/i)).toBeInTheDocument();
            expect(screen.getByText(/New collateral/i)).toBeInTheDocument();
            expect(screen.getByText(/Net change/i)).toBeInTheDocument();
        });
    });
});
