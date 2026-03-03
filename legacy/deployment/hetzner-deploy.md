# FroGop Deployment Runbook

> **FroGop frontend is deployed via Cloudflare Workers (static assets).**
> See [`docs/deployment/CLOUDFLARE_PAGES.md`](./CLOUDFLARE_PAGES.md) for the frontend deployment guide.
> The VPS/Docker setup below is **no longer used for FroGop** and is retained only as reference for the shared proxy server hosting other services (shoebillhl.ai).

---

## Current Architecture

```
Internet
  → Cloudflare Workers (FroGop SPA — global CDN, auto-deploy on push to master)

Internet
  → Cloudflare (DDoS, WAF, CDN, TLS termination)
    → Hetzner VPS — UFW: only Cloudflare IPs on 80/443
      → proxy container (nginx — TLS termination, routing by domain)
           └─ shoebillhl.ai    → h-quant-web :8080       (other site)
```

---

## 1. Provision Hetzner VPS

1. Create a new server on Hetzner Cloud (CX22 minimum: 2 vCPU, 4 GB RAM, Ubuntu 24.04 LTS)
2. Add your SSH public key during provisioning
3. Note the server's public IP address

---

## 2. Initial Server Setup

SSH into the server and run:

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER

# Install Docker Compose plugin
apt install -y docker-compose-plugin

# Verify
docker compose version
```

---

## 3. Harden SSH

```bash
nano /etc/ssh/sshd_config
# Set:
#   PasswordAuthentication no
#   PermitRootLogin prohibit-password

systemctl restart sshd
```

---

## 4. Configure UFW Firewall

```bash
apt install -y ufw

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
```

### Restrict 80/443 to Cloudflare IPs only

```bash
#!/bin/bash
CF_IPS=(
  103.21.244.0/22
  103.22.200.0/22
  103.31.4.0/22
  104.16.0.0/13
  104.24.0.0/14
  108.162.192.0/18
  131.0.72.0/22
  141.101.64.0/18
  162.158.0.0/15
  172.64.0.0/13
  173.245.48.0/20
  188.114.96.0/20
  190.93.240.0/20
  197.234.240.0/22
  198.41.128.0/17
)

for ip in "${CF_IPS[@]}"; do
  ufw allow from "$ip" to any port 80 proto tcp
  ufw allow from "$ip" to any port 443 proto tcp
done

ufw enable
ufw reload
echo "Done. Only Cloudflare IPs can reach ports 80/443."
```

> **Note**: Check https://www.cloudflare.com/ips/ occasionally to keep the list current.

---

## 5. Cloudflare Setup

Do this for **each domain** (frogop.com and shoebillhl.ai).

### DNS

1. Add an **A record** pointing to your Hetzner server IP
2. Proxy status: **Proxied (orange cloud)** ✓

### SSL/TLS

1. Set encryption mode to **Full (Strict)**

### Origin Certificate

1. Go to **SSL/TLS → Origin Server → Create Certificate**
2. Select RSA (2048), validity 15 years
3. Download `origin.crt` and `origin.key`

Repeat for both domains. You will have:

```
frogop.com     → frogop.crt + frogop.key
shoebillhl.ai  → shoebill.crt + shoebill.key
```

### Additional Settings (per domain)

- **SSL/TLS → Edge Certificates**: Enable **Always Use HTTPS**
- **Security → Bots**: Enable **Bot Fight Mode**

---

## 6. Deploy the Proxy

The proxy container is the only one that binds to ports 80/443.

```bash
# Clone the frogop repo (proxy/ lives here)
git clone https://github.com/shoebillrexmail-cmyk/frogop
cd frogop

# Create the shared Docker network (once, before any site containers)
docker network create proxy-net

# Place Cloudflare origin certs (never commit these)
mkdir -p proxy/ssl
# Copy via scp from your local machine:
#   scp frogop.crt frogop.key user@server:/path/to/frogop/proxy/ssl/
#   scp shoebill.crt shoebill.key user@server:/path/to/frogop/proxy/ssl/
chmod 600 proxy/ssl/*.key

# Edit proxy/nginx.conf — replace server_name values with your actual domains

# Start the proxy
docker compose -f proxy/docker-compose.yml up -d

# Verify
docker compose -f proxy/docker-compose.yml ps
curl -s http://localhost/health   # should return "ok"
```

---

## 7. Deploy FroGop

```bash
cd /path/to/frogop

# Set up environment (testnet is the default until mainnet launch)
cp frontend/.env.testnet .env.production
# Edit .env.production — fill in contract addresses once deployed

# Build and start
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# Verify the container is healthy and reachable internally
docker compose -f docker-compose.prod.yml ps
curl -s http://localhost:3000/health   # only works from inside the server
```

---

## 8. Update the Other Site (shoebillhl.ai / h-quant-web)

The `web` service in the shoebillhl.ai repo currently binds to ports 80/443 and handles its own TLS. It must be updated to:

1. **Remove** `ports: - "80:80" - "443:443"` from docker-compose
2. **Change** its nginx to listen on port 8080 (plain HTTP, no TLS)
3. **Join** `proxy-net`:
   ```yaml
   networks:
     - proxy-net

   # at the bottom of the file:
   networks:
     proxy-net:
       external: true
   ```
4. Stop the old container, bring it back up without the port bindings
5. The proxy will route `shoebillhl.ai` → `h-quant-web:8080` automatically

---

## 9. Verify End-to-End

```bash
# From your local machine:
curl -I https://frogop.com        # should return 200
curl -I https://shoebillhl.ai     # should return 200

# Security headers present?
curl -sI https://frogop.com | grep -E "strict-transport|x-frame|content-security"

# Direct server IP blocked (should timeout or refuse)?
curl -I http://YOUR_SERVER_IP
```

---

## 10. Updating FroGop

```bash
cd /path/to/frogop
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker image prune -f
```

## Updating the Proxy Config

```bash
# After editing proxy/nginx.conf:
docker compose -f proxy/docker-compose.yml exec proxy nginx -t   # test config
docker compose -f proxy/docker-compose.yml exec proxy nginx -s reload
```

---

## Adding a Third Site

1. Get a Cloudflare origin cert for the new domain, place it in `proxy/ssl/`
2. Add a new `server { }` block to `proxy/nginx.conf` (template is at the bottom of the file)
3. Make the new site's container join `proxy-net`
4. Reload the proxy: `nginx -s reload`

---

## Development (Local)

```bash
cp frontend/.env.dev frontend/.env.dev.local
docker compose -f docker-compose.dev.yml up
# Frontend available at http://localhost:5173
```

---

## Troubleshooting

| Problem | Check |
|---------|-------|
| 502 Bad Gateway | Site container not running or not on proxy-net — `docker network inspect proxy-net` |
| SSL handshake error | Cert not found at `proxy/ssl/` or wrong filename |
| Wrong site served | `server_name` mismatch in `proxy/nginx.conf` |
| SPA routes return 404 | `try_files` in `frontend/nginx/nginx.conf` |
| Old JS being served | Clear Cloudflare cache — Caching → Configuration → Purge Everything |
| Proxy won't start | `docker compose -f proxy/docker-compose.yml logs` |
