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
};

/** Config ranges per strategy type */
const MONEYNESS_RANGES: Record<StrategyType, {
    min: number; max: number; default: number; step: number; label: string;
    leg2?: { min: number; max: number; default: number; step: number; label: string };
}> = {
    'covered-call': { min: 0.90, max: 1.50, default: 1.20, step: 0.01, label: 'Sell if price rises above' },
    'write-put': { min: 0.50, max: 1.00, default: 0.875, step: 0.01, label: 'Buy if price drops below' },
    'protective-put': { min: 0.50, max: 1.00, default: 0.875, step: 0.01, label: 'Protect below this price' },
    'collar': {
        min: 1.05, max: 1.50, default: 1.20, step: 0.01, label: 'Sell above (upside cap)',
        leg2: { min: 0.70, max: 0.95, default: 0.80, step: 0.01, label: 'Buy below (downside floor)' },
    },
    'bull-call-spread': {
        min: 1.10, max: 1.50, default: 1.20, step: 0.01, label: 'Upper target price',
        leg2: { min: 0.95, max: 1.10, default: 1.00, step: 0.01, label: 'Lower entry price' },
    },
    'bear-put-spread': {
        min: 0.70, max: 0.90, default: 0.80, step: 0.01, label: 'Lower target price',
        leg2: { min: 0.90, max: 1.10, default: 1.00, step: 0.01, label: 'Upper entry price' },
    },
};

interface StrategyConfiguratorProps {
    strategyType: StrategyType;
    spotPrice: number;
    underlyingSymbol: string;
    premiumSymbol: string;
    onExecute: (outcome: StrategyOutcome) => void;
    onClose: () => void;
}

export function StrategyConfigurator({
    strategyType,
    spotPrice,
    underlyingSymbol,
    premiumSymbol,
    onExecute,
    onClose,
}: StrategyConfiguratorProps) {
    const ranges = MONEYNESS_RANGES[strategyType];
    const pUnit = premiumDisplayUnit(premiumSymbol);

    const [moneyness, setMoneyness] = useState(ranges.default);
    const [moneyness2, setMoneyness2] = useState(ranges.leg2?.default ?? 1.0);
    const [days, setDays] = useState(30);
    const [amountStr, setAmountStr] = useState('1');

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

            {/* Price slider 1 */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <label className="text-[10px] text-terminal-text-muted font-mono">{ranges.label}</label>
                    <span className="text-xs font-mono text-terminal-text-primary">
                        {(spotPrice * moneyness).toFixed(2)} {pUnit}
                        <span className="text-terminal-text-muted ml-1">({(moneyness * 100).toFixed(0)}% of spot)</span>
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
                {strategyType === 'covered-call' && moneyness < 1.0 && (
                    <p className="text-[10px] text-amber-400 font-mono mt-0.5">
                        Below spot — higher premium but your tokens will likely be exercised. Essentially selling at a discount.
                    </p>
                )}
                {strategyType === 'covered-call' && moneyness >= 1.0 && moneyness < 1.05 && (
                    <p className="text-[10px] text-cyan-400 font-mono mt-0.5">
                        Near spot — good premium, but tokens may be taken if price rises even slightly.
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
                            <span className="text-terminal-text-muted ml-1">({(moneyness2 * 100).toFixed(0)}% of spot)</span>
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
                    {outcome.metrics.map((m) => (
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
                    ))}
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
