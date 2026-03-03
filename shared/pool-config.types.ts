/**
 * Shared pool configuration types — consumed by frontend (Vite), indexer, and scripts.
 *
 * Pure type file: NO runtime imports. This keeps it usable from any environment.
 */

export type NetworkId = 'testnet' | 'mainnet';

export interface TokenConfig {
    symbol: string;
    name: string;
    decimals: number;
    addresses: Record<NetworkId, string>;
}

export interface PoolConfig {
    id: string;
    underlying: TokenConfig;
    premium: TokenConfig;
    pool: {
        addresses: Record<NetworkId, string>;
    };
    nativeSwap?: {
        addresses: Record<NetworkId, string>;
    };
}

export interface PoolsConfig {
    pools: PoolConfig[];
    factory: {
        addresses: Record<NetworkId, string>;
    };
    testConfig?: {
        mintAmount: string;
        wasmPaths: {
            token: string;
            pool: string;
        };
    };
}
