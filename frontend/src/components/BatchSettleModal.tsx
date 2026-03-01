/**
 * BatchSettleModal — lets anyone settle multiple expired/unexercised options in one transaction.
 *
 * Shows list of settleable options and a single "Settle All" button.
 * Reports how many were actually settled on success (non-atomic: skips unsettleable).
 */
import { useState } from 'react';
import { getContract } from 'opnet';
import type { AbstractRpcProvider } from 'opnet';
import type { Address } from '@btc-vision/transaction';
import type { OptionData } from '../services/types.ts';
import { OptionType } from '../services/types.ts';
import { POOL_WRITE_ABI } from '../services/poolAbi.ts';
import { formatTokenAmount } from '../config/index.ts';
import { useTransactionContext } from '../hooks/useTransactionContext.ts';
import type { WalletConnectNetwork } from '@btc-vision/walletconnect';

interface BatchSettleModalProps {
    options: OptionData[];
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
    return {
        amount: isCall ? option.underlyingAmount : option.strikePrice * option.underlyingAmount,
        token: isCall ? 'MOTO' : 'PILL',
    };
}

export function BatchSettleModal({
    options,
    poolAddress,
    walletAddress,
    address,
    provider,
    network,
    onClose,
    onSuccess,
}: BatchSettleModalProps) {
    const [txStatus, setTxStatus] = useState<'idle' | 'settling' | 'done' | 'error'>('idle');
    const [txError, setTxError] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);
    const { addTransaction } = useTransactionContext();

    const totalCollateral = options.reduce((sum, opt) => sum + calcCollateral(opt).amount, 0n);

    const busy = txStatus === 'settling';
    const overLimit = options.length > MAX_BATCH;

    async function handleBatchSettle() {
        if (!address || options.length === 0 || overLimit) return;
        setTxError(null);
        setTxStatus('settling');
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

            const call = await poolContract['batchSettle'](
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
                type: 'batchSettle',
                status: 'broadcast',
                poolAddress,
                broadcastBlock: null,
                label: `Batch Settle ${ids.length} option(s)`,
                flowId: null,
                flowStep: null,
                meta: { count: String(ids.length) },
            });
            setTxStatus('done');
        } catch (err) {
            setTxError(err instanceof Error ? err.message : 'Batch settle failed');
            setTxStatus('error');
        }
    }

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            data-testid="batch-settle-modal-backdrop"
        >
            <div
                className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl w-full max-w-md shadow-2xl"
                data-testid="batch-settle-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-terminal-text-primary font-mono">
                            Batch Settle{' '}
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

                    {/* Per-option list */}
                    <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3 text-xs font-mono space-y-2 max-h-48 overflow-y-auto">
                        {options.map((opt) => {
                            const { amount, token } = calcCollateral(opt);
                            return (
                                <div key={opt.id.toString()} className="flex justify-between">
                                    <span className="text-terminal-text-muted">#{opt.id.toString()}</span>
                                    <span className="text-terminal-text-secondary">
                                        {fmt(amount)} {token}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Total */}
                    <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3 text-xs font-mono">
                        <div className="flex justify-between font-semibold">
                            <span className="text-terminal-text-muted">Total collateral returned</span>
                            <span className="text-terminal-text-primary">{fmt(totalCollateral)}</span>
                        </div>
                        <p className="text-green-400 mt-1">No settle fee applies.</p>
                    </div>

                    <p className="text-terminal-text-muted text-xs font-mono">
                        These options were not exercised within the grace period. Settling returns
                        full collateral to the writers.
                    </p>

                    {txError && (
                        <p className="text-rose-400 text-xs font-mono" data-testid="tx-error">
                            {txError}
                        </p>
                    )}

                    {txStatus === 'done' && txId && (
                        <div className="bg-green-900/20 border border-green-700 rounded p-3 text-xs font-mono">
                            <p className="text-green-300 mb-1">Batch settlement broadcast!</p>
                            <p className="text-terminal-text-muted break-all">{txId}</p>
                            <button className="mt-2 btn-primary px-3 py-1 text-xs rounded" onClick={onSuccess}>
                                Done
                            </button>
                        </div>
                    )}

                    {txStatus !== 'done' && (
                        <div className="space-y-2">
                            <button
                                onClick={handleBatchSettle}
                                disabled={busy || overLimit}
                                className="w-full btn-primary py-2.5 text-sm rounded disabled:opacity-50"
                                data-testid="btn-batch-settle"
                            >
                                {busy ? 'Settling...' : `Settle ${options.length} Option${options.length !== 1 ? 's' : ''}`}
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
