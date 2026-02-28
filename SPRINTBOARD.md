# FroGop Sprintboard

## Backlog

### Frontend

- [ ] **WebSocket real-time updates in frontend**
  - Subscribe to blocks for live block-height display
  - Detect TX confirmations without polling
  - `WebSocketRpcProvider` from `opnet`, URL: `wss://testnet.opnet.org/ws`

- [ ] **Frontend ↔ Testnet contract integration**
  > Previously blocked by Revenue Model + Contract Query Additions — both are now done
  - Wire up wallet connection (OPWallet / UniSat)
  - Pools page: call `getPoolCount()` + `getPoolByIndex(i)` to list all pools; fetch token metadata per pool
  - Pool detail: call `getOptionsBatch()` in pages of 20; filter by status=OPEN for orderbook view
  - Write option flow: `calculateCollateral()` → approve collateral token → `writeOption()` → confirm
  - Buy option flow: approve premiumToken (premium + fee) → `buyOption()` → confirm
  - Portfolio page: `getOptionsBatch()` across user's pools, filter client-side by `writer == me` and `buyer == me`; cache in localStorage
  - Exercise / cancel / settle flows
  - Real-time option status display

## In Progress

## Done

- [x] ~~Protocol Revenue Model~~ — Push-model fees (1% buy, 0.1% exercise, 1% cancel) implemented in OptionsPool + OptionsFactory. `feeRecipient` set at deployment, updatable by current recipient. Integration tests in 06-full-lifecycle.ts updated for fee deductions.
- [x] ~~Contract Query Additions~~ — `getPoolCount()` fixed, `getPoolByIndex(index)` + `registerPool()` added to factory, `getOptionsBatch(startId, count)` added to pool (capped at 50). Full integration tests in 07-query-methods.ts.
- [x] ~~Use WebSockets in integration tests~~ — Not needed; polling is fine for test scripts (block time is the bottleneck, not poll interval). WebSockets only beneficial in frontend.
- [x] All integration tests passing on testnet (13/13 lifecycle, 42+ total)
- [x] Testnet contracts deployed (tokens, factory, pool template, pool)
