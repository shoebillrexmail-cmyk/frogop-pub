/**
 * OPNet method selectors for OptionsPool and OP20 token contracts.
 *
 * Each selector is the first 4 bytes of SHA256(methodSignature), encoded as
 * a `0x`-prefixed 8-char hex string — matching btc-runtime's encodeSelector().
 *
 * Computed at module load time using ABICoder.encodeSelector().
 * ABICoder.encodeSelector() returns 8-char hex without '0x'; we add the prefix.
 */
import { ABICoder } from '@btc-vision/transaction';

const abi = new ABICoder();
const sel = (sig: string): string => '0x' + abi.encodeSelector(sig);

/** View method selectors for OptionsPool (used with provider.call) */
export const POOL_VIEW_SELECTORS = {
    underlying: sel('underlying()'),
    premiumToken: sel('premiumToken()'),
    optionCount: sel('optionCount()'),
    getOption: sel('getOption(uint256)'),
    getOptionsBatch: sel('getOptionsBatch(uint256,uint256)'),
    feeRecipient: sel('feeRecipient()'),
    buyFeeBps: sel('buyFeeBps()'),
    exerciseFeeBps: sel('exerciseFeeBps()'),
    cancelFeeBps: sel('cancelFeeBps()'),
    gracePeriodBlocks: sel('gracePeriodBlocks()'),
    maxExpiryBlocks: sel('maxExpiryBlocks()'),
    calculateCollateral: sel('calculateCollateral(uint8,uint256,uint256)'),
} as const;

/** Selectors for BTC quote pool (type 1) — two-phase commit methods */
export const BTC_QUOTE_SELECTORS = {
    reserveOption: sel('reserveOption(uint256)'),
    executeReservation: sel('executeReservation(uint256)'),
    cancelReservation: sel('cancelReservation(uint256)'),
    getReservation: sel('getReservation(uint256)'),
} as const;

/** Selectors for BTC underlying pool (type 2) */
export const BTC_UNDERLYING_SELECTORS = {
    writeOptionBtc: sel('writeOptionBtc(uint8,uint256,uint64,uint256,uint256)'),
} as const;

/** Selectors for SpreadRouter (atomic multi-leg strategies) */
export const ROUTER_SELECTORS = {
    executeSpread: sel('executeSpread(address,uint8,uint256,uint64,uint256,uint256,uint256)'),
    executeDualWrite: sel('executeDualWrite(address,uint8,uint256,uint64,uint256,uint256,uint8,uint256,uint64,uint256,uint256)'),
} as const;

/** View method selectors for OP20 tokens */
export const TOKEN_VIEW_SELECTORS = {
    balanceOf: sel('balanceOf(address)'),
    allowance: sel('allowance(address,address)'),
    decimals: sel('decimals()'),
    totalSupply: sel('totalSupply()'),
    name: sel('name()'),
    symbol: sel('symbol()'),
} as const;

/** View method selectors for OptionsFactory */
export const FACTORY_VIEW_SELECTORS = {
    getPoolCount: sel('getPoolCount()'),
    getPoolByIndex: sel('getPoolByIndex(uint256)'),
    getPool: sel('getPool(address,address)'),
} as const;
