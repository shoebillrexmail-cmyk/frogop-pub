/**
 * ExpiryAlertBanner — persistent banner on Portfolio for urgent expiry countdowns.
 */
import type { ExpiryAlert } from '../hooks/useExpiryAlerts.ts';

interface ExpiryAlertBannerProps {
    alerts: ExpiryAlert[];
}

function blocksToTimeStr(blocks: bigint): string {
    const totalHours = Number(blocks) * 10 / 60;
    const days = Math.floor(totalHours / 24);
    const hours = Math.round(totalHours % 24);
    if (days > 0) return `~${days}d ${hours}h`;
    if (hours > 0) return `~${hours}h`;
    return '<1h';
}

export function ExpiryAlertBanner({ alerts }: ExpiryAlertBannerProps) {
    if (alerts.length === 0) return null;

    const urgent = alerts.filter((a) => a.urgency === 'urgent');
    const warning = alerts.filter((a) => a.urgency === 'warning');

    return (
        <div className="space-y-2" data-testid="expiry-alert-banner">
            {urgent.length > 0 && (
                <div className="flex items-start gap-3 bg-rose-900/20 border border-rose-600 rounded-xl px-5 py-4 text-sm font-mono">
                    <span className="text-rose-400 text-base">!!</span>
                    <div className="text-rose-300 space-y-1">
                        {urgent.map((a) => (
                            <p key={a.optionId}>
                                Option #{a.optionId} — <strong>{blocksToTimeStr(a.blocksLeft)}</strong> to exercise!
                            </p>
                        ))}
                    </div>
                </div>
            )}
            {warning.length > 0 && (
                <div className="flex items-start gap-3 bg-amber-900/20 border border-amber-600 rounded-xl px-5 py-4 text-sm font-mono">
                    <span className="text-amber-400 text-base">!</span>
                    <div className="text-amber-300 space-y-1">
                        {warning.map((a) => (
                            <p key={a.optionId}>
                                Option #{a.optionId} — exercise within {blocksToTimeStr(a.blocksLeft)}
                            </p>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
