/**
 * statusLabels — user-perspective status labels for the Portfolio view.
 *
 * Instead of raw "PURCHASED" / "OPEN", shows context-aware labels like
 * "Sold to buyer" (for writers) or "You own this" (for buyers).
 */
import { OptionStatus } from '../services/types.ts';
import type { OptionData } from '../services/types.ts';

const ZERO_HEX = '0x' + '0'.repeat(64);

export function getUserStatusLabel(option: OptionData, walletHex: string | null): string {
    const isWriter = walletHex !== null && option.writer.toLowerCase() === walletHex.toLowerCase();
    const isBuyer =
        walletHex !== null &&
        option.buyer !== ZERO_HEX &&
        option.buyer.toLowerCase() === walletHex.toLowerCase();

    switch (option.status) {
        case OptionStatus.OPEN:
            if (isWriter) return 'Listed for sale';
            return 'OPEN';

        case OptionStatus.PURCHASED:
            if (isWriter) return 'Sold to buyer';
            if (isBuyer) return 'You own this';
            return 'PURCHASED';

        case OptionStatus.EXERCISED:
            if (isWriter) return 'Exercised against you';
            if (isBuyer) return 'You exercised';
            return 'EXERCISED';

        case OptionStatus.EXPIRED:
            if (isWriter) return 'Expired (settle available)';
            return 'EXPIRED';

        case OptionStatus.CANCELLED:
            if (isWriter) return 'You cancelled';
            return 'CANCELLED';

        default:
            return `STATUS_${option.status}`;
    }
}
