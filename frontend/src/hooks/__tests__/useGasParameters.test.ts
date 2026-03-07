import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Unmock the hook under test (global setup.ts mocks it)
vi.unmock('../useGasParameters.ts');

// Mock useWsBlock before importing hook
vi.mock('../useWebSocketProvider.ts', () => ({
    useWsBlock: vi.fn(() => null),
}));

import { useWsBlock } from '../useWebSocketProvider.ts';
import { useGasParameters } from '../useGasParameters.ts';

const mockGasParams = {
    blockNumber: 3670n,
    gasUsed: 1000n,
    targetGasLimit: 5000n,
    ema: 100n,
    baseGas: 10n,
    gasPerSat: 250n,
    bitcoin: {
        conservative: 3,
        recommended: { low: 1, medium: 2, high: 3 },
    },
};

function createMockProvider() {
    return {
        gasParameters: vi.fn().mockResolvedValue(mockGasParams),
    } as unknown as import('opnet').AbstractRpcProvider;
}

describe('useGasParameters', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns null when no provider', () => {
        const { result } = renderHook(() => useGasParameters(null));
        expect(result.current.gasParams).toBeNull();
        expect(result.current.loading).toBe(false);
    });

    it('fetches gas parameters from provider', async () => {
        const provider = createMockProvider();
        const { result } = renderHook(() => useGasParameters(provider));

        await waitFor(() => {
            expect(result.current.gasParams).toEqual(mockGasParams);
        });
        expect(provider.gasParameters).toHaveBeenCalledOnce();
    });

    it('sets error on fetch failure', async () => {
        const provider = createMockProvider();
        vi.mocked(provider.gasParameters).mockRejectedValueOnce(new Error('RPC down'));

        const { result } = renderHook(() => useGasParameters(provider));

        await waitFor(() => {
            expect(result.current.error).toBe('RPC down');
        });
    });

    it('re-fetches when wsBlock changes', async () => {
        const provider = createMockProvider();
        vi.mocked(useWsBlock).mockReturnValue({
            blockNumber: 100n,
            timestamp: BigInt(Date.now()),
            blockHash: '0xabc',
        });

        const { result, rerender } = renderHook(() => useGasParameters(provider));

        await waitFor(() => {
            expect(result.current.gasParams).toEqual(mockGasParams);
        });

        vi.mocked(useWsBlock).mockReturnValue({
            blockNumber: 101n,
            timestamp: BigInt(Date.now()),
            blockHash: '0xdef',
        });
        rerender();

        await waitFor(() => {
            expect(provider.gasParameters).toHaveBeenCalledTimes(2);
        });
    });
});
