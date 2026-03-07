/**
 * deriveFlowStatus — pure function tests for all 7 status derivation paths.
 */
import { describe, it, expect } from 'vitest';
import { deriveFlowStatus } from '../flowDefs.ts';
import type { StoredFlow } from '../flowDefs.ts';
import type { TrackedTransaction } from '../transactionDefs.ts';

function makeFlow(overrides: Partial<StoredFlow> = {}): StoredFlow {
    return {
        flowId: 'flow-1',
        actionType: 'buyOption',
        poolAddress: 'pool-1',
        optionId: '1',
        approvalTxId: null,
        actionTxId: null,
        claimedAt: new Date().toISOString(),
        label: 'Buy #1',
        formState: null,
        strategyLabel: null,
        ...overrides,
    };
}

function makeTx(overrides: Partial<TrackedTransaction> = {}): TrackedTransaction {
    return {
        txId: 'tx-1',
        type: 'approve',
        status: 'broadcast',
        poolAddress: 'pool-1',
        createdAt: new Date().toISOString(),
        confirmedAt: null,
        broadcastBlock: null,
        confirmedBlock: null,
        label: 'Approve',
        flowId: 'flow-1',
        flowStep: 1,
        meta: {},
        ...overrides,
    };
}

describe('deriveFlowStatus', () => {
    it('returns approval_pending when no TXs at all', () => {
        const flow = makeFlow();
        expect(deriveFlowStatus(flow, [])).toBe('approval_pending');
    });

    it('returns approval_pending when approval TX is broadcast', () => {
        const flow = makeFlow({ approvalTxId: 'tx-1' });
        const txs = [makeTx({ txId: 'tx-1', status: 'broadcast' })];
        expect(deriveFlowStatus(flow, txs)).toBe('approval_pending');
    });

    it('returns approval_pending when approval TX is pending', () => {
        const flow = makeFlow({ approvalTxId: 'tx-1' });
        const txs = [makeTx({ txId: 'tx-1', status: 'pending' })];
        expect(deriveFlowStatus(flow, txs)).toBe('approval_pending');
    });

    it('returns approval_confirmed when approval TX confirmed', () => {
        const flow = makeFlow({ approvalTxId: 'tx-1' });
        const txs = [makeTx({ txId: 'tx-1', status: 'confirmed' })];
        expect(deriveFlowStatus(flow, txs)).toBe('approval_confirmed');
    });

    it('returns approval_failed when approval TX failed', () => {
        const flow = makeFlow({ approvalTxId: 'tx-1' });
        const txs = [makeTx({ txId: 'tx-1', status: 'failed' })];
        expect(deriveFlowStatus(flow, txs)).toBe('approval_failed');
    });

    it('returns action_pending when action TX is broadcast', () => {
        const flow = makeFlow({ approvalTxId: 'tx-1', actionTxId: 'tx-2' });
        const txs = [
            makeTx({ txId: 'tx-1', status: 'confirmed' }),
            makeTx({ txId: 'tx-2', type: 'buyOption', status: 'broadcast', flowStep: 2 }),
        ];
        expect(deriveFlowStatus(flow, txs)).toBe('action_pending');
    });

    it('returns action_confirmed when action TX confirmed', () => {
        const flow = makeFlow({ approvalTxId: 'tx-1', actionTxId: 'tx-2' });
        const txs = [
            makeTx({ txId: 'tx-1', status: 'confirmed' }),
            makeTx({ txId: 'tx-2', type: 'buyOption', status: 'confirmed', flowStep: 2 }),
        ];
        expect(deriveFlowStatus(flow, txs)).toBe('action_confirmed');
    });

    it('returns action_failed when action TX failed', () => {
        const flow = makeFlow({ approvalTxId: 'tx-1', actionTxId: 'tx-2' });
        const txs = [
            makeTx({ txId: 'tx-1', status: 'confirmed' }),
            makeTx({ txId: 'tx-2', type: 'buyOption', status: 'failed', flowStep: 2 }),
        ];
        expect(deriveFlowStatus(flow, txs)).toBe('action_failed');
    });

    it('action TX status takes priority over approval TX status', () => {
        const flow = makeFlow({ approvalTxId: 'tx-1', actionTxId: 'tx-2' });
        // Even if approval is "confirmed", if action TX failed → action_failed
        const txs = [
            makeTx({ txId: 'tx-1', status: 'confirmed' }),
            makeTx({ txId: 'tx-2', type: 'buyOption', status: 'failed', flowStep: 2 }),
        ];
        expect(deriveFlowStatus(flow, txs)).toBe('action_failed');
    });

    it('returns action_pending when action TX not found in transactions', () => {
        // Edge case: actionTxId is set but the TX hasn't been added to the tracked list yet
        const flow = makeFlow({ approvalTxId: 'tx-1', actionTxId: 'tx-missing' });
        const txs = [makeTx({ txId: 'tx-1', status: 'confirmed' })];
        expect(deriveFlowStatus(flow, txs)).toBe('action_pending');
    });

    it('returns approval_pending when approval TX not found in transactions', () => {
        // Edge case: approvalTxId is set but TX not yet tracked
        const flow = makeFlow({ approvalTxId: 'tx-missing' });
        expect(deriveFlowStatus(flow, [])).toBe('approval_pending');
    });
});
