# FroGop Sprintboard

> For completed Phase 1 work, see [phase-1-completed.md](phase-1-completed.md).

## Sprint: Pool List UX — Inverse Pair Grouping

> **Goal:** Group inverse pool pairs visually on the pool list page so users
> can see related markets at a glance and pick the right direction for their
> strategy, without hiding any pools.

### Context

The 6 deployed pools form 3 inverse pairs (MOTO↔BTC, PILL↔BTC, MOTO↔PILL).
Currently each pool renders as an independent card in a flat grid — users see
6 cards with no indication that MOTO/BTC and BTC/MOTO are the same market in
opposite directions. This is confusing, especially for BTC pools.

### Tasks

- [ ] **Task 1: Group pools into inverse pairs**
  - In `PoolListPage.tsx`, group the flat `pools[]` array into pairs by matching
    underlying↔premium addresses (A/B and B/A are a pair; unpaired pools get
    their own group).
  - Add a helper `groupInversePairs(pools, configs)` in a new `utils/poolGrouping.ts`.
  - Each group = `{ market: string, pools: [PoolEntry, PoolEntry?] }`.
  - Market label: alphabetical token order, e.g. "BTC ↔ MOTO", "MOTO ↔ PILL".
  - Write unit tests for grouping logic (edge cases: unpaired pool, 3+ pools
    with same tokens, missing config).

- [ ] **Task 2: Grouped card layout**
  - Replace the flat `grid-cols-3` with a vertical list of group rows.
  - Each row has: shared market header + 2 side-by-side `PoolCard`s (or 1 if unpaired).
  - Header shows: market label ("MOTO ↔ BTC"), shared price badge (from
    indexer cross-rate), pool type badges for each direction.
  - Responsive: side-by-side on md+, stacked on mobile.
  - Example layout:
    ```
    ┌─────────────────────────────────────────┐
    │ MOTO ↔ BTC              ~441 sats/MOTO  │
    │ ┌─────────────────┐ ┌─────────────────┐ │
    │ │ MOTO/BTC        │ │ BTC/MOTO        │ │
    │ │ OP20/BTC        │ │ BTC/OP20        │ │
    │ │ Lock MOTO,      │ │ Lock BTC,       │ │
    │ │ earn sats       │ │ earn MOTO       │ │
    │ │ 3 options       │ │ 0 options       │ │
    │ └─────────────────┘ └─────────────────┘ │
    └─────────────────────────────────────────┘
    ```

- [ ] **Task 3: Direction explainer on PoolCard**
  - Add a one-line subtitle to `PoolCard` explaining what the user locks and
    earns: "Lock MOTO, earn BTC" / "Lock BTC, earn MOTO".
  - Derive from `poolType`: type 0 = "Lock {underlying}, earn {premium}",
    type 1/2 = same pattern but mention "sats" for BTC side.
  - Helps users immediately understand the difference between the two
    directions without clicking in.

- [ ] **Task 4: Search + filter works with groups**
  - Search should filter at the group level: if either pool in a pair matches
    the query, show the entire group (both cards).
  - Optional: add a pool-type filter dropdown (All / OP20↔OP20 / OP20↔BTC).

- [ ] **Task 5: Tests**
  - Unit tests for `groupInversePairs()` (grouping, edge cases, sort order).
  - Component test for `PoolListPage` verifying grouped layout renders
    correctly with mock pool data (2 pairs + 1 unpaired).
  - Verify search filters at group level.

### Key files
| File | Change |
|------|--------|
| `frontend/src/utils/poolGrouping.ts` | New — grouping logic |
| `frontend/src/pages/PoolListPage.tsx` | Use grouped layout |
| `frontend/src/components/PoolCard.tsx` | Add direction subtitle |
| `frontend/src/components/PoolGroupRow.tsx` | New — group header + side-by-side cards |

---

## Sprint: SpreadRouter — Atomic Strategy Execution

> **Goal:** Deploy SpreadRouter, make it the single execution path for all
> multi-leg strategies, and remove the workaround CollarModal two-step flow.
> Every strategy (collar, spreads) executes atomically in one TX — no more
> half-done states or localStorage-tracked progress.

### Context

SpreadRouter contract is written, compiled to WASM, and has integration tests
ready — but was never deployed. Meanwhile, the pool detail page has a
workaround CollarModal that orchestrates collar as 2 separate TXs (write CALL,
then buy PUT). This is fragile: if TX1 succeeds and TX2 fails, the user is
left with half a collar and no atomicity guarantee.

The StrategiesPage already has full UI for 4 strategy types (bull call spread,
bear put spread, collar, custom) — it just points to an empty `ROUTER_ADDRESS`.

**After this sprint:** All multi-leg strategies go through SpreadRouter.
CollarModal is deleted. PoolDetailPage links to StrategiesPage for collar.
Single-leg actions (covered call = just write a CALL, protective put = just
buy a PUT) stay on PoolDetailPage since they're single-TX operations.

### User Stories

**US-1: As a trader, I want to execute a collar in one transaction so that
I'm never left with one leg if the other fails.**
- Acceptance: Clicking "Collar" anywhere routes to StrategiesPage → single TX
  via SpreadRouter → both CALL + PUT written atomically.

**US-2: As a trader, I want to execute bull/bear spreads atomically so that
both legs are guaranteed to fill at the same block.**
- Acceptance: Bull call spread (write high + buy low) and bear put spread
  (write low + buy high) each execute in one TX via SpreadRouter.

**US-3: As a user on the pool detail page, I want quick access to strategies
without navigating away, so I can set up a collar from the pool I'm viewing.**
- Acceptance: "Collar" card on Write tab links to StrategiesPage with pool +
  strategy pre-selected via URL params. No CollarModal, no localStorage state.

**US-4: As a developer, I want one canonical path for multi-leg execution so
that future strategies (iron condor, butterfly) only need SpreadRouter support.**
- Acceptance: CollarModal deleted, no multi-TX strategy orchestration anywhere
  in the codebase. All multi-leg flows use SpreadRouter.

### Tasks

- [ ] **Task 1: Deploy SpreadRouter on testnet**
  - Run `npm run build:router` to ensure WASM is up to date
  - Run integration test 16 (`npx tsx tests/integration/16-spread-router.ts`)
    which deploys the router and runs bull call spread, bear put spread, and
    collar tests
  - Save deployed address to `tests/integration/deployed-contracts.json`
  - Verify on-chain via RPC: router contract responds to `executeSpread` and
    `executeDualWrite` calls

- [ ] **Task 2: Add SpreadRouter to pools.config.json + frontend config**
  - Add `"router": { "addresses": { "testnet": "opt1sq..." } }` to `pools.config.json`
  - Add `getRouterAddress()` helper to `frontend/src/config/index.ts` that reads
    from pools.config (same pattern as `getNativeSwapAddress`)
  - Replace hardcoded `ROUTER_ADDRESS = ''` in StrategiesPage with config lookup
  - Add `VITE_ROUTER_ADDRESS` env var fallback for local dev

- [ ] **Task 3: Wire StrategiesPage to live SpreadRouter**
  - Remove the "SpreadRouter not deployed yet" error guard (line 137)
  - Test full execution flow: select strategy → configure legs → execute →
    verify TX receipt contains both legs
  - Add transaction tracking: integrate with `useTransactionContext` so the
    pill shows strategy TX status (pending → confirmed)
  - Handle errors: if router TX reverts, show which leg failed and why

- [ ] **Task 4: Pool detail page — link to StrategiesPage for collar**
  - In QuickStrategies, replace `onCollar` callback with a `<Link>` to
    `/strategies?pool={address}&strategy=collar`
  - StrategiesPage reads URL params and pre-selects pool + strategy type
  - Remove CollarModal entirely: delete `CollarModal.tsx`, remove all imports
    and state (`showCollar`, `handleCollar`, collar localStorage logic) from
    PoolDetailPage
  - Keep single-leg shortcuts on PoolDetailPage: Covered Call (just writes a
    CALL → WriteOptionPanel), Write Protective Put (just writes a PUT →
    WriteOptionPanel), Protective Put buy (Buy tab → BuyOptionModal). These
    are single-TX operations and don't need the router.

- [ ] **Task 5: Strategy flow tracking via pill**
  - When a strategy TX is broadcast from StrategiesPage, create a tracked
    transaction in TransactionContext with type `'strategy'`
  - Pill shows: "Collar: MOTO/PILL — pending" → "confirmed"
  - On StrategiesPage, show active strategy TX status (reuse existing
    TrackedTransaction display pattern)

- [ ] **Task 6: Tests**
  - **Integration (on-chain):** Test 16 already covers deploy + execute.
    Extend with edge cases: insufficient allowance, expired option for buy leg,
    mismatched pool address.
  - **Frontend unit:** Test StrategiesPage renders strategy options, pre-selects
    from URL params, calls router contract methods correctly.
  - **Frontend unit:** Verify PoolDetailPage no longer renders CollarModal.
    Verify "Collar" card links to `/strategies?pool=...&strategy=collar`.
  - **Frontend unit:** Verify QuickStrategies "Covered Call" and "Write Put"
    still work as single-TX flows on PoolDetailPage (no regression).

### Files changed

| File | Change |
|------|--------|
| `pools.config.json` | Add `router.addresses.testnet` |
| `frontend/src/config/index.ts` | Add `getRouterAddress()` |
| `frontend/src/pages/StrategiesPage.tsx` | Wire to live router, read URL params |
| `frontend/src/pages/PoolDetailPage.tsx` | Remove CollarModal, link to strategies |
| `frontend/src/components/CollarModal.tsx` | **DELETE** |
| `frontend/src/components/QuickStrategies.tsx` | Collar card → Link to strategies |
| `tests/integration/deployed-contracts.json` | Add router address |
| `tests/integration/16-spread-router.ts` | Run + extend |

### Dependencies
- Requires tokens + pool deployed (tests 01-06 — already done)
- WASM must be built (`npm run build:router`)

### Out of scope
- BTC pool flows (extraOutputs for write/exercise) — separate sprint
- Custom strategies beyond 2 legs
- SpreadRouter mainnet deployment

---

## Sprint: BTC Pool Integration Tests — Full Lifecycle Coverage

> **Goal:** Replace all `structural_test` stubs in tests 14 and 15 with real
> on-chain tests. Every BTC pool operation (write, reserve, execute, exercise,
> cancel, settle) must be tested end-to-end, including extraOutputs for native
> BTC transfers.

### Context

Tests 14 (BTC quote / type 1) and 15 (BTC underlying / type 2) were written
as scaffolding — deployment and basic writes work, but 15 of 23 tests are
`structural_test` stubs that return immediately without executing. The stubs
exist because BTC operations require `extraOutputs` (native BTC in the same
TX), which the `DeploymentHelper.callContract()` doesn't support yet.

**Current test coverage:**

| Test | Real | Stub | Notes |
|------|------|------|-------|
| 14 (BTC quote) | 5 real (deploy, write, reserve, cancel) | 13 stubs | executeReservation, exercise, settle, full lifecycles |
| 15 (BTC underlying) | 4 real (deploy, PUT write, PUT buy) | 7 stubs | CALL write, exercise, cancel, settle, full lifecycles |

**Root blocker:** `DeploymentHelper.callContract()` sends transactions without
`extraOutputs`. BTC pool operations need to include BTC outputs (P2WSH escrow
payments) in the same transaction. This is a trivial fix — `signInteraction()`
from `@btc-vision/transaction` already supports `extraOutputs` (the frontend's
`BuyOptionModal` uses it for type 1 buys). We just need to pass the parameter
through in our test helper. No OPNet team dependency.

### User Stories

**US-1: As a developer, I want full integration test coverage for BTC quote
pools (type 1) so that I can verify the reservation→execute→exercise flow
works end-to-end before shipping to users.**

**US-2: As a developer, I want full integration test coverage for BTC
underlying pools (type 2) so that I can verify writeOptionBtc with real BTC
collateral and exercise with BTC payouts.**

**US-3: As a developer, I want the test harness to support extraOutputs so
that all future BTC-related tests can send native BTC alongside contract calls.**

### Tasks

- [ ] **Task 1: Add extraOutputs support to DeploymentHelper**
  - Extend `callContract()` signature: add optional 4th param
    `extraOutputs?: Array<{ address: string, value: bigint }>`
  - Pass it through to `factory.signInteraction({ ..., extraOutputs })`
    (the API already supports it — same mechanism the frontend wallet uses)
  - Add a helper `deriveBtcEscrowAddress(bridgeAddr, provider)` that fetches
    the bridge's CSV script hash and derives the P2WSH address (same logic
    BuyOptionModal uses in frontend)
  - Update `deployment.ts` with new exports
  - ~10 lines of code change total
  - **Key files:** `tests/integration/deployment.ts`

- [ ] **Task 2: Test 14 — Complete BTC quote pool (type 1) lifecycle**
  - **14.6** `executeReservation` with valid BTC output: reserve option →
    derive P2WSH from bridge → call executeReservation with extraOutputs
    containing BTC payment → verify option status changes to PURCHASED
  - **14.7** `executeReservation` reverts without BTC: call without
    extraOutputs → verify on-chain revert, option stays RESERVED
  - **14.8** `executeReservation` with wrong BTC amount: send 1 sat instead
    of required amount → verify revert
  - **14.11** CALL exercise with BTC strike: buy a CALL (via reservation flow),
    then exercise with BTC strike payment via extraOutputs → verify underlying
    transferred to buyer
  - **14.12** CALL exercise reverts without BTC: exercise without extraOutputs
    → verify revert
  - **14.13** PUT exercise (OP20 only): write PUT, buy PUT, exercise →
    verify same behavior as type 0 (no BTC involved)
  - **14.15** Settle after grace: requires expired + purchased option past
    grace — may need short expiry for testnet feasibility
  - **14.16-14.18** Full lifecycle tests: complete write→reserve→execute→exercise
    round trips for CALL and PUT
  - **Key files:** `tests/integration/14-btc-quote-pool.ts`

- [ ] **Task 3: Test 15 — Complete BTC underlying pool (type 2) lifecycle**
  - **15.2** CALL writeOptionBtc with BTC output: call writeOptionBtc with
    extraOutputs containing BTC collateral → verify option created + BTC
    locked in escrow
  - **15.3** CALL writeOptionBtc without BTC: verify on-chain revert
  - **15.6** CALL exercise (pay OP20 strike, get BTC claim): buyer pays OP20
    strike via exercise → verify BtcClaim event emitted with P2WSH details
  - **15.7** PUT exercise with BTC output: buyer exercises PUT by sending BTC
    to writer via extraOutputs → verify OP20 collateral released to buyer
  - **15.8** CALL cancel: writer cancels → verify CANCELLED status + escrow
    info emitted for off-chain BTC reclaim via CLTV
  - **15.9** CALL settle: requires expired+purchased+grace elapsed → verify
    writer can settle and reclaim
  - **15.10-15.11** Full lifecycle round trips for both CALL and PUT
  - **Key files:** `tests/integration/15-btc-underlying-pool.ts`

- [ ] **Task 4: Bridge integration test coverage**
  - Test bridge `getBtcPrice()` returns valid price from NativeSwap
  - Test bridge `verifyBtcOutput()` correctly validates extraOutput amounts
  - Test CSV script hash derivation matches expected P2WSH address
  - These may be added to test 13 (`13-native-swap-bridge.ts`) or as new
    sub-tests in 14/15
  - **Key files:** `tests/integration/13-native-swap-bridge.ts`

- [ ] **Task 5: Fee verification for BTC pools**
  - Verify cancel fee (1%) on BTC quote pool — fee in OP20 underlying
  - Verify buy fee (1%) on BTC quote pool — fee deducted from BTC payment?
    Or from OP20? Verify against contract source
  - Verify exercise fee (0.1%) — check fee recipient balance before/after
  - Same verification for BTC underlying pool
  - Pattern: match existing fee tests from type 0 pool (test 06b/06c)
  - **Key files:** `tests/integration/14-btc-quote-pool.ts`,
    `tests/integration/15-btc-underlying-pool.ts`

### Acceptance criteria
- Zero `structural_test` stubs remaining in tests 14 and 15
- All tests pass on testnet (may need retry logic for block timing)
- `extraOutputs` helper is reusable for any future BTC-related test

### Dependencies
- Bridge contract deployed (test 13 — already done)
- BTC quote + underlying pools deployed (tests 14.1, 15.1 — already done)
- Test wallet must have sufficient BTC balance for extraOutputs

---

## Sprint: SpreadRouter Integration Tests — Full Strategy Coverage

> **Goal:** Complete test 16 coverage for SpreadRouter: deploy, verify all
> strategy types execute atomically, test rollback guarantees, cross-pool
> spreads, gas profiling, and BTC pool compatibility.

### Context

Test 16 has 8 test cases. Real execution: deploy (16.1), pre-setup (16.1b),
bull call spread (16.2), atomic rollback on write fail (16.4), atomic rollback
on buy fail (16.5), collar/dual-write (16.6). Stubs: bear put spread (16.3),
gas profiling (16.7), cross-pool spread (16.8).

Additionally, SpreadRouter was only tested with type 0 (OP20/OP20) pools.
BTC pools (type 1 and 2) need coverage to verify the router handles
extraOutputs pass-through correctly.

### User Stories

**US-1: As a developer, I want to verify all 4 strategy types (bull call,
bear put, collar, custom) execute atomically via SpreadRouter so that users
never get partial fills.**

**US-2: As a developer, I want to verify SpreadRouter works with BTC pools
so that strategies are available on all pool types.**

### Tasks

- [ ] **Task 1: Complete existing test 16 stubs**
  - **16.3** Bear put spread: write low-strike PUT + buy high-strike PUT →
    verify both legs executed, option count increased by 1 (write) + 1
    existing purchased
  - **16.7** Gas profiling: parse TX receipts from 16.2 and 16.6, assert
    total gas < 800M (OPNet block gas limit)
  - **16.8** Cross-pool spread: deploy a second type 0 pool, write option on
    pool A, buy option on pool B via router → verify works across pools
  - **Key file:** `tests/integration/16-spread-router.ts`

- [ ] **Task 2: SpreadRouter + BTC quote pool (type 1)**
  - **16.9** `executeSpread` on BTC quote pool: write CALL + buy existing
    option (buy leg needs reservation flow — check if router handles this
    or if spreads are OP20-only)
  - **16.10** `executeDualWrite` on BTC quote pool: collar with both legs
    as OP20 writes → should work identically to type 0
  - **16.11** Verify router reverts cleanly if BTC pool leg requires
    extraOutputs that aren't present
  - Document clearly which strategy types are supported on BTC pools vs
    OP20-only pools
  - **Key file:** `tests/integration/16-spread-router.ts`

- [ ] **Task 3: SpreadRouter + BTC underlying pool (type 2)**
  - **16.12** `executeDualWrite` on type 2: CALL leg needs BTC collateral via
    extraOutputs — verify router passes through correctly
  - **16.13** PUT-only dual write on type 2: both PUTs use OP20 collateral →
    should work without extraOutputs
  - **16.14** Mixed spread: write on type 2 + buy on type 0 (cross-pool,
    cross-type) → verify or document as unsupported
  - **Key file:** `tests/integration/16-spread-router.ts`

- [ ] **Task 4: Atomicity regression tests**
  - **16.15** Verify option count unchanged after reverted spread (write
    succeeds but buy reverts → both rolled back)
  - **16.16** Verify token balances unchanged after reverted dual-write
    (leg 1 succeeds but leg 2 fails → both rolled back, no allowance
    consumed)
  - **16.17** Verify expired option in buy leg causes clean revert with
    descriptive error
  - **Key file:** `tests/integration/16-spread-router.ts`

- [ ] **Task 5: Save router address + update deployed-contracts.json**
  - Test 16.1 deploys the router but currently doesn't persist the address
  - Add `deployed.router = routerAddress` + `saveDeployedContracts(deployed)`
    after successful deployment (same pattern as pools)
  - This enables the SpreadRouter frontend sprint (Task 2 of that sprint)
    to read the address from config
  - **Key file:** `tests/integration/16-spread-router.ts`

### Acceptance criteria
- Zero `structural_test` stubs remaining in test 16
- All strategy types tested on type 0 pool
- BTC pool compatibility documented (supported vs unsupported combos)
- Router address persisted to deployed-contracts.json
- Tests pass on testnet

### Dependencies
- Depends on "BTC Pool Integration Tests" sprint (Task 1: extraOutputs in
  DeploymentHelper) for BTC pool router tests
- Type 0 pool deployed (tests 05/06a — already done)
- BTC pools deployed (tests 14.1, 15.1 — already done)

---

## Backlog

### Contracts
- [ ] **Update ABI documentation** — options-factory.md and options-pool.md have 23 discrepancies vs source code (see AUDIT notes)

### Frontend
- [ ] **BTC pool user flows — complete extraOutputs** — WriteOptionPanel (type 2 CALL), ExerciseModal (type 1 CALL, type 2 PUT) have detection + UI warnings but don't attach `extraOutputs` to `sendTransaction()`. CancelModal/SettleModal don't receive `poolType` at all. Only BuyOptionModal (type 1) is correctly implemented. Needs: fetch bridge escrow script, derive P2WSH, attach extraOutputs. See audit from 2026-03-05.
- [ ] **On-chain TX history** — Replace localStorage-only TX tracking with RPC/indexer queries for persistent data
- [ ] **UX flow redesign** — Parallel TX support, modal persistence, per-TX status in pill ([research](../research/ux-flow-redesign.md))

### Indexer
- [ ] **Historical yield analytics** — Time-series snapshots in D1 for yield trends, TVL, volume metrics

### CI/CD
- [ ] **Create Cloudflare Pages project for frontend**
  - Run `wrangler pages project create frogop-frontend` once from CLI
  - Set environment variables in Pages dashboard

### Pre-Launch
- [ ] **Security audit** — Complete [audit checklist](../research/audit-checklist.md)
- [ ] **Mainnet migration** — Follow [migration checklist](../research/mainnet-migration.md)

## In Progress

(none)
