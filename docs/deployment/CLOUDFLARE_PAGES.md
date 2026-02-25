# FroGop — Cloudflare Pages Deployment

FroGop is a pure SPA. No backend, no server-side logic — everything runs in the browser
via OPWallet and direct OPNet RPC calls. Cloudflare Pages is the right fit.

## Why Cloudflare Pages (not VPS)

| | Cloudflare Pages | VPS + Docker |
|---|---|---|
| Cost | Free (500 builds/month) | ~€5–15/month |
| Maintenance | Zero | OS updates, Docker, nginx |
| Global CDN | Built-in | Cloudflare proxy only |
| Deploy | Push to GitHub → done | SSH + docker compose up |
| Custom domain | Dashboard click | DNS + Origin Cert + nginx |
| HTTPS | Automatic | Manual cert management |
| Compatible with OPNet integration? | ✅ Yes — all calls go browser → OPNet RPC | ✅ Yes |

The Docker prod setup (`frontend/Dockerfile.prod`, `proxy/`) is kept as reference
and is used for shoebillhl.ai on the shared VPS. FroGop does not need it.

---

## One-Time Setup

### 1. Connect GitHub

1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to **Workers & Pages → Create → Pages → Connect to Git**
3. Authorize GitHub and select the `frogop` repository
4. Choose branch: `master`

### 2. Build Settings

| Setting | Value |
|---------|-------|
| Framework preset | None (custom) |
| Build command | `cd frontend && npm install --legacy-peer-deps && npm run build` |
| Build output directory | `frontend/dist` |
| Root directory | `/` (repo root) |
| Node.js version | `24` |

> Set Node.js version under **Settings → Environment Variables** by adding:
> `NODE_VERSION = 24`

### 3. Environment Variables

Add these under **Settings → Environment Variables**. Set them for both
**Production** and **Preview** environments.

| Variable | Production value | Preview value |
|----------|-----------------|---------------|
| `VITE_OPNET_NETWORK` | `testnet` | `testnet` |
| `VITE_OPNET_RPC_URL` | `https://testnet.opnet.org` | `https://testnet.opnet.org` |
| `VITE_FACTORY_ADDRESS` | *(leave blank until deployed)* | *(blank)* |
| `VITE_POOL_TEMPLATE_ADDRESS` | *(leave blank until deployed)* | *(blank)* |

> **VITE_ vars are baked into the JS bundle at build time.** Changing a variable
> in the dashboard requires a new deploy to take effect — trigger one manually via
> **Deployments → Retry deployment**.

### 4. Custom Domain

1. Go to **Workers & Pages → frogop → Custom Domains**
2. Click **Set up a custom domain**
3. Enter your domain (e.g. `frogop.com`)
4. Cloudflare will automatically configure DNS since your domain is already on Cloudflare
5. SSL is handled automatically — no origin cert needed

---

## Deploying

Every push to `master` triggers an automatic build and deploy. That's it.

To deploy manually (e.g. after updating env vars):
1. Go to **Workers & Pages → frogop → Deployments**
2. Click **Retry deployment** on the latest deploy

---

## Updating Contract Addresses After Deployment

When contracts are deployed to testnet:

1. Go to **Settings → Environment Variables**
2. Update `VITE_FACTORY_ADDRESS` and `VITE_POOL_TEMPLATE_ADDRESS`
3. Trigger a new deploy (env vars are baked at build time)

---

## Switching to Mainnet

When ready for mainnet:

1. Update environment variables:
   - `VITE_OPNET_NETWORK` → `mainnet`
   - `VITE_OPNET_RPC_URL` → `https://mainnet.opnet.org`
   - `VITE_FACTORY_ADDRESS` → mainnet factory address
   - `VITE_POOL_TEMPLATE_ADDRESS` → mainnet pool template address
2. Trigger a new deploy
3. The network badge in the UI will automatically hide on mainnet

See `docs/deployment/MAINNET_MIGRATION.md` for the full pre-flight checklist.

---

## Preview Deployments

Every pull request or non-master branch push gets a unique preview URL:
`https://<hash>.frogop.pages.dev`

Useful for reviewing frontend changes before merging. Preview env vars
can be configured separately from production.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails — wrong Node version | Add `NODE_VERSION = 24` env var |
| Build fails — `npm ci` error | Build command uses `npm install --legacy-peer-deps` not `npm ci` |
| Old contract addresses showing | Env var change needs a new deploy — retry deployment |
| Custom domain not working | Check DNS in Cloudflare dashboard — should auto-configure |
| `VITE_` var not taking effect | These are baked at build time — redeploy after changing |
