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

/**
 * Pool type discriminator:
 *   0 = OP20/OP20 (default, Phase 1)
 *   1 = OP20 underlying / BTC quote (premium + strike in sats)
 *   2 = BTC underlying / OP20 quote (collateral in sats)
 */
export type PoolType = 0 | 1 | 2;

export interface PoolConfig {
    id: string;
    /** Pool type: 0 = OP20/OP20, 1 = OP20/BTC, 2 = BTC/OP20. Defaults to 0. */
    poolType?: PoolType;
    underlying: TokenConfig;
    premium: TokenConfig;
    pool: {
        addresses: Record<NetworkId, string>;
    };
    nativeSwap?: {
        addresses: Record<NetworkId, string>;
    };
    /** NativeSwapBridge contract address (required for poolType 1 and 2) */
    bridge?: {
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
