/**
 * ActiveFlowBanner — compact banner shown at the top of two-step modals
 * when a matching active flow already exists.
 *
 * Gives users visibility and choice: Continue (keep flow) or Start Fresh (abandon + reset).
 */
import type { ActiveFlow, FlowStatus } from '../contexts/flowDefs.ts';
import { EXPLORER_TX_URL } from '../config/index.ts';

interface ActiveFlowBannerProps {
    flow: ActiveFlow;
    onContinue: () => void;
    onStartFresh: () => void;
}

function statusDot(status: FlowStatus): string {
    switch (status) {
        case 'approval_pending':
        case 'action_pending':
            return 'bg-orange-400';
        case 'approval_confirmed':
            return 'bg-cyan-400';
        case 'approval_failed':
        case 'action_failed':
            return 'bg-rose-400';
        case 'action_confirmed':
            return 'bg-green-400';
    }
}

function statusText(status: FlowStatus): string {
    switch (status) {
        case 'approval_pending':
            return 'Approval pending (~10 min)';
        case 'approval_confirmed':
            return 'Approved \u2014 ready for step 2';
        case 'action_pending':
            return 'Action pending (~10 min)';
        case 'approval_failed':
            return 'Approval failed';
        case 'action_failed':
            return 'Action failed';
        case 'action_confirmed':
            return 'Confirmed';
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

function isFailed(status: FlowStatus): boolean {
    return status === 'approval_failed' || status === 'action_failed';
}

export function ActiveFlowBanner({ flow, onContinue, onStartFresh }: ActiveFlowBannerProps) {
    const txId = flow.actionTxId ?? flow.approvalTxId;
    const failed = isFailed(flow.status);

    return (
        <div
            className="bg-terminal-bg-primary border border-terminal-border-subtle rounded-lg p-3 space-y-2"
            data-testid="active-flow-banner"
        >
            <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${statusDot(flow.status)} shrink-0`} data-testid="status-dot" />
                <span className="text-xs font-mono text-terminal-text-primary" data-testid="status-text">
                    {statusText(flow.status)}
                </span>
                <span className="text-[10px] font-mono text-terminal-text-muted ml-auto">
                    {elapsed(flow.claimedAt)}
                </span>
            </div>

            {txId && (
                <a
                    href={`${EXPLORER_TX_URL}${txId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-mono text-accent hover:text-accent/80 block truncate"
                    data-testid="banner-tx-link"
                >
                    TX: {txId.slice(0, 16)}...
                </a>
            )}

            <div className="flex gap-2">
                <button
                    onClick={onContinue}
                    className={`flex-1 text-[10px] font-mono py-1.5 rounded border transition-colors ${
                        failed
                            ? 'bg-rose-900/30 border-rose-700 text-rose-300 hover:bg-rose-900/50'
                            : 'bg-cyan-900/40 border-cyan-700 text-cyan-300 hover:bg-cyan-900/60'
                    }`}
                    data-testid="banner-continue-btn"
                >
                    {failed ? 'Retry' : 'Continue'}
                </button>
                <button
                    onClick={onStartFresh}
                    className="flex-1 text-[10px] font-mono py-1.5 rounded bg-terminal-bg-elevated border border-terminal-border-subtle text-terminal-text-muted hover:text-terminal-text-primary transition-colors"
                    data-testid="banner-start-fresh-btn"
                >
                    Start Fresh
                </button>
            </div>
        </div>
    );
}
