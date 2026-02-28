import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { createContext } from 'react';

// Pre-create the mock context so vi.mock can reference it (vi.mock is hoisted).
const MockWsBlockContext = createContext<bigint | null>(null);

// Global mock for transactionDefs — the context creation used by hooks/components.
vi.mock('../contexts/transactionDefs.ts', () => ({
    TransactionContext: createContext(null),
}));

// Global mock for TransactionProvider — the wrapper component in App.
vi.mock('../contexts/TransactionContext.tsx', () => ({
    TransactionProvider: ({ children }: { children: unknown }) => children,
}));

// Global mock for useTransactionContext — extracted hook.
vi.mock('../hooks/useTransactionContext.ts', () => ({
    useTransactionContext: vi.fn(() => ({
        transactions: [],
        pendingCount: 0,
        addTransaction: vi.fn(),
        updateTransaction: vi.fn(),
        getFlowTransaction: vi.fn(),
        findResumableApproval: vi.fn(() => null),
        clearOld: vi.fn(),
        recentTransactions: [],
    })),
}));

// Global mock for useTransactionFlow — used by BuyOptionModal, ExerciseModal, WriteOptionPanel.
vi.mock('../hooks/useTransactionFlow.ts', () => ({
    useTransactionFlow: vi.fn(() => ({
        flowId: 'test-flow-id',
        trackApproval: vi.fn(),
        trackAction: vi.fn(),
        approvalConfirmed: false,
        resumableFlowId: null,
    })),
}));

// Global mock for useTransactionPoller — used by Layout.
vi.mock('../hooks/useTransactionPoller.ts', () => ({
    useTransactionPoller: vi.fn(),
}));

// Global mock for TransactionToast — used by Layout.
vi.mock('../components/TransactionToast.tsx', () => ({
    TransactionToast: () => null,
}));

// Global mock for usePriceCandles — used by PoolsPage.
vi.mock('../hooks/usePriceCandles.ts', () => ({
    usePriceCandles: vi.fn(() => ({
        candles: [],
        loading: false,
        error: null,
        refetch: vi.fn(),
    })),
}));

// Global mock for PriceChart — used by PoolsPage.
vi.mock('../components/PriceChart.tsx', () => ({
    PriceChart: () => null,
}));

// Global mock for useWebSocketProvider — used by Layout and pages.
vi.mock('../hooks/useWebSocketProvider.ts', () => ({
    useWebSocketProvider: vi.fn(() => ({
        wsProvider: null,
        connectionState: 0, // DISCONNECTED
        connected: false,
        currentBlock: null,
        latestBlockHash: null,
    })),
    useWsBlock: vi.fn(() => null),
    WsBlockContext: MockWsBlockContext,
}));
