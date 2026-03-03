/**
 * QuickStrategies tests — writer-focused strategy cards for Write tab.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OptionType } from '../../services/types.ts';
import type { PoolInfo } from '../../services/types.ts';
import { QuickStrategies } from '../QuickStrategies.tsx';

const POOL_INFO: PoolInfo = {
    underlying: '0xaaaa',
    premiumToken: '0xbbbb',
    optionCount: 5n,
    cancelFeeBps: 100n,
    buyFeeBps: 100n,
    exerciseFeeBps: 10n,
    gracePeriodBlocks: 144n,
};

const DEFAULT_PROPS = {
    poolInfo: POOL_INFO,
    motoPillRatio: 50 as number | null,
    motoBal: null as number | null,
    onCoveredCall: vi.fn(),
    onWritePut: vi.fn(),
    onCollar: vi.fn(),
    onWriteCustom: vi.fn(),
};

describe('QuickStrategies', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders Covered Call, Collar, Write Protective Put, and Write Custom cards', () => {
        render(<QuickStrategies {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('strategy-covered-call')).toBeInTheDocument();
        expect(screen.getByTestId('strategy-collar')).toBeInTheDocument();
        expect(screen.getByTestId('strategy-write-put')).toBeInTheDocument();
        expect(screen.getByTestId('strategy-write-custom')).toBeInTheDocument();
    });

    // -----------------------------------------------------------------------
    // Disabled state (no price)
    // -----------------------------------------------------------------------

    describe('when motoPillRatio is null', () => {
        it('Covered Call, Collar, and Write Put buttons are disabled', () => {
            render(<QuickStrategies {...DEFAULT_PROPS} motoPillRatio={null} />);
            expect(screen.getByTestId('strategy-covered-call-btn')).toBeDisabled();
            expect(screen.getByTestId('strategy-collar-btn')).toBeDisabled();
            expect(screen.getByTestId('strategy-write-put-btn')).toBeDisabled();
        });

        it('shows price unavailable message for Covered Call, Collar, and Write Put', () => {
            render(<QuickStrategies {...DEFAULT_PROPS} motoPillRatio={null} />);
            const msgs = screen.getAllByText(/price data unavailable/i);
            expect(msgs.length).toBe(3); // Covered Call + Collar + Write Put
        });
    });

    // -----------------------------------------------------------------------
    // Covered Call card
    // -----------------------------------------------------------------------

    describe('Covered Call card', () => {
        it('shows computed strike at 120% of spot', () => {
            render(<QuickStrategies {...DEFAULT_PROPS} motoPillRatio={50} />);
            expect(screen.getByTestId('strategy-covered-call')).toHaveTextContent('60.0000');
        });

        it('calls onCoveredCall with initialValues on button click', () => {
            const onCoveredCall = vi.fn();
            render(<QuickStrategies {...DEFAULT_PROPS} onCoveredCall={onCoveredCall} />);
            fireEvent.click(screen.getByTestId('strategy-covered-call-btn'));
            expect(onCoveredCall).toHaveBeenCalledOnce();
            const args = onCoveredCall.mock.calls[0][0];
            expect(args.optionType).toBe(OptionType.CALL);
            expect(args.strikeStr).toBe('60.0000');
            expect(args.selectedDays).toBe(30);
        });
    });

    // -----------------------------------------------------------------------
    // Collar card
    // -----------------------------------------------------------------------

    describe('Collar card', () => {
        it('shows both leg strikes', () => {
            render(<QuickStrategies {...DEFAULT_PROPS} />);
            const card = screen.getByTestId('strategy-collar');
            expect(card).toHaveTextContent('60.0000'); // call at 120%
            expect(card).toHaveTextContent('40.0000'); // put at 80%
        });

        it('calls onCollar on button click', () => {
            const onCollar = vi.fn();
            render(<QuickStrategies {...DEFAULT_PROPS} onCollar={onCollar} />);
            fireEvent.click(screen.getByTestId('strategy-collar-btn'));
            expect(onCollar).toHaveBeenCalledOnce();
        });
    });

    // -----------------------------------------------------------------------
    // Write Protective Put card
    // -----------------------------------------------------------------------

    describe('Write Protective Put card', () => {
        it('shows computed strike at 87.5% of spot', () => {
            render(<QuickStrategies {...DEFAULT_PROPS} motoPillRatio={50} />);
            expect(screen.getByTestId('strategy-write-put')).toHaveTextContent('43.7500');
        });

        it('calls onWritePut with initialValues on button click', () => {
            const onWritePut = vi.fn();
            render(<QuickStrategies {...DEFAULT_PROPS} onWritePut={onWritePut} />);
            fireEvent.click(screen.getByTestId('strategy-write-put-btn'));
            expect(onWritePut).toHaveBeenCalledOnce();
            const args = onWritePut.mock.calls[0][0];
            expect(args.optionType).toBe(OptionType.PUT);
            expect(args.strikeStr).toBe('43.7500');
            expect(args.selectedDays).toBe(30);
        });
    });

    // -----------------------------------------------------------------------
    // Write Custom card
    // -----------------------------------------------------------------------

    describe('Write Custom card', () => {
        it('renders and triggers onWriteCustom callback', () => {
            const onWriteCustom = vi.fn();
            render(<QuickStrategies {...DEFAULT_PROPS} onWriteCustom={onWriteCustom} />);
            expect(screen.getByTestId('strategy-write-custom')).toBeInTheDocument();
            fireEvent.click(screen.getByTestId('strategy-write-custom-btn'));
            expect(onWriteCustom).toHaveBeenCalledOnce();
        });

        it('is always enabled when wallet is connected (no price dependency)', () => {
            render(<QuickStrategies {...DEFAULT_PROPS} motoPillRatio={null} />);
            expect(screen.getByTestId('strategy-write-custom-btn')).not.toBeDisabled();
        });

        it('is disabled when wallet is not connected', () => {
            render(<QuickStrategies {...DEFAULT_PROPS} walletConnected={false} />);
            expect(screen.getByTestId('strategy-write-custom-btn')).toBeDisabled();
        });
    });
});
