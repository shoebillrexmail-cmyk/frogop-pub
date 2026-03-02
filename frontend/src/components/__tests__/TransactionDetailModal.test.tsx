/**
 * TransactionDetailModal tests — renders pending, confirmed, and failed states
 * for each TX type using stored meta data.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransactionDetailModal } from '../TransactionDetailModal.tsx';
import type { TrackedTransaction, TxType, TxStatus } from '../../contexts/transactionDefs.ts';

function makeTx(overrides: Partial<TrackedTransaction> & { type: TxType; status: TxStatus }): TrackedTransaction {
    return {
        txId: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
        poolAddress: '0xpool',
        createdAt: new Date().toISOString(),
        confirmedAt: null,
        broadcastBlock: null,
        confirmedBlock: null,
        label: 'Test TX',
        flowId: null,
        flowStep: null,
        meta: {},
        ...overrides,
    };
}

describe('TransactionDetailModal', () => {
    it('renders modal with label and close button', () => {
        const onClose = vi.fn();
        const tx = makeTx({ type: 'buyOption', status: 'broadcast', label: 'Buy CALL #5' });
        render(<TransactionDetailModal tx={tx} onClose={onClose} />);

        expect(screen.getByTestId('tx-detail-modal')).toBeInTheDocument();
        expect(screen.getByText('Buy CALL #5')).toBeInTheDocument();
        expect(screen.getByTestId('detail-close-btn')).toBeInTheDocument();
    });

    it('calls onClose when close button clicked', () => {
        const onClose = vi.fn();
        const tx = makeTx({ type: 'buyOption', status: 'broadcast' });
        render(<TransactionDetailModal tx={tx} onClose={onClose} />);

        fireEvent.click(screen.getByTestId('detail-close-btn'));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onClose when backdrop clicked', () => {
        const onClose = vi.fn();
        const tx = makeTx({ type: 'buyOption', status: 'broadcast' });
        render(<TransactionDetailModal tx={tx} onClose={onClose} />);

        fireEvent.click(screen.getByTestId('tx-detail-modal-backdrop'));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('does not close when modal body clicked', () => {
        const onClose = vi.fn();
        const tx = makeTx({ type: 'buyOption', status: 'broadcast' });
        render(<TransactionDetailModal tx={tx} onClose={onClose} />);

        fireEvent.click(screen.getByTestId('tx-detail-modal'));
        expect(onClose).not.toHaveBeenCalled();
    });

    // --- Pending states ---

    it('shows Broadcast badge for broadcast status', () => {
        const tx = makeTx({ type: 'buyOption', status: 'broadcast' });
        render(<TransactionDetailModal tx={tx} onClose={vi.fn()} />);
        expect(screen.getByText('Broadcast')).toBeInTheDocument();
    });

    it('shows Pending badge for pending status', () => {
        const tx = makeTx({ type: 'buyOption', status: 'pending' });
        render(<TransactionDetailModal tx={tx} onClose={vi.fn()} />);
        expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('shows ~10 minutes estimate for pending TX', () => {
        const tx = makeTx({ type: 'buyOption', status: 'broadcast' });
        render(<TransactionDetailModal tx={tx} onClose={vi.fn()} />);
        expect(screen.getByText(/~10 minutes/)).toBeInTheDocument();
    });

    it('renders movements for pending buyOption', () => {
        const tx = makeTx({
            type: 'buyOption',
            status: 'broadcast',
            meta: { totalCost: '5.05', optionId: '3', optionType: 'CALL', fee: '0.05' },
        });
        render(<TransactionDetailModal tx={tx} onClose={vi.fn()} />);
        expect(screen.getByText('Total cost')).toBeInTheDocument();
        expect(screen.getByText(/5.05/)).toBeInTheDocument();
    });

    it('renders movements for pending cancelOption', () => {
        const tx = makeTx({
            type: 'cancelOption',
            status: 'broadcast',
            meta: { returned: '0.99', collateralToken: 'MOTO', fee: '0.01' },
        });
        render(<TransactionDetailModal tx={tx} onClose={vi.fn()} />);
        expect(screen.getByText('Collateral returned')).toBeInTheDocument();
    });

    it('renders movements for pending exercise', () => {
        const tx = makeTx({
            type: 'exercise',
            status: 'broadcast',
            meta: { payAmount: '50', payToken: 'PILL', receiveAmount: '0.999', receiveToken: 'MOTO', fee: '0.001' },
        });
        render(<TransactionDetailModal tx={tx} onClose={vi.fn()} />);
        expect(screen.getByText(/You pay/)).toBeInTheDocument();
        expect(screen.getByText(/You receive/)).toBeInTheDocument();
    });

    it('renders movements for pending settle', () => {
        const tx = makeTx({
            type: 'settle',
            status: 'broadcast',
            meta: { collateral: '1', collateralToken: 'MOTO' },
        });
        render(<TransactionDetailModal tx={tx} onClose={vi.fn()} />);
        expect(screen.getByText('Collateral returned')).toBeInTheDocument();
    });

    it('renders movements for pending transfer', () => {
        const tx = makeTx({
            type: 'transferOption',
            status: 'broadcast',
            meta: { optionId: '7', toAddress: '0xabc' },
        });
        render(<TransactionDetailModal tx={tx} onClose={vi.fn()} />);
        expect(screen.getByText('Option transferred')).toBeInTheDocument();
    });

    it('renders movements for pending writeOption', () => {
        const tx = makeTx({
            type: 'writeOption',
            status: 'broadcast',
            meta: { collateral: '1', collateralToken: 'MOTO' },
        });
        render(<TransactionDetailModal tx={tx} onClose={vi.fn()} />);
        expect(screen.getByText('Collateral locked')).toBeInTheDocument();
    });

    it('renders movements for pending rollOption', () => {
        const tx = makeTx({
            type: 'rollOption',
            status: 'broadcast',
            meta: { cancelFee: '0.01', collateralToken: 'MOTO' },
        });
        render(<TransactionDetailModal tx={tx} onClose={vi.fn()} />);
        expect(screen.getByText('Cancel fee')).toBeInTheDocument();
    });

    it('renders no movements for pending approve', () => {
        const tx = makeTx({
            type: 'approve',
            status: 'broadcast',
            label: 'Approve 5.05 PILL to Buy CALL #3',
            meta: {},
        });
        render(<TransactionDetailModal tx={tx} onClose={vi.fn()} />);
        expect(screen.getByText(/~10 minutes/)).toBeInTheDocument();
    });

    it('renders movements for pending batchCancel', () => {
        const tx = makeTx({
            type: 'batchCancel',
            status: 'broadcast',
            meta: { count: '3', optionIds: '1,2,3' },
        });
        render(<TransactionDetailModal tx={tx} onClose={vi.fn()} />);
        expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });

    it('renders movements for pending batchSettle', () => {
        const tx = makeTx({
            type: 'batchSettle',
            status: 'broadcast',
            meta: { count: '2', optionIds: '4,5' },
        });
        render(<TransactionDetailModal tx={tx} onClose={vi.fn()} />);
        expect(screen.getByText('Settled')).toBeInTheDocument();
    });

    // --- Confirmed states ---

    it('shows TransactionReceipt for confirmed buyOption', () => {
        const tx = makeTx({
            type: 'buyOption',
            status: 'confirmed',
            confirmedAt: new Date().toISOString(),
            meta: { totalCost: '5.05', optionId: '3', optionType: 'CALL', fee: '0.05' },
        });
        render(<TransactionDetailModal tx={tx} onClose={vi.fn()} />);
        expect(screen.getByText('Confirmed')).toBeInTheDocument();
        expect(screen.getByTestId('transaction-receipt')).toBeInTheDocument();
    });

    it('shows simple confirmed view for approve', () => {
        const tx = makeTx({
            type: 'approve',
            status: 'confirmed',
            confirmedAt: new Date().toISOString(),
        });
        render(<TransactionDetailModal tx={tx} onClose={vi.fn()} />);
        expect(screen.getByText('Transaction confirmed.')).toBeInTheDocument();
    });

    // --- Failed state ---

    it('shows failed message for failed TX', () => {
        const tx = makeTx({
            type: 'buyOption',
            status: 'failed',
        });
        render(<TransactionDetailModal tx={tx} onClose={vi.fn()} />);
        expect(screen.getByText('Failed')).toBeInTheDocument();
        expect(screen.getByText('Transaction failed.')).toBeInTheDocument();
    });

    // --- Explorer link ---

    it('renders explorer link', () => {
        const tx = makeTx({ type: 'buyOption', status: 'broadcast' });
        render(<TransactionDetailModal tx={tx} onClose={vi.fn()} />);
        expect(screen.getByText('View in Explorer')).toBeInTheDocument();
    });
});
