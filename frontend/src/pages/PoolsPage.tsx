/**
 * PoolsPage — real on-chain pool view with options table, write panel, and buy modal.
 */
import { useState } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { usePool } from '../hooks/usePool.ts';
import { PoolInfoCard } from '../components/PoolInfoCard.tsx';
import { OptionsTable } from '../components/OptionsTable.tsx';
import { WriteOptionPanel } from '../components/WriteOptionPanel.tsx';
import { BuyOptionModal } from '../components/BuyOptionModal.tsx';
import { CancelModal } from '../components/CancelModal.tsx';
import { ExerciseModal } from '../components/ExerciseModal.tsx';
import { SettleModal } from '../components/SettleModal.tsx';
import { CONTRACT_ADDRESSES, currentNetwork } from '../config/index.ts';
import { PoolsSkeleton } from '../components/LoadingSkeletons.tsx';
import type { OptionData } from '../services/types.ts';

const POOL_ADDRESS = CONTRACT_ADDRESSES.pool;

export function PoolsPage() {
    const { walletAddress, address, provider, network } = useWalletConnect();
    const { poolInfo, options, loading, error, refetch } = usePool(POOL_ADDRESS || null);
    const [writeOpen, setWriteOpen] = useState(false);
    const [buyTarget, setBuyTarget] = useState<OptionData | null>(null);
    const [cancelTarget, setCancelTarget] = useState<OptionData | null>(null);
    const [exerciseTarget, setExerciseTarget] = useState<OptionData | null>(null);
    const [settleTarget, setSettleTarget] = useState<OptionData | null>(null);

    // address.toString() = 0x-prefixed MLDSA hash; used for action visibility
    const walletHex = address ? address.toString() : null;

    function handleBuy(option: OptionData) {
        if (!provider) {
            // Prompt to connect — show a lightweight gate
            setBuyTarget(null);
        } else {
            setBuyTarget(option);
        }
    }

    function handleCancel(option: OptionData) {
        if (provider) setCancelTarget(option);
    }

    function handleExercise(option: OptionData) {
        if (provider) setExerciseTarget(option);
    }

    function handleSettle(option: OptionData) {
        if (provider) setSettleTarget(option);
    }

    if (!POOL_ADDRESS) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-16 text-center">
                <p className="text-terminal-text-muted font-mono text-sm">
                    No pool address configured. Set{' '}
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
                    <button onClick={refetch} className="btn-secondary px-4 py-2 text-sm rounded">
                        Retry
                    </button>
                </div>
            )}

            {/* Main content */}
            {!error && poolInfo && (
                <div className="space-y-4">
                    <PoolInfoCard
                        poolInfo={poolInfo}
                        poolAddress={POOL_ADDRESS}
                        onWriteOption={() => setWriteOpen(true)}
                    />
                    <OptionsTable
                        options={options}
                        walletHex={walletHex}
                        gracePeriodBlocks={poolInfo.gracePeriodBlocks}
                        onBuy={handleBuy}
                        onCancel={handleCancel}
                        onExercise={handleExercise}
                        onSettle={handleSettle}
                    />
                </div>
            )}

            {/* Network badge (hidden on mainnet) */}
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
                    poolAddress={POOL_ADDRESS}
                    walletAddress={walletAddress}
                    address={address}
                    provider={provider}
                    network={network}
                    onClose={() => setBuyTarget(null)}
                    onSuccess={() => {
                        setBuyTarget(null);
                        refetch();
                    }}
                />
            )}

            {/* Cancel Option modal */}
            {cancelTarget && poolInfo && provider && network && (
                <CancelModal
                    option={cancelTarget}
                    poolInfo={poolInfo}
                    poolAddress={POOL_ADDRESS}
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
                    poolAddress={POOL_ADDRESS}
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
                    poolAddress={POOL_ADDRESS}
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

            {/* Write Option slide-in panel */}
            {writeOpen && poolInfo && provider && network && (
                <WriteOptionPanel
                    poolAddress={POOL_ADDRESS}
                    poolInfo={poolInfo}
                    walletAddress={walletAddress}
                    walletHex={walletHex}
                    address={address}
                    provider={provider}
                    network={network}
                    onClose={() => setWriteOpen(false)}
                    onSuccess={() => {
                        setWriteOpen(false);
                        refetch();
                    }}
                />
            )}

            {/* Connect prompt when write or buy needs wallet */}
            {(writeOpen || buyTarget !== null) && !provider && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                    <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-8 text-center max-w-sm">
                        <p className="text-terminal-text-primary font-mono mb-4">
                            Connect your wallet to continue.
                        </p>
                        <button
                            onClick={() => {
                                setWriteOpen(false);
                                setBuyTarget(null);
                            }}
                            className="btn-secondary px-4 py-2 text-sm rounded"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
