/**
 * StrategyConfigurator — expandable config panel below a selected OutcomeCard.
 *
 * Shows moneyness slider(s), expiry presets, amount input, and live
 * "What You'll Get" outcome preview computed via calcLiveOutcome().
 */
import { useState, useMemo, useCallback } from 'react';
import type { StrategyType, StrategyOutcome } from '../utils/strategyMath.ts';
import { calcLiveOutcome } from '../utils/strategyMath.ts';
import { premiumDisplayUnit } from '../config/index.ts';

const DAY_PRESETS = [
    { label: '7d', days: 7 },
    { label: '14d', days: 14 },
    { label: '30d', days: 30 },
    { label: '90d', days: 90 },
] as const;

/** How it works — plain-English explainer per strategy */
const STRATEGY_EXPLAINER: Record<StrategyType, string> = {
    'covered-call': 'You list your tokens on the marketplace at a sell price you choose. If another user buys your listing, you earn a fee immediately. Your tokens stay locked until expiry or until the buyer exercises.',
    'write-put': 'You list an offer to buy tokens at a price you choose. If another user takes your offer, you earn a fee immediately. Your collateral stays locked until expiry or until the other party exercises.',
    'protective-put': 'You buy an existing listing from another user that guarantees you can sell at a minimum price, even if the market crashes.',
    'collar': 'You list both a sell-above and buy-below price. If other users take either side, you earn fees from both.',
    'bull-call-spread': 'A two-leg position: you buy the right to profit from a rise, while capping your gain by selling a higher position.',
    'bear-put-spread': 'A two-leg position: you buy the right to profit from a drop, while capping your gain by selling a lower position.',
    'long-call': 'You buy an existing CALL listing from another user. If the price rises above the strike, you can exercise for a profit. Your maximum loss is the premium you paid.',
    'long-put': 'You buy an existing PUT listing from another user. If the price drops below the strike, you can exercise for a profit. Your maximum loss is the premium you paid.',
    'long-straddle': 'You buy a CALL and a PUT at the same strike price. You profit from a large move in either direction. Your maximum loss is the combined premium paid.',
    'long-strangle': 'You buy an OTM CALL and an OTM PUT at different strikes. Cheaper than a straddle, but needs a bigger move to profit.',
};

/** Dynamic strike ranges that scale with expiry — crypto markets are volatile. */
function getMoneyRanges(strategyType: StrategyType, days: number): {
    min: number; max: number; default: number; step: number; label: string;
    leg2?: { min: number; max: number; default: number; step: number; label: string };
} {
    // Wider ranges for longer expiries
    const callMax = days <= 7 ? 1.50 : days <= 14 ? 2.00 : days <= 30 ? 3.00 : 4.00;
    const putMin = days <= 7 ? 0.70 : days <= 14 ? 0.50 : days <= 30 ? 0.30 : 0.20;

    switch (strategyType) {
        case 'covered-call':
            return {
                min: 1.00, max: callMax, default: 1.20, step: 0.01,
                label: 'Sell if price rises above',
            };
        case 'write-put':
            return {
                min: putMin, max: 1.00, default: 0.875, step: 0.01,
                label: 'Buy if price drops below',
            };
        case 'protective-put':
            return {
                min: putMin, max: 1.00, default: 0.875, step: 0.01,
                label: 'Protect below this price',
            };
        case 'collar':
            return {
                min: 1.05, max: callMax, default: 1.20, step: 0.01,
                label: 'Sell above (upside cap)',
                leg2: {
                    min: putMin, max: 0.95, default: 0.80, step: 0.01,
                    label: 'Buy below (downside floor)',
                },
            };
        case 'bull-call-spread':
            return {
                min: 1.10, max: callMax, default: 1.20, step: 0.01,
                label: 'Upper target price',
                leg2: { min: 0.90, max: 1.10, default: 1.00, step: 0.01, label: 'Lower entry price' },
            };
        case 'bear-put-spread':
            return {
                min: putMin, max: 0.90, default: 0.80, step: 0.01,
                label: 'Lower target price',
                leg2: { min: 0.90, max: 1.10, default: 1.00, step: 0.01, label: 'Upper entry price' },
            };
        case 'long-call':
            return {
                min: 1.00, max: callMax, default: 1.125, step: 0.01,
                label: 'Target strike (buy a CALL above)',
            };
        case 'long-put':
            return {
                min: putMin, max: 1.00, default: 0.875, step: 0.01,
                label: 'Target strike (buy a PUT below)',
            };
        case 'long-straddle':
            return {
                min: putMin, max: callMax, default: 1.00, step: 0.01,
                label: 'Target strike (ATM)',
            };
        case 'long-strangle':
            return {
                min: 1.05, max: callMax, default: 1.15, step: 0.01,
                label: 'Call strike (above spot)',
                leg2: {
                    min: putMin, max: 0.95, default: 0.85, step: 0.01,
                    label: 'Put strike (below spot)',
                },
            };
    }
}

interface StrategyConfiguratorProps {
    strategyType: StrategyType;
    spotPrice: number;
    underlyingSymbol: string;
    premiumSymbol: string;
    onExecute: (outcome: StrategyOutcome) => void;
    onClose: () => void;
}

/** Format moneyness as a relative label: "+5% above current", "-20% below current", "at current price". */
function formatMoneynessDelta(moneyness: number): string {
    const delta = Math.round((moneyness - 1) * 100);
    if (delta === 0) return 'at current price';
    if (delta > 0) return `+${delta}% above current`;
    return `${delta}% below current`;
}

export function StrategyConfigurator({
    strategyType,
    spotPrice,
    underlyingSymbol,
    premiumSymbol,
    onExecute,
    onClose,
}: StrategyConfiguratorProps) {
    const pUnit = premiumDisplayUnit(premiumSymbol);

    const [days, setDays] = useState(30);
    const ranges = useMemo(() => getMoneyRanges(strategyType, days), [strategyType, days]);

    const [rawMoneyness, setMoneyness] = useState(ranges.default);
    const [rawMoneyness2, setMoneyness2] = useState(ranges.leg2?.default ?? 1.0);
    const [amountStr, setAmountStr] = useState('1');

    // Clamp to current range (e.g. user picked +250% then switched to 7d expiry)
    const moneyness = Math.min(Math.max(rawMoneyness, ranges.min), ranges.max);
    const moneyness2 = ranges.leg2
        ? Math.min(Math.max(rawMoneyness2, ranges.leg2.min), ranges.leg2.max)
        : rawMoneyness2;

    const amount = useMemo(() => {
        const n = Number(amountStr);
        return isNaN(n) || n <= 0 ? 0 : n;
    }, [amountStr]);

    const outcome = useMemo(
        () => calcLiveOutcome(
            strategyType,
            spotPrice,
            moneyness,
            days,
            amount,
            pUnit,
            underlyingSymbol,
            ranges.leg2 ? moneyness2 : undefined,
        ),
        [strategyType, spotPrice, moneyness, moneyness2, days, amount, pUnit, underlyingSymbol, ranges.leg2],
    );

    const handleExecute = useCallback(() => {
        if (outcome) onExecute(outcome);
    }, [outcome, onExecute]);

    return (
        <div
            className="bg-terminal-bg-elevated border border-accent/30 rounded-xl p-4 space-y-4"
            data-testid="strategy-configurator"
        >
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-terminal-text-primary font-mono">
                    Configure
                </h4>
                <button
                    type="button"
                    onClick={onClose}
                    className="text-terminal-text-muted hover:text-terminal-text-primary text-lg leading-none"
                    aria-label="Close configurator"
                >
                    x
                </button>
            </div>

            {/* How it works */}
            <p className="text-[11px] text-terminal-text-muted font-mono leading-relaxed bg-terminal-bg-primary border border-terminal-border-subtle rounded px-3 py-2">
                {STRATEGY_EXPLAINER[strategyType]}
            </p>

            {/* Current price reference */}
            <div className="flex items-center justify-between">
                <span className="text-[10px] text-terminal-text-muted font-mono">Current price</span>
                <span className="text-xs font-mono text-terminal-text-primary">{spotPrice.toFixed(2)} {pUnit}</span>
            </div>

            {/* Price slider 1 */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <label className="text-[10px] text-terminal-text-muted font-mono">{ranges.label}</label>
                    <span className="text-xs font-mono text-terminal-text-primary">
                        {(spotPrice * moneyness).toFixed(2)} {pUnit}
                        <span className="text-terminal-text-muted ml-1">({formatMoneynessDelta(moneyness)})</span>
                    </span>
                </div>
                <input
                    type="range"
                    min={ranges.min}
                    max={ranges.max}
                    step={ranges.step}
                    value={moneyness}
                    onChange={(e) => setMoneyness(Number(e.target.value))}
                    className="w-full h-1 accent-accent cursor-pointer"
                    data-testid="moneyness-slider"
                />
                {/* Contextual hints based on moneyness */}
                {strategyType === 'covered-call' && moneyness <= 1.00 && (
                    <p className="text-[10px] text-amber-400 font-mono mt-0.5">
                        At current price — maximum premium but your tokens will almost certainly be taken.
                    </p>
                )}
                {strategyType === 'covered-call' && moneyness > 1.00 && moneyness < 1.05 && (
                    <p className="text-[10px] text-cyan-400 font-mono mt-0.5">
                        Near current price — good premium, but tokens may be taken if price rises even slightly.
                    </p>
                )}
                {strategyType === 'covered-call' && moneyness >= 1.05 && moneyness <= 1.30 && (
                    <p className="text-[10px] text-green-400 font-mono mt-0.5">
                        Typical range — balanced premium vs. chance of keeping your tokens.
                    </p>
                )}
                {strategyType === 'covered-call' && moneyness > 1.30 && (
                    <p className="text-[10px] text-terminal-text-muted font-mono mt-0.5">
                        Far above spot — low premium but very unlikely your tokens get taken.
                    </p>
                )}
                {strategyType === 'write-put' && moneyness > 0.95 && (
                    <p className="text-[10px] text-amber-400 font-mono mt-0.5">
                        Near spot — higher premium but you'll likely have to buy if price drops at all.
                    </p>
                )}
                {strategyType === 'write-put' && moneyness >= 0.80 && moneyness <= 0.95 && (
                    <p className="text-[10px] text-green-400 font-mono mt-0.5">
                        Typical range — decent premium with a buffer before you'd have to buy.
                    </p>
                )}
                {strategyType === 'write-put' && moneyness < 0.80 && (
                    <p className="text-[10px] text-terminal-text-muted font-mono mt-0.5">
                        Far below spot — low premium but very unlikely you'll have to buy.
                    </p>
                )}
            </div>

            {/* Price slider 2 (collar, spreads) */}
            {ranges.leg2 && (
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] text-terminal-text-muted font-mono">{ranges.leg2.label}</label>
                        <span className="text-xs font-mono text-terminal-text-primary">
                            {(spotPrice * moneyness2).toFixed(2)} {pUnit}
                            <span className="text-terminal-text-muted ml-1">({formatMoneynessDelta(moneyness2)})</span>
                        </span>
                    </div>
                    <input
                        type="range"
                        min={ranges.leg2.min}
                        max={ranges.leg2.max}
                        step={ranges.leg2.step}
                        value={moneyness2}
                        onChange={(e) => setMoneyness2(Number(e.target.value))}
                        className="w-full h-1 accent-accent cursor-pointer"
                        data-testid="moneyness-slider-2"
                    />
                </div>
            )}

            {/* Expiry */}
            <div className="space-y-1">
                <label className="text-[10px] text-terminal-text-muted font-mono">Expiry</label>
                <div className="flex flex-wrap gap-2">
                    {DAY_PRESETS.map(({ label, days: d }) => (
                        <button
                            key={d}
                            type="button"
                            onClick={() => setDays(d)}
                            className={`px-3 py-1 text-xs font-mono rounded border transition-colors ${
                                days === d
                                    ? 'bg-accent text-white border-accent'
                                    : 'border-terminal-border-subtle text-terminal-text-muted hover:text-terminal-text-primary'
                            }`}
                            data-testid={`config-expiry-${label}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Amount */}
            <div className="space-y-1">
                <label className="text-[10px] text-terminal-text-muted font-mono">Amount ({underlyingSymbol})</label>
                <input
                    type="text"
                    inputMode="decimal"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value.replace(',', '.'))}
                    className="w-full bg-transparent border border-terminal-border-subtle rounded px-3 py-1.5 text-xs font-mono text-terminal-text-primary outline-none"
                    placeholder="1"
                    data-testid="config-amount"
                />
            </div>

            {/* What You'll Get */}
            {outcome && (
                <div
                    className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3 space-y-1.5"
                    data-testid="outcome-preview"
                >
                    <span className="text-[10px] text-terminal-text-muted font-mono uppercase tracking-wider">
                        What You'll Get
                    </span>
                    {outcome.metrics.map((m, i) =>
                        m.label === '—' ? (
                            <hr key={i} className="border-terminal-border-subtle my-1" />
                        ) : m.value.length > 40 ? (
                            <div key={m.label} className="text-xs font-mono">
                                <span className="text-terminal-text-muted">{m.label}</span>
                                <p className={`mt-0.5 ml-2 ${
                                    m.color === 'green' ? 'text-green-400'
                                        : m.color === 'red' ? 'text-rose-400'
                                            : 'text-terminal-text-primary'
                                }`}>
                                    {m.value}
                                </p>
                            </div>
                        ) : (
                            <div key={m.label} className="flex justify-between text-xs font-mono">
                                <span className="text-terminal-text-muted">{m.label}</span>
                                <span className={
                                    m.color === 'green' ? 'text-green-400'
                                        : m.color === 'red' ? 'text-rose-400'
                                            : 'text-terminal-text-primary'
                                }>
                                    {m.value}
                                </span>
                            </div>
                        ),
                    )}
                </div>
            )}

            {/* Action button */}
            <button
                type="button"
                onClick={handleExecute}
                disabled={!outcome || amount <= 0}
                className="w-full btn-primary py-2.5 text-sm font-mono rounded disabled:opacity-50"
                data-testid="config-execute-btn"
            >
                {outcome?.actionLabel ?? 'Configure'}
            </button>
        </div>
    );
}
