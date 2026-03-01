/**
 * Subrequest counter — wraps a mock provider and MockD1Database to count
 * every operation that costs a Cloudflare Worker subrequest.
 *
 * Cloudflare free-tier limit: 50 subrequests per invocation.
 *
 * RPC subrequests: getBlockNumber, getBlock, getPublicKeyInfo, call
 * D1 subrequests: batch() (counts as 1 regardless of statement count),
 *                 prepare().bind().first(), prepare().bind().all()
 */

export interface SubrequestLog {
    label: string;
    timestamp: number;
}

export class SubrequestCounter {
    private _count = 0;
    private readonly _calls: SubrequestLog[] = [];

    get count(): number {
        return this._count;
    }

    get calls(): ReadonlyArray<SubrequestLog> {
        return this._calls;
    }

    record(label: string): void {
        this._count++;
        this._calls.push({ label, timestamp: Date.now() });
    }

    reset(): void {
        this._count = 0;
        this._calls.length = 0;
    }

    /**
     * Create a Proxy around the mock provider that intercepts RPC method calls
     * for counting, while preserving the original vi.fn() mock capabilities
     * (mockResolvedValue, mockResolvedValueOnce, etc.).
     */
    wrapProvider<T extends Record<string, unknown>>(base: T): T {
        const rpcMethods = new Set(['getBlockNumber', 'getBlock', 'getPublicKeyInfo', 'call']);
        const counter = this;

        return new Proxy(base, {
            get(target, prop, receiver) {
                const value = Reflect.get(target, prop, receiver);
                if (typeof prop === 'string' && rpcMethods.has(prop) && typeof value === 'function') {
                    // Return a proxy around the function that counts calls
                    // but preserves all vi.fn() properties (.mockResolvedValue, etc.)
                    return new Proxy(value as (...args: unknown[]) => unknown, {
                        apply(fn, thisArg, args) {
                            counter.record(`rpc.${prop}`);
                            return Reflect.apply(fn, thisArg, args);
                        },
                        get(fn, fnProp, fnReceiver) {
                            return Reflect.get(fn, fnProp, fnReceiver);
                        },
                    });
                }
                return value;
            },
        });
    }

    /**
     * Wrap a MockD1Database so batch(), first(), and all() calls increment the counter.
     * D1 batch() = 1 subrequest regardless of how many statements it contains.
     * Each .first() or .all() call = 1 subrequest.
     */
    wrapDb<T extends { batch: (stmts: unknown[]) => unknown; prepare: (sql: string) => unknown }>(base: T): T {
        const counter = this;

        // Wrap batch
        const origBatch = base.batch.bind(base);
        base.batch = ((stmts: unknown[]) => {
            counter.record('d1.batch');
            return origBatch(stmts);
        }) as T['batch'];

        // Wrap prepare to intercept first() and all()
        const origPrepare = base.prepare.bind(base);
        base.prepare = ((sql: string) => {
            const stmt = origPrepare(sql) as Record<string, unknown>;
            return wrapStatement(stmt, counter);
        }) as T['prepare'];

        return base;
    }
}

/** Wrap a D1PreparedStatement so bind/first/all are tracked. */
function wrapStatement(stmt: Record<string, unknown>, counter: SubrequestCounter): Record<string, unknown> {
    // Wrap bind to propagate wrapping to the returned statement
    if (typeof stmt.bind === 'function') {
        const origBind = stmt.bind.bind(stmt);
        stmt.bind = (...args: unknown[]) => {
            const bound = origBind(...args) as Record<string, unknown>;
            return wrapStatement(bound, counter);
        };
    }

    // Wrap first
    if (typeof stmt.first === 'function') {
        const origFirst = stmt.first.bind(stmt);
        stmt.first = (...args: unknown[]) => {
            counter.record('d1.first');
            return origFirst(...args);
        };
    }

    // Wrap all
    if (typeof stmt.all === 'function') {
        const origAll = stmt.all.bind(stmt);
        stmt.all = (...args: unknown[]) => {
            counter.record('d1.all');
            return origAll(...args);
        };
    }

    return stmt;
}
