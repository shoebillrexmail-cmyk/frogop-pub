// ---------------------------------------------------------------------------
// Shared domain types for the FroGop indexer (Cloudflare Workers + D1)
// ---------------------------------------------------------------------------

// ── Cloudflare Workers environment bindings ─────────────────────────────────

export interface Env {
    /** D1 managed SQLite database */
    DB: D1Database;
    /** "regtest" | "testnet" | "mainnet" */
    OPNET_NETWORK: string;
    /** e.g. "https://testnet.opnet.org" */
    OPNET_RPC_URL: string;
    /** Space-separated bech32 pool addresses */
    POOL_ADDRESSES: string;
    /** Bech32 factory address for auto-discovery */
    FACTORY_ADDRESS: string;
    /** Max blocks to process per cron invocation */
    MAX_BLOCKS_PER_RUN: string;
    /** 0x-prefixed hex address of the NativeSwap router contract */
    NATIVESWAP_CONTRACT: string;
    /** Space-separated 0x-prefixed hex token addresses to poll prices for */
    NATIVESWAP_TOKEN_ADDRESSES: string;
    /** Comma-separated token labels matching NATIVESWAP_TOKEN_ADDRESSES order, e.g. "MOTO,PILL" */
    NATIVESWAP_LABELS: string;
}

// ── Option domain enums ─────────────────────────────────────────────────────

// Regular enums (not const enum) — required for esbuild/vitest cross-file inlining
export enum OptionType {
    CALL = 0,
    PUT  = 1,
}

export enum OptionStatus {
    OPEN      = 0,
    PURCHASED = 1,
    EXERCISED = 2,
    CANCELLED = 3,
    SETTLED   = 4,
}

export enum FeeEventType {
    CANCEL   = 'CANCEL',
    BUY      = 'BUY',
    EXERCISE = 'EXERCISE',
}

// ── DB row shapes ───────────────────────────────────────────────────────────

/** One row in the `options` table. bigints stored as decimal strings. */
export interface OptionRow {
    pool_address:    string;
    option_id:       number;
    writer:          string;
    buyer:           string | null;
    option_type:     number;
    strike_price:    string;
    underlying_amt:  string;
    premium:         string;
    expiry_block:    number;
    grace_end_block: number;
    status:          number;
    created_block:   number;
    created_tx:      string;
    updated_block:   number | null;
    updated_tx:      string | null;
}

/** One row in the `pools` table. */
export interface PoolRow {
    address:       string;   // bech32 (opt1...)
    address_hex:   string;   // 0x...
    underlying:    string;
    premium_token: string;
    fee_recipient: string;
    created_block: number;
    created_tx:    string;
    indexed_at:    string;   // ISO datetime
}

/** One row in the `fee_events` table. */
export interface FeeEventRow {
    pool_address:  string;
    option_id:     number;
    event_type:    string;
    fee_recipient: string;
    token:         string;
    amount:        string;
    block_number:  number;
    tx_id:         string;
}

// ── Block / event shapes (from OPNet RPC) ──────────────────────────────────

/** Minimal tx shape from OPNet getBlock(n, prefetchTxs=true).
 *  Confirmed via live testnet RPC: events are a flat array, contractAddress is 0x hex. */
export interface BlockTx {
    id:     string;
    events: TxEvent[];
}

/** One event on tx.events[] */
export interface TxEvent {
    contractAddress: string;  // always 0x... hex
    type:            string;
    data:            string;  // hex-encoded event data (BytesWriter output)
}

/** Decoded field map from a contract event's data bytes. */
export type EventFields = Record<string, string | undefined>;

// ── Price tracking row shapes ─────────────────────────────────────────────

/** One row in the `price_snapshots` table. */
export interface PriceSnapshotRow {
    token:        string;
    block_number: number;
    timestamp:    string;
    price:        string;
}

/** One row in the `swap_events` table. */
export interface SwapEventRow {
    id?:         number;  // auto-increment, omitted on insert
    token:       string;
    block_number: number;
    tx_id:       string;
    buyer:       string;
    sats_in:     string;
    tokens_out:  string;
    fees:        string;
}

/** One row in the `price_candles` table. */
export interface PriceCandleRow {
    token:         string;
    interval:      string;
    open_time:     string;
    open:          string;
    high:          string;
    low:           string;
    close:         string;
    volume_sats:   string;
    volume_tokens: string;
    trade_count:   number;
}
