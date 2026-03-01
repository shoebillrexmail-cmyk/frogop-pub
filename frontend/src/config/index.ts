export const NETWORKS = {
  regtest: {
    name: 'Regtest',
    rpc: 'https://regtest.opnet.org',
    explorerTx: 'https://regtest.opnet.org/tx/',
  },
  testnet: {
    name: 'Testnet',
    rpc: 'https://testnet.opnet.org',
    explorerTx: 'https://testnet.opnet.org/tx/',
  },
  mainnet: {
    name: 'Mainnet',
    rpc: 'https://mainnet.opnet.org',
    explorerTx: 'https://mainnet.opnet.org/tx/',
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

export const EXPLORER_TX_URL = NETWORKS[currentNetwork].explorerTx;

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

export function formatTokenAmount(amount: bigint, decimals: number = 18): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 4);
  return `${whole}.${fractionStr}`;
}
