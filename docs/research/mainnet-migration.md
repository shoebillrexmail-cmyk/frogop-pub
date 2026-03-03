# Mainnet Migration Checklist

Steps to switch FroGop production from OPNet testnet to mainnet.

## Pre-conditions

- [ ] Contracts audited and approved for mainnet
- [ ] OptionsFactory deployed on mainnet
- [ ] OptionsPool template deployed on mainnet
- [ ] Factory configured with correct pool template address
- [ ] Integration tests passing on mainnet
- [ ] Mainnet contract addresses recorded

## Migration Steps

### 1. Update environment file

```bash
cp frontend/.env.mainnet .env.production
```

Edit `.env.production` and fill in mainnet contract addresses:

```env
VITE_OPNET_NETWORK=mainnet
VITE_OPNET_RPC_URL=https://mainnet.opnet.org
VITE_FACTORY_ADDRESS=<mainnet factory address>
VITE_POOL_TEMPLATE_ADDRESS=<mainnet pool template address>
```

### 2. Rebuild and redeploy

```bash
# VITE_ vars are baked into the bundle — must rebuild
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

### 3. Verify

```bash
# Check the bundle contains mainnet config (should show mainnet RPC)
docker compose -f docker-compose.prod.yml exec frontend \
  grep -r "mainnet.opnet.org" /usr/share/nginx/html/assets/

# Smoke test the site
curl -s https://yourdomain.com | grep -i mainnet
```

### 4. Update documentation

- [ ] Update `frontend/.env.testnet` with final testnet addresses for reference
- [ ] Update sprint board — mark mainnet migration complete
- [ ] Announce to users

## Rollback

If mainnet has issues, roll back to testnet immediately:

```bash
cp frontend/.env.testnet .env.production
# Fill in testnet addresses
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

## Notes

- `VITE_OPNET_NETWORK=mainnet` uses `networks.bitcoin` from `@btc-vision/bitcoin`
- `VITE_OPNET_NETWORK=testnet` uses `networks.opnetTestnet` — NOT `networks.testnet` (Testnet4)
- Network badge in UI automatically hides on mainnet
