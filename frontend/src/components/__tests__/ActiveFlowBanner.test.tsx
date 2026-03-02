/**
 * ActiveFlowBanner tests — status display, TX link, callbacks.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActiveFlowBanner } from '../ActiveFlowBanner.tsx';
import type { ActiveFlow, FlowStatus } from '../../contexts/flowDefs.ts';

function makeFlow(status: FlowStatus, overrides?: Partial<ActiveFlow>): ActiveFlow {
    return {
        flowId: 'flow-1',
        actionType: 'buyOption',
        poolAddress: '0xpool',
        optionId: '1',
        status,
        approvalTxId: null,
        actionTxId: null,
        claimedAt: new Date().toISOString(),
        label: 'Buy Option #1',
        formState: null,
        strategyLabel: null,
        ...overrides,
    };
}

describe('ActiveFlowBanner', () => {
    it('shows "Approval pending" for approval_pending', () => {
        render(
            <ActiveFlowBanner
                flow={makeFlow('approval_pending')}
                onContinue={vi.fn()}
                onStartFresh={vi.fn()}
            />,
        );
        expect(screen.getByTestId('status-text').textContent).toMatch(/Approval pending/);
    });

    it('shows "Approved" for approval_confirmed', () => {
        render(
            <ActiveFlowBanner
                flow={makeFlow('approval_confirmed')}
                onContinue={vi.fn()}
                onStartFresh={vi.fn()}
            />,
        );
        expect(screen.getByTestId('status-text').textContent).toMatch(/Approved/);
    });

    it('shows "Action pending" for action_pending', () => {
        render(
            <ActiveFlowBanner
                flow={makeFlow('action_pending')}
                onContinue={vi.fn()}
                onStartFresh={vi.fn()}
            />,
        );
        expect(screen.getByTestId('status-text').textContent).toMatch(/Action pending/);
    });

    it('shows "Approval failed" for approval_failed', () => {
        render(
            <ActiveFlowBanner
                flow={makeFlow('approval_failed')}
                onContinue={vi.fn()}
                onStartFresh={vi.fn()}
            />,
        );
        expect(screen.getByTestId('status-text').textContent).toMatch(/Approval failed/);
    });

    it('shows "Action failed" for action_failed', () => {
        render(
            <ActiveFlowBanner
                flow={makeFlow('action_failed')}
                onContinue={vi.fn()}
                onStartFresh={vi.fn()}
            />,
        );
        expect(screen.getByTestId('status-text').textContent).toMatch(/Action failed/);
    });

    it('shows TX link when approvalTxId is available', () => {
        render(
            <ActiveFlowBanner
                flow={makeFlow('approval_pending', { approvalTxId: 'tx-abc123456789abcdef' })}
                onContinue={vi.fn()}
                onStartFresh={vi.fn()}
            />,
        );
        expect(screen.getByTestId('banner-tx-link')).toBeInTheDocument();
    });

    it('does not show TX link when no txId', () => {
        render(
            <ActiveFlowBanner
                flow={makeFlow('approval_pending')}
                onContinue={vi.fn()}
                onStartFresh={vi.fn()}
            />,
        );
        expect(screen.queryByTestId('banner-tx-link')).not.toBeInTheDocument();
    });

    it('fires onContinue callback', () => {
        const onContinue = vi.fn();
        render(
            <ActiveFlowBanner
                flow={makeFlow('approval_confirmed')}
                onContinue={onContinue}
                onStartFresh={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByTestId('banner-continue-btn'));
        expect(onContinue).toHaveBeenCalledOnce();
    });

    it('fires onStartFresh callback', () => {
        const onStartFresh = vi.fn();
        render(
            <ActiveFlowBanner
                flow={makeFlow('approval_confirmed')}
                onContinue={vi.fn()}
                onStartFresh={onStartFresh}
            />,
        );
        fireEvent.click(screen.getByTestId('banner-start-fresh-btn'));
        expect(onStartFresh).toHaveBeenCalledOnce();
    });

    it('shows Retry button for failed statuses', () => {
        render(
            <ActiveFlowBanner
                flow={makeFlow('approval_failed')}
                onContinue={vi.fn()}
                onStartFresh={vi.fn()}
            />,
        );
        expect(screen.getByTestId('banner-continue-btn').textContent).toBe('Retry');
    });

    it('shows Continue button for non-failed statuses', () => {
        render(
            <ActiveFlowBanner
                flow={makeFlow('approval_confirmed')}
                onContinue={vi.fn()}
                onStartFresh={vi.fn()}
            />,
        );
        expect(screen.getByTestId('banner-continue-btn').textContent).toBe('Continue');
    });

    it('uses orange dot for pending statuses', () => {
        render(
            <ActiveFlowBanner
                flow={makeFlow('approval_pending')}
                onContinue={vi.fn()}
                onStartFresh={vi.fn()}
            />,
        );
        const dot = screen.getByTestId('status-dot');
        expect(dot.className).toMatch(/bg-orange-400/);
    });

    it('uses cyan dot for approval_confirmed', () => {
        render(
            <ActiveFlowBanner
                flow={makeFlow('approval_confirmed')}
                onContinue={vi.fn()}
                onStartFresh={vi.fn()}
            />,
        );
        const dot = screen.getByTestId('status-dot');
        expect(dot.className).toMatch(/bg-cyan-400/);
    });

    it('uses rose dot for failed statuses', () => {
        render(
            <ActiveFlowBanner
                flow={makeFlow('action_failed')}
                onContinue={vi.fn()}
                onStartFresh={vi.fn()}
            />,
        );
        const dot = screen.getByTestId('status-dot');
        expect(dot.className).toMatch(/bg-rose-400/);
    });
});
