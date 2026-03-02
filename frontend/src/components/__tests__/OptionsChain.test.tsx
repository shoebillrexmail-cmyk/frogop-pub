/**
 * OptionsChain tests — chain matrix rendering, expiry tabs, cell interaction,
 * ATM divider, and Buy callback.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { OptionType, OptionStatus } from '../../services/types.ts';
import type { OptionData } from '../../services/types.ts';
import { OptionsChain } from '../OptionsChain.tsx';

const e18 = 10n ** 18n;

function makeOption(overrides: Partial<OptionData> = {}): OptionData {
    return {
        id: 1n,
        writer: '0x' + 'aa'.repeat(32),
        buyer: '0x' + '00'.repeat(32),
        optionType: OptionType.CALL,
        strikePrice: 100n * e18,
        underlyingAmount: 1n * e18,
        premium: 5n * e18,
        expiryBlock: 1000n,
        status: OptionStatus.OPEN,
        ...overrides,
    };
}

const DEFAULT_PROPS = {
    options: [] as OptionData[],
    walletHex: null as string | null,
    walletConnected: false,
    currentBlock: 500n,
    motoPillRatio: null as number | null,
    onBuy: vi.fn(),
};

describe('OptionsChain', () => {
    it('shows empty state when no open options', () => {
        const purchased = makeOption({ status: OptionStatus.PURCHASED });
        render(<OptionsChain {...DEFAULT_PROPS} options={[purchased]} />);
        expect(screen.getByTestId('chain-empty')).toBeInTheDocument();
        expect(screen.getByText(/No open options/)).toBeInTheDocument();
    });

    it('renders expiry tabs with only active buckets', () => {
        const opt = makeOption({ expiryBlock: 600n }); // 100 blocks left → lt1d
        render(<OptionsChain {...DEFAULT_PROPS} options={[opt]} />);

        const tabs = screen.getByTestId('expiry-tabs');
        expect(within(tabs).getByTestId('expiry-tab-all')).toBeInTheDocument();
        expect(within(tabs).getByTestId('expiry-tab-lt1d')).toBeInTheDocument();
        expect(within(tabs).queryByTestId('expiry-tab-1to7d')).not.toBeInTheDocument();
    });

    it('"All" tab is shown first', () => {
        const opt = makeOption({ expiryBlock: 1100n }); // 600 blocks → 1to7d
        render(<OptionsChain {...DEFAULT_PROPS} options={[opt]} />);

        const tabs = screen.getByTestId('expiry-tabs');
        const buttons = within(tabs).getAllByRole('button');
        expect(buttons[0]).toHaveTextContent('All');
    });

    it('renders strike rows with call and put cells', () => {
        const call = makeOption({ id: 1n, optionType: OptionType.CALL, expiryBlock: 700n });
        const put = makeOption({ id: 2n, optionType: OptionType.PUT, expiryBlock: 700n, premium: 3n * e18 });
        render(<OptionsChain {...DEFAULT_PROPS} options={[call, put]} />);

        // Row exists
        expect(screen.getByTestId(`chain-row-${100n * e18}`)).toBeInTheDocument();

        // Both cells
        const cells = screen.getAllByTestId(/^chain-cell-/);
        expect(cells.length).toBe(2);
    });

    it('empty cells show dashes', () => {
        // Only a CALL, no PUT at this strike
        const call = makeOption({ expiryBlock: 700n });
        render(<OptionsChain {...DEFAULT_PROPS} options={[call]} />);

        // PUT side should have dashes
        const putCell = screen.getByTestId('chain-cell-put');
        expect(putCell.textContent).toContain('—');
    });

    it('cell shows best premium and depth', () => {
        const opts = [
            makeOption({ id: 1n, premium: 10n * e18, expiryBlock: 700n }),
            makeOption({ id: 2n, premium: 3n * e18, expiryBlock: 700n }),
        ];
        render(<OptionsChain {...DEFAULT_PROPS} options={opts} />);

        const callCell = screen.getByTestId('chain-cell-call');
        expect(callCell.textContent).toContain('×2');
        expect(callCell.textContent).toContain('3.0000'); // best premium = 3
    });

    it('click cell to expand, click again to collapse', () => {
        const opt = makeOption({ expiryBlock: 700n });
        render(<OptionsChain {...DEFAULT_PROPS} options={[opt]} />);

        // No expanded listings initially
        expect(screen.queryByTestId('expanded-listings')).not.toBeInTheDocument();

        // Click the call cell
        fireEvent.click(screen.getByTestId('chain-cell-call'));
        expect(screen.getByTestId('expanded-listings')).toBeInTheDocument();

        // Click again to collapse
        fireEvent.click(screen.getByTestId('chain-cell-call'));
        expect(screen.queryByTestId('expanded-listings')).not.toBeInTheDocument();
    });

    it('Buy button calls onBuy with correct option', () => {
        const onBuy = vi.fn();
        const opt = makeOption({ expiryBlock: 700n });
        render(
            <OptionsChain
                {...DEFAULT_PROPS}
                options={[opt]}
                walletConnected={true}
                walletHex={'0x' + 'cc'.repeat(32)} // different from writer
                onBuy={onBuy}
            />,
        );

        // Expand the cell
        fireEvent.click(screen.getByTestId('chain-cell-call'));

        // Click Buy
        const buyBtn = screen.getByTestId('chain-buy-1');
        fireEvent.click(buyBtn);

        expect(onBuy).toHaveBeenCalledTimes(1);
        expect(onBuy).toHaveBeenCalledWith(expect.objectContaining({ id: 1n }));
    });

    it('ATM divider present when spot provided, absent otherwise', () => {
        const opt = makeOption({ expiryBlock: 700n, strikePrice: 100n * e18 });

        // With spot
        const { unmount } = render(
            <OptionsChain {...DEFAULT_PROPS} options={[opt]} motoPillRatio={100} />,
        );
        expect(screen.getByTestId('atm-divider')).toBeInTheDocument();
        unmount();

        // Without spot
        render(<OptionsChain {...DEFAULT_PROPS} options={[opt]} motoPillRatio={null} />);
        expect(screen.queryByTestId('atm-divider')).not.toBeInTheDocument();
    });

    it('walletConnected=false disables buy buttons', () => {
        const opt = makeOption({ expiryBlock: 700n });
        render(
            <OptionsChain
                {...DEFAULT_PROPS}
                options={[opt]}
                walletConnected={false}
                walletHex={null}
            />,
        );

        // Expand
        fireEvent.click(screen.getByTestId('chain-cell-call'));

        const buyBtn = screen.getByTestId('chain-buy-1');
        expect(buyBtn).toBeDisabled();
    });

    it('writer sees "Your listing" instead of Buy', () => {
        const writerHex = '0x' + 'aa'.repeat(32);
        const opt = makeOption({ expiryBlock: 700n, writer: writerHex });
        render(
            <OptionsChain
                {...DEFAULT_PROPS}
                options={[opt]}
                walletConnected={true}
                walletHex={writerHex}
            />,
        );

        // Expand
        fireEvent.click(screen.getByTestId('chain-cell-call'));

        expect(screen.getByText('Your listing')).toBeInTheDocument();
        expect(screen.queryByTestId('chain-buy-1')).not.toBeInTheDocument();
    });
});
