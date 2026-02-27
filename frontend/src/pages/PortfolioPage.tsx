/**
 * PortfolioPage — shows the connected wallet's written and purchased options.
 *
 * Requires wallet connection. Uses the same pool data as PoolsPage.
 */
import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { usePool } from '../hooks/usePool.ts';
import { useUserOptions } from '../hooks/useUserOptions.ts';
import { useTokenInfo } from '../hooks/useTokenInfo.ts';
import { OptionsTable } from '../components/OptionsTable.tsx';
import { BalancesCard } from '../components/BalancesCard.tsx';
import { CancelModal } from '../components/CancelModal.tsx';
import { ExerciseModal } from '../components/ExerciseModal.tsx';
import { SettleModal } from '../components/SettleModal.tsx';
import { CONTRACT_ADDRESSES } from '../config/index.ts';
import { OptionStatus } from '../services/types.ts';
import type { OptionData } from '../services/types.ts';

const POOL_ADDRESS = CONTRACT_ADDRESSES.pool;

export function PortfolioPage() {
    const { walletAddress, address, provider, network, openConnectModal } = useWalletConnect();

    const walletHex = address ? address.toString() : null;

    // Pool config only (fees, grace period, token addresses)
    const { poolInfo, loading: poolLoading, error: poolError, refetch: poolRefetch } = usePool(
        walletAddress && POOL_ADDRESS ? POOL_ADDRESS : null
    );

    // User's options — indexer fast path, chain fallback
    const {
        writtenOptions, purchasedOptions,
        loading: optLoading, error: optError,
        source, refetch: optRefetch,
    } = useUserOptions(walletHex, walletAddress ? POOL_ADDRESS : null);

    const loading = poolLoading || optLoading;
    const error   = poolError ?? optError;
    const refetch = useCallback(() => { poolRefetch(); optRefetch(); }, [poolRefetch, optRefetch]);

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
    if (!POOL_ADDRESS) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-16 text-center">
                <p className="text-terminal-text-muted font-mono text-sm">
                    No pool configured. Set{' '}
                    <code className="neon-orange">VITE_POOL_ADDRESS</code> in your{' '}
                    <code className="neon-orange">.env</code> file.
                </p>
            </div>
        );
    }

    // Grace period warning: any PURCHASED options owned by the buyer
    const activePurchased = purchasedOptions.filter((o) => o.status === OptionStatus.PURCHASED);

    const [cancelTarget, setCancelTarget] = useState<OptionData | null>(null);
    const [exerciseTarget, setExerciseTarget] = useState<OptionData | null>(null);
    const [settleTarget, setSettleTarget] = useState<OptionData | null>(null);

    function handleCancel(option: OptionData) {
        if (provider) setCancelTarget(option);
    }

    function handleExercise(option: OptionData) {
        if (provider) setExerciseTarget(option);
    }

    function handleSettle(option: OptionData) {
        if (provider) setSettleTarget(option);
    }

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------
    return (
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
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

            {/* Loading skeleton */}
            {loading && (
                <div className="space-y-4">
                    <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-5 h-24 animate-pulse" />
                    <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-5 h-48 animate-pulse" />
                </div>
            )}

            {/* Error */}
            {!loading && error && (
                <div className="bg-terminal-bg-elevated border border-rose-700 rounded-xl p-6 text-center">
                    <p className="text-rose-400 font-mono text-sm mb-3">{error}</p>
                    <button onClick={refetch} className="btn-secondary px-4 py-2 text-sm rounded">
                        Retry
                    </button>
                </div>
            )}

            {!loading && !error && (
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
                                    to="/pools"
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
                                gracePeriodBlocks={poolInfo?.gracePeriodBlocks}
                                showFilter={false}
                                onBuy={() => {}}
                                onCancel={handleCancel}
                                onExercise={handleExercise}
                                onSettle={handleSettle}
                            />
                        )}
                    </section>

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
                                    to="/pools"
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
                                gracePeriodBlocks={poolInfo?.gracePeriodBlocks}
                                showFilter={false}
                                onBuy={() => {}}
                                onCancel={handleCancel}
                                onExercise={handleExercise}
                                onSettle={handleSettle}
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
                    poolAddress={POOL_ADDRESS!}
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
                    poolAddress={POOL_ADDRESS!}
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
                    poolAddress={POOL_ADDRESS!}
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
        </div>
    );
}
