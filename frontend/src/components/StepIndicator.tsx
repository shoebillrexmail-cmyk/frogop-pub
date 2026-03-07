/**
 * StepIndicator — reusable 2-step progress indicator for two-step modals.
 *
 * Displays "Step 1: [label]" → "Step 2: [label]" with visual status circles.
 */

export type StepStatus = 'pending' | 'active' | 'done' | 'failed';

interface StepIndicatorProps {
    currentStep: 1 | 2;
    step1Label?: string;
    step2Label?: string;
    step1Status: StepStatus;
    step2Status: StepStatus;
}

const STATUS_STYLES: Record<StepStatus, { circle: string; text: string }> = {
    pending: {
        circle: 'border-terminal-border-subtle bg-terminal-bg-primary text-terminal-text-muted',
        text: 'text-terminal-text-muted',
    },
    active: {
        circle: 'border-accent bg-accent/20 text-accent animate-pulse',
        text: 'text-accent',
    },
    done: {
        circle: 'border-green-500 bg-green-900/40 text-green-400',
        text: 'text-green-400',
    },
    failed: {
        circle: 'border-rose-500 bg-rose-900/40 text-rose-400',
        text: 'text-rose-400',
    },
};

function StepCircle({ step, status }: { step: 1 | 2; status: StepStatus }) {
    const styles = STATUS_STYLES[status];
    return (
        <div
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-mono font-bold ${styles.circle}`}
            data-testid={`step-circle-${step}`}
        >
            {status === 'done' ? '\u2713' : status === 'failed' ? '!' : step}
        </div>
    );
}

function Connector({ done }: { done: boolean }) {
    return (
        <div
            className={`flex-1 h-0.5 mx-2 ${done ? 'bg-green-500' : 'bg-terminal-border-subtle'}`}
            data-testid="step-connector"
        />
    );
}

export function StepIndicator({
    currentStep,
    step1Label = 'Approve',
    step2Label = 'Execute',
    step1Status,
    step2Status,
}: StepIndicatorProps) {
    const s1 = STATUS_STYLES[step1Status];
    const s2 = STATUS_STYLES[step2Status];

    return (
        <div className="font-mono" data-testid="step-indicator">
            {/* Visual progress */}
            <div className="flex items-center mb-2">
                <StepCircle step={1} status={step1Status} />
                <Connector done={step1Status === 'done'} />
                <StepCircle step={2} status={step2Status} />
            </div>

            {/* Labels */}
            <div className="flex justify-between text-[10px]">
                <span className={s1.text} data-testid="step-1-label">
                    Step 1: {step1Label}
                    {step1Status === 'done' && ' \u2713'}
                    {step1Status === 'failed' && ' (failed)'}
                </span>
                <span className={s2.text} data-testid="step-2-label">
                    Step 2: {step2Label}
                    {step2Status === 'done' && ' \u2713'}
                    {step2Status === 'failed' && ' (failed)'}
                </span>
            </div>

            {/* Active step description */}
            {currentStep === 1 && step1Status === 'active' && (
                <p className="text-[10px] text-accent mt-1" data-testid="step-hint">
                    Waiting for approval confirmation (~10 min)...
                </p>
            )}
            {currentStep === 2 && step2Status === 'active' && (
                <p className="text-[10px] text-accent mt-1" data-testid="step-hint">
                    Confirming transaction (~10 min)...
                </p>
            )}
        </div>
    );
}
