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
    'covered-call': 'Covered Call',
    'write-put': 'Cash-Secured Put',
    'protective-put': 'Protective Put',
    'collar': 'Collar',
    'bull-call-spread': 'Bull Call Spread',
    'bear-put-spread': 'Bear Put Spread',
};

const STRATEGY_TAGLINES: Record<StrategyType, string> = {
    'covered-call': 'Earn premium on tokens you hold',
    'write-put': 'Earn premium by insuring others',
    'protective-put': 'Buy downside protection',
    'collar': 'Earn premium on both upside and downside',
    'bull-call-spread': 'Profit on moderate price rise',
    'bear-put-spread': 'Profit on moderate price drop',
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
        () => motoPillRatio && motoPillRatio > 0 ? findBestProtectivePut(options, motoPillRatio) : null,
        [options, motoPillRatio],
    );
    const putLiquidity = useMemo(
        () => motoPillRatio && motoPillRatio > 0 ? countOpenOptionsForStrategy(options, 'protective-put', motoPillRatio) : 0,
        [options, motoPillRatio],
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
                            {bestPut ? (
                                <>
                                    <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3 space-y-1.5">
                                        <span className="text-[10px] text-terminal-text-muted font-mono uppercase tracking-wider">
                                            What You'll Get
                                        </span>
                                        <div className="flex justify-between text-xs font-mono">
                                            <span className="text-terminal-text-muted">Type</span>
                                            <span className="text-rose-400">PUT</span>
                                        </div>
                                        <div className="flex justify-between text-xs font-mono">
                                            <span className="text-terminal-text-muted">Strike</span>
                                            <span className="text-terminal-text-primary">
                                                {formatTokenAmount(bestPut.strikePrice)} {premiumDisplayUnit(premiumSymbol)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs font-mono">
                                            <span className="text-terminal-text-muted">Amount</span>
                                            <span className="text-terminal-text-primary">
                                                {formatTokenAmount(bestPut.underlyingAmount)} {underlyingSymbol}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs font-mono">
                                            <span className="text-terminal-text-muted">Cost (premium)</span>
                                            <span className="text-rose-400">
                                                {formatTokenAmount(bestPut.premium)} {premiumDisplayUnit(premiumSymbol)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs font-mono">
                                            <span className="text-terminal-text-muted">Protected below</span>
                                            <span className="text-green-400">
                                                {formatTokenAmount(bestPut.strikePrice)} {premiumDisplayUnit(premiumSymbol)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs font-mono">
                                            <span className="text-terminal-text-muted">Drop from spot</span>
                                            <span className="text-terminal-text-primary">
                                                {((1 - Number(bestPut.strikePrice) / 1e18 / motoPillRatio) * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                    </div>
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
                                        Buy Protection
                                    </button>
                                </>
                            ) : (
                                <p className="text-xs text-terminal-text-muted font-mono">
                                    No PUT options available in the 80-95% strike range.
                                    Check the Chain page for all available options.
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
