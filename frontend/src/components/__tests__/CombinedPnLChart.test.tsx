/**
 * CombinedPnLChart tests — break-even markers, summary labels, net premium.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CombinedPnLChart } from '../CombinedPnLChart.tsx';
import type { LegConfig } from '../LegSelector.tsx';
import { OptionType } from '../../services/types.ts';

// Simple write legs for testing
const callLeg: LegConfig = {
    action: 'write',
    optionType: OptionType.CALL,
    strikeStr: '60',
    amountStr: '1',
    premiumStr: '5',
};

const putLeg: LegConfig = {
    action: 'write',
    optionType: OptionType.PUT,
    strikeStr: '40',
    amountStr: '1',
    premiumStr: '3',
};

describe('CombinedPnLChart', () => {
    it('renders chart with configured legs', () => {
        render(
            <CombinedPnLChart
                legs={[callLeg]}
                options={[]}
                spotPrice={50}
            />,
        );
        expect(screen.getByTestId('combined-pnl-chart')).toBeInTheDocument();
    });

    it('shows placeholder when no legs configured', () => {
        render(
            <CombinedPnLChart
                legs={[{ action: 'buy' }]}
                options={[]}
                spotPrice={50}
            />,
        );
        expect(screen.getByText(/Configure both legs/)).toBeInTheDocument();
    });

    it('shows max profit and max loss labels', () => {
        render(
            <CombinedPnLChart
                legs={[callLeg]}
                options={[]}
                spotPrice={50}
                premiumSymbol="PILL"
            />,
        );
        expect(screen.getByText(/Max profit/)).toBeInTheDocument();
        expect(screen.getByText(/Max loss/)).toBeInTheDocument();
    });

    it('displays break-even markers', () => {
        // A write CALL at 60 with premium 5 breaks even at 65
        render(
            <CombinedPnLChart
                legs={[callLeg]}
                options={[]}
                spotPrice={50}
            />,
        );
        // The chart should have breakeven markers (SVG + summary)
        const beElements = screen.getAllByText(/BE:/);
        expect(beElements.length).toBeGreaterThan(0);
    });

    it('shows net premium for multi-leg strategy', () => {
        render(
            <CombinedPnLChart
                legs={[callLeg, putLeg]}
                options={[]}
                spotPrice={50}
                premiumSymbol="PILL"
            />,
        );
        expect(screen.getByText(/Net premium/)).toBeInTheDocument();
    });

    it('renders SVG path for P&L line', () => {
        const { container } = render(
            <CombinedPnLChart
                legs={[callLeg]}
                options={[]}
                spotPrice={50}
            />,
        );
        const path = container.querySelector('path');
        expect(path).not.toBeNull();
        expect(path?.getAttribute('d')).toContain('M');
    });
});
