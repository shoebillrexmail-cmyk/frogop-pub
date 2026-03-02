/**
 * Helpers for TransactionDetailModal — build synthetic movements from stored meta.
 */
import type { TrackedTransaction, TxType } from '../contexts/transactionDefs.ts';
import type { ReceiptType } from '../components/TransactionReceipt.tsx';

export interface TokenMovement {
    direction: 'debit' | 'credit';
    amount: string;
    token: string;
    label?: string;
}

export interface MovementResult {
    movements: TokenMovement[];
    fee?: { amount: string; token: string } | null;
}

/** Map TxType to ReceiptType (they differ slightly). */
export function mapTxTypeToReceiptType(type: TxType): ReceiptType | null {
    const map: Partial<Record<TxType, ReceiptType>> = {
        buyOption: 'buy',
        exercise: 'exercise',
        writeOption: 'write',
        cancelOption: 'cancel',
        settle: 'settle',
        transferOption: 'transfer',
        rollOption: 'roll',
        batchCancel: 'batchCancel',
        batchSettle: 'batchSettle',
    };
    return map[type] ?? null;
}

/**
 * Build synthetic token movements + fee from stored tx meta.
 * Uses `?? '?'` fallbacks for older TXs that may have empty meta.
 */
export function buildMovementsFromMeta(tx: TrackedTransaction): MovementResult {
    const m = tx.meta;
    switch (tx.type) {
        case 'buyOption':
            return {
                movements: [
                    { direction: 'debit', amount: m['totalCost'] ?? '?', token: 'PILL', label: 'Total cost' },
                    { direction: 'credit', amount: `Option #${m['optionId'] ?? '?'}`, token: m['optionType'] ?? '', label: 'You receive' },
                ],
                fee: m['fee'] ? { amount: m['fee'], token: 'PILL' } : null,
            };
        case 'cancelOption':
            return {
                movements: [
                    { direction: 'credit', amount: m['returned'] ?? '?', token: m['collateralToken'] ?? '', label: 'Collateral returned' },
                ],
                fee: m['fee'] && m['fee'] !== '0' ? { amount: m['fee'], token: m['collateralToken'] ?? '' } : null,
            };
        case 'exercise':
            return {
                movements: [
                    { direction: 'debit', amount: `${m['payAmount'] ?? '?'} ${m['payToken'] ?? ''}`, token: '', label: `You pay (${m['payToken'] ?? '?'})` },
                    { direction: 'credit', amount: `${m['receiveAmount'] ?? '?'} ${m['receiveToken'] ?? ''}`, token: '', label: `You receive (${m['receiveToken'] ?? '?'})` },
                ],
                fee: m['fee'] ? { amount: m['fee'], token: m['receiveToken'] ?? '' } : null,
            };
        case 'settle':
            return {
                movements: [
                    { direction: 'credit', amount: m['collateral'] ?? '?', token: m['collateralToken'] ?? '', label: 'Collateral returned' },
                ],
                fee: null,
            };
        case 'transferOption':
            return {
                movements: [
                    { direction: 'debit', amount: `Option #${m['optionId'] ?? '?'}`, token: '', label: 'Option transferred' },
                ],
                fee: null,
            };
        case 'writeOption':
            return {
                movements: [
                    { direction: 'debit', amount: m['collateral'] ?? '?', token: m['collateralToken'] ?? '', label: 'Collateral locked' },
                ],
                fee: null,
            };
        case 'rollOption':
            return {
                movements: [
                    { direction: 'debit', amount: m['cancelFee'] ?? '?', token: m['collateralToken'] ?? '', label: 'Cancel fee' },
                ],
                fee: m['cancelFee'] ? { amount: m['cancelFee'], token: m['collateralToken'] ?? '' } : null,
            };
        case 'approve':
            return { movements: [], fee: null };
        case 'batchCancel':
            return {
                movements: [
                    { direction: 'credit', amount: `${m['count'] ?? '?'} options`, token: '', label: 'Cancelled' },
                ],
                fee: null,
            };
        case 'batchSettle':
            return {
                movements: [
                    { direction: 'credit', amount: `${m['count'] ?? '?'} options`, token: '', label: 'Settled' },
                ],
                fee: null,
            };
        default:
            return { movements: [], fee: null };
    }
}
