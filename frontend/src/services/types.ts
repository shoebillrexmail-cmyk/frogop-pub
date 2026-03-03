/** Option type: 0 = CALL, 1 = PUT */
export const OptionType = {
    CALL: 0,
    PUT: 1,
} as const;
export type OptionType = (typeof OptionType)[keyof typeof OptionType];

/** Option status codes matching the on-chain contract constants */
export const OptionStatus = {
    OPEN: 0,
    PURCHASED: 1,
    EXERCISED: 2,
    EXPIRED: 3,
    CANCELLED: 4,
} as const;
export type OptionStatus = (typeof OptionStatus)[keyof typeof OptionStatus];

/** Decoded option data from the on-chain pool contract */
export interface OptionData {
    id: bigint;
    /** Hex-encoded writer address (0x...) */
    writer: string;
    /** Hex-encoded buyer address (0x...) — zero address if OPEN */
    buyer: string;
    /** 0 = CALL, 1 = PUT */
    optionType: number;
    strikePrice: bigint;
    underlyingAmount: bigint;
    premium: bigint;
    expiryBlock: bigint;
    /** 0–4: OPEN / PURCHASED / EXERCISED / EXPIRED / CANCELLED */
    status: number;
}

/** Minimal pool entry from the factory registry */
export interface PoolEntry {
    /** bech32 or hex pool contract address */
    address: string;
    /** Hex address of the underlying token */
    underlying: string;
    /** Hex address of the premium token */
    premiumToken: string;
    /** Pool config ID from pools.config.json (e.g. "moto-pill") */
    poolId?: string;
    /** Display symbol for the underlying token (e.g. "MOTO") */
    underlyingSymbol?: string;
    /** Display symbol for the premium token (e.g. "PILL") */
    premiumSymbol?: string;
}

/** Pool-level configuration read from on-chain view methods */
export interface PoolInfo {
    /** Hex address of the underlying token (MOTO) */
    underlying: string;
    /** Hex address of the premium token (PILL) */
    premiumToken: string;
    /** Total number of options ever created */
    optionCount: bigint;
    /** Cancel fee in basis points (default: 100 = 1%) */
    cancelFeeBps: bigint;
    /** Buy fee in basis points (default: 100 = 1%) */
    buyFeeBps: bigint;
    /** Exercise fee in basis points (default: 10 = 0.1%) */
    exerciseFeeBps: bigint;
    /** Grace period in blocks after expiry for exercise */
    gracePeriodBlocks: bigint;
}
