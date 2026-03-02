/**
 * txDetailHelpers tests — mapTxTypeToReceiptType + buildMovementsFromMeta.
 */
import { describe, it, expect } from 'vitest';
import { mapTxTypeToReceiptType, buildMovementsFromMeta } from '../txDetailHelpers.ts';
import type { TrackedTransaction } from '../../contexts/transactionDefs.ts';

function makeTx(overrides: Partial<TrackedTransaction>): TrackedTransaction {
    return {
        txId: 'tx-001',
        type: 'buyOption',
        status: 'broadcast',
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

describe('mapTxTypeToReceiptType', () => {
    it('maps buyOption to buy', () => {
        expect(mapTxTypeToReceiptType('buyOption')).toBe('buy');
    });

    it('maps exercise to exercise', () => {
        expect(mapTxTypeToReceiptType('exercise')).toBe('exercise');
    });

    it('maps writeOption to write', () => {
        expect(mapTxTypeToReceiptType('writeOption')).toBe('write');
    });

    it('maps cancelOption to cancel', () => {
        expect(mapTxTypeToReceiptType('cancelOption')).toBe('cancel');
    });

    it('maps settle to settle', () => {
        expect(mapTxTypeToReceiptType('settle')).toBe('settle');
    });

    it('maps transferOption to transfer', () => {
        expect(mapTxTypeToReceiptType('transferOption')).toBe('transfer');
    });

    it('maps rollOption to roll', () => {
        expect(mapTxTypeToReceiptType('rollOption')).toBe('roll');
    });

    it('maps batchCancel to batchCancel', () => {
        expect(mapTxTypeToReceiptType('batchCancel')).toBe('batchCancel');
    });

    it('maps batchSettle to batchSettle', () => {
        expect(mapTxTypeToReceiptType('batchSettle')).toBe('batchSettle');
    });

    it('returns null for approve', () => {
        expect(mapTxTypeToReceiptType('approve')).toBeNull();
    });
});

describe('buildMovementsFromMeta', () => {
    it('builds buy movements from meta', () => {
        const tx = makeTx({
            type: 'buyOption',
            meta: { optionId: '5', optionType: 'CALL', totalCost: '5.05', fee: '0.05', premium: '5', amount: '1', strike: '50' },
        });
        const { movements, fee } = buildMovementsFromMeta(tx);
        expect(movements).toHaveLength(2);
        expect(movements[0]).toMatchObject({ direction: 'debit', amount: '5.05', token: 'PILL' });
        expect(movements[1]).toMatchObject({ direction: 'credit', amount: 'Option #5', token: 'CALL' });
        expect(fee).toEqual({ amount: '0.05', token: 'PILL' });
    });

    it('builds cancel movements from meta', () => {
        const tx = makeTx({
            type: 'cancelOption',
            meta: { optionId: '5', optionType: 'CALL', collateral: '1', collateralToken: 'MOTO', fee: '0.01', returned: '0.99' },
        });
        const { movements, fee } = buildMovementsFromMeta(tx);
        expect(movements).toHaveLength(1);
        expect(movements[0]).toMatchObject({ direction: 'credit', amount: '0.99', token: 'MOTO' });
        expect(fee).toEqual({ amount: '0.01', token: 'MOTO' });
    });

    it('cancel with zero fee returns null fee', () => {
        const tx = makeTx({
            type: 'cancelOption',
            meta: { returned: '1', collateralToken: 'MOTO', fee: '0' },
        });
        const { fee } = buildMovementsFromMeta(tx);
        expect(fee).toBeNull();
    });

    it('builds exercise movements from meta', () => {
        const tx = makeTx({
            type: 'exercise',
            meta: { optionType: 'CALL', payAmount: '50', payToken: 'PILL', receiveAmount: '0.999', receiveToken: 'MOTO', fee: '0.001' },
        });
        const { movements, fee } = buildMovementsFromMeta(tx);
        expect(movements).toHaveLength(2);
        expect(movements[0].direction).toBe('debit');
        expect(movements[1].direction).toBe('credit');
        expect(fee).toEqual({ amount: '0.001', token: 'MOTO' });
    });

    it('builds settle movements from meta', () => {
        const tx = makeTx({
            type: 'settle',
            meta: { collateral: '1', collateralToken: 'MOTO' },
        });
        const { movements, fee } = buildMovementsFromMeta(tx);
        expect(movements).toHaveLength(1);
        expect(movements[0]).toMatchObject({ direction: 'credit', amount: '1', token: 'MOTO' });
        expect(fee).toBeNull();
    });

    it('builds transfer movements from meta', () => {
        const tx = makeTx({
            type: 'transferOption',
            meta: { optionId: '3', toAddress: '0xabc' },
        });
        const { movements } = buildMovementsFromMeta(tx);
        expect(movements).toHaveLength(1);
        expect(movements[0]).toMatchObject({ direction: 'debit', amount: 'Option #3' });
    });

    it('builds write movements from meta', () => {
        const tx = makeTx({
            type: 'writeOption',
            meta: { collateral: '1', collateralToken: 'MOTO' },
        });
        const { movements } = buildMovementsFromMeta(tx);
        expect(movements).toHaveLength(1);
        expect(movements[0]).toMatchObject({ direction: 'debit', amount: '1', token: 'MOTO' });
    });

    it('builds roll movements from meta', () => {
        const tx = makeTx({
            type: 'rollOption',
            meta: { cancelFee: '0.01', collateralToken: 'MOTO' },
        });
        const { movements, fee } = buildMovementsFromMeta(tx);
        expect(movements).toHaveLength(1);
        expect(movements[0]).toMatchObject({ direction: 'debit', amount: '0.01', token: 'MOTO' });
        expect(fee).toEqual({ amount: '0.01', token: 'MOTO' });
    });

    it('returns empty movements for approve', () => {
        const tx = makeTx({ type: 'approve', meta: {} });
        const { movements } = buildMovementsFromMeta(tx);
        expect(movements).toHaveLength(0);
    });

    it('builds batchCancel movements from meta', () => {
        const tx = makeTx({
            type: 'batchCancel',
            meta: { count: '3', optionIds: '1,2,3' },
        });
        const { movements } = buildMovementsFromMeta(tx);
        expect(movements).toHaveLength(1);
        expect(movements[0].amount).toBe('3 options');
    });

    it('builds batchSettle movements from meta', () => {
        const tx = makeTx({
            type: 'batchSettle',
            meta: { count: '2', optionIds: '4,5' },
        });
        const { movements } = buildMovementsFromMeta(tx);
        expect(movements).toHaveLength(1);
        expect(movements[0].amount).toBe('2 options');
    });

    it('uses fallback for missing meta fields', () => {
        const tx = makeTx({ type: 'buyOption', meta: {} });
        const { movements } = buildMovementsFromMeta(tx);
        expect(movements[0].amount).toBe('?');
        expect(movements[1].amount).toBe('Option #?');
    });
});
