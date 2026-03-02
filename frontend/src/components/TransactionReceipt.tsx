/**
 * TransactionReceipt — structured post-transaction receipt shown after broadcast.
 *
 * Replaces generic "Transaction broadcast!" green boxes in all modals with
 * a consistent receipt showing: TX type badge, token movements, fees, explorer
 * link, and contextual "What happens next" guidance.
 */
import { explorerTxUrl } from '../config/index.ts';

export type ReceiptType =
    | 'buy'
    | 'exercise'
    | 'write'
    | 'cancel'
    | 'settle'
    | 'transfer'
    | 'roll'
    | 'batchCancel'
    | 'batchSettle';

interface TokenMovement {
    direction: 'debit' | 'credit';
    amount: string;
    token: string;
    label?: string;
}

interface TransactionReceiptProps {
    type: ReceiptType;
    txId: string;
    movements?: TokenMovement[];
    fee?: { amount: string; token: string } | null;
    onDone: () => void;
}

const TYPE_LABELS: Record<ReceiptType, { label: string; color: string }> = {
    buy: { label: 'PURCHASE', color: 'bg-cyan-900/40 border-cyan-700 text-cyan-300' },
    exercise: { label: 'EXERCISE', color: 'bg-orange-900/40 border-orange-700 text-orange-300' },
    write: { label: 'WRITE', color: 'bg-green-900/40 border-green-700 text-green-300' },
    cancel: { label: 'CANCEL', color: 'bg-rose-900/40 border-rose-700 text-rose-300' },
    settle: { label: 'SETTLE', color: 'bg-emerald-900/40 border-emerald-700 text-emerald-300' },
    transfer: { label: 'TRANSFER', color: 'bg-violet-900/40 border-violet-700 text-violet-300' },
    roll: { label: 'ROLL', color: 'bg-amber-900/40 border-amber-700 text-amber-300' },
    batchCancel: { label: 'BATCH CANCEL', color: 'bg-rose-900/40 border-rose-700 text-rose-300' },
    batchSettle: { label: 'BATCH SETTLE', color: 'bg-emerald-900/40 border-emerald-700 text-emerald-300' },
};

const NEXT_STEPS: Record<ReceiptType, string> = {
    buy: 'Your option will be active once the block confirms. Exercise it before expiry + grace period.',
    exercise: 'You will receive the payout once the block confirms. Check your balances after confirmation.',
    write: 'Your option will be listed for sale once the block confirms. Buyers can purchase it on the Pools page.',
    cancel: 'Your collateral will be returned once the block confirms. Check your balances after confirmation.',
    settle: 'Full collateral will be returned once the block confirms.',
    transfer: 'The new owner will see the option in their portfolio once the block confirms.',
    roll: 'The old option will be cancelled and a new one created once the block confirms.',
    batchCancel: 'Collateral for all cancelled options will be returned once the block confirms.',
    batchSettle: 'Collateral for all settled options will be returned once the block confirms.',
};

export function TransactionReceipt({
    type,
    txId,
    movements,
    fee,
    onDone,
}: TransactionReceiptProps) {
    const { label, color } = TYPE_LABELS[type];

    return (
        <div
            className="bg-green-900/10 border border-green-800 rounded-lg p-4 text-xs font-mono space-y-3"
            data-testid="transaction-receipt"
        >
            {/* Type badge */}
            <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${color}`}>
                    {label}
                </span>
                <span className="text-green-400 font-semibold">Broadcast</span>
            </div>

            {/* Token movements */}
            {movements && movements.length > 0 && (
                <div className="space-y-1">
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
                </div>
            )}

            {/* Fee */}
            {fee && (
                <div className="flex justify-between text-terminal-text-muted">
                    <span>Fee</span>
                    <span>{fee.amount} {fee.token}</span>
                </div>
            )}

            {/* TX ID + explorer link */}
            <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-2">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-terminal-text-muted truncate" data-testid="receipt-txid">
                        {txId.slice(0, 16)}...{txId.slice(-8)}
                    </span>
                    <a
                        href={explorerTxUrl(txId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:text-accent/80 whitespace-nowrap"
                        data-testid="receipt-explorer-link"
                    >
                        View in Explorer
                    </a>
                </div>
            </div>

            {/* Confirmation estimate */}
            <div className="flex items-center gap-2 text-terminal-text-muted">
                <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                <span>Estimated confirmation: ~10 minutes (next block)</span>
            </div>

            {/* What happens next */}
            <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-2">
                <p className="text-terminal-text-muted text-[10px]">
                    <span className="text-terminal-text-secondary font-semibold">What happens next: </span>
                    {NEXT_STEPS[type]}
                </p>
            </div>

            {/* Done button */}
            <button
                onClick={onDone}
                className="w-full btn-primary py-2 text-xs rounded"
                data-testid="receipt-done-btn"
            >
                Done
            </button>
        </div>
    );
}
