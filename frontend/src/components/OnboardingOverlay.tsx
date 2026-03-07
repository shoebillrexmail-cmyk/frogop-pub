/**
 * OnboardingOverlay — 5-step CSS highlight tour for first-time users.
 *
 * Shows on first PoolsPage visit with a connected wallet.
 * Completion tracked via localStorage.
 */
import { useState, useCallback, useEffect } from 'react';

interface OnboardingStep {
    title: string;
    description: string;
    targetSelector: string | null;
}

const STEPS: OnboardingStep[] = [
    {
        title: 'Welcome to FroGop',
        description: 'FroGop is a Bitcoin L1 options platform. Write CALLs and PUTs, buy options, and build strategies — all on-chain.',
        targetSelector: null,
    },
    {
        title: 'Write an Option',
        description: 'Click "Write Option" to create a new CALL or PUT. You\'ll lock collateral and earn premium when someone buys it.',
        targetSelector: '[data-testid="strategy-covered-call-btn"], button:has(+ span)',
    },
    {
        title: 'Browse Options',
        description: 'The options table shows all available options. Filter by status, type, strike, or expiry. Click "Buy" on any open option.',
        targetSelector: '[data-testid="filter-all"]',
    },
    {
        title: 'Your Portfolio',
        description: 'Visit Portfolio to see your written and purchased options, exercise during the grace period, or transfer ownership.',
        targetSelector: '[data-testid="nav-portfolio"], a[href="/portfolio"]',
    },
    {
        title: 'You\'re Ready!',
        description: 'Use Quick Strategies for one-click Covered Call, Protective Put, or Collar setups. Check the Transaction History to track all your activity.',
        targetSelector: null,
    },
];

interface OnboardingOverlayProps {
    onComplete: () => void;
}

export function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
    const [step, setStep] = useState(0);
    const current = STEPS[step];
    const isLast = step === STEPS.length - 1;

    const handleNext = useCallback(() => {
        if (isLast) {
            onComplete();
        } else {
            setStep((s) => s + 1);
        }
    }, [isLast, onComplete]);

    const handleSkip = useCallback(() => {
        onComplete();
    }, [onComplete]);

    // Highlight target element
    useEffect(() => {
        if (!current.targetSelector) return;
        const el = document.querySelector(current.targetSelector);
        if (el) {
            el.classList.add('onboarding-highlight');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return () => el.classList.remove('onboarding-highlight');
        }
    }, [current.targetSelector]);

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            data-testid="onboarding-overlay"
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70" onClick={handleSkip} />

            {/* Card */}
            <div className="relative bg-terminal-bg-elevated border border-accent rounded-xl w-full max-w-sm p-6 shadow-2xl z-10">
                {/* Step indicator */}
                <div className="flex gap-1.5 mb-4">
                    {STEPS.map((_, i) => (
                        <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                                i <= step ? 'bg-accent' : 'bg-terminal-border-subtle'
                            }`}
                        />
                    ))}
                </div>

                <h3 className="text-base font-bold text-terminal-text-primary font-mono mb-2">
                    {current.title}
                </h3>
                <p className="text-sm text-terminal-text-secondary font-mono mb-6">
                    {current.description}
                </p>

                <div className="flex items-center justify-between">
                    <button
                        onClick={handleSkip}
                        className="text-xs text-terminal-text-muted font-mono hover:text-terminal-text-primary"
                    >
                        Skip tour
                    </button>
                    <div className="flex gap-2">
                        {step > 0 && (
                            <button
                                onClick={() => setStep((s) => s - 1)}
                                className="btn-secondary px-3 py-1.5 text-xs rounded"
                            >
                                Back
                            </button>
                        )}
                        <button
                            onClick={handleNext}
                            className="btn-primary px-4 py-1.5 text-xs rounded"
                            data-testid="onboarding-next"
                        >
                            {isLast ? 'Get Started' : 'Next'}
                        </button>
                    </div>
                </div>

                <p className="text-[10px] text-terminal-text-muted font-mono mt-3 text-center">
                    Step {step + 1} of {STEPS.length}
                </p>
            </div>
        </div>
    );
}
