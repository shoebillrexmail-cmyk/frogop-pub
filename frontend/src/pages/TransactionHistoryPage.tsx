/**
 * TransactionHistoryPage — full transaction history with pagination and CSV export.
 *
 * Route: /transactions
 */
import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTransactionContext } from '../hooks/useTransactionContext.ts';
import type { TrackedTransaction, TxStatus, TxType } from '../contexts/transactionDefs.ts';
import { EXPLORER_TX_URL, formatAddress } from '../config/index.ts';

const PAGE_SIZE = 25;

const TX_TYPE_LABELS: Record<TxType, string> = {
    approve: 'Approve',
    writeOption: 'Write Option',
    buyOption: 'Buy Option',
    cancelOption: 'Cancel',
    exercise: 'Exercise',
    settle: 'Settle',
    transferOption: 'Transfer',
    batchCancel: 'Batch Cancel',
    batchSettle: 'Batch Settle',
    rollOption: 'Roll',
};

const STATUS_COLORS: Record<TxStatus, string> = {
    broadcast: 'text-orange-400',
    pending: 'text-orange-400',
    confirmed: 'text-green-400',
    failed: 'text-rose-400',
};

const STATUS_LABELS: Record<TxStatus, string> = {
    broadcast: 'Broadcast',
    pending: 'Pending',
    confirmed: 'Confirmed',
    failed: 'Failed',
};

function formatTimestamp(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function exportCSV(transactions: TrackedTransaction[]): void {
    const header = 'Timestamp,Type,Label,Pool,Option ID,Status,TX ID,Confirmed At\n';
    const rows = transactions.map((tx) => {
        const optionId = tx.meta['optionId'] ?? '';
        const confirmedAt = tx.confirmedAt ?? '';
        return [
            tx.createdAt,
            TX_TYPE_LABELS[tx.type] ?? tx.type,
            `"${tx.label.replace(/"/g, '""')}"`,
            tx.poolAddress,
            optionId,
            STATUS_LABELS[tx.status] ?? tx.status,
            tx.txId,
            confirmedAt,
        ].join(',');
    }).join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frogop-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export function TransactionHistoryPage() {
    const { transactions, clearOld, requestReopen } = useTransactionContext();
    const [page, setPage] = useState(0);
    const [statusFilter, setStatusFilter] = useState<TxStatus | 'all'>('all');
    const [typeFilter, setTypeFilter] = useState<TxType | 'all'>('all');

    const filtered = useMemo(() => {
        return transactions.filter((tx) => {
            if (statusFilter !== 'all' && tx.status !== statusFilter) return false;
            if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
            return true;
        });
    }, [transactions, statusFilter, typeFilter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paged = useMemo(
        () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
        [filtered, page],
    );

    const handleExport = useCallback(() => exportCSV(filtered), [filtered]);

    // Reset page when filters change
    const setStatusFilterAndReset = useCallback((v: TxStatus | 'all') => {
        setStatusFilter(v);
        setPage(0);
    }, []);

    const setTypeFilterAndReset = useCallback((v: TxType | 'all') => {
        setTypeFilter(v);
        setPage(0);
    }, []);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-lg font-bold font-mono text-terminal-text-primary">
                    Transaction History
                </h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExport}
                        disabled={filtered.length === 0}
                        className="btn-secondary px-3 py-1.5 text-xs rounded disabled:opacity-40"
                        data-testid="export-csv"
                    >
                        Export CSV
                    </button>
                    <button
                        onClick={clearOld}
                        className="btn-secondary px-3 py-1.5 text-xs rounded text-rose-400 border-rose-700 hover:bg-rose-900/20"
                        data-testid="clear-confirmed"
                    >
                        Clear Confirmed
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-terminal-text-muted font-mono">Status:</span>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilterAndReset(e.target.value as TxStatus | 'all')}
                        className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded px-2 py-1 text-xs font-mono text-terminal-text-primary"
                        data-testid="status-filter"
                    >
                        <option value="all">All</option>
                        <option value="broadcast">Broadcast</option>
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="failed">Failed</option>
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-terminal-text-muted font-mono">Type:</span>
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilterAndReset(e.target.value as TxType | 'all')}
                        className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded px-2 py-1 text-xs font-mono text-terminal-text-primary"
                        data-testid="type-filter"
                    >
                        <option value="all">All</option>
                        {Object.entries(TX_TYPE_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                        ))}
                    </select>
                </div>
                <span className="text-xs text-terminal-text-muted font-mono">
                    {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Table */}
            {filtered.length === 0 ? (
                <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-8 text-center">
                    <p className="text-terminal-text-muted font-mono text-sm mb-4">
                        {transactions.length === 0
                            ? 'No transactions yet. Write, buy, or exercise an option to get started.'
                            : 'No transactions match the selected filters.'}
                    </p>
                    {transactions.length === 0 && (
                        <Link to="/pools" className="btn-primary px-4 py-2 text-sm rounded inline-block">
                            Go to Pools
                        </Link>
                    )}
                </div>
            ) : (
                <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs font-mono" data-testid="tx-table">
                            <thead>
                                <tr className="border-b border-terminal-border-subtle text-terminal-text-muted text-left">
                                    <th className="px-3 py-2">Time</th>
                                    <th className="px-3 py-2">Type</th>
                                    <th className="px-3 py-2">Label</th>
                                    <th className="px-3 py-2">Pool</th>
                                    <th className="px-3 py-2">Option</th>
                                    <th className="px-3 py-2">Status</th>
                                    <th className="px-3 py-2">TX ID</th>
                                    <th className="px-3 py-2">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paged.map((tx) => (
                                    <tr
                                        key={tx.txId}
                                        className="border-b border-terminal-border-subtle last:border-b-0 hover:bg-terminal-bg-secondary/30"
                                    >
                                        <td className="px-3 py-2 text-terminal-text-secondary whitespace-nowrap">
                                            {formatTimestamp(tx.createdAt)}
                                        </td>
                                        <td className="px-3 py-2 text-terminal-text-primary">
                                            {TX_TYPE_LABELS[tx.type] ?? tx.type}
                                        </td>
                                        <td className="px-3 py-2 text-terminal-text-primary max-w-[200px] truncate">
                                            {tx.label}
                                        </td>
                                        <td className="px-3 py-2 text-terminal-text-muted">
                                            {formatAddress(tx.poolAddress)}
                                        </td>
                                        <td className="px-3 py-2 text-terminal-text-secondary">
                                            {tx.meta['optionId'] ? `#${tx.meta['optionId']}` : '—'}
                                        </td>
                                        <td className={`px-3 py-2 ${STATUS_COLORS[tx.status]}`}>
                                            {STATUS_LABELS[tx.status]}
                                        </td>
                                        <td className="px-3 py-2">
                                            {tx.txId ? (
                                                <a
                                                    href={`${EXPLORER_TX_URL}${tx.txId}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-accent hover:underline"
                                                    title={tx.txId}
                                                >
                                                    {tx.txId.slice(0, 8)}...
                                                </a>
                                            ) : '—'}
                                        </td>
                                        <td className="px-3 py-2">
                                            <button
                                                onClick={() => requestReopen(tx)}
                                                className="text-accent hover:underline text-xs font-mono"
                                                data-testid={`view-tx-${tx.txId.slice(0, 8)}`}
                                            >
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3">
                    <button
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="btn-secondary px-3 py-1 text-xs rounded disabled:opacity-40"
                    >
                        Prev
                    </button>
                    <span className="text-xs font-mono text-terminal-text-secondary">
                        Page {page + 1} of {totalPages}
                    </span>
                    <button
                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                        className="btn-secondary px-3 py-1 text-xs rounded disabled:opacity-40"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
