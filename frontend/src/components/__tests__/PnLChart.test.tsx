/**
 * PnLChart tests — verifies rendering and payoff data flow.
 *
 * Mocks lightweight-charts (no DOM canvas in jsdom).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Override global mock from setup.ts — use real implementation (with lightweight-charts mocked below)
vi.unmock('../PnLChart.tsx');

vi.mock('lightweight-charts', () => {
    const mockSeries = {
        setData: vi.fn(),
        applyOptions: vi.fn(),
    };
    const mockChart = {
        addSeries: vi.fn(() => mockSeries),
        applyOptions: vi.fn(),
        timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
        priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
        remove: vi.fn(),
    };
    return {
        createChart: vi.fn(() => mockChart),
        AreaSeries: 'AreaSeries',
        ColorType: { Solid: 'solid' },
    };
});

import { PnLChart } from '../PnLChart.js';
import { OptionType, OptionStatus } from '../../services/types.js';
import type { OptionData } from '../../services/types.js';

const ONE = 10n ** 18n;

function makeOption(overrides: Partial<OptionData> = {}): OptionData {
    return {
        id: 1n,
        writer: '0x' + 'aa'.repeat(32),
        buyer: '0x' + 'bb'.repeat(32),
        optionType: OptionType.CALL,
        strikePrice: 50n * ONE,
        underlyingAmount: 1n * ONE,
        premium: 5n * ONE,
        expiryBlock: 10000n,
        status: OptionStatus.OPEN,
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    // ResizeObserver mock — must use function() for constructor
    global.ResizeObserver = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        this.unobserve = vi.fn();
    }) as unknown as typeof ResizeObserver;
});

describe('PnLChart', () => {
    it('renders with data-testid', () => {
        render(
            <PnLChart
                option={makeOption()}
                motoPillRatio={50}
                buyFeeBps={100n}
            />,
        );
        expect(screen.getByTestId('pnl-chart')).toBeTruthy();
    });

    it('shows max loss label', () => {
        render(
            <PnLChart
                option={makeOption()}
                motoPillRatio={50}
                buyFeeBps={100n}
            />,
        );
        expect(screen.getByText(/Max loss/)).toBeTruthy();
    });

    it('shows current spot label', () => {
        render(
            <PnLChart
                option={makeOption()}
                motoPillRatio={50}
                buyFeeBps={100n}
            />,
        );
        expect(screen.getByText('50.00')).toBeTruthy();
    });

    it('shows breakeven for CALL', () => {
        render(
            <PnLChart
                option={makeOption({
                    optionType: OptionType.CALL,
                    strikePrice: 50n * ONE,
                    premium: 5n * ONE,
                })}
                motoPillRatio={50}
                buyFeeBps={100n}
            />,
        );
        // Breakeven for CALL ≈ strike + premium + fee = ~55.05
        expect(screen.getByText(/BE:/)).toBeTruthy();
    });

    it('renders PUT payoff chart', () => {
        render(
            <PnLChart
                option={makeOption({ optionType: OptionType.PUT })}
                motoPillRatio={50}
                buyFeeBps={100n}
            />,
        );
        expect(screen.getByTestId('pnl-chart')).toBeTruthy();
    });
});
