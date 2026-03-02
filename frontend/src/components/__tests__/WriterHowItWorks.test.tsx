/**
 * WriterHowItWorks tests — collapsible explainer card.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WriterHowItWorks } from '../WriterHowItWorks.tsx';

describe('WriterHowItWorks', () => {
    beforeEach(() => {
        try { sessionStorage.clear(); } catch { /* noop */ }
    });

    it('opens by default on first visit', () => {
        render(<WriterHowItWorks />);
        expect(screen.getByTestId('howit-steps')).toBeInTheDocument();
        expect(screen.getByTestId('step-1')).toHaveTextContent('Lock collateral');
        expect(screen.getByTestId('step-2')).toHaveTextContent('Earn premium upfront');
        expect(screen.getByTestId('step-3')).toHaveTextContent('Get collateral back');
    });

    it('all 3 steps visible when open', () => {
        render(<WriterHowItWorks />);
        expect(screen.getByTestId('step-1')).toBeInTheDocument();
        expect(screen.getByTestId('step-2')).toBeInTheDocument();
        expect(screen.getByTestId('step-3')).toBeInTheDocument();
    });

    it('collapses when toggle is clicked', () => {
        render(<WriterHowItWorks />);
        fireEvent.click(screen.getByTestId('howit-toggle'));
        expect(screen.queryByTestId('howit-steps')).not.toBeInTheDocument();
    });

    it('persists collapsed state to sessionStorage', () => {
        render(<WriterHowItWorks />);
        fireEvent.click(screen.getByTestId('howit-toggle'));
        expect(sessionStorage.getItem('frogop_writer_howit')).toBe('collapsed');
    });

    it('reads collapsed state from sessionStorage', () => {
        sessionStorage.setItem('frogop_writer_howit', 'collapsed');
        render(<WriterHowItWorks />);
        expect(screen.queryByTestId('howit-steps')).not.toBeInTheDocument();
    });

    it('reopens and persists open state', () => {
        sessionStorage.setItem('frogop_writer_howit', 'collapsed');
        render(<WriterHowItWorks />);
        fireEvent.click(screen.getByTestId('howit-toggle'));
        expect(screen.getByTestId('howit-steps')).toBeInTheDocument();
        expect(sessionStorage.getItem('frogop_writer_howit')).toBe('open');
    });
});
