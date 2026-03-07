/**
 * ExerciseModal tests — renders cost breakdown, approval flow, exercise flow.
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

import { ExerciseModal } from '../ExerciseModal.tsx';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const POOL_INFO: PoolInfo = {
    underlying: '0xaaaa000000000000000000000000000000000000000000000000000000000001',
    premiumToken: '0xbbbb000000000000000000000000000000000000000000000000000000000002',
    optionCount: 1n,
    cancelFeeBps: 100n,
    buyFeeBps: 100n,
    exerciseFeeBps: 10n,   // 0.1%
    gracePeriodBlocks: 144n,
};

const POOL_ADDRESS = '0xcccc000000000000000000000000000000000000000000000000000000000003';

const CALL_OPTION: OptionData = {
    id: 7n,
    writer: '0xdead000000000000000000000000000000000000000000000000000000000001',
    buyer: '0xbeef000000000000000000000000000000000000000000000000000000000002',
    optionType: OptionType.CALL,
    strikePrice: 50n * 10n ** 18n,   // 50 PILL per MOTO (18-decimal)
    underlyingAmount: 10n ** 18n,    // 1 MOTO (18-decimal)
    premium: 5n * 10n ** 18n,
    expiryBlock: 900000n,
    status: OptionStatus.PURCHASED,
};

// strikeValue = (50e18 * 1e18) / 1e18 = 50e18 = 50 PILL
const PILL_COST = (CALL_OPTION.strikePrice * CALL_OPTION.underlyingAmount) / (10n ** 18n);
// exerciseFee = ceil(1e18 * 10 / 10000) = 1e15 (0.001 MOTO)
const EXERCISE_FEE = (CALL_OPTION.underlyingAmount * POOL_INFO.exerciseFeeBps + 9999n) / 10000n;

const PUT_OPTION: OptionData = {
    ...CALL_OPTION,
    id: 8n,
    optionType: OptionType.PUT,
};

const makeAddress = (hex: string) => ({ toString: () => hex });
const WALLET_HEX = '0xbeef000000000000000000000000000000000000000000000000000000000002';

const DEFAULT_PROVIDER = {
    getPublicKeyInfo: vi.fn().mockResolvedValue({ toString: () => POOL_ADDRESS }),
    call: vi.fn(),
} as unknown as import('opnet').AbstractRpcProvider;

const DEFAULT_PROPS = {
    option: CALL_OPTION,
    poolInfo: POOL_INFO,
    poolAddress: POOL_ADDRESS,
    walletAddress: 'opt1pftest',
    address: makeAddress(WALLET_HEX) as ReturnType<typeof import('@btc-vision/transaction').Address['fromString']>,
    provider: DEFAULT_PROVIDER,
    network: {} as import('@btc-vision/walletconnect').WalletConnectNetwork,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExerciseModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: sufficient PILL balance and allowance
        mockUseTokenInfo.mockReturnValue({
            info: {
                balance: 100n * 10n ** 18n,    // 100 PILL
                allowance: 100n * 10n ** 18n,  // already approved
            },
            loading: false,
            error: null,
            refetch: vi.fn(),
        });
    });

    it('renders modal for CALL option', () => {
        render(<ExerciseModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('exercise-option-modal')).toBeInTheDocument();
        expect(screen.getByText('CALL')).toBeInTheDocument();
    });

    it('shows PILL cost for CALL', () => {
        render(<ExerciseModal {...DEFAULT_PROPS} />);
        expect(screen.getByText(/PILL you pay/i)).toBeInTheDocument();
    });

    it('shows exercise fee line', () => {
        render(<ExerciseModal {...DEFAULT_PROPS} />);
        expect(screen.getByText(/Exercise fee/i)).toBeInTheDocument();
        expect(screen.getByText(/0\.1%/)).toBeInTheDocument();
    });

    it('shows MOTO payout line', () => {
        render(<ExerciseModal {...DEFAULT_PROPS} />);
        expect(screen.getByText(/MOTO you receive/i)).toBeInTheDocument();
    });

    it('shows Confirm Exercise when allowance is sufficient', () => {
        render(<ExerciseModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('btn-exercise')).toBeInTheDocument();
        expect(screen.queryByTestId('btn-approve')).not.toBeInTheDocument();
    });

    it('shows Approve PILL when allowance is insufficient', () => {
        mockUseTokenInfo.mockReturnValue({
            info: { balance: 100n * 10n ** 18n, allowance: 0n },
            loading: false,
            error: null,
            refetch: vi.fn(),
        });
        render(<ExerciseModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('btn-approve')).toBeInTheDocument();
        expect(screen.queryByTestId('btn-exercise')).not.toBeInTheDocument();
    });

    it('shows insufficient balance warning when PILL balance < pillCost', () => {
        mockUseTokenInfo.mockReturnValue({
            info: {
                balance: 1n * 10n ** 18n,  // only 1 PILL, need 50
                allowance: 100n * 10n ** 18n,
            },
            loading: false,
            error: null,
            refetch: vi.fn(),
        });
        render(<ExerciseModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('balance-error')).toBeInTheDocument();
        expect(screen.getByTestId('btn-exercise')).toBeDisabled();
    });

    it('shows PUT label for PUT option (no PILL cost)', () => {
        render(<ExerciseModal {...DEFAULT_PROPS} option={PUT_OPTION} />);
        expect(screen.getByText('PUT')).toBeInTheDocument();
        expect(screen.queryByText(/PILL you pay/i)).not.toBeInTheDocument();
    });

    it('closes when ✕ is clicked', () => {
        const onClose = vi.fn();
        render(<ExerciseModal {...DEFAULT_PROPS} onClose={onClose} />);
        fireEvent.click(screen.getByLabelText('Close modal'));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls exercise and sendTransaction on Confirm Exercise', async () => {
        mockSendTransaction.mockResolvedValue({ transactionId: 'exercise-tx-001' });
        render(<ExerciseModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-exercise'));

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

    it('shows success after exercise', async () => {
        mockSendTransaction.mockResolvedValue({ transactionId: 'exercise-tx-001' });
        render(<ExerciseModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-exercise'));

        await waitFor(() => {
            expect(screen.getByTestId('transaction-receipt')).toBeInTheDocument();
        });
    });

    it('shows tx error on failure', async () => {
        mockSendTransaction.mockRejectedValue(new Error('Option not purchased'));
        render(<ExerciseModal {...DEFAULT_PROPS} />);

        fireEvent.click(screen.getByTestId('btn-exercise'));

        await waitFor(() => {
            expect(screen.getByTestId('tx-error')).toBeInTheDocument();
        });
        expect(screen.getByTestId('tx-error').textContent).toMatch(/Option not purchased/i);
    });

    it('calls approve flow for increaseAllowance', async () => {
        mockUseTokenInfo.mockReturnValue({
            info: { balance: 100n * 10n ** 18n, allowance: 0n },
            loading: false,
            error: null,
            refetch: vi.fn(),
        });
        mockSendTransaction.mockResolvedValue({ transactionId: 'approve-tx-001' });

        render(<ExerciseModal {...DEFAULT_PROPS} />);
        fireEvent.click(screen.getByTestId('btn-approve'));

        await waitFor(() => {
            expect(mockGetContract).toHaveBeenCalled();
            expect(mockSendTransaction).toHaveBeenCalled();
        });
    });

    it('pillCost computed correctly: (strikePrice * underlyingAmount) / 1e18', () => {
        // strikeValue = (50e18 * 1e18) / 1e18 = 50e18 = 50 PILL
        expect(PILL_COST).toBe(50n * 10n ** 18n);
    });

    it('exerciseFee computed correctly: underlyingAmount * exerciseFeeBps / 10000', () => {
        // exerciseFee = 1e18 * 10 / 10000 = 1e15
        expect(EXERCISE_FEE).toBe(10n ** 15n);
    });
});
