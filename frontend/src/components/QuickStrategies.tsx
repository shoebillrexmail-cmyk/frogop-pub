/**
 * QuickStrategies — three strategy template cards for the Pools page.
 *
 * Covered Call, Protective Put, and Collar. Each computes suggested parameters
 * from the current MOTO/PILL spot price and drives existing modals.
 */
import { useMemo } from 'react';
import type { OptionData, PoolInfo } from '../services/types.ts';
import {
    calcCoveredCallParams,
    findBestProtectivePut,
    calcCollarParams,
    type WriteOptionInitialValues,
} from '../utils/strategyMath.js';
import { formatTokenAmount } from '../config/index.ts';

interface QuickStrategiesProps {
    poolInfo: PoolInfo;
    options: OptionData[];
    motoPillRatio: number | null;
    motoBal: number | null;
    onCoveredCall: (values: WriteOptionInitialValues) => void;
    onProtectivePut: (option: OptionData) => void;
    onCollar: () => void;
}

// ---------------------------------------------------------------------------
// Shared card shell
// ---------------------------------------------------------------------------

function StrategyCard({
    title,
    tagline,
    disabled,
    testId,
    children,
}: {
    title: string;
    tagline: string;
    disabled: boolean;
    testId: string;
    children: React.ReactNode;
}) {
    return (
        <div
            className={`bg-terminal-bg-elevated border rounded-xl p-4 space-y-3 ${
                disabled
                    ? 'border-terminal-border-subtle opacity-60'
                    : 'border-terminal-border-subtle hover:border-accent/50 transition-colors'
            }`}
            data-testid={testId}
        >
            <div>
                <h4 className="text-sm font-bold text-terminal-text-primary font-mono">{title}</h4>
                <p className="text-xs text-terminal-text-muted font-mono">{tagline}</p>
            </div>
            {children}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function QuickStrategies({
    options,
    motoPillRatio,
    motoBal,
    onCoveredCall,
    onProtectivePut,
    onCollar,
}: QuickStrategiesProps) {
    const noPrice = motoPillRatio === null || motoPillRatio <= 0;

    const coveredCall = useMemo(
        () => (noPrice ? null : calcCoveredCallParams(motoPillRatio, motoBal)),
        [noPrice, motoPillRatio, motoBal],
    );

    const bestPut = useMemo(
        () => (noPrice ? null : findBestProtectivePut(options, motoPillRatio)),
        [noPrice, options, motoPillRatio],
    );

    const collar = useMemo(
        () => (noPrice ? null : calcCollarParams(motoPillRatio, motoBal)),
        [noPrice, motoPillRatio, motoBal],
    );

    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Covered Call */}
            <StrategyCard
                title="Covered Call"
                tagline="Earn yield on MOTO"
                disabled={noPrice}
                testId="strategy-covered-call"
            >
                {noPrice ? (
                    <p className="text-xs text-terminal-text-muted font-mono">Price data unavailable</p>
                ) : coveredCall ? (
                    <div className="text-xs font-mono space-y-1">
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Strike</span>
                            <span className="text-terminal-text-secondary">{coveredCall.strikeStr} PILL (120%)</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Est. premium</span>
                            <span className="text-green-400">{coveredCall.premiumStr} PILL</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Duration</span>
                            <span className="text-terminal-text-secondary">30 days</span>
                        </div>
                    </div>
                ) : null}
                <button
                    onClick={() => coveredCall && onCoveredCall(coveredCall)}
                    disabled={noPrice || !coveredCall}
                    className="w-full btn-primary py-2 text-xs font-mono rounded disabled:opacity-50"
                    data-testid="strategy-covered-call-btn"
                >
                    Use Strategy
                </button>
            </StrategyCard>

            {/* Protective Put */}
            <StrategyCard
                title="Protective Put"
                tagline="Insure your MOTO"
                disabled={noPrice}
                testId="strategy-protective-put"
            >
                {noPrice ? (
                    <p className="text-xs text-terminal-text-muted font-mono">Price data unavailable</p>
                ) : bestPut ? (
                    <div className="text-xs font-mono space-y-1">
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Strike</span>
                            <span className="text-terminal-text-secondary">{formatTokenAmount(bestPut.strikePrice)} PILL</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Premium</span>
                            <span className="text-rose-400">{formatTokenAmount(bestPut.premium)} PILL</span>
                        </div>
                        <p className="text-[10px] text-terminal-text-muted">Best available put (80–95% range)</p>
                    </div>
                ) : (
                    <p className="text-xs text-terminal-text-muted font-mono">
                        No suitable puts available (80–95% range)
                    </p>
                )}
                <button
                    onClick={() => bestPut && onProtectivePut(bestPut)}
                    disabled={noPrice || !bestPut}
                    className="w-full btn-secondary py-2 text-xs font-mono rounded disabled:opacity-50"
                    data-testid="strategy-protective-put-btn"
                >
                    Buy Put
                </button>
            </StrategyCard>

            {/* Collar */}
            <StrategyCard
                title="Collar"
                tagline="Lock in a price range"
                disabled={noPrice}
                testId="strategy-collar"
            >
                {noPrice ? (
                    <p className="text-xs text-terminal-text-muted font-mono">Price data unavailable</p>
                ) : collar ? (
                    <div className="text-xs font-mono space-y-1">
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Write CALL</span>
                            <span className="text-green-400">{collar.callLeg.strikeStr} PILL</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Buy PUT</span>
                            <span className="text-rose-400">{collar.putStrikeStr} PILL</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Net premium</span>
                            <span className="text-terminal-text-primary">{collar.netPremiumDisplay} PILL</span>
                        </div>
                    </div>
                ) : null}
                <button
                    onClick={onCollar}
                    disabled={noPrice || !collar}
                    className="w-full btn-secondary py-2 text-xs font-mono rounded disabled:opacity-50"
                    data-testid="strategy-collar-btn"
                >
                    Setup Collar
                </button>
            </StrategyCard>
        </div>
    );
}
