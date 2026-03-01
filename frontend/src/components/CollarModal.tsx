/**
 * CollarModal — two-step collar strategy orchestration.
 *
 * Planning/guide modal that does NOT execute transactions itself.
 * Step 1: Write CALL at 120% spot → opens WriteOptionPanel
 * Step 2: Buy PUT at 80% spot → opens BuyOptionModal with best matching put
 */
import { useState, useMemo } from 'react';
import type { OptionData, PoolInfo } from '../services/types.ts';
import {
    calcCollarParams,
    findBestProtectivePut,
    type WriteOptionInitialValues,
} from '../utils/strategyMath.js';
import { formatTokenAmount } from '../config/index.ts';

interface CollarModalProps {
    poolInfo: PoolInfo;
    options: OptionData[];
    motoPillRatio: number | null;
    motoBal: number | null;
    onWriteCall: (values: WriteOptionInitialValues) => void;
    onBuyPut: (option: OptionData) => void;
    onClose: () => void;
}

export function CollarModal({
    options,
    motoPillRatio,
    motoBal,
    onWriteCall,
    onBuyPut,
    onClose,
}: CollarModalProps) {
    const [callDone, setCallDone] = useState(false);
    const [putDone, setPutDone] = useState(false);

    const collar = useMemo(
        () => (motoPillRatio && motoPillRatio > 0 ? calcCollarParams(motoPillRatio, motoBal) : null),
        [motoPillRatio, motoBal],
    );

    const bestPut = useMemo(
        () => (motoPillRatio && motoPillRatio > 0 ? findBestProtectivePut(options, motoPillRatio) : null),
        [options, motoPillRatio],
    );

    function handleWriteCall() {
        if (!collar) return;
        setCallDone(true);
        onWriteCall(collar.callLeg);
    }

    function handleBuyPut() {
        if (!bestPut) return;
        setPutDone(true);
        onBuyPut(bestPut);
    }

    const allDone = callDone && putDone;

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            data-testid="collar-modal-backdrop"
        >
            <div
                className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl w-full max-w-md shadow-2xl"
                data-testid="collar-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-terminal-text-primary font-mono">
                            Collar Strategy
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-terminal-text-muted hover:text-terminal-text-primary text-xl leading-none"
                            aria-label="Close modal"
                        >
                            ✕
                        </button>
                    </div>

                    <hr className="border-terminal-border-subtle" />

                    <p className="text-xs text-terminal-text-muted font-mono">
                        Write a CALL to earn premium, then buy a PUT for downside protection.
                        Net premium shows what you earn (or pay) after both legs.
                    </p>

                    {/* Net premium */}
                    {collar && (
                        <div
                            className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3 text-xs font-mono"
                            data-testid="collar-net-premium"
                        >
                            <div className="flex justify-between">
                                <span className="text-terminal-text-muted">Net premium</span>
                                <span className="text-terminal-text-primary font-semibold">
                                    {collar.netPremiumDisplay} PILL
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Step 1: Write CALL */}
                    <div
                        className={`border rounded-lg p-4 space-y-2 ${
                            callDone
                                ? 'border-green-700 bg-green-900/10'
                                : 'border-terminal-border-subtle'
                        }`}
                        data-testid="collar-step-1"
                    >
                        <div className="flex items-center gap-2">
                            <span className={`text-xs font-mono font-bold ${callDone ? 'text-green-400' : 'text-terminal-text-muted'}`}>
                                {callDone ? '✓ Step 1' : 'Step 1'}
                            </span>
                            <span className="text-xs font-mono text-terminal-text-primary">
                                Write CALL
                            </span>
                        </div>
                        {collar && (
                            <div className="text-xs font-mono space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-terminal-text-muted">Strike</span>
                                    <span className="text-green-400">{collar.callLeg.strikeStr} PILL (120%)</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-terminal-text-muted">Est. premium earned</span>
                                    <span className="text-green-400">{collar.callLeg.premiumStr} PILL</span>
                                </div>
                            </div>
                        )}
                        {callDone ? (
                            <p className="text-xs text-green-400 font-mono">Done — CALL written</p>
                        ) : (
                            <button
                                onClick={handleWriteCall}
                                disabled={!collar}
                                className="w-full btn-primary py-2 text-xs font-mono rounded disabled:opacity-50"
                                data-testid="collar-write-call-btn"
                            >
                                Write CALL
                            </button>
                        )}
                    </div>

                    {/* Step 2: Buy PUT */}
                    <div
                        className={`border rounded-lg p-4 space-y-2 ${
                            putDone
                                ? 'border-green-700 bg-green-900/10'
                                : 'border-terminal-border-subtle'
                        }`}
                        data-testid="collar-step-2"
                    >
                        <div className="flex items-center gap-2">
                            <span className={`text-xs font-mono font-bold ${putDone ? 'text-green-400' : 'text-terminal-text-muted'}`}>
                                {putDone ? '✓ Step 2' : 'Step 2'}
                            </span>
                            <span className="text-xs font-mono text-terminal-text-primary">
                                Buy PUT
                            </span>
                        </div>
                        {collar && (
                            <div className="text-xs font-mono space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-terminal-text-muted">Target strike</span>
                                    <span className="text-rose-400">{collar.putStrikeStr} PILL (80%)</span>
                                </div>
                                {bestPut ? (
                                    <div className="flex justify-between">
                                        <span className="text-terminal-text-muted">Best available</span>
                                        <span className="text-terminal-text-secondary">
                                            #{bestPut.id.toString()} — {formatTokenAmount(bestPut.premium)} PILL
                                        </span>
                                    </div>
                                ) : (
                                    <p className="text-[10px] text-terminal-text-muted">
                                        No suitable open PUTs in 80–95% range
                                    </p>
                                )}
                            </div>
                        )}
                        {putDone ? (
                            <p className="text-xs text-green-400 font-mono">Done — PUT purchased</p>
                        ) : (
                            <button
                                onClick={handleBuyPut}
                                disabled={!bestPut}
                                className="w-full btn-secondary py-2 text-xs font-mono rounded disabled:opacity-50"
                                data-testid="collar-buy-put-btn"
                            >
                                Buy PUT
                            </button>
                        )}
                    </div>

                    {/* Completion */}
                    {allDone && (
                        <div className="bg-green-900/20 border border-green-700 rounded p-3 text-xs font-mono text-center">
                            <p className="text-green-300">Collar strategy complete!</p>
                            <button
                                onClick={onClose}
                                className="mt-2 btn-primary px-4 py-1.5 text-xs rounded"
                            >
                                Done
                            </button>
                        </div>
                    )}

                    {/* Close button */}
                    {!allDone && (
                        <button
                            onClick={onClose}
                            className="w-full btn-secondary py-2 text-sm rounded"
                        >
                            Close
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
