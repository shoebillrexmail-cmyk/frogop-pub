/**
 * WriteOptionPanel tests — validation, approval flow, submission.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PoolInfo } from '../../services/types.ts';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockUseTokenInfo = vi.fn();
vi.mock('../../hooks/useTokenInfo.ts', () => ({
    useTokenInfo: (...args: unknown[]) => mockUseTokenInfo(...args),
}));

// Mock getContract — returns a proxy that records calls
const mockSendTransaction = vi.fn();
const mockCallResult = { sendTransaction: mockSendTransaction };
const mockContractMethod = vi.fn(() => Promise.resolve(mockCallResult));
const mockGetContract = vi.fn(() =>
    new Proxy({}, {
        get: (_target, prop) => {
            if (typeof prop === 'string') return mockContractMethod;
            return undefined;
        },
    })
);
vi.mock('opnet', async (importOriginal) => {
    const actual = await importOriginal<typeof import('opnet')>();
    return {
        ...actual,
        getContract: (...args: unknown[]) => mockGetContract(...args),
    };
});

import { WriteOptionPanel } from '../WriteOptionPanel.tsx';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const POOL_INFO: PoolInfo = {
    underlying: '0xaaaa000000000000000000000000000000000000000000000000000000000001',
    premiumToken: '0xbbbb000000000000000000000000000000000000000000000000000000000002',
    optionCount: 0n,
    cancelFeeBps: 100n,
    buyFeeBps: 100n,
    exerciseFeeBps: 10n,
    gracePeriodBlocks: 144n,
};

const POOL_ADDRESS = '0xcccc000000000000000000000000000000000000000000000000000000000003';

function makeAddress(hex: string) {
    return { toString: () => hex };
}

const WALLET_HEX = '0xdead000000000000000000000000000000000000000000000000000000000001';

const DEFAULT_PROPS = {
    poolAddress: POOL_ADDRESS,
    poolInfo: POOL_INFO,
    walletAddress: 'opt1pftest',
    walletHex: WALLET_HEX,
    address: makeAddress(WALLET_HEX) as ReturnType<typeof import('@btc-vision/transaction').Address['fromString']>,
    provider: {
        getPublicKeyInfo: vi.fn().mockResolvedValue({ toString: () => POOL_ADDRESS }),
        getBlockNumber: vi.fn().mockResolvedValue(5000n),
        call: vi.fn(),
    } as unknown as import('opnet').AbstractRpcProvider,
    network: {} as import('@btc-vision/walletconnect').WalletConnectNetwork,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WriteOptionPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default token info: sufficient balance, sufficient allowance
        mockUseTokenInfo.mockReturnValue({
            info: {
                balance: 100n * 10n ** 18n,
                allowance: 100n * 10n ** 18n,
            },
            loading: false,
            error: null,
            refetch: vi.fn(),
        });
    });

    it('renders the panel with form fields', () => {
        render(<WriteOptionPanel {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('write-option-panel')).toBeInTheDocument();
        expect(screen.getByTestId('input-amount')).toBeInTheDocument();
        expect(screen.getByTestId('input-strike')).toBeInTheDocument();
        expect(screen.getByTestId('input-premium')).toBeInTheDocument();
        expect(screen.getByTestId('expiry-presets')).toBeInTheDocument();
    });

    it('has CALL/PUT type toggle', () => {
        render(<WriteOptionPanel {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('type-call')).toBeInTheDocument();
        expect(screen.getByTestId('type-put')).toBeInTheDocument();
    });

    it('backdrop click does NOT close the panel', () => {
        const onClose = vi.fn();
        render(<WriteOptionPanel {...DEFAULT_PROPS} onClose={onClose} />);
        fireEvent.click(screen.getByTestId('panel-backdrop'));
        expect(onClose).not.toHaveBeenCalled();
    });

    it('closes when ✕ button is clicked', () => {
        const onClose = vi.fn();
        render(<WriteOptionPanel {...DEFAULT_PROPS} onClose={onClose} />);
        fireEvent.click(screen.getByLabelText('Close panel'));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('shows Write Option button when allowance is sufficient', () => {
        render(<WriteOptionPanel {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('btn-write')).toBeInTheDocument();
        expect(screen.queryByTestId('btn-approve')).not.toBeInTheDocument();
    });

    it('shows Approve button when allowance is insufficient', () => {
        mockUseTokenInfo.mockReturnValue({
            info: {
                balance: 100n * 10n ** 18n,
                allowance: 0n, // no allowance
            },
            loading: false,
            error: null,
            refetch: vi.fn(),
        });
        render(<WriteOptionPanel {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('btn-approve')).toBeInTheDocument();
        expect(screen.queryByTestId('btn-write')).not.toBeInTheDocument();
    });

    it('shows validation error when strike is empty and Write is clicked', async () => {
        render(<WriteOptionPanel {...DEFAULT_PROPS} />);

        // Clear strike field
        fireEvent.change(screen.getByTestId('input-strike'), { target: { value: '' } });
        fireEvent.click(screen.getByTestId('btn-write'));

        await waitFor(() => {
            expect(screen.getByTestId('validation-error')).toBeInTheDocument();
        });
        expect(screen.getByTestId('validation-error').textContent).toMatch(/strike/i);
    });

    it('renders day preset buttons for expiry', () => {
        render(<WriteOptionPanel {...DEFAULT_PROPS} />);

        expect(screen.getByTestId('expiry-1d')).toBeInTheDocument();
        expect(screen.getByTestId('expiry-7d')).toBeInTheDocument();
        expect(screen.getByTestId('expiry-30d')).toBeInTheDocument();
        expect(screen.getByTestId('expiry-90d')).toBeInTheDocument();
    });

    it('calls getContract and sendTransaction on Write submit', async () => {
        mockSendTransaction.mockResolvedValue({ transactionId: 'txabc123' });

        render(<WriteOptionPanel {...DEFAULT_PROPS} />);

        fireEvent.change(screen.getByTestId('input-strike'), { target: { value: '50' } });
        fireEvent.change(screen.getByTestId('input-premium'), { target: { value: '5' } });

        fireEvent.click(screen.getByTestId('btn-write'));

        await waitFor(() => {
            expect(mockGetContract).toHaveBeenCalled();
            expect(mockSendTransaction).toHaveBeenCalled();
        });

        // Verify signer=null pattern (frontend wallet signs)
        const [sendParams] = mockSendTransaction.mock.calls[0] as [Record<string, unknown>];
        expect(sendParams.signer).toBeNull();
        expect(sendParams.mldsaSigner).toBeNull();
    });

    it('passes writeOption arguments in correct order with correct values', async () => {
        mockSendTransaction.mockResolvedValue({ transactionId: 'txabc123' });

        render(<WriteOptionPanel {...DEFAULT_PROPS} />);

        fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '1' } });
        fireEvent.change(screen.getByTestId('input-strike'), { target: { value: '50' } });
        fireEvent.change(screen.getByTestId('input-premium'), { target: { value: '5' } });
        // Select 1d preset (144 blocks)
        fireEvent.click(screen.getByTestId('expiry-1d'));
        fireEvent.click(screen.getByTestId('btn-write'));

        await waitFor(() => {
            expect(mockContractMethod).toHaveBeenCalled();
        });

        // Contract reads: optionType(u8), strikePrice(u256), expiryBlock(u64), underlyingAmount(u256), premium(u256)
        const args = mockContractMethod.mock.calls[0] as unknown[];
        const [optionType, strike, expiry, amount, premium] = args;

        expect(optionType).toBe(0); // CALL
        expect(strike).toBe(50n * 10n ** 18n);
        // Expiry must be absolute: mockBlockNumber(5000) + 144 = 5144
        expect(expiry).toBe(5000n + 144n);
        expect(amount).toBe(1n * 10n ** 18n);
        expect(premium).toBe(5n * 10n ** 18n);
    });

    it('shows success message after write', async () => {
        mockSendTransaction.mockResolvedValue({ transactionId: 'txabc123' });

        render(<WriteOptionPanel {...DEFAULT_PROPS} />);

        fireEvent.change(screen.getByTestId('input-strike'), { target: { value: '50' } });
        fireEvent.change(screen.getByTestId('input-premium'), { target: { value: '5' } });
        fireEvent.click(screen.getByTestId('btn-write'));

        await waitFor(() => {
            expect(screen.getByTestId('transaction-receipt')).toBeInTheDocument();
        });
    });

    it('shows tx error on failure', async () => {
        mockSendTransaction.mockRejectedValue(new Error('Insufficient UTXOs'));

        render(<WriteOptionPanel {...DEFAULT_PROPS} />);

        fireEvent.change(screen.getByTestId('input-strike'), { target: { value: '50' } });
        fireEvent.change(screen.getByTestId('input-premium'), { target: { value: '5' } });
        fireEvent.click(screen.getByTestId('btn-write'));

        await waitFor(() => {
            expect(screen.getByTestId('tx-error')).toBeInTheDocument();
        });
        expect(screen.getByTestId('tx-error').textContent).toMatch(/Insufficient UTXOs/i);
    });

    it('calls Approve flow and uses increaseAllowance contract method', async () => {
        mockUseTokenInfo.mockReturnValue({
            info: {
                balance: 100n * 10n ** 18n,
                allowance: 0n,
            },
            loading: false,
            error: null,
            refetch: vi.fn(),
        });
        mockSendTransaction.mockResolvedValue({ transactionId: 'approve-tx' });

        render(<WriteOptionPanel {...DEFAULT_PROPS} />);
        fireEvent.click(screen.getByTestId('btn-approve'));

        await waitFor(() => {
            expect(mockGetContract).toHaveBeenCalled();
            expect(mockContractMethod).toHaveBeenCalled();
            expect(mockSendTransaction).toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // initialValues pre-fill
    // -----------------------------------------------------------------------

    it('pre-fills form fields from initialValues prop', () => {
        const initialValues = {
            optionType: 0, // CALL
            strikeStr: '60',
            amountStr: '2',
            premiumStr: '3.5',
            selectedDays: 30,
        };
        render(<WriteOptionPanel {...DEFAULT_PROPS} initialValues={initialValues} />);
        expect((screen.getByTestId('input-strike') as HTMLInputElement).value).toBe('60');
        expect((screen.getByTestId('input-amount') as HTMLInputElement).value).toBe('2');
        expect((screen.getByTestId('input-premium') as HTMLInputElement).value).toBe('3.5');
    });

    it('defaults apply when initialValues not provided', () => {
        render(<WriteOptionPanel {...DEFAULT_PROPS} />);
        expect((screen.getByTestId('input-amount') as HTMLInputElement).value).toBe('1');
        expect((screen.getByTestId('input-strike') as HTMLInputElement).value).toBe('');
    });

    // -----------------------------------------------------------------------
    // Moneyness badge (Story B)
    // -----------------------------------------------------------------------

    it('shows spot price and moneyness badge when motoPillRatio is provided', () => {
        render(<WriteOptionPanel {...DEFAULT_PROPS} motoPillRatio={50} />);
        fireEvent.change(screen.getByTestId('input-strike'), { target: { value: '60' } });

        const section = screen.getByTestId('moneyness-section');
        expect(section).toBeInTheDocument();
        expect(section.textContent).toContain('50.00 PILL');
        expect(screen.getByTestId('moneyness-badge')).toBeInTheDocument();
    });

    it('does not show moneyness section when motoPillRatio is null', () => {
        render(<WriteOptionPanel {...DEFAULT_PROPS} motoPillRatio={null} />);
        fireEvent.change(screen.getByTestId('input-strike'), { target: { value: '60' } });
        expect(screen.queryByTestId('moneyness-section')).not.toBeInTheDocument();
    });

    it('shows guidance text for deep ITM strike', () => {
        render(<WriteOptionPanel {...DEFAULT_PROPS} motoPillRatio={100} />);
        fireEvent.change(screen.getByTestId('input-strike'), { target: { value: '40' } });
        // CALL with strike 40 and spot 100 → deep ITM
        expect(screen.getByTestId('moneyness-guidance')).toBeInTheDocument();
    });

    // -----------------------------------------------------------------------
    // Writer Outlook (Story C)
    // -----------------------------------------------------------------------

    it('shows writer outlook when amount, strike, and premium are valid', () => {
        render(<WriteOptionPanel {...DEFAULT_PROPS} />);
        fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '1' } });
        fireEvent.change(screen.getByTestId('input-strike'), { target: { value: '50' } });
        fireEvent.change(screen.getByTestId('input-premium'), { target: { value: '5' } });

        const outlook = screen.getByTestId('writer-outlook');
        expect(outlook).toBeInTheDocument();
        expect(outlook.textContent).toContain('Max profit');
        expect(outlook.textContent).toContain('Breakeven');
        expect(outlook.textContent).toContain('Yield');
        expect(outlook.textContent).toContain('What Happens');
    });

    it('shows correct CALL yield using spot price (not cross-denom)', () => {
        // 5 PILL premium / (1 MOTO * 50 spot) = 10%, NOT 500%
        render(<WriteOptionPanel {...DEFAULT_PROPS} motoPillRatio={50} />);
        fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '1' } });
        fireEvent.change(screen.getByTestId('input-strike'), { target: { value: '50' } });
        fireEvent.change(screen.getByTestId('input-premium'), { target: { value: '5' } });

        const yieldEl = screen.getByTestId('writer-yield');
        expect(yieldEl.textContent).toContain('10.00%');
        // Verify it does NOT show the old buggy value
        expect(yieldEl.textContent).not.toContain('500');
    });

    it('shows "needs spot price" for CALL yield when no motoPillRatio', () => {
        render(<WriteOptionPanel {...DEFAULT_PROPS} motoPillRatio={null} />);
        fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '1' } });
        fireEvent.change(screen.getByTestId('input-strike'), { target: { value: '50' } });
        fireEvent.change(screen.getByTestId('input-premium'), { target: { value: '5' } });

        const yieldEl = screen.getByTestId('writer-yield');
        expect(yieldEl.textContent).toContain('needs spot price');
    });

    it('shows correct PUT yield without needing spot price', () => {
        // PUT: 5 PILL premium / (50 * 1 = 50 PILL collateral) = 10%
        render(<WriteOptionPanel {...DEFAULT_PROPS} motoPillRatio={null} />);
        fireEvent.click(screen.getByTestId('type-put'));
        fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '1' } });
        fireEvent.change(screen.getByTestId('input-strike'), { target: { value: '50' } });
        fireEvent.change(screen.getByTestId('input-premium'), { target: { value: '5' } });

        const yieldEl = screen.getByTestId('writer-yield');
        expect(yieldEl.textContent).toContain('10.00%');
    });

    it('hides writer outlook when premium is empty', () => {
        render(<WriteOptionPanel {...DEFAULT_PROPS} />);
        fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '1' } });
        fireEvent.change(screen.getByTestId('input-strike'), { target: { value: '50' } });
        fireEvent.change(screen.getByTestId('input-premium'), { target: { value: '' } });

        expect(screen.queryByTestId('writer-outlook')).not.toBeInTheDocument();
    });

    it('shows correct breakeven for CALL (strike + premium)', () => {
        render(<WriteOptionPanel {...DEFAULT_PROPS} />);
        fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '1' } });
        fireEvent.change(screen.getByTestId('input-strike'), { target: { value: '50' } });
        fireEvent.change(screen.getByTestId('input-premium'), { target: { value: '5' } });

        const outlook = screen.getByTestId('writer-outlook');
        // Breakeven = 50 + 5 = 55.0000
        expect(outlook.textContent).toContain('55.0000');
    });

    it('shows correct breakeven for PUT (strike - premium)', () => {
        render(<WriteOptionPanel {...DEFAULT_PROPS} />);
        fireEvent.click(screen.getByTestId('type-put'));
        fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '1' } });
        fireEvent.change(screen.getByTestId('input-strike'), { target: { value: '50' } });
        fireEvent.change(screen.getByTestId('input-premium'), { target: { value: '5' } });

        const outlook = screen.getByTestId('writer-outlook');
        // Breakeven = 50 - 5 = 45.0000
        expect(outlook.textContent).toContain('45.0000');
    });
});
