/**
 * TransactionDetailModal — shows transaction details from TrackedTransaction data.
 *
 * Opened from the pill (TransactionToast) or history page (TransactionHistoryPage).
 * Renders: pending spinner, confirmed receipt (reuses TransactionReceipt), or failed view.
 * No provider/pool/wallet needed — entirely driven by stored meta.
 */
import type { TrackedTransaction } from '../contexts/transactionDefs.ts';
import { TransactionReceipt } from './TransactionReceipt.tsx';
import { explorerTxUrl } from '../config/index.ts';
import { mapTxTypeToReceiptType, buildMovementsFromMeta } from '../utils/txDetailHelpers.ts';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TransactionDetailModalProps {
    tx: TrackedTransaction;
    onClose: () => void;
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
    broadcast: { label: 'Broadcast', color: 'bg-orange-900/40 border-orange-700 text-orange-300' },
    pending: { label: 'Pending', color: 'bg-orange-900/40 border-orange-700 text-orange-300' },
    confirmed: { label: 'Confirmed', color: 'bg-green-900/40 border-green-700 text-green-300' },
    failed: { label: 'Failed', color: 'bg-rose-900/40 border-rose-700 text-rose-300' },
};

export function TransactionDetailModal({ tx, onClose }: TransactionDetailModalProps) {
    const badge = STATUS_BADGE[tx.status] ?? STATUS_BADGE['pending'];
    const receiptType = mapTxTypeToReceiptType(tx.type);
    const isPending = tx.status === 'broadcast' || tx.status === 'pending';
    const isConfirmed = tx.status === 'confirmed';
    const isFailed = tx.status === 'failed';

    const { movements, fee } = buildMovementsFromMeta(tx);

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            data-testid="tx-detail-modal-backdrop"
            onClick={onClose}
        >
            <div
                className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto"
                data-testid="tx-detail-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="min-w-0 pr-2">
                            {tx.meta['strategyLabel'] && (
                                <span className="block text-[10px] font-mono text-accent uppercase tracking-wider mb-0.5" data-testid="strategy-badge">
                                    {tx.meta['strategyLabel']}
                                </span>
                            )}
                            <h2 className="text-base font-bold text-terminal-text-primary font-mono truncate">
                                {tx.label}
                            </h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-terminal-text-muted hover:text-terminal-text-primary text-xl leading-none flex-shrink-0"
                            aria-label="Close modal"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Status badge */}
                    <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold font-mono ${badge.color}`}>
                            {badge.label}
                        </span>
                    </div>

                    <hr className="border-terminal-border-subtle" />

                    {/* Pending view */}
                    {isPending && (
                        <div className="space-y-3">
                            {movements.length > 0 && (
                                <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3 text-xs font-mono space-y-1">
                                    {movements.map((m, i) => (
                                        <div key={i} className="flex justify-between">
                                            <span className="text-terminal-text-muted">
                                                {m.label ?? (m.direction === 'debit' ? 'You pay' : 'You receive')}
                                            </span>
                                            <span className={m.direction === 'debit' ? 'text-rose-400' : 'text-green-400'}>
                                                {m.direction === 'debit' ? '-' : '+'}{m.amount} {m.token}
                                            </span>
                                        </div>
                                    ))}
                                    {fee && (
                                        <div className="flex justify-between text-terminal-text-muted">
                                            <span>Fee</span>
                                            <span>{fee.amount} {fee.token}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Explorer link */}
                            <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-2 text-xs font-mono">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-terminal-text-muted truncate">
                                        {tx.txId.slice(0, 16)}...{tx.txId.slice(-8)}
                                    </span>
                                    <a
                                        href={explorerTxUrl(tx.txId)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-accent hover:text-accent/80 whitespace-nowrap"
                                    >
                                        View in Explorer
                                    </a>
                                </div>
                            </div>

                            {/* Spinner + estimate */}
                            <div className="flex items-center gap-2 text-xs font-mono text-terminal-text-muted">
                                <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                                <span>Estimated confirmation: ~10 minutes (next block)</span>
                            </div>
                        </div>
                    )}

                    {/* Confirmed view — reuse TransactionReceipt */}
                    {isConfirmed && receiptType && (
                        <TransactionReceipt
                            type={receiptType}
                            txId={tx.txId}
                            movements={movements.length > 0 ? movements : undefined}
                            fee={fee}
                            onDone={onClose}
                        />
                    )}

                    {/* Confirmed but no receipt type (approve) */}
                    {isConfirmed && !receiptType && (
                        <div className="space-y-3">
                            <p className="text-xs font-mono text-green-400">Transaction confirmed.</p>
                            <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-2 text-xs font-mono">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-terminal-text-muted truncate">
                                        {tx.txId.slice(0, 16)}...{tx.txId.slice(-8)}
                                    </span>
                                    <a
                                        href={explorerTxUrl(tx.txId)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-accent hover:text-accent/80 whitespace-nowrap"
                                    >
                                        View in Explorer
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Failed view */}
                    {isFailed && (
                        <div className="space-y-3">
                            <p className="text-xs font-mono text-rose-400">Transaction failed.</p>
                            <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-2 text-xs font-mono">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-terminal-text-muted truncate">
                                        {tx.txId.slice(0, 16)}...{tx.txId.slice(-8)}
                                    </span>
                                    <a
                                        href={explorerTxUrl(tx.txId)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-accent hover:text-accent/80 whitespace-nowrap"
                                    >
                                        View in Explorer
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Close button (always) */}
                    <button
                        onClick={onClose}
                        className="w-full btn-secondary py-2 text-sm rounded"
                        data-testid="detail-close-btn"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
