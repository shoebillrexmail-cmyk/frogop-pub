/**
 * CombinedPnLChart — aggregate P&L across multiple legs at expiry.
 *
 * X-axis: underlying price at expiry
 * Y-axis: combined profit/loss across all legs
 */
import { useMemo } from 'react';
import { OptionType } from '../services/types.ts';
import type { LegConfig } from './LegSelector.tsx';
import type { OptionData } from '../services/types.ts';

interface CombinedPnLChartProps {
    legs: LegConfig[];
    /** Available options (for looking up bought options' details) */
    options: OptionData[];
    /** Current spot price (underlying/premium ratio) */
    spotPrice: number;
    /** Number of price points to compute */
    points?: number;
    height?: number;
    premiumSymbol?: string;
}

interface PnLPoint {
    price: number;
    pnl: number;
}

function parseLegStrike(leg: LegConfig, options: OptionData[]): number | null {
    if (leg.action === 'buy' && leg.optionId != null) {
        const opt = options.find((o) => o.id === leg.optionId);
        return opt ? Number(opt.strikePrice) / 1e18 : null;
    }
    if (leg.action === 'write' && leg.strikeStr) {
        return Number(leg.strikeStr) || null;
    }
    return null;
}

function parseLegPremium(leg: LegConfig, options: OptionData[]): number | null {
    if (leg.action === 'buy' && leg.optionId != null) {
        const opt = options.find((o) => o.id === leg.optionId);
        return opt ? Number(opt.premium) / 1e18 : null;
    }
    if (leg.action === 'write' && leg.premiumStr) {
        return Number(leg.premiumStr) || null;
    }
    return null;
}

function parseLegType(leg: LegConfig, options: OptionData[]): number | null {
    if (leg.action === 'buy' && leg.optionId != null) {
        const opt = options.find((o) => o.id === leg.optionId);
        return opt ? opt.optionType : null;
    }
    return leg.optionType ?? null;
}

/** Calculate single-leg P&L at a given underlying price at expiry */
function legPnlAt(
    price: number,
    strike: number,
    premium: number,
    optType: number,
    action: 'buy' | 'write',
): number {
    let intrinsic: number;
    if (optType === OptionType.CALL) {
        intrinsic = Math.max(0, price - strike);
    } else {
        intrinsic = Math.max(0, strike - price);
    }

    if (action === 'buy') {
        return intrinsic - premium;
    } else {
        return premium - intrinsic;
    }
}

export function CombinedPnLChart({
    legs,
    options,
    spotPrice,
    points = 50,
    height = 200,
    premiumSymbol = 'PILL',
}: CombinedPnLChartProps) {
    const pnlData = useMemo((): PnLPoint[] => {
        const parsedLegs = legs
            .map((leg) => ({
                strike: parseLegStrike(leg, options),
                premium: parseLegPremium(leg, options),
                optType: parseLegType(leg, options),
                action: leg.action,
            }))
            .filter((l) => l.strike !== null && l.premium !== null && l.optType !== null) as {
                strike: number;
                premium: number;
                optType: number;
                action: 'buy' | 'write';
            }[];

        if (parsedLegs.length === 0) return [];

        const minPrice = spotPrice * 0.3;
        const maxPrice = spotPrice * 2.0;
        const step = (maxPrice - minPrice) / points;

        const data: PnLPoint[] = [];
        for (let i = 0; i <= points; i++) {
            const price = minPrice + step * i;
            let totalPnl = 0;
            for (const leg of parsedLegs) {
                totalPnl += legPnlAt(price, leg.strike, leg.premium, leg.optType, leg.action);
            }
            data.push({ price, pnl: totalPnl });
        }
        return data;
    }, [legs, options, spotPrice, points]);

    if (pnlData.length === 0) {
        return (
            <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-4 text-xs font-mono text-terminal-text-muted text-center">
                Configure both legs to see combined P&L
            </div>
        );
    }

    const maxPnl = Math.max(...pnlData.map((d) => d.pnl));
    const minPnl = Math.min(...pnlData.map((d) => d.pnl));
    const range = maxPnl - minPnl || 1;
    const padding = 20;
    const chartWidth = 400;
    const chartHeight = height - padding * 2;

    // Zero line Y position
    const zeroY = padding + ((maxPnl - 0) / range) * chartHeight;

    // Build SVG path
    const pathPoints = pnlData.map((d, i) => {
        const x = padding + (i / pnlData.length) * (chartWidth - padding * 2);
        const y = padding + ((maxPnl - d.pnl) / range) * chartHeight;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');

    return (
        <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3" data-testid="combined-pnl-chart">
            <p className="text-[10px] font-mono text-terminal-text-muted mb-2">Combined P&L at Expiry ({premiumSymbol})</p>
            <svg
                viewBox={`0 0 ${chartWidth} ${height}`}
                className="w-full"
                style={{ maxHeight: height }}
            >
                {/* Zero line */}
                <line
                    x1={padding}
                    x2={chartWidth - padding}
                    y1={zeroY}
                    y2={zeroY}
                    stroke="rgba(255,255,255,0.15)"
                    strokeDasharray="4,4"
                />
                {/* P&L line */}
                <path
                    d={pathPoints}
                    fill="none"
                    stroke="rgb(0, 200, 150)"
                    strokeWidth="2"
                />
                {/* Spot price vertical line */}
                {(() => {
                    const spotIdx = pnlData.findIndex((d) => d.price >= spotPrice);
                    if (spotIdx < 0) return null;
                    const x = padding + (spotIdx / pnlData.length) * (chartWidth - padding * 2);
                    return (
                        <line
                            x1={x}
                            x2={x}
                            y1={padding}
                            y2={height - padding}
                            stroke="rgba(0, 200, 255, 0.4)"
                            strokeDasharray="2,3"
                        />
                    );
                })()}
                {/* Labels */}
                <text x={padding} y={height - 4} fontSize="9" fill="rgba(255,255,255,0.4)" fontFamily="monospace">
                    {(pnlData[0]?.price ?? 0).toFixed(1)}
                </text>
                <text x={chartWidth - padding - 30} y={height - 4} fontSize="9" fill="rgba(255,255,255,0.4)" fontFamily="monospace">
                    {(pnlData[pnlData.length - 1]?.price ?? 0).toFixed(1)}
                </text>
                <text x={2} y={padding + 8} fontSize="9" fill="rgba(0,255,100,0.6)" fontFamily="monospace">
                    +{maxPnl.toFixed(2)}
                </text>
                <text x={2} y={height - padding - 2} fontSize="9" fill="rgba(255,100,100,0.6)" fontFamily="monospace">
                    {minPnl.toFixed(2)}
                </text>
            </svg>
        </div>
    );
}
