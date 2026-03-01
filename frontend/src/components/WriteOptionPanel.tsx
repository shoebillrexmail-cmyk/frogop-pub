/**
 * WriteOptionPanel — slide-in panel for creating a new option.
 *
 * Two-step flow:
 *   1. Approve MOTO collateral (if allowance insufficient)
 *   2. Submit writeOption() transaction
 */
import { useState, useEffect } from 'react';
import { useMountedRef } from '../hooks/useMountedRef.ts';
import { getContract } from 'opnet';
import type { AbstractRpcProvider } from 'opnet';
import { Address } from '@btc-vision/transaction';
import type { PoolInfo } from '../services/types.ts';
import { OptionType } from '../services/types.ts';
import { useTokenInfo } from '../hooks/useTokenInfo.ts';
import { POOL_WRITE_ABI, TOKEN_APPROVE_ABI } from '../services/poolAbi.ts';
import { formatTokenAmount, BLOCK_CONSTANTS } from '../config/index.ts';
import { useTransactionFlow } from '../hooks/useTransactionFlow.ts';
import { useSuggestedPremium } from '../hooks/useSuggestedPremium.ts';
import type { WalletConnectNetwork } from '@btc-vision/walletconnect';

const DAY_PRESETS = [
    { label: '1d', days: 1 },
    { label: '3d', days: 3 },
    { label: '7d', days: 7 },
    { label: '14d', days: 14 },
    { label: '30d', days: 30 },
    { label: '90d', days: 90 },
] as const;

export interface WriteOptionInitialValues {
    optionType?: number;
    amountStr?: string;
    strikeStr?: string;
    premiumStr?: string;
    selectedDays?: number;
}

interface WriteOptionPanelProps {
    poolAddress: string;
    poolInfo: PoolInfo;
    walletAddress: string | null;
    walletHex: string | null;
    address: Address | null;
    provider: AbstractRpcProvider;
    network: WalletConnectNetwork;
    /** Current MOTO/PILL spot price for BS suggested premium */
    motoPillRatio?: number | null;
    /** Pre-fill form values from strategy templates */
    initialValues?: WriteOptionInitialValues;
    onClose: () => void;
    onSuccess: () => void;
}

const MAX_SAT = 10_000_000n; // 0.1 BTC for fees

function parseBigIntTokens(value: string, decimals = 18): bigint | null {
    const trimmed = value.trim();
    if (!trimmed || isNaN(Number(trimmed))) return null;
    const [whole, frac = ''] = trimmed.split('.');
    const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0');
    try {
        return BigInt(whole) * BigInt(10 ** decimals) + BigInt(fracPadded);
    } catch {
        return null;
    }
}

function formatBigInt(value: bigint, decimals = 18): string {
    return formatTokenAmount(value, decimals);
}

export function WriteOptionPanel({
    poolAddress,
    poolInfo,
    walletAddress,
    address,
    provider,
    network,
    motoPillRatio,
    initialValues,
    onClose,
    onSuccess,
}: WriteOptionPanelProps) {
    const mounted = useMountedRef();
    const [optionType, setOptionType] = useState<number>(OptionType.CALL);
    const [amountStr, setAmountStr] = useState('1');
    const [strikeStr, setStrikeStr] = useState('');
    const [premiumStr, setPremiumStr] = useState('');
    const [selectedDays, setSelectedDays] = useState<number>(7);
    const [volatility, setVolatility] = useState<number>(() => {
        const stored = localStorage.getItem('frogop_vol_pref');
        return stored ? Number(stored) : 80;
    });
    const [showVolSlider, setShowVolSlider] = useState(false);
    const expiryBlocks = selectedDays * BLOCK_CONSTANTS.BLOCKS_PER_DAY;

    // Seed form from strategy template on mount
    useEffect(() => {
        if (!initialValues) return;
        if (initialValues.optionType !== undefined) setOptionType(initialValues.optionType);
        if (initialValues.amountStr !== undefined) setAmountStr(initialValues.amountStr);
        if (initialValues.strikeStr !== undefined) setStrikeStr(initialValues.strikeStr);
        if (initialValues.premiumStr !== undefined) setPremiumStr(initialValues.premiumStr);
        if (initialValues.selectedDays !== undefined) setSelectedDays(initialValues.selectedDays);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentional: seed once on mount

    // Restore form values from a resumable approval transaction (close/reopen)
    useEffect(() => {
        if (!resumableMeta) return;
        if (resumableMeta['optionType'] !== undefined) setOptionType(Number(resumableMeta['optionType']));
        if (resumableMeta['amount'] !== undefined) setAmountStr(resumableMeta['amount']);
        if (resumableMeta['strike'] !== undefined) setStrikeStr(resumableMeta['strike']);
        if (resumableMeta['premium'] !== undefined) setPremiumStr(resumableMeta['premium']);
        if (resumableMeta['days'] !== undefined) setSelectedDays(Number(resumableMeta['days']));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentional: restore once on mount

    const [validationError, setValidationError] = useState<string | null>(null);
    const [txStatus, setTxStatus] = useState<'idle' | 'approving' | 'writing' | 'done' | 'error'>('idle');
    const [txError, setTxError] = useState<string | null>(null);
    const [txId, setTxId] = useState<string | null>(null);

    const { trackApproval, trackAction, resumableMeta } = useTransactionFlow(poolAddress);

    const amount = parseBigIntTokens(amountStr);
    const strike = parseBigIntTokens(strikeStr);

    // CALL collateral = underlyingAmount (MOTO)
    // PUT collateral  = (strikePrice * underlyingAmount) / 1e18 (PILL) — fixed-point, both 18-decimal
    const collateral = amount && (optionType === OptionType.CALL
        ? amount
        : strike ? strike * amount / (10n ** 18n) : null);

    // Black-Scholes suggested premium
    const { suggestedPremium, annualizedVol } = useSuggestedPremium(
        optionType, strikeStr, amountStr, expiryBlocks, motoPillRatio ?? null, volatility / 100,
    );

    // Resolve pool hex for allowance spender
    const [poolHex, setPoolHex] = useState<string | null>(null);
    useEffect(() => {
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

    // CALL locks MOTO (underlying), PUT locks PILL (premiumToken)
    const collateralToken = optionType === OptionType.CALL ? poolInfo.underlying : poolInfo.premiumToken;
    const collateralSymbol = optionType === OptionType.CALL ? 'MOTO' : 'PILL';

    const { info: tokenInfo, loading: tokenLoading, refetch: refetchToken } = useTokenInfo({
        tokenAddress: collateralToken,
        spenderHex: poolHex,
        walletAddress: address,
        provider,
    });

    const balance = tokenInfo?.balance ?? null;
    const allowance = tokenInfo?.allowance ?? null;
    const needsApproval = collateral !== null && allowance !== null && allowance < collateral;

    function validate(): string | null {
        if (!amount || amount <= 0n) return 'Amount must be greater than 0';
        const strikeVal = parseBigIntTokens(strikeStr);
        if (!strikeVal || strikeVal <= 0n) return 'Strike price must be greater than 0';
        const premium = parseBigIntTokens(premiumStr);
        if (!premium || premium < 0n) return 'Premium must be 0 or greater';
        if (selectedDays < 1 || selectedDays > 365) return 'Expiry must be between 1 and 365 days';
        if (balance !== null && collateral !== null && collateral > balance)
            return `Insufficient ${collateralSymbol} balance`;
        return null;
    }

    async function handleApprove() {
        if (!address || !poolHex || !collateral) return;
        setValidationError(null);
        setTxError(null);
        setTxStatus('approving');

        try {
            const tokenContract = getContract(
                collateralToken,
                TOKEN_APPROVE_ABI,
                provider,
                network,
                address,
            ) as unknown as Record<string, (...args: unknown[]) => { sendTransaction: (p: unknown) => Promise<{ transactionId: string }> }>;

            const callResult = await tokenContract['increaseAllowance'](Address.fromString(poolHex), collateral);
            const receipt = await callResult.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress ?? '',
                maximumAllowedSatToSpend: MAX_SAT,
                network,
            });

            if (!mounted.current) return;
            setTxId(receipt.transactionId);
            trackApproval(receipt.transactionId, `Approve ${collateralSymbol} for Write`, {
                optionType: String(optionType),
                strike: strikeStr,
                amount: amountStr,
                premium: premiumStr,
                days: String(selectedDays),
            });
            refetchToken();
            setTxStatus('idle');
        } catch (err) {
            if (!mounted.current) return;
            setTxError(err instanceof Error ? err.message : 'Approval failed');
            setTxStatus('error');
        }
    }

    async function handleWrite() {
        const err = validate();
        if (err) {
            setValidationError(err);
            return;
        }
        if (!address) return;

        const strike = parseBigIntTokens(strikeStr)!;
        const premium = parseBigIntTokens(premiumStr)!;
        const duration = BigInt(expiryBlocks);

        setValidationError(null);
        setTxError(null);
        setTxStatus('writing');

        try {
            // Contract expects absolute block number, not relative duration
            const currentBlock = await provider.getBlockNumber();
            const expiry = BigInt(currentBlock) + duration;
            const poolContract = getContract(
                poolAddress,
                POOL_WRITE_ABI,
                provider,
                network,
                address,
            ) as unknown as Record<string, (...args: unknown[]) => { sendTransaction: (p: unknown) => Promise<{ transactionId: string }> }>;

            const callResult = await poolContract['writeOption'](
                optionType,
                strike,
                expiry,
                amount!,
                premium,
            );
            const receipt = await callResult.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress ?? '',
                maximumAllowedSatToSpend: MAX_SAT,
                network,
            });

            if (!mounted.current) return;
            setTxId(receipt.transactionId);
            trackAction(receipt.transactionId, 'writeOption', 'Write Option');
            setTxStatus('done');
        } catch (err) {
            if (!mounted.current) return;
            setTxError(err instanceof Error ? err.message : 'Write option failed');
            setTxStatus('error');
        }
    }

    const busy = txStatus === 'approving' || txStatus === 'writing';

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                data-testid="panel-backdrop"
            />

            {/* Slide-in panel */}
            <div
                className="fixed top-0 right-0 h-full w-full max-w-sm bg-terminal-bg-elevated border-l border-terminal-border-subtle shadow-2xl z-50 overflow-y-auto"
                data-testid="write-option-panel"
            >
                <div className="p-6 space-y-5">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-terminal-text-primary font-mono">
                            Write Option
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-terminal-text-muted hover:text-terminal-text-primary text-xl leading-none"
                            aria-label="Close panel"
                        >
                            ✕
                        </button>
                    </div>

                    <hr className="border-terminal-border-subtle" />

                    {/* Option Type */}
                    <div>
                        <label className="block text-xs text-terminal-text-muted font-mono mb-2">Type</label>
                        <div className="flex gap-2">
                            {[OptionType.CALL, OptionType.PUT].map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setOptionType(t)}
                                    className={`flex-1 py-2 text-sm font-mono rounded border transition-colors ${
                                        optionType === t
                                            ? t === OptionType.CALL
                                                ? 'bg-green-900/40 border-green-500 text-green-300'
                                                : 'bg-rose-900/40 border-rose-500 text-rose-300'
                                            : 'border-terminal-border-subtle text-terminal-text-muted hover:text-terminal-text-primary'
                                    }`}
                                    data-testid={`type-${t === OptionType.CALL ? 'call' : 'put'}`}
                                >
                                    {t === OptionType.CALL ? 'CALL' : 'PUT'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="block text-xs text-terminal-text-muted font-mono mb-1">
                            Amount (MOTO)
                        </label>
                        <div className="flex items-center gap-2 border border-terminal-border-subtle rounded px-3 py-2">
                            <input
                                type="text"
                                inputMode="decimal"
                                value={amountStr}
                                onChange={(e) => setAmountStr(e.target.value.replace(',', '.'))}
                                className="flex-1 bg-transparent text-terminal-text-primary font-mono text-sm outline-none"
                                placeholder="1.0"
                                data-testid="input-amount"
                            />
                            <span className="text-terminal-text-muted text-xs font-mono">MOTO</span>
                        </div>
                    </div>

                    {/* Strike */}
                    <div>
                        <label className="block text-xs text-terminal-text-muted font-mono mb-1">
                            Strike Price (PILL)
                        </label>
                        <div className="flex items-center gap-2 border border-terminal-border-subtle rounded px-3 py-2">
                            <input
                                type="text"
                                inputMode="decimal"
                                value={strikeStr}
                                onChange={(e) => setStrikeStr(e.target.value.replace(',', '.'))}
                                className="flex-1 bg-transparent text-terminal-text-primary font-mono text-sm outline-none"
                                placeholder="50.0"
                                data-testid="input-strike"
                            />
                            <span className="text-terminal-text-muted text-xs font-mono">PILL</span>
                        </div>
                    </div>

                    {/* Premium */}
                    <div>
                        <label className="block text-xs text-terminal-text-muted font-mono mb-1">
                            Premium (PILL)
                        </label>
                        <div className="flex items-center gap-2 border border-terminal-border-subtle rounded px-3 py-2">
                            <input
                                type="text"
                                inputMode="decimal"
                                value={premiumStr}
                                onChange={(e) => setPremiumStr(e.target.value.replace(',', '.'))}
                                className="flex-1 bg-transparent text-terminal-text-primary font-mono text-sm outline-none"
                                placeholder="5.0"
                                data-testid="input-premium"
                            />
                            <span className="text-terminal-text-muted text-xs font-mono">PILL</span>
                        </div>
                        {suggestedPremium !== null && suggestedPremium > 0n && (
                            <div className="mt-1.5 space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-terminal-text-muted font-mono">
                                        Fair value: <span className="text-cyan-400">{formatBigInt(suggestedPremium)} PILL</span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setPremiumStr(formatBigInt(suggestedPremium))}
                                        className="text-[10px] text-cyan-400 hover:text-cyan-300 font-mono underline cursor-pointer"
                                        data-testid="bs-suggestion"
                                    >
                                        [Use]
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowVolSlider(!showVolSlider)}
                                        className="text-[10px] text-terminal-text-muted hover:text-terminal-text-primary font-mono cursor-pointer"
                                        data-testid="vol-adjust-toggle"
                                    >
                                        [Adjust]
                                    </button>
                                    <span
                                        className="text-[10px] text-terminal-text-muted cursor-help"
                                        title="Estimated using Black-Scholes pricing. Depends on current MOTO/PILL price, time to expiry, and expected volatility. You can set any premium — this is just a reference."
                                    >
                                        ?
                                    </span>
                                </div>
                                <p className="text-[10px] text-terminal-text-muted font-mono">
                                    Based on {Math.round(annualizedVol * 100)}% annual volatility
                                </p>
                                {showVolSlider && (
                                    <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-2.5 space-y-1.5" data-testid="vol-slider-panel">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] text-terminal-text-muted font-mono">Volatility: {volatility}%</label>
                                        </div>
                                        <input
                                            type="range"
                                            min={20}
                                            max={200}
                                            step={5}
                                            value={volatility}
                                            onChange={(e) => {
                                                const val = Number(e.target.value);
                                                setVolatility(val);
                                                localStorage.setItem('frogop_vol_pref', String(val));
                                            }}
                                            className="w-full h-1 accent-accent cursor-pointer"
                                            data-testid="vol-slider"
                                        />
                                        <p className="text-[9px] text-terminal-text-muted font-mono">
                                            Higher volatility = higher fair value. 80% is typical for altcoins.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Expiry */}
                    <div>
                        <label className="block text-xs text-terminal-text-muted font-mono mb-2">
                            Expiry Duration
                        </label>
                        <div className="flex flex-wrap gap-2" data-testid="expiry-presets">
                            {DAY_PRESETS.map(({ label, days }) => (
                                <button
                                    key={days}
                                    type="button"
                                    onClick={() => setSelectedDays(days)}
                                    className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
                                        selectedDays === days
                                            ? 'bg-accent text-white border-accent'
                                            : 'border-terminal-border-subtle text-terminal-text-muted hover:text-terminal-text-primary'
                                    }`}
                                    data-testid={`expiry-${label}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-terminal-text-muted font-mono mt-1.5">
                            {expiryBlocks.toLocaleString()} blocks
                        </p>
                    </div>

                    {/* Collateral summary */}
                    <div className="bg-terminal-bg-primary border border-terminal-border-subtle rounded p-3 space-y-1.5 text-xs font-mono">
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Collateral</span>
                            <span className="text-terminal-text-primary">
                                {collateral ? `${formatBigInt(collateral)} ${collateralSymbol}` : '—'}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Your balance</span>
                            <span className={balance !== null && collateral !== null && balance >= collateral ? 'text-green-400' : 'text-rose-400'}>
                                {tokenLoading ? '...' : balance !== null ? `${formatBigInt(balance)} ${collateralSymbol}` : '—'}
                                {balance !== null && collateral !== null && balance >= collateral ? ' ✓' : ''}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-terminal-text-muted">Allowance</span>
                            <span className={needsApproval ? 'text-yellow-400' : 'text-terminal-text-secondary'}>
                                {tokenLoading ? '...' : allowance !== null ? `${formatBigInt(allowance)} ${collateralSymbol}` : '—'}
                                {needsApproval ? ' ← req' : ''}
                            </span>
                        </div>
                    </div>

                    {/* Validation error */}
                    {validationError && (
                        <p className="text-rose-400 text-xs font-mono" data-testid="validation-error">
                            {validationError}
                        </p>
                    )}

                    {/* TX error */}
                    {txError && (
                        <p className="text-rose-400 text-xs font-mono" data-testid="tx-error">
                            {txError}
                        </p>
                    )}

                    {/* TX success */}
                    {txStatus === 'done' && txId && (
                        <div className="bg-green-900/20 border border-green-700 rounded p-3 text-xs font-mono">
                            <p className="text-green-300 mb-1">Transaction broadcast!</p>
                            <p className="text-terminal-text-muted break-all">{txId}</p>
                            <p className="text-terminal-text-muted mt-1.5">
                                Confirms in next block (~10 min). You can close this — check the transaction pill for updates.
                            </p>
                            <button
                                className="mt-2 btn-primary px-3 py-1 text-xs rounded"
                                onClick={onSuccess}
                            >
                                Done
                            </button>
                        </div>
                    )}

                    {/* Approval pending hint */}
                    {txId && txStatus === 'idle' && (
                        <div className="flex items-center gap-2 text-xs font-mono">
                            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                            <span className="text-yellow-400">
                                Waiting for approval (~10 min)... {txId.slice(0, 12)}…
                            </span>
                        </div>
                    )}

                    {/* Action buttons */}
                    {txStatus !== 'done' && (
                        <div className="space-y-2">
                            {needsApproval && (
                                <button
                                    onClick={handleApprove}
                                    disabled={busy || tokenLoading}
                                    className="w-full btn-primary py-2.5 text-sm rounded disabled:opacity-50"
                                    data-testid="btn-approve"
                                >
                                    {txStatus === 'approving' ? 'Approving…' : `Approve ${collateralSymbol}`}
                                </button>
                            )}
                            {!needsApproval && (
                                <button
                                    onClick={handleWrite}
                                    disabled={busy || tokenLoading}
                                    className="w-full btn-primary py-2.5 text-sm rounded disabled:opacity-50"
                                    data-testid="btn-write"
                                >
                                    {txStatus === 'writing' ? 'Writing…' : 'Write Option'}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
