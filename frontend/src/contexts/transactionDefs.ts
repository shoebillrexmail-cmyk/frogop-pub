/**
 * Shared types and context for the transaction tracking system.
 *
 * Separated from TransactionContext.tsx so that file exports only
 * the TransactionProvider component (required by React Fast Refresh).
 */
import { createContext } from 'react';
import type { ActiveFlow, FlowActionType, ResumeRequest } from './flowDefs.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TxType = 'approve' | 'writeOption' | 'buyOption' | 'cancelOption' | 'exercise' | 'settle' | 'transferOption' | 'batchCancel' | 'batchSettle' | 'rollOption';
export type TxStatus = 'broadcast' | 'pending' | 'confirmed' | 'failed';

export interface TrackedTransaction {
    txId: string;
    type: TxType;
    status: TxStatus;
    poolAddress: string;
    createdAt: string;
    confirmedAt: string | null;
    broadcastBlock: number | null;
    confirmedBlock: number | null;
    label: string;
    flowId: string | null;
    flowStep: number | null;
    meta: Record<string, string>;
}

export interface ReopenRequest {
    readonly tx: TrackedTransaction;
}

export interface TransactionContextValue {
    transactions: TrackedTransaction[];
    pendingCount: number;
    recentTransactions: TrackedTransaction[];
    addTransaction: (tx: Omit<TrackedTransaction, 'createdAt' | 'confirmedAt' | 'confirmedBlock'>) => void;
    updateTransaction: (txId: string, updates: Partial<TrackedTransaction>) => void;
    getFlowTransaction: (flowId: string, step: number) => TrackedTransaction | undefined;
    findResumableApproval: (poolAddress: string, optionId?: string) => TrackedTransaction | undefined;
    clearOld: () => void;

    // Active Flows (parallel, per-identity)
    activeFlows: ActiveFlow[];
    claimFlow: (params: {
        actionType: FlowActionType;
        poolAddress: string;
        optionId?: string;
        label: string;
        formState?: Record<string, string>;
        strategyLabel?: string;
    }) => ActiveFlow | null;
    updateFlow: (flowId: string, updates: Partial<Pick<ActiveFlow, 'status' | 'approvalTxId' | 'actionTxId'>>) => void;
    abandonFlow: (flowId: string) => void;

    // Resume
    resumeRequest: ResumeRequest | null;
    requestResume: (flowId: string) => void;
    clearResumeRequest: () => void;

    // Reopen (view TX detail from pill/history)
    reopenRequest: ReopenRequest | null;
    requestReopen: (tx: TrackedTransaction) => void;
    clearReopenRequest: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const TransactionContext = createContext<TransactionContextValue | null>(null);
