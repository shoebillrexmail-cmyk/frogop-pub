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
    calcWritePutParams,
    type WriteOptionInitialValues,
} from '../utils/strategyMath.js';
import { formatTokenAmount } from '../config/index.ts';

interface QuickStrategiesProps {
    poolInfo: PoolInfo;
    options: OptionData[];
    motoPillRatio: number | null;
    motoBal: number | null;
    walletConnected?: boolean;
    onCoveredCall: (values: WriteOptionInitialValues) => void;
    onProtectivePut: (option: OptionData) => void;
    onWritePut?: (values: WriteOptionInitialValues) => void;
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
    action,
}: {
    title: string;
    tagline: string;
    disabled: boolean;
    testId: string;
    children: React.ReactNode;
    action: React.ReactNode;
}) {
    return (
        <div
            className={`flex flex-col bg-terminal-bg-elevated border rounded-xl p-4 gap-3 ${
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
            <div className="flex-1">{children}</div>
            <div className="mt-auto">{action}</div>
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
    walletConnected = true,
    onCoveredCall,
    onProtectivePut,
    onWritePut,
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
                action={
                    <button
                        onClick={() => coveredCall && onCoveredCall(coveredCall)}
                        disabled={noPrice || !coveredCall || !walletConnected}
                        className="w-full btn-primary py-2 text-xs font-mono rounded disabled:opacity-50"
                        data-testid="strategy-covered-call-btn"
                    >
                        {walletConnected ? 'Use Strategy' : 'Connect wallet to trade'}
                    </button>
                }
            >
                <p className="text-[10px] text-gray-500 font-mono">120% of spot (OTM)</p>
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
                        <p className="text-[10px] text-terminal-text-muted mt-1">Max profit: premium + appreciation to strike</p>
                    </div>
                ) : null}
            </StrategyCard>

            {/* Protective Put */}
            <StrategyCard
                title="Protective Put"
                tagline="Insure your MOTO"
                disabled={noPrice}
                testId="strategy-protective-put"
                action={
                    <div className="space-y-2">
                        {/* Buy Put — always visible, disabled when no put or no wallet */}
                        <button
                            onClick={() => bestPut && onProtectivePut(bestPut)}
                            disabled={noPrice || !bestPut || !walletConnected}
                            className="w-full btn-secondary py-2 text-xs font-mono rounded disabled:opacity-50"
                            data-testid="strategy-protective-put-btn"
                        >
                            {!walletConnected ? 'Connect wallet to trade' : bestPut ? 'Buy Put' : 'No puts available'}
                        </button>
                        {/* Write a Put — always visible when onWritePut provided */}
                        {onWritePut && (
                            <button
                                onClick={() => {
                                    const params = calcWritePutParams(motoPillRatio!, motoBal);
                                    if (params) onWritePut(params);
                                }}
                                disabled={noPrice || !walletConnected}
                                className="w-full btn-outline py-2 text-xs font-mono rounded border border-terminal-border-subtle hover:border-accent/50 disabled:opacity-50 transition-colors"
                                data-testid="strategy-write-put-btn"
                            >
                                {!walletConnected ? 'Connect wallet to write' : 'Write a Put — Earn premium'}
                            </button>
                        )}
                    </div>
                }
            >
                <p className="text-[10px] text-gray-500 font-mono">80–95% of spot (OTM)</p>
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
                        <p className="text-[10px] text-terminal-text-muted">
                            Protects your MOTO if price drops below {formatTokenAmount(bestPut.strikePrice)} PILL
                        </p>
                        <p className="text-[10px] text-terminal-text-muted">Max loss: premium paid</p>
                    </div>
                ) : (
                    <p className="text-xs text-terminal-text-muted font-mono">
                        No puts in the 80–95% range yet — write one to seed liquidity.
                    </p>
                )}
            </StrategyCard>

            {/* Collar */}
            <StrategyCard
                title="Collar"
                tagline="Lock in a price range"
                disabled={noPrice}
                testId="strategy-collar"
                action={
                    <button
                        onClick={onCollar}
                        disabled={noPrice || !collar || !walletConnected}
                        className="w-full btn-secondary py-2 text-xs font-mono rounded disabled:opacity-50"
                        data-testid="strategy-collar-btn"
                    >
                        {walletConnected ? 'Setup Collar' : 'Connect wallet to trade'}
                    </button>
                }
            >
                <p className="text-[10px] text-gray-500 font-mono">CALL 120% / PUT 80%</p>
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
                            <span className={collar.netPremiumDisplay.startsWith('+') ? 'text-green-400' : 'text-amber-400'}>
                                {collar.netPremiumDisplay} PILL
                            </span>
                        </div>
                    </div>
                ) : null}
            </StrategyCard>
        </div>
    );
}
