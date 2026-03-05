/**
 * retryRpc — exponential backoff retry wrapper for RPC calls.
 *
 * Retries on transient errors (network timeouts, 5xx) but gives up
 * immediately on non-transient errors (4xx, invalid calldata).
 */

/** Check if an error is likely transient (worth retrying). */
function isTransient(err: unknown): boolean {
    if (err instanceof Error) {
        const msg = err.message.toLowerCase();
        // Network-level transient errors
        if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('econnrefused')) return true;
        if (msg.includes('fetch failed') || msg.includes('network')) return true;
        // HTTP 5xx errors
        if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) return true;
        // Rate limiting
        if (msg.includes('429') || msg.includes('rate limit')) return true;
    }
    return false;
}

/**
 * Retry an async function with exponential backoff.
 *
 * @param fn        - The async function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param baseDelayMs - Base delay in ms, doubled each retry (default: 500)
 * @returns The result of fn()
 * @throws The last error if all retries exhausted
 */
export async function retryRpc<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 500,
): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            // Don't retry non-transient errors
            if (!isTransient(err)) throw err;
            // Don't delay after last attempt
            if (attempt < maxRetries) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                console.warn(`[retry] Attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${delay}ms:`, err instanceof Error ? err.message : err);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}
