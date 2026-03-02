/**
 * OptionDetailPage — per-option deep view showing full details, PnL, Greeks,
 * transaction history, and action buttons.
 *
 * Route: /pools/:addr/options/:id
 */
import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useFallbackProvider } from '../hooks/useFallbackProvider.ts';
import { usePool } from '../hooks/usePool.ts';
import { useBlockTracker } from '../hooks/useBlockTracker.ts';
import { useWsBlock } from '../hooks/useWebSocketProvider.ts';
import { usePriceRatio } from '../hooks/usePriceRatio.ts';
import { formatTokenAmount, blocksToCountdown } from '../config/index.ts';
import { OptionType, OptionStatus } from '../services/types.ts';
import { calcBreakeven, calcYield, calcDelta, calcTheta, blocksToYears } from '../utils/optionMath.js';
import { getUserStatusLabel } from '../utils/statusLabels.ts';

const STATUS_LABELS: Record<number, string> = {
    [OptionStatus.OPEN]: 'OPEN',
    [OptionStatus.PURCHASED]: 'PURCHASED',
    [OptionStatus.EXERCISED]: 'EXERCISED',
    [OptionStatus.EXPIRED]: 'EXPIRED',
    [OptionStatus.CANCELLED]: 'CANCELLED',
};

const STATUS_COLORS: Record<number, string> = {
    [OptionStatus.OPEN]: 'text-green-400 border-green-500',
    [OptionStatus.PURCHASED]: 'text-cyan-300 border-cyan-400',
    [OptionStatus.EXERCISED]: 'text-orange-300 border-orange-400',
    [OptionStatus.EXPIRED]: 'text-gray-400 border-gray-600',
    [OptionStatus.CANCELLED]: 'text-rose-500 border-rose-700',
};

function fmt(v: bigint): string {
    return formatTokenAmount(v);
}

export function OptionDetailPage() {
    const { addr, id } = useParams<{ addr: string; id: string }>();
    const wsBlock = useWsBlock();
    const { address } = useWalletConnect();
    const readProvider = useFallbackProvider();
    const walletHex = address ? address.toString() : null;

    const { poolInfo, options, loading, error } = usePool(addr ?? null, readProvider);
    const { currentBlock } = useBlockTracker(readProvider, wsBlock);

    const { motoPillRatio } = usePriceRatio(null, null, null, null, null);

    const option = useMemo(() => {
        if (!id || !options) return null;
        return options.find((o) => o.id.toString() === id) ?? null;
    }, [options, id]);

    const greeks = useMemo(() => {
        if (!option || !motoPillRatio || motoPillRatio <= 0 || !currentBlock) return null;
        const blocksLeft = Number(option.expiryBlock - currentBlock);
        if (blocksLeft <= 0) return null;
        const timeYears = blocksToYears(blocksLeft);
        const strike = Number(option.strikePrice) / 1e18;
        const params = {
            spot: motoPillRatio,
            strike,
            timeYears,
            volatility: 0.8,
            optionType: option.optionType,
        };
        return { delta: calcDelta(params), theta: calcTheta(params) };
    }, [option, motoPillRatio, currentBlock]);

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-terminal-bg-elevated rounded w-48" />
                    <div className="h-48 bg-terminal-bg-elevated rounded" />
                </div>
            </div>
        );
    }

    if (error || !option || !poolInfo) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-16 text-center">
                <p className="text-rose-400 font-mono text-sm mb-4">
                    {error ?? 'Option not found.'}
                </p>
                <Link to="/pools" className="btn-secondary px-4 py-2 text-sm rounded inline-block">
                    Back to Pools
                </Link>
            </div>
        );
    }

    const isCall = option.optionType === OptionType.CALL;
    const typeLabel = isCall ? 'CALL' : 'PUT';
    const typeColor = isCall ? 'text-green-400' : 'text-rose-400';
    const breakeven = calcBreakeven(option);
    const yieldPct = calcYield(option);
    const statusLabel = walletHex ? getUserStatusLabel(option, walletHex) : STATUS_LABELS[option.status];
    const statusColor = STATUS_COLORS[option.status] ?? 'text-gray-400 border-gray-600';
    const blocksLeft = currentBlock ? option.expiryBlock - currentBlock : null;

    return (
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
            {/* Breadcrumb */}
            <nav className="text-xs font-mono text-terminal-text-muted flex items-center gap-1" data-testid="breadcrumb">
                <Link to="/pools" className="hover:text-terminal-text-primary transition-colors">Pools</Link>
                <span>/</span>
                <Link to="/pools" className="hover:text-terminal-text-primary transition-colors">
                    {addr ? `${addr.slice(0, 8)}...` : 'Pool'}
                </Link>
                <span>/</span>
                <span className="text-terminal-text-primary">Option #{id}</span>
            </nav>

            {/* Header */}
            <div className="flex items-center gap-4">
                <h1 className="text-xl font-bold font-mono text-terminal-text-primary">
                    Option <span className="text-terminal-text-muted">#{id}</span>
                </h1>
                <span className={`font-mono font-bold text-lg ${typeColor}`}>{typeLabel}</span>
                <span className={`px-2 py-0.5 text-xs font-mono rounded border ${statusColor}`}>
                    {statusLabel}
                </span>
            </div>

            {/* Main detail card */}
            <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-6 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm font-mono">
                    <div>
                        <p className="text-[10px] text-terminal-text-muted">Strike Price</p>
                        <p className="text-terminal-text-primary">{fmt(option.strikePrice)} PILL</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-terminal-text-muted">Premium</p>
                        <p className="text-terminal-text-primary">{fmt(option.premium)} PILL</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-terminal-text-muted">Amount</p>
                        <p className="text-terminal-text-primary">{fmt(option.underlyingAmount)} MOTO</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-terminal-text-muted">Expiry</p>
                        <p className="text-terminal-text-primary">
                            {blocksLeft !== null && blocksLeft > 0n
                                ? blocksToCountdown(blocksLeft)
                                : 'Expired'}
                            <span className="text-terminal-text-muted ml-1 text-xs">
                                (block {option.expiryBlock.toString()})
                            </span>
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] text-terminal-text-muted">Breakeven</p>
                        <p className="text-cyan-300">
                            {breakeven !== null ? `${fmt(breakeven)} PILL` : '—'}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] text-terminal-text-muted">Yield</p>
                        <p className="text-terminal-text-primary">
                            {yieldPct !== null ? `${yieldPct.toFixed(2)}%` : '—'}
                        </p>
                    </div>
                </div>

                {/* Greeks */}
                {greeks && (
                    <div className="border-t border-terminal-border-subtle pt-3">
                        <p className="text-[10px] text-terminal-text-muted mb-2">Greeks</p>
                        <div className="flex gap-6 text-sm font-mono">
                            <span>
                                Delta: <span className="text-terminal-text-secondary">{greeks.delta.toFixed(3)}</span>
                            </span>
                            <span>
                                Theta: <span className="text-terminal-text-secondary">{greeks.theta.toFixed(4)}/day</span>
                            </span>
                        </div>
                    </div>
                )}

                {/* Addresses */}
                <div className="border-t border-terminal-border-subtle pt-3 text-xs font-mono space-y-1">
                    <div className="flex justify-between">
                        <span className="text-terminal-text-muted">Writer</span>
                        <span className="text-terminal-text-secondary" title={option.writer}>
                            {option.writer.slice(0, 10)}...{option.writer.slice(-8)}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-terminal-text-muted">Buyer</span>
                        <span className="text-terminal-text-secondary" title={option.buyer}>
                            {option.buyer === '0x' + '0'.repeat(64)
                                ? 'None'
                                : `${option.buyer.slice(0, 10)}...${option.buyer.slice(-8)}`}
                        </span>
                    </div>
                </div>
            </div>

            {/* Back link */}
            <Link
                to="/pools"
                className="btn-secondary px-4 py-2 text-sm rounded inline-block"
            >
                Back to Pools
            </Link>
        </div>
    );
}
