-- FroGop Indexer — D1 schema
-- Apply with: npm run db:migrate  (prod)
--          or: npm run db:migrate:local  (local wrangler dev)

CREATE TABLE IF NOT EXISTS pools (
    address       TEXT PRIMARY KEY,   -- bech32 (opt1...)
    address_hex   TEXT NOT NULL,      -- 0x...
    underlying    TEXT NOT NULL,
    premium_token TEXT NOT NULL,
    fee_recipient TEXT NOT NULL,
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

-- Indexes for per-user queries (the whole point of the indexer)
CREATE INDEX IF NOT EXISTS idx_options_writer ON options(writer);
CREATE INDEX IF NOT EXISTS idx_options_buyer  ON options(buyer);
CREATE INDEX IF NOT EXISTS idx_options_status ON options(status);
CREATE INDEX IF NOT EXISTS idx_fee_pool_id    ON fee_events(pool_address, option_id);
