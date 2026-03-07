/**
 * Typed D1 query helpers.
 *
 * D1 API differences from better-sqlite3:
 *   - All methods are async (Promise-based)
 *   - Use positional ? params + .bind(...args)
 *   - .first<T>() → T | null
 *   - .all<T>()   → D1Result<T>  (access via .results)
 *   - .run()      → D1Result (for writes)
 *   - db.batch([stmt1, stmt2]) → atomic transaction
 */
import type { OptionRow, PoolRow, FeeEventRow, OptionTransferRow, PriceSnapshotRow, SwapEventRow, PriceCandleRow } from '../types/index.js';

// ---------------------------------------------------------------------------
// Indexer state (cursor)
// ---------------------------------------------------------------------------

export async function getLastIndexedBlock(db: D1Database): Promise<number> {
    const row = await db
        .prepare('SELECT value FROM indexer_state WHERE key = ?')
        .bind('last_indexed_block')
        .first<{ value: string }>();
    return row ? parseInt(row.value, 10) : 0;
}

export function stmtSetLastIndexedBlock(db: D1Database, blockNumber: number): D1PreparedStatement {
    return db
        .prepare('INSERT OR REPLACE INTO indexer_state (key, value) VALUES (?, ?)')
        .bind('last_indexed_block', String(blockNumber));
}

// ---------------------------------------------------------------------------
// Pools
// ---------------------------------------------------------------------------

export async function upsertPool(db: D1Database, pool: PoolRow): Promise<void> {
    await db
        .prepare(`
            INSERT OR IGNORE INTO pools
                (address, address_hex, underlying, premium_token, fee_recipient,
                 grace_period_blocks, created_block, created_tx, indexed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
            pool.address, pool.address_hex, pool.underlying, pool.premium_token,
            pool.fee_recipient, pool.grace_period_blocks, pool.created_block, pool.created_tx, pool.indexed_at,
        )
        .run();
}

export async function updatePoolGracePeriod(
    db: D1Database,
    address: string,
    gracePeriodBlocks: number,
): Promise<void> {
    await db
        .prepare('UPDATE pools SET grace_period_blocks = ? WHERE address = ?')
        .bind(gracePeriodBlocks, address)
        .run();
}

export async function getPoolGracePeriod(
    db: D1Database,
    addressHex: string,
): Promise<number> {
    const row = await db
        .prepare('SELECT grace_period_blocks FROM pools WHERE address_hex = ?')
        .bind(addressHex)
        .first<{ grace_period_blocks: number }>();
    return row?.grace_period_blocks ?? 144;
}

export async function getAllPools(db: D1Database): Promise<PoolRow[]> {
    const { results } = await db
        .prepare('SELECT * FROM pools ORDER BY created_block')
        .all<PoolRow>();
    return results;
}

export async function getPool(db: D1Database, address: string): Promise<PoolRow | null> {
    return db
        .prepare('SELECT * FROM pools WHERE address = ?')
        .bind(address)
        .first<PoolRow>();
}

// ---------------------------------------------------------------------------
// Options — write statements (returned for batching)
// ---------------------------------------------------------------------------

export function stmtInsertOption(db: D1Database, o: OptionRow): D1PreparedStatement {
    return db
        .prepare(`
            INSERT OR IGNORE INTO options
                (pool_address, option_id, writer, buyer, option_type, strike_price,
                 underlying_amt, premium, expiry_block, grace_end_block, status,
                 created_block, created_tx, updated_block, updated_tx)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
            o.pool_address, o.option_id, o.writer, o.buyer ?? null, o.option_type,
            o.strike_price, o.underlying_amt, o.premium,
            o.expiry_block, o.grace_end_block, o.status,
            o.created_block, o.created_tx, o.updated_block ?? null, o.updated_tx ?? null,
        );
}

export function stmtUpdateOptionStatus(
    db: D1Database,
    poolAddress: string,
    optionId: number,
    status: number,
    buyer: string | null,
    updatedBlock: number,
    updatedTx: string,
): D1PreparedStatement {
    return db
        .prepare(`
            UPDATE options
            SET status = ?, buyer = COALESCE(?, buyer), updated_block = ?, updated_tx = ?
            WHERE pool_address = ? AND option_id = ?
        `)
        .bind(status, buyer, updatedBlock, updatedTx, poolAddress, optionId);
}

export function stmtInsertFeeEvent(
    db: D1Database,
    e: Omit<FeeEventRow, 'id'>,
): D1PreparedStatement {
    return db
        .prepare(`
            INSERT INTO fee_events
                (pool_address, option_id, event_type, fee_recipient, token, amount, block_number, tx_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
            e.pool_address, e.option_id, e.event_type,
            e.fee_recipient, e.token, e.amount, e.block_number, e.tx_id,
        );
}

// ---------------------------------------------------------------------------
// Option transfers — write statements
// ---------------------------------------------------------------------------

export function stmtInsertOptionTransfer(
    db: D1Database,
    row: Omit<OptionTransferRow, 'id'>,
): D1PreparedStatement {
    return db
        .prepare(`
            INSERT INTO option_transfers
                (pool_address, option_id, from_address, to_address, block_number, tx_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `)
        .bind(
            row.pool_address, row.option_id, row.from_address,
            row.to_address, row.block_number, row.tx_id,
        );
}

export function stmtUpdateOptionBuyer(
    db: D1Database,
    poolAddress: string,
    optionId: number,
    newBuyer: string,
    updatedBlock: number,
    updatedTx: string,
): D1PreparedStatement {
    return db
        .prepare(`
            UPDATE options
            SET buyer = ?, updated_block = ?, updated_tx = ?
            WHERE pool_address = ? AND option_id = ?
        `)
        .bind(newBuyer, updatedBlock, updatedTx, poolAddress, optionId);
}

// ---------------------------------------------------------------------------
// Option transfers — read queries
// ---------------------------------------------------------------------------

export async function getTransfersByOption(
    db: D1Database,
    poolAddress: string,
    optionId: number,
): Promise<OptionTransferRow[]> {
    const { results } = await db
        .prepare('SELECT * FROM option_transfers WHERE pool_address = ? AND option_id = ? ORDER BY block_number ASC')
        .bind(poolAddress, optionId)
        .all<OptionTransferRow>();
    return results;
}

export async function getTransfersByUser(
    db: D1Database,
    address: string,
): Promise<OptionTransferRow[]> {
    const { results } = await db
        .prepare('SELECT * FROM option_transfers WHERE from_address = ? OR to_address = ? ORDER BY block_number DESC')
        .bind(address, address)
        .all<OptionTransferRow>();
    return results;
}

// ---------------------------------------------------------------------------
// Options — read queries
// ---------------------------------------------------------------------------

export async function getOption(
    db: D1Database,
    poolAddress: string,
    optionId: number,
): Promise<OptionRow | null> {
    return db
        .prepare('SELECT * FROM options WHERE pool_address = ? AND option_id = ?')
        .bind(poolAddress, optionId)
        .first<OptionRow>();
}

export async function getOptionsByPool(
    db: D1Database,
    poolAddress: string,
    opts: { status?: number; limit?: number; offset?: number } = {},
): Promise<OptionRow[]> {
    const { limit = 50, offset = 0 } = opts;
    if (opts.status !== undefined) {
        const { results } = await db
            .prepare('SELECT * FROM options WHERE pool_address = ? AND status = ? ORDER BY option_id LIMIT ? OFFSET ?')
            .bind(poolAddress, opts.status, limit, offset)
            .all<OptionRow>();
        return results;
    }
    const { results } = await db
        .prepare('SELECT * FROM options WHERE pool_address = ? ORDER BY option_id LIMIT ? OFFSET ?')
        .bind(poolAddress, limit, offset)
        .all<OptionRow>();
    return results;
}

export async function getOptionsByWriter(
    db: D1Database,
    poolAddress: string,
    writer: string,
): Promise<OptionRow[]> {
    const { results } = await db
        .prepare('SELECT * FROM options WHERE pool_address = ? AND writer = ? ORDER BY option_id')
        .bind(poolAddress, writer)
        .all<OptionRow>();
    return results;
}

export async function getOptionsByBuyer(
    db: D1Database,
    poolAddress: string,
    buyer: string,
): Promise<OptionRow[]> {
    const { results } = await db
        .prepare('SELECT * FROM options WHERE pool_address = ? AND buyer = ? ORDER BY option_id')
        .bind(poolAddress, buyer)
        .all<OptionRow>();
    return results;
}

export async function getOptionsByUser(
    db: D1Database,
    userAddress: string,
): Promise<OptionRow[]> {
    const normalized = userAddress.toLowerCase();
    const { results } = await db
        .prepare('SELECT * FROM options WHERE writer = ? OR buyer = ? ORDER BY pool_address, option_id')
        .bind(normalized, normalized)
        .all<OptionRow>();
    return results;
}

// ---------------------------------------------------------------------------
// Price snapshots — write statements
// ---------------------------------------------------------------------------

export function stmtInsertPriceSnapshot(
    db: D1Database,
    row: PriceSnapshotRow,
): D1PreparedStatement {
    return db
        .prepare(`
            INSERT OR REPLACE INTO price_snapshots (token, block_number, timestamp, price)
            VALUES (?, ?, ?, ?)
        `)
        .bind(row.token, row.block_number, row.timestamp, row.price);
}

// ---------------------------------------------------------------------------
// Swap events — write statements
// ---------------------------------------------------------------------------

export function stmtInsertSwapEvent(
    db: D1Database,
    row: Omit<SwapEventRow, 'id'>,
): D1PreparedStatement {
    return db
        .prepare(`
            INSERT INTO swap_events (token, block_number, tx_id, buyer, sats_in, tokens_out, fees)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(row.token, row.block_number, row.tx_id, row.buyer, row.sats_in, row.tokens_out, row.fees);
}

// ---------------------------------------------------------------------------
// Price candles — write statements
// ---------------------------------------------------------------------------

export function stmtUpsertCandle(
    db: D1Database,
    row: PriceCandleRow,
): D1PreparedStatement {
    return db
        .prepare(`
            INSERT OR REPLACE INTO price_candles
                (token, interval, open_time, open, high, low, close,
                 volume_sats, volume_tokens, trade_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
            row.token, row.interval, row.open_time,
            row.open, row.high, row.low, row.close,
            row.volume_sats, row.volume_tokens, row.trade_count,
        );
}

// ---------------------------------------------------------------------------
// Pruning — write statements
// ---------------------------------------------------------------------------

export function stmtPruneOldSnapshots(
    db: D1Database,
    cutoffIso: string,
): D1PreparedStatement {
    return db
        .prepare('DELETE FROM price_snapshots WHERE timestamp < ?')
        .bind(cutoffIso);
}

export function stmtPruneOldSwapEvents(
    db: D1Database,
    cutoffBlock: number,
): D1PreparedStatement {
    return db
        .prepare('DELETE FROM swap_events WHERE block_number < ?')
        .bind(cutoffBlock);
}

// ---------------------------------------------------------------------------
// Price data — read queries
// ---------------------------------------------------------------------------

export async function getCandles(
    db: D1Database,
    token: string,
    interval: string,
    opts: { from?: string; to?: string; limit?: number } = {},
): Promise<PriceCandleRow[]> {
    const { limit = 500 } = opts;
    let sql = 'SELECT * FROM price_candles WHERE token = ? AND interval = ?';
    const params: (string | number)[] = [token, interval];

    if (opts.from) {
        sql += ' AND open_time >= ?';
        params.push(opts.from);
    }
    if (opts.to) {
        sql += ' AND open_time <= ?';
        params.push(opts.to);
    }
    sql += ' ORDER BY open_time ASC LIMIT ?';
    params.push(limit);

    const { results } = await db.prepare(sql).bind(...params).all<PriceCandleRow>();
    return results;
}

export async function getLatestPrice(
    db: D1Database,
    token: string,
): Promise<PriceSnapshotRow | null> {
    return db
        .prepare('SELECT * FROM price_snapshots WHERE token = ? ORDER BY block_number DESC LIMIT 1')
        .bind(token)
        .first<PriceSnapshotRow>();
}

export async function getPriceHistory(
    db: D1Database,
    token: string,
    opts: { from?: string; to?: string; limit?: number } = {},
): Promise<PriceSnapshotRow[]> {
    const { limit = 200 } = opts;
    let sql = 'SELECT * FROM price_snapshots WHERE token = ?';
    const params: (string | number)[] = [token];

    if (opts.from) {
        sql += ' AND timestamp >= ?';
        params.push(opts.from);
    }
    if (opts.to) {
        sql += ' AND timestamp <= ?';
        params.push(opts.to);
    }
    sql += ' ORDER BY block_number ASC LIMIT ?';
    params.push(limit);

    const { results } = await db.prepare(sql).bind(...params).all<PriceSnapshotRow>();
    return results;
}

// ---------------------------------------------------------------------------
// Snapshots within a time range (for candle rollup)
// ---------------------------------------------------------------------------

export async function getSnapshotsInRange(
    db: D1Database,
    token: string,
    fromIso: string,
    toIso: string,
): Promise<PriceSnapshotRow[]> {
    const { results } = await db
        .prepare('SELECT * FROM price_snapshots WHERE token = ? AND timestamp >= ? AND timestamp < ? ORDER BY block_number ASC')
        .bind(token, fromIso, toIso)
        .all<PriceSnapshotRow>();
    return results;
}

export async function getSwapEventsInBlockRange(
    db: D1Database,
    token: string,
    fromBlock: number,
    toBlock: number,
): Promise<SwapEventRow[]> {
    const { results } = await db
        .prepare('SELECT * FROM swap_events WHERE token = ? AND block_number >= ? AND block_number < ? ORDER BY block_number ASC')
        .bind(token, fromBlock, toBlock)
        .all<SwapEventRow>();
    return results;
}
