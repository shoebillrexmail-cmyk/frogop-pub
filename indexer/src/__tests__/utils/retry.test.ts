/**
 * retryRpc tests — exponential backoff, transient vs non-transient errors.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryRpc } from '../../utils/retry.js';

beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('retryRpc', () => {
    it('returns result on first success', async () => {
        const fn = vi.fn().mockResolvedValue(42);
        const result = await retryRpc(fn);
        expect(result).toBe(42);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on transient error and succeeds', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('fetch failed'))
            .mockResolvedValue('ok');

        const result = await retryRpc(fn, 3, 1);
        expect(result).toBe('ok');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('gives up after maxRetries', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('timeout'));

        await expect(retryRpc(fn, 2, 1)).rejects.toThrow('timeout');
        // 1 initial + 2 retries = 3 total
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('does not retry non-transient errors', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('Invalid calldata'));

        await expect(retryRpc(fn, 3, 100)).rejects.toThrow('Invalid calldata');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries 429 rate limit errors', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('429 rate limit exceeded'))
            .mockResolvedValue('ok');

        const result = await retryRpc(fn, 2, 1);
        expect(result).toBe('ok');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('retries 503 errors', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('503 Service Unavailable'))
            .mockResolvedValue('ok');

        expect(await retryRpc(fn, 2, 1)).toBe('ok');
    });

    it('works with zero maxRetries (no retry)', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('timeout'));
        await expect(retryRpc(fn, 0, 1)).rejects.toThrow('timeout');
        expect(fn).toHaveBeenCalledTimes(1);
    });
});
