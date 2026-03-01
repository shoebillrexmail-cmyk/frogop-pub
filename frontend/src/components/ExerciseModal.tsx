/**
 * ExerciseModal — lets a buyer exercise a PURCHASED option.
 *
 * For a CALL: buyer pays strikePrice × underlyingAmount PILL, receives underlyingAmount MOTO.
 * Exercise fee = exerciseFeeBps % of underlyingAmount, deducted from MOTO payout.
 *
 * Two-step: Approve PILL → exercise()
 */
import { useEffect, useState, useRef } from 'react';
import { useMountedRef } from '../hooks/useMountedRef.ts';
import { getContract } from 'opnet';
import type { AbstractRpcProvider } from 'opnet';
import { Address } from '@btc-vision/transaction';
import type { OptionData, PoolInfo } from '../services/types.ts';
import { OptionType } from '../services/types.ts';
import { POOL_WRITE_ABI, TOKEN_APPROVE_ABI } from '../services/poolAbi.ts';
import { useTokenInfo } from '../hooks/useTokenInfo.ts';
import { formatTokenAmount } from '../config/index.ts';
import { useTransactionFlow } from '../hooks/useTransactionFlow.ts';
import { useActiveFlow } from '../hooks/useActiveFlow.ts';
import { calcExercisePnl } from '../utils/optionMath.js';
import type { WalletConnectNetwork } from '@btc-vision/walletconnect';

interface ExerciseModalProps {
    option: OptionData;
    poolInfo: PoolInfo;
    poolAddress: string;
    walletAddress: string | null;
    address: Address | null;
    provider: AbstractRpcProvider;
    network: WalletConnectNetwork;
    motoPillRatio?: number | null;
    onClose: () => void;
    onSuccess: () => void;
}

const MAX_SAT = 10_000_000n;

function fmt(v: bigint) {
    return formatTokenAmount(v);
}

export function ExerciseModal({
    option,
    poolInfo,
    poolAddress,
    walletAddress,
    address,
    provider,
    network,
    motoPillRatio,
    onClose,
    onSuccess,
}: ExerciseModalProps) {
    const mounted = useMountedRef();
    const sendingRef = useRef(false);
    const [poolHex, setPoolHex] = useState<string | null>(null);
    const [txStatus, setTxStatus] = useState<'idle' | 'approving' | 'exercising' | 'done' | 'error'>('idle');
    const [txError, setTxError] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);

    const { trackApproval, trackAction, approvalConfirmed } = useTransactionFlow(poolAddress, option.id.toString());

    const {
        canStartFlow, approvalReady, claimFlow, updateFlow, isMyFlow,
    } = useActiveFlow({
        actionType: 'exercise',
        poolAddress,
        optionId: option.id.toString(),
        label: `Exercise Option #${option.id}`,
    });

    useEffect(() => {
        if (poolAddress.startsWith('0x')) {
            setPoolHex(poolAddress);
        } else {
            provider
                .getPublicKeyInfo(poolAddress, true)
                .then((info: { toString(): string }) => { if (mounted.current) setPoolHex(info.toString()); })
                .catch(() => { if (mounted.current) setPoolHex(null); });
        }
    }, [poolAddress, provider]); // eslint-disable-line react-hooks/exhaustive-deps

    const isCall = option.optionType === OptionType.CALL;
    // Normalize: both are 18-decimal, product is 36-decimal → divide by 10^18
    const strikeValue = (option.strikePrice * option.underlyingAmount) / (10n ** 18n);

    // CALL: buyer pays strikeValue PILL, receives underlyingAmount MOTO (fee on MOTO)
    // PUT:  buyer pays underlyingAmount MOTO, receives strikeValue PILL (fee on PILL)
    const feeBase = isCall ? option.underlyingAmount : strikeValue;
    const exerciseFee = poolInfo.exerciseFeeBps > 0n
        ? (feeBase * poolInfo.exerciseFeeBps + 9999n) / 10000n
        : 0n;

    // What the buyer pays to the writer
    const payAmount = isCall ? strikeValue : option.underlyingAmount;
    const payToken = isCall ? 'PILL' : 'MOTO';
    // What the buyer receives (minus fee)
    const receiveAmount = feeBase - exerciseFee;
    const receiveToken = isCall ? 'MOTO' : 'PILL';

    // Approval: CALL needs PILL allowance for strikeValue; PUT needs MOTO allowance for underlyingAmount
    const approvalTokenAddress = isCall ? poolInfo.premiumToken : poolInfo.underlying;
    const { info: tokenInfo, loading: tokenLoading, refetch: refetchToken } = useTokenInfo({
        tokenAddress: approvalTokenAddress,
        spenderHex: poolHex,
        walletAddress: address,
        provider,
    });

    const tokenBalance = tokenInfo?.balance ?? null;
    const allowance = tokenInfo?.allowance ?? null;
    const hasBalance = tokenBalance !== null && tokenBalance >= payAmount;
    const needsApproval = !approvalConfirmed && !approvalReady && allowance !== null && allowance < payAmount;
    const busy = txStatus === 'approving' || txStatus === 'exercising';

    async function handleApprove() {
        if (!address || !poolHex || sendingRef.current) return;
        if (!canStartFlow) return;
        const claimed = claimFlow();
        if (!claimed) return;
        sendingRef.current = true;
        setTxError(null);
        setTxStatus('approving');
        try {
            const tokenContract = getContract(
                approvalTokenAddress,
                TOKEN_APPROVE_ABI,
                provider,
                network,
                address,
            ) as unknown as Record<string, (...args: unknown[]) => { sendTransaction: (p: unknown) => Promise<{ transactionId: string }> }>;

            const call = await tokenContract['increaseAllowance'](Address.fromString(poolHex), payAmount);
            const receipt = await call.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress ?? '',
                maximumAllowedSatToSpend: MAX_SAT,
                network,
            });
            if (!mounted.current) return;
            setTxId(receipt.transactionId);
            trackApproval(receipt.transactionId, `Approve ${payToken} for Exercise #${option.id}`);
            updateFlow({ approvalTxId: receipt.transactionId });
            refetchToken();
            setTxStatus('idle');
        } catch (err) {
            if (!mounted.current) return;
            const msg = err instanceof Error ? err.message : 'Approval failed';
            setTxError(msg.includes('mempool-chain') ? 'Too many pending transactions. Wait for a confirmation before starting another.' : msg);
            updateFlow({ status: 'approval_failed' });
            setTxStatus('error');
        } finally {
            sendingRef.current = false;
        }
    }

    async function handleExercise() {
        if (!address || sendingRef.current) return;
        sendingRef.current = true;
        setTxError(null);
        setTxStatus('exercising');
        try {
            if (isMyFlow) updateFlow({ status: 'action_pending' });
            const poolContract = getContract(
                poolAddress,
                POOL_WRITE_ABI,
                provider,
                network,
                address,
            ) as unknown as Record<string, (...args: unknown[]) => { sendTransaction: (p: unknown) => Promise<{ transactionId: string }> }>;

            const call = await poolContract['exercise'](option.id);
            const receipt = await call.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress ?? '',
                maximumAllowedSatToSpend: MAX_SAT,
                network,
            });
            if (!mounted.current) return;
            setTxId(receipt.transactionId);
            trackAction(receipt.transactionId, 'exercise', `Exercise Option #${option.id}`);
            if (isMyFlow) updateFlow({ actionTxId: receipt.transactionId });
            setTxStatus('done');
        } catch (err) {
            if (!mounted.current) return;
            const msg = err instanceof Error ? err.message : 'Exercise failed';
            setTxError(msg.includes('mempool-chain') ? 'Too many pending transactions. Wait for a confirmation before starting another.' : msg);
            if (isMyFlow) updateFlow({ status: 'action_failed' });
            setTxStatus('error');
        } finally {
            sendingRef.current = false;
        }
    }

    const typeLabel = isCall ? 'CALL' : 'PUT';
    const typeColor = isCall ? 'text-green-400' : 'text-rose-400';

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            data-testid="exercise-modal-backdrop"
        >
            <div
                className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl w-full max-w-sm shadow-2xl"
                data-testid="exercise-option-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-terminal-text-primary font-mono">
                            Exercise Option{' '}
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

                    {/* Option type */}
                    <div className="text-sm font-mono flex items-center gap-2">
                        <span className="text-terminal-text-muted">Type</span>
                        <span className={`font-semibold ${typeColor}`}>{typeLabel}</span>
                    </div>

                    {/* Cost / payout breakdown */}
                    <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3 text-xs font-mono space-y-1.5">
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">{payToken} you pay</span>
                            <span className="text-terminal-text-secondary">{fmt(payAmount)} {payToken}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">
                                Exercise fee ({Number(poolInfo.exerciseFeeBps) / 100}%)
                            </span>
                            <span className="text-terminal-text-secondary">
                                {fmt(exerciseFee)} {receiveToken}
                            </span>
                        </div>
                        <hr className="border-terminal-border-subtle" />
                        <div className="flex justify-between font-semibold">
                            <span className="text-terminal-text-muted">{receiveToken} you receive</span>
                            <span className="text-terminal-text-primary">{fmt(receiveAmount)} {receiveToken}</span>
                        </div>
                        {tokenBalance !== null && (
                            <div className="flex justify-between mt-1">
                                <span className="text-terminal-text-muted">Your {payToken} balance</span>
                                <span className={hasBalance ? 'text-green-400' : 'text-rose-400'}>
                                    {tokenLoading ? '…' : `${fmt(tokenBalance)} ${payToken}`}
                                    {hasBalance ? ' ✓' : ' ✗'}
                                </span>
                            </div>
                        )}
                        {allowance !== null && (
                            <div className="flex justify-between">
                                <span className="text-terminal-text-muted">Allowance</span>
                                <span className={needsApproval ? 'text-yellow-400' : 'text-terminal-text-secondary'}>
                                    {fmt(allowance)} {payToken}{needsApproval ? ' ← req' : ''}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* PnL summary */}
                    <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3 text-xs font-mono space-y-1.5">
                        <p className="text-terminal-text-muted font-semibold mb-1">PnL Estimate</p>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Premium paid</span>
                            <span className="text-terminal-text-secondary">{fmt(option.premium)} PILL</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Exercise cost</span>
                            <span className="text-terminal-text-secondary">{fmt(payAmount)} {payToken}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Fee</span>
                            <span className="text-terminal-text-secondary">{fmt(exerciseFee)} {receiveToken}</span>
                        </div>
                        <hr className="border-terminal-border-subtle" />
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">You receive</span>
                            <span className="text-terminal-text-primary font-semibold">
                                {fmt(receiveAmount)} {receiveToken}
                                {motoPillRatio && isCall && (
                                    <span className="text-terminal-text-muted font-normal ml-1">
                                        (~{(Number(receiveAmount) / 1e18 * motoPillRatio).toFixed(2)} PILL eq.)
                                    </span>
                                )}
                            </span>
                        </div>
                        {(() => {
                            const pnl = calcExercisePnl(option, poolInfo, motoPillRatio ?? null);
                            if (pnl === null) return null;
                            return (
                                <div className="flex justify-between">
                                    <span className="text-terminal-text-muted">Est. PnL</span>
                                    <span className={pnl >= 0 ? 'text-green-400 font-semibold' : 'text-rose-400 font-semibold'}>
                                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(4)} PILL
                                    </span>
                                </div>
                            );
                        })()}
                    </div>

                    {/* Flow limit warning */}
                    {!canStartFlow && (
                        <p className="text-yellow-400 text-xs font-mono" data-testid="flow-blocked">
                            Too many pending transaction flows. Complete or abandon one first.
                        </p>
                    )}

                    {/* Insufficient balance */}
                    {!tokenLoading && tokenBalance !== null && !hasBalance && (
                        <p className="text-rose-400 text-xs font-mono" data-testid="balance-error">
                            Insufficient {payToken} balance.
                        </p>
                    )}

                    {/* Approval hint */}
                    {txId && txStatus === 'idle' && (
                        <div className="flex items-center gap-2 text-xs font-mono">
                            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                            <span className="text-yellow-400">
                                Waiting for approval (~10 min)... {txId.slice(0, 12)}…
                            </span>
                        </div>
                    )}

                    {/* TX error */}
                    {txError && (
                        <p className="text-rose-400 text-xs font-mono" data-testid="tx-error">
                            {txError}
                        </p>
                    )}

                    {/* Success */}
                    {txStatus === 'done' && txId && (
                        <div className="bg-green-900/20 border border-green-700 rounded p-3 text-xs font-mono">
                            <p className="text-green-300 mb-1">Exercise broadcast!</p>
                            <p className="text-terminal-text-muted break-all">{txId}</p>
                            <p className="text-terminal-text-muted mt-1.5">
                                Confirms in next block (~10 min). You can close this — check the transaction pill for updates.
                            </p>
                            <button className="mt-2 btn-primary px-3 py-1 text-xs rounded" onClick={onSuccess}>
                                Done
                            </button>
                        </div>
                    )}

                    {/* Action buttons */}
                    {txStatus !== 'done' && (
                        <div className="space-y-2">
                            {needsApproval ? (
                                <button
                                    onClick={handleApprove}
                                    disabled={busy || tokenLoading || !hasBalance}
                                    className="w-full btn-primary py-2.5 text-sm rounded disabled:opacity-50"
                                    data-testid="btn-approve"
                                >
                                    {txStatus === 'approving' ? 'Approving…' : `Approve ${payToken}`}
                                </button>
                            ) : (
                                <button
                                    onClick={handleExercise}
                                    disabled={busy || tokenLoading || !hasBalance}
                                    className="w-full btn-primary py-2.5 text-sm rounded disabled:opacity-50"
                                    data-testid="btn-exercise"
                                >
                                    {txStatus === 'exercising' ? 'Exercising…' : 'Confirm Exercise'}
                                </button>
                            )}
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
