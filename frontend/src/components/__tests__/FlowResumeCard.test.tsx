/**
 * FlowResumeCard tests — resume visibility per status, tooltip text, callbacks.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FlowResumeCard } from '../FlowResumeCard.tsx';
import type { ActiveFlow, FlowStatus } from '../../contexts/flowDefs.ts';

function makeFlow(status: FlowStatus, overrides?: Partial<ActiveFlow>): ActiveFlow {
    return {
        flowId: 'flow-1',
        actionType: 'buyOption',
        poolAddress: '0xpool',
        optionId: '1',
        status,
        approvalTxId: 'tx-approve-1',
        actionTxId: null,
        claimedAt: new Date().toISOString(),
        label: 'Buy Option #1',
        formState: null,
        strategyLabel: null,
        ...overrides,
    };
}

describe('FlowResumeCard', () => {
    const RESUMABLE_STATUSES: FlowStatus[] = [
        'approval_pending',
        'approval_confirmed',
        'action_pending',
        'approval_failed',
        'action_failed',
    ];

    it.each(RESUMABLE_STATUSES)('shows Resume button for %s', (status) => {
        const onResume = vi.fn();
        render(
            <FlowResumeCard
                flow={makeFlow(status)}
                onResume={onResume}
                onAbandon={vi.fn()}
            />,
        );
        expect(screen.getByTestId('flow-resume-btn')).toBeInTheDocument();
    });

    it('does NOT show Resume button for action_confirmed', () => {
        render(
            <FlowResumeCard
                flow={makeFlow('action_confirmed')}
                onResume={vi.fn()}
                onAbandon={vi.fn()}
            />,
        );
        expect(screen.queryByTestId('flow-resume-btn')).not.toBeInTheDocument();
    });

    it('shows correct tooltip for approval_pending', () => {
        render(
            <FlowResumeCard
                flow={makeFlow('approval_pending')}
                onResume={vi.fn()}
                onAbandon={vi.fn()}
            />,
        );
        expect(screen.getByTestId('flow-resume-btn')).toHaveAttribute(
            'title',
            'Reopen modal to view progress',
        );
    });

    it('shows correct tooltip for approval_confirmed', () => {
        render(
            <FlowResumeCard
                flow={makeFlow('approval_confirmed')}
                onResume={vi.fn()}
                onAbandon={vi.fn()}
            />,
        );
        expect(screen.getByTestId('flow-resume-btn')).toHaveAttribute(
            'title',
            'Reopens modal to complete step 2',
        );
    });

    it('shows correct tooltip for action_pending', () => {
        render(
            <FlowResumeCard
                flow={makeFlow('action_pending')}
                onResume={vi.fn()}
                onAbandon={vi.fn()}
            />,
        );
        expect(screen.getByTestId('flow-resume-btn')).toHaveAttribute(
            'title',
            'Reopen modal to view progress',
        );
    });

    it('shows retry tooltip for failed statuses', () => {
        render(
            <FlowResumeCard
                flow={makeFlow('approval_failed')}
                onResume={vi.fn()}
                onAbandon={vi.fn()}
            />,
        );
        expect(screen.getByTestId('flow-resume-btn')).toHaveAttribute(
            'title',
            'Reopen modal to retry',
        );
    });

    it('fires onResume callback on click', () => {
        const onResume = vi.fn();
        render(
            <FlowResumeCard
                flow={makeFlow('approval_confirmed')}
                onResume={onResume}
                onAbandon={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByTestId('flow-resume-btn'));
        expect(onResume).toHaveBeenCalledOnce();
    });

    it('fires onAbandon callback on click', () => {
        const onAbandon = vi.fn();
        render(
            <FlowResumeCard
                flow={makeFlow('approval_pending')}
                onResume={vi.fn()}
                onAbandon={onAbandon}
            />,
        );
        fireEvent.click(screen.getByTestId('flow-abandon-btn'));
        expect(onAbandon).toHaveBeenCalledOnce();
    });

    it('shows View TX link when txId available', () => {
        render(
            <FlowResumeCard
                flow={makeFlow('approval_pending', { approvalTxId: 'tx-abc123' })}
                onResume={vi.fn()}
                onAbandon={vi.fn()}
            />,
        );
        expect(screen.getByTestId('flow-view-tx')).toBeInTheDocument();
    });

    it('shows strategy badge when strategyLabel is set', () => {
        render(
            <FlowResumeCard
                flow={makeFlow('approval_confirmed', { strategyLabel: 'Covered Call' })}
                onResume={vi.fn()}
                onAbandon={vi.fn()}
            />,
        );
        expect(screen.getByTestId('strategy-badge')).toBeInTheDocument();
        expect(screen.getByTestId('strategy-badge').textContent).toBe('Covered Call');
    });

    it('does not show strategy badge when strategyLabel is null', () => {
        render(
            <FlowResumeCard
                flow={makeFlow('approval_confirmed', { strategyLabel: null })}
                onResume={vi.fn()}
                onAbandon={vi.fn()}
            />,
        );
        expect(screen.queryByTestId('strategy-badge')).not.toBeInTheDocument();
    });
});
