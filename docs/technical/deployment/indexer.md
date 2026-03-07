# FroGop Indexer — Cloudflare Workers Deployment

The indexer is a Cloudflare Worker that:
- **Polls** OPNet testnet every minute via a Cron Trigger (`scheduled()`)
- **Stores** decoded option events in a Cloudflare D1 managed SQLite database
- **Serves** a REST API (`fetch()`) at `api.frogop.net` for per-user option queries

Deploy workflow: push to `master` → GitHub Actions runs type-check → `wrangler deploy` → live at `api.frogop.net`.

---

## Prerequisites

| Tool | Install |
|------|---------|
| Node.js ≥ 22 | [nodejs.org](https://nodejs.org) |
| wrangler CLI | bundled as dev dep — `npx wrangler` |
| Cloudflare account | Same account used for frogop.net Workers |

Log in to Cloudflare (one-time, persists in `~/.wrangler`):
```bash
npx wrangler login
```

---

## One-Time Setup

Run these steps **once** when first deploying the indexer. After that, all deploys are automatic via GitHub Actions on every push to `master`.

### 1. Install dependencies

```bash
cd indexer
npm install
```

### 2. Create the D1 database and patch wrangler.toml (automated)

```bash
npm run db:setup
```

This script:
1. Runs `wrangler d1 create frogop-indexer`
2. Parses the returned UUID from the output
3. Patches `database_id` in `wrangler.toml` in place — no manual copy-paste

Output:
```
🚀 Creating D1 database 'frogop-indexer'...
✅ UUID parsed: a1b2c3d4-e5f6-...
✅ Patched wrangler.toml — database_id = "a1b2c3d4-e5f6-..."

Next steps:
  1. npm run db:migrate        — apply schema.sql to production D1
  2. git add wrangler.toml
  3. git commit -m 'chore(indexer): set D1 database_id'
  4. git push                  — GitHub Actions will deploy on merge to master
```

**Idempotent**: if `wrangler.toml` already has a real UUID, the script skips creation and exits cleanly.

### 3. Apply the database schema

```bash
npm run db:migrate
```

This runs `wrangler d1 execute frogop-indexer --file=./src/db/schema.sql` and creates
all tables and indexes in the production D1 database.

To verify:
```bash
npx wrangler d1 execute frogop-indexer --command "SELECT name FROM sqlite_master WHERE type='table'"
```

Expected output: `pools`, `options`, `fee_events`, `indexer_state`.

### 4. Commit and push wrangler.toml

```bash
git add wrangler.toml
git commit -m "chore(indexer): set D1 database_id"
git push
```

GitHub Actions picks this up and deploys automatically.

### 5. Add GitHub secrets (one-time, in GitHub UI)

The indexer shares the same API token and secrets as the frontend.
See **[`CLOUDFLARE_PAGES.md`](./CLOUDFLARE_PAGES.md#cloudflare-api-token-shared-by-all-workflows)** for the full token creation guide with all required permissions.

Go to **GitHub repo → Settings → Secrets and variables → Actions** and add:

| Secret | Where to get it |
|--------|-----------------|
| `CLOUDFLARE_API_TOKEN` | See [`CLOUDFLARE_PAGES.md`](./CLOUDFLARE_PAGES.md#creating-the-token) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → right sidebar on any Workers page |

The custom domain `api.frogop.net` is declared in `wrangler.toml` — because `frogop.net` is already managed by Cloudflare, wrangler will automatically create the `api` DNS record and provision an SSL certificate on first deploy. No manual DNS config or dashboard click needed.

---

## CI/CD Pipeline

File: `.github/workflows/indexer.yml`

**On pull request** (paths: `indexer/**`):
1. `npm ci`
2. `npm run type-check`

**On push to `master`** (paths: `indexer/**`):
1. Same CI steps above
2. `wrangler deploy` via `cloudflare/wrangler-action@v3`

The pipeline is path-filtered — it only runs when files under `indexer/` change.

---

## Verify the Deployment

```bash
# Health check
curl https://api.frogop.net/health

# Expected response
{ "status": "ok", "lastBlock": 2600, "network": "testnet" }
```

```bash
# List indexed pools
curl https://api.frogop.net/pools

# Query options for a user address
curl "https://api.frogop.net/user/opt1pftest.../options"

# Query options written by a specific address
curl "https://api.frogop.net/pools/opt1sqp30j.../options?writer=opt1pftest..."
```

---

## Update Deployed Config (pool addresses, etc.)

To add a new pool address without redeploying code:

1. Edit `POOL_ADDRESSES` in `indexer/wrangler.toml`
2. Push to `master` → auto-redeploys with new config

---

## Local Development

```bash
cd indexer

# Initialise local D1 (creates a local SQLite file)
npm run db:migrate:local

# Start local Worker at http://localhost:8787
npm run dev
```

Test locally:
```bash
curl http://localhost:8787/health
```

The local Worker uses the same `wrangler.toml` vars. No `.env` file needed.

---

## Database Operations

```bash
# Inspect production data
npx wrangler d1 execute frogop-indexer --command "SELECT COUNT(*) FROM options"
npx wrangler d1 execute frogop-indexer --command "SELECT * FROM indexer_state"

# Inspect local data (during wrangler dev)
npx wrangler d1 execute frogop-indexer --local --command "SELECT * FROM options LIMIT 10"

# Re-apply schema (safe — all statements use IF NOT EXISTS)
npm run db:migrate

# Reset and re-index from scratch (⚠ deletes all indexed data)
npx wrangler d1 execute frogop-indexer --command "DELETE FROM options; DELETE FROM pools; DELETE FROM fee_events; DELETE FROM indexer_state"
```

---

## Cron Trigger

The Worker polls OPNet every minute via a Cron Trigger defined in `wrangler.toml`:

```toml
[triggers]
crons = ["* * * * *"]
```

To verify the cron is firing:

1. Cloudflare Dashboard → Worker → **Triggers** tab → **Cron Triggers**
2. Check **Last run** timestamp and status

Or watch logs in real time:
```bash
npx wrangler tail
```

> **Free plan note**: Cron minimum interval is `*/5` (every 5 minutes) on the free plan,
> `* * * * *` (every 1 minute) on the paid plan ($5/mo).
> For OPNet testnet (~10 min blocks), the free plan interval is sufficient.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `/health` returns 500 | D1 schema not applied | Run `npm run db:migrate` |
| `lastBlock` stuck at 0 | Cron not firing or RPC error | Check `npx wrangler tail` for errors |
| `database_id` error on deploy | Placeholder not replaced in wrangler.toml | Run `npm run db:setup` |
| CORS error in browser | Origin not in allowlist | Check `src/api/router.ts` `getAllowedOrigin()` |
| Pool events not indexed | bech32 → hex resolution failed | Check `POOL_ADDRESSES` in wrangler.toml |
| GitHub Actions deploy fails | Missing secrets | Add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` to repo secrets |

---

## Architecture Reference

```
GitHub push to master (indexer/** changed)
  → GitHub Actions: npm ci && npm run type-check
  → cloudflare/wrangler-action: npx wrangler deploy
  → Worker live at api.frogop.net (custom domain in wrangler.toml)

Every minute (Cron Trigger):
  scheduled() → pollNewBlocks(env)
    → JSONRpcProvider.getBlockNumber()
    → for each new block: getBlock(n, prefetchTxs=true)
    → decodeBlock() → D1PreparedStatement[]
    → db.batch([...eventStmts, cursorStmt])   ← atomic

On API request:
  fetch() → handleFetch(request, env)
    → URL pattern match → D1 query → JSON response
```

**Key files**:

| File | Purpose |
|------|---------|
| `indexer/wrangler.toml` | Worker config, D1 binding, Cron, routes, env vars |
| `indexer/scripts/setup-db.sh` | One-time D1 create + wrangler.toml auto-patch |
| `indexer/src/worker.ts` | Entry point — `fetch()` + `scheduled()` exports |
| `indexer/src/db/schema.sql` | D1 schema (apply via `npm run db:migrate`) |
| `indexer/src/db/queries.ts` | Typed async D1 query helpers |
| `indexer/src/poller/index.ts` | Block polling logic |
| `indexer/src/decoder/index.ts` | Event → D1 statement decoder |
| `indexer/src/api/router.ts` | REST route handler |
| `.github/workflows/indexer.yml` | CI/CD: type-check on PR, deploy on master |

**Related docs**:
- Frontend deployment + API token guide: `docs/deployment/CLOUDFLARE_PAGES.md`
- Mainnet migration: `docs/deployment/MAINNET_MIGRATION.md`
