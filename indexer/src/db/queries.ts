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
import type { OptionRow, PoolRow, FeeEventRow } from '../types/index.js';

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
                 created_block, created_tx, indexed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
            pool.address, pool.address_hex, pool.underlying, pool.premium_token,
            pool.fee_recipient, pool.created_block, pool.created_tx, pool.indexed_at,
        )
        .run();
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
    const { results } = await db
        .prepare('SELECT * FROM options WHERE writer = ? OR buyer = ? ORDER BY pool_address, option_id')
        .bind(userAddress, userAddress)
        .all<OptionRow>();
    return results;
}
