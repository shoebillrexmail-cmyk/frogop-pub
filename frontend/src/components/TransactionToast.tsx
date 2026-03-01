/**
 * TransactionToast — fixed-position floating pill showing pending TX count.
 *
 * Click expands a dropdown with each pending TX: label, elapsed time, status icon.
 * Shows one FlowResumeCard per active two-step flow (parallel flows supported).
 * Auto-dismisses confirmed notifications after 10s.
 */
import { useState, useEffect, useCallback } from 'react';
import { useTransactionContext } from '../hooks/useTransactionContext.ts';
import type { TrackedTransaction, TxStatus } from '../contexts/TransactionContext.tsx';
import { FlowResumeCard } from './FlowResumeCard.tsx';

function statusIcon(status: TxStatus): string {
    switch (status) {
        case 'broadcast':
        case 'pending':
            return '\u25CF'; // filled circle
        case 'confirmed':
            return '\u2713'; // check
        case 'failed':
            return '\u2717'; // X
    }
}

function statusColor(status: TxStatus): string {
    switch (status) {
        case 'broadcast':
        case 'pending':
            return 'text-orange-400';
        case 'confirmed':
            return 'text-green-400';
        case 'failed':
            return 'text-rose-400';
    }
}

function elapsed(createdAt: string): string {
    const ms = Date.now() - new Date(createdAt).getTime();
    const mins = Math.floor(ms / 60_000);
    if (mins < 1) return '<1m';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
}

export function TransactionToast() {
    const { recentTransactions, pendingCount, activeFlows, requestResume, abandonFlow } = useTransactionContext();
    const [expanded, setExpanded] = useState(false);
    const [, setTick] = useState(0);

    // Update elapsed times every 15s
    useEffect(() => {
        if (recentTransactions.length === 0 && activeFlows.length === 0) return;
        const timer = setInterval(() => setTick((n) => n + 1), 15_000);
        return () => clearInterval(timer);
    }, [recentTransactions.length, activeFlows.length]);

    // Auto-collapse when no more pending
    useEffect(() => {
        if (pendingCount === 0 && activeFlows.length === 0 && expanded) {
            const timer = setTimeout(() => setExpanded(false), 10_000);
            return () => clearTimeout(timer);
        }
    }, [pendingCount, activeFlows.length, expanded]);

    const toggle = useCallback(() => setExpanded((v) => !v), []);

    // Show recent TXs (pending + recently confirmed)
    const visible = recentTransactions.filter(
        (tx) => tx.status !== 'failed',
    ).slice(0, 8);

    const hasFlows = activeFlows.length > 0;
    if (visible.length === 0 && pendingCount === 0 && !hasFlows) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 font-mono">
            {/* Expanded dropdown */}
            {expanded && (visible.length > 0 || hasFlows) && (
                <div className="mb-2 bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl shadow-lg overflow-hidden max-w-xs w-72">
                    <div className="px-3 py-2 border-b border-terminal-border-subtle text-xs text-terminal-text-muted">
                        Transactions
                        {activeFlows.length > 0 && (
                            <span className="ml-1 text-orange-400">
                                ({activeFlows.length} flow{activeFlows.length > 1 ? 's' : ''})
                            </span>
                        )}
                    </div>
                    {activeFlows.map((flow) => (
                        <FlowResumeCard
                            key={flow.flowId}
                            flow={flow}
                            onResume={() => requestResume(flow.flowId)}
                            onAbandon={() => abandonFlow(flow.flowId)}
                        />
                    ))}
                    <div className="max-h-64 overflow-y-auto">
                        {visible.map((tx: TrackedTransaction) => (
                            <div
                                key={tx.txId}
                                className="px-3 py-2 border-b border-terminal-border-subtle last:border-b-0 flex items-center gap-2"
                            >
                                <span className={`text-sm ${statusColor(tx.status)}`}>
                                    {statusIcon(tx.status)}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs text-terminal-text-primary truncate">
                                        {tx.label}
                                    </div>
                                    <div className="text-xs text-terminal-text-muted">
                                        {elapsed(tx.createdAt)}
                                        {tx.status === 'broadcast' && ' \u2022 ~10 min'}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Floating pill */}
            {(pendingCount > 0 || visible.length > 0 || hasFlows) && (
                <button
                    onClick={toggle}
                    className="flex items-center gap-2 px-4 py-2 bg-terminal-bg-elevated border border-terminal-border-subtle rounded-full shadow-lg hover:border-accent transition-colors"
                >
                    {pendingCount > 0 && (
                        <span className="w-2.5 h-2.5 rounded-full bg-orange-400 pulse-orange" />
                    )}
                    {pendingCount === 0 && visible.length > 0 && (
                        <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                    )}
                    <span className="text-xs text-terminal-text-primary">
                        {pendingCount > 0
                            ? `${pendingCount} pending`
                            : `${visible.length} tx`}
                    </span>
                    {pendingCount > 0 && (
                        <span className="text-xs text-terminal-text-muted">~10 min</span>
                    )}
                </button>
            )}
        </div>
    );
}
