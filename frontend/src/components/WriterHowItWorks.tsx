/**
 * WriterHowItWorks — collapsible 3-step explainer for option writers.
 *
 * Open on first visit. Persists collapsed state to sessionStorage.
 */
import { useState } from 'react';

const STORAGE_KEY = 'frogop_writer_howit';

export function WriterHowItWorks() {
    const [isOpen, setIsOpen] = useState<boolean>(() => {
        try {
            const stored = sessionStorage.getItem(STORAGE_KEY);
            return stored !== 'collapsed';
        } catch {
            return true;
        }
    });

    function toggle() {
        const next = !isOpen;
        setIsOpen(next);
        try {
            sessionStorage.setItem(STORAGE_KEY, next ? 'open' : 'collapsed');
        } catch { /* noop */ }
    }

    return (
        <div
            className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-4"
            data-testid="writer-how-it-works"
        >
            <button
                onClick={toggle}
                className="flex items-center gap-2 w-full text-left"
                data-testid="howit-toggle"
            >
                <span className={`text-xs transition-transform ${isOpen ? 'rotate-90' : ''}`}>&#9654;</span>
                <h3 className="text-sm font-bold text-terminal-text-primary font-mono">
                    How Writing Options Works
                </h3>
            </button>

            {isOpen && (
                <div className="mt-3 space-y-3" data-testid="howit-steps">
                    <div className="flex gap-3 items-start">
                        <span className="text-accent font-mono text-sm font-bold shrink-0">1.</span>
                        <div>
                            <p className="text-sm font-mono text-terminal-text-primary" data-testid="step-1">
                                Lock collateral
                            </p>
                            <p className="text-xs text-terminal-text-muted font-mono">
                                MOTO for CALLs, PILL for PUTs. This secures the option for the buyer.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3 items-start">
                        <span className="text-accent font-mono text-sm font-bold shrink-0">2.</span>
                        <div>
                            <p className="text-sm font-mono text-terminal-text-primary" data-testid="step-2">
                                Earn premium upfront
                            </p>
                            <p className="text-xs text-terminal-text-muted font-mono">
                                When someone buys your option, you receive the premium immediately.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3 items-start">
                        <span className="text-accent font-mono text-sm font-bold shrink-0">3.</span>
                        <div>
                            <p className="text-sm font-mono text-terminal-text-primary" data-testid="step-3">
                                Get collateral back
                            </p>
                            <p className="text-xs text-terminal-text-muted font-mono">
                                If the option expires unexercised, you keep both the premium and your collateral.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
