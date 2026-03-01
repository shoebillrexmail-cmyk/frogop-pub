/**
 * BatchCancelModal — lets a writer cancel multiple OPEN options in a single transaction.
 *
 * Shows a list of selected options with collateral breakdown per option,
 * totals collateral returned and fees, and calls batchCancel on the pool contract.
 */
import { useState, useEffect } from 'react';
import { getContract } from 'opnet';
import type { AbstractRpcProvider } from 'opnet';
import type { Address } from '@btc-vision/transaction';
import type { OptionData, PoolInfo } from '../services/types.ts';
import { OptionType } from '../services/types.ts';
import { POOL_WRITE_ABI } from '../services/poolAbi.ts';
import { formatTokenAmount } from '../config/index.ts';
import { useTransactionContext } from '../hooks/useTransactionContext.ts';
import type { WalletConnectNetwork } from '@btc-vision/walletconnect';

interface BatchCancelModalProps {
    options: OptionData[];
    poolInfo: PoolInfo;
    poolAddress: string;
    walletAddress: string | null;
    address: Address | null;
    provider: AbstractRpcProvider;
    network: WalletConnectNetwork;
    onClose: () => void;
    onSuccess: () => void;
}

const MAX_SAT = 10_000_000n;
const MAX_BATCH = 5;

function fmt(v: bigint) {
    return formatTokenAmount(v);
}

function calcCollateral(option: OptionData): { amount: bigint; token: string } {
    const isCall = option.optionType === OptionType.CALL;
    // Fixed-point: (strike * amount) / 1e18 — both are 18-decimal
    return {
        amount: isCall ? option.underlyingAmount : (option.strikePrice * option.underlyingAmount) / (10n ** 18n),
        token: isCall ? 'MOTO' : 'PILL',
    };
}

export function BatchCancelModal({
    options,
    poolInfo,
    poolAddress,
    walletAddress,
    address,
    provider,
    network,
    onClose,
    onSuccess,
}: BatchCancelModalProps) {
    const [currentBlock, setCurrentBlock] = useState<bigint | null>(null);
    const [txStatus, setTxStatus] = useState<'idle' | 'cancelling' | 'done' | 'error'>('idle');
    const [txError, setTxError] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);
    const { addTransaction } = useTransactionContext();

    useEffect(() => {
        provider.getBlockNumber().then(setCurrentBlock).catch(() => setCurrentBlock(null));
    }, [provider]);

    const feeBps = poolInfo.cancelFeeBps;

    const breakdown = options.map((opt) => {
        const { amount, token } = calcCollateral(opt);
        const isExpired = currentBlock !== null && currentBlock >= opt.expiryBlock;
        const fee = isExpired || feeBps === 0n ? 0n : (amount * feeBps + 9999n) / 10000n;
        const returned = amount - fee;
        return { opt, amount, token, fee, returned, isExpired };
    });

    const totalFee = breakdown.reduce((sum, b) => sum + b.fee, 0n);
    const totalReturned = breakdown.reduce((sum, b) => sum + b.returned, 0n);

    const busy = txStatus === 'cancelling';
    const overLimit = options.length > MAX_BATCH;

    async function handleBatchCancel() {
        if (!address || options.length === 0 || overLimit) return;
        setTxError(null);
        setTxStatus('cancelling');
        try {
            const poolContract = getContract(
                poolAddress,
                POOL_WRITE_ABI,
                provider,
                network,
                address,
            ) as unknown as Record<string, (...args: unknown[]) => { sendTransaction: (p: unknown) => Promise<{ transactionId: string }> }>;

            const ids = options.map((o) => o.id);
            const padded = [...ids];
            while (padded.length < MAX_BATCH) padded.push(0n);

            const call = await poolContract['batchCancel'](
                BigInt(ids.length),
                padded[0], padded[1], padded[2], padded[3], padded[4],
            );
            const receipt = await call.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress ?? '',
                maximumAllowedSatToSpend: MAX_SAT,
                network,
            });
            setTxId(receipt.transactionId);
            addTransaction({
                txId: receipt.transactionId,
                type: 'batchCancel',
                status: 'broadcast',
                poolAddress,
                broadcastBlock: null,
                label: `Batch Cancel ${ids.length} option(s)`,
                flowId: null,
                flowStep: null,
                meta: { count: String(ids.length) },
            });
            setTxStatus('done');
        } catch (err) {
            setTxError(err instanceof Error ? err.message : 'Batch cancel failed');
            setTxStatus('error');
        }
    }

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            data-testid="batch-cancel-modal-backdrop"
        >
            <div
                className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl w-full max-w-md shadow-2xl"
                data-testid="batch-cancel-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-terminal-text-primary font-mono">
                            Batch Cancel{' '}
                            <span className="text-terminal-text-muted">
                                ({options.length} option{options.length !== 1 ? 's' : ''})
                            </span>
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-terminal-text-muted hover:text-terminal-text-primary text-xl leading-none"
                            aria-label="Close modal"
                        >
                            ✕
                        </button>
                    </div>

                    <hr className="border-terminal-border-subtle" />

                    {overLimit && (
                        <p className="text-rose-400 text-xs font-mono">
                            Maximum {MAX_BATCH} options per batch. Please deselect some options.
                        </p>
                    )}

                    {/* Per-option breakdown */}
                    <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3 text-xs font-mono space-y-2 max-h-48 overflow-y-auto">
                        {breakdown.map((b) => (
                            <div key={b.opt.id.toString()} className="flex justify-between">
                                <span className="text-terminal-text-muted">
                                    #{b.opt.id.toString()}{' '}
                                    {b.isExpired && <span className="text-green-400">(no fee)</span>}
                                </span>
                                <span className="text-terminal-text-secondary">
                                    {fmt(b.returned)} {b.token}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Totals */}
                    <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3 text-xs font-mono space-y-1.5">
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Total fees</span>
                            <span className="text-terminal-text-secondary">{fmt(totalFee)}</span>
                        </div>
                        <hr className="border-terminal-border-subtle" />
                        <div className="flex justify-between font-semibold">
                            <span className="text-terminal-text-muted">Total returned</span>
                            <span className="text-terminal-text-primary">{fmt(totalReturned)}</span>
                        </div>
                    </div>

                    {txError && (
                        <p className="text-rose-400 text-xs font-mono" data-testid="tx-error">
                            {txError}
                        </p>
                    )}

                    {txStatus === 'done' && txId && (
                        <div className="bg-green-900/20 border border-green-700 rounded p-3 text-xs font-mono">
                            <p className="text-green-300 mb-1">Batch cancellation broadcast!</p>
                            <p className="text-terminal-text-muted break-all">{txId}</p>
                            <button className="mt-2 btn-primary px-3 py-1 text-xs rounded" onClick={onSuccess}>
                                Done
                            </button>
                        </div>
                    )}

                    {txStatus !== 'done' && (
                        <div className="space-y-2">
                            <button
                                onClick={handleBatchCancel}
                                disabled={busy || overLimit}
                                className="w-full btn-primary py-2.5 text-sm rounded disabled:opacity-50"
                                data-testid="btn-batch-cancel"
                            >
                                {busy ? 'Cancelling...' : `Cancel ${options.length} Option${options.length !== 1 ? 's' : ''}`}
                            </button>
                            <button
                                onClick={onClose}
                                disabled={busy}
                                className="w-full btn-secondary py-2 text-sm rounded disabled:opacity-50"
                            >
                                Back
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
