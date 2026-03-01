/**
 * OptionsTable — displays all options in a pool with filter controls and row actions.
 */
import { useState } from 'react';
import { type OptionData, OptionStatus, OptionType } from '../services/types.ts';
import { formatTokenAmount, blocksToCountdown } from '../config/index.ts';
import { calcBreakeven, calcYield } from '../utils/optionMath.js';

type FilterStatus = 'ALL' | 'OPEN' | 'PURCHASED' | 'EXPIRED' | 'CANCELLED';

interface OptionsTableProps {
    options: OptionData[];
    /** Connected wallet hex address (0x...) or null if disconnected */
    walletHex: string | null;
    /** Whether a wallet is currently connected (enables action buttons) */
    walletConnected?: boolean;
    /** Current block number (for grace period calc + expiry countdown) */
    currentBlock?: bigint;
    /** Grace period in blocks */
    gracePeriodBlocks?: bigint;
    /** MOTO/PILL price ratio for strike equivalent display */
    motoPillRatio?: number | null;
    /** Per-option unrealized P&L in PILL (from usePnL hook) */
    pnlMap?: Map<bigint, number>;
    /** Show the status filter bar (default: true) */
    showFilter?: boolean;
    onBuy?: (option: OptionData) => void;
    onCancel?: (option: OptionData) => void;
    onExercise?: (option: OptionData) => void;
    onSettle?: (option: OptionData) => void;
    onRoll?: (option: OptionData) => void;
    onBatchCancel?: (options: OptionData[]) => void;
    onBatchSettle?: (options: OptionData[]) => void;
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

function GraceWarning({ option, currentBlock, gracePeriodBlocks }: {
    option: OptionData;
    currentBlock?: bigint;
    gracePeriodBlocks?: bigint;
}) {
    if (currentBlock === undefined || option.status !== OptionStatus.PURCHASED) return null;
    const graceEnds = option.expiryBlock + (gracePeriodBlocks ?? 144n);
    const blocksLeft = graceEnds - currentBlock;
    if (blocksLeft <= 0n) return null;
    if (blocksLeft < 144n) {
        return <span className="text-rose-400 text-[10px] font-mono ml-1">Exercise soon!</span>;
    }
    if (blocksLeft < 1000n) {
        const daysLeft = Math.ceil(Number(blocksLeft) / 144);
        return <span className="text-amber-400 text-[10px] font-mono ml-1">Grace: ~{daysLeft}d left</span>;
    }
    return null;
}

function RowAction({
    option,
    walletHex,
    walletConnected,
    currentBlock,
    gracePeriodBlocks,
    onBuy,
    onCancel,
    onExercise,
    onSettle,
    onRoll,
}: {
    option: OptionData;
    walletHex: string | null;
    walletConnected: boolean;
    currentBlock?: bigint;
    gracePeriodBlocks?: bigint;
    onBuy?: (o: OptionData) => void;
    onCancel?: (o: OptionData) => void;
    onExercise?: (o: OptionData) => void;
    onSettle?: (o: OptionData) => void;
    onRoll?: (o: OptionData) => void;
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
                <div className="flex gap-1">
                    <button
                        className="btn-secondary px-3 py-1 text-xs rounded disabled:opacity-50"
                        onClick={() => onCancel?.(option)}
                        disabled={!walletConnected}
                        data-testid={`cancel-${option.id}`}
                    >
                        Cancel
                    </button>
                    <button
                        className="btn-secondary px-3 py-1 text-xs rounded disabled:opacity-50"
                        onClick={() => onRoll?.(option)}
                        disabled={!walletConnected}
                        data-testid={`roll-${option.id}`}
                    >
                        Roll
                    </button>
                </div>
            );
        }
        return (
            <button
                className={`px-3 py-1 text-xs rounded ${walletConnected ? 'btn-primary' : 'btn-secondary opacity-60'}`}
                onClick={() => walletConnected && onBuy?.(option)}
                disabled={!walletConnected}
                title={walletConnected ? undefined : 'Connect wallet'}
                data-testid={`buy-${option.id}`}
            >
                {walletConnected ? 'Buy' : 'Connect wallet'}
            </button>
        );
    }

    if (option.status === OptionStatus.PURCHASED) {
        if (isBuyer && graceActive) {
            return (
                <div className="flex items-center">
                    <button
                        className="btn-primary px-3 py-1 text-xs rounded"
                        onClick={() => onExercise?.(option)}
                        data-testid={`exercise-${option.id}`}
                    >
                        Exercise
                    </button>
                    <GraceWarning option={option} currentBlock={currentBlock} gracePeriodBlocks={gracePeriodBlocks} />
                </div>
            );
        }
        if (!graceActive) {
            return (
                <button
                    className="btn-secondary px-3 py-1 text-xs rounded disabled:opacity-50"
                    onClick={() => onSettle?.(option)}
                    disabled={!walletConnected}
                    data-testid={`settle-${option.id}`}
                >
                    Settle
                </button>
            );
        }
        // Grace active but user is not buyer — show grace warning if applicable
        return <GraceWarning option={option} currentBlock={currentBlock} gracePeriodBlocks={gracePeriodBlocks} />;
    }

    if (option.status === OptionStatus.EXPIRED) {
        return (
            <button
                className="btn-secondary px-3 py-1 text-xs rounded disabled:opacity-50"
                onClick={() => onSettle?.(option)}
                disabled={!walletConnected}
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
    walletConnected = walletHex !== null,
    currentBlock,
    gracePeriodBlocks,
    motoPillRatio,
    pnlMap,
    showFilter = true,
    onBuy,
    onCancel,
    onExercise,
    onSettle,
    onRoll,
    onBatchCancel,
    onBatchSettle,
}: OptionsTableProps) {
    const [filter, setFilter] = useState<FilterStatus>('ALL');
    const [selected, setSelected] = useState<Set<bigint>>(new Set());

    const filtered = showFilter
        ? options.filter((o) => {
              if (filter === 'ALL') return true;
              return STATUS_LABELS[o.status] === filter;
          })
        : options;

    function toggleSelect(id: bigint) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }

    function toggleSelectAll() {
        if (selected.size === filtered.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(filtered.map((o) => o.id)));
        }
    }

    const selectedOptions = filtered.filter((o) => selected.has(o.id));
    const selectedOpen = selectedOptions.filter(
        (o) => o.status === OptionStatus.OPEN && walletHex !== null && o.writer.toLowerCase() === walletHex.toLowerCase(),
    );

    const graceBlocks = gracePeriodBlocks ?? 144n;
    const selectedSettleable = selectedOptions.filter((o) => {
        if (o.status !== OptionStatus.PURCHASED) return false;
        if (currentBlock === undefined) return false;
        return currentBlock >= o.expiryBlock + graceBlocks;
    });

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

            {/* Batch action buttons */}
            {(selectedOpen.length > 0 || selectedSettleable.length > 0) && (
                <div className="flex gap-2 mb-3">
                    {selectedOpen.length > 0 && onBatchCancel && (
                        <button
                            onClick={() => onBatchCancel(selectedOpen)}
                            className="btn-secondary px-3 py-1 text-xs rounded"
                            data-testid="btn-batch-cancel-selected"
                        >
                            Cancel Selected ({selectedOpen.length})
                        </button>
                    )}
                    {selectedSettleable.length > 0 && onBatchSettle && (
                        <button
                            onClick={() => onBatchSettle(selectedSettleable)}
                            className="btn-secondary px-3 py-1 text-xs rounded"
                            data-testid="btn-batch-settle-selected"
                        >
                            Settle Expired ({selectedSettleable.length})
                        </button>
                    )}
                </div>
            )}

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
                                <th className="py-2 pr-2 w-8">
                                    <input
                                        type="checkbox"
                                        checked={filtered.length > 0 && selected.size === filtered.length}
                                        onChange={toggleSelectAll}
                                        className="accent-accent"
                                        data-testid="select-all"
                                    />
                                </th>
                                <th className="text-left py-2 pr-4">#</th>
                                <th className="text-left py-2 pr-4">Type</th>
                                <th className="text-left py-2 pr-4">Strike</th>
                                <th className="text-left py-2 pr-4">Premium</th>
                                <th className="text-left py-2 pr-4">Expiry</th>
                                <th className="text-left py-2 pr-4">Amount</th>
                                <th className="text-left py-2 pr-4">Breakeven</th>
                                <th className="text-left py-2 pr-4">Yield</th>
                                {pnlMap && <th className="text-left py-2 pr-4">P&L</th>}
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
                                    <td className="py-2 pr-2">
                                        <input
                                            type="checkbox"
                                            checked={selected.has(option.id)}
                                            onChange={() => toggleSelect(option.id)}
                                            className="accent-accent"
                                            data-testid={`select-${option.id}`}
                                        />
                                    </td>
                                    <td className="py-2 pr-4 text-terminal-text-muted">
                                        {option.id.toString()}
                                    </td>
                                    <td className="py-2 pr-4">
                                        <TypeBadge optionType={option.optionType} />
                                    </td>
                                    <td className="py-2 pr-4 text-terminal-text-secondary">
                                        {formatTokenAmount(option.strikePrice)} PILL
                                        {motoPillRatio != null && motoPillRatio > 0 && (
                                            <span className="block text-[10px] text-terminal-text-muted">
                                                ~{(Number(option.strikePrice) / 1e18 / motoPillRatio).toFixed(4)} MOTO eq.
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-2 pr-4 text-terminal-text-secondary">
                                        {formatTokenAmount(option.premium)} PILL
                                    </td>
                                    <td className="py-2 pr-4 text-terminal-text-secondary">
                                        {currentBlock !== undefined
                                            ? (() => {
                                                const left = option.expiryBlock - currentBlock;
                                                return left > 0n
                                                    ? <span>{blocksToCountdown(left)}</span>
                                                    : <span className="text-terminal-text-muted">Expired</span>;
                                            })()
                                            : <>blk {option.expiryBlock.toString()}</>
                                        }
                                    </td>
                                    <td className="py-2 pr-4 text-terminal-text-secondary">
                                        {formatTokenAmount(option.underlyingAmount)} MOTO
                                    </td>
                                    <td className="py-2 pr-4 text-terminal-text-secondary text-xs">
                                        {(() => {
                                            const be = calcBreakeven(option);
                                            return be !== null ? <>{formatTokenAmount(be)} PILL</> : <span className="text-terminal-text-muted">—</span>;
                                        })()}
                                    </td>
                                    <td className="py-2 pr-4 text-terminal-text-secondary text-xs">
                                        {(() => {
                                            const y = calcYield(option);
                                            return y !== null ? <>{y.toFixed(2)}%</> : <span className="text-terminal-text-muted">—</span>;
                                        })()}
                                    </td>
                                    {pnlMap && (
                                        <td className="py-2 pr-4 text-xs font-mono">
                                            {(() => {
                                                const pnl = pnlMap.get(option.id);
                                                if (pnl === undefined) return <span className="text-terminal-text-muted">—</span>;
                                                return (
                                                    <span className={pnl >= 0 ? 'text-green-400' : 'text-rose-400'}>
                                                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} PILL
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                    )}
                                    <td className="py-2 pr-4">
                                        <StatusBadge status={option.status} />
                                    </td>
                                    <td className="py-2">
                                        <RowAction
                                            option={option}
                                            walletHex={walletHex}
                                            walletConnected={walletConnected}
                                            currentBlock={currentBlock}
                                            gracePeriodBlocks={gracePeriodBlocks}
                                            onBuy={onBuy}
                                            onCancel={onCancel}
                                            onExercise={onExercise}
                                            onSettle={onSettle}
                                            onRoll={onRoll}
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
