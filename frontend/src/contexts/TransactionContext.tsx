/**
 * TransactionContext — persists pending TXs in localStorage, scoped by wallet address.
 *
 * Provides: transactions list, pendingCount, add/update/find helpers.
 * Trims to 20 entries; warns on beforeunload when TXs pending.
 */
import { createContext, useContext, useReducer, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TxType = 'approve' | 'writeOption' | 'buyOption' | 'cancelOption' | 'exercise' | 'settle';
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
// Context
// ---------------------------------------------------------------------------

interface TransactionContextValue {
    transactions: TrackedTransaction[];
    pendingCount: number;
    recentTransactions: TrackedTransaction[];
    addTransaction: (tx: Omit<TrackedTransaction, 'createdAt' | 'confirmedAt' | 'confirmedBlock'>) => void;
    updateTransaction: (txId: string, updates: Partial<TrackedTransaction>) => void;
    getFlowTransaction: (flowId: string, step: number) => TrackedTransaction | undefined;
    findResumableApproval: (poolAddress: string, optionId?: string) => TrackedTransaction | undefined;
    clearOld: () => void;
}

const TransactionContext = createContext<TransactionContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = 'frogop_pending_txs_';

export function TransactionProvider({ children }: { children: ReactNode }) {
    const { walletAddress } = useWalletConnect();
    const [state, dispatch] = useReducer(reducer, { transactions: [] });

    const storageKey = walletAddress ? `${STORAGE_PREFIX}${walletAddress}` : null;

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
        }),
        [state.transactions, pendingCount, recentTransactions, addTransaction, updateTransaction, getFlowTransaction, findResumableApproval, clearOld],
    );

    return <TransactionContext.Provider value={value}>{children}</TransactionContext.Provider>;
}

export function useTransactionContext(): TransactionContextValue {
    const ctx = useContext(TransactionContext);
    if (!ctx) throw new Error('useTransactionContext must be used within TransactionProvider');
    return ctx;
}
