/**
 * PoolsPage — on-chain pool view with factory discovery, options table,
 * write panel, and action modals.
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useWsBlock } from '../hooks/useWebSocketProvider.ts';
import { useFallbackProvider } from '../hooks/useFallbackProvider.ts';
import { useDiscoverPools } from '../hooks/useDiscoverPools.ts';
import { usePool } from '../hooks/usePool.ts';
import { useBlockTracker } from '../hooks/useBlockTracker.ts';
import { usePriceRatio } from '../hooks/usePriceRatio.ts';
import { usePriceCandles } from '../hooks/usePriceCandles.ts';
import { useTransactionContext } from '../hooks/useTransactionContext.ts';
import { PoolInfoCard } from '../components/PoolInfoCard.tsx';
import { OptionsTable } from '../components/OptionsTable.tsx';
import { PriceChart } from '../components/PriceChart.tsx';
import { WriteOptionPanel } from '../components/WriteOptionPanel.tsx';
import type { WriteOptionInitialValues } from '../components/WriteOptionPanel.tsx';
import { BuyOptionModal } from '../components/BuyOptionModal.tsx';
import { CancelModal } from '../components/CancelModal.tsx';
import { ExerciseModal } from '../components/ExerciseModal.tsx';
import { SettleModal } from '../components/SettleModal.tsx';
import { QuickStrategies } from '../components/QuickStrategies.tsx';
import { CollarModal } from '../components/CollarModal.tsx';
import { CONTRACT_ADDRESSES, currentNetwork, formatAddress } from '../config/index.ts';
import { PoolsSkeleton } from '../components/LoadingSkeletons.tsx';
import type { OptionData } from '../services/types.ts';

const NATIVESWAP_ADDRESS = import.meta.env.VITE_NATIVESWAP_ADDRESS || '';

export function PoolsPage() {
    const wsBlock = useWsBlock();
    const { walletAddress, address, provider, network } = useWalletConnect();
    const readProvider = useFallbackProvider();
    const walletConnected = provider !== null && provider !== undefined;
    const {
        pools,
        loading: discoveryLoading,
        error: discoveryError,
        source,
        refetch: refetchPools,
    } = useDiscoverPools(readProvider);

    const [userSelectedPool, setUserSelectedPool] = useState<string | null>(null);

    // Derive effective selected pool: user choice if valid, else first pool
    const selectedPoolAddr = useMemo(() => {
        if (pools.length === 0) return null;
        if (userSelectedPool && pools.some((p) => p.address === userSelectedPool)) {
            return userSelectedPool;
        }
        return pools[0].address;
    }, [pools, userSelectedPool]);

    const { poolInfo, options, loading: poolLoading, error: poolError, refetch: refetchPool } =
        usePool(selectedPoolAddr, readProvider);

    const { currentBlock } = useBlockTracker(readProvider, wsBlock);

    const { motoPillRatio } = usePriceRatio(
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

    // Resume flow routing
    const { transactions, resumeRequest, clearResumeRequest, abandonFlow } = useTransactionContext();
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

    const [writeOpen, setWriteOpen] = useState(false);
    const [writeInitialValues, setWriteInitialValues] = useState<WriteOptionInitialValues | undefined>(undefined);
    const [collarOpen, setCollarOpen] = useState(false);
    const [buyTarget, setBuyTarget] = useState<OptionData | null>(null);
    const [cancelTarget, setCancelTarget] = useState<OptionData | null>(null);
    const [exerciseTarget, setExerciseTarget] = useState<OptionData | null>(null);
    const [settleTarget, setSettleTarget] = useState<OptionData | null>(null);

    // Handle resume requests from the flow card
    useEffect(() => {
        if (!resumeRequest || !selectedPoolAddr) return;
        if (resumeRequest.poolAddress !== selectedPoolAddr) return;
        clearResumeRequest();

        if (resumeRequest.actionType === 'writeOption') {
            const formState = resumeRequest.formState;
            if (formState) {
                setWriteInitialValues({
                    optionType: formState['optionType'] !== undefined ? Number(formState['optionType']) : undefined,
                    amountStr: formState['amount'],
                    strikeStr: formState['strike'],
                    premiumStr: formState['premium'],
                    selectedDays: formState['days'] !== undefined ? Number(formState['days']) : undefined,
                });
            }
            setWriteOpen(true);
            return;
        }

        if (resumeRequest.actionType === 'buyOption' && resumeRequest.optionId) {
            const opt = options.find((o) => o.id.toString() === resumeRequest.optionId);
            if (opt) {
                setBuyTarget(opt);
            } else {
                abandonFlow();
                alert('Option no longer available. Flow abandoned.');
            }
            return;
        }

        if (resumeRequest.actionType === 'exercise' && resumeRequest.optionId) {
            const opt = options.find((o) => o.id.toString() === resumeRequest.optionId);
            if (opt) {
                setExerciseTarget(opt);
            } else {
                abandonFlow();
                alert('Option no longer available. Flow abandoned.');
            }
        }
    }, [resumeRequest, selectedPoolAddr, options, clearResumeRequest, abandonFlow]);

    // address.toString() = 0x-prefixed MLDSA hash; used for action visibility
    const walletHex = address ? address.toString() : null;

    const loading = discoveryLoading || poolLoading;
    const error = discoveryError || poolError;

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
        setWriteInitialValues(values);
        setWriteOpen(true);
    }

    function handleProtectivePut(option: OptionData) {
        if (!walletConnected) return;
        setBuyTarget(option);
    }

    function handleWritePut(values: WriteOptionInitialValues) {
        if (!walletConnected) return;
        setWriteInitialValues(values);
        setWriteOpen(true);
    }

    function handleCollarWriteCall(values: WriteOptionInitialValues) {
        setCollarOpen(false);
        setWriteInitialValues(values);
        setWriteOpen(true);
    }

    function handleCollarBuyPut(option: OptionData) {
        setCollarOpen(false);
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
                    <PoolInfoCard
                        poolInfo={poolInfo}
                        poolAddress={selectedPoolAddr}
                        motoPillRatio={motoPillRatio}
                        onWriteOption={walletConnected ? () => setWriteOpen(true) : undefined}
                    />
                    <QuickStrategies
                        poolInfo={poolInfo}
                        options={options}
                        motoPillRatio={motoPillRatio}
                        motoBal={null}
                        walletConnected={walletConnected}
                        onCoveredCall={handleCoveredCall}
                        onProtectivePut={handleProtectivePut}
                        onWritePut={handleWritePut}
                        onCollar={() => setCollarOpen(true)}
                    />
                    {candles.length > 0 && (
                        <PriceChart
                            candles={candles}
                            token={chartToken}
                            interval={chartInterval}
                            onIntervalChange={setChartInterval}
                            onTokenChange={setChartToken}
                        />
                    )}
                    <OptionsTable
                        options={options}
                        walletHex={walletHex}
                        walletConnected={walletConnected}
                        currentBlock={currentBlock ?? undefined}
                        gracePeriodBlocks={poolInfo.gracePeriodBlocks}
                        motoPillRatio={motoPillRatio}
                        onBuy={handleBuy}
                        onCancel={handleCancel}
                        onExercise={handleExercise}
                        onSettle={handleSettle}
                    />
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
                    onClose={() => setBuyTarget(null)}
                    onSuccess={() => {
                        setBuyTarget(null);
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
                    onClose={() => {
                        setWriteOpen(false);
                        setWriteInitialValues(undefined);
                    }}
                    onSuccess={() => {
                        setWriteOpen(false);
                        setWriteInitialValues(undefined);
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
        </div>
    );
}
