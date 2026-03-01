/**
 * useTransactionFlow — multi-step flow helper for modals.
 *
 * On mount, checks for a resumable confirmed approval (step 1) that has no step 2 yet.
 * If found, reuses that flowId and sets approvalConfirmed = true.
 */
import { useState, useCallback, useMemo } from 'react';
import { useTransactionContext } from './useTransactionContext.ts';
import type { TxType } from '../contexts/transactionDefs.ts';

export interface UseTransactionFlowResult {
    flowId: string;
    trackApproval: (txId: string, label: string, meta?: Record<string, string>) => void;
    trackAction: (txId: string, type: TxType, label: string, meta?: Record<string, string>) => void;
    approvalConfirmed: boolean;
    resumableFlowId: string | null;
    resumableMeta: Record<string, string> | null;
}

export function useTransactionFlow(
    poolAddress: string,
    optionId?: string,
): UseTransactionFlowResult {
    const { addTransaction, findResumableApproval } = useTransactionContext();

    const [flowId] = useState(() => crypto.randomUUID());

    const resumable = useMemo(
        () => findResumableApproval(poolAddress, optionId),
        [findResumableApproval, poolAddress, optionId],
    );

    const activeFlowId = resumable?.flowId ?? flowId;
    const approvalConfirmed = !!resumable;

    const trackApproval = useCallback(
        (txId: string, label: string, meta?: Record<string, string>) => {
            addTransaction({
                txId,
                type: 'approve',
                status: 'broadcast',
                poolAddress,
                broadcastBlock: null,
                label,
                flowId: activeFlowId,
                flowStep: 1,
                meta: { ...meta, ...(optionId ? { optionId } : {}) },
            });
        },
        [addTransaction, poolAddress, activeFlowId, optionId],
    );

    const trackAction = useCallback(
        (txId: string, type: TxType, label: string, meta?: Record<string, string>) => {
            addTransaction({
                txId,
                type,
                status: 'broadcast',
                poolAddress,
                broadcastBlock: null,
                label,
                flowId: activeFlowId,
                flowStep: 2,
                meta: { ...meta, ...(optionId ? { optionId } : {}) },
            });
        },
        [addTransaction, poolAddress, activeFlowId, optionId],
    );

    return {
        flowId: activeFlowId,
        trackApproval,
        trackAction,
        approvalConfirmed,
        resumableFlowId: resumable?.flowId ?? null,
        resumableMeta: resumable?.meta ?? null,
    };
}
