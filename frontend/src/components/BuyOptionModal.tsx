/**
 * BuyOptionModal — confirmation modal for purchasing an open option.
 *
 * Two-step flow:
 *   1. Approve PILL (if allowance < total cost)
 *   2. buyOption(optionId)
 */
import { useEffect, useState, useMemo } from 'react';
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
import { calcTotalCost, calcBreakeven, calcDelta, calcTheta, blocksToYears } from '../utils/optionMath.js';
import { PnLChart } from './PnLChart.tsx';
import type { WalletConnectNetwork } from '@btc-vision/walletconnect';

interface BuyOptionModalProps {
    option: OptionData;
    poolInfo: PoolInfo;
    poolAddress: string;
    walletAddress: string | null;
    address: Address | null;
    provider: AbstractRpcProvider;
    network: WalletConnectNetwork;
    /** MOTO/PILL spot ratio for PnL chart and Greeks */
    motoPillRatio?: number | null;
    /** Current block for time-to-expiry calculation */
    currentBlock?: bigint;
    onClose: () => void;
    onSuccess: () => void;
}

const MAX_SAT = 10_000_000n;

function fmt(v: bigint) {
    return formatTokenAmount(v);
}

export function BuyOptionModal({
    option,
    poolInfo,
    poolAddress,
    walletAddress,
    address,
    provider,
    network,
    motoPillRatio,
    currentBlock,
    onClose,
    onSuccess,
}: BuyOptionModalProps) {
    const mounted = useMountedRef();
    const [poolHex, setPoolHex] = useState<string | null>(null);
    const [txStatus, setTxStatus] = useState<'idle' | 'approving' | 'buying' | 'done' | 'error'>('idle');
    const [txError, setTxError] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);

    const { trackApproval, trackAction, approvalConfirmed } = useTransactionFlow(poolAddress, option.id.toString());

    // Resolve pool bech32 → hex
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

    const totalCost = calcTotalCost(option.premium, poolInfo.buyFeeBps);
    const fee = totalCost - option.premium;

    // Query PILL balance + allowance for this pool
    const { info: tokenInfo, loading: tokenLoading, refetch: refetchToken } = useTokenInfo({
        tokenAddress: poolInfo.premiumToken,
        spenderHex: poolHex,
        walletAddress: address,
        provider,
    });

    const pillBalance = tokenInfo?.balance ?? null;
    const allowance = tokenInfo?.allowance ?? null;
    const hasBalance = pillBalance !== null && pillBalance >= totalCost;
    const needsApproval = !approvalConfirmed && allowance !== null && allowance < totalCost;
    const busy = txStatus === 'approving' || txStatus === 'buying';

    // Greeks (computed only when spot price available)
    const greeks = useMemo(() => {
        if (!motoPillRatio || motoPillRatio <= 0 || !currentBlock) return null;
        const blocksLeft = Number(option.expiryBlock - currentBlock);
        if (blocksLeft <= 0) return null;
        const timeYears = blocksToYears(blocksLeft);
        const strike = Number(option.strikePrice) / 1e18;
        const params = {
            spot: motoPillRatio,
            strike,
            timeYears,
            volatility: 0.8,
            optionType: option.optionType,
        };
        return {
            delta: calcDelta(params),
            theta: calcTheta(params),
        };
    }, [option, motoPillRatio, currentBlock]);

    // PnL chart toggle
    const [showChart, setShowChart] = useState(false);

    async function handleApprove() {
        if (!address || !poolHex) return;
        setTxError(null);
        setTxStatus('approving');
        try {
            const tokenContract = getContract(
                poolInfo.premiumToken,
                TOKEN_APPROVE_ABI,
                provider,
                network,
                address,
            ) as unknown as Record<string, (...args: unknown[]) => { sendTransaction: (p: unknown) => Promise<{ transactionId: string }> }>;

            const call = await tokenContract['increaseAllowance'](Address.fromString(poolHex), totalCost);
            const receipt = await call.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress ?? '',
                maximumAllowedSatToSpend: MAX_SAT,
                network,
            });
            if (!mounted.current) return;
            setTxId(receipt.transactionId);
            trackApproval(receipt.transactionId, `Approve PILL for Buy #${option.id}`);
            refetchToken();
            setTxStatus('idle');
        } catch (err) {
            if (!mounted.current) return;
            setTxError(err instanceof Error ? err.message : 'Approval failed');
            setTxStatus('error');
        }
    }

    async function handleBuy() {
        if (!address) return;
        setTxError(null);
        setTxStatus('buying');
        try {
            const poolContract = getContract(
                poolAddress,
                POOL_WRITE_ABI,
                provider,
                network,
                address,
            ) as unknown as Record<string, (...args: unknown[]) => { sendTransaction: (p: unknown) => Promise<{ transactionId: string }> }>;

            const call = await poolContract['buyOption'](option.id);
            const receipt = await call.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress ?? '',
                maximumAllowedSatToSpend: MAX_SAT,
                network,
            });
            if (!mounted.current) return;
            setTxId(receipt.transactionId);
            trackAction(receipt.transactionId, 'buyOption', `Buy Option #${option.id}`);
            setTxStatus('done');
        } catch (err) {
            if (!mounted.current) return;
            setTxError(err instanceof Error ? err.message : 'Purchase failed');
            setTxStatus('error');
        }
    }

    const typeLabel = option.optionType === OptionType.CALL ? 'CALL' : 'PUT';
    const typeColor = option.optionType === OptionType.CALL ? 'text-green-400' : 'text-rose-400';

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            data-testid="buy-modal-backdrop"
            onClick={busy ? undefined : onClose}
        >
            <div
                className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl w-full max-w-sm shadow-2xl"
                data-testid="buy-option-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-terminal-text-primary font-mono">
                            Buy Option{' '}
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

                    {/* Option summary */}
                    <div className="text-sm font-mono space-y-1.5">
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Type</span>
                            <span className={`font-semibold ${typeColor}`}>{typeLabel}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Strike</span>
                            <span className="text-terminal-text-secondary">
                                {fmt(option.strikePrice)} PILL
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Amount</span>
                            <span className="text-terminal-text-secondary">
                                {fmt(option.underlyingAmount)} MOTO
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Expiry block</span>
                            <span className="text-terminal-text-secondary">
                                {option.expiryBlock.toString()}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Breakeven</span>
                            <span className="text-cyan-300 text-xs">
                                {fmt(calcBreakeven(option) ?? 0n)} PILL
                            </span>
                        </div>
                    </div>

                    <hr className="border-terminal-border-subtle" />

                    {/* Cost breakdown */}
                    <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3 text-xs font-mono space-y-1.5">
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Premium</span>
                            <span className="text-terminal-text-secondary">{fmt(option.premium)} PILL</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">
                                Buy fee ({Number(poolInfo.buyFeeBps) / 100}%)
                            </span>
                            <span className="text-terminal-text-secondary">{fmt(fee)} PILL</span>
                        </div>
                        <hr className="border-terminal-border-subtle" />
                        <div className="flex justify-between font-semibold">
                            <span className="text-terminal-text-muted">Total</span>
                            <span className="text-terminal-text-primary">{fmt(totalCost)} PILL</span>
                        </div>
                        <div className="flex justify-between mt-1">
                            <span className="text-terminal-text-muted">Your PILL balance</span>
                            <span className={hasBalance ? 'text-green-400' : 'text-rose-400'}>
                                {tokenLoading ? '…' : pillBalance !== null ? `${fmt(pillBalance)} PILL` : '—'}
                                {hasBalance ? ' ✓' : pillBalance !== null && !hasBalance ? ' ✗' : ''}
                            </span>
                        </div>
                        {allowance !== null && (
                            <div className="flex justify-between">
                                <span className="text-terminal-text-muted">Allowance</span>
                                <span className={needsApproval ? 'text-yellow-400' : 'text-terminal-text-secondary'}>
                                    {fmt(allowance)} PILL{needsApproval ? ' ← req' : ''}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* PnL Chart + Greeks */}
                    {motoPillRatio != null && motoPillRatio > 0 && (
                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={() => setShowChart(!showChart)}
                                className="text-xs font-mono text-cyan-400 hover:text-cyan-300"
                                data-testid="toggle-pnl-chart"
                            >
                                {showChart ? 'Hide' : 'Show'} P&L at Expiry
                            </button>
                            {showChart && (
                                <PnLChart
                                    option={option}
                                    motoPillRatio={motoPillRatio}
                                    buyFeeBps={poolInfo.buyFeeBps}
                                    height={180}
                                />
                            )}
                            {greeks && (
                                <div className="flex gap-4 text-[10px] font-mono text-terminal-text-muted" data-testid="greeks">
                                    <span>Delta: <span className="text-terminal-text-secondary">{greeks.delta.toFixed(3)}</span></span>
                                    <span>Theta: <span className="text-terminal-text-secondary">{greeks.theta.toFixed(4)}/day</span></span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Insufficient balance warning */}
                    {!tokenLoading && pillBalance !== null && !hasBalance && (
                        <p className="text-rose-400 text-xs font-mono" data-testid="balance-error">
                            Insufficient PILL balance.
                        </p>
                    )}

                    {/* Approval broadcast hint */}
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
                            <p className="text-green-300 mb-1">Purchase broadcast!</p>
                            <p className="text-terminal-text-muted break-all">{txId}</p>
                            <p className="text-terminal-text-muted mt-1.5">
                                Confirms in next block (~10 min). You can close this — check the transaction pill for updates.
                            </p>
                            <button
                                className="mt-2 btn-primary px-3 py-1 text-xs rounded"
                                onClick={onSuccess}
                            >
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
                                    {txStatus === 'approving' ? 'Approving…' : txId && txStatus === 'idle' ? 'Waiting for approval' : 'Approve PILL'}
                                </button>
                            ) : (
                                <button
                                    onClick={handleBuy}
                                    disabled={busy || tokenLoading || !hasBalance}
                                    className="w-full btn-primary py-2.5 text-sm rounded disabled:opacity-50"
                                    data-testid="btn-buy"
                                >
                                    {txStatus === 'buying' ? 'Purchasing…' : 'Confirm Purchase'}
                                </button>
                            )}
                            <button
                                onClick={onClose}
                                disabled={busy}
                                className="w-full btn-secondary py-2 text-sm rounded disabled:opacity-50"
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
