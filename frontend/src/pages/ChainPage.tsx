/**
 * ChainPage — multi-market option chain with full action support.
 *
 * Route: /chain?market=X
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
import { useTransactionContext } from '../hooks/useTransactionContext.ts';
import { useNotifications } from '../hooks/useNotifications.ts';
import { useStatusChangeDetector, describeChange } from '../hooks/useStatusChangeDetector.ts';
import { ChainMarketTabs } from '../components/ChainMarketTabs.tsx';
import { PoolHeaderBar } from '../components/PoolHeaderBar.tsx';
import { OptionsChain } from '../components/OptionsChain.tsx';
import { OptionsTable } from '../components/OptionsTable.tsx';
import { ErrorBoundary } from '../components/ErrorBoundary.tsx';
import { WriteOptionPanel } from '../components/WriteOptionPanel.tsx';
import type { WriteOptionInitialValues } from '../components/WriteOptionPanel.tsx';
import { BuyOptionModal } from '../components/BuyOptionModal.tsx';
import { CancelModal } from '../components/CancelModal.tsx';
import { ExerciseModal } from '../components/ExerciseModal.tsx';
import { SettleModal } from '../components/SettleModal.tsx';
import { NotificationBanner } from '../components/NotificationBanner.tsx';
import { PoolsSkeleton } from '../components/LoadingSkeletons.tsx';
import type { ResumeRequest } from '../contexts/flowDefs.ts';
import type { OptionData } from '../services/types.ts';
import { OptionStatus } from '../services/types.ts';
import {
    findPoolConfigByAddress,
    getPoolType,
    getPricePairKey,
    getNativeSwapAddress,
    currentNetwork,
} from '../config/index.ts';

type ViewMode = 'chain' | 'list';
type OptionsFilter = 'all' | 'buy' | 'mine';

export function ChainPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const marketParam = searchParams.get('market');

    const { walletAddress, address, provider, network } = useWalletConnect();
    const readProvider = useFallbackProvider();
    const wsBlockInfo = useWsBlock();
    const walletConnected = !!provider;
    const walletHex = address ? address.toString() : null;

    // Pool discovery
    const { pools, loading: discoveryLoading } = useDiscoverPools(readProvider);

    // Auto-select first pool if no market param
    const selectedAddr = marketParam || (pools.length > 0 ? pools[0].address : null);

    // Selected pool data
    const { poolInfo, options, loading: poolLoading, error, refetch: refetchPool } =
        usePool(selectedAddr, readProvider);

    const { currentBlock } = useBlockTracker(readProvider, wsBlockInfo?.blockNumber);

    // Pool config
    const poolConfig = useMemo(
        () => selectedAddr ? findPoolConfigByAddress(selectedAddr) : null,
        [selectedAddr],
    );
    const underlyingSymbol = poolConfig?.underlying.symbol ?? 'MOTO';
    const premiumSymbol = poolConfig?.premium.symbol ?? 'PILL';
    const poolType = getPoolType(poolConfig);
    const pairKey = poolConfig ? getPricePairKey(poolConfig) : `${underlyingSymbol}_${premiumSymbol}`;
    const nativeSwapAddress = useMemo(() => getNativeSwapAddress(poolConfig), [poolConfig]);

    const { motoPillRatio, lastUpdated: priceLastUpdated } = usePriceRatio(
        pairKey,
        nativeSwapAddress,
        poolInfo?.underlying ?? null,
        poolInfo?.premiumToken ?? null,
        readProvider,
        network ?? null,
    );

    // View mode
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        try { return (sessionStorage.getItem('frogop_chain_view') as ViewMode) || 'chain'; } catch { return 'chain'; }
    });
    const handleViewMode = (mode: ViewMode) => {
        setViewMode(mode);
        try { sessionStorage.setItem('frogop_chain_view', mode); } catch { /* noop */ }
    };

    // Options filter
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

    // Modal state
    const [writeOpen, setWriteOpen] = useState(false);
    const [writeInitialValues, setWriteInitialValues] = useState<WriteOptionInitialValues | undefined>();
    const [writeStrategyLabel, setWriteStrategyLabel] = useState<string | undefined>();
    const [writeFlowInstanceId, setWriteFlowInstanceId] = useState<string | undefined>();
    const [buyTarget, setBuyTarget] = useState<OptionData | null>(null);
    const [buyStrategyLabel, setBuyStrategyLabel] = useState<string | undefined>();
    const [cancelTarget, setCancelTarget] = useState<OptionData | null>(null);
    const [exerciseTarget, setExerciseTarget] = useState<OptionData | null>(null);
    const [settleTarget, setSettleTarget] = useState<OptionData | null>(null);

    // Auto-refetch on confirmed TX + resume flow routing
    const { transactions, resumeRequest, clearResumeRequest, abandonFlow: abandonFlowById } = useTransactionContext();
    const confirmedCountRef = useRef(0);
    useEffect(() => {
        if (!selectedAddr) return;
        const confirmed = transactions.filter(
            (tx) => tx.poolAddress === selectedAddr && tx.status === 'confirmed',
        ).length;
        if (confirmed > confirmedCountRef.current) refetchPool();
        confirmedCountRef.current = confirmed;
    }, [transactions, selectedAddr, refetchPool]);

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

    // Apply a resume request — open the correct modal with saved form state
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
            }
            return;
        }

        if (req.actionType === 'exercise' && req.optionId) {
            const opt = options.find((o) => o.id.toString() === req.optionId);
            if (opt) {
                setExerciseTarget(opt);
            } else {
                abandonFlowById(req.flowId);
            }
        }
    }, [options, abandonFlowById, closeAllModals]);

    // Handle resume requests from the Pill flow card
    useEffect(() => {
        if (!resumeRequest || !selectedAddr) return;
        if (resumeRequest.poolAddress !== selectedAddr) return;
        clearResumeRequest();
        applyResume(resumeRequest);
    }, [resumeRequest, selectedAddr, clearResumeRequest, applyResume]);

    // Notifications
    const { notifications, addNotification, dismissNotification, requestPermission } = useNotifications();
    useStatusChangeDetector(options, useCallback((changes) => {
        for (const change of changes) {
            addNotification(describeChange(change, walletHex), 'info');
        }
    }, [addNotification, walletHex]));
    useEffect(() => {
        if (walletConnected) requestPermission();
    }, [walletConnected, requestPermission]);

    // Handlers
    function handleMarketSelect(addr: string) {
        setSearchParams({ market: addr });
    }

    function handleBuy(option: OptionData) {
        if (walletConnected) setBuyTarget(option);
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

    function handleWrite(strikePrice: bigint, optionType: number) {
        if (!walletConnected) return;
        const values: WriteOptionInitialValues = {
            optionType,
        };
        if (strikePrice > 0n) {
            // Convert bigint (18 decimals) to display string
            const whole = strikePrice / (10n ** 18n);
            const frac = strikePrice % (10n ** 18n);
            const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '');
            values.strikeStr = fracStr ? `${whole}.${fracStr}` : whole.toString();
        }
        setWriteInitialValues(values);
        setWriteOpen(true);
    }

    // Loading
    if (discoveryLoading) return <PoolsSkeleton />;

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <NotificationBanner notifications={notifications} onDismiss={dismissNotification} />

            <h1 className="text-lg font-bold text-terminal-text-primary font-mono mb-4">Option Chain</h1>

            {/* Market tabs */}
            <ChainMarketTabs
                pools={pools}
                selected={selectedAddr}
                onSelect={handleMarketSelect}
            />

            {/* Pool content */}
            {poolLoading && <PoolsSkeleton />}

            {error && (
                <div className="bg-terminal-bg-elevated border border-rose-700 rounded-xl p-6 text-center">
                    <p className="text-rose-400 font-mono text-sm mb-3">{error}</p>
                    <button onClick={refetchPool} className="btn-secondary px-4 py-2 text-sm rounded">
                        Retry
                    </button>
                </div>
            )}

            {!error && !poolLoading && poolInfo && selectedAddr && (
                <div className="space-y-4">
                    <PoolHeaderBar
                        poolInfo={poolInfo}
                        poolAddress={selectedAddr}
                        motoPillRatio={motoPillRatio}
                        priceLastUpdated={priceLastUpdated}
                        underlyingSymbol={underlyingSymbol}
                        premiumSymbol={premiumSymbol}
                        poolType={poolType}
                    />

                    {/* Filter + view toggle */}
                    <div className="flex items-center gap-2 flex-wrap" data-testid="chain-filter-bar">
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
                                data-testid={`chain-filter-${key}`}
                            >
                                {label}
                            </button>
                        ))}
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
                                    data-testid={`chain-view-${m}`}
                                >
                                    {m === 'chain' ? 'Chain' : 'List'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Chain / List view */}
                    {viewMode === 'chain' ? (
                        <OptionsChain
                            options={filteredOptions}
                            walletHex={walletHex}
                            walletConnected={walletConnected}
                            currentBlock={currentBlock ?? undefined}
                            motoPillRatio={motoPillRatio}
                            poolAddress={selectedAddr}
                            buyFeeBps={poolInfo.buyFeeBps}
                            underlyingSymbol={underlyingSymbol}
                            premiumSymbol={premiumSymbol}
                            onBuy={handleBuy}
                            onWrite={handleWrite}
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
                                poolAddress={selectedAddr}
                                underlyingSymbol={underlyingSymbol}
                                premiumSymbol={premiumSymbol}
                                onBuy={handleBuy}
                                onCancel={handleCancel}
                                onExercise={handleExercise}
                                onSettle={handleSettle}
                                showListingStatus={optionsFilter === 'mine'}
                            />
                        </ErrorBoundary>
                    )}
                </div>
            )}

            {/* Prompt when no market selected */}
            {!selectedAddr && !discoveryLoading && pools.length > 0 && (
                <div className="text-center py-12">
                    <p className="text-sm text-terminal-text-muted font-mono">
                        Select a market above to view the option chain.
                    </p>
                </div>
            )}

            {/* No pools */}
            {!discoveryLoading && pools.length === 0 && (
                <div className="text-center py-12">
                    <p className="text-sm text-terminal-text-muted font-mono">
                        No markets available.
                    </p>
                </div>
            )}

            {/* Network badge */}
            {currentNetwork !== 'mainnet' && (
                <div className="mt-6 flex items-center gap-2 text-xs text-terminal-text-muted font-mono">
                    <span className="w-2 h-2 rounded-full bg-yellow-400" />
                    Network: {currentNetwork.charAt(0).toUpperCase() + currentNetwork.slice(1)}
                </div>
            )}

            {/* Connect wallet prompt */}
            {!walletConnected && selectedAddr && (
                <div className="mt-4 bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-4 text-center">
                    <p className="text-terminal-text-muted font-mono text-sm">
                        Connect your wallet to write, buy, exercise, or cancel options.
                    </p>
                </div>
            )}

            {/* --- Action Modals --- */}

            {writeOpen && poolInfo && provider && network && selectedAddr && (
                <WriteOptionPanel
                    poolAddress={selectedAddr}
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

            {buyTarget && poolInfo && provider && network && selectedAddr && (
                <BuyOptionModal
                    option={buyTarget}
                    poolInfo={poolInfo}
                    poolAddress={selectedAddr}
                    walletAddress={walletAddress}
                    address={address}
                    provider={provider}
                    network={network}
                    motoPillRatio={motoPillRatio}
                    currentBlock={currentBlock ?? undefined}
                    underlyingSymbol={underlyingSymbol}
                    premiumSymbol={premiumSymbol}
                    poolType={poolType}
                    strategyLabel={buyStrategyLabel}
                    onClose={() => { setBuyTarget(null); setBuyStrategyLabel(undefined); }}
                    onSuccess={() => {
                        setBuyTarget(null);
                        setBuyStrategyLabel(undefined);
                        refetchPool();
                    }}
                />
            )}

            {cancelTarget && poolInfo && provider && network && selectedAddr && (
                <CancelModal
                    option={cancelTarget}
                    poolInfo={poolInfo}
                    poolAddress={selectedAddr}
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

            {exerciseTarget && poolInfo && provider && network && selectedAddr && (
                <ExerciseModal
                    option={exerciseTarget}
                    poolInfo={poolInfo}
                    poolAddress={selectedAddr}
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

            {settleTarget && provider && network && selectedAddr && (
                <SettleModal
                    option={settleTarget}
                    poolAddress={selectedAddr}
                    walletAddress={walletAddress}
                    address={address}
                    provider={provider}
                    network={network}
                    underlyingSymbol={underlyingSymbol}
                    premiumSymbol={premiumSymbol}
                    poolType={poolType}
                    onClose={() => setSettleTarget(null)}
                    onSuccess={() => {
                        setSettleTarget(null);
                        refetchPool();
                    }}
                />
            )}
        </div>
    );
}
