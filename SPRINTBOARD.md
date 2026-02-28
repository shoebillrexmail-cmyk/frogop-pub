# FroGop Sprintboard

## Backlog

### Frontend

- [ ] **WebSocket real-time updates in frontend**
  - Replace HTTP polling with `WebSocketRpcProvider` for block subscriptions
  - Live block-height display via WS events
  - TX confirmation detection via WS instead of polling `getTransactionReceipt`
  - `WebSocketRpcProvider` from `opnet`, URL: `wss://testnet.opnet.org/ws`

### CI/CD

- [ ] **Create Cloudflare Pages project for frontend**
  - Run `wrangler pages project create frogop-frontend` once from CLI
  - Set environment variables in Pages dashboard: `VITE_OPNET_NETWORK`, `VITE_OPNET_RPC_URL`, `VITE_POOL_ADDRESS`, `VITE_FACTORY_ADDRESS`, `VITE_INDEXER_URL`
  - `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets already exist in GitHub (used by indexer)

## In Progress

- [ ] **WebSocket real-time updates** — replacing HTTP polling with WS subscriptions

## Done

- [x] ~~Protocol Revenue Model~~ — Push-model fees (1% buy, 0.1% exercise, 1% cancel) implemented in OptionsPool + OptionsFactory. `feeRecipient` set at deployment, updatable by current recipient. Integration tests in 06-full-lifecycle.ts updated for fee deductions.
- [x] ~~Contract Query Additions~~ — `getPoolCount()` fixed, `getPoolByIndex(index)` + `registerPool()` added to factory, `getOptionsBatch(startId, count)` added to pool (capped at 50). Full integration tests in 07-query-methods.ts.
- [x] ~~Use WebSockets in integration tests~~ — Not needed; polling is fine for test scripts (block time is the bottleneck, not poll interval). WebSockets only beneficial in frontend.
- [x] All integration tests passing on testnet (13/13 lifecycle, 42+ total)
- [x] Testnet contracts deployed (tokens, factory, pool template, pool)
- [x] ~~Frontend CI/CD~~ — `frontend.yml`: lint → typecheck → test → build on PR; deploy to Cloudflare Pages on push to master
- [x] ~~Contracts CI~~ — `contracts.yml`: lint → typecheck → WASM build → unit tests on PR; upload WASM artifacts on push to master
- [x] ~~Indexer tests in CI~~ — Uncommented `npm test` step in `indexer.yml` (poller + decoder + router tests)
- [x] ~~Frontend ↔ Testnet contract integration~~ — Wallet connection (WalletConnect/OPWallet), pool discovery (factory + direct), options table with filtering, write/buy/exercise/cancel/settle modal flows with 2-step approval, portfolio page with written + purchased sections, balances card.
- [x] ~~OHLCV Price Tracking~~ — Indexer extended with NativeSwap SwapExecuted decoder, spot price polling via getQuote, OHLCV candle rollup (1h/4h/1d/1w), MOTO/PILL cross-rate, /prices/:token/candles|latest|history API. Frontend PriceChart (TradingView lightweight-charts) on PoolsPage.
- [x] ~~Transaction Progress Tracking~~ — TransactionContext with localStorage persistence (keyed by wallet), useTransactionFlow for multi-step approval resume, useTransactionPoller for receipt polling, TransactionToast global indicator. All 5 modals wired (Buy, Write, Exercise, Cancel, Settle). Auto-refetch on confirmed TX in PoolsPage + PortfolioPage.
