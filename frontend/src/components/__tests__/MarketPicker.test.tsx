import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MarketPicker } from '../MarketPicker.tsx';

// Mock hooks
vi.mock('@btc-vision/walletconnect', () => ({
    useWalletConnect: vi.fn(() => ({
        walletAddress: null,
        provider: null,
        address: null,
        network: null,
        connecting: false,
        openConnectModal: vi.fn(),
        disconnect: vi.fn(),
    })),
}));

const mockPools = [
    {
        address: 'opt1pool1',
        underlying: '0xaaa',
        premiumToken: '0xbbb',
        underlyingSymbol: 'MOTO',
        premiumSymbol: 'PILL',
    },
    {
        address: 'opt1pool2',
        underlying: '0xbbb',
        premiumToken: '0xaaa',
        underlyingSymbol: 'PILL',
        premiumSymbol: 'MOTO',
    },
];

vi.mock('../../hooks/useDiscoverPools.ts', () => ({
    useDiscoverPools: vi.fn(() => ({
        pools: mockPools,
        loading: false,
        error: null,
        source: 'config',
        refetch: vi.fn(),
    })),
}));

vi.mock('../../hooks/useFallbackProvider.ts', () => ({
    useFallbackProvider: vi.fn(() => ({})),
}));

describe('MarketPicker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders market groups', () => {
        render(<MarketPicker intentId="earn-yield" onSelect={vi.fn()} />);
        expect(screen.getByTestId('market-picker')).toBeInTheDocument();
    });

    it('fires onSelect when pool clicked', () => {
        const onSelect = vi.fn();
        render(<MarketPicker intentId="earn-yield" onSelect={onSelect} />);
        const poolBtn = screen.getByTestId('market-pool-opt1pool1');
        fireEvent.click(poolBtn);
        expect(onSelect).toHaveBeenCalledWith('opt1pool1');
    });

    it('shows loading state', async () => {
        const { useDiscoverPools } = await import('../../hooks/useDiscoverPools.ts');
        (useDiscoverPools as ReturnType<typeof vi.fn>).mockReturnValue({
            pools: [], loading: true, error: null, source: null, refetch: vi.fn(),
        });
        render(<MarketPicker intentId="earn-yield" onSelect={vi.fn()} />);
        expect(screen.getByTestId('market-picker-loading')).toBeInTheDocument();
    });
});
