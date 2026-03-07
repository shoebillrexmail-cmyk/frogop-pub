import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Unmock the hook under test (global setup.ts mocks it)
vi.unmock('../useNextBlockEstimate.ts');

vi.mock('../useWebSocketProvider.ts', () => ({
    useWsBlock: vi.fn(() => null),
}));

import { useWsBlock } from '../useWebSocketProvider.ts';
import { useNextBlockEstimate } from '../useNextBlockEstimate.ts';

describe('useNextBlockEstimate', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns zeros when no block info', () => {
        const { result } = renderHook(() => useNextBlockEstimate());
        expect(result.current.secondsSinceLastBlock).toBe(0);
        expect(result.current.estimatedSecondsToNext).toBe(0);
        expect(result.current.progressPercent).toBe(0);
        expect(result.current.lastBlockTimestamp).toBeNull();
    });

    it('computes countdown from block timestamp', () => {
        const blockTime = Date.now() - 120_000; // 2 minutes ago
        vi.mocked(useWsBlock).mockReturnValue({
            blockNumber: 3670n,
            timestamp: BigInt(blockTime),
            blockHash: '0xabc',
        });

        const { result } = renderHook(() => useNextBlockEstimate());
        expect(result.current.secondsSinceLastBlock).toBe(120);
        expect(result.current.estimatedSecondsToNext).toBe(480); // 600 - 120
        expect(result.current.progressPercent).toBe(20); // 120/600 * 100
        expect(result.current.lastBlockTimestamp).toBe(blockTime);
    });

    it('ticks every second', () => {
        const blockTime = Date.now() - 60_000; // 1 minute ago
        vi.mocked(useWsBlock).mockReturnValue({
            blockNumber: 3670n,
            timestamp: BigInt(blockTime),
            blockHash: '0xabc',
        });

        const { result } = renderHook(() => useNextBlockEstimate());
        const initialSeconds = result.current.secondsSinceLastBlock;

        act(() => { vi.advanceTimersByTime(5000); });
        expect(result.current.secondsSinceLastBlock).toBe(initialSeconds + 5);
    });

    it('clamps at 100% when overdue', () => {
        const blockTime = Date.now() - 700_000; // 700s ago (> 600)
        vi.mocked(useWsBlock).mockReturnValue({
            blockNumber: 3670n,
            timestamp: BigInt(blockTime),
            blockHash: '0xabc',
        });

        const { result } = renderHook(() => useNextBlockEstimate());
        expect(result.current.progressPercent).toBe(100);
        expect(result.current.estimatedSecondsToNext).toBe(0);
    });
});
