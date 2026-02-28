import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Global mock for TransactionContext — used by most modal/page components.
// Individual tests can override with vi.mocked() if needed.
vi.mock('../contexts/TransactionContext.tsx', () => ({
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
    TransactionProvider: ({ children }: { children: unknown }) => children,
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
