/**
 * ExerciseModal — lets a buyer exercise a PURCHASED option.
 *
 * For a CALL: buyer pays strikePrice × underlyingAmount PILL, receives underlyingAmount MOTO.
 * Exercise fee = exerciseFeeBps % of underlyingAmount, deducted from MOTO payout.
 *
 * Two-step: Approve PILL → exercise()
 */
import { useEffect, useState } from 'react';
import { getContract } from 'opnet';
import type { AbstractRpcProvider } from 'opnet';
import type { Address } from '@btc-vision/transaction';
import type { OptionData, PoolInfo } from '../services/types.ts';
import { OptionType } from '../services/types.ts';
import { POOL_WRITE_ABI, TOKEN_APPROVE_ABI } from '../services/poolAbi.ts';
import { useTokenInfo } from '../hooks/useTokenInfo.ts';
import { formatTokenAmount } from '../config/index.ts';
import type { WalletConnectNetwork } from '@btc-vision/walletconnect';

interface ExerciseModalProps {
    option: OptionData;
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
    onClose,
    onSuccess,
}: ExerciseModalProps) {
    const [poolHex, setPoolHex] = useState<string | null>(null);
    const [txStatus, setTxStatus] = useState<'idle' | 'approving' | 'exercising' | 'done' | 'error'>('idle');
    const [txError, setTxError] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);

    useEffect(() => {
        if (poolAddress.startsWith('0x')) {
            setPoolHex(poolAddress);
        } else {
            provider
                .getPublicKeyInfo(poolAddress, true)
                .then((info: { toString(): string }) => setPoolHex(info.toString()))
                .catch(() => setPoolHex(null));
        }
    }, [poolAddress, provider]);

    const isCall = option.optionType === OptionType.CALL;

    // For CALL: PILL cost = strikePrice * underlyingAmount (raw strike × underlying wei = PILL wei)
    // For PUT: buyer pays underlyingAmount MOTO, receives strikePrice * underlyingAmount PILL
    // Exercise fee (MOTO) = underlyingAmount * exerciseFeeBps / 10000
    const exerciseFee = (option.underlyingAmount * poolInfo.exerciseFeeBps) / 10000n;
    const pillCost = isCall ? option.strikePrice * option.underlyingAmount : 0n;
    const motoPayout = isCall ? option.underlyingAmount - exerciseFee : option.underlyingAmount;

    // For CALL, need PILL allowance = pillCost
    const { info: tokenInfo, loading: tokenLoading, refetch: refetchToken } = useTokenInfo({
        tokenAddress: isCall ? poolInfo.premiumToken : null,
        spenderHex: poolHex,
        walletAddress: address,
        provider,
    });

    const pillBalance = tokenInfo?.balance ?? null;
    const allowance = tokenInfo?.allowance ?? null;
    const hasBalance = !isCall || (pillBalance !== null && pillBalance >= pillCost);
    const needsApproval = isCall && allowance !== null && allowance < pillCost;
    const busy = txStatus === 'approving' || txStatus === 'exercising';

    async function handleApprove() {
        if (!address || !poolHex || !isCall) return;
        setTxError(null);
        setTxStatus('approving');
        try {
            const tokenContract = getContract(
                poolInfo.premiumToken,
                TOKEN_APPROVE_ABI,
                provider,
                network,
                address,
            ) as Record<string, (...args: unknown[]) => { sendTransaction: (p: unknown) => Promise<{ transactionId: string }> }>;

            const call = await tokenContract['increaseAllowance'](poolHex, pillCost);
            const receipt = await call.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress ?? '',
                maximumAllowedSatToSpend: MAX_SAT,
                network,
            });
            setTxId(receipt.transactionId);
            refetchToken();
            setTxStatus('idle');
        } catch (err) {
            setTxError(err instanceof Error ? err.message : 'Approval failed');
            setTxStatus('error');
        }
    }

    async function handleExercise() {
        if (!address) return;
        setTxError(null);
        setTxStatus('exercising');
        try {
            const poolContract = getContract(
                poolAddress,
                POOL_WRITE_ABI,
                provider,
                network,
                address,
            ) as Record<string, (...args: unknown[]) => { sendTransaction: (p: unknown) => Promise<{ transactionId: string }> }>;

            const call = await poolContract['exercise'](option.id);
            const receipt = await call.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress ?? '',
                maximumAllowedSatToSpend: MAX_SAT,
                network,
            });
            setTxId(receipt.transactionId);
            setTxStatus('done');
        } catch (err) {
            setTxError(err instanceof Error ? err.message : 'Exercise failed');
            setTxStatus('error');
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
                        {isCall && (
                            <>
                                <div className="flex justify-between">
                                    <span className="text-terminal-text-muted">PILL you pay</span>
                                    <span className="text-terminal-text-secondary">{fmt(pillCost)} PILL</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-terminal-text-muted">
                                        Exercise fee ({Number(poolInfo.exerciseFeeBps) / 100}%)
                                    </span>
                                    <span className="text-terminal-text-secondary">
                                        {fmt(exerciseFee)} MOTO
                                    </span>
                                </div>
                                <hr className="border-terminal-border-subtle" />
                                <div className="flex justify-between font-semibold">
                                    <span className="text-terminal-text-muted">MOTO you receive</span>
                                    <span className="text-terminal-text-primary">{fmt(motoPayout)} MOTO</span>
                                </div>
                                {pillBalance !== null && (
                                    <div className="flex justify-between mt-1">
                                        <span className="text-terminal-text-muted">Your PILL balance</span>
                                        <span className={hasBalance ? 'text-green-400' : 'text-rose-400'}>
                                            {tokenLoading ? '…' : `${fmt(pillBalance)} PILL`}
                                            {hasBalance ? ' ✓' : ' ✗'}
                                        </span>
                                    </div>
                                )}
                                {allowance !== null && (
                                    <div className="flex justify-between">
                                        <span className="text-terminal-text-muted">Allowance</span>
                                        <span className={needsApproval ? 'text-yellow-400' : 'text-terminal-text-secondary'}>
                                            {fmt(allowance)} PILL{needsApproval ? ' ← req' : ''}
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                        {!isCall && (
                            <>
                                <div className="flex justify-between">
                                    <span className="text-terminal-text-muted">MOTO you receive</span>
                                    <span className="text-terminal-text-primary">{fmt(motoPayout)} MOTO</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-terminal-text-muted">
                                        Exercise fee ({Number(poolInfo.exerciseFeeBps) / 100}%)
                                    </span>
                                    <span className="text-terminal-text-secondary">
                                        {fmt(exerciseFee)} MOTO
                                    </span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Insufficient balance */}
                    {isCall && !tokenLoading && pillBalance !== null && !hasBalance && (
                        <p className="text-rose-400 text-xs font-mono" data-testid="balance-error">
                            Insufficient PILL balance.
                        </p>
                    )}

                    {/* Approval hint */}
                    {txId && txStatus === 'idle' && (
                        <p className="text-yellow-400 text-xs font-mono">
                            Approval broadcast ({txId.slice(0, 12)}…). Waiting for confirmation.
                        </p>
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
                                    {txStatus === 'approving' ? 'Approving…' : 'Approve PILL'}
                                </button>
                            ) : (
                                <button
                                    onClick={handleExercise}
                                    disabled={busy || (isCall && (tokenLoading || !hasBalance))}
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
