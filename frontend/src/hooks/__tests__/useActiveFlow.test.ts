/**
 * useActiveFlow — unit tests for the Active Flow hook.
 *
 * The global setup.ts already mocks useTransactionContext. We override
 * the return value per test via mockReturnValue.
 *
 * IMPORTANT: We also need to un-mock useActiveFlow itself since setup.ts
 * provides a global mock for it. We use vi.mock with importOriginal to
 * get the real implementation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ActiveFlow } from '../../contexts/flowDefs.ts';
import { MAX_PARALLEL_FLOWS } from '../../contexts/flowDefs.ts';

// Use the real useActiveFlow (setup.ts mocks it, so we override)
vi.mock('../useActiveFlow.ts', async (importOriginal) => {
    return await importOriginal();
});

// Use the real useTransactionContext mock from setup.ts; override per-test
import { useTransactionContext } from '../useTransactionContext.ts';
import { useActiveFlow } from '../useActiveFlow.ts';

const mockContext = (overrides: Record<string, unknown> = {}) => {
    const base = {
        transactions: [],
        pendingCount: 0,
        recentTransactions: [],
        addTransaction: vi.fn(),
        updateTransaction: vi.fn(),
        getFlowTransaction: vi.fn(),
        findResumableApproval: vi.fn(() => null),
        clearOld: vi.fn(),
        activeFlows: [],
        claimFlow: vi.fn(() => ({
            flowId: 'new-flow',
            actionType: 'writeOption',
            poolAddress: 'pool-1',
            optionId: null,
            status: 'approval_pending',
            approvalTxId: null,
            actionTxId: null,
            claimedAt: new Date().toISOString(),
            label: 'Write Option',
            formState: null,
            strategyLabel: null,
        })),
        updateFlow: vi.fn(),
        abandonFlow: vi.fn(),
        resumeRequest: null,
        requestResume: vi.fn(),
        clearResumeRequest: vi.fn(),
        ...overrides,
    };
    vi.mocked(useTransactionContext).mockReturnValue(base as ReturnType<typeof useTransactionContext>);
    return base;
};

describe('useActiveFlow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns canStartFlow=true when no active flow', () => {
        mockContext();
        const { result } = renderHook(() =>
            useActiveFlow({ actionType: 'writeOption', poolAddress: 'pool-1', label: 'Write' }),
        );
        expect(result.current.canStartFlow).toBe(true);
        expect(result.current.isMyFlow).toBe(false);
        expect(result.current.approvalReady).toBe(false);
        expect(result.current.resumedFormState).toBeNull();
    });

    it('returns canStartFlow=true when fewer than MAX_PARALLEL_FLOWS active', () => {
        const otherFlow: ActiveFlow = {
            flowId: 'other',
            actionType: 'buyOption',
            poolAddress: 'pool-1',
            optionId: '42',
            status: 'approval_pending',
            approvalTxId: null,
            actionTxId: null,
            claimedAt: new Date().toISOString(),
            label: 'Buy #42',
            formState: null,
            strategyLabel: null,
        };
        mockContext({ activeFlows: [otherFlow] });

        const { result } = renderHook(() =>
            useActiveFlow({ actionType: 'writeOption', poolAddress: 'pool-1', label: 'Write' }),
        );
        expect(result.current.canStartFlow).toBe(true);
        expect(result.current.isMyFlow).toBe(false);
    });

    it('returns canStartFlow=false when MAX_PARALLEL_FLOWS reached', () => {
        const flows: ActiveFlow[] = Array.from({ length: MAX_PARALLEL_FLOWS }, (_, i) => ({
            flowId: `flow-${i}`,
            actionType: 'buyOption' as const,
            poolAddress: 'pool-1',
            optionId: String(i),
            status: 'approval_pending' as const,
            approvalTxId: null,
            actionTxId: null,
            claimedAt: new Date().toISOString(),
            label: `Buy #${i}`,
            formState: null,
            strategyLabel: null,
        }));
        mockContext({ activeFlows: flows });

        const { result } = renderHook(() =>
            useActiveFlow({ actionType: 'writeOption', poolAddress: 'pool-1', label: 'Write' }),
        );
        expect(result.current.canStartFlow).toBe(false);
        expect(result.current.isMyFlow).toBe(false);
    });

    it('returns canStartFlow=true and isMyFlow=true when matching flow is active', () => {
        const myFlow: ActiveFlow = {
            flowId: 'mine',
            actionType: 'buyOption',
            poolAddress: 'pool-1',
            optionId: '7',
            status: 'approval_confirmed',
            approvalTxId: 'tx-abc',
            actionTxId: null,
            claimedAt: new Date().toISOString(),
            label: 'Buy #7',
            formState: null,
            strategyLabel: null,
        };
        mockContext({ activeFlows: [myFlow] });

        const { result } = renderHook(() =>
            useActiveFlow({
                actionType: 'buyOption',
                poolAddress: 'pool-1',
                optionId: '7',
                label: 'Buy #7',
            }),
        );
        expect(result.current.canStartFlow).toBe(true);
        expect(result.current.isMyFlow).toBe(true);
        expect(result.current.approvalReady).toBe(true);
    });

    it('returns resumedFormState for matching flow with formState', () => {
        const myFlow: ActiveFlow = {
            flowId: 'mine',
            actionType: 'writeOption',
            poolAddress: 'pool-1',
            optionId: null,
            status: 'approval_confirmed',
            approvalTxId: 'tx-abc',
            actionTxId: null,
            claimedAt: new Date().toISOString(),
            label: 'Write Option',
            formState: { strike: '50', amount: '1', premium: '5', days: '7', optionType: '0' },
            strategyLabel: null,
        };
        mockContext({ activeFlows: [myFlow] });

        const { result } = renderHook(() =>
            useActiveFlow({ actionType: 'writeOption', poolAddress: 'pool-1', label: 'Write' }),
        );
        expect(result.current.resumedFormState).toEqual({
            strike: '50',
            amount: '1',
            premium: '5',
            days: '7',
            optionType: '0',
        });
    });

    it('claimFlow delegates to context', () => {
        const ctx = mockContext();
        const { result } = renderHook(() =>
            useActiveFlow({ actionType: 'writeOption', poolAddress: 'pool-1', label: 'Write' }),
        );

        const formState = { strike: '50' };
        result.current.claimFlow(formState);
        expect(ctx.claimFlow).toHaveBeenCalledWith({
            actionType: 'writeOption',
            poolAddress: 'pool-1',
            optionId: undefined,
            label: 'Write',
            formState: { strike: '50' },
        });
    });

    it('identity matching uses optionId=null when not provided', () => {
        const flow: ActiveFlow = {
            flowId: 'f1',
            actionType: 'writeOption',
            poolAddress: 'pool-1',
            optionId: null,
            status: 'approval_pending',
            approvalTxId: null,
            actionTxId: null,
            claimedAt: new Date().toISOString(),
            label: 'Write',
            formState: null,
            strategyLabel: null,
        };
        mockContext({ activeFlows: [flow] });

        const { result } = renderHook(() =>
            useActiveFlow({ actionType: 'writeOption', poolAddress: 'pool-1', label: 'Write' }),
        );
        expect(result.current.isMyFlow).toBe(true);
    });

    it('identity does not match when optionId differs', () => {
        const flow: ActiveFlow = {
            flowId: 'f1',
            actionType: 'buyOption',
            poolAddress: 'pool-1',
            optionId: '5',
            status: 'approval_pending',
            approvalTxId: null,
            actionTxId: null,
            claimedAt: new Date().toISOString(),
            label: 'Buy #5',
            formState: null,
            strategyLabel: null,
        };
        mockContext({ activeFlows: [flow] });

        const { result } = renderHook(() =>
            useActiveFlow({
                actionType: 'buyOption',
                poolAddress: 'pool-1',
                optionId: '10',
                label: 'Buy #10',
            }),
        );
        expect(result.current.isMyFlow).toBe(false);
        // With parallel flows, a single different flow doesn't block — canStartFlow is still true
        expect(result.current.canStartFlow).toBe(true);
    });
});
