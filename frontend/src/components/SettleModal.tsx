/**
 * SettleModal — lets a writer settle an EXPIRED/unexercised option and recover collateral.
 *
 * Settle is available when: buyer never exercised and the grace period has passed.
 * No approval needed — collateral is already in the contract.
 */
import { useState, useRef } from 'react';
import { useMountedRef } from '../hooks/useMountedRef.ts';
import { getContract } from 'opnet';
import type { AbstractRpcProvider } from 'opnet';
import type { Address } from '@btc-vision/transaction';
import type { OptionData } from '../services/types.ts';
import { OptionType } from '../services/types.ts';
import { POOL_WRITE_ABI } from '../services/poolAbi.ts';
import { formatTokenAmount } from '../config/index.ts';
import { useTransactionContext } from '../hooks/useTransactionContext.ts';
import { TransactionReceipt } from './TransactionReceipt.tsx';
import { formatTxError } from '../utils/formatTxError.ts';
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
    const mounted = useMountedRef();
    const sendingRef = useRef(false);
    const [txStatus, setTxStatus] = useState<'idle' | 'settling' | 'done' | 'error'>('idle');
    const [txError, setTxError] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);
    const { addTransaction } = useTransactionContext();

    const isCall = option.optionType === OptionType.CALL;
    // Fixed-point: (strike * amount) / 1e18 — both are 18-decimal
    const collateral = isCall
        ? option.underlyingAmount
        : (option.strikePrice * option.underlyingAmount) / (10n ** 18n);
    const collateralToken = isCall ? 'MOTO' : 'PILL';

    const busy = txStatus === 'settling';

    async function handleSettle() {
        if (!address || sendingRef.current) return;
        sendingRef.current = true;
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
            if (!mounted.current) return;
            setTxId(receipt.transactionId);
            const typeLabel_ = isCall ? 'CALL' : 'PUT';
            addTransaction({
                txId: receipt.transactionId, type: 'settle', status: 'broadcast',
                poolAddress, broadcastBlock: null,
                label: `Settle ${typeLabel_} #${option.id} — recover ${fmt(collateral)} ${collateralToken}`,
                flowId: null, flowStep: null,
                meta: {
                    optionId: option.id.toString(),
                    optionType: typeLabel_,
                    collateral: fmt(collateral),
                    collateralToken,
                },
            });
            setTxStatus('done');
        } catch (err) {
            if (!mounted.current) return;
            setTxError(err instanceof Error ? err.message : 'Settle failed');
            setTxStatus('error');
        } finally {
            sendingRef.current = false;
        }
    }

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            data-testid="settle-modal-backdrop"
        >
            <div
                className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto"
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

                    {/* TX error with retry */}
                    {txError && (
                        <div className="bg-rose-900/10 border border-rose-800 rounded p-3 text-xs font-mono space-y-2" data-testid="tx-error">
                            <p className="text-rose-400">{formatTxError(txError).message}</p>
                            <p className="text-terminal-text-muted">{formatTxError(txError).guidance}</p>
                            <button
                                onClick={() => { setTxError(null); setTxStatus('idle'); }}
                                className="btn-secondary px-3 py-1 text-xs rounded"
                                data-testid="btn-retry"
                            >
                                Retry
                            </button>
                        </div>
                    )}

                    {/* Success receipt */}
                    {txStatus === 'done' && txId && (
                        <TransactionReceipt
                            type="settle"
                            txId={txId}
                            movements={[
                                { direction: 'credit', amount: fmt(collateral), token: collateralToken, label: 'Collateral returned' },
                            ]}
                            onDone={onSuccess}
                        />
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
