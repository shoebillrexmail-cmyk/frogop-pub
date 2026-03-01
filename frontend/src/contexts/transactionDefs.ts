/**
 * Shared types and context for the transaction tracking system.
 *
 * Separated from TransactionContext.tsx so that file exports only
 * the TransactionProvider component (required by React Fast Refresh).
 */
import { createContext } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TxType = 'approve' | 'writeOption' | 'buyOption' | 'cancelOption' | 'exercise' | 'settle' | 'transferOption';
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

export interface TransactionContextValue {
    transactions: TrackedTransaction[];
    pendingCount: number;
    recentTransactions: TrackedTransaction[];
    addTransaction: (tx: Omit<TrackedTransaction, 'createdAt' | 'confirmedAt' | 'confirmedBlock'>) => void;
    updateTransaction: (txId: string, updates: Partial<TrackedTransaction>) => void;
    getFlowTransaction: (flowId: string, step: number) => TrackedTransaction | undefined;
    findResumableApproval: (poolAddress: string, optionId?: string) => TrackedTransaction | undefined;
    clearOld: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const TransactionContext = createContext<TransactionContextValue | null>(null);
