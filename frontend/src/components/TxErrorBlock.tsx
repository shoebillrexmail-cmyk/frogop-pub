/**
 * TxErrorBlock — shared error display for transaction modals.
 *
 * Calls formatTxError once, renders message + guidance + retry button.
 */
import { formatTxError } from '../utils/formatTxError.ts';

interface TxErrorBlockProps {
    error: string;
    onRetry: () => void;
}

export function TxErrorBlock({ error, onRetry }: TxErrorBlockProps) {
    const { message, guidance } = formatTxError(error);
    return (
        <div className="bg-rose-900/10 border border-rose-800 rounded p-3 text-xs font-mono space-y-2" data-testid="tx-error">
            <p className="text-rose-400">{message}</p>
            <p className="text-terminal-text-muted">{guidance}</p>
            <button
                onClick={onRetry}
                className="btn-secondary px-3 py-1 text-xs rounded"
                data-testid="btn-retry"
            >
                Retry
            </button>
        </div>
    );
}
