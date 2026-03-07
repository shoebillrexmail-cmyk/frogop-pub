/**
 * OutcomeCard — compact goal-first strategy card.
 *
 * Shows goal title, tagline, risk badge, and optional summary metric.
 * Clicking expands the StrategyConfigurator below.
 */
import type { RiskLevel } from '../utils/strategyMath.ts';

const RISK_STYLES: Record<RiskLevel, { bg: string; text: string; label: string }> = {
    low: { bg: 'bg-green-900/30', text: 'text-green-400', label: 'Low Risk' },
    medium: { bg: 'bg-amber-900/30', text: 'text-amber-400', label: 'Medium Risk' },
    high: { bg: 'bg-rose-900/30', text: 'text-rose-400', label: 'High Risk' },
};

export interface P2PBadge {
    type: 'instant' | 'marketplace' | 'mixed';
    tooltip: string;
}

const P2P_STYLES: Record<P2PBadge['type'], { bg: string; text: string; label: string }> = {
    instant:     { bg: 'bg-green-900/30', text: 'text-green-400', label: 'INSTANT' },
    marketplace: { bg: 'bg-amber-900/30', text: 'text-amber-400', label: 'MARKETPLACE' },
    mixed:       { bg: 'bg-blue-900/30',  text: 'text-blue-400',  label: 'MIXED' },
};

interface OutcomeCardProps {
    goalTitle: string;
    tagline: string;
    riskLevel: RiskLevel;
    summaryMetric?: string;
    p2pBadge?: P2PBadge;
    disabledMessage?: string;
    ctaLink?: { label: string; onClick: () => void };
    active?: boolean;
    disabled?: boolean;
    testId: string;
    onClick: () => void;
}

export function OutcomeCard({
    goalTitle,
    tagline,
    riskLevel,
    summaryMetric,
    p2pBadge,
    disabledMessage,
    ctaLink,
    active = false,
    disabled = false,
    testId,
    onClick,
}: OutcomeCardProps) {
    const risk = RISK_STYLES[riskLevel];

    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={`w-full text-left bg-terminal-bg-elevated border rounded-xl p-4 transition-colors ${
                active
                    ? 'border-accent ring-1 ring-accent/30'
                    : disabled
                        ? 'border-terminal-border-subtle opacity-60 cursor-not-allowed'
                        : 'border-terminal-border-subtle hover:border-accent/50 cursor-pointer'
            }`}
            data-testid={testId}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-terminal-text-primary font-mono leading-tight">
                        {goalTitle}
                    </h4>
                    <p className="text-xs text-terminal-text-muted font-mono mt-0.5">
                        {disabled && disabledMessage ? disabledMessage : tagline}
                    </p>
                    {disabled && ctaLink && (
                        <span
                            role="link"
                            tabIndex={0}
                            className="text-xs text-accent font-mono mt-1 inline-block hover:underline cursor-pointer"
                            data-testid={`${testId}-cta`}
                            onClick={(e) => { e.stopPropagation(); ctaLink.onClick(); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); ctaLink.onClick(); } }}
                        >
                            {ctaLink.label}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${risk.bg} ${risk.text}`}>
                        {risk.label}
                    </span>
                    {p2pBadge && (
                        <span
                            className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${P2P_STYLES[p2pBadge.type].bg} ${P2P_STYLES[p2pBadge.type].text}`}
                            title={p2pBadge.tooltip}
                            data-testid={`${testId}-p2p-badge`}
                        >
                            {P2P_STYLES[p2pBadge.type].label}
                        </span>
                    )}
                </div>
            </div>
            {summaryMetric && (
                <p className="text-xs font-mono text-cyan-400 mt-2">{summaryMetric}</p>
            )}
        </button>
    );
}
