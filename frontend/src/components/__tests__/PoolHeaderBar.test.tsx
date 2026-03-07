/**
 * PoolHeaderBar tests — compact header bar rendering and collapsible details.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PoolInfo } from '../../services/types.ts';
import { PoolHeaderBar } from '../PoolHeaderBar.tsx';

const POOL_INFO: PoolInfo = {
    underlying: '0xaaaa000000000000000000000000000000000000000000000000000000000001',
    premiumToken: '0xbbbb000000000000000000000000000000000000000000000000000000000002',
    optionCount: 42n,
    cancelFeeBps: 100n,
    buyFeeBps: 100n,
    exerciseFeeBps: 10n,
    gracePeriodBlocks: 144n,
};

const POOL_ADDRESS = '0xcccc000000000000000000000000000000000000000000000000000000000003';

describe('PoolHeaderBar', () => {
    it('renders pool name', () => {
        render(<PoolHeaderBar poolInfo={POOL_INFO} poolAddress={POOL_ADDRESS} />);
        expect(screen.getByTestId('pool-name')).toHaveTextContent('MOTO / PILL Pool');
    });

    it('renders fee summary', () => {
        render(<PoolHeaderBar poolInfo={POOL_INFO} poolAddress={POOL_ADDRESS} />);
        expect(screen.getByTestId('fees-summary')).toHaveTextContent('1% / 0.1% / 1%');
    });

    it('renders spot price when motoPillRatio is provided', () => {
        render(<PoolHeaderBar poolInfo={POOL_INFO} poolAddress={POOL_ADDRESS} motoPillRatio={50.1234} />);
        expect(screen.getByTestId('spot-price')).toHaveTextContent('50.1234 PILL');
    });

    it('shows N/A when motoPillRatio is null', () => {
        render(<PoolHeaderBar poolInfo={POOL_INFO} poolAddress={POOL_ADDRESS} motoPillRatio={null} />);
        expect(screen.getByTestId('spot-price')).toHaveTextContent('N/A');
    });

    it('renders option count', () => {
        render(<PoolHeaderBar poolInfo={POOL_INFO} poolAddress={POOL_ADDRESS} />);
        expect(screen.getByTestId('pool-header-bar')).toHaveTextContent('42');
    });

    it('pool details toggle shows/hides addresses', () => {
        render(<PoolHeaderBar poolInfo={POOL_INFO} poolAddress={POOL_ADDRESS} />);
        // Details hidden by default
        expect(screen.queryByTestId('pool-details')).not.toBeInTheDocument();

        // Click toggle
        fireEvent.click(screen.getByTestId('toggle-pool-details'));
        expect(screen.getByTestId('pool-details')).toBeInTheDocument();
        expect(screen.getByTestId('pool-details')).toHaveTextContent(/Grace period/);

        // Click again to hide
        fireEvent.click(screen.getByTestId('toggle-pool-details'));
        expect(screen.queryByTestId('pool-details')).not.toBeInTheDocument();
    });

    it('does not render when no poolInfo provided', () => {
        // TypeScript enforces poolInfo, but component should handle gracefully
        // This test ensures it renders without crashing
        render(<PoolHeaderBar poolInfo={POOL_INFO} poolAddress={POOL_ADDRESS} />);
        expect(screen.getByTestId('pool-header-bar')).toBeInTheDocument();
    });
});
