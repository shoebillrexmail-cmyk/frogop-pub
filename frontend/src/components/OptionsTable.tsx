/**
 * OptionsTable — displays all options in a pool with filter controls,
 * advanced filtering, sortable columns, and row actions.
 */
import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { type OptionData, OptionStatus, OptionType } from '../services/types.ts';
import { formatTokenAmount, blocksToCountdown, premiumDisplayUnit } from '../config/index.ts';
import { calcBreakeven, calcYield } from '../utils/optionMath.js';
import type { StrategyFilter } from '../utils/strategyMath.ts';

type FilterStatus = 'ALL' | 'OPEN' | 'PURCHASED' | 'RESERVED' | 'EXPIRED' | 'CANCELLED';

type SortKey = 'id' | 'strike' | 'premium' | 'expiry' | 'amount';
type SortDir = 'asc' | 'desc';

interface AdvancedFilters {
    typeToggle: 'ALL' | 'CALL' | 'PUT';
    strikeMin: string;
    strikeMax: string;
    premiumMin: string;
    premiumMax: string;
    expiryWindow: 'any' | '1d' | '7d' | '30d';
}

const EMPTY_ADVANCED: AdvancedFilters = {
    typeToggle: 'ALL',
    strikeMin: '',
    strikeMax: '',
    premiumMin: '',
    premiumMax: '',
    expiryWindow: 'any',
};

function parsePill(v: string): bigint | null {
    const n = parseFloat(v);
    if (isNaN(n) || n < 0) return null;
    return BigInt(Math.round(n * 1e18));
}

const EXPIRY_BLOCKS: Record<string, bigint> = {
    '1d': 144n,
    '7d': 1008n,
    '30d': 4320n,
};

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
    /** Underlying/premium price ratio for strike equivalent display */
    motoPillRatio?: number | null;
    /** Per-option unrealized P&L in premium token (from usePnL hook) */
    pnlMap?: Map<bigint, number>;
    /** Show the status filter bar (default: true) */
    showFilter?: boolean;
    /** Compute user-perspective status labels (for Portfolio) */
    userStatusLabel?: (option: OptionData) => string;
    /** Pool address for building detail page links */
    poolAddress?: string;
    /** Display symbol for the underlying token (default: 'MOTO') */
    underlyingSymbol?: string;
    /** Display symbol for the premium token (default: 'PILL') */
    premiumSymbol?: string;
    onBuy?: (option: OptionData) => void;
    onCancel?: (option: OptionData) => void;
    onExercise?: (option: OptionData) => void;
    onSettle?: (option: OptionData) => void;
    onRoll?: (option: OptionData) => void;
    onTransfer?: (option: OptionData) => void;
    onBatchCancel?: (options: OptionData[]) => void;
    onBatchSettle?: (options: OptionData[]) => void;
    /** Strategy filter — highlight matching options, dim others */
    strategyFilter?: StrategyFilter | null;
    /** Show listing status column (for "My Listings" view) */
    showListingStatus?: boolean;
}

const STATUS_LABELS: Record<number, string> = {
    [OptionStatus.OPEN]: 'OPEN',
    [OptionStatus.PURCHASED]: 'PURCHASED',
    [OptionStatus.EXERCISED]: 'EXERCISED',
    [OptionStatus.EXPIRED]: 'EXPIRED',
    [OptionStatus.CANCELLED]: 'CANCELLED',
    [OptionStatus.RESERVED]: 'RESERVED',
};

const STATUS_BADGE_CLASSES: Record<number, string> = {
    [OptionStatus.OPEN]: 'border border-green-500 text-green-400',
    [OptionStatus.PURCHASED]: 'border border-cyan-400 text-cyan-300',
    [OptionStatus.EXERCISED]: 'border border-orange-400 text-orange-300',
    [OptionStatus.EXPIRED]: 'border border-gray-600 text-gray-400',
    [OptionStatus.CANCELLED]: 'border border-rose-700 text-rose-500',
    [OptionStatus.RESERVED]: 'border border-yellow-500 text-yellow-400',
};

const FILTER_OPTIONS: FilterStatus[] = ['ALL', 'OPEN', 'PURCHASED', 'RESERVED', 'EXPIRED', 'CANCELLED'];

const ZERO_HEX = '0x' + '0'.repeat(64);

function getListingStatus(option: OptionData): { label: string; color: string } {
    if (option.status === OptionStatus.OPEN) {
        return { label: 'Waiting for buyer', color: 'text-amber-400' };
    }
    if (option.status === OptionStatus.PURCHASED) {
        return { label: 'Bought - active', color: 'text-green-400' };
    }
    if (option.status === OptionStatus.EXPIRED) {
        return { label: 'Expired', color: 'text-rose-400' };
    }
    if (option.status === OptionStatus.EXERCISED) {
        return { label: 'Exercised', color: 'text-terminal-text-muted' };
    }
    if (option.status === OptionStatus.CANCELLED) {
        return { label: 'Cancelled', color: 'text-terminal-text-muted' };
    }
    return { label: String(option.status), color: 'text-terminal-text-muted' };
}

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
    onTransfer,
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
    onTransfer?: (o: OptionData) => void;
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
                <div className="flex items-center gap-1">
                    <button
                        className="btn-primary px-3 py-1 text-xs rounded"
                        onClick={() => onExercise?.(option)}
                        data-testid={`exercise-${option.id}`}
                    >
                        Exercise
                    </button>
                    {onTransfer && (
                        <button
                            className="btn-secondary px-3 py-1 text-xs rounded"
                            onClick={() => onTransfer(option)}
                            data-testid={`transfer-${option.id}`}
                        >
                            Transfer
                        </button>
                    )}
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

function SortableHeader({ label, sortKey: key, currentKey, dir, onSort }: {
    label: string;
    sortKey: SortKey;
    currentKey: SortKey | null;
    dir: SortDir;
    onSort: (key: SortKey) => void;
}) {
    const active = currentKey === key;
    return (
        <th
            className="text-left py-2 pr-4 cursor-pointer select-none hover:text-terminal-text-primary transition-colors"
            onClick={() => onSort(key)}
            data-testid={`sort-${key}`}
        >
            {label}
            <span className="ml-0.5 text-[9px]">
                {active ? (dir === 'asc' ? '\u25B2' : '\u25BC') : '\u25B4'}
            </span>
        </th>
    );
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
    userStatusLabel,
    poolAddress,
    onBuy,
    onCancel,
    onExercise,
    onSettle,
    onRoll,
    onTransfer,
    onBatchCancel,
    onBatchSettle,
    underlyingSymbol = 'MOTO',
    premiumSymbol = 'PILL',
    strategyFilter,
    showListingStatus = false,
}: OptionsTableProps) {
    const [filter, setFilter] = useState<FilterStatus>('ALL');
    const [selected, setSelected] = useState<Set<bigint>>(new Set());
    const [advOpen, setAdvOpen] = useState(false);
    const [adv, setAdv] = useState<AdvancedFilters>(EMPTY_ADVANCED);
    const [sortKey, setSortKey] = useState<SortKey | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    const handleSort = useCallback((key: SortKey) => {
        setSortKey((prev) => {
            if (prev === key) {
                setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                return key;
            }
            setSortDir('asc');
            return key;
        });
    }, []);

    const hasAdvFilters = adv.typeToggle !== 'ALL' || adv.strikeMin !== '' || adv.strikeMax !== '' ||
        adv.premiumMin !== '' || adv.premiumMax !== '' || adv.expiryWindow !== 'any';

    const filtered = useMemo(() => {
        let result = options;

        // Status filter
        if (showFilter && filter !== 'ALL') {
            result = result.filter((o) => STATUS_LABELS[o.status] === filter);
        }

        // Advanced filters
        if (adv.typeToggle === 'CALL') result = result.filter((o) => o.optionType === OptionType.CALL);
        if (adv.typeToggle === 'PUT') result = result.filter((o) => o.optionType === OptionType.PUT);

        const strikeMinVal = parsePill(adv.strikeMin);
        if (strikeMinVal !== null) result = result.filter((o) => o.strikePrice >= strikeMinVal);

        const strikeMaxVal = parsePill(adv.strikeMax);
        if (strikeMaxVal !== null) result = result.filter((o) => o.strikePrice <= strikeMaxVal);

        const premMinVal = parsePill(adv.premiumMin);
        if (premMinVal !== null) result = result.filter((o) => o.premium >= premMinVal);

        const premMaxVal = parsePill(adv.premiumMax);
        if (premMaxVal !== null) result = result.filter((o) => o.premium <= premMaxVal);

        if (adv.expiryWindow !== 'any' && currentBlock !== undefined) {
            const maxBlocks = EXPIRY_BLOCKS[adv.expiryWindow];
            if (maxBlocks !== undefined) {
                const deadline = currentBlock + maxBlocks;
                result = result.filter((o) => o.expiryBlock > currentBlock && o.expiryBlock <= deadline);
            }
        }

        // Sort
        if (sortKey) {
            const dir = sortDir === 'asc' ? 1n : -1n;
            result = [...result].sort((a, b) => {
                let cmp = 0n;
                switch (sortKey) {
                    case 'id': cmp = a.id - b.id; break;
                    case 'strike': cmp = a.strikePrice - b.strikePrice; break;
                    case 'premium': cmp = a.premium - b.premium; break;
                    case 'expiry': cmp = a.expiryBlock - b.expiryBlock; break;
                    case 'amount': cmp = a.underlyingAmount - b.underlyingAmount; break;
                }
                if (cmp < 0n) return Number(-dir);
                if (cmp > 0n) return Number(dir);
                return 0;
            });
        }

        return result;
    }, [options, showFilter, filter, adv, currentBlock, sortKey, sortDir]);

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

            {/* Advanced filters (collapsible) */}
            {showFilter && (
                <div className="mb-3">
                    <button
                        onClick={() => setAdvOpen((v) => !v)}
                        className="text-xs font-mono text-terminal-text-muted hover:text-terminal-text-primary transition-colors flex items-center gap-1"
                        data-testid="toggle-advanced-filters"
                    >
                        <span className={`transition-transform ${advOpen ? 'rotate-90' : ''}`}>&#9654;</span>
                        Advanced Filters
                        {hasAdvFilters && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                    </button>
                    {advOpen && (
                        <div className="mt-2 p-3 bg-terminal-bg-primary border border-terminal-border-subtle rounded-lg grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                            {/* Type toggle */}
                            <div>
                                <label className="text-terminal-text-muted block mb-1">Type</label>
                                <div className="flex gap-1">
                                    {(['ALL', 'CALL', 'PUT'] as const).map((t) => (
                                        <button
                                            key={t}
                                            onClick={() => setAdv((prev) => ({ ...prev, typeToggle: t }))}
                                            className={`px-2 py-0.5 rounded ${adv.typeToggle === t ? 'bg-accent text-white' : 'text-terminal-text-muted border border-terminal-border-subtle'}`}
                                            data-testid={`type-${t.toLowerCase()}`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* Strike range */}
                            <div>
                                <label className="text-terminal-text-muted block mb-1">Strike ({premiumDisplayUnit(premiumSymbol)})</label>
                                <div className="flex gap-1">
                                    <input
                                        type="number"
                                        placeholder="Min"
                                        value={adv.strikeMin}
                                        onChange={(e) => setAdv((prev) => ({ ...prev, strikeMin: e.target.value }))}
                                        className="w-full bg-terminal-bg-elevated border border-terminal-border-subtle rounded px-1.5 py-0.5 text-terminal-text-primary"
                                        data-testid="strike-min"
                                    />
                                    <input
                                        type="number"
                                        placeholder="Max"
                                        value={adv.strikeMax}
                                        onChange={(e) => setAdv((prev) => ({ ...prev, strikeMax: e.target.value }))}
                                        className="w-full bg-terminal-bg-elevated border border-terminal-border-subtle rounded px-1.5 py-0.5 text-terminal-text-primary"
                                        data-testid="strike-max"
                                    />
                                </div>
                            </div>
                            {/* Premium range */}
                            <div>
                                <label className="text-terminal-text-muted block mb-1">Premium ({premiumDisplayUnit(premiumSymbol)})</label>
                                <div className="flex gap-1">
                                    <input
                                        type="number"
                                        placeholder="Min"
                                        value={adv.premiumMin}
                                        onChange={(e) => setAdv((prev) => ({ ...prev, premiumMin: e.target.value }))}
                                        className="w-full bg-terminal-bg-elevated border border-terminal-border-subtle rounded px-1.5 py-0.5 text-terminal-text-primary"
                                        data-testid="premium-min"
                                    />
                                    <input
                                        type="number"
                                        placeholder="Max"
                                        value={adv.premiumMax}
                                        onChange={(e) => setAdv((prev) => ({ ...prev, premiumMax: e.target.value }))}
                                        className="w-full bg-terminal-bg-elevated border border-terminal-border-subtle rounded px-1.5 py-0.5 text-terminal-text-primary"
                                        data-testid="premium-max"
                                    />
                                </div>
                            </div>
                            {/* Expiry window */}
                            <div>
                                <label className="text-terminal-text-muted block mb-1">Expiry Window</label>
                                <select
                                    value={adv.expiryWindow}
                                    onChange={(e) => setAdv((prev) => ({ ...prev, expiryWindow: e.target.value as AdvancedFilters['expiryWindow'] }))}
                                    className="w-full bg-terminal-bg-elevated border border-terminal-border-subtle rounded px-1.5 py-0.5 text-terminal-text-primary"
                                    data-testid="expiry-window"
                                >
                                    <option value="any">Any</option>
                                    <option value="1d">Next 24h</option>
                                    <option value="7d">Next 7 days</option>
                                    <option value="30d">Next 30 days</option>
                                </select>
                            </div>
                            {/* Clear */}
                            {hasAdvFilters && (
                                <div className="col-span-full flex justify-end">
                                    <button
                                        onClick={() => setAdv(EMPTY_ADVANCED)}
                                        className="text-xs text-terminal-text-muted hover:text-terminal-text-primary"
                                        data-testid="clear-advanced-filters"
                                    >
                                        Clear filters
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

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
                    {options.length === 0
                        ? 'No options yet.'
                        : 'No options match the current filters.'}
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
                                <SortableHeader label="#" sortKey="id" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                                <th className="text-left py-2 pr-4">Type</th>
                                <SortableHeader label="Strike" sortKey="strike" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                                <SortableHeader label="Premium" sortKey="premium" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                                <SortableHeader label="Expiry" sortKey="expiry" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                                <SortableHeader label="Amount" sortKey="amount" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                                <th className="text-left py-2 pr-4">Breakeven</th>
                                <th className="text-left py-2 pr-4">Yield</th>
                                {pnlMap && <th className="text-left py-2 pr-4">P&L</th>}
                                <th className="text-left py-2 pr-4">Status</th>
                                {showListingStatus && <th className="text-left py-2 pr-4">Listing</th>}
                                <th className="text-left py-2">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((option) => (
                                <tr
                                    key={option.id.toString()}
                                    className={`border-b border-terminal-border-subtle last:border-0 hover:bg-terminal-bg-primary transition-colors ${
                                        strategyFilter && !(
                                            option.optionType === strategyFilter.optionType &&
                                            Number(option.strikePrice) / 1e18 >= strategyFilter.strikeMin &&
                                            Number(option.strikePrice) / 1e18 <= strategyFilter.strikeMax
                                        ) ? 'opacity-30' : ''
                                    }`}
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
                                        {poolAddress ? (
                                            <Link
                                                to={`/chain/${poolAddress}/options/${option.id.toString()}`}
                                                className="text-accent hover:text-accent/80 underline"
                                                data-testid={`option-link-${option.id}`}
                                            >
                                                {option.id.toString()}
                                            </Link>
                                        ) : (
                                            option.id.toString()
                                        )}
                                    </td>
                                    <td className="py-2 pr-4">
                                        <TypeBadge optionType={option.optionType} />
                                    </td>
                                    <td className="py-2 pr-4 text-terminal-text-secondary">
                                        {formatTokenAmount(option.strikePrice)} {premiumDisplayUnit(premiumSymbol)}
                                        {motoPillRatio != null && motoPillRatio > 0 && (
                                            <span className="block text-[10px] text-terminal-text-muted">
                                                ~{(Number(option.strikePrice) / 1e18 / motoPillRatio).toFixed(4)} {underlyingSymbol} eq.
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-2 pr-4 text-terminal-text-secondary">
                                        {formatTokenAmount(option.premium)} {premiumDisplayUnit(premiumSymbol)}
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
                                        {formatTokenAmount(option.underlyingAmount)} {underlyingSymbol}
                                    </td>
                                    <td className="py-2 pr-4 text-terminal-text-secondary text-xs">
                                        {(() => {
                                            const be = calcBreakeven(option);
                                            return be !== null ? <>{formatTokenAmount(be)} {premiumDisplayUnit(premiumSymbol)}</> : <span className="text-terminal-text-muted">—</span>;
                                        })()}
                                    </td>
                                    <td className="py-2 pr-4 text-terminal-text-secondary text-xs">
                                        {(() => {
                                            const y = calcYield(option, motoPillRatio);
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
                                                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} {premiumDisplayUnit(premiumSymbol)}
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                    )}
                                    <td className="py-2 pr-4">
                                        {userStatusLabel ? (
                                            <span className={`inline-block px-2 py-0.5 text-xs font-mono rounded ${STATUS_BADGE_CLASSES[option.status] ?? 'text-gray-400'}`}>
                                                {userStatusLabel(option)}
                                            </span>
                                        ) : (
                                            <StatusBadge status={option.status} />
                                        )}
                                    </td>
                                    {showListingStatus && (
                                        <td className="py-2 pr-4">
                                            {(() => {
                                                const ls = getListingStatus(option);
                                                return <span className={`text-xs font-mono ${ls.color}`}>{ls.label}</span>;
                                            })()}
                                        </td>
                                    )}
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
                                            onTransfer={onTransfer}
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
