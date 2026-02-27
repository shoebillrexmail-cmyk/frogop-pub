/**
 * FroGop Indexer — Cloudflare Worker entry point
 *
 * Exports:
 *   fetch()     → REST API  (GET /health, /pools, /user/:addr/options, …)
 *   scheduled() → Cron job  (poll OPNet RPC, decode events, write to D1)
 *
 * No HTTP server to start. No worker_threads. No long-running process.
 * Workers are stateless isolates — all state lives in D1.
 *
 * First-time setup:
 *   npm run db:create    → provision D1 database, copy id into wrangler.toml
 *   npm run db:migrate   → apply schema.sql to production D1
 *   wrangler deploy      → deploy this Worker
 *
 * GitHub CI/CD: add wrangler.yml workflow (story 7.7) to auto-deploy on push to master.
 */
import type { Env } from './types/index.js';
import { handleFetch } from './api/router.js';
import { pollNewBlocks } from './poller/index.js';

export default {
    async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
        return handleFetch(request, env);
    },

    async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
        // waitUntil keeps the Worker alive until polling completes,
        // even if the cron invocation would otherwise time out
        ctx.waitUntil(pollNewBlocks(env));
    },
} satisfies ExportedHandler<Env>;
