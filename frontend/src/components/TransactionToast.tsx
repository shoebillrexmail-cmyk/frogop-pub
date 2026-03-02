/**
 * TransactionToast — fixed-position floating pill showing pending TX count.
 *
 * Click expands a dropdown with each pending TX: label, elapsed time, status icon.
 * Shows one FlowResumeCard per active two-step flow (parallel flows supported).
 * Auto-dismisses confirmed notifications after 10s.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useTransactionContext } from '../hooks/useTransactionContext.ts';
import type { TrackedTransaction, TxStatus } from '../contexts/TransactionContext.tsx';
import { FlowResumeCard } from './FlowResumeCard.tsx';
import { CollarProgressCard } from './CollarProgressCard.tsx';

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
    const { recentTransactions, pendingCount, activeFlows, requestResume, abandonFlow, requestReopen } = useTransactionContext();
    const { walletAddress } = useWalletConnect();
    const navigate = useNavigate();
    const [expanded, setExpanded] = useState(false);
    const [, setTick] = useState(0);
    const [collarDismissed, setCollarDismissed] = useState(false);

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

    // Show pending/broadcast + failed TXs — confirmed belong in history only
    const visible = recentTransactions.filter(
        (tx) => tx.status === 'broadcast' || tx.status === 'pending' || tx.status === 'failed',
    ).slice(0, 8);

    const failedCount = visible.filter((tx) => tx.status === 'failed').length;
    const hasFlows = activeFlows.length > 0;

    const collarInProgress = useMemo(() => {
        if (!walletAddress || collarDismissed) return false;
        try {
            const raw = localStorage.getItem(`frogop_collar_${walletAddress}`);
            if (!raw) return false;
            const { callDone, putDone } = JSON.parse(raw) as { callDone?: boolean; putDone?: boolean };
            return (callDone || putDone) && !(callDone && putDone);
        } catch { return false; }
    }, [walletAddress, collarDismissed]);

    if (visible.length === 0 && pendingCount === 0 && !hasFlows && !collarInProgress) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 font-mono" role="status" aria-live="polite">
            {/* Expanded dropdown */}
            {expanded && (visible.length > 0 || hasFlows || collarInProgress) && (
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
                    {collarInProgress && walletAddress && (
                        <CollarProgressCard
                            walletAddress={walletAddress}
                            onContinue={() => {
                                setExpanded(false);
                                navigate('/pools?openCollar=true');
                            }}
                            onDismiss={() => setCollarDismissed(true)}
                        />
                    )}
                    <div className="max-h-64 overflow-y-auto">
                        {visible.map((tx: TrackedTransaction) => (
                            <button
                                key={tx.txId}
                                data-testid={`pill-tx-${tx.txId.slice(0, 8)}`}
                                className="w-full text-left px-3 py-2 border-b border-terminal-border-subtle last:border-b-0 flex items-center gap-2 hover:bg-terminal-bg-secondary/30 cursor-pointer"
                                onClick={() => {
                                    if (tx.flowId) {
                                        requestResume(tx.flowId);
                                    } else {
                                        requestReopen(tx);
                                    }
                                    setExpanded(false);
                                }}
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
                            </button>
                        ))}
                    </div>
                    <Link
                        to="/transactions"
                        className="block px-3 py-2 text-center text-xs text-accent hover:underline border-t border-terminal-border-subtle"
                        onClick={() => setExpanded(false)}
                    >
                        View All Transactions
                    </Link>
                </div>
            )}

            {/* Floating pill */}
            {(pendingCount > 0 || failedCount > 0 || hasFlows || collarInProgress) && (
                <button
                    onClick={toggle}
                    className="flex items-center gap-2 px-4 py-2 bg-terminal-bg-elevated border border-terminal-border-subtle rounded-full shadow-lg hover:border-accent transition-colors"
                    aria-label={pendingCount > 0 ? `${pendingCount} pending transactions` : failedCount > 0 ? `${failedCount} failed` : hasFlows ? `${activeFlows.length} active flow(s)` : ''}
                >
                    {pendingCount > 0 && (
                        <span className="w-2.5 h-2.5 rounded-full bg-orange-400 pulse-orange" aria-hidden="true" />
                    )}
                    {pendingCount === 0 && failedCount > 0 && !hasFlows && (
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-400" aria-hidden="true" />
                    )}
                    {pendingCount === 0 && failedCount === 0 && hasFlows && (
                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" aria-hidden="true" />
                    )}
                    <span className="text-xs text-terminal-text-primary">
                        {pendingCount > 0
                            ? `${pendingCount} pending`
                            : failedCount > 0
                                ? `${failedCount} failed`
                                : hasFlows
                                    ? `${activeFlows.length} flow${activeFlows.length > 1 ? 's' : ''}`
                                    : ''}
                    </span>
                    {pendingCount > 0 && (
                        <span className="text-xs text-terminal-text-muted">~10 min</span>
                    )}
                </button>
            )}
        </div>
    );
}
