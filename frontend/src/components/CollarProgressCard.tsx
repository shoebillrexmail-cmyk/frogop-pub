/**
 * CollarProgressCard — shown in the TransactionToast dropdown when a collar
 * strategy is partially complete (one leg done, one pending).
 */

interface CollarProgressCardProps {
    walletAddress: string;
    onContinue: () => void;
    onDismiss: () => void;
}

interface CollarState {
    callDone: boolean;
    putDone: boolean;
}

function readCollarState(walletAddress: string): CollarState | null {
    try {
        const raw = localStorage.getItem(`frogop_collar_${walletAddress}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<CollarState>;
        const callDone = parsed.callDone === true;
        const putDone = parsed.putDone === true;
        // Only show if partially complete (one done, not both)
        if ((callDone || putDone) && !(callDone && putDone)) {
            return { callDone, putDone };
        }
        return null;
    } catch {
        return null;
    }
}

export function CollarProgressCard({ walletAddress, onContinue, onDismiss }: CollarProgressCardProps) {
    const state = readCollarState(walletAddress);
    if (!state) return null;

    return (
        <div
            className="px-3 py-2.5 border-b border-terminal-border-subtle bg-terminal-bg-primary/50"
            data-testid="collar-progress-card"
        >
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-mono text-terminal-text-primary font-semibold">
                    Collar Strategy
                </span>
                <span className="text-[10px] font-mono text-terminal-text-muted">
                    {state.callDone && !state.putDone ? '1/2' : '0/2'}
                </span>
            </div>

            <div className="space-y-1 mb-2">
                <div className="flex items-center gap-2 text-[10px] font-mono">
                    <span className={state.callDone ? 'text-green-400' : 'text-terminal-text-muted'}>
                        {state.callDone ? '\u2713' : '\u25CB'}
                    </span>
                    <span className={state.callDone ? 'text-green-400' : 'text-terminal-text-muted'}>
                        Write CALL
                    </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono">
                    <span className={state.putDone ? 'text-green-400' : 'text-terminal-text-muted'}>
                        {state.putDone ? '\u2713' : '\u25CB'}
                    </span>
                    <span className={state.putDone ? 'text-green-400' : 'text-terminal-text-muted'}>
                        Buy PUT
                    </span>
                </div>
            </div>

            <div className="flex gap-2">
                <button
                    onClick={onContinue}
                    className="flex-1 text-[10px] font-mono py-1 rounded bg-cyan-900/40 border border-cyan-700 text-cyan-300 hover:bg-cyan-900/60 transition-colors"
                    data-testid="collar-continue-btn"
                >
                    Continue on Pools
                </button>
                <button
                    onClick={() => {
                        try { localStorage.removeItem(`frogop_collar_${walletAddress}`); } catch { /* noop */ }
                        onDismiss();
                    }}
                    className="flex-1 text-[10px] font-mono py-1 rounded bg-terminal-bg-elevated border border-terminal-border-subtle text-terminal-text-muted hover:text-terminal-text-primary transition-colors"
                    data-testid="collar-dismiss-btn"
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
}
