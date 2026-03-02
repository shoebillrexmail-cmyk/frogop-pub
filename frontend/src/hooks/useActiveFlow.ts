/**
 * useActiveFlow — convenience hook for two-step modal components.
 *
 * Wraps the TransactionContext's active flows APIs into a modal-friendly
 * interface with identity matching, canStartFlow gating, and form state
 * restoration for resumed flows.
 *
 * Supports parallel flows: each modal looks up its own flow by identity
 * (actionType + poolAddress + optionId) from the flows array.
 */
import { useMemo, useCallback, useRef } from 'react';
import { useTransactionContext } from './useTransactionContext.ts';
import { flowIdentityKey, MAX_PARALLEL_FLOWS } from '../contexts/flowDefs.ts';
import type { FlowActionType, ActiveFlow } from '../contexts/flowDefs.ts';

interface UseActiveFlowParams {
    actionType: FlowActionType;
    poolAddress: string;
    optionId?: string;
    label: string;
    strategyLabel?: string;
}

export interface UseActiveFlowResult {
    /** True when this modal can start a new flow (under limit or own flow exists) */
    canStartFlow: boolean;
    /** True when an active flow matches this modal's identity */
    isMyFlow: boolean;
    /** True when my flow's approval has been confirmed — ready for step 2 */
    approvalReady: boolean;
    /** The matching active flow object (null if no matching flow) */
    myFlow: ActiveFlow | null;
    /** Restored form state from a matching resumed flow */
    resumedFormState: Record<string, string> | null;
    /** Claim a flow slot. Returns the flow on success, null if at limit. */
    claimFlow: (formState?: Record<string, string>) => ActiveFlow | null;
    /** Update the active flow status/txIds */
    updateFlow: (updates: Partial<Pick<ActiveFlow, 'status' | 'approvalTxId' | 'actionTxId'>>) => void;
    /** Remove this flow from the active flows */
    abandonFlow: () => void;
}

export function useActiveFlow({
    actionType,
    poolAddress,
    optionId,
    label,
    strategyLabel,
}: UseActiveFlowParams): UseActiveFlowResult {
    const ctx = useTransactionContext();
    const { activeFlows } = ctx;

    const identityKey = useMemo(
        () => flowIdentityKey(actionType, poolAddress, optionId),
        [actionType, poolAddress, optionId],
    );

    const myFlow = useMemo(
        () =>
            activeFlows.find(
                (f) => flowIdentityKey(f.actionType, f.poolAddress, f.optionId) === identityKey,
            ) ?? null,
        [activeFlows, identityKey],
    );

    const isMyFlow = myFlow !== null;

    const canStartFlow = isMyFlow || activeFlows.length < MAX_PARALLEL_FLOWS;

    const approvalReady = isMyFlow && myFlow?.status === 'approval_confirmed';

    const resumedFormState = useMemo(() => {
        if (!myFlow) return null;
        return myFlow.formState;
    }, [myFlow]);

    // Track the most recently claimed flowId so updateFlow/abandonFlow work
    // even before React re-renders with the new myFlow from activeFlows.
    const claimedFlowIdRef = useRef<string | null>(null);

    const claimFlow = useCallback(
        (formState?: Record<string, string>) => {
            const flow = ctx.claimFlow({
                actionType,
                poolAddress,
                optionId,
                label,
                formState,
                strategyLabel,
            });
            if (flow) {
                claimedFlowIdRef.current = flow.flowId;
            }
            return flow;
        },
        [ctx, actionType, poolAddress, optionId, label, strategyLabel],
    );

    const resolveFlowId = (): string | null => myFlow?.flowId ?? claimedFlowIdRef.current;

    const updateFlow = useCallback(
        (updates: Partial<Pick<ActiveFlow, 'status' | 'approvalTxId' | 'actionTxId'>>) => {
            const flowId = resolveFlowId();
            if (!flowId) return;
            ctx.updateFlow(flowId, updates);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveFlowId reads ref + myFlow
        [ctx, myFlow],
    );

    const abandonFlow = useCallback(() => {
        const flowId = resolveFlowId();
        if (!flowId) return;
        ctx.abandonFlow(flowId);
        claimedFlowIdRef.current = null;
        // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveFlowId reads ref + myFlow
    }, [ctx, myFlow]);

    return {
        canStartFlow,
        isMyFlow,
        approvalReady,
        myFlow,
        resumedFormState,
        claimFlow,
        updateFlow,
        abandonFlow,
    };
}
