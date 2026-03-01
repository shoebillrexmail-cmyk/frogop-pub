/**
 * TransferModal — lets a buyer transfer a PURCHASED option to another wallet.
 *
 * Single-step modal (no approval needed — no tokens change hands).
 * Accepts bech32 (opt1...) or hex (0x...) recipient address.
 * Resolves bech32 to hex via provider.getPublicKeyInfo().
 */
import { useState } from 'react';
import { getContract } from 'opnet';
import type { AbstractRpcProvider } from 'opnet';
import { Address } from '@btc-vision/transaction';
import type { OptionData } from '../services/types.ts';
import { POOL_WRITE_ABI } from '../services/poolAbi.ts';
import { useTransactionContext } from '../hooks/useTransactionContext.ts';
import type { WalletConnectNetwork } from '@btc-vision/walletconnect';

interface TransferModalProps {
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

export function TransferModal({
    option,
    poolAddress,
    walletAddress,
    address,
    provider,
    network,
    onClose,
    onSuccess,
}: TransferModalProps) {
    const [recipientInput, setRecipientInput] = useState('');
    const [resolvedHex, setResolvedHex] = useState<string | null>(null);
    const [resolving, setResolving] = useState(false);
    const [txStatus, setTxStatus] = useState<'idle' | 'transferring' | 'done' | 'error'>('idle');
    const [txError, setTxError] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);
    const { addTransaction } = useTransactionContext();

    const busy = txStatus === 'transferring' || resolving;

    async function resolveAddress(input: string): Promise<string | null> {
        const trimmed = input.trim();
        if (!trimmed) return null;

        // Already hex
        if (trimmed.startsWith('0x') && trimmed.length === 66) {
            return trimmed;
        }

        // Bech32 — resolve via provider
        if (trimmed.startsWith('opt1') || trimmed.startsWith('opr1')) {
            try {
                setResolving(true);
                const info = await provider.getPublicKeyInfo(trimmed, true);
                return info.toString();
            } catch {
                return null;
            } finally {
                setResolving(false);
            }
        }

        return null;
    }

    async function handleResolve() {
        setTxError(null);
        const hex = await resolveAddress(recipientInput);
        if (!hex) {
            setTxError('Invalid address. Enter a bech32 (opt1...) or hex (0x...) address.');
            setResolvedHex(null);
            return;
        }

        // Self-transfer check
        const walletHex = address?.toString().toLowerCase();
        if (walletHex && hex.toLowerCase() === walletHex) {
            setTxError('Cannot transfer to yourself.');
            setResolvedHex(null);
            return;
        }

        setResolvedHex(hex);
    }

    async function handleTransfer() {
        if (!address || !resolvedHex) return;
        setTxError(null);
        setTxStatus('transferring');
        try {
            const poolContract = getContract(
                poolAddress,
                POOL_WRITE_ABI,
                provider,
                network,
                address,
            ) as unknown as Record<string, (...args: unknown[]) => { sendTransaction: (p: unknown) => Promise<{ transactionId: string }> }>;

            const recipientAddr = Address.fromString(resolvedHex);
            const call = await poolContract['transferOption'](option.id, recipientAddr);
            const receipt = await call.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress ?? '',
                maximumAllowedSatToSpend: MAX_SAT,
                network,
            });
            setTxId(receipt.transactionId);
            addTransaction({
                txId: receipt.transactionId, type: 'transferOption', status: 'broadcast',
                poolAddress, broadcastBlock: null,
                label: `Transfer Option #${option.id}`, flowId: null, flowStep: null, meta: {},
            });
            setTxStatus('done');
        } catch (err) {
            setTxError(err instanceof Error ? err.message : 'Transfer failed');
            setTxStatus('error');
        }
    }

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            data-testid="transfer-modal-backdrop"
        >
            <div
                className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl w-full max-w-sm shadow-2xl"
                data-testid="transfer-option-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-terminal-text-primary font-mono">
                            Transfer Option{' '}
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

                    {/* Info */}
                    <p className="text-xs text-terminal-text-muted font-mono">
                        Transfer ownership of this option to another wallet.
                        No fees — no tokens change hands.
                    </p>

                    {/* Recipient input */}
                    <div className="space-y-2">
                        <label className="text-xs text-terminal-text-muted font-mono">
                            Recipient address
                        </label>
                        <input
                            type="text"
                            value={recipientInput}
                            onChange={(e) => {
                                setRecipientInput(e.target.value);
                                setResolvedHex(null);
                                setTxError(null);
                            }}
                            placeholder="opt1... or 0x..."
                            className="w-full bg-terminal-bg-primary border border-terminal-border-subtle rounded px-3 py-2 text-sm font-mono text-terminal-text-primary placeholder:text-terminal-text-muted/50 focus:outline-none focus:border-terminal-accent"
                            data-testid="recipient-input"
                            disabled={busy || txStatus === 'done'}
                        />
                    </div>

                    {/* Resolved hex confirmation */}
                    {resolvedHex && (
                        <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-2 text-xs font-mono">
                            <span className="text-terminal-text-muted">Resolved: </span>
                            <span className="text-terminal-text-secondary break-all" data-testid="resolved-hex">
                                {resolvedHex.slice(0, 10)}...{resolvedHex.slice(-8)}
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
                            <p className="text-green-300 mb-1">Transfer broadcast!</p>
                            <p className="text-terminal-text-muted break-all">{txId}</p>
                            <button className="mt-2 btn-primary px-3 py-1 text-xs rounded" onClick={onSuccess}>
                                Done
                            </button>
                        </div>
                    )}

                    {/* Action buttons */}
                    {txStatus !== 'done' && (
                        <div className="space-y-2">
                            {!resolvedHex ? (
                                <button
                                    onClick={handleResolve}
                                    disabled={busy || !recipientInput.trim()}
                                    className="w-full btn-primary py-2.5 text-sm rounded disabled:opacity-50"
                                    data-testid="btn-resolve"
                                >
                                    {resolving ? 'Resolving...' : 'Resolve Address'}
                                </button>
                            ) : (
                                <button
                                    onClick={handleTransfer}
                                    disabled={busy}
                                    className="w-full btn-primary py-2.5 text-sm rounded disabled:opacity-50"
                                    data-testid="btn-transfer-confirm"
                                >
                                    {txStatus === 'transferring' ? 'Transferring...' : 'Confirm Transfer'}
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
