/**
 * LegSelector — select an existing option to buy or configure a new option to write.
 *
 * Used in the Strategies page to build multi-leg strategies.
 * Shows moneyness badge and Black-Scholes suggested premium when spot price is available.
 */
import { useState, useMemo } from 'react';
import type { OptionData } from '../services/types.ts';
import { OptionType } from '../services/types.ts';
import { formatTokenAmount, premiumDisplayUnit } from '../config/index.ts';
import { classifyMoneyness } from '../utils/optionsChain.ts';
import { useSuggestedPremium } from '../hooks/useSuggestedPremium.ts';
import { BLOCK_CONSTANTS } from '../config/index.ts';

export interface LegConfig {
    /** 'buy' an existing option or 'write' a new one */
    action: 'buy' | 'write';
    /** If buying: the selected option */
    optionId?: bigint;
    /** If writing: new option params */
    optionType?: number;
    strikeStr?: string;
    amountStr?: string;
    premiumStr?: string;
    selectedDays?: number;
}

interface LegSelectorProps {
    legNumber: 1 | 2;
    label: string;
    /** Available options to buy from the pool */
    availableOptions: OptionData[];
    /** Current leg config */
    value: LegConfig;
    onChange: (config: LegConfig) => void;
    /** Current spot price (underlying/premium ratio), or null */
    spotPrice?: number | null;
    underlyingSymbol?: string;
    premiumSymbol?: string;
    disabled?: boolean;
    /** When set, lock the action (buy/write) — hide the toggle. */
    lockedAction?: 'buy' | 'write';
    /** When set, lock the option type (CALL/PUT) — hide the toggle. */
    lockedOptionType?: number;
}

export function LegSelector({
    legNumber,
    label,
    availableOptions,
    value,
    onChange,
    spotPrice = null,
    underlyingSymbol = 'MOTO',
    premiumSymbol = 'PILL',
    disabled = false,
    lockedAction,
    lockedOptionType,
}: LegSelectorProps) {
    const [expanded, setExpanded] = useState(true);

    const openOptions = availableOptions.filter((o) => o.status === 0); // OPEN

    // Moneyness classification (write mode only)
    const moneynessResult = useMemo(() => {
        if (!spotPrice || value.action !== 'write' || !value.strikeStr || value.optionType === undefined) return null;
        const strikeNum = Number(value.strikeStr);
        return classifyMoneyness(value.optionType, strikeNum, spotPrice);
    }, [spotPrice, value.action, value.strikeStr, value.optionType]);

    // Black-Scholes suggested premium (write mode only)
    const expiryBlocks = (value.selectedDays ?? 7) * BLOCK_CONSTANTS.BLOCKS_PER_DAY;
    const { suggestedPremium } = useSuggestedPremium(
        value.optionType ?? OptionType.CALL,
        value.strikeStr ?? '',
        value.amountStr ?? '',
        expiryBlocks,
        spotPrice ?? null,
    );

    return (
        <div
            className="bg-terminal-bg-primary border border-terminal-border-subtle rounded-lg p-4 space-y-3"
            data-testid={`leg-${legNumber}`}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-accent">Leg {legNumber}</span>
                    <span className="text-xs font-mono text-terminal-text-muted">{label}</span>
                </div>
                <button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    className="text-xs text-terminal-text-muted hover:text-terminal-text-primary font-mono"
                >
                    {expanded ? '[-]' : '[+]'}
                </button>
            </div>

            {expanded && (
                <div className="space-y-3">
                    {/* Action toggle — hidden when locked by strategy */}
                    {lockedAction ? (
                        <div className="text-[10px] font-mono text-terminal-text-muted">
                            {lockedAction === 'buy' ? 'Buy an existing listing' : 'Write a new listing'}
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            {(['buy', 'write'] as const).map((action) => (
                                <button
                                    key={action}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => onChange({ ...value, action })}
                                    className={`flex-1 py-1.5 text-xs font-mono rounded border transition-colors ${
                                        value.action === action
                                            ? 'bg-accent/20 border-accent text-accent'
                                            : 'border-terminal-border-subtle text-terminal-text-muted hover:text-terminal-text-primary'
                                    } disabled:opacity-50`}
                                >
                                    {action === 'buy' ? 'Buy Existing' : 'Write New'}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Buy: select from available options */}
                    {value.action === 'buy' && (
                        <div className="space-y-2">
                            {openOptions.length === 0 ? (
                                <p className="text-xs text-terminal-text-muted font-mono">No open options available</p>
                            ) : (
                                <div className="max-h-40 overflow-y-auto space-y-1">
                                    {openOptions.map((opt) => (
                                        <button
                                            key={opt.id.toString()}
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => onChange({ ...value, optionId: opt.id })}
                                            className={`w-full flex items-center justify-between text-xs font-mono px-2 py-1.5 rounded border transition-colors ${
                                                value.optionId === opt.id
                                                    ? 'bg-accent/20 border-accent'
                                                    : 'border-terminal-border-subtle hover:border-terminal-text-muted'
                                            } disabled:opacity-50`}
                                        >
                                            <span className={opt.optionType === OptionType.CALL ? 'text-green-400' : 'text-rose-400'}>
                                                {opt.optionType === OptionType.CALL ? 'CALL' : 'PUT'} #{opt.id.toString()}
                                            </span>
                                            <span className="text-terminal-text-muted">
                                                {formatTokenAmount(opt.strikePrice)} {premiumDisplayUnit(premiumSymbol)}
                                            </span>
                                            <span className="text-terminal-text-muted">
                                                {formatTokenAmount(opt.premium)} {premiumDisplayUnit(premiumSymbol)}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Write: configure new option params */}
                    {value.action === 'write' && (
                        <div className="space-y-2">
                            {/* Type — hidden when locked by strategy */}
                            {lockedOptionType !== undefined ? (
                                <div className="text-[10px] font-mono text-terminal-text-muted">
                                    {lockedOptionType === OptionType.CALL ? 'CALL' : 'PUT'}
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    {[OptionType.CALL, OptionType.PUT].map((t) => (
                                        <button
                                            key={t}
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => onChange({ ...value, optionType: t })}
                                            className={`flex-1 py-1.5 text-xs font-mono rounded border transition-colors ${
                                                value.optionType === t
                                                    ? t === OptionType.CALL
                                                        ? 'bg-green-900/30 border-green-500 text-green-300'
                                                        : 'bg-rose-900/30 border-rose-500 text-rose-300'
                                                    : 'border-terminal-border-subtle text-terminal-text-muted'
                                            } disabled:opacity-50`}
                                        >
                                            {t === OptionType.CALL ? 'CALL' : 'PUT'}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {/* Strike + spot + moneyness */}
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] text-terminal-text-muted font-mono w-12">Strike</label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={value.strikeStr ?? ''}
                                        onChange={(e) => onChange({ ...value, strikeStr: e.target.value })}
                                        disabled={disabled}
                                        className="flex-1 bg-transparent border border-terminal-border-subtle rounded px-2 py-1 text-xs font-mono text-terminal-text-primary outline-none disabled:opacity-50"
                                        placeholder={`e.g. 50 ${premiumDisplayUnit(premiumSymbol)}`}
                                    />
                                </div>
                                {/* Spot price + moneyness badge */}
                                {spotPrice != null && spotPrice > 0 && (
                                    <div className="flex items-center gap-2 ml-14" data-testid={`leg-${legNumber}-moneyness`}>
                                        <span className="text-[10px] text-terminal-text-muted font-mono">
                                            Spot: <span className="text-terminal-text-secondary">{spotPrice.toFixed(2)} {premiumDisplayUnit(premiumSymbol)}</span>
                                        </span>
                                        {moneynessResult && (
                                            <span
                                                className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${
                                                    moneynessResult.moneyness === 'ITM'
                                                        ? 'bg-green-900/40 text-green-400'
                                                        : moneynessResult.moneyness === 'ATM'
                                                            ? 'bg-cyan-900/40 text-cyan-400'
                                                            : 'bg-orange-900/40 text-orange-400'
                                                }`}
                                                data-testid={`leg-${legNumber}-moneyness-badge`}
                                            >
                                                {moneynessResult.label}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                            {/* Amount */}
                            <div className="flex items-center gap-2">
                                <label className="text-[10px] text-terminal-text-muted font-mono w-12">Amount</label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={value.amountStr ?? ''}
                                    onChange={(e) => onChange({ ...value, amountStr: e.target.value })}
                                    disabled={disabled}
                                    className="flex-1 bg-transparent border border-terminal-border-subtle rounded px-2 py-1 text-xs font-mono text-terminal-text-primary outline-none disabled:opacity-50"
                                    placeholder={`e.g. 1 ${underlyingSymbol}`}
                                />
                            </div>
                            {/* Premium + BS suggestion */}
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] text-terminal-text-muted font-mono w-12">Premium</label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={value.premiumStr ?? ''}
                                        onChange={(e) => onChange({ ...value, premiumStr: e.target.value })}
                                        disabled={disabled}
                                        className="flex-1 bg-transparent border border-terminal-border-subtle rounded px-2 py-1 text-xs font-mono text-terminal-text-primary outline-none disabled:opacity-50"
                                        placeholder={`e.g. 5 ${premiumDisplayUnit(premiumSymbol)}`}
                                    />
                                </div>
                                {/* BS suggested premium */}
                                {suggestedPremium !== null && suggestedPremium > 0n && (
                                    <div className="flex items-center gap-2 ml-14" data-testid={`leg-${legNumber}-bs-suggestion`}>
                                        <span className="text-[10px] text-terminal-text-muted font-mono">
                                            Fair value: <span className="text-cyan-400">{formatTokenAmount(suggestedPremium)} {premiumDisplayUnit(premiumSymbol)}</span>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => onChange({ ...value, premiumStr: formatTokenAmount(suggestedPremium) })}
                                            className="text-[10px] text-cyan-400 hover:text-cyan-300 font-mono underline cursor-pointer"
                                            data-testid={`leg-${legNumber}-use-bs`}
                                        >
                                            [Use]
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
