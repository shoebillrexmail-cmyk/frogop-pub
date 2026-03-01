/**
 * CollarModal tests — two-step collar strategy orchestration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OptionType, OptionStatus } from '../../services/types.ts';
import type { OptionData, PoolInfo } from '../../services/types.ts';
import { CollarModal } from '../CollarModal.tsx';

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
    onWriteCall: vi.fn(),
    onBuyPut: vi.fn(),
    onClose: vi.fn(),
};

describe('CollarModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the modal with both strategy legs', () => {
        render(<CollarModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('collar-modal')).toBeInTheDocument();
        expect(screen.getByTestId('collar-step-1')).toBeInTheDocument();
        expect(screen.getByTestId('collar-step-2')).toBeInTheDocument();
    });

    it('shows call leg strike at 120% and put leg at 80%', () => {
        render(<CollarModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('collar-step-1')).toHaveTextContent('60.0000');
        expect(screen.getByTestId('collar-step-2')).toHaveTextContent('40.0000');
    });

    it('shows net premium', () => {
        render(<CollarModal {...DEFAULT_PROPS} />);
        expect(screen.getByTestId('collar-net-premium')).toBeInTheDocument();
    });

    it('step 1 button calls onWriteCall with correct initialValues', () => {
        const onWriteCall = vi.fn();
        render(<CollarModal {...DEFAULT_PROPS} onWriteCall={onWriteCall} />);
        fireEvent.click(screen.getByTestId('collar-write-call-btn'));
        expect(onWriteCall).toHaveBeenCalledOnce();
        const args = onWriteCall.mock.calls[0][0];
        expect(args.optionType).toBe(OptionType.CALL);
        expect(args.strikeStr).toBe('60.0000');
        expect(args.selectedDays).toBe(30);
    });

    it('marks step 1 done after clicking Write CALL', () => {
        render(<CollarModal {...DEFAULT_PROPS} />);
        fireEvent.click(screen.getByTestId('collar-write-call-btn'));
        // Step 1 should show a checkmark or completion indicator
        expect(screen.getByTestId('collar-step-1')).toHaveTextContent(/done|✓/i);
    });

    it('step 2 button disabled when no suitable put available', () => {
        render(<CollarModal {...DEFAULT_PROPS} options={[]} />);
        expect(screen.getByTestId('collar-buy-put-btn')).toBeDisabled();
    });

    it('step 2 button enabled when suitable put exists', () => {
        const put = makeOpenPut(1n, 43.75); // 87.5% of 50
        render(<CollarModal {...DEFAULT_PROPS} options={[put]} />);
        expect(screen.getByTestId('collar-buy-put-btn')).not.toBeDisabled();
    });

    it('step 2 calls onBuyPut with best available put', () => {
        const put = makeOpenPut(1n, 43.75);
        const onBuyPut = vi.fn();
        render(<CollarModal {...DEFAULT_PROPS} options={[put]} onBuyPut={onBuyPut} />);
        fireEvent.click(screen.getByTestId('collar-buy-put-btn'));
        expect(onBuyPut).toHaveBeenCalledWith(put);
    });

    it('closes on close button click', () => {
        const onClose = vi.fn();
        render(<CollarModal {...DEFAULT_PROPS} onClose={onClose} />);
        fireEvent.click(screen.getByLabelText('Close modal'));
        expect(onClose).toHaveBeenCalledOnce();
    });
});
