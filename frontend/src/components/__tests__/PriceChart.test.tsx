/**
 * PriceChart tests — rendering, token/interval selectors, axis labels.
 *
 * Mocks lightweight-charts (no DOM canvas in jsdom).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Override global mock from setup.ts — use real implementation
vi.unmock('../PriceChart.tsx');

const mockSetData = vi.fn();
const mockApplyOptions = vi.fn();
const mockSeries = {
    setData: mockSetData,
    applyOptions: mockApplyOptions,
};
const mockFitContent = vi.fn();
const mockChart = {
    addSeries: vi.fn(() => mockSeries),
    applyOptions: vi.fn(),
    timeScale: vi.fn(() => ({ fitContent: mockFitContent })),
    priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    remove: vi.fn(),
};

vi.mock('lightweight-charts', () => ({
    createChart: vi.fn(() => mockChart),
    CandlestickSeries: 'CandlestickSeries',
    HistogramSeries: 'HistogramSeries',
    ColorType: { Solid: 'solid' },
}));

import { PriceChart } from '../PriceChart.tsx';
import type { CandleData } from '../../services/priceService.ts';

// ---------------------------------------------------------------------------
// jsdom polyfills
// ---------------------------------------------------------------------------

// ResizeObserver mock — must use function() for constructor
global.ResizeObserver = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.observe = vi.fn();
    this.unobserve = vi.fn();
    this.disconnect = vi.fn();
}) as unknown as typeof ResizeObserver;

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function makeCandle(overrides: Partial<CandleData> = {}): CandleData {
    return {
        time: 1709251200,
        open: 2000,
        high: 2500,
        low: 1666,
        close: 2222,
        volume: 500_000,
        tradeCount: 12,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PriceChart', () => {
    const defaultProps = {
        candles: [makeCandle()],
        token: 'MOTO',
        interval: '1d',
        onIntervalChange: vi.fn(),
        onTokenChange: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders chart title with denomination for MOTO', () => {
        render(<PriceChart {...defaultProps} token="MOTO" />);
        expect(screen.getByText('MOTO (sats/MOTO)')).toBeTruthy();
    });

    it('renders chart title with denomination for PILL', () => {
        render(<PriceChart {...defaultProps} token="PILL" />);
        expect(screen.getByText('PILL (sats/PILL)')).toBeTruthy();
    });

    it('renders chart title for MOTO_PILL ratio', () => {
        render(<PriceChart {...defaultProps} token="MOTO_PILL" />);
        expect(screen.getByText('MOTO/PILL ratio')).toBeTruthy();
    });

    it('renders volume unit label', () => {
        render(<PriceChart {...defaultProps} />);
        expect(screen.getByText('vol: sats')).toBeTruthy();
    });

    it('renders all token selector buttons', () => {
        render(<PriceChart {...defaultProps} />);
        expect(screen.getByText('MOTO')).toBeTruthy();
        expect(screen.getByText('PILL')).toBeTruthy();
        expect(screen.getByText('MOTO/PILL')).toBeTruthy();
    });

    it('renders all interval selector buttons', () => {
        render(<PriceChart {...defaultProps} />);
        expect(screen.getByText('1H')).toBeTruthy();
        expect(screen.getByText('4H')).toBeTruthy();
        expect(screen.getByText('1D')).toBeTruthy();
        expect(screen.getByText('1W')).toBeTruthy();
    });

    it('calls onTokenChange when token button is clicked', () => {
        const onTokenChange = vi.fn();
        render(<PriceChart {...defaultProps} onTokenChange={onTokenChange} />);
        fireEvent.click(screen.getByText('PILL'));
        expect(onTokenChange).toHaveBeenCalledWith('PILL');
    });

    it('calls onIntervalChange when interval button is clicked', () => {
        const onIntervalChange = vi.fn();
        render(<PriceChart {...defaultProps} onIntervalChange={onIntervalChange} />);
        fireEvent.click(screen.getByText('4H'));
        expect(onIntervalChange).toHaveBeenCalledWith('4h');
    });

    it('highlights the active token button', () => {
        const { container } = render(<PriceChart {...defaultProps} token="PILL" />);
        // The active button has bg-accent class
        const pillBtn = screen.getByText('PILL');
        expect(pillBtn.className).toContain('bg-accent');
        // Inactive button does not
        const motoBtn = screen.getByText('MOTO');
        expect(motoBtn.className).not.toContain('bg-accent');
    });

    it('highlights the active interval button', () => {
        render(<PriceChart {...defaultProps} interval="4h" />);
        const btn4h = screen.getByText('4H');
        expect(btn4h.className).toContain('bg-accent');
        const btn1d = screen.getByText('1D');
        expect(btn1d.className).not.toContain('bg-accent');
    });
});
