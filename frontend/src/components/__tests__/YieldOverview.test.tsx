/**
 * YieldOverview tests — market yield stats and personal stats.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OptionType, OptionStatus } from '../../services/types.ts';
import type { OptionData } from '../../services/types.ts';
import { YieldOverview } from '../YieldOverview.tsx';

const ONE = 10n ** 18n;
const WALLET_HEX = '0xdead000000000000000000000000000000000000000000000000000000000001';
const ZERO_HEX = '0x' + '0'.repeat(64);

function makeOption(overrides: Partial<OptionData> = {}): OptionData {
    return {
        id: 1n,
        writer: '0x' + 'aa'.repeat(32),
        buyer: ZERO_HEX,
        optionType: OptionType.CALL,
        strikePrice: 50n * ONE,
        underlyingAmount: 1n * ONE,
        premium: 5n * ONE,
        expiryBlock: 900000n,
        status: OptionStatus.OPEN,
        ...overrides,
    };
}

describe('YieldOverview', () => {
    it('shows "No open options yet" when empty', () => {
        render(<YieldOverview options={[]} motoPillRatio={50} walletHex={null} />);
        expect(screen.getByTestId('yield-empty')).toHaveTextContent('No open options yet');
    });

    it('shows correct avg CALL yield with motoPillRatio', () => {
        const options = [
            // 5 PILL / (1 MOTO * 50 spot) = 10%
            makeOption({ id: 1n, optionType: OptionType.CALL, premium: 5n * ONE, underlyingAmount: 1n * ONE }),
            // 10 PILL / (1 MOTO * 50 spot) = 20%
            makeOption({ id: 2n, optionType: OptionType.CALL, premium: 10n * ONE, underlyingAmount: 1n * ONE }),
        ];
        render(<YieldOverview options={options} motoPillRatio={50} walletHex={null} />);
        // Avg = (10 + 20) / 2 = 15%
        expect(screen.getByTestId('avg-call-yield')).toHaveTextContent('15.00%');
    });

    it('shows "—" for CALL yield when no motoPillRatio', () => {
        const options = [
            makeOption({ optionType: OptionType.CALL }),
        ];
        render(<YieldOverview options={options} motoPillRatio={null} walletHex={null} />);
        expect(screen.getByTestId('avg-call-yield')).toHaveTextContent('—');
    });

    it('shows correct avg PUT yield', () => {
        const options = [
            // collateral = 50*1=50 PILL, yield = 5/50*100 = 10%
            makeOption({ id: 1n, optionType: OptionType.PUT, premium: 5n * ONE }),
            // collateral = 50*1=50 PILL, yield = 10/50*100 = 20%
            makeOption({ id: 2n, optionType: OptionType.PUT, premium: 10n * ONE }),
        ];
        render(<YieldOverview options={options} motoPillRatio={null} walletHex={null} />);
        // Avg = (10 + 20) / 2 = 15%
        expect(screen.getByTestId('avg-put-yield')).toHaveTextContent('15.00%');
    });

    it('shows personal stats when walletHex provided', () => {
        const options = [
            // Need at least one OPEN option so the stats grid renders
            makeOption({ id: 0n, status: OptionStatus.OPEN }),
            makeOption({
                id: 1n,
                writer: WALLET_HEX,
                buyer: '0x' + 'bb'.repeat(32),
                status: OptionStatus.PURCHASED,
                premium: 5n * ONE,
            }),
        ];
        render(<YieldOverview options={options} motoPillRatio={50} walletHex={WALLET_HEX} />);
        expect(screen.getByTestId('active-writes')).toHaveTextContent('1');
        expect(screen.getByTestId('total-premium')).toHaveTextContent('5.0000 PILL');
    });

    it('shows connect wallet hint when walletHex is null', () => {
        const options = [makeOption()];
        render(<YieldOverview options={options} motoPillRatio={50} walletHex={null} />);
        expect(screen.getByTestId('connect-hint')).toHaveTextContent('Connect wallet for personal stats');
    });
});
