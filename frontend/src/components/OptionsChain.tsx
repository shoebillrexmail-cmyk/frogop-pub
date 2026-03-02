/**
 * OptionsChain — strike × expiry matrix view for the options pool.
 *
 * Calls left, puts right, strikes as rows, grouped by expiry bucket.
 * Click a cell to expand individual listings with Buy buttons.
 */
import { useState, useMemo, useCallback } from 'react';
import type { OptionData } from '../services/types.ts';
import {
    buildChain,
    findAtmStrikeIndex,
    isCallItm,
    isPutItm,
    BUCKET_LABELS,
} from '../utils/optionsChain.ts';
import type { ExpiryBucket, ChainCell } from '../utils/optionsChain.ts';
import { formatTokenAmount, blocksToCountdown } from '../config/index.ts';
import { calcBreakeven } from '../utils/optionMath.js';

// ── Props ──────────────────────────────────────────────────────────────

interface OptionsChainProps {
    options: OptionData[];
    walletHex: string | null;
    walletConnected?: boolean;
    currentBlock?: bigint;
    motoPillRatio?: number | null;
    poolAddress?: string;
    buyFeeBps?: bigint;
    onBuy?: (option: OptionData) => void;
}

// ── Sub-components ─────────────────────────────────────────────────────

function ExpiryTabs({
    buckets,
    active,
    onSelect,
}: {
    buckets: Array<ExpiryBucket | 'all'>;
    active: ExpiryBucket | 'all';
    onSelect: (b: ExpiryBucket | 'all') => void;
}) {
    return (
        <div className="flex gap-1 flex-wrap" data-testid="expiry-tabs">
            {buckets.map((b) => (
                <button
                    key={b}
                    onClick={() => onSelect(b)}
                    className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                        active === b
                            ? 'bg-accent text-terminal-bg-primary'
                            : 'text-terminal-text-muted border border-terminal-border-subtle hover:text-terminal-text-primary'
                    }`}
                    data-testid={`expiry-tab-${b}`}
                >
                    {BUCKET_LABELS[b]}
                </button>
            ))}
        </div>
    );
}

function MobileTypeToggle({
    value,
    onChange,
}: {
    value: 'BOTH' | 'CALL' | 'PUT';
    onChange: (v: 'BOTH' | 'CALL' | 'PUT') => void;
}) {
    return (
        <div className="flex gap-1 sm:hidden" data-testid="mobile-type-toggle">
            {(['CALL', 'PUT', 'BOTH'] as const).map((t) => (
                <button
                    key={t}
                    onClick={() => onChange(t)}
                    className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                        value === t
                            ? 'bg-accent text-terminal-bg-primary'
                            : 'text-terminal-text-muted border border-terminal-border-subtle'
                    }`}
                >
                    {t}
                </button>
            ))}
        </div>
    );
}

function ChainHeader({ mobileType }: { mobileType: 'BOTH' | 'CALL' | 'PUT' }) {
    const showCalls = mobileType !== 'PUT';
    const showPuts = mobileType !== 'CALL';

    return (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center text-xs text-terminal-text-muted font-mono py-2 border-b border-terminal-border-subtle">
            {showCalls ? (
                <div className="grid grid-cols-3 gap-2 text-right">
                    <span>Depth</span>
                    <span>Amount</span>
                    <span className="text-green-400">Premium</span>
                </div>
            ) : <div />}
            <div className="px-4 text-center font-semibold text-terminal-text-primary">STRIKE</div>
            {showPuts ? (
                <div className="grid grid-cols-3 gap-2">
                    <span className="text-rose-400">Premium</span>
                    <span>Amount</span>
                    <span>Depth</span>
                </div>
            ) : <div />}
        </div>
    );
}

function ChainCellDisplay({
    cell,
    side,
    isItm,
    isExpanded,
    isWriter,
    walletConnected,
    onClick,
    onBuy,
}: {
    cell: ChainCell | null;
    side: 'call' | 'put';
    isItm: boolean;
    isExpanded: boolean;
    isWriter: boolean;
    walletConnected: boolean;
    onClick: () => void;
    onBuy?: (option: OptionData) => void;
}) {
    if (!cell) {
        return (
            <div
                className={`grid grid-cols-3 gap-2 py-2 px-1 ${side === 'call' ? 'text-right' : ''}`}
                data-testid={`chain-cell-${side}`}
            >
                <span className="text-terminal-text-muted">—</span>
                <span className="text-terminal-text-muted">—</span>
                <span className="text-terminal-text-muted">—</span>
            </div>
        );
    }

    const isSingle = cell.depth === 1;
    const itmBg = isItm
        ? side === 'call' ? 'bg-green-900/10' : 'bg-rose-900/10'
        : '';
    const premColor = side === 'call' ? 'text-green-400' : 'text-rose-400';
    const selectedBorder = isExpanded ? 'ring-1 ring-accent/50' : '';

    // Chevron for multi-option cells
    const chevron = !isSingle ? (
        <span className={`text-[10px] text-terminal-text-muted transition-transform inline-block ${isExpanded ? 'rotate-90' : ''}`}>
            &#9654;
        </span>
    ) : null;

    const depthEl = (
        <span className="text-terminal-text-muted inline-flex items-center gap-0.5">
            {side === 'call' && chevron}
            {isSingle ? '' : `×${cell.depth}`}
            {side === 'put' && chevron}
        </span>
    );
    const amountEl = (
        <span className="text-terminal-text-secondary">
            {formatTokenAmount(cell.totalAmount)}
        </span>
    );
    const premiumEl = (
        <span className={premColor}>
            {formatTokenAmount(cell.bestPremium)}
        </span>
    );

    // Single-option cell: show inline Buy button instead of depth
    const actionEl = isSingle ? (
        isWriter ? (
            <span className="text-terminal-text-muted text-[10px]">Yours</span>
        ) : (
            <button
                className={`px-1.5 py-0.5 text-[10px] rounded ${
                    walletConnected ? 'btn-primary' : 'btn-secondary opacity-60'
                }`}
                onClick={(e) => {
                    e.stopPropagation();
                    if (walletConnected) onBuy?.(cell.options[0]);
                }}
                disabled={!walletConnected}
                title={walletConnected ? 'Buy this option' : 'Connect wallet'}
                data-testid={`chain-buy-${cell.options[0].id}`}
            >
                Buy
            </button>
        )
    ) : depthEl;

    const cells = side === 'call'
        ? [actionEl, amountEl, premiumEl]
        : [premiumEl, amountEl, actionEl];

    return (
        <div
            className={`grid grid-cols-3 gap-2 py-2 px-1 ${isSingle ? '' : 'cursor-pointer'} rounded transition-colors hover:bg-terminal-bg-primary/50 ${itmBg} ${selectedBorder} ${side === 'call' ? 'text-right' : ''}`}
            onClick={isSingle ? undefined : onClick}
            data-testid={`chain-cell-${side}`}
            role={isSingle ? undefined : 'button'}
            tabIndex={isSingle ? undefined : 0}
            onKeyDown={isSingle ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
        >
            {cells.map((el, i) => <div key={i}>{el}</div>)}
        </div>
    );
}

function ExpandedListings({
    cell,
    side,
    walletHex,
    walletConnected,
    currentBlock,
    onBuy,
}: {
    cell: ChainCell;
    side: 'call' | 'put';
    walletHex: string | null;
    walletConnected: boolean;
    currentBlock?: bigint;
    onBuy?: (option: OptionData) => void;
}) {
    const sideColor = side === 'call' ? 'border-l-green-500/30' : 'border-l-rose-500/30';

    return (
        <div
            className={`bg-terminal-bg-primary border-l-2 ${sideColor} rounded px-3 py-2 mt-1 mb-2`}
            data-testid="expanded-listings"
        >
            <table className="w-full text-xs font-mono">
                <thead>
                    <tr className="text-terminal-text-muted">
                        <th className="text-left py-1 pr-2">#</th>
                        <th className="text-left py-1 pr-2">Amount</th>
                        <th className="text-left py-1 pr-2">Premium</th>
                        <th className="text-left py-1 pr-2">Expiry</th>
                        <th className="text-left py-1 pr-2">Breakeven</th>
                        <th className="text-left py-1"></th>
                    </tr>
                </thead>
                <tbody>
                    {cell.options.map((opt) => {
                        const isWriter = walletHex !== null &&
                            opt.writer.toLowerCase() === walletHex.toLowerCase();
                        const be = calcBreakeven(opt);
                        const blocksLeft = currentBlock !== undefined
                            ? opt.expiryBlock - currentBlock
                            : undefined;

                        return (
                            <tr
                                key={opt.id.toString()}
                                className="border-t border-terminal-border-subtle"
                                data-testid={`listing-${opt.id}`}
                            >
                                <td className="py-1.5 pr-2 text-terminal-text-muted">
                                    {opt.id.toString()}
                                </td>
                                <td className="py-1.5 pr-2 text-terminal-text-secondary">
                                    {formatTokenAmount(opt.underlyingAmount)} MOTO
                                </td>
                                <td className={`py-1.5 pr-2 ${side === 'call' ? 'text-green-400' : 'text-rose-400'}`}>
                                    {formatTokenAmount(opt.premium)} PILL
                                </td>
                                <td className="py-1.5 pr-2 text-terminal-text-secondary">
                                    {blocksLeft !== undefined
                                        ? blocksLeft > 0n
                                            ? blocksToCountdown(blocksLeft)
                                            : 'Expired'
                                        : `blk ${opt.expiryBlock.toString()}`
                                    }
                                </td>
                                <td className="py-1.5 pr-2 text-terminal-text-secondary">
                                    {be !== null ? `${formatTokenAmount(be)} PILL` : '—'}
                                </td>
                                <td className="py-1.5">
                                    {isWriter ? (
                                        <span className="text-terminal-text-muted text-[10px]">Your listing</span>
                                    ) : (
                                        <button
                                            className={`px-2 py-0.5 text-xs rounded ${
                                                walletConnected
                                                    ? 'btn-primary'
                                                    : 'btn-secondary opacity-60'
                                            }`}
                                            onClick={() => walletConnected && onBuy?.(opt)}
                                            disabled={!walletConnected}
                                            title={walletConnected ? undefined : 'Connect wallet'}
                                            data-testid={`chain-buy-${opt.id}`}
                                        >
                                            Buy
                                        </button>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function AtmDivider({ spot }: { spot: number }) {
    return (
        <div
            className="col-span-full flex items-center gap-2 py-1"
            data-testid="atm-divider"
        >
            <hr className="flex-1 border-terminal-border-subtle" />
            <span className="text-accent text-xs font-mono font-semibold">
                ATM
            </span>
            <span className="text-terminal-text-muted text-[10px] font-mono">
                (spot: {spot.toFixed(2)})
            </span>
            <hr className="flex-1 border-terminal-border-subtle" />
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────

export function OptionsChain({
    options,
    walletHex,
    walletConnected = walletHex !== null,
    currentBlock,
    motoPillRatio,
    onBuy,
}: OptionsChainProps) {
    const [activeBucket, setActiveBucket] = useState<ExpiryBucket | 'all'>('all');
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [mobileType, setMobileType] = useState<'BOTH' | 'CALL' | 'PUT'>('BOTH');
    const [hintDismissed, setHintDismissed] = useState(false);

    const chain = useMemo(
        () => buildChain(options, currentBlock),
        [options, currentBlock],
    );

    // Fall back to 'all' if active bucket no longer has data
    const effectiveBucket = chain.activeBuckets.includes(activeBucket) ? activeBucket : 'all';
    const rows = useMemo(
        () => chain.buckets.get(effectiveBucket) ?? [],
        [chain, effectiveBucket],
    );

    const spot = motoPillRatio != null && motoPillRatio > 0 && !Number.isNaN(motoPillRatio)
        ? motoPillRatio
        : null;
    const atmIndex = useMemo(
        () => findAtmStrikeIndex(rows, spot),
        [rows, spot],
    );

    const toggleCell = useCallback((strike: bigint, type: 'call' | 'put') => {
        const key = `${strike}_${type}`;
        setExpandedKey((prev) => (prev === key ? null : key));
        setHintDismissed(true);
    }, []);

    const showCalls = mobileType !== 'PUT';
    const showPuts = mobileType !== 'CALL';

    return (
        <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="text-base font-bold text-terminal-text-primary font-mono">
                    Options Chain
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                    <MobileTypeToggle value={mobileType} onChange={setMobileType} />
                    <ExpiryTabs
                        buckets={chain.activeBuckets}
                        active={effectiveBucket}
                        onSelect={setActiveBucket}
                    />
                </div>
            </div>

            <hr className="border-terminal-border-subtle mb-3" />

            {/* Hint for multi-option cells — hides after first expand */}
            {rows.length > 0 && !hintDismissed && rows.some((r) => (r.call && r.call.depth > 1) || (r.put && r.put.depth > 1)) && (
                <p className="text-terminal-text-muted text-[11px] font-mono mb-2 text-center" data-testid="chain-hint">
                    Click a cell with multiple listings to expand and buy
                </p>
            )}

            {rows.length === 0 ? (
                <p
                    className="text-terminal-text-muted font-mono text-sm py-6 text-center"
                    data-testid="chain-empty"
                >
                    No open options in this expiry window.
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <ChainHeader mobileType={mobileType} />

                    {rows.map((row, idx) => {
                        const callItm = isCallItm(row.strikePrice, spot);
                        const putItm = isPutItm(row.strikePrice, spot);
                        const callExpanded = expandedKey === `${row.strikePrice}_call`;
                        const putExpanded = expandedKey === `${row.strikePrice}_put`;
                        const showAtm = atmIndex !== null && idx === atmIndex;
                        const callIsWriter = walletHex !== null && row.call !== null &&
                            row.call.options[0].writer.toLowerCase() === walletHex.toLowerCase();
                        const putIsWriter = walletHex !== null && row.put !== null &&
                            row.put.options[0].writer.toLowerCase() === walletHex.toLowerCase();

                        return (
                            <div key={row.strikePrice.toString()}>
                                {/* ATM divider before the ATM row */}
                                {showAtm && spot !== null && <AtmDivider spot={spot} />}

                                <div
                                    className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-terminal-border-subtle text-sm font-mono"
                                    data-testid={`chain-row-${row.strikePrice}`}
                                >
                                    {/* CALL side */}
                                    {showCalls ? (
                                        <ChainCellDisplay
                                            cell={row.call}
                                            side="call"
                                            isItm={callItm}
                                            isExpanded={callExpanded}
                                            isWriter={callIsWriter}
                                            walletConnected={walletConnected}
                                            onClick={() => row.call && toggleCell(row.strikePrice, 'call')}
                                            onBuy={onBuy}
                                        />
                                    ) : <div />}

                                    {/* Strike column */}
                                    <div className="px-4 text-center">
                                        <span className="text-terminal-text-primary font-semibold font-mono">
                                            {formatTokenAmount(row.strikePrice)}
                                        </span>
                                    </div>

                                    {/* PUT side */}
                                    {showPuts ? (
                                        <ChainCellDisplay
                                            cell={row.put}
                                            side="put"
                                            isItm={putItm}
                                            isExpanded={putExpanded}
                                            isWriter={putIsWriter}
                                            walletConnected={walletConnected}
                                            onClick={() => row.put && toggleCell(row.strikePrice, 'put')}
                                            onBuy={onBuy}
                                        />
                                    ) : <div />}
                                </div>

                                {/* Expanded listings */}
                                {callExpanded && row.call && (
                                    <ExpandedListings
                                        cell={row.call}
                                        side="call"
                                        walletHex={walletHex}
                                        walletConnected={walletConnected}
                                        currentBlock={currentBlock}
                                        onBuy={onBuy}
                                    />
                                )}
                                {putExpanded && row.put && (
                                    <ExpandedListings
                                        cell={row.put}
                                        side="put"
                                        walletHex={walletHex}
                                        walletConnected={walletConnected}
                                        currentBlock={currentBlock}
                                        onBuy={onBuy}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
