import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WizardBreadcrumb } from '../WizardBreadcrumb.tsx';

describe('WizardBreadcrumb', () => {
    it('renders 3 steps', () => {
        render(<WizardBreadcrumb currentStep={1} onStepClick={vi.fn()} />);
        expect(screen.getByTestId('wizard-step-1')).toBeInTheDocument();
        expect(screen.getByTestId('wizard-step-2')).toBeInTheDocument();
        expect(screen.getByTestId('wizard-step-3')).toBeInTheDocument();
    });

    it('highlights current step', () => {
        render(<WizardBreadcrumb currentStep={2} onStepClick={vi.fn()} />);
        const step2 = screen.getByTestId('wizard-step-2');
        expect(step2.tagName).toBe('SPAN');
        expect(step2.className).toContain('text-terminal-text-primary');
    });

    it('makes past steps clickable', () => {
        const onStepClick = vi.fn();
        render(<WizardBreadcrumb currentStep={2} onStepClick={onStepClick} />);
        const step1 = screen.getByTestId('wizard-step-1');
        expect(step1.tagName).toBe('BUTTON');
        fireEvent.click(step1);
        expect(onStepClick).toHaveBeenCalledWith(1);
    });

    it('makes future steps non-clickable', () => {
        render(<WizardBreadcrumb currentStep={1} onStepClick={vi.fn()} />);
        const step2 = screen.getByTestId('wizard-step-2');
        expect(step2.tagName).toBe('SPAN');
    });

    it('on step 3 both previous steps are clickable', () => {
        const onStepClick = vi.fn();
        render(<WizardBreadcrumb currentStep={3} onStepClick={onStepClick} />);
        fireEvent.click(screen.getByTestId('wizard-step-1'));
        expect(onStepClick).toHaveBeenCalledWith(1);
        fireEvent.click(screen.getByTestId('wizard-step-2'));
        expect(onStepClick).toHaveBeenCalledWith(2);
    });

    it('shows goal label instead of "Choose Goal" when past step 1', () => {
        render(<WizardBreadcrumb currentStep={2} onStepClick={vi.fn()} goalLabel="Earn Yield on Holdings" />);
        const step1 = screen.getByTestId('wizard-step-1');
        expect(step1.textContent).toBe('Earn Yield on Holdings');
    });

    it('does not show goal label on step 1 (current step)', () => {
        render(<WizardBreadcrumb currentStep={1} onStepClick={vi.fn()} goalLabel="Earn Yield on Holdings" />);
        const step1 = screen.getByTestId('wizard-step-1');
        expect(step1.textContent).toBe('Choose Goal');
    });
});
