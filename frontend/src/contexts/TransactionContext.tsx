/**
 * TransactionContext — persists pending TXs in localStorage, scoped by wallet address.
 *
 * Provides: transactions list, pendingCount, add/update/find helpers.
 * Trims to 20 entries; warns on beforeunload when TXs pending.
 *
 * Also manages the Active Flow lock — at most one two-step (approve → action)
 * flow per wallet. Flow state is persisted in a separate localStorage key,
 * synced across tabs, and auto-advanced when tracked TXs change status.
 *
 * Types + context value live in transactionDefs.ts so this file only
 * exports the TransactionProvider component (React Fast Refresh).
 */
import { useReducer, useEffect, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { TransactionContext } from './transactionDefs.ts';
import type { TrackedTransaction, TransactionContextValue } from './transactionDefs.ts';
import type { ActiveFlow, FlowActionType, ResumeRequest } from './flowDefs.ts';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface TransactionState {
    transactions: TrackedTransaction[];
}

type TransactionAction =
    | { type: 'ADD_TX'; tx: TrackedTransaction }
    | { type: 'UPDATE_TX'; txId: string; updates: Partial<TrackedTransaction> }
    | { type: 'REMOVE_TX'; txId: string }
    | { type: 'LOAD'; transactions: TrackedTransaction[] }
    | { type: 'CLEAR_CONFIRMED' };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state: TransactionState, action: TransactionAction): TransactionState {
    switch (action.type) {
        case 'ADD_TX':
            return { transactions: [action.tx, ...state.transactions].slice(0, 20) };
        case 'UPDATE_TX':
            return {
                transactions: state.transactions.map((tx) =>
                    tx.txId === action.txId ? { ...tx, ...action.updates } : tx,
                ),
            };
        case 'REMOVE_TX':
            return { transactions: state.transactions.filter((tx) => tx.txId !== action.txId) };
        case 'LOAD':
            return { transactions: action.transactions };
        case 'CLEAR_CONFIRMED':
            return { transactions: state.transactions.filter((tx) => tx.status !== 'confirmed') };
        default:
            return state;
    }
}

// ---------------------------------------------------------------------------
// Flow helpers
// ---------------------------------------------------------------------------

const FLOW_STORAGE_PREFIX = 'frogop_active_flow_';
const STALE_FLOW_MS = 4 * 60 * 60 * 1000; // 4 hours

function loadFlow(key: string): ActiveFlow | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const flow = JSON.parse(raw) as ActiveFlow;
        // Auto-fail stale approval_pending flows
        if (
            flow.status === 'approval_pending' &&
            Date.now() - new Date(flow.claimedAt).getTime() > STALE_FLOW_MS
        ) {
            localStorage.removeItem(key);
            return null;
        }
        return flow;
    } catch {
        return null;
    }
}

function saveFlow(key: string, flow: ActiveFlow | null) {
    try {
        if (flow) {
            localStorage.setItem(key, JSON.stringify(flow));
        } else {
            localStorage.removeItem(key);
        }
    } catch {
        // Storage full or unavailable — ignore
    }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = 'frogop_pending_txs_';

export function TransactionProvider({ children }: { children: ReactNode }) {
    const { walletAddress } = useWalletConnect();
    const [state, dispatch] = useReducer(reducer, { transactions: [] });

    const storageKey = walletAddress ? `${STORAGE_PREFIX}${walletAddress}` : null;
    const flowKey = walletAddress ? `${FLOW_STORAGE_PREFIX}${walletAddress}` : null;

    // --- Active Flow state ---
    const [activeFlow, setActiveFlow] = useState<ActiveFlow | null>(null);
    const [resumeRequest, setResumeRequest] = useState<ResumeRequest | null>(null);

    // Load flow from localStorage when wallet changes
    useEffect(() => {
        if (!flowKey) {
            setActiveFlow(null);
            return;
        }
        setActiveFlow(loadFlow(flowKey));
    }, [flowKey]);

    // Persist flow to localStorage on every change
    useEffect(() => {
        if (!flowKey) return;
        saveFlow(flowKey, activeFlow);
    }, [activeFlow, flowKey]);

    // Multi-tab sync via storage event
    useEffect(() => {
        if (!flowKey) return;
        const handler = (e: StorageEvent) => {
            if (e.key === flowKey) {
                setActiveFlow(e.newValue ? loadFlow(flowKey) : null);
            }
        };
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, [flowKey]);

    // Auto-sync flow status when tracked TXs change
    useEffect(() => {
        if (!activeFlow) return;

        // Advance approval_pending → approval_confirmed when approval TX confirms
        if (activeFlow.status === 'approval_pending' && activeFlow.approvalTxId) {
            const approvalTx = state.transactions.find((tx) => tx.txId === activeFlow.approvalTxId);
            if (approvalTx?.status === 'confirmed') {
                setActiveFlow({ ...activeFlow, status: 'approval_confirmed' });
                return;
            }
            if (approvalTx?.status === 'failed') {
                setActiveFlow({ ...activeFlow, status: 'approval_failed' });
                return;
            }
        }

        // Advance action_pending → action_confirmed when action TX confirms
        if (activeFlow.status === 'action_pending' && activeFlow.actionTxId) {
            const actionTx = state.transactions.find((tx) => tx.txId === activeFlow.actionTxId);
            if (actionTx?.status === 'confirmed') {
                setActiveFlow({ ...activeFlow, status: 'action_confirmed' });
                return;
            }
            if (actionTx?.status === 'failed') {
                setActiveFlow({ ...activeFlow, status: 'action_failed' });
                return;
            }
        }
    }, [state.transactions, activeFlow]);

    // Auto-release flow 3s after action_confirmed
    useEffect(() => {
        if (activeFlow?.status !== 'action_confirmed') return;
        const timer = setTimeout(() => setActiveFlow(null), 3000);
        return () => clearTimeout(timer);
    }, [activeFlow?.status]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- Flow callbacks ---

    const claimFlow = useCallback(
        (params: {
            actionType: FlowActionType;
            poolAddress: string;
            optionId?: string;
            label: string;
            formState?: Record<string, string>;
        }): ActiveFlow | null => {
            // Allow if no flow active, or if same identity flow is being re-claimed
            if (activeFlow !== null) {
                const sameIdentity =
                    activeFlow.actionType === params.actionType &&
                    activeFlow.poolAddress === params.poolAddress &&
                    activeFlow.optionId === (params.optionId ?? null);
                if (!sameIdentity) return null; // blocked
            }

            const flow: ActiveFlow = {
                flowId: crypto.randomUUID(),
                actionType: params.actionType,
                poolAddress: params.poolAddress,
                optionId: params.optionId ?? null,
                status: 'approval_pending',
                approvalTxId: null,
                actionTxId: null,
                claimedAt: new Date().toISOString(),
                label: params.label,
                formState: params.formState ?? null,
            };
            setActiveFlow(flow);
            return flow;
        },
        [activeFlow],
    );

    const updateFlowFn = useCallback(
        (updates: Partial<Pick<ActiveFlow, 'status' | 'approvalTxId' | 'actionTxId'>>) => {
            setActiveFlow((prev) => (prev ? { ...prev, ...updates } : null));
        },
        [],
    );

    const abandonFlow = useCallback(() => {
        setActiveFlow(null);
        setResumeRequest(null);
    }, []);

    const requestResume = useCallback(() => {
        if (!activeFlow) return;
        setResumeRequest({
            actionType: activeFlow.actionType,
            poolAddress: activeFlow.poolAddress,
            optionId: activeFlow.optionId,
            formState: activeFlow.formState,
        });
    }, [activeFlow]);

    const clearResumeRequest = useCallback(() => {
        setResumeRequest(null);
    }, []);

    // --- Transaction management (unchanged) ---

    // Load from localStorage when wallet changes
    useEffect(() => {
        if (!storageKey) {
            dispatch({ type: 'LOAD', transactions: [] });
            return;
        }
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
                const parsed = JSON.parse(raw) as TrackedTransaction[];
                dispatch({ type: 'LOAD', transactions: parsed.slice(0, 20) });
            } else {
                dispatch({ type: 'LOAD', transactions: [] });
            }
        } catch {
            dispatch({ type: 'LOAD', transactions: [] });
        }
    }, [storageKey]);

    // Persist to localStorage on every state change
    useEffect(() => {
        if (!storageKey) return;
        try {
            localStorage.setItem(storageKey, JSON.stringify(state.transactions));
        } catch {
            // Storage full or unavailable — ignore
        }
    }, [state.transactions, storageKey]);

    // Warn on beforeunload if pending TXs
    const pendingCount = useMemo(
        () => state.transactions.filter((tx) => tx.status === 'broadcast' || tx.status === 'pending').length,
        [state.transactions],
    );

    useEffect(() => {
        if (pendingCount === 0) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [pendingCount]);

    const addTransaction = useCallback(
        (tx: Omit<TrackedTransaction, 'createdAt' | 'confirmedAt' | 'confirmedBlock'>) => {
            dispatch({
                type: 'ADD_TX',
                tx: { ...tx, createdAt: new Date().toISOString(), confirmedAt: null, confirmedBlock: null },
            });
        },
        [],
    );

    const updateTransaction = useCallback((txId: string, updates: Partial<TrackedTransaction>) => {
        dispatch({ type: 'UPDATE_TX', txId, updates });
    }, []);

    const getFlowTransaction = useCallback(
        (flowId: string, step: number) =>
            state.transactions.find((tx) => tx.flowId === flowId && tx.flowStep === step),
        [state.transactions],
    );

    const findResumableApproval = useCallback(
        (poolAddress: string, optionId?: string) => {
            return state.transactions.find((tx) => {
                if (tx.type !== 'approve') return false;
                if (tx.poolAddress !== poolAddress) return false;
                if (tx.status !== 'confirmed') return false;
                if (!tx.flowId) return false;
                // Check if the same flow has a step 2 already
                const hasStep2 = state.transactions.some(
                    (t) => t.flowId === tx.flowId && t.flowStep === 2,
                );
                if (hasStep2) return false;
                // If optionId is specified, check meta
                if (optionId && tx.meta['optionId'] !== optionId) return false;
                return true;
            });
        },
        [state.transactions],
    );

    const clearOld = useCallback(() => {
        dispatch({ type: 'CLEAR_CONFIRMED' });
    }, []);

    const recentTransactions = useMemo(
        () => state.transactions.slice(0, 10),
        [state.transactions],
    );

    const value = useMemo<TransactionContextValue>(
        () => ({
            transactions: state.transactions,
            pendingCount,
            recentTransactions,
            addTransaction,
            updateTransaction,
            getFlowTransaction,
            findResumableApproval,
            clearOld,
            activeFlow,
            claimFlow,
            updateFlow: updateFlowFn,
            abandonFlow,
            resumeRequest,
            requestResume,
            clearResumeRequest,
        }),
        [
            state.transactions, pendingCount, recentTransactions,
            addTransaction, updateTransaction, getFlowTransaction, findResumableApproval, clearOld,
            activeFlow, claimFlow, updateFlowFn, abandonFlow,
            resumeRequest, requestResume, clearResumeRequest,
        ],
    );

    return <TransactionContext.Provider value={value}>{children}</TransactionContext.Provider>;
}

// Re-export types for backward compatibility.
export type { TxType, TxStatus, TrackedTransaction, TransactionContextValue } from './transactionDefs.ts';
