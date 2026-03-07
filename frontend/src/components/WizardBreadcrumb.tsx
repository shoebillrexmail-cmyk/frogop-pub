/**
 * WizardBreadcrumb — 3-step breadcrumb for the Trade wizard.
 *
 * Steps: Choose Goal -> Pick Market -> Configure
 */

const STEPS = ['Choose Goal', 'Pick Market', 'Configure'] as const;

interface WizardBreadcrumbProps {
    currentStep: 1 | 2 | 3;
    onStepClick: (step: 1 | 2 | 3) => void;
}

export function WizardBreadcrumb({ currentStep, onStepClick }: WizardBreadcrumbProps) {
    return (
        <nav className="flex items-center gap-1 text-xs font-mono mb-6" data-testid="wizard-breadcrumb">
            {STEPS.map((label, idx) => {
                const step = (idx + 1) as 1 | 2 | 3;
                const isCurrent = step === currentStep;
                const isPast = step < currentStep;

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
                                {label}
                            </button>
                        ) : (
                            <span
                                className={isCurrent ? 'text-terminal-text-primary' : 'text-terminal-text-muted'}
                                data-testid={`wizard-step-${step}`}
                            >
                                {label}
                            </span>
                        )}
                    </span>
                );
            })}
        </nav>
    );
}
