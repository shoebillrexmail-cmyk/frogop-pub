/**
 * WizardBreadcrumb — 3-step breadcrumb for the Trade wizard.
 *
 * Steps: Choose Goal -> Pick Market -> Configure
 * Shows the selected goal label when past step 1.
 */

const STEPS = ['Choose Goal', 'Pick Market', 'Configure'] as const;

interface WizardBreadcrumbProps {
    currentStep: 1 | 2 | 3;
    onStepClick: (step: 1 | 2 | 3) => void;
    /** Label of the selected goal (shown after step 1 is completed). */
    goalLabel?: string;
}

export function WizardBreadcrumb({ currentStep, onStepClick, goalLabel }: WizardBreadcrumbProps) {
    return (
        <nav className="flex items-center gap-1 text-xs font-mono mb-6" data-testid="wizard-breadcrumb">
            {STEPS.map((label, idx) => {
                const step = (idx + 1) as 1 | 2 | 3;
                const isCurrent = step === currentStep;
                const isPast = step < currentStep;
                // For step 1, show the goal label if selected
                const displayLabel = step === 1 && isPast && goalLabel
                    ? goalLabel
                    : label;

                return (
                    <span key={label} className="flex items-center gap-1">
                        {idx > 0 && (
                            <span className="text-terminal-text-muted mx-1">/</span>
                        )}
                        {isPast ? (
                            <button
                                onClick={() => onStepClick(step)}
                                className="text-accent hover:underline transition-colors"
                                data-testid={`wizard-step-${step}`}
                            >
                                {displayLabel}
                            </button>
                        ) : (
                            <span
                                className={isCurrent ? 'text-terminal-text-primary' : 'text-terminal-text-muted'}
                                data-testid={`wizard-step-${step}`}
                            >
                                {displayLabel}
                            </span>
                        )}
                    </span>
                );
            })}
        </nav>
    );
}
