/**
 * StrategiesPage — atomic multi-leg option strategies via SpreadRouter.
 *
 * Supports: Bull Call Spread, Bear Put Spread, Collar (dual write).
 * Each strategy executes atomically in a single transaction.
 *
 * Route: /strategies
 */
import { useState, useMemo, useRef, useEffect } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useSearchParams } from 'react-router-dom';
import { useFallbackProvider } from '../hooks/useFallbackProvider.ts';
import { useDiscoverPools } from '../hooks/useDiscoverPools.ts';
import { usePool } from '../hooks/usePool.ts';
import { usePriceRatio } from '../hooks/usePriceRatio.ts';
import { useMountedRef } from '../hooks/useMountedRef.ts';
import { getContract } from 'opnet';
import { Address } from '@btc-vision/transaction';
import { LegSelector } from '../components/LegSelector.tsx';
import type { LegConfig } from '../components/LegSelector.tsx';
import { CombinedPnLChart } from '../components/CombinedPnLChart.tsx';
import { ROUTER_ABI } from '../services/poolAbi.ts';
import {
    findPoolConfigByAddress,
    getNativeSwapAddress,
    getPricePairKey,
    getRouterAddress,
} from '../config/index.ts';
import { OptionType } from '../services/types.ts';

type StrategyType = 'bull-call-spread' | 'bear-put-spread' | 'collar' | 'custom';

const STRATEGY_INFO: Record<StrategyType, { label: string; description: string; leg1Label: string; leg2Label: string }> = {
    'bull-call-spread': {
        label: 'Bull Call Spread',
        description: 'Write a higher-strike CALL + buy a lower-strike CALL. Profits when price rises moderately.',
        leg1Label: 'Write CALL (higher strike)',
        leg2Label: 'Buy CALL (lower strike)',
    },
    'bear-put-spread': {
        label: 'Bear Put Spread',
        description: 'Write a lower-strike PUT + buy a higher-strike PUT. Profits when price drops moderately.',
        leg1Label: 'Write PUT (lower strike)',
        leg2Label: 'Buy PUT (higher strike)',
    },
    'collar': {
        label: 'Collar',
        description: 'Write a CALL + write a PUT simultaneously. Limits both upside and downside.',
        leg1Label: 'Write CALL',
        leg2Label: 'Write PUT',
    },
    'custom': {
        label: 'Custom Strategy',
        description: 'Configure any two-leg combination. Both legs execute atomically via SpreadRouter.',
        leg1Label: 'Leg 1',
        leg2Label: 'Leg 2',
    },
};

const MAX_SAT = 10_000_000n;

export function StrategiesPage() {
    const mounted = useMountedRef();
    const sendingRef = useRef(false);
    const [searchParams] = useSearchParams();
    const { walletAddress, address, provider, network } = useWalletConnect();
    const readProvider = useFallbackProvider();
    const { pools } = useDiscoverPools(readProvider);

    // Strategy type selection
    const [strategyType, setStrategyType] = useState<StrategyType>('bull-call-spread');
    const info = STRATEGY_INFO[strategyType];

    // Pool selection
    const [selectedPoolAddress, setSelectedPoolAddress] = useState<string>('');

    // Derive pool config + metadata
    const poolConfig = useMemo(() => {
        if (!selectedPoolAddress) return null;
        return findPoolConfigByAddress(selectedPoolAddress);
    }, [selectedPoolAddress]);
    const underlyingSymbol = poolConfig?.underlying.symbol ?? 'MOTO';
    const premiumSymbol = poolConfig?.premium.symbol ?? 'PILL';
    const pairKey = poolConfig ? getPricePairKey(poolConfig) : '';
    const nativeSwapAddress = useMemo(() => getNativeSwapAddress(poolConfig), [poolConfig]);

    // Load pool options
    const { poolInfo, options } = usePool(selectedPoolAddress || null, readProvider);

    // Price ratio for P&L chart
    const { motoPillRatio } = usePriceRatio(
        pairKey,
        nativeSwapAddress,
        poolInfo?.underlying ?? null,
        poolInfo?.premiumToken ?? null,
        readProvider,
        network ?? null,
    );

    // Leg configs
    const [leg1, setLeg1] = useState<LegConfig>({ action: 'write', optionType: OptionType.CALL });
    const [leg2, setLeg2] = useState<LegConfig>({ action: 'buy' });

    // Read URL params on mount: ?pool=X&strategy=Y&strike=Z
    const [urlSeeded, setUrlSeeded] = useState(false);
    useEffect(() => {
        if (urlSeeded) return;
        const poolParam = searchParams.get('pool');
        const strategyParam = searchParams.get('strategy') as StrategyType | null;
        if (poolParam) setSelectedPoolAddress(poolParam);
        if (strategyParam && strategyParam in STRATEGY_INFO) {
            setStrategyType(strategyParam);
        }
        setUrlSeeded(true);
    }, [searchParams, urlSeeded]);

    // When spot price becomes available + URL has strategy, seed smart defaults
    useEffect(() => {
        if (!motoPillRatio || motoPillRatio <= 0 || !urlSeeded) return;
        const strategyParam = searchParams.get('strategy') as StrategyType | null;
        if (!strategyParam) return;
        // Only seed once when price arrives
        if (leg1.strikeStr || leg2.strikeStr) return;
        const spot = motoPillRatio;
        switch (strategyParam) {
            case 'collar':
                setLeg1({ action: 'write', optionType: OptionType.CALL, strikeStr: (spot * 1.2).toFixed(2), amountStr: '1', selectedDays: 7 });
                setLeg2({ action: 'write', optionType: OptionType.PUT, strikeStr: (spot * 0.8).toFixed(2), amountStr: '1', selectedDays: 7 });
                break;
            case 'bull-call-spread':
                setLeg1({ action: 'write', optionType: OptionType.CALL, strikeStr: (spot * 1.1).toFixed(2), amountStr: '1', selectedDays: 7 });
                setLeg2({ action: 'buy' }); // User picks from available options
                break;
            case 'bear-put-spread':
                setLeg1({ action: 'write', optionType: OptionType.PUT, strikeStr: (spot * 0.9).toFixed(2), amountStr: '1', selectedDays: 7 });
                setLeg2({ action: 'buy' });
                break;
            default:
                break;
        }
    }, [motoPillRatio, urlSeeded]); // eslint-disable-line react-hooks/exhaustive-deps

    // Seed legs based on strategy type
    function selectStrategy(type: StrategyType) {
        setStrategyType(type);
        switch (type) {
            case 'bull-call-spread':
                setLeg1({ action: 'write', optionType: OptionType.CALL });
                setLeg2({ action: 'buy' });
                break;
            case 'bear-put-spread':
                setLeg1({ action: 'write', optionType: OptionType.PUT });
                setLeg2({ action: 'buy' });
                break;
            case 'collar':
                setLeg1({ action: 'write', optionType: OptionType.CALL });
                setLeg2({ action: 'write', optionType: OptionType.PUT });
                break;
            case 'custom':
                setLeg1({ action: 'write', optionType: OptionType.CALL });
                setLeg2({ action: 'buy' });
                break;
        }
    }

    // Execute state
    const [txStatus, setTxStatus] = useState<'idle' | 'executing' | 'done' | 'error'>('idle');
    const [txError, setTxError] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);

    const routerAddress = getRouterAddress();
    const canExecute = selectedPoolAddress && address && provider && network && !sendingRef.current;

    async function handleExecute() {
        if (!canExecute || !address || !provider || !network) return;
        if (!routerAddress) {
            setTxError('SpreadRouter not deployed yet. Configure router address in pools.config.json.');
            setTxStatus('error');
            return;
        }

        sendingRef.current = true;
        setTxStatus('executing');
        setTxError(null);

        try {
            const routerContract = getContract(
                routerAddress,
                ROUTER_ABI,
                provider,
                network,
                address,
            ) as unknown as Record<string, (...args: unknown[]) => { sendTransaction: (p: unknown) => Promise<{ transactionId: string }> }>;

            // Determine method based on strategy type
            if (strategyType === 'collar' || (leg1.action === 'write' && leg2.action === 'write')) {
                // Dual write via executeDualWrite
                const poolAddr = Address.fromString(
                    selectedPoolAddress.startsWith('0x')
                        ? selectedPoolAddress
                        : (await provider.getPublicKeyInfo(selectedPoolAddress, true)).toString(),
                );
                const currentBlock = await provider.getBlockNumber();
                const expiry1 = BigInt(currentBlock) + BigInt((leg1.selectedDays ?? 7) * 144);
                const expiry2 = BigInt(currentBlock) + BigInt((leg2.selectedDays ?? 7) * 144);

                const call = await routerContract['executeDualWrite'](
                    poolAddr,
                    leg1.optionType ?? OptionType.CALL,
                    BigInt(Math.round(Number(leg1.strikeStr ?? '50') * 1e18)),
                    expiry1,
                    BigInt(Math.round(Number(leg1.amountStr ?? '1') * 1e18)),
                    BigInt(Math.round(Number(leg1.premiumStr ?? '5') * 1e18)),
                    leg2.optionType ?? OptionType.PUT,
                    BigInt(Math.round(Number(leg2.strikeStr ?? '50') * 1e18)),
                    expiry2,
                    BigInt(Math.round(Number(leg2.amountStr ?? '1') * 1e18)),
                    BigInt(Math.round(Number(leg2.premiumStr ?? '5') * 1e18)),
                );
                const receipt = await call.sendTransaction({
                    signer: null,
                    mldsaSigner: null,
                    refundTo: walletAddress ?? '',
                    maximumAllowedSatToSpend: MAX_SAT,
                    network,
                });
                if (!mounted.current) return;
                setTxId(receipt.transactionId);
            } else {
                // Spread: write + buy via executeSpread
                const poolAddr = Address.fromString(
                    selectedPoolAddress.startsWith('0x')
                        ? selectedPoolAddress
                        : (await provider.getPublicKeyInfo(selectedPoolAddress, true)).toString(),
                );
                const currentBlock = await provider.getBlockNumber();
                const writeLeg = leg1.action === 'write' ? leg1 : leg2;
                const buyLeg = leg1.action === 'buy' ? leg1 : leg2;
                const expiry = BigInt(currentBlock) + BigInt((writeLeg.selectedDays ?? 7) * 144);

                const call = await routerContract['executeSpread'](
                    poolAddr,
                    writeLeg.optionType ?? OptionType.CALL,
                    BigInt(Math.round(Number(writeLeg.strikeStr ?? '50') * 1e18)),
                    expiry,
                    BigInt(Math.round(Number(writeLeg.amountStr ?? '1') * 1e18)),
                    BigInt(Math.round(Number(writeLeg.premiumStr ?? '5') * 1e18)),
                    buyLeg.optionId ?? 0n,
                );
                const receipt = await call.sendTransaction({
                    signer: null,
                    mldsaSigner: null,
                    refundTo: walletAddress ?? '',
                    maximumAllowedSatToSpend: MAX_SAT,
                    network,
                });
                if (!mounted.current) return;
                setTxId(receipt.transactionId);
            }

            setTxStatus('done');
        } catch (err) {
            if (!mounted.current) return;
            setTxError(err instanceof Error ? err.message : 'Strategy execution failed');
            setTxStatus('error');
        } finally {
            sendingRef.current = false;
        }
    }

    return (
        <div className="space-y-6 max-w-2xl mx-auto" data-testid="strategies-page">
            <h1 className="text-lg font-bold text-terminal-text-primary font-mono">
                Multi-Leg Strategies
            </h1>
            <p className="text-xs text-terminal-text-muted font-mono">
                Execute atomic multi-leg option strategies via SpreadRouter. Both legs succeed or both revert.
            </p>

            {!routerAddress && (
                <div className="bg-orange-900/20 border border-orange-700/50 rounded p-3 text-xs font-mono text-orange-400">
                    SpreadRouter not yet deployed. Strategy execution is disabled until the router contract is configured.
                </div>
            )}

            {/* Strategy type selector */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="strategy-selector">
                {(Object.keys(STRATEGY_INFO) as StrategyType[]).map((type) => (
                    <button
                        key={type}
                        type="button"
                        onClick={() => selectStrategy(type)}
                        className={`px-3 py-2 text-xs font-mono rounded border transition-colors ${
                            strategyType === type
                                ? 'bg-accent/20 border-accent text-accent'
                                : 'border-terminal-border-subtle text-terminal-text-muted hover:text-terminal-text-primary'
                        }`}
                    >
                        {STRATEGY_INFO[type].label}
                    </button>
                ))}
            </div>

            {/* Strategy description */}
            <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-lg p-4">
                <h2 className="text-sm font-bold text-terminal-text-primary font-mono">{info.label}</h2>
                <p className="text-xs text-terminal-text-muted font-mono mt-1">{info.description}</p>
            </div>

            {/* Pool selector */}
            <div>
                <label className="block text-xs text-terminal-text-muted font-mono mb-2">Select Pool</label>
                <select
                    value={selectedPoolAddress}
                    onChange={(e) => setSelectedPoolAddress(e.target.value)}
                    className="w-full bg-terminal-bg-primary border border-terminal-border-subtle rounded px-3 py-2 text-sm font-mono text-terminal-text-primary outline-none"
                    data-testid="pool-select"
                >
                    <option value="">Choose a pool...</option>
                    {pools.map((pool) => (
                        <option key={pool.address} value={pool.address}>
                            {pool.underlyingSymbol ?? '?'} / {pool.premiumSymbol ?? '?'} ({pool.poolId ?? pool.address.slice(0, 12)})
                        </option>
                    ))}
                </select>
            </div>

            {/* Legs */}
            {selectedPoolAddress && (
                <div className="space-y-3">
                    <LegSelector
                        legNumber={1}
                        label={info.leg1Label}
                        availableOptions={options}
                        value={leg1}
                        onChange={setLeg1}
                        spotPrice={motoPillRatio}
                        underlyingSymbol={underlyingSymbol}
                        premiumSymbol={premiumSymbol}
                        disabled={!selectedPoolAddress}
                    />
                    <LegSelector
                        legNumber={2}
                        label={info.leg2Label}
                        availableOptions={options}
                        value={leg2}
                        onChange={setLeg2}
                        spotPrice={motoPillRatio}
                        underlyingSymbol={underlyingSymbol}
                        premiumSymbol={premiumSymbol}
                        disabled={!selectedPoolAddress}
                    />
                </div>
            )}

            {/* Combined P&L chart */}
            {motoPillRatio != null && motoPillRatio > 0 && selectedPoolAddress && (
                <CombinedPnLChart
                    legs={[leg1, leg2]}
                    options={options}
                    spotPrice={motoPillRatio}
                    premiumSymbol={premiumSymbol}
                />
            )}

            {/* Error */}
            {txError && (
                <div className="bg-rose-900/20 border border-rose-700 rounded p-3 text-xs font-mono text-rose-400">
                    {txError}
                    <button
                        onClick={() => { setTxError(null); setTxStatus('idle'); }}
                        className="ml-2 underline hover:text-rose-300"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Success */}
            {txStatus === 'done' && txId && (
                <div className="bg-green-900/20 border border-green-700 rounded p-3 text-xs font-mono text-green-400">
                    Strategy executed successfully! TX: {txId.slice(0, 16)}...
                </div>
            )}

            {/* Execute button */}
            {selectedPoolAddress && txStatus !== 'done' && (
                <button
                    onClick={handleExecute}
                    disabled={!canExecute || txStatus === 'executing'}
                    className="w-full btn-primary py-3 text-sm font-mono rounded disabled:opacity-50"
                    data-testid="btn-execute-strategy"
                >
                    {txStatus === 'executing'
                        ? 'Executing Strategy...'
                        : !walletAddress
                            ? 'Connect Wallet'
                            : `Execute ${info.label}`
                    }
                </button>
            )}

            {/* Wallet not connected */}
            {!walletAddress && (
                <p className="text-xs text-terminal-text-muted font-mono text-center">
                    Connect your wallet to execute strategies.
                </p>
            )}
        </div>
    );
}
