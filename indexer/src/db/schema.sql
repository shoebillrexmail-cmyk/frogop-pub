-- FroGop Indexer — D1 schema
-- Apply with: npm run db:migrate  (prod)
--          or: npm run db:migrate:local  (local wrangler dev)

CREATE TABLE IF NOT EXISTS pools (
    address       TEXT PRIMARY KEY,   -- bech32 (opt1...)
    address_hex   TEXT NOT NULL,      -- 0x...
    underlying    TEXT NOT NULL,
    premium_token TEXT NOT NULL,
    fee_recipient TEXT NOT NULL,
    grace_period_blocks INTEGER NOT NULL DEFAULT 144,
    created_block INTEGER NOT NULL,
    created_tx    TEXT NOT NULL,
    indexed_at    TEXT NOT NULL       -- ISO 8601
);

CREATE TABLE IF NOT EXISTS options (
    pool_address    TEXT    NOT NULL REFERENCES pools(address),
    option_id       INTEGER NOT NULL,
    writer          TEXT    NOT NULL,
    buyer           TEXT,
    option_type     INTEGER NOT NULL,
    -- bigint fields stored as decimal strings (SQLite INTEGER max is 64-bit signed)
    strike_price    TEXT    NOT NULL,
    underlying_amt  TEXT    NOT NULL,
    premium         TEXT    NOT NULL,
    expiry_block    INTEGER NOT NULL,
    grace_end_block INTEGER NOT NULL,
    status          INTEGER NOT NULL,
    created_block   INTEGER NOT NULL,
    created_tx      TEXT    NOT NULL,
    updated_block   INTEGER,
    updated_tx      TEXT,
    PRIMARY KEY (pool_address, option_id)
);

CREATE TABLE IF NOT EXISTS fee_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    pool_address  TEXT    NOT NULL,
    option_id     INTEGER NOT NULL,
    event_type    TEXT    NOT NULL,
    fee_recipient TEXT    NOT NULL,
    token         TEXT    NOT NULL,
    amount        TEXT    NOT NULL,   -- decimal string
    block_number  INTEGER NOT NULL,
    tx_id         TEXT    NOT NULL
);

-- Persists indexer cursor and configuration across cron invocations
CREATE TABLE IF NOT EXISTS indexer_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Spot price snapshots from getQuote() polling
-- Base tokens: MOTO, PILL (tokens per 100k sats)
-- Cross-rates: MOTO_PILL (derived from base pair), MOTO_BTC, PILL_BTC (sats per token)
-- Reverse pairs (PILL_MOTO, BTC_MOTO, BTC_PILL) are computed at query time via inversion.
CREATE TABLE IF NOT EXISTS price_snapshots (
    token         TEXT    NOT NULL,     -- "MOTO", "PILL", "MOTO_PILL", "MOTO_BTC", "PILL_BTC"
    block_number  INTEGER NOT NULL,
    timestamp     TEXT    NOT NULL,     -- ISO 8601
    price         TEXT    NOT NULL,     -- decimal string (meaning depends on token type)
    PRIMARY KEY (token, block_number)
);

-- Real swap trades from SwapExecuted events
CREATE TABLE IF NOT EXISTS swap_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    token         TEXT    NOT NULL,     -- "MOTO" or "PILL"
    block_number  INTEGER NOT NULL,
    tx_id         TEXT    NOT NULL,
    buyer         TEXT    NOT NULL,
    sats_in       TEXT    NOT NULL,     -- decimal string (amountIn)
    tokens_out    TEXT    NOT NULL,     -- decimal string (amountOut)
    fees          TEXT    NOT NULL      -- decimal string (totalFees)
);

-- Pre-aggregated OHLCV candles
CREATE TABLE IF NOT EXISTS price_candles (
    token         TEXT    NOT NULL,     -- "MOTO", "PILL", "MOTO_PILL", "MOTO_BTC", "PILL_BTC"
    interval      TEXT    NOT NULL,     -- "1h", "4h", "1d", "1w"
    open_time     TEXT    NOT NULL,     -- ISO 8601 bucket start
    open          TEXT    NOT NULL,
    high          TEXT    NOT NULL,
    low           TEXT    NOT NULL,
    close         TEXT    NOT NULL,
    volume_sats   TEXT    NOT NULL DEFAULT '0',
    volume_tokens TEXT    NOT NULL DEFAULT '0',
    trade_count   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (token, interval, open_time)
);

-- Option transfer history (secondary market)
CREATE TABLE IF NOT EXISTS option_transfers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    pool_address  TEXT    NOT NULL,
    option_id     INTEGER NOT NULL,
    from_address  TEXT    NOT NULL,
    to_address    TEXT    NOT NULL,
    block_number  INTEGER NOT NULL,
    tx_id         TEXT    NOT NULL
);

-- Indexes for per-user queries (the whole point of the indexer)
CREATE INDEX IF NOT EXISTS idx_options_writer ON options(writer);
CREATE INDEX IF NOT EXISTS idx_options_buyer  ON options(buyer);
CREATE INDEX IF NOT EXISTS idx_options_status ON options(status);
CREATE INDEX IF NOT EXISTS idx_fee_pool_id    ON fee_events(pool_address, option_id);
CREATE INDEX IF NOT EXISTS idx_transfers_option ON option_transfers(pool_address, option_id);
CREATE INDEX IF NOT EXISTS idx_transfers_from   ON option_transfers(from_address);
CREATE INDEX IF NOT EXISTS idx_transfers_to     ON option_transfers(to_address);

-- Indexes for price queries
CREATE INDEX IF NOT EXISTS idx_snapshots_token_block ON price_snapshots(token, block_number);
CREATE INDEX IF NOT EXISTS idx_swap_token_block      ON swap_events(token, block_number);
CREATE INDEX IF NOT EXISTS idx_candle_token_interval  ON price_candles(token, interval, open_time);
