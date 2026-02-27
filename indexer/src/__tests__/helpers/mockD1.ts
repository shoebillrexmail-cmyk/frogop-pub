/**
 * sql.js-backed mock for D1Database.
 * Uses an in-memory SQLite DB (pure WASM — no native compilation needed).
 * Pre-seeded with schema.sql.  All D1 methods return resolved Promises.
 * batch() runs all statements in a single SQLite transaction.
 *
 * Usage in tests:
 *   let db: MockD1Database;
 *   beforeEach(async () => { db = await MockD1Database.create(); });
 */
import initSqlJs, { type Database as SqlJsDb, type SqlJsStatic } from 'sql.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const _dir   = dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(resolve(_dir, '../../db/schema.sql'), 'utf8');

// sql.js is initialised once per test run (ESM top-level await)
let _SQL: SqlJsStatic | null = null;
async function getSqlJs(): Promise<SqlJsStatic> {
    if (!_SQL) _SQL = await initSqlJs();
    return _SQL;
}

// Parameter types accepted by sql.js
type SqlParam = string | number | null | boolean | Uint8Array;

// ---------------------------------------------------------------------------
// MockD1Statement — stores db + sql + bound args; all ops are synchronous
// ---------------------------------------------------------------------------

export class MockD1Statement {
    readonly _sql:  string;
    readonly _args: SqlParam[];

    // Stored so bind() can propagate and batch() can call _execute()
    private readonly _db: SqlJsDb;

    constructor(db: SqlJsDb, sql: string, args: SqlParam[] = []) {
        this._db   = db;
        this._sql  = sql;
        this._args = args;
    }

    bind(...args: unknown[]): MockD1Statement {
        return new MockD1Statement(this._db, this._sql, args as SqlParam[]);
    }

    async first<T = Record<string, unknown>>(): Promise<T | null> {
        const res = this._db.exec(this._sql, this._args);
        if (!res.length || !res[0]!.values.length) return null;
        return toObj<T>(res[0]!.columns, res[0]!.values[0]!);
    }

    async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }> {
        const res = this._db.exec(this._sql, this._args);
        if (!res.length) return { results: [], success: true };
        const { columns, values } = res[0]!;
        return { results: values.map(v => toObj<T>(columns, v)), success: true };
    }

    async run(): Promise<{ success: boolean }> {
        this._db.run(this._sql, this._args);
        return { success: true };
    }

    /** Called by MockD1Database.batch() inside a transaction. */
    _execute(): void {
        this._db.run(this._sql, this._args);
    }
}

function toObj<T>(
    columns: string[],
    values: Array<string | number | null | Uint8Array>,
): T {
    const row: Record<string, unknown> = {};
    columns.forEach((col, i) => { row[col] = values[i] ?? null; });
    return row as T;
}

// ---------------------------------------------------------------------------
// MockD1Database
// ---------------------------------------------------------------------------

export class MockD1Database {
    private readonly _db: SqlJsDb;

    private constructor(db: SqlJsDb) {
        this._db = db;
    }

    /** Async factory — use in beforeEach. */
    static async create(): Promise<MockD1Database> {
        const SQL = await getSqlJs();
        const db  = new SQL.Database();
        db.run('PRAGMA foreign_keys = OFF');
        db.run(SCHEMA);
        return new MockD1Database(db);
    }

    prepare(sql: string): MockD1Statement {
        return new MockD1Statement(this._db, sql);
    }

    async batch(stmts: unknown[]): Promise<Array<{ results: unknown[]; success: boolean }>> {
        this._db.run('BEGIN');
        try {
            for (const s of stmts as MockD1Statement[]) {
                s._execute();
            }
            this._db.run('COMMIT');
        } catch (err) {
            this._db.run('ROLLBACK');
            throw err;
        }
        return stmts.map(() => ({ results: [], success: true }));
    }

    // ---- Test helpers -------------------------------------------------------

    /** Run a raw SELECT and return all rows (for assertions). */
    queryAll<T = Record<string, unknown>>(sql: string, ...args: unknown[]): T[] {
        const res = this._db.exec(sql, args as SqlParam[]);
        if (!res.length) return [];
        const { columns, values } = res[0]!;
        return values.map(v => toObj<T>(columns, v));
    }

    /** Run a raw SELECT and return the first row, or null. */
    queryFirst<T = Record<string, unknown>>(sql: string, ...args: unknown[]): T | null {
        const res = this._db.exec(sql, args as SqlParam[]);
        if (!res.length || !res[0]!.values.length) return null;
        return toObj<T>(res[0]!.columns, res[0]!.values[0]!);
    }
}
