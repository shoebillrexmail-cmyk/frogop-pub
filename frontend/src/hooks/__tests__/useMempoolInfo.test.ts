import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Unmock the hook under test (global setup.ts mocks it)
vi.unmock('../useMempoolInfo.ts');

vi.mock('../useWebSocketProvider.ts', () => ({
    useWsBlock: vi.fn(() => null),
}));

import { useWsBlock } from '../useWebSocketProvider.ts';
import { useMempoolInfo } from '../useMempoolInfo.ts';

const mockMempoolInfo = { count: 2813, opnetCount: 1397, size: 4_800_000 };

function createMockProvider() {
    return {
        getMempoolInfo: vi.fn().mockResolvedValue(mockMempoolInfo),
    } as unknown as import('opnet').AbstractRpcProvider;
}

describe('useMempoolInfo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns null when no provider', () => {
        const { result } = renderHook(() => useMempoolInfo(null));
        expect(result.current.mempoolInfo).toBeNull();
        expect(result.current.loading).toBe(false);
    });

    it('fetches mempool info from provider', async () => {
        const provider = createMockProvider();
        const { result } = renderHook(() => useMempoolInfo(provider));

        await waitFor(() => {
            expect(result.current.mempoolInfo).toEqual(mockMempoolInfo);
        });
        expect(provider.getMempoolInfo).toHaveBeenCalledOnce();
    });

    it('sets error on fetch failure', async () => {
        const provider = createMockProvider();
        vi.mocked(provider.getMempoolInfo).mockRejectedValueOnce(new Error('Timeout'));

        const { result } = renderHook(() => useMempoolInfo(provider));

        await waitFor(() => {
            expect(result.current.error).toBe('Timeout');
        });
    });

    it('re-fetches when wsBlock changes', async () => {
        const provider = createMockProvider();
        vi.mocked(useWsBlock).mockReturnValue({
            blockNumber: 100n,
            timestamp: BigInt(Date.now()),
            blockHash: '0xabc',
        });

        const { result, rerender } = renderHook(() => useMempoolInfo(provider));

        await waitFor(() => {
            expect(result.current.mempoolInfo).toEqual(mockMempoolInfo);
        });

        vi.mocked(useWsBlock).mockReturnValue({
            blockNumber: 101n,
            timestamp: BigInt(Date.now()),
            blockHash: '0xdef',
        });
        rerender();

        await waitFor(() => {
            expect(provider.getMempoolInfo).toHaveBeenCalledTimes(2);
        });
    });
});
