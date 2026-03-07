/**
 * PoolDetailPage — single scrollable per-market detail view.
 *
 * Sections: buy-side cards, options chain/table, write-side strategy cards,
 * how-it-works, market stats, price chart.
 *
 * Route: /markets/:address
 */
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useWsBlock } from '../hooks/useWebSocketProvider.ts';
import { useFallbackProvider } from '../hooks/useFallbackProvider.ts';
import { usePool } from '../hooks/usePool.ts';
import { useBlockTracker } from '../hooks/useBlockTracker.ts';
import { usePriceRatio } from '../hooks/usePriceRatio.ts';
import { usePriceCandles } from '../hooks/usePriceCandles.ts';
import { useTransactionContext } from '../hooks/useTransactionContext.ts';
import { PoolHeaderBar } from '../components/PoolHeaderBar.tsx';
import { OptionsTable } from '../components/OptionsTable.tsx';
import { ErrorBoundary } from '../components/ErrorBoundary.tsx';
import { OptionsChain } from '../components/OptionsChain.tsx';
import { PriceChart } from '../components/PriceChart.tsx';
import { WriteOptionPanel } from '../components/WriteOptionPanel.tsx';
import type { WriteOptionInitialValues } from '../components/WriteOptionPanel.tsx';
import { BuyOptionModal } from '../components/BuyOptionModal.tsx';
import { CancelModal } from '../components/CancelModal.tsx';
import { ExerciseModal } from '../components/ExerciseModal.tsx';
import { SettleModal } from '../components/SettleModal.tsx';
import { StrategySection } from '../components/StrategySection.tsx';
import { MarketStrategyCards } from '../components/MarketStrategyCards.tsx';
import type { StrategyFilter } from '../utils/strategyMath.ts';
import { YieldOverview } from '../components/YieldOverview.tsx';
import { WriterHowItWorks } from '../components/WriterHowItWorks.tsx';
import { currentNetwork, findPoolConfigByAddress, getNativeSwapAddress, getPricePairKey, getPoolType } from '../config/index.ts';
import { PoolsSkeleton } from '../components/LoadingSkeletons.tsx';
import { NotificationBanner } from '../components/NotificationBanner.tsx';
import { useNotifications } from '../hooks/useNotifications.ts';
import { useStatusChangeDetector, describeChange } from '../hooks/useStatusChangeDetector.ts';
import { OnboardingOverlay } from '../components/OnboardingOverlay.tsx';
import { useOnboardingState } from '../hooks/useOnboardingState.ts';
import { OptionStatus } from '../services/types.ts';
import type { OptionData } from '../services/types.ts';
import type { ResumeRequest } from '../contexts/flowDefs.ts';

type OptionsFilter = 'all' | 'buy' | 'mine';

export function PoolDetailPage() {
    const { address: poolAddress } = useParams<{ address: string }>();
    const wsBlockInfo = useWsBlock();
    const { walletAddress, address, provider, network } = useWalletConnect();
    const readProvider = useFallbackProvider();
    const walletConnected = provider !== null && provider !== undefined;
    const { showOnboarding, completeOnboarding } = useOnboardingState(walletConnected);

    const { poolInfo, options, loading, error, refetch: refetchPool } =
        usePool(poolAddress ?? null, readProvider);

    const { currentBlock } = useBlockTracker(readProvider, wsBlockInfo?.blockNumber);

    // Derive pool metadata from config (match by pool bech32 address, not token hex)
    const poolConfig = useMemo(() => {
        if (poolAddress) return findPoolConfigByAddress(poolAddress);
        return null;
    }, [poolAddress]);
    const underlyingSymbol = poolConfig?.underlying.symbol ?? 'MOTO';
    const premiumSymbol = poolConfig?.premium.symbol ?? 'PILL';
    const poolType = getPoolType(poolConfig);
    const pairKey = poolConfig ? getPricePairKey(poolConfig) : `${underlyingSymbol}_${premiumSymbol}`;


    // NativeSwap address from pool config (not env var)
    const nativeSwapAddress = useMemo(() => getNativeSwapAddress(poolConfig), [poolConfig]);

    const { motoPillRatio, lastUpdated: priceLastUpdated } = usePriceRatio(
        pairKey,
        nativeSwapAddress,
        poolInfo?.underlying ?? null,
        poolInfo?.premiumToken ?? null,
        readProvider,
        network ?? null,
    );

    type ViewMode = 'chain' | 'list';
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        try { return (sessionStorage.getItem('frogop_options_view') as ViewMode) || 'chain'; } catch { return 'chain'; }
    });
    const handleViewMode = (mode: ViewMode) => {
        setViewMode(mode);
        try { sessionStorage.setItem('frogop_options_view', mode); } catch { /* noop */ }
    };

    // Price chart state
    const [chartToken, setChartToken] = useState(pairKey);
    const [chartInterval, setChartInterval] = useState('1d');
    const { candles } = usePriceCandles(chartToken, chartInterval);
    const [chartOpen, setChartOpen] = useState(true);

    // Resume flow routing
    const { transactions, resumeRequest, clearResumeRequest, abandonFlow: abandonFlowById } = useTransactionContext();
    const confirmedCountRef = useRef(0);
    useEffect(() => {
        if (!poolAddress) return;
        const confirmed = transactions.filter(
            (tx) => tx.poolAddress === poolAddress && tx.status === 'confirmed',
        ).length;
        if (confirmed > confirmedCountRef.current) {
            refetchPool();
        }
        confirmedCountRef.current = confirmed;
    }, [transactions, poolAddress, refetchPool]);

    // address.toString() = 0x-prefixed MLDSA hash; used for action visibility
    const walletHex = address ? address.toString() : null;

    // Strategy filter for chain highlighting
    const [strategyFilter, setStrategyFilter] = useState<StrategyFilter | null>(null);

    // Options marketplace filter
    const [optionsFilter, setOptionsFilter] = useState<OptionsFilter>('all');
    const filteredOptions = useMemo(() => {
        if (optionsFilter === 'buy') {
            return options.filter(o => o.status === OptionStatus.OPEN && o.writer !== walletHex);
        }
        if (optionsFilter === 'mine') {
            return options.filter(o => walletHex !== null && o.writer.toLowerCase() === walletHex.toLowerCase());
        }
        return options;
    }, [options, optionsFilter, walletHex]);

    const [writeOpen, setWriteOpen] = useState(false);
    const [writeInitialValues, setWriteInitialValues] = useState<WriteOptionInitialValues | undefined>(undefined);
    const [writeStrategyLabel, setWriteStrategyLabel] = useState<string | undefined>();
    const [writeFlowInstanceId, setWriteFlowInstanceId] = useState<string | undefined>();
    const [buyStrategyLabel, setBuyStrategyLabel] = useState<string | undefined>();
    const [buyTarget, setBuyTarget] = useState<OptionData | null>(null);
    const [cancelTarget, setCancelTarget] = useState<OptionData | null>(null);
    const [exerciseTarget, setExerciseTarget] = useState<OptionData | null>(null);
    const [settleTarget, setSettleTarget] = useState<OptionData | null>(null);

    // Close all action modals
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
    }, []);

    // Apply a resume request
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
        if (!resumeRequest || !poolAddress) return;
        if (resumeRequest.poolAddress !== poolAddress) return;
        clearResumeRequest();
        // eslint-disable-next-line react-hooks/set-state-in-effect -- resume routing: one-shot signal from TransactionContext
        applyResume(resumeRequest);
    }, [resumeRequest, poolAddress, clearResumeRequest, applyResume]);

    // Status change notifications
    const { notifications, addNotification, dismissNotification, requestPermission } = useNotifications();
    useStatusChangeDetector(options, useCallback((changes) => {
        for (const change of changes) {
            addNotification(describeChange(change, walletHex), 'info');
        }
    }, [addNotification, walletHex]));
    useEffect(() => {
        if (walletConnected) requestPermission();
    }, [walletConnected, requestPermission]);


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

    // Strategy template handler (from StrategySection)
    function handleWriteOption(values: WriteOptionInitialValues, strategyLabel?: string) {
        if (!walletConnected) return;
        setWriteStrategyLabel(strategyLabel);
        setWriteInitialValues(values);
        setWriteOpen(true);
    }


    // Pool not found
    if (!poolAddress) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-16 text-center">
                <p className="text-terminal-text-muted font-mono text-sm">Pool not found.</p>
                <Link to="/markets" className="btn-secondary px-4 py-2 text-sm rounded inline-block mt-4">
                    Back to Markets
                </Link>
            </div>
        );
    }

    if (loading) return <PoolsSkeleton />;

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <NotificationBanner notifications={notifications} onDismiss={dismissNotification} />

            {/* Breadcrumb */}
            <nav className="text-xs font-mono text-terminal-text-muted flex items-center gap-1 mb-4" data-testid="breadcrumb">
                <Link to="/markets" className="hover:text-terminal-text-primary transition-colors">Markets</Link>
                <span>/</span>
                <span className="text-terminal-text-primary">
                    {underlyingSymbol}/{premiumSymbol}
                </span>
            </nav>

            {/* Error state */}
            {error && (
                <div className="bg-terminal-bg-elevated border border-rose-700 rounded-xl p-6 text-center">
                    <p className="text-rose-400 font-mono text-sm mb-3">{error}</p>
                    <button onClick={refetchPool} className="btn-secondary px-4 py-2 text-sm rounded">
                        Retry
                    </button>
                </div>
            )}

            {/* Main content */}
            {!error && poolInfo && (
                <div className="space-y-4">
                    {/* Compact header bar */}
                    <PoolHeaderBar
                        poolInfo={poolInfo}
                        poolAddress={poolAddress}
                        motoPillRatio={motoPillRatio}
                        priceLastUpdated={priceLastUpdated}
                        underlyingSymbol={underlyingSymbol}
                        premiumSymbol={premiumSymbol}
                        poolType={poolType}
                    />

                    {/* -- What do you want to do? -- */}
                    <section id="buy-strategies">
                        <h3 className="text-sm font-bold text-terminal-text-primary font-mono mb-2">What do you want to do?</h3>
                        <p className="text-xs text-terminal-text-muted font-mono mb-3" data-testid="market-value-prop">
                            Capped risk &middot; Leveraged exposure &middot; No liquidation
                        </p>
                        <MarketStrategyCards
                            options={options}
                            spotPrice={motoPillRatio}
                            underlyingSymbol={underlyingSymbol}
                            premiumSymbol={premiumSymbol}
                            onBuyOption={(opt, label) => {
                                if (!walletConnected) return;
                                setBuyStrategyLabel(label);
                                setBuyTarget(opt);
                            }}
                            onStrategyFilter={setStrategyFilter}
                            activeFilter={strategyFilter}
                        />
                    </section>

                    {/* -- Options Available -- */}
                    <section id="options-available">
                        <h3 className="text-sm font-bold text-terminal-text-primary font-mono mb-2">Options Available</h3>

                        {/* Filter tabs */}
                        <div className="flex items-center gap-2 mb-3" data-testid="options-filter-tabs">
                            {([
                                { key: 'all' as const, label: 'All Options' },
                                { key: 'buy' as const, label: 'Available to Buy' },
                                { key: 'mine' as const, label: 'My Listings' },
                            ]).map(({ key, label }) => (
                                <button
                                    key={key}
                                    onClick={() => setOptionsFilter(key)}
                                    className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                                        optionsFilter === key
                                            ? 'bg-accent text-terminal-bg-primary'
                                            : 'text-terminal-text-muted border border-terminal-border-subtle hover:text-terminal-text-primary'
                                    }`}
                                    data-testid={`options-filter-${key}`}
                                >
                                    {label}
                                </button>
                            ))}

                            {/* View toggle */}
                            <div className="ml-auto flex items-center gap-1">
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
                        </div>

                        {/* Options Chain / Table */}
                        {viewMode === 'chain' ? (
                            <OptionsChain
                                options={filteredOptions}
                                walletHex={walletHex}
                                walletConnected={walletConnected}
                                currentBlock={currentBlock ?? undefined}
                                motoPillRatio={motoPillRatio}
                                poolAddress={poolAddress}
                                buyFeeBps={poolInfo.buyFeeBps}
                                underlyingSymbol={underlyingSymbol}
                                premiumSymbol={premiumSymbol}
                                onBuy={handleBuy}
                                strategyFilter={strategyFilter}
                                showListingStatus={optionsFilter === 'mine'}
                            />
                        ) : (
                            <ErrorBoundary inline label="Options Table">
                                <OptionsTable
                                    options={filteredOptions}
                                    walletHex={walletHex}
                                    walletConnected={walletConnected}
                                    currentBlock={currentBlock ?? undefined}
                                    gracePeriodBlocks={poolInfo.gracePeriodBlocks}
                                    motoPillRatio={motoPillRatio}
                                    poolAddress={poolAddress}
                                    underlyingSymbol={underlyingSymbol}
                                    premiumSymbol={premiumSymbol}
                                    onBuy={handleBuy}
                                    onCancel={handleCancel}
                                    onExercise={handleExercise}
                                    onSettle={handleSettle}
                                    strategyFilter={strategyFilter}
                                    showListingStatus={optionsFilter === 'mine'}
                                />
                            </ErrorBoundary>
                        )}
                    </section>

                    {/* -- Create & Earn -- */}
                    <section id="create-earn">
                        <h3 className="text-sm font-bold text-terminal-text-primary font-mono mb-2">Create &amp; Earn</h3>
                        <StrategySection
                            poolInfo={poolInfo}
                            poolAddress={poolAddress}
                            options={options}
                            motoPillRatio={motoPillRatio}
                            walletConnected={walletConnected}
                            walletAddress={walletAddress}
                            address={address}
                            provider={provider}
                            network={network}
                            underlyingSymbol={underlyingSymbol}
                            premiumSymbol={premiumSymbol}
                            onWriteOption={handleWriteOption}
                            onRefetch={refetchPool}
                        />
                    </section>

                    {/* -- How It Works -- */}
                    <WriterHowItWorks />

                    {/* -- Market Stats -- */}
                    <section id="market-stats">
                        <YieldOverview
                            options={options}
                            motoPillRatio={motoPillRatio}
                            walletHex={walletHex}
                            premiumSymbol={premiumSymbol}
                        />
                    </section>

                    {/* -- Price Chart -- */}
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
                            <ErrorBoundary inline label="Price Chart">
                                <PriceChart
                                    candles={candles}
                                    token={chartToken}
                                    interval={chartInterval}
                                    onIntervalChange={setChartInterval}
                                    onTokenChange={setChartToken}
                                    underlyingSymbol={underlyingSymbol}
                                    premiumSymbol={premiumSymbol}
                                />
                            </ErrorBoundary>
                        )}
                    </div>
                </div>
            )}

            {/* Network + source badge */}
            {currentNetwork !== 'mainnet' && (
                <div className="mt-6 flex items-center gap-2 text-xs text-terminal-text-muted font-mono">
                    <span className="w-2 h-2 rounded-full bg-yellow-400" />
                    Network: {currentNetwork.charAt(0).toUpperCase() + currentNetwork.slice(1)}
                </div>
            )}

            {/* Buy Option modal */}
            {buyTarget && poolInfo && provider && network && (
                <BuyOptionModal
                    option={buyTarget}
                    poolInfo={poolInfo}
                    poolAddress={poolAddress}
                    walletAddress={walletAddress}
                    address={address}
                    provider={provider}
                    network={network}
                    motoPillRatio={motoPillRatio}
                    currentBlock={currentBlock ?? undefined}
                    strategyLabel={buyStrategyLabel}
                    underlyingSymbol={underlyingSymbol}
                    premiumSymbol={premiumSymbol}
                    poolType={poolType}
                    onClose={() => { setBuyTarget(null); setBuyStrategyLabel(undefined); }}
                    onSuccess={() => {
                        setBuyTarget(null);
                        setBuyStrategyLabel(undefined);
                        refetchPool();
                    }}
                />
            )}

            {/* Cancel Option modal */}
            {cancelTarget && poolInfo && provider && network && (
                <CancelModal
                    option={cancelTarget}
                    poolInfo={poolInfo}
                    poolAddress={poolAddress}
                    walletAddress={walletAddress}
                    address={address}
                    provider={provider}
                    network={network}
                    underlyingSymbol={underlyingSymbol}
                    premiumSymbol={premiumSymbol}
                    poolType={poolType}
                    onClose={() => setCancelTarget(null)}
                    onSuccess={() => {
                        setCancelTarget(null);
                        refetchPool();
                    }}
                />
            )}

            {/* Exercise Option modal */}
            {exerciseTarget && poolInfo && provider && network && (
                <ExerciseModal
                    option={exerciseTarget}
                    poolInfo={poolInfo}
                    poolAddress={poolAddress}
                    walletAddress={walletAddress}
                    address={address}
                    provider={provider}
                    network={network}
                    motoPillRatio={motoPillRatio}
                    underlyingSymbol={underlyingSymbol}
                    premiumSymbol={premiumSymbol}
                    poolType={poolType}
                    onClose={() => setExerciseTarget(null)}
                    onSuccess={() => {
                        setExerciseTarget(null);
                        refetchPool();
                    }}
                />
            )}

            {/* Settle Option modal */}
            {settleTarget && provider && network && (
                <SettleModal
                    option={settleTarget}
                    poolAddress={poolAddress}
                    walletAddress={walletAddress}
                    address={address}
                    provider={provider}
                    network={network}
                    onClose={() => setSettleTarget(null)}
                    onSuccess={() => {
                        setSettleTarget(null);
                        refetchPool();
                    }}
                    underlyingSymbol={underlyingSymbol}
                    premiumSymbol={premiumSymbol}
                    poolType={poolType}
                />
            )}

            {/* Write Option slide-in panel */}
            {writeOpen && poolInfo && provider && network && (
                <WriteOptionPanel
                    poolAddress={poolAddress}
                    poolInfo={poolInfo}
                    walletAddress={walletAddress}
                    walletHex={walletHex}
                    address={address}
                    provider={provider}
                    network={network}
                    motoPillRatio={motoPillRatio}
                    underlyingSymbol={underlyingSymbol}
                    premiumSymbol={premiumSymbol}
                    poolType={poolType}
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

            {/* Connect wallet banner */}
            {!walletConnected && (
                <div className="mt-4 bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-4 text-center">
                    <p className="text-terminal-text-muted font-mono text-sm">
                        Connect your wallet to write, buy, exercise, or cancel options.
                    </p>
                </div>
            )}

            {showOnboarding && <OnboardingOverlay onComplete={completeOnboarding} />}
        </div>
    );
}
