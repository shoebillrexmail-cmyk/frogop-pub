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

/** Config ranges per strategy type */
const MONEYNESS_RANGES: Record<StrategyType, {
    min: number; max: number; default: number; step: number; label: string;
    leg2?: { min: number; max: number; default: number; step: number; label: string };
}> = {
    'covered-call': { min: 1.05, max: 1.50, default: 1.20, step: 0.01, label: 'Strike (% of spot)' },
    'write-put': { min: 0.70, max: 0.95, default: 0.875, step: 0.01, label: 'Strike (% of spot)' },
    'protective-put': { min: 0.70, max: 0.95, default: 0.875, step: 0.01, label: 'Protection level (% of spot)' },
    'collar': {
        min: 1.05, max: 1.50, default: 1.20, step: 0.01, label: 'CALL strike (% of spot)',
        leg2: { min: 0.70, max: 0.95, default: 0.80, step: 0.01, label: 'PUT strike (% of spot)' },
    },
    'bull-call-spread': {
        min: 1.10, max: 1.50, default: 1.20, step: 0.01, label: 'Sell CALL (% of spot)',
        leg2: { min: 0.95, max: 1.10, default: 1.00, step: 0.01, label: 'Buy CALL (% of spot)' },
    },
    'bear-put-spread': {
        min: 0.70, max: 0.90, default: 0.80, step: 0.01, label: 'Sell PUT (% of spot)',
        leg2: { min: 0.90, max: 1.10, default: 1.00, step: 0.01, label: 'Buy PUT (% of spot)' },
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

            {/* Moneyness slider 1 */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <label className="text-[10px] text-terminal-text-muted font-mono">{ranges.label}</label>
                    <span className="text-xs font-mono text-terminal-text-primary">
                        {(moneyness * 100).toFixed(0)}% = {(spotPrice * moneyness).toFixed(2)} {pUnit}
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
            </div>

            {/* Moneyness slider 2 (collar, spreads) */}
            {ranges.leg2 && (
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] text-terminal-text-muted font-mono">{ranges.leg2.label}</label>
                        <span className="text-xs font-mono text-terminal-text-primary">
                            {(moneyness2 * 100).toFixed(0)}% = {(spotPrice * moneyness2).toFixed(2)} {pUnit}
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
