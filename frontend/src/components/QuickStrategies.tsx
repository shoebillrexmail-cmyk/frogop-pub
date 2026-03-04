/**
 * QuickStrategies — four writer-focused strategy template cards for the Write tab.
 *
 * Covered Call, Collar, Write Protective Put, and Write Custom. Each drives existing modals.
 * Protective Put (buy-side) has been moved to the Buy tab as an inline card.
 */
import { useMemo } from 'react';
import type { PoolInfo } from '../services/types.ts';
import {
    calcCoveredCallParams,
    calcCollarParams,
    calcWritePutParams,
    type WriteOptionInitialValues,
} from '../utils/strategyMath.js';

interface QuickStrategiesProps {
    poolInfo: PoolInfo;
    motoPillRatio: number | null;
    motoBal: number | null;
    walletConnected?: boolean;
    underlyingSymbol?: string;
    premiumSymbol?: string;
    onCoveredCall: (values: WriteOptionInitialValues) => void;
    onWritePut: (values: WriteOptionInitialValues) => void;
    onCollar: () => void;
    onWriteCustom: () => void;
}

// ---------------------------------------------------------------------------
// Shared card shell
// ---------------------------------------------------------------------------

function StrategyCard({
    title,
    tagline,
    tooltip,
    disabled,
    testId,
    children,
    action,
}: {
    title: string;
    tagline: string;
    tooltip?: string;
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
                <div className="flex items-center gap-1">
                    <h4 className="text-sm font-bold text-terminal-text-primary font-mono">{title}</h4>
                    {tooltip && (
                        <span
                            className="text-terminal-text-muted text-xs cursor-help"
                            title={tooltip}
                            aria-label={tooltip}
                        >
                            ?
                        </span>
                    )}
                </div>
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
    motoPillRatio,
    motoBal,
    walletConnected = true,
    underlyingSymbol = 'MOTO',
    premiumSymbol = 'PILL',
    onCoveredCall,
    onWritePut,
    onCollar,
    onWriteCustom,
}: QuickStrategiesProps) {
    const noPrice = motoPillRatio === null || motoPillRatio <= 0;

    const coveredCall = useMemo(
        () => (noPrice ? null : calcCoveredCallParams(motoPillRatio, motoBal)),
        [noPrice, motoPillRatio, motoBal],
    );

    const collar = useMemo(
        () => (noPrice ? null : calcCollarParams(motoPillRatio, motoBal)),
        [noPrice, motoPillRatio, motoBal],
    );

    const writePut = useMemo(
        () => (noPrice ? null : calcWritePutParams(motoPillRatio, motoBal)),
        [noPrice, motoPillRatio, motoBal],
    );

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Covered Call */}
            <StrategyCard
                title="Covered Call"
                tagline={`Earn on ${underlyingSymbol} you hold`}
                tooltip="Write a CALL above the current price. You earn premium upfront but cap your upside if the price rises past the strike."
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
                            <span className="text-terminal-text-secondary">{coveredCall.strikeStr} {premiumSymbol} (120%)</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Est. premium</span>
                            <span className="text-green-400">{coveredCall.premiumStr} {premiumSymbol}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Duration</span>
                            <span className="text-terminal-text-secondary">30 days</span>
                        </div>
                        <p className="text-[10px] text-terminal-text-muted mt-1">Max profit: premium + appreciation to strike</p>
                    </div>
                ) : null}
            </StrategyCard>

            {/* Collar */}
            <StrategyCard
                title="Collar"
                tagline="Hedge + earn"
                tooltip="Combine a Covered Call (earn premium) and Protective Put (buy protection). Limits both upside and downside — often zero or near-zero net cost."
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
                            <span className="text-green-400">{collar.callLeg.strikeStr} {premiumSymbol}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Buy PUT</span>
                            <span className="text-rose-400">{collar.putStrikeStr} {premiumSymbol}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Net premium</span>
                            <span className={collar.netPremiumDisplay.startsWith('+') ? 'text-green-400' : 'text-amber-400'}>
                                {collar.netPremiumDisplay} {premiumSymbol}
                            </span>
                        </div>
                    </div>
                ) : null}
            </StrategyCard>

            {/* Write Protective Put */}
            <StrategyCard
                title="Write Protective Put"
                tagline="Supply downside protection"
                tooltip={`Write a PUT at 87.5% of spot. Earn premium from buyers hedging their ${underlyingSymbol}. Your collateral (${premiumSymbol}) is locked until expiry.`}
                disabled={noPrice}
                testId="strategy-write-put"
                action={
                    <button
                        onClick={() => writePut && onWritePut(writePut)}
                        disabled={noPrice || !writePut || !walletConnected}
                        className="w-full btn-primary py-2 text-xs font-mono rounded disabled:opacity-50"
                        data-testid="strategy-write-put-btn"
                    >
                        {walletConnected ? 'Write Put' : 'Connect wallet to trade'}
                    </button>
                }
            >
                <p className="text-[10px] text-gray-500 font-mono">87.5% of spot (OTM)</p>
                {noPrice ? (
                    <p className="text-xs text-terminal-text-muted font-mono">Price data unavailable</p>
                ) : writePut ? (
                    <div className="text-xs font-mono space-y-1">
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Strike</span>
                            <span className="text-terminal-text-secondary">{writePut.strikeStr} {premiumSymbol} (87.5%)</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Est. premium</span>
                            <span className="text-green-400">{writePut.premiumStr} {premiumSymbol}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Duration</span>
                            <span className="text-terminal-text-secondary">30 days</span>
                        </div>
                    </div>
                ) : null}
            </StrategyCard>

            {/* Write Custom */}
            <StrategyCard
                title="Write Custom"
                tagline="Full control"
                tooltip="Write any option with custom parameters — choose your own strike, amount, premium, and expiry."
                disabled={false}
                testId="strategy-write-custom"
                action={
                    <button
                        onClick={onWriteCustom}
                        disabled={!walletConnected}
                        className="w-full btn-primary py-2 text-xs font-mono rounded disabled:opacity-50"
                        data-testid="strategy-write-custom-btn"
                    >
                        {walletConnected ? 'Write Option' : 'Connect wallet to write'}
                    </button>
                }
            >
                <div className="text-xs font-mono space-y-1">
                    <p className="text-terminal-text-muted">Set your own terms:</p>
                    <ul className="text-terminal-text-muted space-y-0.5 ml-2">
                        <li>Any strike price</li>
                        <li>Any amount & premium</li>
                        <li>CALL or PUT</li>
                    </ul>
                </div>
            </StrategyCard>
        </div>
    );
}
