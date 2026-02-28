/**
 * usePool hook tests — verify loading states, error handling, and data rendering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { OptionData, PoolInfo } from '../../services/types.ts';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports so vi.mock hoisting works
// ---------------------------------------------------------------------------

vi.mock('@btc-vision/walletconnect', () => ({
    default: ({ children }: { children: unknown }) => children,
    useWalletConnect: vi.fn(() => ({
        walletAddress: null,
        connecting: false,
        openConnectModal: vi.fn(),
        disconnect: vi.fn(),
        provider: null,
    })),
}));

// Shared mock functions used by all PoolService instances in tests
const mockGetPoolInfo = vi.fn();
const mockGetAllOptions = vi.fn();

vi.mock('../../services/pool.ts', () => ({
    PoolService: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
        this.getPoolInfo = mockGetPoolInfo;
        this.getAllOptions = mockGetAllOptions;
    }),
}));

import { useWalletConnect } from '@btc-vision/walletconnect';
import { usePool } from '../usePool.ts';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockPoolInfo: PoolInfo = {
    underlying: '0xaabb0000000000000000000000000000000000000000000000000000000001',
    premiumToken: '0xccdd0000000000000000000000000000000000000000000000000000000002',
    optionCount: 2n,
    cancelFeeBps: 100n,
    buyFeeBps: 100n,
    exerciseFeeBps: 10n,
    gracePeriodBlocks: 144n,
};

const mockOptions: OptionData[] = [
    {
        id: 0n,
        writer: '0xdead0000000000000000000000000000000000000000000000000000000001',
        buyer: '0x0000000000000000000000000000000000000000000000000000000000000000',
        optionType: 0,
        strikePrice: 50n,
        underlyingAmount: 10n ** 18n,
        premium: 5n * 10n ** 17n,
        expiryBlock: 900000n,
        status: 0,
    },
];

function makeMockProvider() {
    return { call: vi.fn(), getPublicKeyInfo: vi.fn() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePool', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: disconnected, no provider
        vi.mocked(useWalletConnect).mockReturnValue({
            walletAddress: null,
            connecting: false,
            openConnectModal: vi.fn(),
            disconnect: vi.fn(),
            provider: null,
        } as ReturnType<typeof useWalletConnect>);
    });

    it('returns empty state when poolAddress is null', () => {
        const { result } = renderHook(() => usePool(null));
        expect(result.current.loading).toBe(false);
        expect(result.current.options).toEqual([]);
        expect(result.current.poolInfo).toBeNull();
        expect(result.current.error).toBeNull();
    });

    it('returns empty state when provider is null', () => {
        const { result } = renderHook(() => usePool('opt1pftest'));
        expect(result.current.loading).toBe(false);
        expect(result.current.poolInfo).toBeNull();
    });

    it('loads pool info and options when provider + address are available', async () => {
        const provider = makeMockProvider();
        vi.mocked(useWalletConnect).mockReturnValue({
            walletAddress: 'opt1pftest',
            connecting: false,
            openConnectModal: vi.fn(),
            disconnect: vi.fn(),
            provider: provider as ReturnType<typeof useWalletConnect>['provider'],
        } as ReturnType<typeof useWalletConnect>);

        mockGetPoolInfo.mockResolvedValue(mockPoolInfo);
        mockGetAllOptions.mockResolvedValue(mockOptions);

        const { result } = renderHook(() => usePool('opt1pftest000'));

        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.poolInfo).toEqual(mockPoolInfo);
        expect(result.current.options).toEqual(mockOptions);
        expect(result.current.error).toBeNull();
    });

    it('sets error when service throws', async () => {
        const provider = makeMockProvider();
        vi.mocked(useWalletConnect).mockReturnValue({
            walletAddress: 'opt1pftest',
            connecting: false,
            openConnectModal: vi.fn(),
            disconnect: vi.fn(),
            provider: provider as ReturnType<typeof useWalletConnect>['provider'],
        } as ReturnType<typeof useWalletConnect>);

        mockGetPoolInfo.mockRejectedValue(new Error('RPC timeout'));
        mockGetAllOptions.mockResolvedValue([]);

        const { result } = renderHook(() => usePool('opt1pftest000'));

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.error).toMatch(/RPC timeout/);
        expect(result.current.poolInfo).toBeNull();
    });

    it('refetch re-triggers the data load', async () => {
        const provider = makeMockProvider();
        vi.mocked(useWalletConnect).mockReturnValue({
            walletAddress: 'opt1pftest',
            connecting: false,
            openConnectModal: vi.fn(),
            disconnect: vi.fn(),
            provider: provider as ReturnType<typeof useWalletConnect>['provider'],
        } as ReturnType<typeof useWalletConnect>);

        mockGetPoolInfo.mockResolvedValue(mockPoolInfo);
        mockGetAllOptions.mockResolvedValue(mockOptions);

        const { result } = renderHook(() => usePool('opt1pftest000'));
        await waitFor(() => expect(result.current.loading).toBe(false));

        const callsBefore = mockGetPoolInfo.mock.calls.length;
        result.current.refetch();
        await waitFor(() =>
            expect(mockGetPoolInfo.mock.calls.length).toBeGreaterThan(callsBefore)
        );
    });
});
