# FrogOp Unified Roadmap

> **Last updated**: 2026-03-01
> **Single source of truth** for project direction. Phase-specific deep dives remain in their own files for reference.

---

## Project Summary

FrogOp is a **decentralized peer-to-peer options protocol on Bitcoin L1** built on OPNet. Users write, buy, exercise, and settle fully-collateralized options on OP20 token pairs — all without oracles, bridges, or custodians.

**Tokens**: MOTO (underlying) / PILL (premium)
**Network**: OPNet testnet (Signet fork, ~10 min blocks)

---

## Planning Assumptions

| Parameter | Value | Notes |
|-----------|-------|-------|
| **Team size** | 1 developer | Solo dev; estimates assume sequential work |
| **Sprint cadence** | 1 sprint = ~2 weeks | Each sprint targets ~8-10 person-days of stories |
| **OPNet block time** | ~10 min (Signet) | Integration tests require mining; add buffer for testnet deploy cycles |
| **Contract upgrade delay** | 144 blocks (~24h) | Built-in timelock via `Upgradeable` base class |
| **Testnet deploy cycle** | ~1 day | Build WASM → deploy → wait for mine → verify |

> All time estimates are **person-days** for a single developer. Parallel work (e.g., frontend + contract by two devs) would shorten wall-clock time.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FROGOP PROTOCOL STACK                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHASE 1 (DONE)       PHASE 1.5 (NEXT)    PHASE 2          PHASE 3        │
│  ┌───────────────┐    ┌───────────────┐    ┌─────────────┐  ┌───────────┐  │
│  │ OptionsPool   │    │ transferOpt   │    │ NativeSwap  │  │ AMMPool   │  │
│  │ OptionsFactory│    │ batchCancel   │    │ Bridge      │  │ Vaults    │  │
│  │ Full lifecycle│    │ batchSettle   │    │ BTC premiums│  │ LP tokens │  │
│  │ 3-tier fees   │    │ rollOption    │    │ CSV locks   │  │ x*y=k     │  │
│  └───────────────┘    └───────────────┘    ├─────────────┤  └───────────┘  │
│                                            │ SpreadRouter│                  │
│  ┌───────────────┐    ┌───────────────┐    │ Atomic legs │                  │
│  │ Frontend MVP  │    │ P&L charts    │    └─────────────┘                  │
│  │ Indexer + D1  │    │ Strategy      │                                     │
│  │ WS blocks     │    │   templates   │                                     │
│  │ Price charts  │    │ Onboarding    │                                     │
│  └───────────────┘    └───────────────┘                                     │
│                                                                             │
│  Bitcoin L1 (OPNet) ── No oracle ── 100% collateral ── Zero bridge risk    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Core MVP — COMPLETE ✅

> **Status**: All deliverables shipped. Contracts deployed on testnet. Frontend live. Indexer operational.
> **Deep dive**: [PHASE_1_MVP.md](./PHASE_1_MVP.md)

### What Was Delivered

#### Smart Contracts

| Contract | Key Methods | Status |
|----------|-------------|--------|
| **OptionsPool** | writeOption, buyOption, exercise, cancelOption, settle, updateFeeRecipient, getOption, getOptionsBatch, optionCount + 6 view methods | ✅ Deployed |
| **OptionsFactory** | registerPool, getPool, getPoolByIndex, getPoolCount, setPoolTemplate, setTreasury, getOwner | ✅ Deployed |

**Fee Model** (ceiling division, routed to dedicated feeRecipient):

| Action | Fee | Applied To |
|--------|-----|------------|
| Buy | 1% (100 bps) | Premium — deducted before writer receives |
| Exercise | 0.1% (10 bps) | Buyer's proceeds (underlying for calls, strike value for puts) |
| Cancel (before expiry) | 1% (100 bps) | Collateral — deducted from writer's refund |
| Cancel (after expiry) | 0% | No fee for cleanup |
| Settle | 0% | No fee |
| Write | 0% | No fee |

**Key Constants**: GRACE_PERIOD = 144 blocks (~24h), MAX_EXPIRY = 52,560 blocks (~1yr), MAX_BATCH = 9 options per getOptionsBatch

#### Frontend

| Component | Tech | Status |
|-----------|------|--------|
| Landing page | React 19, Vite 7, Tailwind 4 | ✅ |
| Pools page (trading UI, options table, write panel, price chart) | lightweight-charts, WebSocket blocks | ✅ |
| Portfolio page (written + purchased options, actions) | useUserOptions (indexer fast path) | ✅ |
| About page (FAQ, fee schedule) | — | ✅ |
| Wallet integration | @btc-vision/walletconnect | ✅ |
| 2-step approval flows (all actions) | useTransactionFlow | ✅ |
| TX tracking + toasts | TransactionContext, localStorage | ✅ |

#### Indexer

| Feature | Tech | Status |
|---------|------|--------|
| Block polling + event decoding | Cloudflare Workers | ✅ |
| Options database | D1 SQLite | ✅ |
| REST API (7 endpoints) | /health, /pools, /options, /user, /prices | ✅ |
| Price candles (1h, 4h, 1d, 1w) | NativeSwap SwapExecuted events | ✅ |
| Spot price polling (getQuote) | NativeSwap DEX via raw `provider.call` | ✅ |
| Batched D1 writes | Single `db.batch()` per cron (free-tier safe) | ✅ |
| Subrequest budget tests | Validates stay under 50 subrequest limit | ✅ |

#### Tests

| Suite | Count | Status |
|-------|-------|--------|
| Unit tests (Factory + Pool) | 22 | ✅ 22/22 |
| Integration tests (01–07) | 70+ | ✅ All passing |
| Frontend tests (components, hooks, services) | 40+ | ✅ All passing |
| Indexer tests (API, decoder, poller, budget, candles, prices, pipeline, integration) | 156 | ✅ All passing |
| Gas baseline measurements | 20 | ✅ Documented |

### Post-Phase 1 Fixes (2026-03-01)

Issues discovered after initial deployment, now resolved:

| Issue | Root Cause | Fix | Regression Test |
|-------|------------|-----|-----------------|
| Indexer price polling returned "Invalid contract" | Wrong NativeSwap contract address in `wrangler.toml` (`0xb056ba05...`) | Updated to actual MotoSwap DEX (`0x4397befe...`) | Integration test verifies SwapExecuted events from this address |
| `getQuote` returned "Method not found" on correct contract | Selector computed from `'getQuote'` instead of full signature `'getQuote(address,uint64)'` (`0x0c8b6164` vs `0x51852102`) | Fixed hardcoded selector to match OPNet ABI | `prices.test.ts` regression test computes SHA-256 of full signature independently |
| Price result silently dropped (no error, no data stored) | `instanceof CallResult` fails in bundled Workers (esbuild module dedup) | Replaced with duck-type check (`'result' in obj && typeof obj.result.readU256 === 'function'`) | Budget + pipeline tests verify prices flow through |
| Cron stopped running for ~11 hours | Repeated failures on old contract caused Cloudflare to throttle the trigger | New deployment re-registered the cron trigger; fixed root causes above | CI type-check + test gate prevents broken deploys |

### Known Technical Debt from Phase 1

These items are not blocking but should be addressed during Phase 1.5 work:

| Debt Item | Severity | When to Address | Notes |
|-----------|----------|-----------------|-------|
| No per-address option index on-chain | Low | Sprint 6 (or defer to Phase 2) | Currently relies on client-side batch scan via `getOptionsBatch` + indexer. Works but scales poorly past ~1k options per pool. |
| Factory `createPool` non-functional | Low | Won't fix | OPNet runtime doesn't support `deployContractFromExisting`. Direct deploy + `registerPool` is the permanent pattern. |
| Frontend test coverage ~40 tests | Medium | Sprint 6 (E2E stories) | Happy paths covered; edge cases (network errors, wallet disconnects, race conditions) not tested. |
| Indexer has no retry/dead-letter queue | Medium | Sprint 3 (indexer changes) | Missed blocks during downtime aren't backfilled. Add gap detection. |
| No contract event versioning | Low | Sprint 3 (new events) | When adding `OptionTransferredEvent` and `OptionRolledEvent`, establish event version scheme for indexer compatibility. |

---

## Phase 1.5: UX & Secondary Market — NEXT 🔜

> **Goal**: Transform the working MVP into a competitive, user-friendly product.
> **Timeline**: ~12 weeks (6 two-week sprints, solo developer)
> **Contract changes**: Sprints 3-5 require new methods + WASM rebuild + testnet upgrade
> **Prerequisite**: Phase 1 ✅

### Sprint Dependencies

```
Sprint 1 (P&L + Calculator)
    │
    ▼
Sprint 2 (Strategy Templates)     Sprint 3 (Transfer) ─────┐
    │                                   │                    │
    │                                   ▼                    │
    │                             Sprint 4 (Batch) ──────────┤ Single WASM
    │                                   │                    │ upgrade after
    │                                   ▼                    │ Sprint 5
    │                             Sprint 5 (Rolling) ────────┘
    │                                   │
    ▼                                   ▼
Sprint 6 (UX Polish + E2E)  ◄──── All sprints
```

**Key dependency notes:**
- Sprint 2 requires Sprint 1's premium calculator
- Sprints 3, 4, 5 each add contract methods — can be developed sequentially, but **deploy as a single WASM upgrade** after Sprint 5 to avoid 3 separate upgrade cycles (3 x 144-block timelocks)
- Sprint 6 depends on all prior work for E2E test coverage
- Sprints 1-2 (frontend only) can proceed in parallel with Sprints 3-5 planning if a second developer is available

### Sprint 1: Premium Calculator & P&L Visualization

**Type**: Frontend only — zero deployment risk

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 1.1 | **Suggested premium** for writers based on MotoSwap spot price | `premiumCalculator.ts` service (simplified Black-Scholes), `useSuggestedPremium` hook, show range in WriteOptionPanel | 3d |
| 1.2 | **P&L diagram** before buying an option | `PnLChart.tsx` (lightweight-charts), breakeven/max-loss/max-gain annotations, integrate into BuyOptionModal | 3d |
| 1.3 | **Live unrealized P&L** on Portfolio positions | `usePnL` hook, P&L column in OptionsTable, "Total P&L" summary card, color-coded +/- | 2d |
| 1.4 | **Simplified Greeks** (Delta, Theta) | `greeksCalculator.ts`, plain-language tooltips in BuyOptionModal ("Price sensitivity: High"), color indicators | 2d |

**Exit criteria**: Writer sees suggested premium. Buyer sees P&L chart. Portfolio has live P&L column. All unit tested.

---

### Sprint 2: Strategy Templates

**Type**: Frontend only — no contract changes

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 2.1 | **Covered Call** template — "Earn yield on MOTO" | Card UI, auto-fill CALL at 120% spot / 30d / user's balance, pre-fill WriteOptionPanel | 2d |
| 2.2 | **Protective Put** template — "Insure your position" | Scan open puts at 80-95% of spot, show best available, open BuyOptionModal | 2d |
| 2.3 | **Collar** template — "Lock in a price range" | Two-step: write call at 120% + buy put at 80%, show net premium, progress indicator | 3d |
| 2.4 | **Quick Strategies** section on Pools page | 3 strategy cards above options table, estimated premium/cost, responsive mobile layout | 1d |

**Exit criteria**: Three templates accessible from Pools page. Each pre-fills appropriate modal. Explanatory tooltips on all.

**Dependency**: Sprint 1 (premium calculator)

---

### Sprint 3: Option Transfer — Secondary Market

**Type**: Contract + Frontend + Indexer

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 3.1 | **`transferOption(optionId, newBuyer)`** contract method | Validate caller==buyer, status==PURCHASED, not expired. Update buyer in storage. Emit `OptionTransferredEvent`. Reentrancy guard. | 2d |
| 3.2 | **Integration tests** for transfer | Write→buy→transfer→verify new buyer can exercise, old cannot. Test reverts for zero addr, non-purchased, expired. Build WASM, deploy. | 3d |
| 3.3 | **"Transfer" button** in frontend | TransferModal.tsx (recipient bech32 input), resolve via getPublicKeyInfo, execute via getContract+sendTransaction | 2d |
| 3.4 | **Transfer history** in indexer | Decode OptionTransferred event, update buyer in D1, add `transfers` table, GET endpoint, badge on UI | 2d |

**Exit criteria**: Buyer can transfer purchased option. New buyer can exercise. Transfer history in indexer.

**OPNet verified**: Simple storage update of buyer field. No cross-contract calls needed.

---

### Sprint 4: Batch Operations

**Type**: Contract + Frontend

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 4.1 | **`batchCancel(optionIds[])`** — cancel up to 5 options atomically | Hard cap `MAX_BATCH_SIZE=5`. Revert if any fails. Gas profiling with `Blockchain.traceGas`. | 3d |
| 4.2 | **`batchSettle(optionIds[])`** — settle up to 5 expired options | Non-atomic (skip unsettleable, continue). Gas profiling. | 2d |
| 4.3 | **Integration tests** for batch | Batch cancel 3 options, verify collateral. Batch settle 3 expired. Test MAX_BATCH_SIZE revert. Deploy. | 3d |
| 4.4 | **"Cancel All" / "Settle All"** buttons in frontend | Filter applicable options, batch in groups of 5, progress indicator for multi-TX | 2d |

**Exit criteria**: Batch cancel/settle working on testnet. Gas profiled. Frontend batch buttons.

**OPNet verified**: Bounded for loops allowed (`while` forbidden). 5 items with 1 storage read + 1 write + 1 token transfer each — well within ~1B gas budget.

---

### Sprint 5: Rolling Mechanism

**Type**: Contract + Frontend

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 5.1 | **`rollOption(optionId, newStrike, newExpiry, newPremium)`** | Validate writer, OPEN status. Cancel old (refund minus fee), create new (lock collateral). Net collateral handling. Emit `OptionRolledEvent`. | 3d |
| 5.2 | **Integration tests** for rolling | Roll up (same expiry, higher strike). Roll out (same strike, later expiry). Net collateral increase/decrease. Purchased option revert. | 3d |
| 5.3 | **"Roll" button** in frontend | RollModal.tsx: current params, inputs for new values, show net collateral change + cancel fee impact | 2d |

**Exit criteria**: Writers can roll open options in one TX. Net collateral handled atomically.

**OPNet verified**: Single method can do cancel+create with multiple token transfers. `stopOnFailure=true` ensures atomicity.

---

### Sprint 6: Expiry Alerts & UX Polish

**Type**: Frontend only

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 6.1 | **Browser notifications** for approaching expiry | `useExpiryAlerts` hook, notifications at 50% and 10% grace period remaining, in-app banner, mute toggle | 2d |
| 6.2 | **Human-readable time** for expiry | `formatExpiry()` utility ("~2d 5h remaining"), update all tables/modals, raw block as tooltip | 1d |
| 6.3 | **Option detail page** (`/pools/:addr/options/:id`) | Full option data, P&L chart, Greeks, transfer history, context-aware action buttons, share link | 3d |
| 6.4 | **Interactive onboarding** walkthrough | Step tooltips (Connect → Browse → Trade), first-visit trigger, skip/restart options | 2d |
| 6.5 | **E2E tests** for complete user journeys | Mock wallet → template → write → buy → exercise → transfer → verify portfolio | 2d |

**Exit criteria**: No missed exercise windows. Human-readable time everywhere. Onboarding for new users. E2E coverage.

---

### Phase 1.5 Summary

| Sprint | Duration | Person-Days | Type | Key Risk |
|--------|----------|-------------|------|----------|
| 1 — P&L & Calculator | 2 weeks | 10d | Frontend | None — no contract changes |
| 2 — Strategy Templates | 2 weeks | 8d | Frontend | None — no contract changes |
| 3 — Option Transfer | 2 weeks | 9d | Contract + FE + Indexer | Moderate — contract upgrade required |
| 4 — Batch Operations | 2 weeks | 10d | Contract + FE | Low — gas profiling needed |
| 5 — Rolling | 2 weeks | 8d | Contract + FE | Moderate — complex collateral logic |
| 6 — UX Polish | 2 weeks | 10d | Frontend | None — no contract changes |
| **Total** | **~12 weeks** | **~55d** | | |

**Contract upgrade strategy**: Sprints 3-5 contract changes can be batched into a single WASM upgrade via OPNet's built-in `Upgradeable` base class (timelock: 144 blocks). Deploy new WASM as source → `submitUpgrade` → wait → `applyUpgrade`. Existing options remain readable.

### Phase 1.5 Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Premium calculator accuracy | Suggested premium within 20% of market-clearing price | Compare suggested vs actual premiums on testnet options |
| Strategy template usage | >50% of new options created via templates (once available) | Frontend analytics (localStorage event log or indexer annotation) |
| Option transfer volume | At least 1 successful transfer in testnet testing | Integration test + manual QA |
| Batch operation gas | 5-item batchCancel stays under 500M gas | `Blockchain.traceGas` in unit tests |
| Rolling net collateral accuracy | Zero collateral leaks (refund + new lock == old collateral - fee + delta) | Integration test balance assertions |
| E2E test coverage | Full user journey: connect → write → buy → exercise/cancel → transfer | Sprint 6 automated E2E suite |
| Frontend test count | 60+ tests (up from 40+) | Vitest test count |

### Phase 1.5 Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| WASM upgrade breaks existing options | Low | Critical | Verify storage layout compatibility. Test `getOption` on old IDs after upgrade. |
| Gas budget exceeded for batch operations | Medium | High | Profile with `Blockchain.traceGas` early (Sprint 4). Reduce MAX_BATCH_SIZE if needed. |
| NativeSwap spot price unavailable | Medium | Medium | Premium calculator falls back to manual input if no spot price. Never block the write flow. |
| Roll collateral accounting error | Medium | High | Exhaustive integration tests (roll up/down/out, net positive/negative delta). Independent balance verification. |
| Testnet deploy cycle delays | High | Low | Budget 1 day per deploy cycle. Batch contract changes to minimize upgrade count. |
| Browser notification permission denied | Medium | Low | Graceful fallback to in-app banners only. Never block UI on notification permission. |

---

## Phase 2: BTC Integration + Atomic Strategies — PLANNED 📋

> **Goal**: Native BTC premiums via NativeSwap + atomic multi-leg strategy execution.
> **Timeline**: ~8 weeks (4 two-week sprints, solo developer)
> **Prerequisite**: Phase 1.5 complete
> **Deep dive**: [PHASE_2_NATIVE.md](./PHASE_2_NATIVE.md)

### Sprint 7: NativeSwapBridge Contract (2 weeks)

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 7.1 | **NativeSwapBridge contract** — BTC price queries | `getBtcPrice(token)` via `Blockchain.call()` to NativeSwap `getQuote`. `calculateBtcPremium()`. Price freshness check (revert if > 6 blocks stale). Unit tests. | 5d |
| 7.2 | **CSV address generation** + UTXO verification | `generateCsvAddress(pubkey, blocks)` → P2WSH with CSV lock. Min 6 blocks. `verifyBtcPayment(outputs, expected)`. Integration tests. | 5d |

### Sprint 8: BTC Premium Support (2 weeks)

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 8.1 | **Two-phase commit** in OptionsPool | `reserveOption(optionId)` → locks collateral, returns CSV + amount. `executeReservation(reservationId)` → verifies BTC, activates option. Reservation expiry (144 blocks). | 5d |
| 8.2 | **BTC payment UI** in frontend | BTC payment option in BuyOptionModal. Display CSV address + satoshi amount. Polling for BTC confirmation. Reservation countdown. | 3d |

### Sprint 9: SpreadRouter — Atomic Multi-Leg (2 weeks)

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 9.1 | **SpreadRouter contract** — atomic cross-contract execution | `executeSpread(pool, writeParams, buyOptionId)` via `Blockchain.call()`. User approves router. `stopOnFailure=true` for atomicity. Call depth profiling (Router→Pool→Token = 3). | 5d |
| 9.2 | **Integration tests** for spreads | Bull call spread, bear put spread, partial failure revert, gas profiling. Deploy to testnet. | 3d |
| 9.3 | **Strategies page** in frontend | `/strategies` route. Strategy builder (Bull Call, Bear Put, Iron Condor). Visual leg builder. Combined P&L diagram. Execute Spread button. | 5d |

### Sprint 10: Security Audit + Deployment (2 weeks)

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 10.1 | **Security audit** of all Phase 1.5 + 2 contracts | OPNet audit checklist. Reentrancy guards. Bounded loops. Checks-effects-interactions. Call depth. Fuzz testing. | 5d |
| 10.2 | **Contract upgrade** deployment | Deploy new WASM → submitUpgrade → wait → applyUpgrade. Deploy SpreadRouter + NativeSwapBridge. | 3d |
| 10.3 | **Full regression** | Re-run all tests (01-07 + new). Frontend smoke tests. Indexer new event decoding. | 2d |

### Phase 2 Security Considerations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| NativeSwap oracle failure | Low | High | Fallback pricing, circuit breaker |
| BTC price manipulation | Medium | High | TWAP, 6-block freshness check |
| CSV bypass | Very Low | Critical | Script verification, min 6 blocks |
| SpreadRouter call depth | Low | Medium | Profile depth, stay within MAXIMUM_CALL_DEPTH |
| Chain reorg | Low | Medium | 6-block confirmation delay |

### Phase 2 New Contracts

| Contract | Purpose | Size Estimate |
|----------|---------|---------------|
| NativeSwapBridge.wasm | BTC price queries, CSV generation, UTXO verification | ~15 KB |
| SpreadRouter.wasm | Atomic multi-leg execution across pools | ~10 KB |

### Phase 2 Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| BTC premium payment end-to-end | Buyer pays BTC, option activates | Integration test: reserve → BTC send → execute reservation |
| NativeSwap price freshness | Revert if stale (> 6 blocks) | Unit test with mock stale block |
| SpreadRouter atomic execution | 2-leg spread succeeds or fully reverts | Integration test: bull call spread, partial failure |
| SpreadRouter gas budget | 2-leg spread under 800M gas | `Blockchain.traceGas` profiling |
| Regression: all Phase 1 + 1.5 tests pass | 0 regressions | Full test suite on upgraded contracts |

---

## Phase 3: Strategy Vaults & AMM — FUTURE 🔮

> **Goal**: Passive yield products (vaults) + automated liquidity (AMM).
> **Timeline**: ~12 weeks (6 two-week sprints in 3 pairs, solo developer)
> **Prerequisite**: Phase 2 complete
> **Deep dive**: [PHASE_3_AMM.md](./PHASE_3_AMM.md)

### Sprints 11-12: Strategy Vaults (4 weeks)

| Deliverable | Description |
|-------------|-------------|
| **CoveredCallVault.wasm** | Accepts MOTO deposits. Auto-writes calls at admin-set strikes. LP share tokens (OP20). deposit/withdraw flows. First-depositor protection (virtual initial shares). |
| **CashSecuredPutVault.wasm** | Accepts PILL deposits. Auto-writes puts. Same LP share pattern. |
| **Vault management UI** | Deposit/withdraw modals. Share balance display. APR estimate. Vault configuration (admin). |

**OPNet verified**: Contracts can hold OP20 tokens. Vault pattern documented in audit examples. Cannot hold BTC (OP20 only). First-depositor front-running attack must be mitigated.

### Sprints 13-14: AMM Pool (4 weeks)

| Deliverable | Description |
|-------------|-------------|
| **AMMPool.wasm** | Extends OptionsPool + AMM. x*y=k constant product. addLiquidity/removeLiquidity. LP token (OP20). Pool-based option pricing from reserves. Implied volatility from utilization. |
| **AMM fee structure** | Trading fee: 0.3% → LPs. Option premium: 2% → LPs. Protocol fee: 0.3% → fee recipient. |
| **Liquidity UI** | Add/remove liquidity page. LP token balance. APR display. Impermanent loss calculator. |

### Sprints 15-16: Security + Mainnet (4 weeks)

| Deliverable | Description |
|-------------|-------------|
| **Security audit** | Pool invariant verification (x*y=k). Utilization limits (80% max). Flash loan protection (1-block delay). Fuzz testing. |
| **Mainnet preparation** | Migration plan. Monitoring infrastructure. Circuit breakers. Documentation. |

### Phase 3 New Contracts

| Contract | Purpose |
|----------|---------|
| CoveredCallVault.wasm | Passive covered call yield vault |
| CashSecuredPutVault.wasm | Passive put selling vault |
| AMMPool.wasm | AMM-based options pool with LP tokens |

---

## Phase 4: Intent Layer & AI — VISION 💡

> Long-term strategic direction informed by industry research. Not yet scoped into sprints.

| Feature | Description | Dependency |
|---------|-------------|------------|
| **Intent-based execution** | Users sign desired outcomes ("I want a $50 call"). Solver network finds optimal execution. Gasless UX. MEV protection. | Off-chain infrastructure |
| **AI risk scoring** | Each position gets a risk score (Delta exposure, time decay). Suggested Actions panel (roll/exercise/close). | AI service |
| **Auto-pilot vaults** | Delegate position management to AI agent. Auto-roll, auto-exercise decisions. | AI + vault contracts |
| **Natural language trading** | "Write a covered call on my MOTO, 20% above spot, 1 month out" | AI + frontend |
| **OP721 NFT options** | Represent purchased options as transferable NFTs. Secondary market on existing NFT infrastructure. | OPNet OP721 standard (confirmed available) |
| **Composability hooks** | Options as collateral in other OPNet protocols. IOptionToken interface. Partner integrations. | Partner protocol agreements |

---

## OPNet Feasibility Matrix

Every feature in this roadmap has been verified against OPNet documentation:

| Feature | Phase | Verdict | Key Constraint |
|---------|-------|---------|----------------|
| Option transfer | 1.5 | ✅ YES | Simple storage update; verify caller == buyer |
| Batch operations | 1.5 | ✅ YES | Hard `MAX_BATCH_SIZE`; `while` loops forbidden; profile gas |
| Rolling | 1.5 | ✅ YES | Atomic cancel+create; multiple token transfers in single method |
| SpreadRouter | 2 | ✅ YES | `Blockchain.call()` cross-contract; Router→Pool→Token = 3 levels OK |
| NativeSwap BTC | 2 | ✅ YES | CSV timelocks, UTXO verification, price freshness checks |
| Strategy vaults | 3 | ✅ YES | Contracts hold OP20 (not BTC); first-depositor protection needed |
| AMM pool | 3 | ✅ YES | x*y=k on-chain; LP tokens via OP20; utilization limits |
| Contract upgrades | All | ✅ YES | Built-in Upgradeable; deployer-only; timelock delay |
| OP721 NFT options | 4 | ✅ YES | Full OP721 standard exists; adds storage overhead |
| 10k+ options storage | All | ✅ YES | SHA256-keyed sub-pointers; gas cost on iteration is the practical limit |
| Event subscriptions | All | ⚠️ PARTIAL | WebSocket experimental; poll blocks + filter receipts |

---

## Competitive Positioning

```
                    High Complexity
                         |
              Panoptic    |    Lyra v2 / Aevo
            (oracle-free, |  (CLOB, institutional,
             perpetual,   |   sub-second, L2)
             Uniswap V3)  |
                          |
     Low Security --------+-------- High Security
                          |
              Dopex       |    FrogOp
            (DeFi-native, |  (Bitcoin L1, oracle-free,
             Atlantic     |   100% collateral, zero
             options,     |   bridge risk, strategy
             composable)  |   templates + rolling)
                          |
                    Low Complexity
```

### Target Users (by phase)

| User Segment | Phase | Product |
|-------------|-------|---------|
| Bitcoin holders wanting yield | 1.5 → 3 | Covered call templates → Vaults |
| OPNet token holders hedging | 1.5 | Protective put templates, P&L tracking |
| Speculators seeking leverage | 1.5 | Call buying with P&L charts, Greeks |
| Active traders | 2 | Spreads, rolling, batch operations |
| Passive yield seekers | 3 | SSOV-style vaults (deposit & forget) |
| Market makers | 2-3 | Secondary market, multi-leg execution, AMM LP |

---

## Timeline Summary

> All estimates assume 1 solo developer. With 2 developers, frontend and contract work can overlap to reduce wall-clock time by ~30%.

```
Phase 1 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ COMPLETE ✅
         Core lifecycle, fees, frontend, indexer

Phase 1.5 ─── Sprint 1-2 ──── Sprint 3-5 ──── Sprint 6 ────  ~12 weeks
              Frontend only    Contract + FE    UX Polish
              P&L, Templates   Transfer/Batch/  Alerts, E2E
              (no deploy risk) Roll (1 upgrade) (no deploy risk)
              ~4 weeks         ~6 weeks         ~2 weeks

Phase 2 ──── Sprint 7-8 ──── Sprint 9 ──── Sprint 10 ──────  ~8 weeks
             NativeSwap       SpreadRouter    Audit +
             BTC premiums     Atomic legs     Regression
             ~4 weeks         ~2 weeks        ~2 weeks

Phase 3 ──── Sprint 11-12 ── Sprint 13-14 ── Sprint 15-16 ─  ~12 weeks
             Vaults           AMM Pool        Security +
             CC + CSP         x*y=k, LP       Mainnet
             ~4 weeks         ~4 weeks        ~4 weeks

Phase 4 ──── Intent layer ── AI agents ────── Composability ─  TBD
             (future scope — not yet scheduled)

Total estimated: Phase 1.5 + 2 + 3 ≈ 32 weeks (~8 months, solo)
```

---

## Related Documents

### Roadmap & Planning

| Document | Purpose |
|----------|---------|
| [PHASE_1_MVP.md](./PHASE_1_MVP.md) | Phase 1 detailed spec (complete) |
| [PHASE_2_NATIVE.md](./PHASE_2_NATIVE.md) | NativeSwap BTC integration spec |
| [PHASE_3_AMM.md](./PHASE_3_AMM.md) | AMM pool + LP spec |
| [CANDIDATE_ROADMAP_V2.md](./CANDIDATE_ROADMAP_V2.md) | Research analysis + full sprint story detail |
| [ECONOMIC_MODEL.md](./ECONOMIC_MODEL.md) | Participant incentives + pricing |
| [PRICING_CALCULATIONS.md](./PRICING_CALCULATIONS.md) | Collateral + fee math |

### Architecture & Security

| Document | Purpose |
|----------|---------|
| [../ARCHITECTURE.md](../ARCHITECTURE.md) | System architecture |
| [../security/THREAT_MODEL.md](../security/THREAT_MODEL.md) | Security threat model |
| [../security/AUDIT_CHECKLIST.md](../security/AUDIT_CHECKLIST.md) | Contract audit checklist |
| [../contracts/OptionsPool.md](../contracts/OptionsPool.md) | OptionsPool contract spec |
| [../contracts/OptionsFactory.md](../contracts/OptionsFactory.md) | OptionsFactory contract spec |

### Historical (Phase 1)

| Document | Purpose |
|----------|---------|
| [SPRINT_BOARD.md](./SPRINT_BOARD.md) | Phase 1 sprint-by-sprint execution log (historical) |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Phase 1 agile implementation plan (historical) |
| [GAS_OPTIMIZATION_REFACTOR.md](./GAS_OPTIMIZATION_REFACTOR.md) | Gas optimization decisions and results |
| [../options_research.md](../options_research.md) | Industry research on decentralized options |

### Deployment

| Document | Purpose |
|----------|---------|
| [../deployment/DEPLOY.md](../deployment/DEPLOY.md) | Contract deployment guide |
| [../deployment/INDEXER_DEPLOY.md](../deployment/INDEXER_DEPLOY.md) | Indexer deployment to Cloudflare |
| [../deployment/CLOUDFLARE_PAGES.md](../deployment/CLOUDFLARE_PAGES.md) | Frontend deployment to Cloudflare Pages |
