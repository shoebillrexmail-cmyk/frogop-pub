import { u256 } from '@btc-vision/as-bignum/assembly';
import { Blockchain } from '@btc-vision/btc-runtime/runtime';

// =============================================================================
// OPTION TYPES
// =============================================================================

/** Option type: CALL - Right to buy underlying at strike price */
export const CALL: u8 = 0;

/** Option type: PUT - Right to sell underlying at strike price */
export const PUT: u8 = 1;

// =============================================================================
// OPTION STATUSES
// =============================================================================

/** Option status: OPEN - Available for purchase */
export const OPEN: u8 = 0;

/** Option status: PURCHASED - Bought by buyer, not yet exercised */
export const PURCHASED: u8 = 1;

/** Option status: EXERCISED - Buyer exercised the option */
export const EXERCISED: u8 = 2;

/** Option status: EXPIRED - Expired without exercise */
export const EXPIRED: u8 = 3;

/** Option status: CANCELLED - Writer cancelled before purchase */
export const CANCELLED: u8 = 4;

/** Option status: RESERVED - Reserved for two-phase BTC commit (type 1 pools) */
export const RESERVED: u8 = 5;

// =============================================================================
// TIME CONSTANTS
// =============================================================================

/** Default grace period after expiry for exercise (in blocks) ~1 day */
export const DEFAULT_GRACE_PERIOD_BLOCKS: u64 = 144;

/** Minimum grace period (6 blocks ≈ 1 hour on Bitcoin) */
export const MIN_GRACE_PERIOD_BLOCKS: u64 = 6;

/** Maximum grace period (4320 blocks ≈ 30 days on Bitcoin) */
export const MAX_GRACE_PERIOD_BLOCKS: u64 = 4320;

/** Maximum expiry time from creation (in blocks) ~1 year */
export const MAX_EXPIRY_BLOCKS: u64 = 52560;

// =============================================================================
// FEE CONSTANTS (basis points)
// =============================================================================

/** Cancellation fee in basis points (100 = 1%) */
export const CANCEL_FEE_BPS: u64 = 100;

/** Buy fee in basis points (100 = 1%) — deducted from premium before writer receives */
export const BUY_FEE_BPS: u64 = 100;

/** Exercise fee in basis points (10 = 0.1%) — deducted from buyer's proceeds */
export const EXERCISE_FEE_BPS: u64 = 10;

// =============================================================================
// BATCH & PRECISION
// =============================================================================

/** Maximum number of options in a batch operation */
export const MAX_BATCH_SIZE: u8 = 5;

/** Fixed-point precision for strike x amount calculations (18 decimals) */
export const PRECISION: u256 = u256.fromU64(1_000_000_000_000_000_000);

// =============================================================================
// STORAGE POINTER DEFINITIONS - Using Blockchain.nextPointer
// =============================================================================
// ReentrancyGuard uses first 2 pointers internally (statusPointer, depthPointer)
// Our pointers start after ReentrancyGuard's

export const UNDERLYING_POINTER: u16 = Blockchain.nextPointer;
export const PREMIUM_TOKEN_POINTER: u16 = Blockchain.nextPointer;
export const NEXT_ID_POINTER: u16 = Blockchain.nextPointer;
export const FEE_RECIPIENT_POINTER: u16 = Blockchain.nextPointer;
export const OPTIONS_BASE_POINTER: u16 = Blockchain.nextPointer;
export const PUBKEY_REGISTRY_POINTER: u16 = Blockchain.nextPointer;
export const EXTENDED_SLOTS_POINTER: u16 = Blockchain.nextPointer;

/** Reservation expiry in blocks (~1 day on signet) */
export const RESERVATION_EXPIRY_BLOCKS: u64 = 144;

// =============================================================================
// ADDITIONAL STORAGE POINTERS (after base pointers)
// =============================================================================

/** Storage pointer for per-pool grace period (u256 storing u64 value) */
export const GRACE_PERIOD_POINTER: u16 = Blockchain.nextPointer;
