import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ChainPage } from '../ChainPage.tsx';

// Mock walletconnect
vi.mock('@btc-vision/walletconnect', () => ({
    default: ({ children }: { children: unknown }) => children,
    useWalletConnect: vi.fn(() => ({
        walletAddress: null,
        connecting: false,
        openConnectModal: vi.fn(),
        disconnect: vi.fn(),
        address: null,
        provider: null,
        network: null,
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

vi.mock('../../hooks/usePool.ts', () => ({
    usePool: () => ({ poolInfo: null, options: [], loading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('../../hooks/useTokenInfo.ts', () => ({
    useTokenInfo: () => ({ info: null, loading: false, error: null, refetch: vi.fn() }),
}));

function renderChain(path = '/chain') {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="chain" element={<ChainPage />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('ChainPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders page heading', () => {
        renderChain();
        expect(screen.getByText('Option Chain')).toBeInTheDocument();
    });

    it('renders market tabs', () => {
        renderChain();
        expect(screen.getByTestId('chain-market-tabs')).toBeInTheDocument();
    });

    it('renders tab for each pool', () => {
        renderChain();
        expect(screen.getByTestId('chain-tab-opt1pool1')).toBeInTheDocument();
    });

    it('auto-selects first pool when no market param', () => {
        renderChain('/chain');
        // The tab should be active (accent colored)
        const tab = screen.getByTestId('chain-tab-opt1pool1');
        expect(tab.className).toContain('bg-accent');
    });
});
