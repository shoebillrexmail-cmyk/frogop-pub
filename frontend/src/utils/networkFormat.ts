/**
 * Network status formatting utilities.
 */

const numberFormatter = new Intl.NumberFormat('en-US');

/** Format byte count to human-readable string ("4.8 MB", "128 KB"). */
export function formatBytes(bytes: number): string {
    if (bytes < 0) return '0 B';
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Format seconds to countdown string ("4:32", "0:05", "overdue"). */
export function formatCountdown(totalSeconds: number): string {
    if (totalSeconds <= 0) return 'overdue';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Format fee rate ("2.0 sat/vB"). */
export function formatFeeRate(satPerVB: number): string {
    if (satPerVB < 0) return '0.0 sat/vB';
    return `${satPerVB.toFixed(1)} sat/vB`;
}

/** Format number with locale separators ("2,813"). */
export function formatNumber(n: number): string {
    return numberFormatter.format(n);
}
