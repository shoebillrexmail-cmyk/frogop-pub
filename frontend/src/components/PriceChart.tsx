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
const TOKENS = [
    { value: 'MOTO', label: 'MOTO' },
    { value: 'PILL', label: 'PILL' },
    { value: 'MOTO_PILL', label: 'MOTO/PILL' },
] as const;

interface PriceChartProps {
    candles: CandleData[];
    token: string;
    interval: string;
    onIntervalChange: (interval: string) => void;
    onTokenChange: (token: string) => void;
    height?: number;
}

export function PriceChart({
    candles,
    token,
    interval,
    onIntervalChange,
    onTokenChange,
    height = 400,
}: PriceChartProps) {
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
    }, [height]);

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

            {/* Chart title */}
            <div className="px-4 pt-2 text-xs text-terminal-text-muted font-mono">
                {selectedToken?.label ?? token} Price
            </div>

            {/* Chart container */}
            <div ref={containerRef} />
        </div>
    );
}
