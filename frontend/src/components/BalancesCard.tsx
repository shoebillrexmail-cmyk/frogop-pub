/**
 * BalancesCard — shows MOTO and PILL token balances for the connected wallet.
 */
import { formatTokenAmount } from '../config/index.ts';

interface BalancesCardProps {
    motoBalance: bigint | null;
    pillBalance: bigint | null;
    loading: boolean;
}

export function BalancesCard({ motoBalance, pillBalance, loading }: BalancesCardProps) {
    function fmt(v: bigint | null): string {
        if (loading) return '…';
        if (v === null) return '—';
        return formatTokenAmount(v);
    }

    return (
        <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-5">
            <h3 className="text-sm font-bold text-terminal-text-muted font-mono uppercase tracking-wider mb-3">
                Balances
            </h3>
            <div className="space-y-2 font-mono text-sm">
                <div className="flex justify-between">
                    <span className="text-terminal-text-muted">MOTO</span>
                    <span className="text-terminal-text-primary" data-testid="moto-balance">
                        {fmt(motoBalance)}
                    </span>
                </div>
                <div className="flex justify-between">
                    <span className="text-terminal-text-muted">PILL</span>
                    <span className="text-terminal-text-primary" data-testid="pill-balance">
                        {fmt(pillBalance)}
                    </span>
                </div>
            </div>
        </div>
    );
}
