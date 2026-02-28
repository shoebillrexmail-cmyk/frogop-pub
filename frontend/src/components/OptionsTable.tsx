/**
 * OptionsTable — displays all options in a pool with filter controls and row actions.
 */
import { useState } from 'react';
import { type OptionData, OptionStatus, OptionType } from '../services/types.ts';
import { formatTokenAmount } from '../config/index.ts';

type FilterStatus = 'ALL' | 'OPEN' | 'PURCHASED' | 'EXPIRED' | 'CANCELLED';

interface OptionsTableProps {
    options: OptionData[];
    /** Connected wallet hex address (0x...) or null if disconnected */
    walletHex: string | null;
    /** Current block number (for grace period calc) */
    currentBlock?: bigint;
    /** Grace period in blocks */
    gracePeriodBlocks?: bigint;
    /** Show the status filter bar (default: true) */
    showFilter?: boolean;
    onBuy?: (option: OptionData) => void;
    onCancel?: (option: OptionData) => void;
    onExercise?: (option: OptionData) => void;
    onSettle?: (option: OptionData) => void;
}

const STATUS_LABELS: Record<number, string> = {
    [OptionStatus.OPEN]: 'OPEN',
    [OptionStatus.PURCHASED]: 'PURCHASED',
    [OptionStatus.EXERCISED]: 'EXERCISED',
    [OptionStatus.EXPIRED]: 'EXPIRED',
    [OptionStatus.CANCELLED]: 'CANCELLED',
};

const STATUS_BADGE_CLASSES: Record<number, string> = {
    [OptionStatus.OPEN]: 'border border-green-500 text-green-400',
    [OptionStatus.PURCHASED]: 'border border-cyan-400 text-cyan-300',
    [OptionStatus.EXERCISED]: 'border border-orange-400 text-orange-300',
    [OptionStatus.EXPIRED]: 'border border-gray-600 text-gray-400',
    [OptionStatus.CANCELLED]: 'border border-rose-700 text-rose-500',
};

const FILTER_OPTIONS: FilterStatus[] = ['ALL', 'OPEN', 'PURCHASED', 'EXPIRED', 'CANCELLED'];

const ZERO_HEX = '0x' + '0'.repeat(64);

function StatusBadge({ status }: { status: number }) {
    return (
        <span
            className={`inline-block px-2 py-0.5 text-xs font-mono rounded ${STATUS_BADGE_CLASSES[status] ?? 'text-gray-400'}`}
        >
            {STATUS_LABELS[status] ?? status}
        </span>
    );
}

function TypeBadge({ optionType }: { optionType: number }) {
    const isCall = optionType === OptionType.CALL;
    return (
        <span className={`font-mono font-semibold text-sm ${isCall ? 'text-green-400' : 'text-rose-400'}`}>
            {isCall ? 'CALL' : 'PUT'}
        </span>
    );
}

function RowAction({
    option,
    walletHex,
    currentBlock,
    gracePeriodBlocks,
    onBuy,
    onCancel,
    onExercise,
    onSettle,
}: {
    option: OptionData;
    walletHex: string | null;
    currentBlock?: bigint;
    gracePeriodBlocks?: bigint;
    onBuy?: (o: OptionData) => void;
    onCancel?: (o: OptionData) => void;
    onExercise?: (o: OptionData) => void;
    onSettle?: (o: OptionData) => void;
}) {
    const isWriter = walletHex !== null && option.writer.toLowerCase() === walletHex.toLowerCase();
    const isBuyer =
        walletHex !== null &&
        option.buyer !== ZERO_HEX &&
        option.buyer.toLowerCase() === walletHex.toLowerCase();

    const graceEnds =
        option.expiryBlock + (gracePeriodBlocks ?? 144n);
    const graceActive = currentBlock !== undefined && currentBlock <= graceEnds;

    if (option.status === OptionStatus.OPEN) {
        if (isWriter) {
            return (
                <button
                    className="btn-secondary px-3 py-1 text-xs rounded"
                    onClick={() => onCancel?.(option)}
                    data-testid={`cancel-${option.id}`}
                >
                    Cancel
                </button>
            );
        }
        return (
            <button
                className="btn-primary px-3 py-1 text-xs rounded"
                onClick={() => onBuy?.(option)}
                data-testid={`buy-${option.id}`}
            >
                Buy
            </button>
        );
    }

    if (option.status === OptionStatus.PURCHASED) {
        if (isBuyer && graceActive) {
            return (
                <button
                    className="btn-primary px-3 py-1 text-xs rounded"
                    onClick={() => onExercise?.(option)}
                    data-testid={`exercise-${option.id}`}
                >
                    Exercise
                </button>
            );
        }
        if (!graceActive) {
            return (
                <button
                    className="btn-secondary px-3 py-1 text-xs rounded"
                    onClick={() => onSettle?.(option)}
                    data-testid={`settle-${option.id}`}
                >
                    Settle
                </button>
            );
        }
        return null;
    }

    if (option.status === OptionStatus.EXPIRED) {
        return (
            <button
                className="btn-secondary px-3 py-1 text-xs rounded"
                onClick={() => onSettle?.(option)}
                data-testid={`settle-${option.id}`}
            >
                Settle
            </button>
        );
    }

    return null;
}

export function OptionsTable({
    options,
    walletHex,
    currentBlock,
    gracePeriodBlocks,
    showFilter = true,
    onBuy,
    onCancel,
    onExercise,
    onSettle,
}: OptionsTableProps) {
    const [filter, setFilter] = useState<FilterStatus>('ALL');

    const filtered = showFilter
        ? options.filter((o) => {
              if (filter === 'ALL') return true;
              return STATUS_LABELS[o.status] === filter;
          })
        : options;

    return (
        <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-terminal-text-primary font-mono">Options</h3>
                {showFilter && (
                <div className="flex gap-1">
                    {FILTER_OPTIONS.map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                                filter === f
                                    ? 'bg-accent text-white'
                                    : 'text-terminal-text-muted hover:text-terminal-text-primary border border-terminal-border-subtle'
                            }`}
                            data-testid={`filter-${f.toLowerCase()}`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
                )}
            </div>

            <hr className="border-terminal-border-subtle mb-3" />

            {filtered.length === 0 ? (
                <p className="text-terminal-text-muted font-mono text-sm py-6 text-center">
                    No options found.
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm font-mono">
                        <thead>
                            <tr className="text-terminal-text-muted text-xs border-b border-terminal-border-subtle">
                                <th className="text-left py-2 pr-4">#</th>
                                <th className="text-left py-2 pr-4">Type</th>
                                <th className="text-left py-2 pr-4">Strike</th>
                                <th className="text-left py-2 pr-4">Expiry</th>
                                <th className="text-left py-2 pr-4">Amount</th>
                                <th className="text-left py-2 pr-4">Status</th>
                                <th className="text-left py-2">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((option) => (
                                <tr
                                    key={option.id.toString()}
                                    className="border-b border-terminal-border-subtle last:border-0 hover:bg-terminal-bg-primary transition-colors"
                                    data-testid={`option-row-${option.id}`}
                                >
                                    <td className="py-2 pr-4 text-terminal-text-muted">
                                        {option.id.toString()}
                                    </td>
                                    <td className="py-2 pr-4">
                                        <TypeBadge optionType={option.optionType} />
                                    </td>
                                    <td className="py-2 pr-4 text-terminal-text-secondary">
                                        {formatTokenAmount(option.strikePrice)} PILL
                                    </td>
                                    <td className="py-2 pr-4 text-terminal-text-secondary">
                                        blk {option.expiryBlock.toString()}
                                    </td>
                                    <td className="py-2 pr-4 text-terminal-text-secondary">
                                        {formatTokenAmount(option.underlyingAmount)} MOTO
                                    </td>
                                    <td className="py-2 pr-4">
                                        <StatusBadge status={option.status} />
                                    </td>
                                    <td className="py-2">
                                        <RowAction
                                            option={option}
                                            walletHex={walletHex}
                                            currentBlock={currentBlock}
                                            gracePeriodBlocks={gracePeriodBlocks}
                                            onBuy={onBuy}
                                            onCancel={onCancel}
                                            onExercise={onExercise}
                                            onSettle={onSettle}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
