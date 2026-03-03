/**
 * PoolsPage — on-chain pool view with two-tab layout:
 *   "Buy Options" — options chain/table with protective put card
 *   "Earn by Writing" — yield overview, strategy cards, how-it-works
 *
 * All modal trigger chains and resume flow logic are preserved unchanged.
 */
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useWsBlock } from '../hooks/useWebSocketProvider.ts';
import { useFallbackProvider } from '../hooks/useFallbackProvider.ts';
import { useDiscoverPools } from '../hooks/useDiscoverPools.ts';
import { usePool } from '../hooks/usePool.ts';
import { useBlockTracker } from '../hooks/useBlockTracker.ts';
import { usePriceRatio } from '../hooks/usePriceRatio.ts';
import { usePriceCandles } from '../hooks/usePriceCandles.ts';
import { useTransactionContext } from '../hooks/useTransactionContext.ts';
import { PoolHeaderBar } from '../components/PoolHeaderBar.tsx';
import { OptionsTable } from '../components/OptionsTable.tsx';
import { OptionsChain } from '../components/OptionsChain.tsx';
import { PriceChart } from '../components/PriceChart.tsx';
import { WriteOptionPanel } from '../components/WriteOptionPanel.tsx';
import type { WriteOptionInitialValues } from '../components/WriteOptionPanel.tsx';
import { BuyOptionModal } from '../components/BuyOptionModal.tsx';
import { CancelModal } from '../components/CancelModal.tsx';
import { ExerciseModal } from '../components/ExerciseModal.tsx';
import { SettleModal } from '../components/SettleModal.tsx';
import { QuickStrategies } from '../components/QuickStrategies.tsx';
import { YieldOverview } from '../components/YieldOverview.tsx';
import { WriterHowItWorks } from '../components/WriterHowItWorks.tsx';
import { CollarModal } from '../components/CollarModal.tsx';
import { CONTRACT_ADDRESSES, currentNetwork, formatAddress, formatTokenAmount } from '../config/index.ts';
import { PoolsSkeleton } from '../components/LoadingSkeletons.tsx';
import { NotificationBanner } from '../components/NotificationBanner.tsx';
import { useNotifications } from '../hooks/useNotifications.ts';
import { useStatusChangeDetector, describeChange } from '../hooks/useStatusChangeDetector.ts';
import { OnboardingOverlay } from '../components/OnboardingOverlay.tsx';
import { useOnboardingState } from '../hooks/useOnboardingState.ts';
import { findBestProtectivePut } from '../utils/strategyMath.js';
import type { OptionData } from '../services/types.ts';
import type { ResumeRequest } from '../contexts/flowDefs.ts';

type PoolTab = 'buy' | 'write';

const NATIVESWAP_ADDRESS = import.meta.env.VITE_NATIVESWAP_ADDRESS || '';

export function PoolsPage() {
    const wsBlockInfo = useWsBlock();
    const { walletAddress, address, provider, network } = useWalletConnect();
    const readProvider = useFallbackProvider();
    const walletConnected = provider !== null && provider !== undefined;
    const { showOnboarding, completeOnboarding } = useOnboardingState(walletConnected);
    const {
        pools,
        loading: discoveryLoading,
        error: discoveryError,
        source,
        refetch: refetchPools,
    } = useDiscoverPools(readProvider);

    const [userSelectedPool, setUserSelectedPool] = useState<string | null>(() => {
        try { return sessionStorage.getItem('frogop_selected_pool'); } catch { return null; }
    });

    // Tab state — persisted to sessionStorage
    const [activeTab, setActiveTab] = useState<PoolTab>(() => {
        try { return (sessionStorage.getItem('frogop_pool_tab') as PoolTab) || 'buy'; } catch { return 'buy'; }
    });
    const handleTabChange = (tab: PoolTab) => {
        setActiveTab(tab);
        try { sessionStorage.setItem('frogop_pool_tab', tab); } catch { /* noop */ }
    };

    type ViewMode = 'chain' | 'list';
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        try { return (sessionStorage.getItem('frogop_options_view') as ViewMode) || 'chain'; } catch { return 'chain'; }
    });
    const handleViewMode = (mode: ViewMode) => {
        setViewMode(mode);
        try { sessionStorage.setItem('frogop_options_view', mode); } catch { /* noop */ }
    };

    // Derive effective selected pool: user choice if valid, else first pool
    const selectedPoolAddr = useMemo(() => {
        if (pools.length === 0) return null;
        if (userSelectedPool && pools.some((p) => p.address === userSelectedPool)) {
            return userSelectedPool;
        }
        return pools[0].address;
    }, [pools, userSelectedPool]);

    // Persist pool selection to sessionStorage
    useEffect(() => {
        if (selectedPoolAddr) {
            try { sessionStorage.setItem('frogop_selected_pool', selectedPoolAddr); } catch { /* noop */ }
        }
    }, [selectedPoolAddr]);

    const { poolInfo, options, loading: poolLoading, error: poolError, refetch: refetchPool } =
        usePool(selectedPoolAddr, readProvider);

    const { currentBlock } = useBlockTracker(readProvider, wsBlockInfo?.blockNumber);

    const { motoPillRatio, lastUpdated: priceLastUpdated } = usePriceRatio(
        NATIVESWAP_ADDRESS || null,
        poolInfo?.underlying ?? null,
        poolInfo?.premiumToken ?? null,
        readProvider,
        network ?? null,
    );

    // Price chart state
    const [chartToken, setChartToken] = useState('MOTO_PILL');
    const [chartInterval, setChartInterval] = useState('1d');
    const { candles } = usePriceCandles(chartToken, chartInterval);
    const [chartOpen, setChartOpen] = useState(false);

    // Resume flow routing
    const { transactions, resumeRequest, clearResumeRequest, abandonFlow: abandonFlowById } = useTransactionContext();
    const confirmedCountRef = useRef(0);
    useEffect(() => {
        if (!selectedPoolAddr) return;
        const confirmed = transactions.filter(
            (tx) => tx.poolAddress === selectedPoolAddr && tx.status === 'confirmed',
        ).length;
        if (confirmed > confirmedCountRef.current) {
            refetchPool();
        }
        confirmedCountRef.current = confirmed;
    }, [transactions, selectedPoolAddr, refetchPool]);

    const [searchParams, setSearchParams] = useSearchParams();
    const [writeOpen, setWriteOpen] = useState(false);
    const [writeInitialValues, setWriteInitialValues] = useState<WriteOptionInitialValues | undefined>(undefined);
    const [writeStrategyLabel, setWriteStrategyLabel] = useState<string | undefined>();
    const [writeFlowInstanceId, setWriteFlowInstanceId] = useState<string | undefined>();
    const [buyStrategyLabel, setBuyStrategyLabel] = useState<string | undefined>();
    const [collarOpen, setCollarOpen] = useState(false);
    // Auto-open CollarModal when navigated with ?openCollar=true
    const openCollarParam = searchParams.get('openCollar');
    const [prevOpenCollarParam, setPrevOpenCollarParam] = useState(openCollarParam);
    if (openCollarParam !== prevOpenCollarParam) {
        setPrevOpenCollarParam(openCollarParam);
        if (openCollarParam === 'true') {
            setCollarOpen(true);
            const next = new URLSearchParams(searchParams);
            next.delete('openCollar');
            setSearchParams(next, { replace: true });
        }
    }

    const [buyTarget, setBuyTarget] = useState<OptionData | null>(null);
    const [cancelTarget, setCancelTarget] = useState<OptionData | null>(null);
    const [exerciseTarget, setExerciseTarget] = useState<OptionData | null>(null);
    const [settleTarget, setSettleTarget] = useState<OptionData | null>(null);

    // Close all action modals — used before opening a resumed flow's modal.
    const closeAllModals = useCallback(() => {
        setWriteOpen(false);
        setWriteInitialValues(undefined);
        setWriteStrategyLabel(undefined);
        setWriteFlowInstanceId(undefined);
        setBuyTarget(null);
        setBuyStrategyLabel(undefined);
        setCancelTarget(null);
        setExerciseTarget(null);
        setSettleTarget(null);
        setCollarOpen(false);
    }, []);

    // Apply a resume request — opens the appropriate modal.
    const applyResume = useCallback((req: ResumeRequest) => {
        closeAllModals();

        if (req.actionType === 'writeOption') {
            const formState = req.formState;
            if (formState) {
                setWriteInitialValues({
                    optionType: formState['optionType'] !== undefined ? Number(formState['optionType']) : undefined,
                    amountStr: formState['amount'],
                    strikeStr: formState['strike'],
                    premiumStr: formState['premium'],
                    selectedDays: formState['days'] !== undefined ? Number(formState['days']) : undefined,
                });
                setWriteFlowInstanceId(formState['flowInstanceId'] ?? undefined);
            }
            setWriteStrategyLabel(req.strategyLabel ?? undefined);
            setWriteOpen(true);
            return;
        }

        if (req.actionType === 'buyOption' && req.optionId) {
            const opt = options.find((o) => o.id.toString() === req.optionId);
            if (opt) {
                setBuyStrategyLabel(req.strategyLabel ?? undefined);
                setBuyTarget(opt);
            } else {
                abandonFlowById(req.flowId);
                alert('Option no longer available. Flow abandoned.');
            }
            return;
        }

        if (req.actionType === 'exercise' && req.optionId) {
            const opt = options.find((o) => o.id.toString() === req.optionId);
            if (opt) {
                setExerciseTarget(opt);
            } else {
                abandonFlowById(req.flowId);
                alert('Option no longer available. Flow abandoned.');
            }
        }
    }, [options, abandonFlowById, closeAllModals]);

    // Handle resume requests from the flow card
    useEffect(() => {
        if (!resumeRequest || !selectedPoolAddr) return;
        if (resumeRequest.poolAddress !== selectedPoolAddr) return;
        clearResumeRequest();
        // eslint-disable-next-line react-hooks/set-state-in-effect -- resume routing: one-shot signal from TransactionContext
        applyResume(resumeRequest);
    }, [resumeRequest, selectedPoolAddr, clearResumeRequest, applyResume]);

    // address.toString() = 0x-prefixed MLDSA hash; used for action visibility
    const walletHex = address ? address.toString() : null;

    // Status change notifications
    const { notifications, addNotification, dismissNotification, requestPermission } = useNotifications();
    useStatusChangeDetector(options, useCallback((changes) => {
        for (const change of changes) {
            addNotification(describeChange(change, walletHex), 'info');
        }
    }, [addNotification, walletHex]));
    // Request browser notification permission on first wallet connect
    useEffect(() => {
        if (walletConnected) requestPermission();
    }, [walletConnected, requestPermission]);

    const loading = discoveryLoading || poolLoading;
    const error = discoveryError || poolError;

    // Protective Put — computed for Buy tab inline card
    const bestProtectivePut = useMemo(() => {
        if (!motoPillRatio || motoPillRatio <= 0) return null;
        return findBestProtectivePut(options, motoPillRatio);
    }, [options, motoPillRatio]);

    function handleRefetch() {
        refetchPools();
        refetchPool();
    }

    function handleBuy(option: OptionData) {
        if (!walletConnected) return;
        setBuyTarget(option);
    }

    function handleCancel(option: OptionData) {
        if (walletConnected) setCancelTarget(option);
    }

    function handleExercise(option: OptionData) {
        if (walletConnected) setExerciseTarget(option);
    }

    function handleSettle(option: OptionData) {
        if (walletConnected) setSettleTarget(option);
    }

    // Strategy template handlers
    function handleCoveredCall(values: WriteOptionInitialValues) {
        if (!walletConnected) return;
        setWriteStrategyLabel('Covered Call');
        setWriteInitialValues(values);
        setWriteOpen(true);
    }

    function handleProtectivePut(option: OptionData) {
        if (!walletConnected) return;
        setBuyStrategyLabel('Protective Put');
        setBuyTarget(option);
    }

    function handleCollarWriteCall(values: WriteOptionInitialValues) {
        setCollarOpen(false);
        setWriteStrategyLabel('Collar: Write CALL');
        setWriteInitialValues(values);
        setWriteOpen(true);
    }

    function handleCollarBuyPut(option: OptionData) {
        setCollarOpen(false);
        setBuyStrategyLabel('Collar: Buy PUT');
        setBuyTarget(option);
    }

    // No pool source configured at all
    if (!CONTRACT_ADDRESSES.factory && !CONTRACT_ADDRESSES.pool) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-16 text-center">
                <p className="text-terminal-text-muted font-mono text-sm">
                    No pool source configured. Set{' '}
                    <code className="neon-orange">VITE_FACTORY_ADDRESS</code> or{' '}
                    <code className="neon-orange">VITE_POOL_ADDRESS</code> in your{' '}
                    <code className="neon-orange">.env</code> file.
                </p>
            </div>
        );
    }

    if (loading) return <PoolsSkeleton />;

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <NotificationBanner notifications={notifications} onDismiss={dismissNotification} />
            {/* Error state */}
            {error && (
                <div className="bg-terminal-bg-elevated border border-rose-700 rounded-xl p-6 text-center">
                    <p className="text-rose-400 font-mono text-sm mb-3">{error}</p>
                    <button onClick={handleRefetch} className="btn-secondary px-4 py-2 text-sm rounded">
                        Retry
                    </button>
                </div>
            )}

            {/* Pool selector when multiple pools */}
            {!error && pools.length > 1 && (
                <div className="mb-4 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-terminal-text-muted font-mono">Pool:</span>
                    {pools.map((p) => (
                        <button
                            key={p.address}
                            data-testid={`pool-selector-${p.address}`}
                            onClick={() => setUserSelectedPool(p.address)}
                            className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                                selectedPoolAddr === p.address
                                    ? 'bg-accent text-terminal-bg-primary'
                                    : 'bg-terminal-bg-elevated text-terminal-text-secondary hover:bg-terminal-bg-secondary'
                            }`}
                        >
                            {formatAddress(p.address)}
                        </button>
                    ))}
                </div>
            )}

            {/* Main content */}
            {!error && poolInfo && selectedPoolAddr && (
                <div className="space-y-4">
                    {/* Compact header bar */}
                    <PoolHeaderBar
                        poolInfo={poolInfo}
                        poolAddress={selectedPoolAddr}
                        motoPillRatio={motoPillRatio}
                        priceLastUpdated={priceLastUpdated}
                    />

                    {/* Tab bar */}
                    <div className="flex gap-0 border-b border-terminal-border-subtle" data-testid="pool-tabs">
                        {(['buy', 'write'] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => handleTabChange(tab)}
                                className={`px-5 py-2.5 text-sm font-mono font-semibold transition-colors border-b-2 ${
                                    activeTab === tab
                                        ? 'text-accent border-accent'
                                        : 'text-terminal-text-muted border-transparent hover:text-terminal-text-primary'
                                }`}
                                data-testid={`tab-${tab}`}
                            >
                                {tab === 'buy' ? 'Buy Options' : 'Earn by Writing'}
                            </button>
                        ))}
                    </div>

                    {/* ============================================ */}
                    {/* BUY TAB                                      */}
                    {/* ============================================ */}
                    {activeTab === 'buy' && (
                        <div className="space-y-4" data-testid="buy-tab-content">
                            {/* Value prop */}
                            <p className="text-xs text-terminal-text-muted font-mono" data-testid="buy-value-prop">
                                Capped risk &middot; Leveraged exposure &middot; No liquidation
                            </p>

                            {/* Collapsible PriceChart */}
                            {candles.length > 0 && (
                                <div>
                                    <button
                                        onClick={() => setChartOpen((v) => !v)}
                                        className="text-xs font-mono text-terminal-text-muted hover:text-terminal-text-primary transition-colors flex items-center gap-1 mb-2"
                                        data-testid="toggle-chart"
                                    >
                                        <span className={`transition-transform ${chartOpen ? 'rotate-90' : ''}`}>&#9654;</span>
                                        Price Chart
                                    </button>
                                    {chartOpen && (
                                        <PriceChart
                                            candles={candles}
                                            token={chartToken}
                                            interval={chartInterval}
                                            onIntervalChange={setChartInterval}
                                            onTokenChange={setChartToken}
                                        />
                                    )}
                                </div>
                            )}

                            {/* View toggle: Chain / List */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-terminal-text-muted font-mono">View:</span>
                                {(['chain', 'list'] as const).map((m) => (
                                    <button
                                        key={m}
                                        onClick={() => handleViewMode(m)}
                                        className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                                            viewMode === m
                                                ? 'bg-accent text-terminal-bg-primary'
                                                : 'text-terminal-text-muted border border-terminal-border-subtle hover:text-terminal-text-primary'
                                        }`}
                                        data-testid={`view-mode-${m}`}
                                    >
                                        {m === 'chain' ? 'Chain' : 'List'}
                                    </button>
                                ))}
                            </div>

                            {/* Options Chain / Table — hero section */}
                            {viewMode === 'chain' ? (
                                <OptionsChain
                                    options={options}
                                    walletHex={walletHex}
                                    walletConnected={walletConnected}
                                    currentBlock={currentBlock ?? undefined}
                                    motoPillRatio={motoPillRatio}
                                    poolAddress={selectedPoolAddr}
                                    buyFeeBps={poolInfo.buyFeeBps}
                                    onBuy={handleBuy}
                                />
                            ) : (
                                <OptionsTable
                                    options={options}
                                    walletHex={walletHex}
                                    walletConnected={walletConnected}
                                    currentBlock={currentBlock ?? undefined}
                                    gracePeriodBlocks={poolInfo.gracePeriodBlocks}
                                    motoPillRatio={motoPillRatio}
                                    poolAddress={selectedPoolAddr}
                                    onBuy={handleBuy}
                                    onCancel={handleCancel}
                                    onExercise={handleExercise}
                                    onSettle={handleSettle}
                                />
                            )}

                            {/* Protective Put card — inline on Buy tab */}
                            <div
                                className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-4"
                                data-testid="protective-put-card"
                            >
                                <h4 className="text-sm font-bold text-terminal-text-primary font-mono mb-1">
                                    Protective Put
                                </h4>
                                <p className="text-xs text-terminal-text-muted font-mono mb-3">
                                    Hedge your MOTO — buy downside protection
                                </p>
                                {bestProtectivePut ? (
                                    <div className="text-xs font-mono space-y-1 mb-3">
                                        <div className="flex justify-between">
                                            <span className="text-terminal-text-muted">Strike</span>
                                            <span className="text-terminal-text-secondary">{formatTokenAmount(bestProtectivePut.strikePrice)} PILL</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-terminal-text-muted">Premium</span>
                                            <span className="text-rose-400">{formatTokenAmount(bestProtectivePut.premium)} PILL</span>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs text-terminal-text-muted font-mono mb-3">
                                        No puts available in the 80-95% range yet.
                                    </p>
                                )}
                                <button
                                    onClick={() => bestProtectivePut && handleProtectivePut(bestProtectivePut)}
                                    disabled={!bestProtectivePut || !walletConnected}
                                    className="btn-secondary px-4 py-2 text-xs font-mono rounded disabled:opacity-50"
                                    data-testid="buy-protective-put-btn"
                                >
                                    {walletConnected ? (bestProtectivePut ? 'Buy Put' : 'No puts available') : 'Connect wallet'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ============================================ */}
                    {/* WRITE TAB                                     */}
                    {/* ============================================ */}
                    {activeTab === 'write' && (
                        <div className="space-y-4" data-testid="write-tab-content">
                            {/* Yield Overview */}
                            <YieldOverview
                                options={options}
                                motoPillRatio={motoPillRatio}
                                walletHex={walletHex}
                            />

                            {/* How It Works explainer */}
                            <WriterHowItWorks />

                            {/* Strategy cards */}
                            <QuickStrategies
                                poolInfo={poolInfo}
                                motoPillRatio={motoPillRatio}
                                motoBal={null}
                                walletConnected={walletConnected}
                                onCoveredCall={handleCoveredCall}
                                onCollar={() => setCollarOpen(true)}
                                onWriteCustom={() => setWriteOpen(true)}
                            />

                            {/* Collapsible PriceChart on Write tab too */}
                            {candles.length > 0 && (
                                <div>
                                    <button
                                        onClick={() => setChartOpen((v) => !v)}
                                        className="text-xs font-mono text-terminal-text-muted hover:text-terminal-text-primary transition-colors flex items-center gap-1 mb-2"
                                    >
                                        <span className={`transition-transform ${chartOpen ? 'rotate-90' : ''}`}>&#9654;</span>
                                        Price Chart
                                    </button>
                                    {chartOpen && (
                                        <PriceChart
                                            candles={candles}
                                            token={chartToken}
                                            interval={chartInterval}
                                            onIntervalChange={setChartInterval}
                                            onTokenChange={setChartToken}
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Network + source badge (hidden on mainnet) */}
            {currentNetwork !== 'mainnet' && (
                <div className="mt-6 flex items-center gap-2 text-xs text-terminal-text-muted font-mono">
                    <span className="w-2 h-2 rounded-full bg-yellow-400" />
                    Network: {currentNetwork.charAt(0).toUpperCase() + currentNetwork.slice(1)}
                    {source && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-terminal-bg-elevated text-terminal-text-muted">
                            source: {source}
                        </span>
                    )}
                </div>
            )}

            {/* Buy Option modal */}
            {buyTarget && poolInfo && selectedPoolAddr && provider && network && (
                <BuyOptionModal
                    option={buyTarget}
                    poolInfo={poolInfo}
                    poolAddress={selectedPoolAddr}
                    walletAddress={walletAddress}
                    address={address}
                    provider={provider}
                    network={network}
                    motoPillRatio={motoPillRatio}
                    currentBlock={currentBlock ?? undefined}
                    strategyLabel={buyStrategyLabel}
                    onClose={() => { setBuyTarget(null); setBuyStrategyLabel(undefined); }}
                    onSuccess={() => {
                        setBuyTarget(null);
                        setBuyStrategyLabel(undefined);
                        refetchPool();
                    }}
                />
            )}

            {/* Cancel Option modal */}
            {cancelTarget && poolInfo && selectedPoolAddr && provider && network && (
                <CancelModal
                    option={cancelTarget}
                    poolInfo={poolInfo}
                    poolAddress={selectedPoolAddr}
                    walletAddress={walletAddress}
                    address={address}
                    provider={provider}
                    network={network}
                    onClose={() => setCancelTarget(null)}
                    onSuccess={() => {
                        setCancelTarget(null);
                        refetchPool();
                    }}
                />
            )}

            {/* Exercise Option modal */}
            {exerciseTarget && poolInfo && selectedPoolAddr && provider && network && (
                <ExerciseModal
                    option={exerciseTarget}
                    poolInfo={poolInfo}
                    poolAddress={selectedPoolAddr}
                    walletAddress={walletAddress}
                    address={address}
                    provider={provider}
                    network={network}
                    motoPillRatio={motoPillRatio}
                    onClose={() => setExerciseTarget(null)}
                    onSuccess={() => {
                        setExerciseTarget(null);
                        refetchPool();
                    }}
                />
            )}

            {/* Settle Option modal */}
            {settleTarget && selectedPoolAddr && provider && network && (
                <SettleModal
                    option={settleTarget}
                    poolAddress={selectedPoolAddr}
                    walletAddress={walletAddress}
                    address={address}
                    provider={provider}
                    network={network}
                    onClose={() => setSettleTarget(null)}
                    onSuccess={() => {
                        setSettleTarget(null);
                        refetchPool();
                    }}
                />
            )}

            {/* Write Option slide-in panel */}
            {writeOpen && poolInfo && selectedPoolAddr && provider && network && (
                <WriteOptionPanel
                    poolAddress={selectedPoolAddr}
                    poolInfo={poolInfo}
                    walletAddress={walletAddress}
                    walletHex={walletHex}
                    address={address}
                    provider={provider}
                    network={network}
                    motoPillRatio={motoPillRatio}
                    initialValues={writeInitialValues}
                    strategyLabel={writeStrategyLabel}
                    flowInstanceId={writeFlowInstanceId}
                    onClose={() => {
                        setWriteOpen(false);
                        setWriteInitialValues(undefined);
                        setWriteStrategyLabel(undefined);
                        setWriteFlowInstanceId(undefined);
                    }}
                    onSuccess={() => {
                        setWriteOpen(false);
                        setWriteInitialValues(undefined);
                        setWriteStrategyLabel(undefined);
                        setWriteFlowInstanceId(undefined);
                        refetchPool();
                    }}
                />
            )}

            {/* Collar Strategy modal */}
            {collarOpen && poolInfo && (
                <CollarModal
                    poolInfo={poolInfo}
                    options={options}
                    motoPillRatio={motoPillRatio}
                    motoBal={null}
                    walletAddress={walletAddress}
                    onWriteCall={handleCollarWriteCall}
                    onBuyPut={handleCollarBuyPut}
                    onClose={() => setCollarOpen(false)}
                />
            )}

            {/* Connect wallet banner when not connected */}
            {!walletConnected && (
                <div className="mt-4 bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-4 text-center">
                    <p className="text-terminal-text-muted font-mono text-sm">
                        Connect your wallet to write, buy, exercise, or cancel options.
                    </p>
                </div>
            )}

            {/* Onboarding overlay for first-time users */}
            {showOnboarding && <OnboardingOverlay onComplete={completeOnboarding} />}
        </div>
    );
}
