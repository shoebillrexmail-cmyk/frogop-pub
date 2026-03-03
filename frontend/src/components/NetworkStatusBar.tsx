/**
 * NetworkStatusBar — live network status indicator in footer.
 *
 * Desktop: ● #3670 | Fee: 1.5/2.0/3.0 sat/vB | Mempool: 2,813 (1,397 OPNet) | Next block: ~4:32 [====------]
 * Mobile:  ● #3670 | Fee: 2.0 sat/vB | ~4:32
 */
import { useNetworkStatus } from '../hooks/useNetworkStatus.ts';
import { formatFeeRate, formatNumber, formatCountdown } from '../utils/networkFormat.ts';

export function NetworkStatusBar() {
    const {
        btcFees,
        mempoolInfo,
        secondsSinceLastBlock,
        estimatedSecondsToNext,
        progressPercent,
        wsConnected,
        blockNumber,
    } = useNetworkStatus();

    const hasData = blockNumber !== null || btcFees !== null;
    const overdue = estimatedSecondsToNext === 0 && secondsSinceLastBlock > 0;

    if (!hasData) {
        return (
            <div
                className="font-mono text-xs text-terminal-text-muted bg-terminal-bg-elevated px-4 py-1.5 flex items-center gap-3"
                data-testid="network-status-bar"
            >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                <span className="h-3 w-48 bg-terminal-border-subtle rounded animate-pulse" />
            </div>
        );
    }

    return (
        <div
            className="font-mono text-xs text-terminal-text-muted bg-terminal-bg-elevated px-4 py-1.5 flex items-center gap-3"
            data-testid="network-status-bar"
        >
            {/* Connection + block number */}
            <span className="flex items-center gap-1.5" data-testid="ns-block">
                <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-green-400' : 'bg-rose-400'}`} />
                {blockNumber !== null && `#${blockNumber.toString()}`}
            </span>

            {/* BTC fee estimates */}
            {btcFees && (
                <>
                    <span className="border-l border-terminal-border-subtle h-3" />
                    <span data-testid="ns-fee">
                        <span className="hidden md:inline">
                            Fee: {formatFeeRate(btcFees.low)} / {formatFeeRate(btcFees.medium)} / {formatFeeRate(btcFees.high)}
                        </span>
                        <span className="md:hidden">
                            Fee: {formatFeeRate(btcFees.medium)}
                        </span>
                    </span>
                </>
            )}

            {/* Mempool stats — desktop only */}
            {mempoolInfo && (
                <>
                    <span className="hidden md:inline border-l border-terminal-border-subtle h-3" />
                    <span className="hidden md:inline" data-testid="ns-mempool">
                        Mempool: {formatNumber(mempoolInfo.count)} ({formatNumber(mempoolInfo.opnetCount)} OPNet)
                    </span>
                </>
            )}

            {/* Next block countdown */}
            {blockNumber !== null && (
                <>
                    <span className="border-l border-terminal-border-subtle h-3" />
                    <span
                        className={`flex items-center gap-2 ${overdue ? 'text-amber-400' : ''}`}
                        data-testid="ns-countdown"
                    >
                        <span className="hidden md:inline">Next block: </span>
                        <span>~{formatCountdown(estimatedSecondsToNext)}</span>
                        {/* Mini progress bar */}
                        <span className="hidden md:inline w-16 h-0.5 bg-terminal-border-subtle rounded overflow-hidden">
                            <span
                                className={`block h-full rounded ${overdue ? 'bg-amber-400' : 'bg-accent'}`}
                                style={{ width: `${progressPercent}%` }}
                            />
                        </span>
                    </span>
                </>
            )}
        </div>
    );
}
