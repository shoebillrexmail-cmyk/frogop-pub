# FroGop Sprintboard

## Backlog

### Protocol Revenue Model

- [ ] **Implement fee & revenue model in OptionsPool + integration tests**

  **Context:**
  Fee model decisions (confirmed):
  - `buyOption()`: 1% of premium, in premiumToken, accumulated in pool (pull model)
  - `exercise()`: 0.1% of buyer's proceeds, in proceeds token (underlying for CALL, premiumToken for PUT), accumulated in pool
  - `cancelOption()`: existing 1% of collateral, re-routed into per-token accumulators (not lost)
  - `settle()` / `writeOption()`: no fee
  - Fees never pushed to treasury mid-transaction (safety — user txs must never fail due to fee routing)
  - `feeRecipient` stored in pool, updatable only by current feeRecipient

  **Fee routing: push model** — fees are transferred directly to `feeRecipient` at the moment of each fee event. No accumulation, no claiming needed. Transfer uses the existing `_transfer()` helper (proven pattern). Only failure scenario is zero address, prevented by validation in `onDeployment()`.

  **Contract changes — OptionsPool:**
  - [ ] Add `FEE_RECIPIENT_POINTER` (StoredAddress) — set from calldata in `onDeployment()` (3rd address param after underlying + premiumToken); validate `!= Address.zero()`
  - [ ] Remove `ACCUMULATED_FEES_POINTER` and `_accumulatedFees` — no longer needed
  - [ ] Add constants: `BUY_FEE_BPS: u64 = 100`, `EXERCISE_FEE_BPS: u64 = 10`
  - [ ] `buyOption()`: compute `fee = premium * BUY_FEE_BPS / 10000`; transfer `premium - fee` to writer, transfer `fee` to feeRecipient via `_transfer()`; update `OptionPurchasedEvent` to include fee field
  - [ ] `exercise()` CALL: compute `fee = underlyingAmount * EXERCISE_FEE_BPS / 10000`; transfer `underlyingAmount - fee` to buyer, transfer `fee` to feeRecipient; update `OptionExercisedEvent`
  - [ ] `exercise()` PUT: compute `fee = strikeValue * EXERCISE_FEE_BPS / 10000`; transfer `strikeValue - fee` to buyer, transfer `fee` to feeRecipient; update `OptionExercisedEvent`
  - [ ] `cancelOption()`: existing 1% fee — change `_transfer(fee)` destination from `accumulatedFees` storage to direct `_transfer(token, feeRecipient, fee)`; update `OptionCancelledEvent`
  - [ ] Add `updateFeeRecipient(newAddr: Address)` — only callable by current `feeRecipient`; validates `newAddr != Address.zero()`; emits `FeeRecipientUpdatedEvent`
  - [ ] Add view methods: `feeRecipient()`, `buyFeeBps()`, `exerciseFeeBps()`; keep `cancelFeeBps()` (existing)
  - [ ] Add event: `FeeRecipientUpdatedEvent`
  - [ ] Remove `accumulatedFees()` view method and selector from `execute()`

  **Contract changes — OptionsFactory:**
  - [ ] Add `TREASURY_POINTER` (StoredAddress) — set in `onDeployment()` to `Blockchain.tx.origin`
  - [ ] Add `setTreasury(newAddr)` — only callable by owner
  - [ ] Add `getTreasury()` view
  - [ ] `createPool()`: validate `treasury != Address.zero()` before deploying pool (revert with `'Treasury not set'` if unset); pass current `treasury` address as 3rd param in pool `initCalldata`
  - [ ] Note: direct pool deployment in tests must also pass feeRecipient as 3rd calldata address

  **Integration tests:**
  - [ ] Test: `buyOption()` — verify writer receives `premium - fee`, pool accumulates correct fee in premiumToken
  - [ ] Test: `exercise()` CALL — verify buyer receives `underlyingAmount - fee`, pool accumulates correct fee in underlying
  - [ ] Test: `exercise()` PUT — verify buyer receives `strikeValue - fee`, pool accumulates correct fee in premiumToken
  - [ ] Test: `cancelOption()` — verify cancel fee routes to correct accumulator (underlying for CALL, premiumToken for PUT)
  - [ ] Test: `updateFeeRecipient()` — verify only current feeRecipient can call; verify new address receives subsequent fees; verify old address no longer receives fees
  - [ ] Test: `updateFeeRecipient()` to zero address — verify revert
  - [ ] Test: factory `createPool()` before `setTreasury()` — verify revert with `'Treasury not set'`
  - [ ] Update test 06 full lifecycle to account for fee deductions in all balance assertions

  **About page update:**
  - [ ] Update fee table to reflect final model (buy fee = 1% of premium charged to buyer deducted before writer receives; exercise fee = 0.1% of proceeds; cancel fee = 1% of collateral)

---

### Contract Query Additions
> **Must be completed before UI integration starts.** The UI cannot list pools or user positions without these.

- [ ] **Add pool enumeration to OptionsFactory**
  - [ ] Add `POOL_LIST_POINTER` — StoredArray (or equivalent) of deployed pool addresses
  - [ ] Fix `getPoolCount()` — currently returns hardcoded `u256.Zero`; must return actual count
  - [ ] Add `getPoolByIndex(index: u256)` — returns pool address at given index; reverts if out of bounds
  - [ ] `createPool()` — push new pool address to list after deployment
  - [ ] Update integration tests to verify pool count increments and `getPoolByIndex` works

- [ ] **Add batch option fetching to OptionsPool**
  - [ ] Add `getOptionsBatch(startId: u256, count: u256)` view method — returns packed option data for `count` options starting at `startId`; stops early at `optionCount` boundary
  - [ ] Return format: fixed-size packed structs (same fields as `getOption()`) so frontend can decode a slice in one RPC call
  - [ ] Update integration tests to verify batch decode matches individual `getOption()` calls

---

### Frontend

- [ ] **WebSocket real-time updates in frontend**
  - Subscribe to blocks for live block-height display
  - Detect TX confirmations without polling
  - `WebSocketRpcProvider` from `opnet`, URL: `wss://testnet.opnet.org/ws`

- [ ] **Frontend ↔ Testnet contract integration**
  > Blocked by: Revenue Model + Contract Query Additions above
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

- [x] ~~Use WebSockets in integration tests~~ — Not needed; polling is fine for test scripts (block time is the bottleneck, not poll interval). WebSockets only beneficial in frontend.
- [x] All integration tests passing on testnet (13/13 lifecycle, 42+ total)
- [x] Testnet contracts deployed (tokens, factory, pool template, pool)
