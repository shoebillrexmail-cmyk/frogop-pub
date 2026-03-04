/**
 * PoolTypeBadge — displays pool type indicator (OP20/OP20, OP20/BTC, BTC/OP20).
 */
import type { PoolType } from '../../../shared/pool-config.types.ts';

interface PoolTypeBadgeProps {
    poolType: PoolType;
    size?: 'sm' | 'md';
}

const POOL_TYPE_CONFIG: Record<PoolType, { label: string; color: string }> = {
    0: { label: 'OP20/OP20', color: 'bg-terminal-bg-primary border-terminal-border-subtle text-terminal-text-muted' },
    1: { label: 'OP20/BTC', color: 'bg-orange-900/30 border-orange-700 text-orange-400' },
    2: { label: 'BTC/OP20', color: 'bg-orange-900/30 border-orange-700 text-orange-400' },
};

export function PoolTypeBadge({ poolType, size = 'sm' }: PoolTypeBadgeProps) {
    const cfg = POOL_TYPE_CONFIG[poolType];
    const sizeClass = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';

    return (
        <span
            className={`font-mono font-semibold rounded border ${sizeClass} ${cfg.color}`}
            data-testid="pool-type-badge"
        >
            {cfg.label}
        </span>
    );
}
