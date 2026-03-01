/**
 * RollModal — lets a writer atomically cancel an OPEN option and create a new
 * one with different strike/expiry/premium in a single transaction.
 *
 * underlyingAmount is immutable on roll.
 *
 * CALL collateral is always underlyingAmount, so net delta is always 0 — only
 * the cancel fee is paid.
 * PUT collateral = strikePrice x underlyingAmount, so changing strike changes
 * collateral and may require a top-up or produce a surplus.
 */
import { useState, useEffect, useMemo } from 'react';
import { getContract } from 'opnet';
import type { AbstractRpcProvider } from 'opnet';
import type { Address } from '@btc-vision/transaction';
import type { OptionData, PoolInfo } from '../services/types.ts';
import { OptionType } from '../services/types.ts';
import { POOL_WRITE_ABI } from '../services/poolAbi.ts';
import { formatTokenAmount } from '../config/index.ts';
import { useTransactionContext } from '../hooks/useTransactionContext.ts';
import type { WalletConnectNetwork } from '@btc-vision/walletconnect';

interface RollModalProps {
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

export function RollModal({
    option,
    poolInfo,
    poolAddress,
    walletAddress,
    address,
    provider,
    network,
    onClose,
    onSuccess,
}: RollModalProps) {
    const [currentBlock, setCurrentBlock] = useState<bigint | null>(null);
    const [txStatus, setTxStatus] = useState<'idle' | 'rolling' | 'done' | 'error'>('idle');
    const [txError, setTxError] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);
    const { addTransaction } = useTransactionContext();

    const [newStrike, setNewStrike] = useState(option.strikePrice.toString());
    const [newPremium, setNewPremium] = useState(option.premium.toString());
    const [newExpiry, setNewExpiry] = useState('');

    useEffect(() => {
        let mounted = true;
        provider.getBlockNumber().then((b) => {
            if (!mounted) return;
            setCurrentBlock(b);
            setNewExpiry((prev) => prev || (b + 500n).toString());
        }).catch(() => { if (mounted) setCurrentBlock(null); });
        return () => { mounted = false; };
    }, [provider]);

    const isCall = option.optionType === OptionType.CALL;
    const collateralToken = isCall ? 'MOTO' : 'PILL';

    const oldCollateral = isCall
        ? option.underlyingAmount
        : option.strikePrice * option.underlyingAmount;

    const parsedStrike = useMemo(() => {
        try { return BigInt(newStrike); } catch { return 0n; }
    }, [newStrike]);
    const parsedPremium = useMemo(() => {
        try { return BigInt(newPremium); } catch { return 0n; }
    }, [newPremium]);
    const parsedExpiry = useMemo(() => {
        try { return BigInt(newExpiry); } catch { return 0n; }
    }, [newExpiry]);

    const newCollateral = isCall
        ? option.underlyingAmount
        : parsedStrike * option.underlyingAmount;

    const isExpired = currentBlock !== null && currentBlock >= option.expiryBlock;
    const feeBps = isExpired ? 0n : poolInfo.cancelFeeBps;
    const cancelFee = feeBps > 0n ? (oldCollateral * feeBps + 9999n) / 10000n : 0n;
    const refundAfterFee = oldCollateral - cancelFee;

    const netDelta = newCollateral - refundAfterFee;
    const isTopUp = netDelta > 0n;
    const isSurplus = netDelta < 0n;

    const inputValid =
        parsedStrike > 0n &&
        parsedPremium > 0n &&
        parsedExpiry > 0n &&
        (currentBlock === null || parsedExpiry > currentBlock);

    const busy = txStatus === 'rolling';

    async function handleRoll() {
        if (!address || !inputValid) return;
        setTxError(null);
        setTxStatus('rolling');
        try {
            const poolContract = getContract(
                poolAddress,
                POOL_WRITE_ABI,
                provider,
                network,
                address,
            ) as unknown as Record<string, (...args: unknown[]) => { sendTransaction: (p: unknown) => Promise<{ transactionId: string; result?: unknown[] }> }>;

            const call = await poolContract['rollOption'](
                option.id,
                parsedStrike,
                parsedExpiry,
                parsedPremium,
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
                type: 'rollOption',
                status: 'broadcast',
                poolAddress,
                broadcastBlock: null,
                label: `Roll Option #${option.id}`,
                flowId: null,
                flowStep: null,
                meta: {},
            });
            setTxStatus('done');
        } catch (err) {
            setTxError(err instanceof Error ? err.message : 'Roll failed');
            setTxStatus('error');
        }
    }

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            data-testid="roll-modal-backdrop"
        >
            <div
                className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl w-full max-w-md shadow-2xl"
                data-testid="roll-option-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-terminal-text-primary font-mono">
                            Roll Option{' '}
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

                    {/* Current option params (read-only) */}
                    <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3 text-xs font-mono space-y-1">
                        <p className="text-terminal-text-muted mb-1 font-semibold">Current Option</p>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Type</span>
                            <span className="text-terminal-text-secondary">{isCall ? 'CALL' : 'PUT'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Strike</span>
                            <span className="text-terminal-text-secondary">{fmt(option.strikePrice)} PILL</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Premium</span>
                            <span className="text-terminal-text-secondary">{fmt(option.premium)} PILL</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Expiry</span>
                            <span className="text-terminal-text-secondary">Block {option.expiryBlock.toString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Amount</span>
                            <span className="text-terminal-text-secondary">{fmt(option.underlyingAmount)} MOTO</span>
                        </div>
                    </div>

                    {/* New params input */}
                    {txStatus !== 'done' && (
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-mono text-terminal-text-muted block mb-1">
                                    New Strike Price
                                </label>
                                <input
                                    type="text"
                                    value={newStrike}
                                    onChange={(e) => setNewStrike(e.target.value)}
                                    className="w-full bg-terminal-bg-primary border border-terminal-border-subtle rounded px-3 py-2 text-sm font-mono text-terminal-text-primary"
                                    data-testid="input-new-strike"
                                    disabled={busy}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-mono text-terminal-text-muted block mb-1">
                                    New Premium
                                </label>
                                <input
                                    type="text"
                                    value={newPremium}
                                    onChange={(e) => setNewPremium(e.target.value)}
                                    className="w-full bg-terminal-bg-primary border border-terminal-border-subtle rounded px-3 py-2 text-sm font-mono text-terminal-text-primary"
                                    data-testid="input-new-premium"
                                    disabled={busy}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-mono text-terminal-text-muted block mb-1">
                                    New Expiry Block
                                </label>
                                <input
                                    type="text"
                                    value={newExpiry}
                                    onChange={(e) => setNewExpiry(e.target.value)}
                                    className="w-full bg-terminal-bg-primary border border-terminal-border-subtle rounded px-3 py-2 text-sm font-mono text-terminal-text-primary"
                                    data-testid="input-new-expiry"
                                    disabled={busy}
                                />
                            </div>
                        </div>
                    )}

                    {/* Collateral breakdown */}
                    <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3 text-xs font-mono space-y-1.5">
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Old collateral</span>
                            <span className="text-terminal-text-secondary">{fmt(oldCollateral)} {collateralToken}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">
                                Cancel fee ({isExpired ? '0%' : `${Number(poolInfo.cancelFeeBps) / 100}%`})
                            </span>
                            <span className={isExpired ? 'text-green-400' : 'text-terminal-text-secondary'}>
                                {fmt(cancelFee)} {collateralToken}{isExpired ? ' (waived)' : ''}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">New collateral</span>
                            <span className="text-terminal-text-secondary">{fmt(newCollateral)} {collateralToken}</span>
                        </div>
                        <hr className="border-terminal-border-subtle" />
                        <div className="flex justify-between font-semibold">
                            <span className="text-terminal-text-muted">Net change</span>
                            <span className={isTopUp ? 'text-rose-400' : isSurplus ? 'text-green-400' : 'text-terminal-text-primary'}>
                                {isTopUp ? `+${fmt(netDelta)}` : isSurplus ? `-${fmt(-netDelta)}` : '0'} {collateralToken}
                                {isTopUp ? ' (top-up)' : isSurplus ? ' (surplus)' : ''}
                            </span>
                        </div>
                    </div>

                    {/* TX error */}
                    {txError && (
                        <p className="text-rose-400 text-xs font-mono" data-testid="tx-error">
                            {txError}
                        </p>
                    )}

                    {/* Success */}
                    {txStatus === 'done' && txId && (
                        <div className="bg-green-900/20 border border-green-700 rounded p-3 text-xs font-mono">
                            <p className="text-green-300 mb-1">Roll broadcast!</p>
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
                                onClick={handleRoll}
                                disabled={busy || !inputValid}
                                className="w-full btn-primary py-2.5 text-sm rounded disabled:opacity-50"
                                data-testid="btn-roll-confirm"
                            >
                                {busy ? 'Rolling...' : 'Roll Option'}
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
