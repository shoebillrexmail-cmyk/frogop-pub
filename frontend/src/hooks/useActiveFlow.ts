/**
 * useActiveFlow — convenience hook for two-step modal components.
 *
 * Wraps the TransactionContext's active flow APIs into a modal-friendly
 * interface with identity matching, canStartFlow gating, and form state
 * restoration for resumed flows.
 */
import { useMemo, useCallback } from 'react';
import { useTransactionContext } from './useTransactionContext.ts';
import type { FlowActionType, ActiveFlow } from '../contexts/flowDefs.ts';

interface UseActiveFlowParams {
    actionType: FlowActionType;
    poolAddress: string;
    optionId?: string;
    label: string;
}

export interface UseActiveFlowResult {
    /** True when no flow is active or this modal's flow is active */
    canStartFlow: boolean;
    /** True when the currently active flow matches this modal's identity */
    isMyFlow: boolean;
    /** True when my flow's approval has been confirmed — ready for step 2 */
    approvalReady: boolean;
    /** The active flow object (null if none) */
    activeFlow: ActiveFlow | null;
    /** Restored form state from a matching resumed flow */
    resumedFormState: Record<string, string> | null;
    /** Claim the flow lock. Returns the flow on success, null if blocked. */
    claimFlow: (formState?: Record<string, string>) => ActiveFlow | null;
    /** Update the active flow status/txIds */
    updateFlow: (updates: Partial<Pick<ActiveFlow, 'status' | 'approvalTxId' | 'actionTxId'>>) => void;
    /** Release the flow lock */
    abandonFlow: () => void;
}

export function useActiveFlow({
    actionType,
    poolAddress,
    optionId,
    label,
}: UseActiveFlowParams): UseActiveFlowResult {
    const ctx = useTransactionContext();
    const flow = ctx.activeFlow;

    const isMyFlow = useMemo(() => {
        if (!flow) return false;
        return (
            flow.actionType === actionType &&
            flow.poolAddress === poolAddress &&
            flow.optionId === (optionId ?? null)
        );
    }, [flow, actionType, poolAddress, optionId]);

    const canStartFlow = flow === null || isMyFlow;

    const approvalReady = isMyFlow && flow?.status === 'approval_confirmed';

    const resumedFormState = useMemo(() => {
        if (!isMyFlow || !flow) return null;
        return flow.formState;
    }, [isMyFlow, flow]);

    const claimFlow = useCallback(
        (formState?: Record<string, string>) => {
            return ctx.claimFlow({
                actionType,
                poolAddress,
                optionId,
                label,
                formState,
            });
        },
        [ctx, actionType, poolAddress, optionId, label],
    );

    return {
        canStartFlow,
        isMyFlow,
        approvalReady,
        activeFlow: flow,
        resumedFormState,
        claimFlow,
        updateFlow: ctx.updateFlow,
        abandonFlow: ctx.abandonFlow,
    };
}
