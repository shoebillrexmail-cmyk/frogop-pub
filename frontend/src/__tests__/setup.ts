import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { createContext } from 'react';

// Pre-create the mock context so vi.mock can reference it (vi.mock is hoisted).
const MockWsBlockContext = createContext<{
    blockNumber: bigint;
    timestamp: bigint;
    blockHash: string;
} | null>(null);

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
        activeFlows: [],
        claimFlow: vi.fn(() => ({ flowId: 'test-flow', actionType: 'writeOption', poolAddress: '', optionId: null, status: 'approval_pending', approvalTxId: null, actionTxId: null, claimedAt: new Date().toISOString(), label: '', formState: null, strategyLabel: null })),
        updateFlow: vi.fn(),
        abandonFlow: vi.fn(),
        resumeRequest: null,
        requestResume: vi.fn(),
        clearResumeRequest: vi.fn(),
        reopenRequest: null,
        requestReopen: vi.fn(),
        clearReopenRequest: vi.fn(),
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
        resumableMeta: null,
    })),
}));

// Global mock for useActiveFlow — used by two-step modals.
vi.mock('../hooks/useActiveFlow.ts', () => ({
    useActiveFlow: vi.fn(() => ({
        canStartFlow: true,
        isMyFlow: false,
        approvalReady: false,
        myFlow: null,
        resumedFormState: null,
        claimFlow: vi.fn(() => ({ flowId: 'test-flow', actionType: 'writeOption', poolAddress: '', optionId: null, status: 'approval_pending', approvalTxId: null, actionTxId: null, claimedAt: new Date().toISOString(), label: '', formState: null, strategyLabel: null })),
        updateFlow: vi.fn(),
        abandonFlow: vi.fn(),
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

// Global mock for PnLChart — uses lightweight-charts (no canvas in jsdom).
vi.mock('../components/PnLChart.tsx', () => ({
    PnLChart: () => null,
}));

// Global mock for useSuggestedPremium — used by WriteOptionPanel.
vi.mock('../hooks/useSuggestedPremium.ts', () => ({
    useSuggestedPremium: vi.fn(() => ({
        suggestedPremium: null,
        annualizedVol: 0.8,
    })),
}));

// Global mock for usePnL — used by PortfolioPage.
vi.mock('../hooks/usePnL.ts', () => ({
    usePnL: vi.fn(() => ({
        totalPnlPill: null,
        perOption: new Map(),
    })),
}));

// Global mock for usePriceRatio — used by PoolsPage, PortfolioPage.
vi.mock('../hooks/usePriceRatio.ts', () => ({
    usePriceRatio: vi.fn(() => ({
        motoPillRatio: null,
        loading: false,
        error: null,
    })),
}));

// Global mock for useFallbackProvider — used by Layout and pages.
vi.mock('../hooks/useFallbackProvider.ts', () => ({
    useFallbackProvider: vi.fn(() => null),
}));

// Global mock for useWebSocketProvider — used by Layout and pages.
vi.mock('../hooks/useWebSocketProvider.ts', () => ({
    useWebSocketProvider: vi.fn(() => ({
        wsProvider: null,
        connectionState: 0, // DISCONNECTED
        connected: false,
        wsBlockInfo: null,
    })),
    useWsBlock: vi.fn(() => null),
    WsBlockContext: MockWsBlockContext,
}));

// Global mock for useGasParameters — used by NetworkStatusProvider.
vi.mock('../hooks/useGasParameters.ts', () => ({
    useGasParameters: vi.fn(() => ({
        gasParams: null,
        loading: false,
        error: null,
        refetch: vi.fn(),
    })),
}));

// Global mock for useMempoolInfo — used by NetworkStatusProvider.
vi.mock('../hooks/useMempoolInfo.ts', () => ({
    useMempoolInfo: vi.fn(() => ({
        mempoolInfo: null,
        loading: false,
        error: null,
        refetch: vi.fn(),
    })),
}));

// Global mock for useNextBlockEstimate — used by NetworkStatusProvider.
vi.mock('../hooks/useNextBlockEstimate.ts', () => ({
    useNextBlockEstimate: vi.fn(() => ({
        secondsSinceLastBlock: 0,
        estimatedSecondsToNext: 600,
        progressPercent: 0,
        lastBlockTimestamp: null,
    })),
}));

// Global mock for networkStatusDefs — the context creation.
vi.mock('../contexts/networkStatusDefs.ts', () => ({
    NetworkStatusContext: createContext(null),
}));

// Global mock for NetworkStatusProvider — passthrough wrapper.
vi.mock('../contexts/NetworkStatusContext.tsx', () => ({
    NetworkStatusProvider: ({ children }: { children: unknown }) => children,
}));

// Global mock for useNetworkStatus — default values.
vi.mock('../hooks/useNetworkStatus.ts', () => ({
    useNetworkStatus: vi.fn(() => ({
        gasParams: null,
        btcFees: null,
        mempoolInfo: null,
        secondsSinceLastBlock: 0,
        estimatedSecondsToNext: 600,
        progressPercent: 0,
        lastBlockTimestamp: null,
        wsConnected: false,
        blockNumber: null,
    })),
}));

// Global mock for NetworkStatusBar — used by Layout.
vi.mock('../components/NetworkStatusBar.tsx', () => ({
    NetworkStatusBar: () => null,
}));
