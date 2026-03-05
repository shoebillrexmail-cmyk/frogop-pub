/**
 * PriceChart — TradingView lightweight-charts wrapper for OHLCV candles.
 *
 * Renders a candlestick chart with volume histogram below.
 * Dark theme matching terminal-bg design tokens.
 */
import { useRef, useEffect } from 'react';
import {
    createChart,
    CandlestickSeries,
    HistogramSeries,
    type IChartApi,
    type ISeriesApi,
    type CandlestickData,
    type HistogramData,
    type Time,
    ColorType,
} from 'lightweight-charts';
import type { CandleData } from '../services/priceService.ts';

const INTERVALS = ['1h', '4h', '1d', '1w'] as const;
const DEFAULT_TOKENS = [
    { value: 'MOTO', label: 'MOTO' },
    { value: 'PILL', label: 'PILL' },
    { value: 'MOTO_PILL', label: 'MOTO/PILL' },
] as const;

/** Y-axis denomination info per token. */
const DEFAULT_TOKEN_META: Record<string, { unit: string; title: string }> = {
    MOTO: { unit: 'sats', title: 'MOTO (sats/MOTO)' },
    PILL: { unit: 'sats', title: 'PILL (sats/PILL)' },
    MOTO_PILL: { unit: 'PILL', title: 'MOTO/PILL ratio' },
};

/** Build token options + metadata from symbol pair.
 *  BTC is not a standalone token on NativeSwap — it only exists as part of
 *  cross-rate pairs (MOTO_BTC, PILL_BTC). For BTC pools we show the base
 *  token, the cross-rate, and the inverse cross-rate instead. */
function buildTokenOptions(uSym: string, pSym: string) {
    const pairKey = `${uSym}_${pSym}`;
    const inversePairKey = `${pSym}_${uSym}`;

    if (pSym === 'BTC') {
        // BTC pools: show underlying token + both cross-rate directions
        const tokens = [
            { value: uSym, label: uSym },
            { value: pairKey, label: `${uSym}/BTC` },
            { value: inversePairKey, label: `BTC/${uSym}` },
        ];
        const meta: Record<string, { unit: string; title: string }> = {
            [uSym]: { unit: 'sats', title: `${uSym} (tokens per 100k sats)` },
            [pairKey]: { unit: 'sats', title: `${uSym}/BTC (sats per ${uSym})` },
            [inversePairKey]: { unit: uSym, title: `BTC/${uSym} (${uSym} per sat)` },
        };
        return { tokens, meta };
    }

    const tokens = [
        { value: uSym, label: uSym },
        { value: pSym, label: pSym },
        { value: pairKey, label: `${uSym}/${pSym}` },
    ];
    const meta: Record<string, { unit: string; title: string }> = {
        [uSym]: { unit: 'sats', title: `${uSym} (sats/${uSym})` },
        [pSym]: { unit: 'sats', title: `${pSym} (sats/${pSym})` },
        [pairKey]: { unit: pSym, title: `${uSym}/${pSym} ratio` },
    };
    return { tokens, meta };
}

function formatPrice(value: number, token: string, pairKey: string): string {
    if (token === pairKey) {
        // Ratio — show up to 4 decimals, strip trailing zeros
        return value.toFixed(4).replace(/\.?0+$/, '');
    }
    // sats/token — integer for large values, up to 2 decimals for small
    if (value >= 100) return Math.round(value).toLocaleString('en-US');
    if (value >= 1) return value.toFixed(1);
    return value.toFixed(4).replace(/0+$/, '');
}

interface PriceChartProps {
    candles: CandleData[];
    token: string;
    interval: string;
    onIntervalChange: (interval: string) => void;
    onTokenChange: (token: string) => void;
    height?: number;
    underlyingSymbol?: string;
    premiumSymbol?: string;
}

export function PriceChart({
    candles,
    token,
    interval,
    onIntervalChange,
    onTokenChange,
    height = 400,
    underlyingSymbol = 'MOTO',
    premiumSymbol = 'PILL',
}: PriceChartProps) {
    const { tokens: TOKENS, meta: TOKEN_META } =
        underlyingSymbol === 'MOTO' && premiumSymbol === 'PILL'
            ? { tokens: DEFAULT_TOKENS as unknown as { value: string; label: string }[], meta: DEFAULT_TOKEN_META }
            : buildTokenOptions(underlyingSymbol, premiumSymbol);
    const pairKey = `${underlyingSymbol}_${premiumSymbol}`;

    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

    // Create chart on mount
    useEffect(() => {
        if (!containerRef.current) return;

        const chart = createChart(containerRef.current, {
            width: containerRef.current.clientWidth,
            height,
            layout: {
                background: { type: ColorType.Solid, color: '#0a0a0a' },
                textColor: '#888',
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 11,
            },
            grid: {
                vertLines: { color: '#1a1a1a' },
                horzLines: { color: '#1a1a1a' },
            },
            crosshair: {
                vertLine: { color: '#F7931A44', width: 1, labelBackgroundColor: '#F7931A' },
                horzLine: { color: '#F7931A44', width: 1, labelBackgroundColor: '#F7931A' },
            },
            rightPriceScale: {
                borderColor: '#1a1a1a',
            },
            timeScale: {
                borderColor: '#1a1a1a',
                timeVisible: true,
                secondsVisible: false,
            },
        });

        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#4ade80',
            downColor: '#fb7185',
            borderUpColor: '#4ade80',
            borderDownColor: '#fb7185',
            wickUpColor: '#4ade80',
            wickDownColor: '#fb7185',
            priceFormat: {
                type: 'custom',
                formatter: (price: number) => formatPrice(price, token, pairKey),
            },
        });

        const volumeSeries = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
        });

        chart.priceScale('volume').applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });

        chartRef.current = chart;
        candleSeriesRef.current = candleSeries;
        volumeSeriesRef.current = volumeSeries;

        // ResizeObserver for responsive width
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                chart.applyOptions({ width: entry.contentRect.width });
            }
        });
        observer.observe(containerRef.current);

        return () => {
            observer.disconnect();
            chart.remove();
            chartRef.current = null;
            candleSeriesRef.current = null;
            volumeSeriesRef.current = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- token handled by separate effect below
    }, [height]);

    // Update price formatter when token changes
    useEffect(() => {
        if (!candleSeriesRef.current) return;
        candleSeriesRef.current.applyOptions({
            priceFormat: {
                type: 'custom',
                formatter: (price: number) => formatPrice(price, token, pairKey),
            },
        });
    }, [token, pairKey]);

    // Update data when candles change
    useEffect(() => {
        if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

        const candleSeriesData: CandlestickData<Time>[] = candles.map((c) => ({
            time: c.time as Time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
        }));

        const volumeData: HistogramData<Time>[] = candles.map((c) => ({
            time: c.time as Time,
            value: c.volume,
            color: c.close >= c.open ? '#4ade8040' : '#fb718540',
        }));

        candleSeriesRef.current.setData(candleSeriesData);
        volumeSeriesRef.current.setData(volumeData);

        if (chartRef.current && candles.length > 0) {
            chartRef.current.timeScale().fitContent();
        }
    }, [candles]);

    const selectedToken = TOKENS.find((t) => t.value === token);

    return (
        <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl overflow-hidden">
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border-subtle">
                {/* Token selector */}
                <div className="flex items-center gap-1">
                    {TOKENS.map((t) => (
                        <button
                            key={t.value}
                            onClick={() => onTokenChange(t.value)}
                            className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                                token === t.value
                                    ? 'bg-accent text-terminal-bg-primary'
                                    : 'bg-terminal-bg-primary text-terminal-text-secondary hover:bg-terminal-bg-secondary'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Interval selector */}
                <div className="flex items-center gap-1">
                    {INTERVALS.map((i) => (
                        <button
                            key={i}
                            onClick={() => onIntervalChange(i)}
                            className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                                interval === i
                                    ? 'bg-accent text-terminal-bg-primary'
                                    : 'bg-terminal-bg-primary text-terminal-text-secondary hover:bg-terminal-bg-secondary'
                            }`}
                        >
                            {i.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            {/* Chart title + Y-axis unit */}
            <div className="flex items-center justify-between px-4 pt-2">
                <span className="text-xs text-terminal-text-muted font-mono">
                    {TOKEN_META[token]?.title ?? `${selectedToken?.label ?? token} Price`}
                </span>
                <span className="text-[10px] text-terminal-text-muted/60 font-mono">
                    vol: sats
                </span>
            </div>

            {/* Chart container */}
            <div ref={containerRef} />

            {/* Empty state overlay */}
            {candles.length === 0 && (
                <div className="flex items-center justify-center py-16">
                    <p className="text-terminal-text-muted text-xs font-mono">
                        No price data available yet
                    </p>
                </div>
            )}
        </div>
    );
}
