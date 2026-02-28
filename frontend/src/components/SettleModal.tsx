/**
 * SettleModal — lets a writer settle an EXPIRED/unexercised option and recover collateral.
 *
 * Settle is available when: buyer never exercised and the grace period has passed.
 * No approval needed — collateral is already in the contract.
 */
import { useState } from 'react';
import { getContract } from 'opnet';
import type { AbstractRpcProvider } from 'opnet';
import type { Address } from '@btc-vision/transaction';
import type { OptionData } from '../services/types.ts';
import { OptionType } from '../services/types.ts';
import { POOL_WRITE_ABI } from '../services/poolAbi.ts';
import { formatTokenAmount } from '../config/index.ts';
import { useTransactionContext } from '../contexts/TransactionContext.tsx';
import type { WalletConnectNetwork } from '@btc-vision/walletconnect';

interface SettleModalProps {
    option: OptionData;
    poolAddress: string;
    walletAddress: string | null;
    address: Address | null;
    provider: AbstractRpcProvider;
    network: WalletConnectNetwork;
    onClose: () => void;
    onSuccess: () => void;
}

const MAX_SAT = 10_000_000n;

function fmt(v: bigint) {
    return formatTokenAmount(v);
}

export function SettleModal({
    option,
    poolAddress,
    walletAddress,
    address,
    provider,
    network,
    onClose,
    onSuccess,
}: SettleModalProps) {
    const [txStatus, setTxStatus] = useState<'idle' | 'settling' | 'done' | 'error'>('idle');
    const [txError, setTxError] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);
    const { addTransaction } = useTransactionContext();

    const isCall = option.optionType === OptionType.CALL;
    const collateral = isCall
        ? option.underlyingAmount
        : option.strikePrice * option.underlyingAmount;
    const collateralToken = isCall ? 'MOTO' : 'PILL';

    const busy = txStatus === 'settling';

    async function handleSettle() {
        if (!address) return;
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

            const call = await poolContract['settle'](option.id);
            const receipt = await call.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress ?? '',
                maximumAllowedSatToSpend: MAX_SAT,
                network,
            });
            setTxId(receipt.transactionId);
            addTransaction({
                txId: receipt.transactionId, type: 'settle', status: 'broadcast',
                poolAddress, broadcastBlock: null,
                label: `Settle Option #${option.id}`, flowId: null, flowStep: null, meta: {},
            });
            setTxStatus('done');
        } catch (err) {
            setTxError(err instanceof Error ? err.message : 'Settle failed');
            setTxStatus('error');
        }
    }

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            data-testid="settle-modal-backdrop"
        >
            <div
                className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl w-full max-w-sm shadow-2xl"
                data-testid="settle-option-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-terminal-text-primary font-mono">
                            Settle Option{' '}
                            <span className="text-terminal-text-muted">#{option.id.toString()}</span>
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

                    {/* Collateral recovery info */}
                    <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3 text-xs font-mono space-y-1.5">
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Collateral to recover</span>
                            <span className="text-terminal-text-primary font-semibold">
                                {fmt(collateral)} {collateralToken}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Settle fee</span>
                            <span className="text-green-400">None</span>
                        </div>
                    </div>

                    <p className="text-terminal-text-muted text-xs font-mono">
                        The option was not exercised within the grace period. Settling returns your
                        full collateral.
                    </p>

                    {/* TX error */}
                    {txError && (
                        <p className="text-rose-400 text-xs font-mono" data-testid="tx-error">
                            {txError}
                        </p>
                    )}

                    {/* Success */}
                    {txStatus === 'done' && txId && (
                        <div className="bg-green-900/20 border border-green-700 rounded p-3 text-xs font-mono">
                            <p className="text-green-300 mb-1">Settlement broadcast!</p>
                            <p className="text-terminal-text-muted break-all">{txId}</p>
                            <button className="mt-2 btn-primary px-3 py-1 text-xs rounded" onClick={onSuccess}>
                                Done
                            </button>
                        </div>
                    )}

                    {/* Action buttons */}
                    {txStatus !== 'done' && (
                        <div className="space-y-2">
                            <button
                                onClick={handleSettle}
                                disabled={busy}
                                className="w-full btn-primary py-2.5 text-sm rounded disabled:opacity-50"
                                data-testid="btn-settle"
                            >
                                {busy ? 'Settling…' : 'Confirm Settle'}
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
