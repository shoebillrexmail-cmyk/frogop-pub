/**
 * FlowResumeCard — inline card shown in the TransactionToast dropdown
 * for each active two-step flow.
 *
 * Displays the flow label, current status, elapsed time, View TX link,
 * and Resume / Abandon buttons.
 */
import type { ActiveFlow, FlowStatus } from '../contexts/flowDefs.ts';
import { EXPLORER_TX_URL } from '../config/index.ts';

interface FlowResumeCardProps {
    flow: ActiveFlow;
    onResume: () => void;
    onAbandon: () => void;
}

function statusLabel(status: FlowStatus): string {
    switch (status) {
        case 'approval_pending':
            return 'Step 1: Approval pending...';
        case 'approval_confirmed':
            return 'Step 1: Approved \u2713 — ready for step 2';
        case 'action_pending':
            return 'Step 2: Confirming...';
        case 'action_confirmed':
            return 'Confirmed \u2713';
        case 'approval_failed':
            return 'Step 1: Approval failed';
        case 'action_failed':
            return 'Step 2: Action failed';
    }
}

function statusColor(status: FlowStatus): string {
    switch (status) {
        case 'approval_pending':
        case 'action_pending':
            return 'text-orange-400';
        case 'approval_confirmed':
            return 'text-cyan-400';
        case 'action_confirmed':
            return 'text-green-400';
        case 'approval_failed':
        case 'action_failed':
            return 'text-rose-400';
    }
}

function elapsed(claimedAt: string): string {
    const ms = Date.now() - new Date(claimedAt).getTime();
    const mins = Math.floor(ms / 60_000);
    if (mins < 1) return '<1m ago';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m ago`;
}

const RESUMABLE: ReadonlySet<FlowStatus> = new Set([
    'approval_confirmed',
    'approval_failed',
    'action_failed',
]);

/** Returns the most recent txId available (action > approval). */
function getViewTxId(flow: ActiveFlow): string | null {
    return flow.actionTxId ?? flow.approvalTxId;
}

export function FlowResumeCard({ flow, onResume, onAbandon }: FlowResumeCardProps) {
    const canResume = RESUMABLE.has(flow.status);
    const viewTxId = getViewTxId(flow);

    return (
        <div
            className="px-3 py-2.5 border-b border-terminal-border-subtle bg-terminal-bg-primary/50"
            data-testid="flow-resume-card"
        >
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-terminal-text-primary font-semibold truncate">
                    {flow.label}
                </span>
                <span className="text-[10px] font-mono text-terminal-text-muted ml-2 whitespace-nowrap">
                    {elapsed(flow.claimedAt)}
                </span>
            </div>
            <div className={`text-[10px] font-mono mb-2 ${statusColor(flow.status)}`}>
                {statusLabel(flow.status)}
            </div>
            <div className="flex gap-2">
                {viewTxId && (
                    <a
                        href={`${EXPLORER_TX_URL}${viewTxId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-center text-[10px] font-mono py-1 rounded bg-terminal-bg-elevated border border-terminal-border-subtle text-accent hover:text-accent/80 transition-colors"
                        data-testid="flow-view-tx"
                    >
                        View TX
                    </a>
                )}
                {canResume && (
                    <button
                        onClick={onResume}
                        className="flex-1 text-[10px] font-mono py-1 rounded bg-cyan-900/40 border border-cyan-700 text-cyan-300 hover:bg-cyan-900/60 transition-colors"
                        data-testid="flow-resume-btn"
                    >
                        Resume
                    </button>
                )}
                {flow.status !== 'action_confirmed' && (
                    <button
                        onClick={onAbandon}
                        className="flex-1 text-[10px] font-mono py-1 rounded bg-terminal-bg-elevated border border-terminal-border-subtle text-terminal-text-muted hover:text-terminal-text-primary transition-colors"
                        data-testid="flow-abandon-btn"
                    >
                        Abandon
                    </button>
                )}
            </div>
        </div>
    );
}
