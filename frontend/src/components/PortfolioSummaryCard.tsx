/**
 * PortfolioSummaryCard — aggregate view of premiums earned/spent, fees, and position counts.
 */
import type { OptionData, PoolInfo } from '../services/types.ts';
import { OptionStatus, OptionType } from '../services/types.ts';
import { formatTokenAmount } from '../config/index.ts';

interface PortfolioSummaryCardProps {
    writtenOptions: OptionData[];
    purchasedOptions: OptionData[];
    poolInfo: PoolInfo | null;
}

function fmt(v: bigint): string {
    return formatTokenAmount(v);
}

function computeSummary(
    writtenOptions: OptionData[],
    purchasedOptions: OptionData[],
    poolInfo: PoolInfo | null,
) {
    let premiumEarned = 0n;
    let premiumSpent = 0n;
    let estimatedFees = 0n;
    let activeWritten = 0;
    let settledWritten = 0;
    let activePurchased = 0;
    let settledPurchased = 0;

    for (const opt of writtenOptions) {
        if (opt.status === OptionStatus.PURCHASED || opt.status === OptionStatus.EXERCISED) {
            premiumEarned += opt.premium;
            activeWritten += opt.status === OptionStatus.PURCHASED ? 1 : 0;
            settledWritten += opt.status === OptionStatus.EXERCISED ? 1 : 0;
        }
        if (opt.status === OptionStatus.OPEN) {
            activeWritten += 1;
        }
        if (opt.status === OptionStatus.CANCELLED) {
            settledWritten += 1;
            if (poolInfo) {
                const isCall = opt.optionType === OptionType.CALL;
                const collateral = isCall
                    ? opt.underlyingAmount
                    : (opt.strikePrice * opt.underlyingAmount) / (10n ** 18n);
                const fee = (collateral * poolInfo.cancelFeeBps + 9999n) / 10000n;
                estimatedFees += fee;
            }
        }
    }

    for (const opt of purchasedOptions) {
        premiumSpent += opt.premium;
        if (poolInfo) {
            const buyFee = (opt.premium * poolInfo.buyFeeBps + 9999n) / 10000n;
            estimatedFees += buyFee;
        }
        if (opt.status === OptionStatus.PURCHASED) {
            activePurchased += 1;
        }
        if (opt.status === OptionStatus.EXERCISED) {
            settledPurchased += 1;
            if (poolInfo) {
                const isCall = opt.optionType === OptionType.CALL;
                const feeBase = isCall
                    ? opt.underlyingAmount
                    : (opt.strikePrice * opt.underlyingAmount) / (10n ** 18n);
                const exFee = (feeBase * poolInfo.exerciseFeeBps + 9999n) / 10000n;
                estimatedFees += exFee;
            }
        }
    }

    const netPremium = premiumEarned - premiumSpent;

    return {
        premiumEarned,
        premiumSpent,
        netPremium,
        estimatedFees,
        activeWritten,
        settledWritten,
        activePurchased,
        settledPurchased,
    };
}

export function PortfolioSummaryCard({
    writtenOptions,
    purchasedOptions,
    poolInfo,
}: PortfolioSummaryCardProps) {
    const s = computeSummary(writtenOptions, purchasedOptions, poolInfo);
    const netPositive = s.netPremium >= 0n;

    return (
        <div
            className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-5 space-y-4"
            data-testid="portfolio-summary-card"
        >
            <h3 className="text-xs font-bold text-terminal-text-muted font-mono uppercase tracking-wider">
                Portfolio Summary
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                    <p className="text-[10px] text-terminal-text-muted font-mono">Premium Earned</p>
                    <p className="text-sm font-mono text-green-400" data-testid="premium-earned">
                        +{fmt(s.premiumEarned)} PILL
                    </p>
                </div>
                <div>
                    <p className="text-[10px] text-terminal-text-muted font-mono">Premium Spent</p>
                    <p className="text-sm font-mono text-rose-400" data-testid="premium-spent">
                        -{fmt(s.premiumSpent)} PILL
                    </p>
                </div>
                <div>
                    <p className="text-[10px] text-terminal-text-muted font-mono">Net Premium</p>
                    <p
                        className={`text-sm font-mono font-bold ${netPositive ? 'text-green-400' : 'text-rose-400'}`}
                        data-testid="net-premium"
                    >
                        {netPositive ? '+' : ''}{fmt(s.netPremium)} PILL
                    </p>
                </div>
                <div>
                    <p className="text-[10px] text-terminal-text-muted font-mono">Est. Fees Paid</p>
                    <p className="text-sm font-mono text-terminal-text-secondary" data-testid="est-fees">
                        ~{fmt(s.estimatedFees)} PILL
                    </p>
                </div>
            </div>

            {/* Position breakdown bar */}
            <PositionBreakdown
                activeWritten={s.activeWritten}
                settledWritten={s.settledWritten}
                activePurchased={s.activePurchased}
                settledPurchased={s.settledPurchased}
            />
        </div>
    );
}

function PositionBreakdown({
    activeWritten,
    settledWritten,
    activePurchased,
    settledPurchased,
}: {
    activeWritten: number;
    settledWritten: number;
    activePurchased: number;
    settledPurchased: number;
}) {
    const total = activeWritten + settledWritten + activePurchased + settledPurchased;

    return (
        <div className="space-y-2" data-testid="position-breakdown">
            <div className="flex items-center gap-4 text-[10px] font-mono flex-wrap">
                <span className="text-terminal-text-muted">
                    Written: <span className="text-terminal-text-primary">{activeWritten} active</span>
                    {settledWritten > 0 && <span className="text-terminal-text-muted">, {settledWritten} settled</span>}
                </span>
                <span className="text-terminal-text-muted">
                    Purchased: <span className="text-terminal-text-primary">{activePurchased} active</span>
                    {settledPurchased > 0 && <span className="text-terminal-text-muted">, {settledPurchased} settled</span>}
                </span>
            </div>
            {total > 0 && (
                <div className="flex h-2 rounded-full overflow-hidden bg-terminal-bg-primary">
                    {activeWritten > 0 && (
                        <div
                            className="bg-green-500"
                            style={{ width: `${(activeWritten / total) * 100}%` }}
                            title={`${activeWritten} active written`}
                        />
                    )}
                    {settledWritten > 0 && (
                        <div
                            className="bg-green-900"
                            style={{ width: `${(settledWritten / total) * 100}%` }}
                            title={`${settledWritten} settled written`}
                        />
                    )}
                    {activePurchased > 0 && (
                        <div
                            className="bg-cyan-500"
                            style={{ width: `${(activePurchased / total) * 100}%` }}
                            title={`${activePurchased} active purchased`}
                        />
                    )}
                    {settledPurchased > 0 && (
                        <div
                            className="bg-cyan-900"
                            style={{ width: `${(settledPurchased / total) * 100}%` }}
                            title={`${settledPurchased} settled purchased`}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
