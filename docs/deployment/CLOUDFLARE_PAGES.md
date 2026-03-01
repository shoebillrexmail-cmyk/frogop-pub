# FroGop — Cloudflare Workers Deployment (Static Site)

> Migrated from Cloudflare Pages to **Workers Static Assets** on 2026-03-01.
> Same result (global CDN, free tier, auto-deploy on push) but uses the unified
> `wrangler deploy` pipeline — same as the indexer.

FroGop is a pure SPA. No backend, no server-side logic — everything runs in the browser
via OPWallet and direct OPNet RPC calls.

---

## Cloudflare API Token (shared by all workflows)

Both the **frontend** and **indexer** GitHub Actions workflows use the same API token.
Create one token that covers everything.

### Creating the token

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token** → **Custom Token**
3. Add these permissions:

| Scope | Resource | Permission | Used by |
|-------|----------|------------|---------|
| Account | Workers Scripts | Edit | Frontend + Indexer deploy |
| Account | D1 | Edit | Indexer D1 schema migrations |
| Account | Account Settings | Read | Account listing / wrangler whoami |
| Zone | Workers Routes | Edit | Indexer custom domain (`api.frogop.net`) |

4. **Account Resources:** Include → your account
5. **Zone Resources:** Include → All zones (or specific zone `frogop.net`)
6. Click **Continue to summary** → **Create Token**

### GitHub Secrets

Go to **GitHub repo → Settings → Secrets and variables → Actions** and set:

| Secret | Value |
|--------|-------|
| `CLOUDFLARE_API_TOKEN` | The token created above |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → right sidebar on any Workers page |

Both workflows (`.github/workflows/frontend.yml` and `.github/workflows/indexer.yml`)
reference these same two secrets.

---

## How It Works

```
GitHub push to master (frontend/** changed)
  → GitHub Actions: npm ci → lint → typecheck → test → vite build
  → wrangler deploy → frontend/dist/ → Cloudflare edge (global CDN)
  → SPA routing: all unknown paths → index.html (wrangler.toml)
```

The `frontend/wrangler.toml` configures the Worker:

```toml
name = "frogop-frontend"
compatibility_date = "2026-01-01"

[assets]
directory = "./dist"
not_found_handling = "single-page-application"
```

---

## Build-Time Environment Variables

These are set in `.github/workflows/frontend.yml` (deploy job) and baked into the
JS bundle at build time. They are **not** set in the Cloudflare dashboard.

| Variable | Value (testnet) | Required | Notes |
|----------|----------------|----------|-------|
| `VITE_OPNET_NETWORK` | `testnet` | Yes | Determines RPC/WS defaults |
| `VITE_OPNET_RPC_URL` | `https://testnet.opnet.org` | No | Falls back to network default |
| `VITE_OPNET_WS_URL` | *(not set)* | No | Falls back to network default |
| `VITE_POOL_ADDRESS` | `opt1sqze2thmp29pkkj8ft8qll0383k3ek4sgvvfqd9r5` | Yes* | Direct pool address |
| `VITE_FACTORY_ADDRESS` | *(empty)* | No* | Factory for pool discovery |
| `VITE_INDEXER_URL` | `https://api.frogop.net` | No | Falls back to on-chain RPC |
| `VITE_POOL_TEMPLATE_ADDRESS` | *(empty)* | No | Unused currently |
| `VITE_NATIVESWAP_ADDRESS` | *(empty)* | No | Price ratio display |

*At least one of `VITE_POOL_ADDRESS` or `VITE_FACTORY_ADDRESS` must be set.

> **VITE_ vars are baked into the JS bundle at build time.** Any change requires
> a redeploy (push to master) to take effect.

---

## Deploying

Every push to `master` that touches `frontend/**` triggers an automatic build and deploy.

The deployed URL is `https://frogop-frontend.<subdomain>.workers.dev`.

To add a custom domain, add a `routes` section to `frontend/wrangler.toml`:

```toml
routes = [
  { pattern = "app.frogop.net", custom_domain = true }
]
```

This requires the Zone > Workers Routes permission (already included in the token above)
and that `frogop.net` nameservers are managed by Cloudflare.

---

## Switching to Mainnet

1. Update environment variables in `.github/workflows/frontend.yml`:
   - `VITE_OPNET_NETWORK` → `mainnet`
   - `VITE_OPNET_RPC_URL` → `https://mainnet.opnet.org`
   - Contract addresses → mainnet values
2. Push to `master` → auto-redeploys with new config
3. The network badge in the UI will automatically hide on mainnet

See `docs/deployment/MAINNET_MIGRATION.md` for the full pre-flight checklist.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Deploy fails — auth error | Check API token has all 4 permissions listed above |
| SPA routes return 404 | `wrangler.toml` must have `not_found_handling = "single-page-application"` |
| Old contract addresses in bundle | Env vars are build-time — push a new commit to redeploy |
| Custom domain not working | Add `routes` to `wrangler.toml` + Zone Workers Routes permission |
| VITE_ var not taking effect | These are baked at build time — redeploy after changing |
