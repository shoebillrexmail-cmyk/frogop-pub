/**
 * EstimatedFee — inline fee estimate for transaction modals.
 *
 * Shows "Est. BTC fee: ~2.0 sat/vB" with a tooltip showing the full range.
 * Returns null when no fee data is available.
 */
import { useNetworkStatus } from '../hooks/useNetworkStatus.ts';
import { formatFeeRate } from '../utils/networkFormat.ts';

export function EstimatedFee() {
    const { btcFees } = useNetworkStatus();

    if (!btcFees) return null;

    return (
        <span
            className="text-xs text-terminal-text-muted font-mono"
            title={`Low: ${formatFeeRate(btcFees.low)} | High: ${formatFeeRate(btcFees.high)}`}
            data-testid="estimated-fee"
        >
            Est. BTC fee: ~{formatFeeRate(btcFees.medium)}
        </span>
    );
}
