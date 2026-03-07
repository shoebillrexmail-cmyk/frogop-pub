/**
 * TradeConfigurator — Step 3 of the Trade wizard.
 *
 * Shows applicable strategies for the selected intent + market,
 * lets the user configure and execute via existing modals.
 */
import { useState, useMemo } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useFallbackProvider } from '../hooks/useFallbackProvider.ts';
import { usePool } from '../hooks/usePool.ts';
import { usePriceRatio } from '../hooks/usePriceRatio.ts';
import { useBlockTracker } from '../hooks/useBlockTracker.ts';
import { useWsBlock } from '../hooks/useWebSocketProvider.ts';
import { getIntentById } from '../utils/intentDefs.ts';
import type { IntentId } from '../utils/intentDefs.ts';
import type { StrategyType, StrategyOutcome } from '../utils/strategyMath.ts';
import { findBestProtectivePut, countOpenOptionsForStrategy } from '../utils/strategyMath.ts';
import { findPoolConfigByAddress, getPoolType, getPricePairKey, getNativeSwapAddress, premiumDisplayUnit, formatTokenAmount } from '../config/index.ts';
import type { OptionData } from '../services/types.ts';
import { OutcomeCard } from './OutcomeCard.tsx';
import { StrategyConfigurator } from './StrategyConfigurator.tsx';
import { WriteOptionPanel } from './WriteOptionPanel.tsx';
import type { WriteOptionInitialValues } from './WriteOptionPanel.tsx';
import { BuyOptionModal } from './BuyOptionModal.tsx';
import { StrategySection } from './StrategySection.tsx';

const STRATEGY_LABELS: Record<StrategyType, string> = {
    'covered-call': 'Earn on Tokens You Hold',
    'write-put': 'Earn by Offering to Buy',
    'protective-put': 'Buy Downside Protection',
    'collar': 'Earn on Both Directions',
    'bull-call-spread': 'Bet on Price Rise',
    'bear-put-spread': 'Bet on Price Drop',
};

const STRATEGY_TAGLINES: Record<StrategyType, string> = {
    'covered-call': 'List your tokens at a sell price — earn a fee when someone takes the listing',
    'write-put': 'Post an offer to buy at a lower price — earn a fee when someone takes it',
    'protective-put': 'Buy insurance from another user to protect against price drops',
    'collar': 'List both sell-above and buy-below offers to earn fees from both sides',
    'bull-call-spread': 'Profit from a moderate price rise with capped risk and gain',
    'bear-put-spread': 'Profit from a moderate price drop with capped risk and gain',
};

const STRATEGY_RISK: Record<StrategyType, 'low' | 'medium' | 'high'> = {
    'covered-call': 'low',
    'write-put': 'low',
    'protective-put': 'low',
    'collar': 'medium',
    'bull-call-spread': 'high',
    'bear-put-spread': 'high',
};

const MULTI_LEG: Set<StrategyType> = new Set(['collar', 'bull-call-spread', 'bear-put-spread']);
const BUY_SIDE: Set<StrategyType> = new Set(['protective-put']);

interface TradeConfiguratorProps {
    intentId: IntentId;
    poolAddress: string;
}

export function TradeConfigurator({ intentId, poolAddress }: TradeConfiguratorProps) {
    const intent = getIntentById(intentId);
    const { walletAddress, address, provider, network } = useWalletConnect();
    const readProvider = useFallbackProvider();
    const wsBlockInfo = useWsBlock();
    const walletConnected = !!provider;

    const { poolInfo, options, loading, error, refetch } = usePool(poolAddress, readProvider);
    const { currentBlock } = useBlockTracker(readProvider, wsBlockInfo?.blockNumber);

    const poolConfig = useMemo(() => findPoolConfigByAddress(poolAddress), [poolAddress]);
    const underlyingSymbol = poolConfig?.underlying.symbol ?? 'MOTO';
    const premiumSymbol = poolConfig?.premium.symbol ?? 'PILL';
    const poolType = getPoolType(poolConfig);
    const pairKey = poolConfig ? getPricePairKey(poolConfig) : `${underlyingSymbol}_${premiumSymbol}`;
    const nativeSwapAddress = useMemo(() => getNativeSwapAddress(poolConfig), [poolConfig]);

    const { motoPillRatio } = usePriceRatio(
        pairKey,
        nativeSwapAddress,
        poolInfo?.underlying ?? null,
        poolInfo?.premiumToken ?? null,
        readProvider,
        network ?? null,
    );

    const walletHex = address ? address.toString() : null;

    const [selectedStrategy, setSelectedStrategy] = useState<StrategyType | null>(null);
    const [writeOpen, setWriteOpen] = useState(false);
    const [writeInitialValues, setWriteInitialValues] = useState<WriteOptionInitialValues | undefined>();
    const [writeStrategyLabel, setWriteStrategyLabel] = useState<string | undefined>();
    const [buyTarget, setBuyTarget] = useState<OptionData | null>(null);
    const [buyStrategyLabel, setBuyStrategyLabel] = useState<string | undefined>();

    const strategies = intent?.strategies ?? [];

    // For buy-side strategies: find matching options to buy
    const bestPut = useMemo(
        () => motoPillRatio && motoPillRatio > 0 ? findBestProtectivePut(options, motoPillRatio, walletHex) : null,
        [options, motoPillRatio, walletHex],
    );
    const putLiquidity = useMemo(
        () => motoPillRatio && motoPillRatio > 0 ? countOpenOptionsForStrategy(options, 'protective-put', motoPillRatio, walletHex) : 0,
        [options, motoPillRatio, walletHex],
    );

    function handleStrategyExecute(outcome: StrategyOutcome) {
        if (!walletConnected) return;

        // Buy-side strategies: find & buy an existing option
        if (selectedStrategy && BUY_SIDE.has(selectedStrategy)) {
            if (selectedStrategy === 'protective-put' && bestPut) {
                setBuyStrategyLabel('Protective Put');
                setBuyTarget(bestPut);
            }
            return;
        }

        // Write-side strategies: open WriteOptionPanel
        setWriteStrategyLabel(outcome.goalTitle);
        setWriteInitialValues(outcome.initialValues);
        setWriteOpen(true);
    }

    function handleWriteOption(values: WriteOptionInitialValues, strategyLabel?: string) {
        if (!walletConnected) return;
        setWriteStrategyLabel(strategyLabel);
        setWriteInitialValues(values);
        setWriteOpen(true);
    }

    if (loading) {
        return (
            <div className="text-center py-8" data-testid="trade-configurator-loading">
                <p className="text-sm text-terminal-text-muted font-mono">Loading pool data...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-8" data-testid="trade-configurator-error">
                <p className="text-sm text-rose-400 font-mono">{error}</p>
                <button onClick={refetch} className="btn-secondary px-4 py-2 text-sm rounded mt-2">
                    Retry
                </button>
            </div>
        );
    }

    if (!poolInfo) return null;

    // For multi-leg strategies, delegate to StrategySection which already handles SpreadRouter
    const hasMultiLeg = strategies.some((s) => MULTI_LEG.has(s));
    const singleLegStrategies = strategies.filter((s) => !MULTI_LEG.has(s));

    return (
        <div data-testid="trade-configurator">
            <h2 className="text-lg font-bold text-terminal-text-primary font-mono mb-1">
                {underlyingSymbol}/{premiumSymbol}
            </h2>
            <p className="text-xs text-terminal-text-muted font-mono mb-4">
                {motoPillRatio !== null
                    ? `Spot: ${motoPillRatio.toFixed(4)} ${premiumDisplayUnit(premiumSymbol)}`
                    : 'Fetching spot price...'}
            </p>

            {/* Single-leg strategy cards */}
            {singleLegStrategies.length > 0 && (
                <div className="space-y-3 mb-4">
                    <h3 className="text-sm font-bold text-terminal-text-primary font-mono">Choose a Strategy</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {singleLegStrategies.map((type) => {
                            const isBuySide = BUY_SIDE.has(type);
                            const noLiquidity = isBuySide && type === 'protective-put' && putLiquidity === 0;
                            return (
                                <OutcomeCard
                                    key={type}
                                    goalTitle={STRATEGY_LABELS[type]}
                                    tagline={STRATEGY_TAGLINES[type]}
                                    riskLevel={STRATEGY_RISK[type]}
                                    active={selectedStrategy === type}
                                    disabled={noLiquidity}
                                    disabledMessage={noLiquidity ? 'No matching options available to buy yet' : undefined}
                                    summaryMetric={isBuySide && putLiquidity > 0 ? `${putLiquidity} option${putLiquidity > 1 ? 's' : ''} available` : undefined}
                                    testId={`strategy-${type}`}
                                    onClick={() => setSelectedStrategy(selectedStrategy === type ? null : type)}
                                />
                            );
                        })}
                    </div>
                    {/* Write-side configurator (covered-call, write-put) */}
                    {selectedStrategy && !MULTI_LEG.has(selectedStrategy) && !BUY_SIDE.has(selectedStrategy) && motoPillRatio !== null && (
                        <StrategyConfigurator
                            strategyType={selectedStrategy}
                            spotPrice={motoPillRatio}
                            underlyingSymbol={underlyingSymbol}
                            premiumSymbol={premiumSymbol}
                            onExecute={handleStrategyExecute}
                            onClose={() => setSelectedStrategy(null)}
                        />
                    )}

                    {/* Buy-side panel (protective-put): show best available option */}
                    {selectedStrategy === 'protective-put' && motoPillRatio !== null && (
                        <div
                            className="bg-terminal-bg-elevated border border-accent/30 rounded-xl p-4 space-y-3"
                            data-testid="protective-put-panel"
                        >
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-bold text-terminal-text-primary font-mono">
                                    Best Available Put
                                </h4>
                                <button
                                    type="button"
                                    onClick={() => setSelectedStrategy(null)}
                                    className="text-terminal-text-muted hover:text-terminal-text-primary text-lg leading-none"
                                    aria-label="Close"
                                >
                                    x
                                </button>
                            </div>
                            {bestPut ? (() => {
                                const pUnit = premiumDisplayUnit(premiumSymbol);
                                const strikeFloat = Number(bestPut.strikePrice) / 1e18;
                                const premiumFloat = Number(bestPut.premium) / 1e18;
                                const amountFloat = Number(bestPut.underlyingAmount) / 1e18;
                                const strikeRatio = strikeFloat / motoPillRatio;
                                const dropPct = ((1 - strikeRatio) * 100).toFixed(1);
                                const inStandardRange = strikeRatio >= 0.80 && strikeRatio <= 0.95;
                                // Net payout if exercised = (strikePrice × amount) − premium paid
                                const grossPayout = strikeFloat * amountFloat;
                                const netPayout = grossPayout - premiumFloat;
                                // Example scenario: what if price drops 50% from spot?
                                const crashPrice = motoPillRatio * 0.5;
                                const withoutProtection = crashPrice * amountFloat;
                                const withProtection = grossPayout - premiumFloat;
                                const saved = withProtection - withoutProtection;
                                return (
                                <>
                                    {/* How it works */}
                                    <p className="text-[11px] text-terminal-text-muted font-mono leading-relaxed bg-terminal-bg-primary border border-terminal-border-subtle rounded px-3 py-2">
                                        You pay a one-time fee to another user. In return, you get the right to sell
                                        your {underlyingSymbol} at a guaranteed minimum price — no matter how far the market drops.
                                        If the price stays above your protected price, you don't need to do anything (you only lose the fee).
                                    </p>

                                    {/* Key numbers */}
                                    <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3 space-y-1.5">
                                        <span className="text-[10px] text-terminal-text-muted font-mono uppercase tracking-wider">
                                            Your Protection
                                        </span>
                                        <div className="flex justify-between text-xs font-mono">
                                            <span className="text-terminal-text-muted">Current price</span>
                                            <span className="text-terminal-text-primary">
                                                {motoPillRatio.toFixed(2)} {pUnit}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs font-mono">
                                            <span className="text-terminal-text-muted">Guaranteed sell price</span>
                                            <span className="text-green-400">
                                                {formatTokenAmount(bestPut.strikePrice)} {pUnit}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs font-mono">
                                            <span className="text-terminal-text-muted">Protection kicks in</span>
                                            <span className="text-terminal-text-primary">
                                                if price drops more than {dropPct}%
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs font-mono">
                                            <span className="text-terminal-text-muted">Amount covered</span>
                                            <span className="text-terminal-text-primary">
                                                {formatTokenAmount(bestPut.underlyingAmount)} {underlyingSymbol}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs font-mono">
                                            <span className="text-terminal-text-muted">One-time cost</span>
                                            <span className="text-rose-400">
                                                {formatTokenAmount(bestPut.premium)} {pUnit}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Scenarios */}
                                    <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3 space-y-2">
                                        <span className="text-[10px] text-terminal-text-muted font-mono uppercase tracking-wider">
                                            What Happens
                                        </span>
                                        <div className="space-y-1.5">
                                            <div className="text-[11px] font-mono">
                                                <span className="text-green-400">If price drops below {strikeFloat.toFixed(2)} {pUnit}:</span>
                                                <p className="text-terminal-text-muted mt-0.5 ml-2">
                                                    You exercise and sell at {strikeFloat.toFixed(2)} {pUnit} instead of the lower
                                                    market price. You receive {netPayout.toFixed(2)} {pUnit} net (after the fee you paid).
                                                </p>
                                            </div>
                                            <div className="text-[11px] font-mono">
                                                <span className="text-terminal-text-primary">If price stays above {strikeFloat.toFixed(2)} {pUnit}:</span>
                                                <p className="text-terminal-text-muted mt-0.5 ml-2">
                                                    You don't need to exercise. Your {underlyingSymbol} are safe.
                                                    You only lose the {premiumFloat.toFixed(2)} {pUnit} fee.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Example scenario */}
                                    <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3 space-y-1.5">
                                        <span className="text-[10px] text-terminal-text-muted font-mono uppercase tracking-wider">
                                            Example: price crashes 50%
                                        </span>
                                        <div className="flex justify-between text-xs font-mono">
                                            <span className="text-terminal-text-muted">Without protection</span>
                                            <span className="text-rose-400">
                                                {amountFloat.toFixed(2)} {underlyingSymbol} worth {withoutProtection.toFixed(2)} {pUnit}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs font-mono">
                                            <span className="text-terminal-text-muted">With this protection</span>
                                            <span className="text-green-400">
                                                You sell at {strikeFloat.toFixed(2)} → net {withProtection.toFixed(2)} {pUnit}
                                            </span>
                                        </div>
                                        {saved > 0 && (
                                            <div className="flex justify-between text-xs font-mono">
                                                <span className="text-terminal-text-muted">You save</span>
                                                <span className="text-green-400">+{saved.toFixed(2)} {pUnit}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Range hint */}
                                    {inStandardRange ? (
                                        <p className="text-[10px] text-cyan-400 font-mono">
                                            This strike is 5–20% below current price — a common range that balances cost vs. protection.
                                        </p>
                                    ) : (
                                        <p className="text-[10px] text-amber-400 font-mono">
                                            This strike is {dropPct}% below current price. Strikes 5–20% below current price offer better
                                            cost/protection balance. Browse the Chain page for more options.
                                        </p>
                                    )}

                                    <button
                                        type="button"
                                        disabled={!walletConnected}
                                        onClick={() => {
                                            setBuyStrategyLabel('Protective Put');
                                            setBuyTarget(bestPut);
                                        }}
                                        className="w-full btn-primary py-2.5 text-sm font-mono rounded disabled:opacity-50"
                                        data-testid="buy-protective-put-btn"
                                    >
                                        Buy Protection — {formatTokenAmount(bestPut.premium)} {pUnit}
                                    </button>
                                </>
                                );
                            })() : (
                                <p className="text-xs text-terminal-text-muted font-mono">
                                    No PUT options available to buy.
                                    Check the Chain page or write a put to provide liquidity.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Multi-leg strategies via StrategySection */}
            {hasMultiLeg && (
                <div className="mb-4">
                    <StrategySection
                        poolInfo={poolInfo}
                        poolAddress={poolAddress}
                        options={options}
                        motoPillRatio={motoPillRatio}
                        walletConnected={walletConnected}
                        walletAddress={walletAddress}
                        address={address}
                        provider={provider}
                        network={network}
                        underlyingSymbol={underlyingSymbol}
                        premiumSymbol={premiumSymbol}
                        onWriteOption={handleWriteOption}
                        onRefetch={refetch}
                        allowedStrategies={strategies}
                    />
                </div>
            )}

            {!walletConnected && (
                <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-4 text-center">
                    <p className="text-terminal-text-muted font-mono text-sm">
                        Connect your wallet to execute strategies.
                    </p>
                </div>
            )}

            {/* Write Option panel */}
            {writeOpen && poolInfo && provider && network && (
                <WriteOptionPanel
                    poolAddress={poolAddress}
                    poolInfo={poolInfo}
                    walletAddress={walletAddress}
                    walletHex={walletHex}
                    address={address}
                    provider={provider}
                    network={network}
                    motoPillRatio={motoPillRatio}
                    underlyingSymbol={underlyingSymbol}
                    premiumSymbol={premiumSymbol}
                    poolType={poolType}
                    initialValues={writeInitialValues}
                    strategyLabel={writeStrategyLabel}
                    onClose={() => {
                        setWriteOpen(false);
                        setWriteInitialValues(undefined);
                        setWriteStrategyLabel(undefined);
                    }}
                    onSuccess={() => {
                        setWriteOpen(false);
                        setWriteInitialValues(undefined);
                        setWriteStrategyLabel(undefined);
                        refetch();
                    }}
                />
            )}

            {/* Buy Option modal */}
            {buyTarget && poolInfo && provider && network && (
                <BuyOptionModal
                    option={buyTarget}
                    poolInfo={poolInfo}
                    poolAddress={poolAddress}
                    walletAddress={walletAddress}
                    address={address}
                    provider={provider}
                    network={network}
                    motoPillRatio={motoPillRatio}
                    currentBlock={currentBlock ?? undefined}
                    strategyLabel={buyStrategyLabel}
                    underlyingSymbol={underlyingSymbol}
                    premiumSymbol={premiumSymbol}
                    poolType={poolType}
                    onClose={() => { setBuyTarget(null); setBuyStrategyLabel(undefined); }}
                    onSuccess={() => {
                        setBuyTarget(null);
                        setBuyStrategyLabel(undefined);
                        refetch();
                    }}
                />
            )}
        </div>
    );
}
