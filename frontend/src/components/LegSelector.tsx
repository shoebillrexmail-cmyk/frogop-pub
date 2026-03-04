/**
 * LegSelector — select an existing option to buy or configure a new option to write.
 *
 * Used in the Strategies page to build multi-leg strategies.
 */
import { useState } from 'react';
import type { OptionData } from '../services/types.ts';
import { OptionType } from '../services/types.ts';
import { formatTokenAmount } from '../config/index.ts';

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
    underlyingSymbol?: string;
    premiumSymbol?: string;
    disabled?: boolean;
}

export function LegSelector({
    legNumber,
    label,
    availableOptions,
    value,
    onChange,
    underlyingSymbol = 'MOTO',
    premiumSymbol = 'PILL',
    disabled = false,
}: LegSelectorProps) {
    const [expanded, setExpanded] = useState(true);

    const openOptions = availableOptions.filter((o) => o.status === 0); // OPEN

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
                    {/* Action toggle */}
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
                                                {formatTokenAmount(opt.strikePrice)} {premiumSymbol}
                                            </span>
                                            <span className="text-terminal-text-muted">
                                                {formatTokenAmount(opt.premium)} {premiumSymbol}
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
                            {/* Type */}
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
                            {/* Strike */}
                            <div className="flex items-center gap-2">
                                <label className="text-[10px] text-terminal-text-muted font-mono w-12">Strike</label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={value.strikeStr ?? ''}
                                    onChange={(e) => onChange({ ...value, strikeStr: e.target.value })}
                                    disabled={disabled}
                                    className="flex-1 bg-transparent border border-terminal-border-subtle rounded px-2 py-1 text-xs font-mono text-terminal-text-primary outline-none disabled:opacity-50"
                                    placeholder={`e.g. 50 ${premiumSymbol}`}
                                />
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
                            {/* Premium */}
                            <div className="flex items-center gap-2">
                                <label className="text-[10px] text-terminal-text-muted font-mono w-12">Premium</label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={value.premiumStr ?? ''}
                                    onChange={(e) => onChange({ ...value, premiumStr: e.target.value })}
                                    disabled={disabled}
                                    className="flex-1 bg-transparent border border-terminal-border-subtle rounded px-2 py-1 text-xs font-mono text-terminal-text-primary outline-none disabled:opacity-50"
                                    placeholder={`e.g. 5 ${premiumSymbol}`}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
