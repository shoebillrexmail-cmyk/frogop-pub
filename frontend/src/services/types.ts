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
    /** Used by BTC quote pools (type 1) during two-phase commit */
    RESERVED: 5,
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
    /** 0–5: OPEN / PURCHASED / EXERCISED / EXPIRED / CANCELLED / RESERVED */
    status: number;
    /** Pool contract address this option belongs to (populated by indexer) */
    poolAddress?: string;
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
    /** Pool type: 0 = OP20/OP20, 1 = OP20/BTC, 2 = BTC/OP20 (from config, not on-chain) */
    poolType?: 0 | 1 | 2;
}

/** Reservation data for BTC quote pools (type 1 two-phase commit) */
export interface ReservationData {
    reservationId: bigint;
    optionId: bigint;
    buyer: string;
    btcAmount: bigint;
    csvScriptHash: string;
    expiryBlock: bigint;
    /** 0 = PENDING, 1 = EXECUTED, 2 = EXPIRED */
    status: number;
}
