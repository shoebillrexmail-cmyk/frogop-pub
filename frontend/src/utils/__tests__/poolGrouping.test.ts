/**
 * poolGrouping tests — grouping logic, edge cases, sort order.
 */
import { describe, it, expect } from 'vitest';
import { groupInversePairs, directionLabel } from '../poolGrouping.ts';
import type { PoolEntry } from '../../services/types.ts';
import type { PoolConfig } from '../../../../shared/pool-config.types.ts';

function makePool(overrides: Partial<PoolEntry> & { address: string }): PoolEntry {
    return {
        underlying: '0xaa',
        premiumToken: '0xbb',
        ...overrides,
    };
}

function makeConfig(poolType: 0 | 1 | 2 = 0): PoolConfig {
    return {
        id: 'test',
        poolType,
        underlying: { symbol: 'A', name: 'A', decimals: 18, addresses: { testnet: '', mainnet: '' } },
        premium: { symbol: 'B', name: 'B', decimals: 18, addresses: { testnet: '', mainnet: '' } },
        pool: { addresses: { testnet: '', mainnet: '' } },
    };
}

const noConfig = () => null;

describe('groupInversePairs', () => {
    it('groups two inverse pools together', () => {
        const pools: PoolEntry[] = [
            makePool({ address: 'pool1', underlying: '0xaa', premiumToken: '0xbb', underlyingSymbol: 'MOTO', premiumSymbol: 'PILL' }),
            makePool({ address: 'pool2', underlying: '0xbb', premiumToken: '0xaa', underlyingSymbol: 'PILL', premiumSymbol: 'MOTO' }),
        ];

        const groups = groupInversePairs(pools, noConfig);
        expect(groups).toHaveLength(1);
        expect(groups[0].market).toBe('MOTO ↔ PILL');
        expect(groups[0].pools[0].address).toBe('pool1');
        expect(groups[0].pools[1]?.address).toBe('pool2');
    });

    it('handles unpaired pools (no matching inverse)', () => {
        const pools: PoolEntry[] = [
            makePool({ address: 'pool1', underlying: '0xaa', premiumToken: '0xbb', underlyingSymbol: 'MOTO', premiumSymbol: 'PILL' }),
            makePool({ address: 'pool3', underlying: '0xcc', premiumToken: '0xdd', underlyingSymbol: 'ALPHA', premiumSymbol: 'BETA' }),
        ];

        const groups = groupInversePairs(pools, noConfig);
        expect(groups).toHaveLength(2);
        // Alphabetical sort: ALPHA ↔ BETA before MOTO ↔ PILL
        expect(groups[0].market).toBe('ALPHA ↔ BETA');
        expect(groups[0].pools[1]).toBeUndefined();
        expect(groups[1].market).toBe('MOTO ↔ PILL');
        expect(groups[1].pools[1]).toBeUndefined();
    });

    it('handles 3 inverse pairs (6 pools)', () => {
        const pools: PoolEntry[] = [
            makePool({ address: 'p1', underlying: '0xa', premiumToken: '0xb', underlyingSymbol: 'MOTO', premiumSymbol: 'PILL' }),
            makePool({ address: 'p2', underlying: '0xb', premiumToken: '0xa', underlyingSymbol: 'PILL', premiumSymbol: 'MOTO' }),
            makePool({ address: 'p3', underlying: '0xa', premiumToken: '0xc', underlyingSymbol: 'MOTO', premiumSymbol: 'BTC' }),
            makePool({ address: 'p4', underlying: '0xc', premiumToken: '0xa', underlyingSymbol: 'BTC', premiumSymbol: 'MOTO' }),
            makePool({ address: 'p5', underlying: '0xb', premiumToken: '0xc', underlyingSymbol: 'PILL', premiumSymbol: 'BTC' }),
            makePool({ address: 'p6', underlying: '0xc', premiumToken: '0xb', underlyingSymbol: 'BTC', premiumSymbol: 'PILL' }),
        ];

        const groups = groupInversePairs(pools, noConfig);
        expect(groups).toHaveLength(3);
        // Alphabetical: BTC ↔ MOTO, BTC ↔ PILL, MOTO ↔ PILL
        expect(groups[0].market).toBe('BTC ↔ MOTO');
        expect(groups[1].market).toBe('BTC ↔ PILL');
        expect(groups[2].market).toBe('MOTO ↔ PILL');
    });

    it('handles empty pools array', () => {
        const groups = groupInversePairs([], noConfig);
        expect(groups).toHaveLength(0);
    });

    it('handles single pool', () => {
        const pools: PoolEntry[] = [
            makePool({ address: 'p1', underlyingSymbol: 'X', premiumSymbol: 'Y' }),
        ];
        const groups = groupInversePairs(pools, noConfig);
        expect(groups).toHaveLength(1);
        expect(groups[0].pools[1]).toBeUndefined();
    });

    it('case-insensitive address matching', () => {
        const pools: PoolEntry[] = [
            makePool({ address: 'p1', underlying: '0xAA', premiumToken: '0xBB', underlyingSymbol: 'A', premiumSymbol: 'B' }),
            makePool({ address: 'p2', underlying: '0xbb', premiumToken: '0xaa', underlyingSymbol: 'B', premiumSymbol: 'A' }),
        ];
        const groups = groupInversePairs(pools, noConfig);
        expect(groups).toHaveLength(1);
        expect(groups[0].pools[1]).toBeDefined();
    });

    it('passes config finder to each pool', () => {
        const cfg = makeConfig(1);
        const pools: PoolEntry[] = [
            makePool({ address: 'p1', underlyingSymbol: 'MOTO', premiumSymbol: 'BTC' }),
        ];
        const groups = groupInversePairs(pools, () => cfg);
        expect(groups[0].configs[0]).toBe(cfg);
    });

    it('does not pair a pool with itself', () => {
        // Pool where underlying === premium (degenerate case)
        const pools: PoolEntry[] = [
            makePool({ address: 'p1', underlying: '0xaa', premiumToken: '0xaa', underlyingSymbol: 'X', premiumSymbol: 'X' }),
        ];
        const groups = groupInversePairs(pools, noConfig);
        expect(groups).toHaveLength(1);
        expect(groups[0].pools[1]).toBeUndefined();
    });
});

describe('directionLabel', () => {
    it('type 0: Lock underlying, earn premium', () => {
        const pool = makePool({ address: 'p1', underlyingSymbol: 'MOTO', premiumSymbol: 'PILL' });
        expect(directionLabel(pool, 0)).toBe('Lock MOTO, earn PILL');
    });

    it('type 1: Lock underlying, earn sats', () => {
        const pool = makePool({ address: 'p1', underlyingSymbol: 'MOTO', premiumSymbol: 'BTC' });
        expect(directionLabel(pool, 1)).toBe('Lock MOTO, earn sats');
    });

    it('type 2: Lock BTC, earn premium', () => {
        const pool = makePool({ address: 'p1', underlyingSymbol: 'BTC', premiumSymbol: 'MOTO' });
        expect(directionLabel(pool, 2)).toBe('Lock BTC, earn MOTO');
    });

    it('uses fallback names when symbols missing', () => {
        const pool = makePool({ address: 'p1' });
        expect(directionLabel(pool, 0)).toBe('Lock Token A, earn Token B');
    });
});
