/**
 * formatTxError — maps common OPNet/wallet transaction errors to
 * human-readable messages with actionable guidance.
 */

interface FormattedError {
    message: string;
    guidance: string;
}

const ERROR_PATTERNS: Array<{ pattern: RegExp | string; result: FormattedError }> = [
    {
        pattern: 'revert error too long',
        result: {
            message: 'Contract call failed',
            guidance: 'The on-chain transaction reverted. Common causes: option was already purchased or cancelled, insufficient token balance, or stale approval. Refresh the page and try again.',
        },
    },
    {
        pattern: 'mempool-chain',
        result: {
            message: 'Too many pending transactions',
            guidance: 'Wait for at least one pending transaction to confirm before starting another.',
        },
    },
    {
        pattern: 'insufficient funds',
        result: {
            message: 'Insufficient funds for transaction fees',
            guidance: 'Ensure you have enough BTC for network fees (at least 0.001 BTC recommended).',
        },
    },
    {
        pattern: /user (rejected|denied|cancelled)/i,
        result: {
            message: 'Transaction rejected by wallet',
            guidance: 'You cancelled the transaction in your wallet. Click Retry to try again.',
        },
    },
    {
        pattern: 'timeout',
        result: {
            message: 'Transaction timed out',
            guidance: 'The transaction may still confirm. Check the explorer link for status.',
        },
    },
    {
        pattern: /allowance|approve/i,
        result: {
            message: 'Token approval failed',
            guidance: 'The approval transaction was not accepted. Try approving again.',
        },
    },
    {
        pattern: /option.*not.*open/i,
        result: {
            message: 'Option is no longer available',
            guidance: 'This option may have been bought or cancelled. Refresh and try another.',
        },
    },
    {
        pattern: /grace.*period/i,
        result: {
            message: 'Grace period has expired',
            guidance: 'The exercise window has closed. The writer can now settle this option.',
        },
    },
    {
        pattern: /not.*buyer/i,
        result: {
            message: 'You are not the buyer of this option',
            guidance: 'Only the buyer can exercise or transfer this option.',
        },
    },
    {
        pattern: /not.*writer/i,
        result: {
            message: 'You are not the writer of this option',
            guidance: 'Only the writer can cancel, roll, or settle this option.',
        },
    },
    {
        pattern: 'network',
        result: {
            message: 'Network error',
            guidance: 'Check your internet connection and try again.',
        },
    },
];

export function formatTxError(error: string): FormattedError {
    const lowerError = error.toLowerCase();

    for (const { pattern, result } of ERROR_PATTERNS) {
        if (typeof pattern === 'string') {
            if (lowerError.includes(pattern)) return result;
        } else {
            if (pattern.test(error)) return result;
        }
    }

    return {
        message: error.length > 120 ? error.slice(0, 120) + '...' : error,
        guidance: 'Try again. If the problem persists, check the transaction pill for status or refresh the page.',
    };
}
