# FrogOp Candidate Roadmap v2: Improving Options on OPNet

## Executive Summary

This document synthesizes findings from industry research (`internal/research/options_research.md`) with FrogOp's completed Phase 1 implementation and OPNet's verified platform capabilities. Each proposed feature has been validated against OPNet documentation for technical feasibility.

### Current State (Phase 1 — Complete)

| Component | Status | Details |
|-----------|--------|---------|
| **OptionsPool contract** | Done | Full lifecycle (write, buy, exercise, cancel, settle) + 3-tier fee model (buy 1%, exercise 0.1%, cancel 1%) + feeRecipient + getOptionsBatch + all view methods |
| **OptionsFactory contract** | Done | registerPool, getPoolByIndex, getPoolCount, treasury, owner. (`createPool` via `deployContractFromExisting` not supported by OPNet runtime — use direct deploy + `registerPool`) |
| **Frontend MVP** | Done | React 19, Vite, Tailwind. Pages: Landing, Pools (trading UI + write panel + price chart), Portfolio (written/purchased options), About (FAQ + fees). 2-step approval flows, WebSocket block tracking, TX polling. |
| **Indexer** | Done | Cloudflare Workers + D1. Block polling, event decoding, REST API (7 endpoints), price candles (1h/4h/1d/1w). |
| **Tests** | Done | Unit tests (22/22), integration tests (01-07 on testnet), frontend tests (40+). Fee verification via balance diffs. |
| **Deployment** | Testnet | Pool: `opt1sqze2thmp29pkkj8ft8qll0383k3ek4sgvvfqd9r5`, Signet fork, ~10 min blocks |

---

## Part 1: Gap Analysis — Research vs Actual State

### What's Already Solved

| Research Concern | FrogOp Status |
|-----------------|---------------|
| Oracle manipulation risk | Solved — exercise-based settlement, no oracle |
| Counterparty risk | Solved — 100% collateralization, atomic settlement |
| Bridge risk | Solved — Bitcoin L1 native |
| Complex onboarding | Partially solved — 2-step modal flows, but no strategy templates |
| No position tracking | Solved — Portfolio page + indexer fast path |
| No real-time updates | Solved — WebSocket block tracking + TX toast notifications |
| Fee transparency | Solved — fee schedule on landing page + About page |

### Remaining Gaps

| Gap | Research Finding | Impact | Feasibility (OPNet-verified) |
|-----|------------------|--------|------------------------------|
| **No option transfer/resale** | Protocols without secondary market have "non-competitive pricing" | Buyers locked until expiry; reduces premium willingness | **Feasible** — simple storage update of buyer field |
| **No multi-leg strategies** | "Legging out" risk is a top pain point for spreads | Power users must execute legs separately | **Feasible** — SpreadRouter via `Blockchain.call()` cross-contract calls |
| **No rolling mechanism** | Rolling is fundamental TradFi position management | Users manually cancel + recreate positions | **Feasible** — atomic cancel+create in single method |
| **No strategy templates** | "Five-click" vault UX drives adoption (Dopex SSOVs) | High barrier for retail users | **Feasible** — frontend-only, no contract changes |
| **No P&L visualization** | Users need "net profit after all costs" before clicking | Users can't evaluate positions at a glance | **Feasible** — frontend-only with MotoSwap spot price |
| **No batch operations** | Multi-option management is standard | Each action requires separate TX + 10 min wait | **Feasible** — bounded for loops with MAX_BATCH_SIZE, profile gas |
| **No strategy vaults** | SSOVs are most retail-friendly options product | Missing passive yield opportunities | **Feasible** — contracts can hold OP20 tokens; vault pattern documented |
| **No composability** | Atlantic Options showed collateral reuse increases capital velocity | Idle collateral | **Long-term** — requires partner protocol integration |

---

## Part 2: Sprint Plan

### Phase 1.5: UX & Secondary Market (6 sprints, ~6 weeks)

> Goal: Transform the working MVP into an attractive, competitive product.

---

#### Sprint 1: Premium Calculator & P&L Visualization (Frontend)

**Epic**: Help users make informed trading decisions with off-chain pricing tools.

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 1.1 | **As a writer**, I want a suggested premium based on market conditions **so that** I price options competitively | 1. Create `premiumCalculator.ts` service: fetch MotoSwap spot via NativeSwap `getQuote`, compute simplified Black-Scholes (intrinsic + time value using `sqrt(blocksRemaining) * IV`) <br> 2. Add `useSuggestedPremium(strike, expiry, amount, optionType)` hook <br> 3. Show suggested range (80%-120% of fair value) in WriteOptionPanel below premium input <br> 4. Unit tests for calculator with mock spot prices | 3d |
| 1.2 | **As a buyer**, I want to see profit/loss diagrams for an option **so that** I understand my risk before buying | 1. Create `PnLChart.tsx` component using lightweight-charts: x-axis = price at expiry, y-axis = profit/loss in PILL <br> 2. Calculate breakeven point (strike + premium for calls, strike - premium for puts) <br> 3. Show max loss (= premium paid), max gain (unlimited for calls, strike - premium for puts) <br> 4. Integrate into BuyOptionModal — show chart below option details <br> 5. Visual tests with snapshot comparisons | 3d |
| 1.3 | **As a user**, I want to see live P&L on my portfolio positions **so that** I know which options are profitable | 1. Create `usePnL(option, spotPrice)` hook: compute intrinsic value, time value estimate, unrealized P&L <br> 2. Fetch spot price via NativeSwap `getQuote` in `usePriceRatio` (already exists — extend if needed) <br> 3. Add P&L column to OptionsTable on Portfolio page: show +/- with color coding <br> 4. Add "Total P&L" summary card at top of Portfolio page <br> 5. Handle edge cases: no spot price available, expired options | 2d |
| 1.4 | **As a buyer**, I want to see simplified Greeks (Delta, Theta) **so that** I understand option sensitivity without doing math | 1. Add `greeksCalculator.ts`: compute Delta (∂V/∂S approximation), Theta (time decay per day in blocks) from simplified Black-Scholes <br> 2. Display as plain-language tooltips in BuyOptionModal: "Price sensitivity: High" (Delta > 0.7), "Time decay: 2.5 PILL/day" <br> 3. Color indicators: green (favorable), yellow (neutral), red (unfavorable) <br> 4. Unit tests for edge cases (deep ITM, deep OTM, near expiry) | 2d |

**Definition of Done**: Writer sees suggested premium range. Buyer sees P&L chart before purchase. Portfolio shows live unrealized P&L. All with unit tests.

**Dependencies**: Requires NativeSwap spot price access (already implemented in `usePriceRatio` hook).

---

#### Sprint 2: Strategy Templates (Frontend)

**Epic**: Reduce option creation from "fill 5 fields" to "pick a strategy, confirm defaults."

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 2.1 | **As a MOTO holder**, I want a "Covered Call" template **so that** I can earn yield in 3 clicks | 1. Create `StrategyTemplates.tsx` component with card-based UI <br> 2. "Covered Call" card: auto-fills CALL type, strike = 120% of spot, expiry = 30 days (4320 blocks), amount from user's MOTO balance, premium from suggested calculator <br> 3. Click card → opens WriteOptionPanel with pre-filled values + "Covered Call" badge <br> 4. User can adjust any field before submitting <br> 5. Add strategy explanation tooltip: "You earn premium income. Risk: if MOTO rises above strike, you sell at strike price." | 2d |
| 2.2 | **As a MOTO holder**, I want a "Protective Put" template **so that** I can hedge my position in 3 clicks | 1. "Protective Put" card: scans open PUT options where strike is 80-95% of spot <br> 2. Shows best available put (lowest premium for target strike range) <br> 3. Click → opens BuyOptionModal for the selected option <br> 4. If no matching puts exist: shows "No puts available — write one?" CTA <br> 5. Explanation tooltip: "Insurance against price drops. Max loss = premium paid." | 2d |
| 2.3 | **As a user**, I want a "Collar" template **so that** I can lock in a price range | 1. "Collar" card: combines covered call + protective put <br> 2. Step 1: Write call at 120% of spot (earn premium) <br> 3. Step 2: Buy put at 80% of spot (spend premium) <br> 4. Show net premium (often near zero for symmetric collar) <br> 5. Two-step execution flow with progress indicator <br> 6. Explanation: "Lock MOTO value between 80%-120% of current price" | 3d |
| 2.4 | **As a user**, I want strategy templates on the Pools page **so that** I discover them without reading docs | 1. Add "Quick Strategies" section above the options table on PoolsPage <br> 2. Show 3 strategy cards (Covered Call, Protective Put, Collar) <br> 3. Cards show: name, one-line description, estimated premium/cost, "Go" button <br> 4. Hide section when wallet not connected (show connect CTA instead) <br> 5. Responsive layout: horizontal scroll on mobile | 1d |

**Definition of Done**: Three strategy templates accessible from Pools page. Each pre-fills the appropriate modal with sensible defaults. User can adjust before executing. All templates have explanatory tooltips.

**Dependencies**: Sprint 1 (suggested premium calculator).

---

#### Sprint 3: Option Transfer — Secondary Market (Contract + Frontend)

**Epic**: Allow buyers to resell purchased options, creating a secondary market.

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 3.1 | **As a developer**, I want a `transferOption` method in OptionsPool **so that** buyers can transfer ownership | 1. Add `transferOption(optionId: u256, newBuyer: Address)` method to `contract.ts` <br> 2. Validation: caller must be current buyer, status must be PURCHASED, not expired, newBuyer != zero address, newBuyer != writer <br> 3. Update `buyer` field in option storage <br> 4. Emit `OptionTransferredEvent(optionId, fromBuyer, toBuyer)` <br> 5. Add selector to execute() router <br> 6. Add reentrancy guard | 2d |
| 3.2 | **As a developer**, I want integration tests for option transfer **so that** the feature is verified on testnet | 1. Add test to `06-full-lifecycle.ts`: write option → buyer purchases → buyer transfers to wallet index 3 <br> 2. Verify new buyer can exercise, old buyer cannot <br> 3. Verify transfer to zero address reverts <br> 4. Verify transfer of non-purchased option reverts <br> 5. Verify transfer of expired option reverts <br> 6. Build new WASM, deploy to testnet | 3d |
| 3.3 | **As a buyer**, I want a "Transfer" button on my purchased options **so that** I can send ownership to another address | 1. Add "Transfer" action to OptionsTable row actions (only for buyer's PURCHASED options) <br> 2. Create `TransferModal.tsx`: input for recipient bech32 address, confirm button <br> 3. Validate address format (opt1... on testnet) <br> 4. Resolve bech32 → hex via `getPublicKeyInfo` <br> 5. Execute `transferOption` via getContract + sendTransaction <br> 6. Success toast + refetch portfolio | 2d |
| 3.4 | **As a user**, I want to see transfer history in the indexer **so that** I know an option's ownership chain | 1. Add `OptionTransferred` event decoding to indexer poller <br> 2. Update `options` D1 table: set new `buyer` address on transfer event <br> 3. Add `transfers` D1 table: log from/to/block for audit trail <br> 4. Add GET `/pools/:addr/options/:id/transfers` endpoint <br> 5. Frontend: show transfer count badge on transferred options | 2d |

**Definition of Done**: Buyer can transfer a purchased option to any valid address. New buyer can exercise. Transfer history tracked in indexer. All integration tests pass.

**OPNet Feasibility**: Confirmed — simple storage update of buyer address field. No cross-contract calls needed. Same gas profile as buyOption.

---

#### Sprint 4: Batch Operations (Contract + Frontend)

**Epic**: Reduce transaction count for multi-option management.

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 4.1 | **As a developer**, I want `batchCancel` in OptionsPool **so that** writers can cancel multiple options in one TX | 1. Add `batchCancel(optionIds: u256[])` method <br> 2. Hard cap: `MAX_BATCH_SIZE = 5` (bounded for loop — OPNet audit requirement) <br> 3. Revert if any single cancel fails (atomic — all or nothing) <br> 4. Return count of cancelled options <br> 5. Emit individual `OptionCancelledEvent` per option (reuse existing event) <br> 6. Gas profiling: measure 1, 3, 5 cancels via unit test `Blockchain.traceGas` | 3d |
| 4.2 | **As a developer**, I want `batchSettle` in OptionsPool **so that** anyone can clean up multiple expired options | 1. Add `batchSettle(optionIds: u256[])` method <br> 2. Hard cap: `MAX_BATCH_SIZE = 5` <br> 3. Non-atomic: skip options that can't settle (not expired yet, already settled), continue with rest <br> 4. Return count of settled options <br> 5. Emit individual `OptionExpiredEvent` per option <br> 6. Gas profiling | 2d |
| 4.3 | **As a developer**, I want integration tests for batch operations **so that** they work on testnet | 1. Write 3 options with different expiry times <br> 2. Test `batchCancel([id1, id2, id3])` — verify all 3 cancelled, collateral returned minus fees <br> 3. Write 3 options, let them expire, test `batchSettle([id1, id2, id3])` <br> 4. Test batch with invalid option (should revert for cancel, skip for settle) <br> 5. Test exceeding MAX_BATCH_SIZE (should revert) <br> 6. Build WASM, deploy, run on testnet | 3d |
| 4.4 | **As a writer**, I want a "Cancel All Open" button **so that** I can clean up my positions efficiently | 1. Add "Cancel All" button to Portfolio page (written options section) <br> 2. Filter: only OPEN options (not purchased) <br> 3. If count <= 5: single batchCancel TX <br> 4. If count > 5: show warning "Will require multiple transactions" and batch in groups of 5 <br> 5. Progress indicator for multi-TX batches <br> 6. "Settle All Expired" button for anyone to clean up | 2d |

**Definition of Done**: batchCancel and batchSettle working on testnet. Frontend buttons for batch operations. Gas profiling confirms 5-item batches stay within limits.

**OPNet Feasibility**: Confirmed — bounded for loops are allowed (unbounded `while` loops are forbidden). Each cancel involves 1 storage read + 1 storage write + 1 cross-contract token transfer. At 5 items, estimated well within 1B gas budget. Must profile to confirm.

---

#### Sprint 5: Rolling Mechanism (Contract + Frontend)

**Epic**: Allow writers to extend or adjust options without manual cancel + recreate.

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 5.1 | **As a developer**, I want a `rollOption` method **so that** writers can atomically close and reopen positions | 1. Add `rollOption(optionId, newStrikePrice, newExpiryBlock, newPremium)` method <br> 2. Validation: caller must be writer, option must be OPEN (unpurchased), not expired <br> 3. Logic: cancel old option (return collateral minus fee), create new option (lock new collateral) in single method <br> 4. Net collateral: if new collateral > old refund, collect difference from writer; if less, refund difference <br> 5. Emit `OptionRolledEvent(oldOptionId, newOptionId, newStrike, newExpiry)` <br> 6. Reentrancy guard, checks-effects-interactions pattern | 3d |
| 5.2 | **As a developer**, I want integration tests for rolling **so that** the mechanism is verified | 1. Write option at strike 50, roll to strike 60 (same expiry) — "roll up" <br> 2. Write option at expiry +100, roll to expiry +200 (same strike) — "roll out" <br> 3. Write option, roll with higher collateral requirement — verify additional collateral collected <br> 4. Write option, roll with lower collateral — verify difference refunded <br> 5. Verify rolled option has new ID, old option is CANCELLED <br> 6. Verify roll of purchased option reverts (only OPEN options) | 3d |
| 5.3 | **As a writer**, I want a "Roll" button on my open options **so that** I can adjust without cancelling and recreating | 1. Add "Roll" action to OptionsTable for writer's OPEN options <br> 2. Create `RollModal.tsx`: shows current option params, inputs for new strike/expiry/premium <br> 3. Pre-fill: same strike, expiry extended by original duration, same premium <br> 4. Show net collateral change: "+50 MOTO additional" or "-20 MOTO refunded" <br> 5. Show cancel fee impact on the old option <br> 6. Execute rollOption via getContract + sendTransaction | 2d |

**Definition of Done**: Writers can roll open options in one click. Net collateral handled atomically. Integration tests pass on testnet.

**OPNet Feasibility**: Confirmed — single method can perform multiple storage updates + multiple cross-contract token transfers atomically. If any transfer fails with `stopOnFailure=true`, entire TX reverts.

---

#### Sprint 6: Expiry Alerts & UX Polish (Frontend)

**Epic**: Ensure users never miss exercise windows and the UX feels polished.

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 6.1 | **As a buyer**, I want browser notifications before my options expire **so that** I don't miss the exercise window | 1. Create `useExpiryAlerts(purchasedOptions, currentBlock)` hook <br> 2. Request browser notification permission on first purchased option <br> 3. Fire notification at 50% of grace period remaining (~72 blocks before deadline) <br> 4. Fire urgent notification at 10% remaining (~14 blocks) <br> 5. Show in-app banner on Portfolio page: "2 options expiring within 24 hours" <br> 6. Respect user preference: add "Mute alerts" toggle to settings | 2d |
| 6.2 | **As a user**, I want option expiry displayed in human time **so that** I don't have to think in blocks | 1. Create `formatExpiry(expiryBlock, currentBlock)` utility <br> 2. Show "Expires in ~2d 5h" instead of "Block 1,234,567" <br> 3. Show "Exercise window: ~18h remaining" for purchased options in grace period <br> 4. Show "Expired 3 hours ago" for settled options <br> 5. Update OptionsTable, Portfolio, all modals to use this formatting <br> 6. Keep raw block number as tooltip for advanced users | 1d |
| 6.3 | **As a user**, I want an option detail page **so that** I can see full information about a single option | 1. Add route `/pools/:poolAddr/options/:optionId` <br> 2. `OptionDetailPage.tsx`: full option data, P&L chart, Greeks, transfer history <br> 3. Action buttons (Buy, Exercise, Cancel, Settle, Transfer) based on user role + status <br> 4. Share link functionality (copy URL) <br> 5. Link to option detail from OptionsTable rows (click ID) | 3d |
| 6.4 | **As a new user**, I want an interactive walkthrough **so that** I understand how to use the platform | 1. Create `Onboarding.tsx` component with step-by-step tooltips <br> 2. Steps: Connect Wallet → Browse Options → Buy/Write First Option <br> 3. Show on first visit (localStorage flag) <br> 4. "Skip tutorial" option <br> 5. "Restart tutorial" button in About page | 2d |
| 6.5 | **As a developer**, I want end-to-end tests for the complete user journey | 1. Vitest E2E: connect mock wallet → navigate to Pools → write covered call via template → verify option appears <br> 2. E2E: browse open options → buy → verify in portfolio <br> 3. E2E: exercise expired option → verify P&L display <br> 4. E2E: transfer option → verify new owner in portfolio | 2d |

**Definition of Done**: Browser notifications for expiry. Human-readable time formatting. Option detail pages. Onboarding walkthrough. E2E test coverage.

---

### Phase 2: BTC Integration + Advanced Trading (4 sprints, ~6 weeks)

> Goal: Native BTC premiums + atomic multi-leg strategies.

---

#### Sprint 7: NativeSwapBridge Contract (Contract)

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 7.1 | **As a developer**, I want a NativeSwapBridge contract **so that** OptionsPool can query BTC prices | 1. Create `NativeSwapBridge` contract (AssemblyScript) <br> 2. `getBtcPrice(token)` → queries NativeSwap `getQuote` via `Blockchain.call()` <br> 3. `calculateBtcPremium(spotPrice, strike, expiry, amount)` → returns satoshis <br> 4. Price freshness check: revert if last NativeSwap update > 6 blocks old <br> 5. Unit tests with mock NativeSwap responses | 5d |
| 7.2 | **As a developer**, I want CSV address generation **so that** BTC premium payments are time-locked | 1. `generateCsvAddress(pubkey, blocks)` → P2WSH address with CSV lock <br> 2. Minimum CSV: 6 blocks (prevents flash loan attacks) <br> 3. UTXO verification: `verifyBtcPayment(outputs, expectedAmount, csvAddress)` <br> 4. Unit tests for CSV script generation <br> 5. Integration test: generate address, verify script structure | 5d |

---

#### Sprint 8: BTC Premium Support (Contract + Frontend)

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 8.1 | **As a developer**, I want two-phase commit for BTC premiums in OptionsPool | 1. Add `reserveOption(optionId)` → locks collateral, returns CSV address + BTC amount <br> 2. Add `executeReservation(reservationId)` → verifies BTC payment, activates option <br> 3. Reservation storage: Map<u256, Reservation> with expiry (144 blocks) <br> 4. Auto-cleanup: expired reservations release collateral <br> 5. Integration tests on testnet with actual BTC payment | 5d |
| 8.2 | **As a buyer**, I want to pay premiums in BTC **so that** I can trade without holding PILL tokens | 1. Frontend: detect when pool supports BTC premiums <br> 2. BuyOptionModal: show BTC payment option alongside PILL <br> 3. Display CSV address + exact satoshi amount to send <br> 4. Polling: wait for BTC confirmation, then call `executeReservation` <br> 5. Timeout UI: show countdown for reservation expiry | 3d |

---

#### Sprint 9: SpreadRouter — Atomic Multi-Leg (Contract + Frontend)

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 9.1 | **As a developer**, I want a SpreadRouter contract **so that** multi-leg strategies execute atomically | 1. Create `SpreadRouter` contract (AssemblyScript) <br> 2. `executeSpread(poolAddress, writeParams, buyOptionId)` → writes one option + buys another atomically via `Blockchain.call()` <br> 3. User approves SpreadRouter for token spending (router appears as `tx.sender` to pool) <br> 4. If any leg fails, entire TX reverts (`stopOnFailure=true`) <br> 5. Measure call depth: Router → Pool → Token = depth 3 (within OPNet's MAXIMUM_CALL_DEPTH) <br> 6. Gas profiling for 2-leg and 4-leg spreads | 5d |
| 9.2 | **As a developer**, I want integration tests for spread execution | 1. Test bull call spread: buy lower-strike call + write higher-strike call atomically <br> 2. Test bear put spread: buy higher-strike put + write lower-strike put <br> 3. Test partial failure: one leg fails → entire TX reverts, no state changes <br> 4. Test gas consumption for 2-leg vs 4-leg spreads <br> 5. Deploy router to testnet, verify with real token transfers | 3d |
| 9.3 | **As a trader**, I want a "Strategies" page to build and execute spreads | 1. Add `/strategies` route and `StrategiesPage.tsx` <br> 2. Strategy builder: select spread type (Bull Call, Bear Put, Iron Condor) <br> 3. Visual leg builder: show each leg with strike/premium/type <br> 4. "Execute Spread" button: approve router → call executeSpread <br> 5. Show combined P&L diagram for the entire spread | 5d |

**OPNet Feasibility**: Confirmed — `Blockchain.call()` supports cross-contract calls. Router → Pool → Token is 3 levels deep. `stopOnFailure=true` ensures atomicity. User must approve router contract for token spending. Call depth limit exists but 3 levels is well within bounds.

---

#### Sprint 10: Security Audit + Testnet Hardening

| # | Story | Tasks | Est |
|---|-------|-------|-----|
| 10.1 | **Security audit** of all new contract code (transferOption, batchCancel, batchSettle, rollOption, SpreadRouter) | 1. Run OPNet audit checklist against each new method <br> 2. Verify reentrancy guards on all state-changing methods <br> 3. Verify bounded loops (MAX_BATCH_SIZE enforcement) <br> 4. Verify checks-effects-interactions in rollOption (state before transfers) <br> 5. Verify SpreadRouter call depth stays within MAXIMUM_CALL_DEPTH <br> 6. Fuzz testing: random option parameters, batch sizes, roll combinations | 5d |
| 10.2 | **Contract upgrade** deployment on testnet | 1. Deploy new OptionsPool WASM as source contract <br> 2. Call `submitUpgrade(newSourceAddress)` on existing pool (starts timelock) <br> 3. Wait upgrade delay (144 blocks on testnet) <br> 4. Call `applyUpgrade(sourceAddress, migrationCalldata)` <br> 5. Verify all existing options still readable after upgrade <br> 6. Verify new methods (transferOption, batchCancel, etc.) work on upgraded contract <br> 7. Deploy SpreadRouter as new contract | 3d |
| 10.3 | **Full regression testing** | 1. Re-run all integration tests (01-07) against upgraded contracts <br> 2. Run new tests (transfer, batch, roll, spread) <br> 3. Frontend smoke tests against upgraded testnet deployment <br> 4. Indexer: verify new events (OptionTransferred, OptionRolled) decode correctly <br> 5. Document all contract addresses post-upgrade | 2d |

---

### Phase 3: Strategy Vaults & AMM (Future — 8-10 weeks)

> Detailed sprint breakdown deferred until Phase 2 is complete. High-level scope:

| Sprint | Focus | Key Deliverables |
|--------|-------|------------------|
| 11-12 | **Covered Call Vault** | CoveredCallVault contract (accepts MOTO, auto-writes calls at admin-set strikes), LP share tokens, deposit/withdraw flows, first-depositor attack protection |
| 13-14 | **Cash-Secured Put Vault** | PutVault contract (accepts PILL, auto-writes puts), same LP pattern, vault configuration UI |
| 15-16 | **AMM Pool** | AMMPool extending OptionsPool, x*y=k pricing, addLiquidity/removeLiquidity, pool-based option pricing from reserves |
| 17-18 | **Security + Deployment** | Full audit of vault + AMM contracts, mainnet preparation, monitoring infrastructure |

**OPNet Feasibility for Vaults**: Confirmed — contracts can hold OP20 tokens. Vault pattern documented in OPNet audit examples. Cannot hold BTC (only OP20). First-depositor front-running attack must be mitigated with virtual initial shares.

---

## Part 3: OPNet Feasibility Summary

Every feature in this roadmap has been verified against OPNet documentation:

| Feature | Verdict | Key Constraint |
|---------|---------|----------------|
| Option transfer | YES | Simple storage update; verify caller == buyer |
| Batch operations | YES | Must enforce hard `MAX_BATCH_SIZE` constant; `while` loops forbidden; profile gas |
| SpreadRouter (cross-contract) | YES | `Blockchain.call()` enables atomic multi-pool calls; call depth limit applies (Router→Pool→Token = 3 levels OK) |
| Rolling mechanism | YES | Single method can do cancel+create atomically; multiple token transfers allowed |
| Strategy vaults | YES | Contracts can hold OP20 tokens; cannot hold BTC; first-depositor protection needed |
| Contract upgrades | YES | Built-in `Upgradeable` base class; deployer-only; timelock delay; storage layout must be compatible |
| OP721 NFT options | YES (future) | Full OP721 standard exists; adds storage overhead per option |
| Event subscriptions | PARTIAL | WebSocket is experimental; no per-contract filter — poll blocks and filter receipts |
| Storage at 10k+ options | YES | SHA256-keyed storage has effectively unlimited sub-pointer space; gas cost on iteration is the limit |
| Gas for batch of 5 | LIKELY YES | ~1B gas budget documented; must profile with `Blockchain.traceGas`; each operation involves storage reads/writes + cross-contract token transfer |

---

## Part 4: Competitive Positioning

### FrogOp's Unique Value After This Roadmap

```
                    High Complexity
                         |
              Panoptic    |    Lyra v2 / Aevo
            (oracle-free, |  (CLOB, institutional)
             perpetual)   |
                          |
     Low Security --------+-------- High Security
                          |
              Dopex       |    FrogOp (target)
            (DeFi-native, |  Bitcoin L1, oracle-free,
             composable)  |  safety-first, strategy
                          |  templates, rolling, spreads
                    Low Complexity
```

After Phase 1.5 + 2:
- **vs Panoptic**: Simpler UX (strategy templates vs perpetual options math)
- **vs Dopex**: Bitcoin L1 security (no bridge risk) + oracle-free
- **vs Aevo/Lyra**: Self-custody on Bitcoin (no L2 trust assumptions)
- **Unique**: Only options protocol on Bitcoin L1 with spreads, rolling, and strategy vaults

### Target Users (Prioritized)

1. **Bitcoin-native yield seekers** → Covered call templates (Sprint 2), vaults (Phase 3)
2. **OPNet token holders hedging** → Protective put templates (Sprint 2), P&L tracking (Sprint 1)
3. **Active traders** → Spreads (Sprint 9), rolling (Sprint 5), batch operations (Sprint 4)
4. **Market makers** → Secondary market via transfers (Sprint 3), multi-leg execution (Sprint 9)

---

## Conclusion

Phase 1 is fully complete — contracts, frontend, indexer, and tests are all operational on testnet. The highest-ROI next step is **Phase 1.5** (Sprints 1-6), which transforms the working MVP into a competitive product:

- **Sprints 1-2** (frontend-only, no contract changes): Premium calculator, P&L charts, strategy templates. Immediate UX improvement with zero deployment risk.
- **Sprints 3-5** (contract + frontend): Option transfers, batch operations, rolling. These are the features that separate a demo from a real trading platform. All verified feasible on OPNet.
- **Sprint 6** (frontend polish): Expiry alerts, human-readable time, onboarding. Retention-focused.

**Recommended start**: Sprint 1 (frontend-only premium calculator + P&L) — zero contract risk, immediate value for users.
