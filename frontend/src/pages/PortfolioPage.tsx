/**
 * PortfolioPage — shows the connected wallet's written and purchased options.
 *
 * Requires wallet connection. Uses the same pool data as PoolsPage.
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { usePool } from '../hooks/usePool.ts';
import { useUserOptions } from '../hooks/useUserOptions.ts';
import { useTokenInfo } from '../hooks/useTokenInfo.ts';
import { useBlockTracker } from '../hooks/useBlockTracker.ts';
import { useWsBlock } from '../hooks/useWebSocketProvider.ts';
import { useTransactionContext } from '../hooks/useTransactionContext.ts';
import { usePriceRatio } from '../hooks/usePriceRatio.ts';
import { usePnL } from '../hooks/usePnL.ts';
import { useFallbackProvider } from '../hooks/useFallbackProvider.ts';
import { useDiscoverPools } from '../hooks/useDiscoverPools.ts';
import { PortfolioSkeleton } from '../components/LoadingSkeletons.tsx';
import { OptionsTable } from '../components/OptionsTable.tsx';
import { BalancesCard } from '../components/BalancesCard.tsx';
import { PortfolioSummaryCard } from '../components/PortfolioSummaryCard.tsx';
import { getUserStatusLabel } from '../utils/statusLabels.ts';
import { CancelModal } from '../components/CancelModal.tsx';
import { ExerciseModal } from '../components/ExerciseModal.tsx';
import { SettleModal } from '../components/SettleModal.tsx';
import { RollModal } from '../components/RollModal.tsx';
import { TransferModal } from '../components/TransferModal.tsx';
import { formatAddress } from '../config/index.ts';
import { NotificationBanner } from '../components/NotificationBanner.tsx';
import { ExpiryAlertBanner } from '../components/ExpiryAlertBanner.tsx';
import { useExpiryAlerts } from '../hooks/useExpiryAlerts.ts';
import { useNotifications } from '../hooks/useNotifications.ts';
import { useStatusChangeDetector, describeChange } from '../hooks/useStatusChangeDetector.ts';
import { OptionStatus } from '../services/types.ts';
import type { OptionData } from '../services/types.ts';
import type { ResumeRequest } from '../contexts/flowDefs.ts';

export function PortfolioPage() {
    const wsBlockInfo = useWsBlock();
    const { walletAddress, address, provider, network, openConnectModal } = useWalletConnect();
    const readProvider = useFallbackProvider();

    const walletHex = address ? address.toString() : null;

    const { currentBlock } = useBlockTracker(provider ?? null, wsBlockInfo?.blockNumber);

    // Discover all pools via factory (or env fallback)
    const {
        pools,
        loading: discoveryLoading,
    } = useDiscoverPools(readProvider);

    // Pool selector state — persisted to sessionStorage
    const [userSelectedPool, setUserSelectedPool] = useState<string | null>(() => {
        try { return sessionStorage.getItem('frogop_selected_portfolio_pool'); } catch { return null; }
    });

    // Derive effective selected pool: user choice if valid, else first pool
    const selectedPoolAddr = useMemo(() => {
        if (pools.length === 0) return null;
        if (userSelectedPool && pools.some((p) => p.address === userSelectedPool)) {
            return userSelectedPool;
        }
        return pools[0].address;
    }, [pools, userSelectedPool]);

    // Persist pool selection
    useEffect(() => {
        if (selectedPoolAddr) {
            try { sessionStorage.setItem('frogop_selected_portfolio_pool', selectedPoolAddr); } catch { /* noop */ }
        }
    }, [selectedPoolAddr]);

    // Pool config only (fees, grace period, token addresses)
    const { poolInfo, loading: poolLoading, error: poolError, refetch: poolRefetch } = usePool(
        walletAddress && selectedPoolAddr ? selectedPoolAddr : null
    );

    // User's options — indexer fast path, chain fallback
    const {
        writtenOptions, purchasedOptions,
        loading: optLoading, error: optError,
        source, refetch: optRefetch,
    } = useUserOptions(walletHex, walletAddress ? selectedPoolAddr : null);

    const loading = discoveryLoading || poolLoading || optLoading;
    const error   = poolError ?? optError;
    const refetch = useCallback(() => { poolRefetch(); optRefetch(); }, [poolRefetch, optRefetch]);

    // Resume flow and auto-refetch
    const { transactions, resumeRequest, clearResumeRequest, abandonFlow: abandonFlowById } = useTransactionContext();
    const confirmedCountRef = useRef(0);
    useEffect(() => {
        if (!selectedPoolAddr) return;
        const confirmed = transactions.filter(
            (tx) => tx.poolAddress === selectedPoolAddr && tx.status === 'confirmed',
        ).length;
        if (confirmed > confirmedCountRef.current) {
            refetch();
        }
        confirmedCountRef.current = confirmed;
    }, [transactions, refetch, selectedPoolAddr]);

    // Token balances (only when wallet connected)
    const { info: motoInfo, loading: motoLoading } = useTokenInfo({
        tokenAddress: poolInfo?.underlying ?? null,
        spenderHex: null,
        walletAddress: address,
        provider: provider ?? null,
    });

    const { info: pillInfo, loading: pillLoading } = useTokenInfo({
        tokenAddress: poolInfo?.premiumToken ?? null,
        spenderHex: null,
        walletAddress: address,
        provider: provider ?? null,
    });

    // MOTO/PILL price ratio (indexer first, on-chain fallback)
    const { motoPillRatio } = usePriceRatio(null, null, null, null, null);

    // Unrealized P&L for purchased options
    const { totalPnlPill, perOption: pnlMap } = usePnL(
        purchasedOptions, motoPillRatio, currentBlock ?? undefined,
    );

    // Status change notifications
    const { notifications, addNotification, dismissNotification } = useNotifications();
    const allOptions = [...writtenOptions, ...purchasedOptions];
    useStatusChangeDetector(allOptions, useCallback((changes) => {
        for (const change of changes) {
            addNotification(describeChange(change, walletHex), 'info');
        }
    }, [addNotification, walletHex]));

    // Read collar strategy progress from localStorage
    const collarStatus = useMemo(() => {
        if (!walletAddress) return null;
        try {
            const raw = localStorage.getItem(`frogop_collar_${walletAddress}`);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as { callDone?: boolean; putDone?: boolean };
            if (!parsed.callDone && !parsed.putDone) return null;
            if (parsed.callDone && parsed.putDone) return null; // complete → hide
            return { callDone: !!parsed.callDone, putDone: !!parsed.putDone };
        } catch { return null; }
    }, [walletAddress]);

    // Expiry alerts for purchased options
    const expiryAlerts = useExpiryAlerts(
        purchasedOptions, currentBlock ?? undefined,
        poolInfo?.gracePeriodBlocks, walletHex,
    );

    // Modal targets — must be declared before any early returns (Rules of Hooks)
    const [cancelTarget, setCancelTarget] = useState<OptionData | null>(null);
    const [exerciseTarget, setExerciseTarget] = useState<OptionData | null>(null);
    const [settleTarget, setSettleTarget] = useState<OptionData | null>(null);
    const [rollTarget, setRollTarget] = useState<OptionData | null>(null);
    const [transferTarget, setTransferTarget] = useState<OptionData | null>(null);

    // Apply exercise resume — extracted to avoid direct setState in the effect body.
    const applyResume = useCallback((req: ResumeRequest) => {
        // Close any open modal before opening the resume target
        setCancelTarget(null);
        setExerciseTarget(null);
        setSettleTarget(null);
        setRollTarget(null);
        setTransferTarget(null);

        if (req.optionId) {
            const opt = purchasedOptions.find((o) => o.id.toString() === req.optionId);
            if (opt) {
                setExerciseTarget(opt);
            } else {
                abandonFlowById(req.flowId);
                alert('Option no longer available. Flow abandoned.');
            }
        }
    }, [purchasedOptions, abandonFlowById]);

    // Handle exercise resume from flow card
    useEffect(() => {
        if (!resumeRequest || resumeRequest.actionType !== 'exercise') return;
        if (!selectedPoolAddr || resumeRequest.poolAddress !== selectedPoolAddr) return;
        clearResumeRequest();
        // eslint-disable-next-line react-hooks/set-state-in-effect -- resume routing: one-shot signal from TransactionContext
        applyResume(resumeRequest);
    }, [resumeRequest, clearResumeRequest, applyResume, selectedPoolAddr]);

    // -------------------------------------------------------------------------
    // Connect gate
    // -------------------------------------------------------------------------
    if (!walletAddress) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-16 text-center">
                <div className="max-w-md mx-auto bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-10">
                    <p className="text-terminal-text-secondary font-mono mb-6">
                        Connect your OPWallet to view your positions.
                    </p>
                    <button
                        onClick={openConnectModal}
                        className="btn-primary px-6 py-3 text-sm font-medium rounded-lg"
                    >
                        Connect Wallet
                    </button>
                </div>
            </div>
        );
    }

    // -------------------------------------------------------------------------
    // No pool configured
    // -------------------------------------------------------------------------
    if (!discoveryLoading && pools.length === 0) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-16 text-center">
                <p className="text-terminal-text-muted font-mono text-sm">
                    No pools discovered. Set{' '}
                    <code className="neon-orange">VITE_FACTORY_ADDRESS</code> or{' '}
                    <code className="neon-orange">VITE_POOL_ADDRESS</code> in your{' '}
                    <code className="neon-orange">.env</code> file.
                </p>
            </div>
        );
    }

    // Grace period warning: any PURCHASED options owned by the buyer
    const activePurchased = purchasedOptions.filter((o) => o.status === OptionStatus.PURCHASED);

    function handleCancel(option: OptionData) {
        if (provider) setCancelTarget(option);
    }

    function handleExercise(option: OptionData) {
        if (provider) setExerciseTarget(option);
    }

    function handleSettle(option: OptionData) {
        if (provider) setSettleTarget(option);
    }

    function handleRoll(option: OptionData) {
        if (provider) setRollTarget(option);
    }

    function handleTransfer(option: OptionData) {
        if (provider) setTransferTarget(option);
    }

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------
    if (loading) return <PortfolioSkeleton />;

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
            <NotificationBanner notifications={notifications} onDismiss={dismissNotification} />
            <ExpiryAlertBanner alerts={expiryAlerts} />

            {/* Pool selector when multiple pools */}
            {pools.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-terminal-text-muted font-mono">Pool:</span>
                    {pools.map((p) => (
                        <button
                            key={p.address}
                            data-testid={`portfolio-pool-selector-${p.address}`}
                            onClick={() => setUserSelectedPool(p.address)}
                            className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                                selectedPoolAddr === p.address
                                    ? 'bg-accent text-terminal-bg-primary'
                                    : 'bg-terminal-bg-elevated text-terminal-text-secondary hover:bg-terminal-bg-secondary'
                            }`}
                        >
                            {p.underlyingSymbol && p.premiumSymbol
                                ? `${p.underlyingSymbol}/${p.premiumSymbol}`
                                : formatAddress(p.address)}
                        </button>
                    ))}
                </div>
            )}

            {/* Grace period warning banner */}
            {activePurchased.length > 0 && (
                <div
                    className="flex items-start gap-3 bg-yellow-900/20 border border-yellow-600 rounded-xl px-5 py-4 text-sm font-mono"
                    data-testid="grace-banner"
                >
                    <span className="text-yellow-400 text-base">⚡</span>
                    <span className="text-yellow-300">
                        {activePurchased.length === 1
                            ? `Option #${activePurchased[0].id} — exercise during the grace period.`
                            : `${activePurchased.length} purchased options are active — exercise within the grace period.`}
                    </span>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="bg-terminal-bg-elevated border border-rose-700 rounded-xl p-6 text-center">
                    <p className="text-rose-400 font-mono text-sm mb-3">{error}</p>
                    <button onClick={refetch} className="btn-secondary px-4 py-2 text-sm rounded">
                        Retry
                    </button>
                </div>
            )}

            {!error && (
                <>
                    {/* Source badge */}
                    {source && (
                        <div className="flex justify-end">
                            <span
                                data-testid="source-badge"
                                className={`text-xs font-mono px-2 py-1 rounded border ${
                                    source === 'indexer'
                                        ? 'border-emerald-700 text-emerald-400'
                                        : 'border-terminal-border-subtle text-terminal-text-muted'
                                }`}
                            >
                                {source === 'indexer' ? 'via Indexer' : 'Live from chain'}
                            </span>
                        </div>
                    )}

                    {/* Balances card */}
                    <BalancesCard
                        motoBalance={motoInfo?.balance ?? null}
                        pillBalance={pillInfo?.balance ?? null}
                        loading={motoLoading || pillLoading}
                    />

                    {/* Portfolio summary */}
                    <PortfolioSummaryCard
                        writtenOptions={writtenOptions}
                        purchasedOptions={purchasedOptions}
                        poolInfo={poolInfo}
                    />

                    {/* Active strategy status (collar) */}
                    {collarStatus && (
                        <div
                            className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-4"
                            data-testid="active-strategy-banner"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-xs font-bold text-terminal-text-muted font-mono uppercase tracking-wider">
                                        Active Strategy: Collar
                                    </span>
                                    <div className="flex items-center gap-3 mt-1 text-xs font-mono">
                                        <span className={collarStatus.callDone ? 'text-green-400' : 'text-terminal-text-muted'}>
                                            {collarStatus.callDone ? '\u2713' : '\u25CB'} Write CALL
                                        </span>
                                        <span className={collarStatus.putDone ? 'text-green-400' : 'text-terminal-text-muted'}>
                                            {collarStatus.putDone ? '\u2713' : '\u25CB'} Buy PUT
                                        </span>
                                    </div>
                                </div>
                                <Link to={selectedPoolAddr ? `/pools/${selectedPoolAddr}` : '/pools'} className="btn-secondary px-3 py-1 text-xs rounded">
                                    Continue
                                </Link>
                            </div>
                        </div>
                    )}

                    {/* My Written Options */}
                    <section data-testid="written-section">
                        <h2 className="text-xs font-bold text-terminal-text-muted font-mono uppercase tracking-wider mb-3">
                            My Written Options
                        </h2>

                        {writtenOptions.length === 0 ? (
                            <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-8 text-center">
                                <p className="text-terminal-text-muted font-mono text-sm mb-4">
                                    No written options yet.
                                    <br />
                                    Go to Pools to write a CALL or PUT option.
                                </p>
                                <Link
                                    to={selectedPoolAddr ? `/pools/${selectedPoolAddr}` : '/pools'}
                                    className="btn-primary px-4 py-2 text-sm rounded inline-block"
                                    data-testid="go-to-pools-written"
                                >
                                    Go to Pools →
                                </Link>
                            </div>
                        ) : (
                            <OptionsTable
                                options={writtenOptions}
                                walletHex={walletHex}
                                currentBlock={currentBlock ?? undefined}
                                gracePeriodBlocks={poolInfo?.gracePeriodBlocks}
                                showFilter={false}
                                userStatusLabel={(opt) => getUserStatusLabel(opt, walletHex)}
                                poolAddress={selectedPoolAddr ?? undefined}
                                onBuy={() => {}}
                                onCancel={handleCancel}
                                onExercise={handleExercise}
                                onSettle={handleSettle}
                                onRoll={handleRoll}
                            />
                        )}
                    </section>

                    {/* Total Unrealized P&L */}
                    {totalPnlPill !== null && (
                        <div
                            className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-5"
                            data-testid="total-pnl-card"
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-terminal-text-muted font-mono uppercase tracking-wider">
                                    Unrealized P&L
                                </span>
                                <span
                                    className={`text-lg font-bold font-mono ${totalPnlPill >= 0 ? 'text-green-400' : 'text-rose-400'}`}
                                    data-testid="total-pnl-value"
                                >
                                    {totalPnlPill >= 0 ? '+' : ''}{totalPnlPill.toFixed(2)} PILL
                                </span>
                            </div>
                        </div>
                    )}

                    {/* My Purchased Options */}
                    <section data-testid="purchased-section">
                        <h2 className="text-xs font-bold text-terminal-text-muted font-mono uppercase tracking-wider mb-3">
                            My Purchased Options
                        </h2>

                        {purchasedOptions.length === 0 ? (
                            <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-8 text-center">
                                <p className="text-terminal-text-muted font-mono text-sm mb-4">
                                    No purchased options.
                                    <br />
                                    Browse open options on the Pools page to buy one.
                                </p>
                                <Link
                                    to={selectedPoolAddr ? `/pools/${selectedPoolAddr}` : '/pools'}
                                    className="btn-primary px-4 py-2 text-sm rounded inline-block"
                                    data-testid="go-to-pools-purchased"
                                >
                                    Go to Pools →
                                </Link>
                            </div>
                        ) : (
                            <OptionsTable
                                options={purchasedOptions}
                                walletHex={walletHex}
                                currentBlock={currentBlock ?? undefined}
                                gracePeriodBlocks={poolInfo?.gracePeriodBlocks}
                                pnlMap={pnlMap.size > 0 ? pnlMap : undefined}
                                showFilter={false}
                                userStatusLabel={(opt) => getUserStatusLabel(opt, walletHex)}
                                poolAddress={selectedPoolAddr ?? undefined}
                                onBuy={() => {}}
                                onCancel={handleCancel}
                                onExercise={handleExercise}
                                onSettle={handleSettle}
                                onTransfer={handleTransfer}
                            />
                        )}
                    </section>
                </>
            )}

            {/* Cancel Option modal */}
            {cancelTarget && poolInfo && provider && network && (
                <CancelModal
                    option={cancelTarget}
                    poolInfo={poolInfo}
                    poolAddress={selectedPoolAddr!}
                    walletAddress={walletAddress}
                    address={address}
                    provider={provider}
                    network={network}
                    onClose={() => setCancelTarget(null)}
                    onSuccess={() => {
                        setCancelTarget(null);
                        refetch();
                    }}
                />
            )}

            {/* Exercise Option modal */}
            {exerciseTarget && poolInfo && provider && network && (
                <ExerciseModal
                    option={exerciseTarget}
                    poolInfo={poolInfo}
                    poolAddress={selectedPoolAddr!}
                    walletAddress={walletAddress}
                    address={address}
                    provider={provider}
                    network={network}
                    onClose={() => setExerciseTarget(null)}
                    onSuccess={() => {
                        setExerciseTarget(null);
                        refetch();
                    }}
                />
            )}

            {/* Settle Option modal */}
            {settleTarget && provider && network && (
                <SettleModal
                    option={settleTarget}
                    poolAddress={selectedPoolAddr!}
                    walletAddress={walletAddress}
                    address={address}
                    provider={provider}
                    network={network}
                    onClose={() => setSettleTarget(null)}
                    onSuccess={() => {
                        setSettleTarget(null);
                        refetch();
                    }}
                />
            )}

            {/* Roll Option modal */}
            {rollTarget && poolInfo && provider && network && (
                <RollModal
                    option={rollTarget}
                    poolInfo={poolInfo}
                    poolAddress={selectedPoolAddr!}
                    walletAddress={walletAddress}
                    address={address}
                    provider={provider}
                    network={network}
                    onClose={() => setRollTarget(null)}
                    onSuccess={() => {
                        setRollTarget(null);
                        refetch();
                    }}
                />
            )}

            {/* Transfer Option modal */}
            {transferTarget && provider && network && (
                <TransferModal
                    option={transferTarget}
                    poolAddress={selectedPoolAddr!}
                    walletAddress={walletAddress}
                    address={address}
                    provider={provider}
                    network={network}
                    onClose={() => setTransferTarget(null)}
                    onSuccess={() => {
                        setTransferTarget(null);
                        refetch();
                    }}
                />
            )}
        </div>
    );
}
