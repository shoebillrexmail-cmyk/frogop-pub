/**
 * QuickStrategies tests — strategy card section rendering and callbacks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OptionType, OptionStatus } from '../../services/types.ts';
import type { OptionData, PoolInfo } from '../../services/types.ts';
import { QuickStrategies } from '../QuickStrategies.tsx';

const ONE = 10n ** 18n;

const POOL_INFO: PoolInfo = {
    underlying: '0xaaaa',
    premiumToken: '0xbbbb',
    optionCount: 5n,
    cancelFeeBps: 100n,
    buyFeeBps: 100n,
    exerciseFeeBps: 10n,
    gracePeriodBlocks: 144n,
};

function makeOpenPut(id: bigint, strikeFloat: number): OptionData {
    return {
        id,
        writer: '0x' + 'aa'.repeat(32),
        buyer: '0x' + '00'.repeat(32),
        optionType: OptionType.PUT,
        strikePrice: BigInt(Math.round(strikeFloat * 1e18)),
        underlyingAmount: 1n * ONE,
        premium: 2n * ONE,
        expiryBlock: 900000n,
        status: OptionStatus.OPEN,
    };
}

const DEFAULT_PROPS = {
    poolInfo: POOL_INFO,
    options: [] as OptionData[],
    motoPillRatio: 50 as number | null,
    motoBal: null as number | null,
    onCoveredCall: vi.fn(),
    onProtectivePut: vi.fn(),
    onCollar: vi.fn(),
};

describe('QuickStrategies', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders all three strategy cards', () => {
        render(<QuickStrategies {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('strategy-covered-call')).toBeInTheDocument();
        expect(screen.getByTestId('strategy-protective-put')).toBeInTheDocument();
        expect(screen.getByTestId('strategy-collar')).toBeInTheDocument();
    });

    // -----------------------------------------------------------------------
    // Disabled state (no price)
    // -----------------------------------------------------------------------

    describe('when motoPillRatio is null', () => {
        it('all strategy buttons are disabled', () => {
            render(<QuickStrategies {...DEFAULT_PROPS} motoPillRatio={null} />);
            expect(screen.getByTestId('strategy-covered-call-btn')).toBeDisabled();
            expect(screen.getByTestId('strategy-protective-put-btn')).toBeDisabled();
            expect(screen.getByTestId('strategy-collar-btn')).toBeDisabled();
        });

        it('shows price unavailable message', () => {
            render(<QuickStrategies {...DEFAULT_PROPS} motoPillRatio={null} />);
            const msgs = screen.getAllByText(/price data unavailable/i);
            expect(msgs.length).toBe(3);
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
    // Protective Put card
    // -----------------------------------------------------------------------

    describe('Protective Put card', () => {
        it('shows best put details when a suitable put exists', () => {
            const put = makeOpenPut(1n, 43.75); // 87.5% of 50
            render(<QuickStrategies {...DEFAULT_PROPS} options={[put]} />);
            // Should show the put strike
            expect(screen.getByTestId('strategy-protective-put')).toHaveTextContent('43.7500');
        });

        it('disables button when no suitable put found', () => {
            render(<QuickStrategies {...DEFAULT_PROPS} options={[]} />);
            expect(screen.getByTestId('strategy-protective-put-btn')).toBeDisabled();
        });

        it('shows no puts message when none available', () => {
            render(<QuickStrategies {...DEFAULT_PROPS} options={[]} />);
            expect(screen.getByTestId('strategy-protective-put')).toHaveTextContent(/no puts in the 80/i);
        });

        it('calls onProtectivePut with the OptionData on click', () => {
            const put = makeOpenPut(5n, 43.75);
            const onProtectivePut = vi.fn();
            render(<QuickStrategies {...DEFAULT_PROPS} options={[put]} onProtectivePut={onProtectivePut} />);
            fireEvent.click(screen.getByTestId('strategy-protective-put-btn'));
            expect(onProtectivePut).toHaveBeenCalledWith(put);
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
});
