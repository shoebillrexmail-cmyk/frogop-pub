# FroGop — Cloudflare Workers Deployment (Static Site)

> Cloudflare deprecated Pages in 2025. The current setup uses **Cloudflare Workers
> with Static Assets** — same result (global CDN, free tier, auto-deploy on push)
> but with a wrangler-based deploy pipeline.

FroGop is a pure SPA. No backend, no server-side logic — everything runs in the browser
via OPWallet and direct OPNet RPC calls. This is the right fit.

---

## Why Cloudflare Workers (not VPS)

| | Cloudflare Workers | VPS + Docker |
|---|---|---|
| Cost | Free (generous limits) | ~€5–15/month |
| Maintenance | Zero | OS updates, Docker, nginx |
| Deploy | Push to GitHub → done | SSH + docker compose up |
| Custom domain | Dashboard click | DNS + Origin Cert + nginx |
| HTTPS | Automatic | Manual cert management |
| SPA routing | `not_found_handling` in wrangler.toml | nginx `try_files` |
| Compatible with OPNet integration? | ✅ Yes — all calls are browser → OPNet RPC | ✅ Yes |

---

## How It Works

```
GitHub push to master
  → Cloudflare builds: cd frontend && npm install && npm run build
  → wrangler deploys: frontend/dist/ → Cloudflare edge (global CDN)
  → SPA routing: all unknown paths → index.html (configured in wrangler.toml)
```

The `wrangler.toml` at the repo root tells wrangler where the built files are
and enables SPA routing:

```toml
name = "frogop"
compatibility_date = "2025-01-01"

[assets]
directory = "./frontend/dist"
not_found_handling = "single-page-application"
```

---

## One-Time Setup

### 1. Connect GitHub

1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to **Workers & Pages → Create**
3. Connect to Git → select the `frogop` repository
4. Choose branch: `master`

### 2. Build Settings (setup wizard)

The wizard shows two fields. Fill them in:

| Field | Value |
|-------|-------|
| Build command | `cd frontend && npm install --legacy-peer-deps && npm run build` |
| Deploy command | `npx wrangler deploy` *(keep the default)* |

The **path** field (showing `/`) is the root directory — leave it as `/`.

Click **Save and Deploy**. The first build will succeed and deploy automatically.
`wrangler.toml` tells wrangler to serve `frontend/dist` with SPA routing enabled.

### 3. Environment Variables

In **Settings → Environment Variables → Add variables**, add:

| Variable | Value |
|----------|-------|
| `VITE_OPNET_NETWORK` | `testnet` |
| `VITE_OPNET_RPC_URL` | `https://testnet.opnet.org` |
| `VITE_FACTORY_ADDRESS` | *(leave blank until contracts deployed)* |
| `VITE_POOL_TEMPLATE_ADDRESS` | *(leave blank until contracts deployed)* |

After saving, trigger a redeploy — **Deployments → Retry deployment**.

> **VITE_ vars are baked into the JS bundle at build time.** Any change requires
> a redeploy to take effect.

**Node.js version** is controlled by the `.nvmrc` file in the repo root (value: `24`).
Cloudflare reads this automatically. The default build environment ships Node 22 which
is too old for `@btc-vision/*` packages — `.nvmrc` overrides it.

### 4. Custom Domain

1. Go to **Workers & Pages → frogop → Settings → Domains & Routes**
2. Click **Add** → enter your domain (e.g. `frogop.com`)
3. Cloudflare auto-configures DNS since your domain is already on Cloudflare
4. HTTPS is automatic — no origin cert needed

---

## Deploying

Every push to `master` triggers an automatic build and deploy.

To deploy manually (e.g. after updating env vars):
1. Go to **Workers & Pages → frogop → Deployments**
2. Click **Retry deployment** on the latest entry

---

## Updating Contract Addresses After Deployment

When contracts are deployed to testnet:

1. Go to **Settings → Environment Variables**
2. Update `VITE_FACTORY_ADDRESS` and `VITE_POOL_TEMPLATE_ADDRESS`
3. Trigger a redeploy

---

## Switching to Mainnet

1. Update environment variables:
   - `VITE_OPNET_NETWORK` → `mainnet`
   - `VITE_OPNET_RPC_URL` → `https://mainnet.opnet.org`
   - `VITE_FACTORY_ADDRESS` → mainnet factory address
   - `VITE_POOL_TEMPLATE_ADDRESS` → mainnet pool template address
2. Trigger a redeploy
3. The network badge in the UI will automatically hide on mainnet

See `docs/deployment/MAINNET_MIGRATION.md` for the full pre-flight checklist.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails — wrong Node version | `.nvmrc` file (value `24`) must be in repo root |
| Build fails — npm error | Build command uses `npm install --legacy-peer-deps` not `npm ci` |
| SPA routes return 404 | `wrangler.toml` must have `not_found_handling = "single-page-application"` |
| Old contract addresses in bundle | Env var change needs a redeploy — retry deployment |
| Custom domain not working | Check **Settings → Domains & Routes** in dashboard |
| VITE_ var not taking effect | These are baked at build time — redeploy after changing |
