/**
 * CollarProgressCard tests — progress display, dismiss, continue.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CollarProgressCard } from '../CollarProgressCard.tsx';

const WALLET = '0xwallet123';

describe('CollarProgressCard', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('renders nothing when no collar state exists', () => {
        const { container } = render(
            <CollarProgressCard walletAddress={WALLET} onContinue={vi.fn()} onDismiss={vi.fn()} />,
        );
        expect(container.innerHTML).toBe('');
    });

    it('renders nothing when both legs are complete', () => {
        localStorage.setItem(`frogop_collar_${WALLET}`, JSON.stringify({ callDone: true, putDone: true }));
        const { container } = render(
            <CollarProgressCard walletAddress={WALLET} onContinue={vi.fn()} onDismiss={vi.fn()} />,
        );
        expect(container.innerHTML).toBe('');
    });

    it('renders progress when call is done but put is not', () => {
        localStorage.setItem(`frogop_collar_${WALLET}`, JSON.stringify({ callDone: true, putDone: false }));
        render(
            <CollarProgressCard walletAddress={WALLET} onContinue={vi.fn()} onDismiss={vi.fn()} />,
        );
        expect(screen.getByTestId('collar-progress-card')).toBeInTheDocument();
        expect(screen.getByText('Collar Strategy')).toBeInTheDocument();
        expect(screen.getByText('1/2')).toBeInTheDocument();
    });

    it('renders progress when put is done but call is not', () => {
        localStorage.setItem(`frogop_collar_${WALLET}`, JSON.stringify({ callDone: false, putDone: true }));
        render(
            <CollarProgressCard walletAddress={WALLET} onContinue={vi.fn()} onDismiss={vi.fn()} />,
        );
        expect(screen.getByTestId('collar-progress-card')).toBeInTheDocument();
    });

    it('fires onContinue callback', () => {
        localStorage.setItem(`frogop_collar_${WALLET}`, JSON.stringify({ callDone: true, putDone: false }));
        const onContinue = vi.fn();
        render(
            <CollarProgressCard walletAddress={WALLET} onContinue={onContinue} onDismiss={vi.fn()} />,
        );
        fireEvent.click(screen.getByTestId('collar-continue-btn'));
        expect(onContinue).toHaveBeenCalledOnce();
    });

    it('dismiss clears localStorage and fires callback', () => {
        localStorage.setItem(`frogop_collar_${WALLET}`, JSON.stringify({ callDone: true, putDone: false }));
        const onDismiss = vi.fn();
        render(
            <CollarProgressCard walletAddress={WALLET} onContinue={vi.fn()} onDismiss={onDismiss} />,
        );
        fireEvent.click(screen.getByTestId('collar-dismiss-btn'));
        expect(localStorage.getItem(`frogop_collar_${WALLET}`)).toBeNull();
        expect(onDismiss).toHaveBeenCalledOnce();
    });
});
