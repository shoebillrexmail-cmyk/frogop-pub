/**
 * TransactionContext — persists pending TXs in localStorage, scoped by wallet address.
 *
 * Provides: transactions list, pendingCount, add/update/find helpers.
 * Trims to 100 entries; warns on beforeunload when TXs pending.
 *
 * Also manages Active Flows — up to MAX_PARALLEL_FLOWS concurrent two-step
 * (approve → action) flows per wallet. Each flow is keyed by identity
 * (actionType + poolAddress + optionId). Flow state is persisted in a
 * separate localStorage key, synced across tabs, and auto-advanced when
 * tracked TXs change status.
 *
 * Types + context value live in transactionDefs.ts so this file only
 * exports the TransactionProvider component (React Fast Refresh).
 */
import { useReducer, useEffect, useCallback, useMemo, useState, useRef, type ReactNode } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { TransactionContext } from './transactionDefs.ts';
import type { TrackedTransaction, TransactionContextValue, ReopenRequest } from './transactionDefs.ts';
import { flowIdentityKey, deriveFlowStatus, MAX_PARALLEL_FLOWS } from './flowDefs.ts';
import type { ActiveFlow, StoredFlow, FlowActionType, ResumeRequest } from './flowDefs.ts';

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
            return { transactions: [action.tx, ...state.transactions].slice(0, 100) };
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

const FLOWS_STORAGE_PREFIX = 'frogop_active_flows_';
const STALE_FLOW_MS = 4 * 60 * 60 * 1000; // 4 hours

function loadFlows(key: string): StoredFlow[] {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as Record<string, unknown>[];
        if (!Array.isArray(parsed)) return [];
        // Strip legacy `status` field and filter stale flows
        return parsed
            .map((entry) => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars -- stripping legacy field
                const { status, ...rest } = entry;
                return rest as unknown as StoredFlow;
            })
            .filter((flow) => {
                if (
                    !flow.approvalTxId && !flow.actionTxId &&
                    Date.now() - new Date(flow.claimedAt).getTime() > STALE_FLOW_MS
                ) {
                    return false;
                }
                return true;
            });
    } catch {
        return [];
    }
}

function saveFlows(key: string, flows: StoredFlow[]) {
    try {
        if (flows.length > 0) {
            localStorage.setItem(key, JSON.stringify(flows));
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
    const flowKey = walletAddress ? `${FLOWS_STORAGE_PREFIX}${walletAddress}` : null;

    // --- Active Flows state (stored without status; status derived at read-time) ---
    const [storedFlows, setStoredFlows] = useState<StoredFlow[]>([]);
    const [resumeRequest, setResumeRequest] = useState<ResumeRequest | null>(null);
    const [reopenRequest, setReopenRequest] = useState<ReopenRequest | null>(null);

    // Track scheduled auto-removals so we don't set duplicate timers
    const scheduledRemovalsRef = useRef(new Set<string>());

    // Adjust flow state when wallet (flowKey) changes — React-recommended pattern.
    // See: https://react.dev/reference/react/useState#storing-information-from-previous-renders
    const [prevFlowKey, setPrevFlowKey] = useState(flowKey);
    if (flowKey !== prevFlowKey) {
        setPrevFlowKey(flowKey);
        setStoredFlows(flowKey ? loadFlows(flowKey) : []);
    }

    // Derive activeFlows from storedFlows + tracked transactions (pure computation)
    const activeFlows = useMemo<ActiveFlow[]>(
        () => storedFlows.map((f) => ({ ...f, status: deriveFlowStatus(f, state.transactions) })),
        [storedFlows, state.transactions],
    );

    // Persist flows to localStorage on every change
    useEffect(() => {
        if (!flowKey) return;
        saveFlows(flowKey, storedFlows);
    }, [storedFlows, flowKey]);

    // Multi-tab sync via storage event
    useEffect(() => {
        if (!flowKey) return;
        const handler = (e: StorageEvent) => {
            if (e.key === flowKey) {
                setStoredFlows(e.newValue ? loadFlows(flowKey) : []);
            }
        };
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, [flowKey]);

    // Auto-release flows 3s after action_confirmed
    useEffect(() => {
        const confirmedFlows = activeFlows.filter(
            (f) => f.status === 'action_confirmed' && !scheduledRemovalsRef.current.has(f.flowId),
        );
        for (const flow of confirmedFlows) {
            scheduledRemovalsRef.current.add(flow.flowId);
            setTimeout(() => {
                scheduledRemovalsRef.current.delete(flow.flowId);
                setStoredFlows((prev) => prev.filter((f) => f.flowId !== flow.flowId));
            }, 3000);
        }
    }, [activeFlows]);

    // --- Flow callbacks ---

    const claimFlow = useCallback(
        (params: {
            actionType: FlowActionType;
            poolAddress: string;
            optionId?: string;
            label: string;
            formState?: Record<string, string>;
            strategyLabel?: string;
        }): ActiveFlow | null => {
            const key = flowIdentityKey(params.actionType, params.poolAddress, params.optionId);

            // Check if same identity flow already exists
            const existingIdx = storedFlows.findIndex(
                (f) => flowIdentityKey(f.actionType, f.poolAddress, f.optionId) === key,
            );

            // At limit and no existing flow to replace → blocked
            if (existingIdx === -1 && storedFlows.length >= MAX_PARALLEL_FLOWS) {
                return null;
            }

            const stored: StoredFlow = {
                flowId: crypto.randomUUID(),
                actionType: params.actionType,
                poolAddress: params.poolAddress,
                optionId: params.optionId ?? null,
                approvalTxId: null,
                actionTxId: null,
                claimedAt: new Date().toISOString(),
                label: params.label,
                formState: params.formState ?? null,
                strategyLabel: params.strategyLabel ?? null,
            };

            if (existingIdx !== -1) {
                // Replace existing flow with same identity (retry scenario)
                setStoredFlows((prev) => prev.map((f, i) => (i === existingIdx ? stored : f)));
            } else {
                setStoredFlows((prev) => [...prev, stored]);
            }
            // Return as ActiveFlow with derived status for the caller
            return { ...stored, status: 'approval_pending' };
        },
        [storedFlows],
    );

    const updateFlowFn = useCallback(
        (flowId: string, updates: Partial<Pick<StoredFlow, 'approvalTxId' | 'actionTxId'>>) => {
            setStoredFlows((prev) =>
                prev.map((f) => (f.flowId === flowId ? { ...f, ...updates } : f)),
            );
        },
        [],
    );

    const abandonFlowFn = useCallback((flowId: string) => {
        setStoredFlows((prev) => prev.filter((f) => f.flowId !== flowId));
        setResumeRequest((prev) => (prev?.flowId === flowId ? null : prev));
    }, []);

    const requestResumeFn = useCallback(
        (flowId: string) => {
            const flow = activeFlows.find((f) => f.flowId === flowId);
            if (!flow) return;
            setResumeRequest({
                flowId: flow.flowId,
                actionType: flow.actionType,
                poolAddress: flow.poolAddress,
                optionId: flow.optionId,
                formState: flow.formState,
                strategyLabel: flow.strategyLabel,
            });
        },
        [activeFlows],
    );

    const clearResumeRequest = useCallback(() => {
        setResumeRequest(null);
    }, []);

    const requestReopenFn = useCallback((tx: TrackedTransaction) => {
        setReopenRequest({ tx });
    }, []);

    const clearReopenRequestFn = useCallback(() => {
        setReopenRequest(null);
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
                dispatch({ type: 'LOAD', transactions: parsed.slice(0, 100) });
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
                // If optionId is specified, check meta (UUID prevents cross-contamination)
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
            activeFlows,
            claimFlow,
            updateFlow: updateFlowFn,
            abandonFlow: abandonFlowFn,
            resumeRequest,
            requestResume: requestResumeFn,
            clearResumeRequest,
            reopenRequest,
            requestReopen: requestReopenFn,
            clearReopenRequest: clearReopenRequestFn,
        }),
        [
            state.transactions, pendingCount, recentTransactions,
            addTransaction, updateTransaction, getFlowTransaction, findResumableApproval, clearOld,
            activeFlows, claimFlow, updateFlowFn, abandonFlowFn,
            resumeRequest, requestResumeFn, clearResumeRequest,
            reopenRequest, requestReopenFn, clearReopenRequestFn,
        ],
    );

    return <TransactionContext.Provider value={value}>{children}</TransactionContext.Provider>;
}

// Re-export types for backward compatibility.
export type { TxType, TxStatus, TrackedTransaction, TransactionContextValue } from './transactionDefs.ts';
