import poolsConfigJson from '../../../pools.config.json';
import type { PoolsConfig, PoolConfig, NetworkId } from '../../../shared/pool-config.types.ts';

const poolsConfig = poolsConfigJson as PoolsConfig;

/** Find a pool config entry by matching underlying + premium hex addresses. */
export function findPoolConfig(underlyingHex: string, premiumHex: string): PoolConfig | null {
    const net = currentNetwork as NetworkId;
    const uLower = underlyingHex.toLowerCase();
    const pLower = premiumHex.toLowerCase();
    return poolsConfig.pools.find((p) =>
        p.underlying.addresses[net]?.toLowerCase() === uLower &&
        p.premium.addresses[net]?.toLowerCase() === pLower,
    ) ?? null;
}

/** Find a pool config entry by pool contract address (bech32 or hex). */
export function findPoolConfigByAddress(poolAddress: string): PoolConfig | null {
    const net = currentNetwork as NetworkId;
    const lower = poolAddress.toLowerCase();
    return poolsConfig.pools.find((p) =>
        p.pool.addresses[net]?.toLowerCase() === lower,
    ) ?? null;
}

/** Build a price pair key like "MOTO_PILL" from a pool config entry. */
export function getPricePairKey(config: PoolConfig): string {
    return `${config.underlying.symbol}_${config.premium.symbol}`;
}

/** Get all pool configs for the current network. */
export function getAllPoolConfigs(): PoolConfig[] {
    const net = currentNetwork as NetworkId;
    return poolsConfig.pools.filter((p) => p.pool.addresses[net]);
}

export const NETWORKS = {
  regtest: {
    name: 'Regtest',
    rpc: 'https://regtest.opnet.org',
    explorerTxBase: 'https://regtest.opnet.org/tx/',
    explorerTxSuffix: '',
  },
  testnet: {
    name: 'Testnet',
    rpc: 'https://testnet.opnet.org',
    explorerTxBase: 'https://opscan.org/transactions/',
    explorerTxSuffix: '?network=op_testnet',
  },
  mainnet: {
    name: 'Mainnet',
    rpc: 'https://mainnet.opnet.org',
    explorerTxBase: 'https://opscan.org/transactions/',
    explorerTxSuffix: '?network=op_mainnet',
  },
} as const;

export type NetworkName = keyof typeof NETWORKS;

export const currentNetwork: NetworkName = (import.meta.env.VITE_OPNET_NETWORK as NetworkName) || 'testnet';

export const getNetworkConfig = () => NETWORKS[currentNetwork];

export const CONTRACT_ADDRESSES = {
  factory: import.meta.env.VITE_FACTORY_ADDRESS || '',
  poolTemplate: import.meta.env.VITE_POOL_TEMPLATE_ADDRESS || '',
  pool: import.meta.env.VITE_POOL_ADDRESS || '',
};

export function explorerTxUrl(txId: string): string {
  const net = NETWORKS[currentNetwork];
  return `${net.explorerTxBase}${txId}${net.explorerTxSuffix}`;
}

/** Expected seconds between Signet blocks (~10 minutes). */
export const EXPECTED_BLOCK_INTERVAL_S = 600;

export const BLOCK_CONSTANTS = {
  BLOCKS_PER_DAY: 144,
  BLOCKS_PER_WEEK: 1008,
  BLOCKS_PER_MONTH: 4320,
  BLOCKS_PER_YEAR: 52560,
};

export function blocksToDays(blocks: bigint): number {
  return Number(blocks) / BLOCK_CONSTANTS.BLOCKS_PER_DAY;
}

export function blocksToTime(blocks: bigint): string {
  const days = blocksToDays(blocks);
  if (days < 1) return `${Math.round(days * 24)} hours`;
  if (days < 7) return `${Math.round(days)} days`;
  if (days < 30) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

export function blocksToCountdown(blocksLeft: bigint): string {
    if (blocksLeft <= 0n) return 'Expired';
    const totalHours = Number(blocksLeft) * 10 / 60; // ~10 min per block
    const days = Math.floor(totalHours / 24);
    const hours = Math.round(totalHours % 24);
    if (days > 0) return `~${days}d ${hours}h`;
    if (hours > 0) return `~${hours}h`;
    return '<1h';
}

export function bpsToPct(bps: bigint): string {
    return `${Number(bps) / 100}%`;
}

export function formatAddress(address: string): string {
  if (!address) return '';
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

/** Get the NativeSwap contract address for a specific pool config on the current network. */
export function getNativeSwapAddress(config: PoolConfig | null): string | null {
    if (!config?.nativeSwap) return null;
    const net = currentNetwork as NetworkId;
    return config.nativeSwap.addresses[net] || null;
}

/** Get the NativeSwapBridge contract address for a specific pool config on the current network. */
export function getBridgeAddress(config: PoolConfig | null): string | null {
    if (!config?.bridge) return null;
    const net = currentNetwork as NetworkId;
    return config.bridge.addresses[net] || null;
}

/** Get pool type from config (defaults to 0 = OP20/OP20). */
export function getPoolType(config: PoolConfig | null): 0 | 1 | 2 {
    return config?.poolType ?? 0;
}

/** Human-readable label for pool type. */
export function poolTypeLabel(poolType: 0 | 1 | 2): string {
    switch (poolType) {
        case 0: return 'OP20/OP20';
        case 1: return 'OP20/BTC';
        case 2: return 'BTC/OP20';
    }
}

/** Whether the pool involves native BTC. */
export function isBtcPool(poolType: 0 | 1 | 2): boolean {
    return poolType !== 0;
}

/** Get the SpreadRouter contract address for the current network. */
export function getRouterAddress(): string | null {
    if (!poolsConfig.router) return null;
    const net = currentNetwork as NetworkId;
    return poolsConfig.router.addresses[net] || null;
}

export function formatTokenAmount(amount: bigint, decimals: number = 18): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 4);
  return `${whole}.${fractionStr}`;
}

/** Display unit for price-context values. Returns "sats" for BTC, symbol unchanged for everything else. */
export function premiumDisplayUnit(symbol: string): string {
    return symbol === 'BTC' ? 'sats' : symbol;
}
