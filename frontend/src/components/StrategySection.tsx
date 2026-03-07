/**
 * StrategySection — unified write-side strategy hub on the Write tab.
 *
 * Uses OutcomeCard + StrategyConfigurator for an outcome-first UX:
 * - Click a goal card to expand a configuration panel below it
 * - Tune moneyness, expiry, amount with live outcome preview
 * - Single-leg: "Start Earning" opens WriteOptionPanel pre-filled
 * - Multi-leg (Collar, Spreads): inline LegSelector + SpreadRouter execution
 */
import { useState, useMemo, useRef, useEffect } from 'react';
import { getContract } from 'opnet';
import type { AbstractRpcProvider } from 'opnet';
import { Address } from '@btc-vision/transaction';
import type { PoolInfo, OptionData } from '../services/types.ts';
import { OptionType } from '../services/types.ts';
import { ROUTER_ABI, TOKEN_APPROVE_ABI } from '../services/poolAbi.ts';
import {
    getRouterAddress,
    premiumDisplayUnit,
    BLOCK_CONSTANTS,
    formatTokenAmount,
} from '../config/index.ts';
import { useTokenInfo } from '../hooks/useTokenInfo.ts';
import { useWsBlock } from '../hooks/useWebSocketProvider.ts';
import type { WriteOptionInitialValues, StrategyType, StrategyOutcome } from '../utils/strategyMath.ts';
import { calcLiveOutcome } from '../utils/strategyMath.ts';
import { OutcomeCard } from './OutcomeCard.tsx';
import { StrategyConfigurator } from './StrategyConfigurator.tsx';
import { LegSelector } from './LegSelector.tsx';
import type { LegConfig } from './LegSelector.tsx';
import { CombinedPnLChart } from './CombinedPnLChart.tsx';
import { useMountedRef } from '../hooks/useMountedRef.ts';
import { useTransactionContext } from '../hooks/useTransactionContext.ts';
import type { WalletConnectNetwork } from '@btc-vision/walletconnect';

type MultiLegStrategy = 'collar' | 'bull-call-spread' | 'bear-put-spread';

const MULTI_LEG_INFO: Record<MultiLegStrategy, { label: string; leg1Label: string; leg2Label: string }> = {
    'collar': { label: 'Collar', leg1Label: 'Write CALL', leg2Label: 'Write PUT' },
    'bull-call-spread': { label: 'Bull Call Spread', leg1Label: 'Write CALL (higher strike)', leg2Label: 'Buy CALL (lower strike)' },
    'bear-put-spread': { label: 'Bear Put Spread', leg1Label: 'Write PUT (lower strike)', leg2Label: 'Buy PUT (higher strike)' },
};

const SINGLE_LEG_CARDS: { type: StrategyType; tagline: string; summaryHint: string }[] = [
    { type: 'covered-call', tagline: 'Earn premium on tokens you hold', summaryHint: '~2-4% yield / 30d' },
    { type: 'write-put', tagline: 'Earn premium by insuring others', summaryHint: '~1-3% yield / 30d' },
];

const MULTI_LEG_CARDS: { type: StrategyType; mlType: MultiLegStrategy; tagline: string }[] = [
    { type: 'collar', mlType: 'collar', tagline: 'Limit both upside and downside' },
    { type: 'bull-call-spread', mlType: 'bull-call-spread', tagline: 'Profit on moderate price rise' },
    { type: 'bear-put-spread', mlType: 'bear-put-spread', tagline: 'Profit on moderate price drop' },
];

const MAX_SAT = 10_000_000n;

interface StrategySectionProps {
    poolInfo: PoolInfo;
    poolAddress: string;
    options: OptionData[];
    motoPillRatio: number | null;
    walletConnected: boolean;
    walletAddress: string | null;
    address: Address | null;
    provider: AbstractRpcProvider | null;
    network: WalletConnectNetwork | null;
    underlyingSymbol?: string;
    premiumSymbol?: string;
    onWriteOption: (values: WriteOptionInitialValues, strategyLabel?: string) => void;
    onRefetch: () => void;
}

export function StrategySection({
    poolInfo,
    poolAddress,
    motoPillRatio,
    options,
    walletConnected,
    walletAddress,
    address,
    provider,
    network,
    underlyingSymbol = 'MOTO',
    premiumSymbol = 'PILL',
    onWriteOption,
    onRefetch,
}: StrategySectionProps) {
    const mounted = useMountedRef();
    const sendingRef = useRef(false);
    const { addTransaction } = useTransactionContext();
    const pUnit = premiumDisplayUnit(premiumSymbol);
    const noPrice = motoPillRatio === null || motoPillRatio <= 0;

    // Active card (for single-leg configurator or multi-leg panel)
    const [activeStrategy, setActiveStrategy] = useState<StrategyType | null>(null);
    const [activeMultiLeg, setActiveMultiLeg] = useState<MultiLegStrategy | null>(null);

    // Multi-leg state
    const [leg1, setLeg1] = useState<LegConfig>({ action: 'write', optionType: OptionType.CALL });
    const [leg2, setLeg2] = useState<LegConfig>({ action: 'write', optionType: OptionType.PUT });
    const [txStatus, setTxStatus] = useState<'idle' | 'approving' | 'executing' | 'done' | 'error'>('idle');
    const [txError, setTxError] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);
    const [approvalLabel, setApprovalLabel] = useState<string>('');

    const routerAddress = getRouterAddress();
    const wsBlockInfo = useWsBlock();

    // Resolve pool hex for allowance spender
    const [poolHex, setPoolHex] = useState<string | null>(null);
    useEffect(() => {
        if (!provider) return;
        if (poolAddress.startsWith('0x')) {
            setPoolHex(poolAddress);
        } else {
            provider.getPublicKeyInfo(poolAddress, true).then((info: { toString(): string }) => {
                if (mounted.current) setPoolHex(info.toString());
            }).catch(() => {
                if (mounted.current) setPoolHex(null);
            });
        }
    }, [poolAddress, provider]); // eslint-disable-line react-hooks/exhaustive-deps

    // Token allowance tracking — underlying (MOTO) for CALL write legs
    const { info: underlyingTokenInfo, refetch: refetchUnderlying } = useTokenInfo({
        tokenAddress: poolInfo.underlying,
        spenderHex: poolHex,
        walletAddress: address,
        provider,
        currentBlock: wsBlockInfo?.blockNumber,
    });

    // Token allowance tracking — premium (PILL) for PUT write legs and buy legs
    const { info: premiumTokenInfo, refetch: refetchPremium } = useTokenInfo({
        tokenAddress: poolInfo.premiumToken,
        spenderHex: poolHex,
        walletAddress: address,
        provider,
        currentBlock: wsBlockInfo?.blockNumber,
    });

    // Summary metrics for cards (quick BS estimate at default params)
    const summaryMetrics = useMemo(() => {
        if (noPrice) return {};
        const spot = motoPillRatio;
        const cc = calcLiveOutcome('covered-call', spot, 1.2, 30, 1, pUnit, underlyingSymbol);
        const wp = calcLiveOutcome('write-put', spot, 0.875, 30, 1, pUnit, underlyingSymbol);
        const col = calcLiveOutcome('collar', spot, 1.2, 30, 1, pUnit, underlyingSymbol, 0.8);
        return {
            'covered-call': cc?.metrics.find(m => m.label === 'Yield')?.value,
            'write-put': wp?.metrics.find(m => m.label === 'Yield')?.value,
            'collar': col?.metrics.find(m => m.label === 'Net premium')?.value,
        } as Record<string, string | undefined>;
    }, [noPrice, motoPillRatio, pUnit, underlyingSymbol]);

    function handleCardClick(type: StrategyType) {
        if (activeStrategy === type) {
            setActiveStrategy(null);
            setActiveMultiLeg(null);
            return;
        }
        setActiveStrategy(type);
        setActiveMultiLeg(null);
        setTxStatus('idle');
        setTxError(null);
        setTxId(null);
    }

    function handleMultiLegClick(type: StrategyType, mlType: MultiLegStrategy) {
        if (activeStrategy === type && activeMultiLeg === mlType) {
            setActiveStrategy(null);
            setActiveMultiLeg(null);
            return;
        }
        setActiveStrategy(type);
        setActiveMultiLeg(mlType);
        setTxStatus('idle');
        setTxError(null);
        setTxId(null);

        const spot = motoPillRatio ?? 50;
        switch (mlType) {
            case 'collar':
                setLeg1({ action: 'write', optionType: OptionType.CALL, strikeStr: (spot * 1.2).toFixed(2), amountStr: '1', selectedDays: 7 });
                setLeg2({ action: 'write', optionType: OptionType.PUT, strikeStr: (spot * 0.8).toFixed(2), amountStr: '1', selectedDays: 7 });
                break;
            case 'bull-call-spread':
                setLeg1({ action: 'write', optionType: OptionType.CALL, strikeStr: (spot * 1.2).toFixed(2), amountStr: '1', selectedDays: 7 });
                setLeg2({ action: 'buy' });
                break;
            case 'bear-put-spread':
                setLeg1({ action: 'write', optionType: OptionType.PUT, strikeStr: (spot * 0.8).toFixed(2), amountStr: '1', selectedDays: 7 });
                setLeg2({ action: 'buy' });
                break;
        }
    }

    function handleConfigExecute(outcome: StrategyOutcome) {
        onWriteOption(outcome.initialValues, outcome.goalTitle);
    }

    /**
     * Compute required approval amounts for the active multi-leg strategy.
     * Returns { underlying, premium } amounts that need allowance on the pool.
     */
    function computeRequiredAllowances(): { underlying: bigint; premium: bigint } {
        let underlying = 0n;
        let premium = 0n;

        const parseBi = (s: string | undefined) => {
            const n = Number(s ?? '0');
            return isNaN(n) || n <= 0 ? 0n : BigInt(Math.round(n * 1e18));
        };

        if (activeMultiLeg === 'collar') {
            // Write CALL: locks underlying (MOTO) for underlyingAmount
            underlying = parseBi(leg1.amountStr);
            // Write PUT: locks premium (PILL) for strikeValue = strike * amount / 1e18
            const putStrike = parseBi(leg2.strikeStr);
            const putAmount = parseBi(leg2.amountStr);
            premium = (putStrike * putAmount) / (10n ** 18n);
        } else if (activeMultiLeg === 'bull-call-spread') {
            // Write CALL: locks underlying (MOTO)
            underlying = parseBi(leg1.amountStr);
            // Buy existing CALL: pays premium (PILL) — find the option to buy
            if (leg2.optionId !== undefined) {
                const opt = options.find(o => o.id === leg2.optionId);
                if (opt) premium = opt.premium;
            }
        } else if (activeMultiLeg === 'bear-put-spread') {
            // Write PUT: locks premium (PILL) for strikeValue
            const putStrike = parseBi(leg1.strikeStr);
            const putAmount = parseBi(leg1.amountStr);
            premium = (putStrike * putAmount) / (10n ** 18n);
            // Buy existing PUT: pays premium (PILL)
            if (leg2.optionId !== undefined) {
                const opt = options.find(o => o.id === leg2.optionId);
                if (opt) premium += opt.premium;
            }
        }

        return { underlying, premium };
    }

    /** Send an increaseAllowance TX for a specific token to the pool. */
    async function sendApproval(tokenAddress: string, amount: bigint, tokenSymbol: string): Promise<string> {
        if (!address || !poolHex || !provider || !network) throw new Error('Not connected');

        const tokenContract = getContract(
            tokenAddress,
            TOKEN_APPROVE_ABI,
            provider,
            network,
            address,
        ) as unknown as Record<string, (...args: unknown[]) => { sendTransaction: (p: unknown) => Promise<{ transactionId: string }> }>;

        const callResult = await tokenContract['increaseAllowance'](Address.fromString(poolHex), amount);
        const receipt = await callResult.sendTransaction({
            signer: null, mldsaSigner: null,
            refundTo: walletAddress ?? '',
            maximumAllowedSatToSpend: MAX_SAT,
            network,
        });

        addTransaction({
            txId: receipt.transactionId, type: 'approve', status: 'broadcast',
            poolAddress, broadcastBlock: null,
            label: `Approve ${formatTokenAmount(amount, 18)} ${tokenSymbol} for strategy`,
            flowId: null, flowStep: null,
            meta: { token: tokenSymbol },
        });

        return receipt.transactionId;
    }

    /** Execute the router call (after approvals are sufficient). */
    async function sendRouterCall(): Promise<string> {
        if (!activeMultiLeg || !address || !provider || !network || !routerAddress) {
            throw new Error('Not ready');
        }

        const routerContract = getContract(
            routerAddress,
            ROUTER_ABI,
            provider,
            network,
            address,
        ) as unknown as Record<string, (...args: unknown[]) => { sendTransaction: (p: unknown) => Promise<{ transactionId: string }> }>;

        const info = MULTI_LEG_INFO[activeMultiLeg];
        const poolAddr = Address.fromString(
            poolAddress.startsWith('0x')
                ? poolAddress
                : (await provider.getPublicKeyInfo(poolAddress, true)).toString(),
        );
        const currentBlock = await provider.getBlockNumber();

        let receipt: { transactionId: string };

        if (activeMultiLeg === 'collar' || (leg1.action === 'write' && leg2.action === 'write')) {
            const expiry1 = BigInt(currentBlock) + BigInt((leg1.selectedDays ?? 7) * BLOCK_CONSTANTS.BLOCKS_PER_DAY);
            const expiry2 = BigInt(currentBlock) + BigInt((leg2.selectedDays ?? 7) * BLOCK_CONSTANTS.BLOCKS_PER_DAY);
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
            receipt = await call.sendTransaction({
                signer: null, mldsaSigner: null,
                refundTo: walletAddress ?? '',
                maximumAllowedSatToSpend: MAX_SAT,
                network,
            });
        } else {
            const writeLeg = leg1.action === 'write' ? leg1 : leg2;
            const buyLeg = leg1.action === 'buy' ? leg1 : leg2;
            const expiry = BigInt(currentBlock) + BigInt((writeLeg.selectedDays ?? 7) * BLOCK_CONSTANTS.BLOCKS_PER_DAY);
            const call = await routerContract['executeSpread'](
                poolAddr,
                writeLeg.optionType ?? OptionType.CALL,
                BigInt(Math.round(Number(writeLeg.strikeStr ?? '50') * 1e18)),
                expiry,
                BigInt(Math.round(Number(writeLeg.amountStr ?? '1') * 1e18)),
                BigInt(Math.round(Number(writeLeg.premiumStr ?? '5') * 1e18)),
                buyLeg.optionId ?? 0n,
            );
            receipt = await call.sendTransaction({
                signer: null, mldsaSigner: null,
                refundTo: walletAddress ?? '',
                maximumAllowedSatToSpend: MAX_SAT,
                network,
            });
        }

        addTransaction({
            txId: receipt.transactionId, type: 'strategy', status: 'broadcast',
            poolAddress, broadcastBlock: null,
            label: `${info.label}: ${underlyingSymbol}/${premiumSymbol}`,
            flowId: null, flowStep: null,
            meta: { strategy: activeMultiLeg, strategyLabel: info.label },
        });

        return receipt.transactionId;
    }

    async function handleExecuteMultiLeg() {
        if (!activeMultiLeg || !address || !provider || !network || sendingRef.current) return;
        if (!routerAddress) {
            setTxError('SpreadRouter not deployed yet.');
            setTxStatus('error');
            return;
        }
        if (!poolHex) {
            setTxError('Pool address not resolved yet. Please wait.');
            setTxStatus('error');
            return;
        }

        sendingRef.current = true;
        setTxError(null);

        try {
            // 1. Check allowances and approve if needed
            const required = computeRequiredAllowances();
            const underlyingAllowance = underlyingTokenInfo?.allowance ?? 0n;
            const premiumAllowance = premiumTokenInfo?.allowance ?? 0n;

            if (required.underlying > 0n && underlyingAllowance < required.underlying) {
                setTxStatus('approving');
                setApprovalLabel(`Approving ${underlyingSymbol}...`);
                await sendApproval(poolInfo.underlying, required.underlying, underlyingSymbol);
                if (!mounted.current) return;
                refetchUnderlying();
                // After approval TX is broadcast, user needs to wait for confirmation
                // before the router call will succeed. Show a message.
                setTxError(
                    `${underlyingSymbol} approval broadcast. Wait for confirmation (~10 min), then click Execute again.`
                    + (required.premium > 0n && premiumAllowance < required.premium
                        ? ` ${premiumSymbol} approval also needed.`
                        : ''),
                );
                setTxStatus('idle');
                return;
            }

            if (required.premium > 0n && premiumAllowance < required.premium) {
                setTxStatus('approving');
                setApprovalLabel(`Approving ${premiumSymbol}...`);
                await sendApproval(poolInfo.premiumToken, required.premium, premiumSymbol);
                if (!mounted.current) return;
                refetchPremium();
                setTxError(
                    `${premiumSymbol} approval broadcast. Wait for confirmation (~10 min), then click Execute again.`,
                );
                setTxStatus('idle');
                return;
            }

            // 2. All allowances sufficient — execute the strategy
            setTxStatus('executing');
            const txIdResult = await sendRouterCall();
            if (!mounted.current) return;
            setTxId(txIdResult);
            setTxStatus('done');
            onRefetch();
        } catch (err) {
            if (!mounted.current) return;
            const msg = err instanceof Error ? err.message : 'Strategy execution failed';
            setTxError(msg.includes('mempool-chain')
                ? 'Too many pending transactions. Wait for a confirmation before starting another.'
                : msg);
            setTxStatus('error');
        } finally {
            sendingRef.current = false;
        }
    }

    return (
        <div className="space-y-4" data-testid="strategy-section">
            <h3 className="text-sm font-bold text-terminal-text-primary font-mono">Strategies</h3>

            {/* Outcome cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Single-leg strategies */}
                {SINGLE_LEG_CARDS.map(({ type, tagline }) => {
                    const meta = calcLiveOutcome(type, motoPillRatio ?? 0, type === 'covered-call' ? 1.2 : 0.875, 30, 1, pUnit, underlyingSymbol);
                    return (
                        <OutcomeCard
                            key={type}
                            goalTitle={meta?.goalTitle ?? type}
                            tagline={tagline}
                            riskLevel={meta?.riskLevel ?? 'low'}
                            summaryMetric={noPrice ? undefined : summaryMetrics[type]}
                            active={activeStrategy === type && !activeMultiLeg}
                            disabled={noPrice}
                            testId={`strategy-${type}`}
                            onClick={() => handleCardClick(type)}
                        />
                    );
                })}

                {/* Multi-leg strategies */}
                {MULTI_LEG_CARDS.map(({ type, mlType, tagline }) => {
                    const meta = calcLiveOutcome(type, motoPillRatio ?? 0, type === 'collar' ? 1.2 : type === 'bull-call-spread' ? 1.2 : 0.8, 30, 1, pUnit, underlyingSymbol, type === 'collar' ? 0.8 : 1.0);
                    return (
                        <OutcomeCard
                            key={type}
                            goalTitle={meta?.goalTitle ?? type}
                            tagline={tagline}
                            riskLevel={meta?.riskLevel ?? 'medium'}
                            summaryMetric={noPrice ? undefined : summaryMetrics[type]}
                            active={activeStrategy === type && activeMultiLeg === mlType}
                            disabled={noPrice}
                            testId={`strategy-${type}`}
                            onClick={() => handleMultiLegClick(type, mlType)}
                        />
                    );
                })}

                {/* Write Custom */}
                <OutcomeCard
                    goalTitle="Build Custom Strategy"
                    tagline="Full control over all parameters"
                    riskLevel="medium"
                    active={activeStrategy === 'custom' as StrategyType}
                    disabled={false}
                    testId="strategy-write-custom"
                    onClick={() => {
                        onWriteOption({
                            optionType: OptionType.CALL,
                            amountStr: '1',
                            strikeStr: '',
                            premiumStr: '',
                            selectedDays: 7,
                        });
                    }}
                />
            </div>

            {/* Single-leg configurator (expanded below grid) */}
            {activeStrategy && !activeMultiLeg && (activeStrategy === 'covered-call' || activeStrategy === 'write-put') && motoPillRatio != null && motoPillRatio > 0 && (
                <StrategyConfigurator
                    strategyType={activeStrategy}
                    spotPrice={motoPillRatio}
                    underlyingSymbol={underlyingSymbol}
                    premiumSymbol={premiumSymbol}
                    onExecute={handleConfigExecute}
                    onClose={() => setActiveStrategy(null)}
                />
            )}

            {/* Multi-leg configurator */}
            {activeMultiLeg && (() => {
                const info = MULTI_LEG_INFO[activeMultiLeg];
                return (
                    <div
                        className="bg-terminal-bg-elevated border border-accent/30 rounded-xl p-4 space-y-4"
                        data-testid="multi-leg-panel"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-terminal-text-primary font-mono">{info.label}</h3>
                            <button
                                onClick={() => { setActiveStrategy(null); setActiveMultiLeg(null); }}
                                className="text-terminal-text-muted hover:text-terminal-text-primary text-lg"
                                aria-label="Close multi-leg panel"
                            >
                                x
                            </button>
                        </div>

                        {!routerAddress && (
                            <div className="bg-orange-900/20 border border-orange-700/50 rounded p-3 text-xs font-mono text-orange-400">
                                SpreadRouter not yet deployed. Strategy execution is disabled.
                            </div>
                        )}

                        <div className="space-y-3">
                            <LegSelector
                                legNumber={1} label={info.leg1Label}
                                availableOptions={options} value={leg1} onChange={setLeg1}
                                spotPrice={motoPillRatio} underlyingSymbol={underlyingSymbol} premiumSymbol={premiumSymbol}
                            />
                            <LegSelector
                                legNumber={2} label={info.leg2Label}
                                availableOptions={options} value={leg2} onChange={setLeg2}
                                spotPrice={motoPillRatio} underlyingSymbol={underlyingSymbol} premiumSymbol={premiumSymbol}
                            />
                        </div>

                        {motoPillRatio != null && motoPillRatio > 0 && (
                            <CombinedPnLChart legs={[leg1, leg2]} options={options} spotPrice={motoPillRatio} premiumSymbol={premiumSymbol} />
                        )}

                        {txError && (
                            <div className={`rounded p-3 text-xs font-mono ${
                                txError.includes('approval broadcast')
                                    ? 'bg-amber-900/20 border border-amber-700 text-amber-400'
                                    : 'bg-rose-900/20 border border-rose-700 text-rose-400'
                            }`}>
                                {txError}
                                <button onClick={() => { setTxError(null); setTxStatus('idle'); }} className="ml-2 underline hover:opacity-80">Dismiss</button>
                            </div>
                        )}

                        {txStatus === 'done' && txId && (
                            <div className="bg-green-900/20 border border-green-700 rounded p-3 text-xs font-mono text-green-400">
                                Strategy executed! TX: {txId.slice(0, 16)}...
                                <div className="text-green-500/70 mt-1">Confirmation typically takes ~10 minutes.</div>
                            </div>
                        )}

                        {txStatus !== 'done' && (
                            <button
                                onClick={handleExecuteMultiLeg}
                                disabled={!routerAddress || !walletConnected || txStatus === 'executing' || txStatus === 'approving' || sendingRef.current}
                                className="w-full btn-primary py-3 text-sm font-mono rounded disabled:opacity-50"
                                data-testid="btn-execute-strategy"
                            >
                                {txStatus === 'approving' ? approvalLabel
                                    : txStatus === 'executing' ? 'Executing...'
                                    : !walletConnected ? 'Connect Wallet'
                                    : `Execute ${info.label}`}
                            </button>
                        )}
                    </div>
                );
            })()}
        </div>
    );
}
