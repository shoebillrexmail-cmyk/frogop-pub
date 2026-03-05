/**
 * LegSelector tests — moneyness badge, BS premium, action toggle.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LegSelector } from '../LegSelector.tsx';
import type { LegConfig } from '../LegSelector.tsx';
import { OptionType } from '../../services/types.ts';

// Mock useSuggestedPremium
vi.mock('../../hooks/useSuggestedPremium.ts', () => ({
    useSuggestedPremium: vi.fn(() => ({
        suggestedPremium: 5_000000000000000000n, // 5 PILL
        annualizedVol: 0.8,
    })),
}));

// Mock classifyMoneyness
vi.mock('../../utils/optionsChain.ts', async () => {
    const actual = await vi.importActual('../../utils/optionsChain.ts');
    return {
        ...actual,
        classifyMoneyness: vi.fn((optType: number, strike: number, spot: number) => {
            if (strike === 0 || spot === 0) return null;
            const pctFromSpot = ((strike - spot) / spot) * 100;
            if (Math.abs(pctFromSpot) < 3) return { moneyness: 'ATM', label: `ATM ${pctFromSpot.toFixed(1)}% from spot` };
            if (optType === OptionType.CALL) {
                return strike < spot
                    ? { moneyness: 'ITM', label: `ITM ${pctFromSpot.toFixed(1)}% from spot` }
                    : { moneyness: 'OTM', label: `OTM +${pctFromSpot.toFixed(1)}% from spot` };
            }
            return strike > spot
                ? { moneyness: 'ITM', label: `ITM +${pctFromSpot.toFixed(1)}% from spot` }
                : { moneyness: 'OTM', label: `OTM ${pctFromSpot.toFixed(1)}% from spot` };
        }),
    };
});

const defaultLeg: LegConfig = { action: 'write', optionType: OptionType.CALL, strikeStr: '60', amountStr: '1', premiumStr: '' };

describe('LegSelector', () => {
    it('renders leg header with number and label', () => {
        render(<LegSelector legNumber={1} label="Write CALL" availableOptions={[]} value={defaultLeg} onChange={() => {}} />);
        expect(screen.getByText('Leg 1')).toBeInTheDocument();
        expect(screen.getByText('Write CALL')).toBeInTheDocument();
    });

    it('shows moneyness badge when spotPrice provided', () => {
        render(
            <LegSelector
                legNumber={1}
                label="Write CALL"
                availableOptions={[]}
                value={defaultLeg}
                onChange={() => {}}
                spotPrice={50}
            />,
        );
        expect(screen.getByTestId('leg-1-moneyness')).toBeInTheDocument();
        expect(screen.getByTestId('leg-1-moneyness-badge')).toBeInTheDocument();
        expect(screen.getByText(/from spot/)).toBeInTheDocument();
    });

    it('shows spot price display', () => {
        render(
            <LegSelector
                legNumber={1}
                label="Test"
                availableOptions={[]}
                value={defaultLeg}
                onChange={() => {}}
                spotPrice={50}
                premiumSymbol="PILL"
            />,
        );
        expect(screen.getByText(/50\.00/)).toBeInTheDocument();
    });

    it('does not show moneyness when no spotPrice', () => {
        render(
            <LegSelector
                legNumber={1}
                label="Test"
                availableOptions={[]}
                value={defaultLeg}
                onChange={() => {}}
            />,
        );
        expect(screen.queryByTestId('leg-1-moneyness')).not.toBeInTheDocument();
    });

    it('shows BS suggested premium with Use button', () => {
        render(
            <LegSelector
                legNumber={1}
                label="Test"
                availableOptions={[]}
                value={defaultLeg}
                onChange={() => {}}
                spotPrice={50}
            />,
        );
        expect(screen.getByTestId('leg-1-bs-suggestion')).toBeInTheDocument();
        expect(screen.getByText(/Fair value/)).toBeInTheDocument();
        expect(screen.getByTestId('leg-1-use-bs')).toBeInTheDocument();
    });

    it('Use button calls onChange with suggested premium', () => {
        const onChange = vi.fn();
        render(
            <LegSelector
                legNumber={1}
                label="Test"
                availableOptions={[]}
                value={defaultLeg}
                onChange={onChange}
                spotPrice={50}
            />,
        );
        fireEvent.click(screen.getByTestId('leg-1-use-bs'));
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ premiumStr: expect.any(String) }),
        );
    });

    it('toggles between buy and write actions', () => {
        const onChange = vi.fn();
        render(
            <LegSelector
                legNumber={1}
                label="Test"
                availableOptions={[]}
                value={defaultLeg}
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByText('Buy Existing'));
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ action: 'buy' }));
    });

    it('does not show moneyness in buy mode', () => {
        const buyLeg: LegConfig = { action: 'buy' };
        render(
            <LegSelector
                legNumber={1}
                label="Test"
                availableOptions={[]}
                value={buyLeg}
                onChange={() => {}}
                spotPrice={50}
            />,
        );
        expect(screen.queryByTestId('leg-1-moneyness')).not.toBeInTheDocument();
    });
});
