/**
 * PnLChart — payoff diagram for an option at expiry.
 *
 * Renders a line chart with green area above zero (profit) and
 * red area below zero (loss). Vertical marker at current spot.
 *
 * Uses lightweight-charts LineSeries with area fill (same library as PriceChart).
 */
import { useRef, useEffect, useMemo } from 'react';
import {
    createChart,
    AreaSeries,
    type IChartApi,
    type ISeriesApi,
    type AreaData,
    type Time,
    ColorType,
} from 'lightweight-charts';
import type { OptionData } from '../services/types.js';
import { calcPayoffCurve } from '../utils/optionMath.js';

interface PnLChartProps {
    option: OptionData;
    /** Current MOTO/PILL spot price (float) */
    motoPillRatio: number;
    /** Buy fee in basis points */
    buyFeeBps: bigint;
    /** Chart height in pixels */
    height?: number;
}

export function PnLChart({
    option,
    motoPillRatio,
    buyFeeBps,
    height = 200,
}: PnLChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const profitSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
    const lossSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);

    const curve = useMemo(
        () => calcPayoffCurve(option, motoPillRatio, buyFeeBps),
        [option, motoPillRatio, buyFeeBps],
    );

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
                fontSize: 10,
            },
            grid: {
                vertLines: { color: '#1a1a1a' },
                horzLines: { color: '#1a1a1a' },
            },
            rightPriceScale: {
                borderColor: '#1a1a1a',
            },
            timeScale: {
                borderColor: '#1a1a1a',
                visible: false,
            },
            crosshair: {
                vertLine: { color: '#F7931A44', width: 1, labelBackgroundColor: '#F7931A' },
                horzLine: { color: '#F7931A44', width: 1, labelBackgroundColor: '#F7931A' },
            },
        });

        // Profit area (green above zero)
        const profitSeries = chart.addSeries(AreaSeries, {
            lineColor: '#4ade80',
            lineWidth: 2,
            topColor: '#4ade8040',
            bottomColor: 'transparent',
            lastValueVisible: false,
            priceLineVisible: false,
        });

        // Loss area (red below zero)
        const lossSeries = chart.addSeries(AreaSeries, {
            lineColor: '#fb7185',
            lineWidth: 2,
            topColor: 'transparent',
            bottomColor: '#fb718540',
            lastValueVisible: false,
            priceLineVisible: false,
        });

        chartRef.current = chart;
        profitSeriesRef.current = profitSeries;
        lossSeriesRef.current = lossSeries;

        // ResizeObserver
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) chart.applyOptions({ width: entry.contentRect.width });
        });
        observer.observe(containerRef.current);

        return () => {
            observer.disconnect();
            chart.remove();
            chartRef.current = null;
            profitSeriesRef.current = null;
            lossSeriesRef.current = null;
        };
    }, [height]);

    // Update data when curve changes
    useEffect(() => {
        if (!profitSeriesRef.current || !lossSeriesRef.current || curve.length === 0) return;

        // Use index-based time (lightweight-charts needs unique ascending times)
        const profitData: AreaData<Time>[] = curve.map((p, i) => ({
            time: (i + 1) as unknown as Time,
            value: Math.max(p.pnl, 0),
        }));

        const lossData: AreaData<Time>[] = curve.map((p, i) => ({
            time: (i + 1) as unknown as Time,
            value: Math.min(p.pnl, 0),
        }));

        profitSeriesRef.current.setData(profitData);
        lossSeriesRef.current.setData(lossData);

        if (chartRef.current) {
            chartRef.current.timeScale().fitContent();
        }
    }, [curve]);

    // Compute breakeven and max loss for labels
    const breakeven = curve.find((_, i, arr) =>
        i > 0 && arr[i - 1]!.pnl < 0 && arr[i]!.pnl >= 0,
    );
    const maxLoss = Math.min(...curve.map(p => p.pnl));
    const maxProfit = Math.max(...curve.map(p => p.pnl));

    return (
        <div data-testid="pnl-chart">
            {/* Labels */}
            <div className="flex justify-between text-[10px] font-mono text-terminal-text-muted px-1 mb-1">
                <span>
                    Max loss: <span className="text-rose-400">{maxLoss.toFixed(2)}</span>
                </span>
                {breakeven && (
                    <span>
                        BE: <span className="text-cyan-300">{breakeven.price.toFixed(2)}</span>
                    </span>
                )}
                <span>
                    Spot: <span className="text-terminal-text-secondary">{motoPillRatio.toFixed(2)}</span>
                </span>
                {maxProfit > 0 && (
                    <span>
                        Max at 2.5x: <span className="text-green-400">+{maxProfit.toFixed(2)}</span>
                    </span>
                )}
            </div>
            {/* Chart */}
            <div ref={containerRef} className="rounded border border-terminal-border-subtle overflow-hidden" />
        </div>
    );
}
