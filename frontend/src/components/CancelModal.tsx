/**
 * CancelModal — lets a writer cancel an OPEN option and recover collateral.
 *
 * CALL collateral = underlyingAmount MOTO.
 * PUT  collateral = strikePrice × underlyingAmount PILL.
 * Cancel fee = cancelFeeBps % of collateral (ceiling division to match contract).
 * If the option has expired (expiryBlock <= currentBlock), the fee drops to 0%.
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

interface CancelModalProps {
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

export function CancelModal({
    option,
    poolInfo,
    poolAddress,
    walletAddress,
    address,
    provider,
    network,
    onClose,
    onSuccess,
}: CancelModalProps) {
    const [currentBlock, setCurrentBlock] = useState<bigint | null>(null);
    const [txStatus, setTxStatus] = useState<'idle' | 'cancelling' | 'done' | 'error'>('idle');
    const [txError, setTxError] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);
    const { addTransaction } = useTransactionContext();

    // Fetch current block to determine if expired (0% fee)
    useEffect(() => {
        provider.getBlockNumber().then(setCurrentBlock).catch(() => setCurrentBlock(null));
    }, [provider]);

    const isCall = option.optionType === OptionType.CALL;
    // Fixed-point: (strike * amount) / 1e18 — both are 18-decimal
    const collateral = isCall
        ? option.underlyingAmount
        : (option.strikePrice * option.underlyingAmount) / (10n ** 18n);
    const collateralToken = isCall ? 'MOTO' : 'PILL';

    const isExpired = currentBlock !== null && currentBlock >= option.expiryBlock;
    const feeBps = isExpired ? 0n : poolInfo.cancelFeeBps;
    const fee = feeBps > 0n ? (collateral * feeBps + 9999n) / 10000n : 0n;
    const returned = collateral - fee;

    const busy = txStatus === 'cancelling';

    async function handleCancel() {
        if (!address) return;
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

            const call = await poolContract['cancelOption'](option.id);
            const receipt = await call.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress ?? '',
                maximumAllowedSatToSpend: MAX_SAT,
                network,
            });
            setTxId(receipt.transactionId);
            addTransaction({
                txId: receipt.transactionId, type: 'cancelOption', status: 'broadcast',
                poolAddress, broadcastBlock: null,
                label: `Cancel Option #${option.id}`, flowId: null, flowStep: null, meta: {},
            });
            setTxStatus('done');
        } catch (err) {
            setTxError(err instanceof Error ? err.message : 'Cancel failed');
            setTxStatus('error');
        }
    }

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            data-testid="cancel-modal-backdrop"
        >
            <div
                className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl w-full max-w-sm shadow-2xl"
                data-testid="cancel-option-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-terminal-text-primary font-mono">
                            Cancel Option{' '}
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

                    {/* Collateral breakdown */}
                    <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3 text-xs font-mono space-y-1.5">
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Collateral locked</span>
                            <span className="text-terminal-text-secondary">{fmt(collateral)} {collateralToken}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">
                                Cancel fee ({isExpired ? '0%' : `${Number(poolInfo.cancelFeeBps) / 100}%`})
                            </span>
                            <span className={isExpired ? 'text-green-400' : 'text-terminal-text-secondary'}>
                                {fmt(fee)} {collateralToken}{isExpired ? ' (waived)' : ''}
                            </span>
                        </div>
                        <hr className="border-terminal-border-subtle" />
                        <div className="flex justify-between font-semibold">
                            <span className="text-terminal-text-muted">You receive</span>
                            <span className="text-terminal-text-primary">{fmt(returned)} {collateralToken}</span>
                        </div>
                    </div>

                    {isExpired && (
                        <p className="text-green-400 text-xs font-mono">
                            Option expired — no cancellation fee applies.
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
                            <p className="text-green-300 mb-1">Cancellation broadcast!</p>
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
                            <button
                                onClick={handleCancel}
                                disabled={busy}
                                className="w-full btn-primary py-2.5 text-sm rounded disabled:opacity-50"
                                data-testid="btn-cancel-confirm"
                            >
                                {busy ? 'Cancelling…' : 'Confirm Cancel'}
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
