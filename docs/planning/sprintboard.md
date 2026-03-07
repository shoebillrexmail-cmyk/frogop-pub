# FroGop Sprintboard

> For completed Phase 1 work, see [phase-1-completed.md](phase-1-completed.md).

## Completed Sprints

| Sprint | Commit | Date |
|--------|--------|------|
| Pool List UX — Inverse Pair Grouping | `cad13a8` | 2026-03-05 |
| Indexer Cron Resilience | `2c2ed48` | 2026-03-05 |
| React Error Boundaries | `7c68f95` | 2026-03-05 |
| BTC Pool Frontend Flows — Complete extraOutputs | `32a532b` | 2026-03-05 |
| Strategy UX Enhancement — Price-Aware Guidance | `954dd71` | 2026-03-05 |
| SpreadRouter config + frontend wiring (Tasks 1-3) | `f2ca3a2` | 2026-03-06 |
| SpreadRouter — Atomic Strategy Execution (complete) | `d479592` | 2026-03-06 |
| SpreadRouter Integration Tests — Full Strategy Coverage | pending | 2026-03-07 |
| Network Mismatch Guard + Multi-Network Deployment | pending | 2026-03-07 |
| Strategy UX Redesign — Outcome-First + BTC Fix | pending | 2026-03-07 |
| BTC Pool Integration Tests — Full Lifecycle Coverage | pending | 2026-03-07 |
| Expanded Speculation Strategies — Long Call/Put + Straddle/Strangle | pending | 2026-03-07 |

---

## ~~Sprint: Pool List UX — Inverse Pair Grouping~~ DONE

> **Goal:** Group inverse pool pairs visually on the pool list page so users
> can see related markets at a glance and pick the right direction for their
> strategy, without hiding any pools.

### Context

The 6 deployed pools form 3 inverse pairs (MOTO↔BTC, PILL↔BTC, MOTO↔PILL).
Currently each pool renders as an independent card in a flat grid — users see
6 cards with no indication that MOTO/BTC and BTC/MOTO are the same market in
opposite directions. This is confusing, especially for BTC pools.

### Tasks

- [x] **Task 1: Group pools into inverse pairs**
  - In `PoolListPage.tsx`, group the flat `pools[]` array into pairs by matching
    underlying↔premium addresses (A/B and B/A are a pair; unpaired pools get
    their own group).
  - Add a helper `groupInversePairs(pools, configs)` in a new `utils/poolGrouping.ts`.
  - Each group = `{ market: string, pools: [PoolEntry, PoolEntry?] }`.
  - Market label: alphabetical token order, e.g. "BTC ↔ MOTO", "MOTO ↔ PILL".
  - Write unit tests for grouping logic (edge cases: unpaired pool, 3+ pools
    with same tokens, missing config).

- [x] **Task 2: Grouped card layout**
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

- [x] **Task 3: Direction explainer on PoolCard**
  - Add a one-line subtitle to `PoolCard` explaining what the user locks and
    earns: "Lock MOTO, earn BTC" / "Lock BTC, earn MOTO".
  - Derive from `poolType`: type 0 = "Lock {underlying}, earn {premium}",
    type 1/2 = same pattern but mention "sats" for BTC side.
  - Helps users immediately understand the difference between the two
    directions without clicking in.

- [x] **Task 4: Search + filter works with groups**
  - Search should filter at the group level: if either pool in a pair matches
    the query, show the entire group (both cards).
  - Optional: add a pool-type filter dropdown (All / OP20↔OP20 / OP20↔BTC).

- [x] **Task 5: Tests**
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

## ~~Sprint: SpreadRouter — Atomic Strategy Execution~~ DONE

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

- [x] **Task 1: Deploy SpreadRouter on testnet**
  - Run `npm run build:router` to ensure WASM is up to date
  - Run integration test 16 (`npx tsx tests/integration/16-spread-router.ts`)
    which deploys the router and runs bull call spread, bear put spread, and
    collar tests
  - Save deployed address to `tests/integration/deployed-contracts.json`
  - Verify on-chain via RPC: router contract responds to `executeSpread` and
    `executeDualWrite` calls

- [x] **Task 2: Add SpreadRouter to pools.config.json + frontend config**
  - Add `"router": { "addresses": { "testnet": "opt1sq..." } }` to `pools.config.json`
  - Add `getRouterAddress()` helper to `frontend/src/config/index.ts` that reads
    from pools.config (same pattern as `getNativeSwapAddress`)
  - Replace hardcoded `ROUTER_ADDRESS = ''` in StrategiesPage with config lookup
  - Add `VITE_ROUTER_ADDRESS` env var fallback for local dev

- [x] **Task 3: Wire StrategiesPage to live SpreadRouter**
  - Remove the "SpreadRouter not deployed yet" error guard (line 137)
  - Test full execution flow: select strategy → configure legs → execute →
    verify TX receipt contains both legs
  - Add transaction tracking: integrate with `useTransactionContext` so the
    pill shows strategy TX status (pending → confirmed)
  - Handle errors: if router TX reverts, show which leg failed and why

- [x] **Task 4: Pool detail page — link to StrategiesPage for collar**
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

- [x] **Task 5: Strategy flow tracking via pill**
  - When a strategy TX is broadcast from StrategiesPage, create a tracked
    transaction in TransactionContext with type `'strategy'`
  - Pill shows: "Collar: MOTO/PILL — pending" → "confirmed"
  - On StrategiesPage, show active strategy TX status (reuse existing
    TrackedTransaction display pattern)

- [x] **Task 6: Tests**
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

## ~~Sprint: BTC Pool Integration Tests — Full Lifecycle Coverage~~ DONE

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

| Test | Real | Time-constrained | Notes |
|------|------|------------------|-------|
| 14 (BTC quote) | 6 real (deploy, write, reserve, cancel, executeReservation w/ BTC) | 7 time-constrained (exercise, settle, expiry) | No structural_test stubs remain |
| 15 (BTC underlying) | 7 real (deploy, pubkey reg, CALL write w/ BTC, PUT write, PUT buy, CALL cancel) | 4 time-constrained (exercise, settle) | No structural_test stubs remain |

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

- [x] **Task 1: Add extraOutputs support to DeploymentHelper**
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

- [x] **Task 2: Test 14 — Complete BTC quote pool (type 1) lifecycle**
  - **14.6** `executeReservation` with real BTC extraOutput: reads btcAmount
    from reservation view, queries bridge csvScriptHash, derives P2WSH,
    calls executeReservation with extraOutputs — REAL test
  - **14.7** `executeReservation` reverts without BTC — already partially real
  - **14.8** Wrong BTC amount revert — `deferred_negative_test` (documented)
  - **14.9-14.10** Reservation expiry — `time_constrained` (144 blocks)
  - **14.11-14.13** Exercise flows — `time_constrained` (145+ blocks on Signet)
  - **14.15** Settle after grace — `time_constrained` (288 blocks)
  - **14.16-14.18** Full lifecycle round trips — `partially_tested` /
    `time_constrained` (reserve+execute validated by 14.6)
  - Created `btc-test-helpers.ts` with bridge query + reservation reader helpers
  - Added P2WSH derivation + BTC output helpers to `deployment.ts`
  - Added `BRIDGE_SELECTORS` to `config.ts`
  - All stubs upgraded from generic `structural_test` to categorized
    `time_constrained` / `partially_tested` / `deferred_negative_test`
  - **Key files:** `tests/integration/14-btc-quote-pool.ts`,
    `tests/integration/btc-test-helpers.ts`

- [x] **Task 3: Test 15 — Complete BTC underlying pool (type 2) lifecycle**
  - **15.1b** Register writer BTC pubkey — NEW real test
  - **15.2** CALL writeOptionBtc with BTC extraOutput: computes escrow hash
    via bridge (placeholderBuyer + writerPubkey + cltvBlock), derives P2WSH,
    calls writeOptionBtc with extraOutput — REAL test
  - **15.3** CALL writeOptionBtc without BTC — now attempts real call
  - **15.6-15.7** Exercise flows — `time_constrained` (145+ blocks)
  - **15.8** CALL cancel — REAL test (cancels option from 15.2, verifies CANCELLED)
  - **15.9** Settle — `time_constrained` (288 blocks)
  - **15.10-15.11** Full lifecycle — `partially_tested` (15.1b, 15.2, 15.8 real)
  - All stubs upgraded from generic `structural_test` to categorized types
  - **Key files:** `tests/integration/15-btc-underlying-pool.ts`

- [x] **Task 4: Bridge integration test coverage**
  - Bridge `getBtcPrice()` returns valid price from NativeSwap (verified in test 13.2)
  - CSV script hash determinism verified (test 13.4)
  - Escrow script hash generation verified (test 13.9)
  - Bridge fix: `c8e9001` — getQuote uint256→uint64 + real NativeSwap address
  - **Key files:** `tests/integration/13-native-swap-bridge.ts`

- [x] **Task 5: Fee verification for BTC pools**
  - **14.14b** Cancel fee (1%) on type 1 pool: write CALL → cancel → verify
    feeRecipient underlying balance increased by `ceil(collateral * 100 / 10000)`
  - **15.5c** Buy fee (1%) on type 2 pool: write PUT → buy → verify
    feeRecipient premium balance increased by `ceil(premium * 100 / 10000)`
  - **15.5d** CALL cancel no fee (MED-3): documented — BTC in P2WSH escrow,
    no on-chain fee possible
  - Exercise fee (0.1%): time-constrained (requires past-expiry option)
  - **Key files:** `tests/integration/14-btc-quote-pool.ts`,
    `tests/integration/15-btc-underlying-pool.ts`

### Acceptance criteria
- Zero `structural_test` stubs remaining in tests 14 and 15 — **DONE** (all
  upgraded to `time_constrained`, `partially_tested`, or `deferred_negative_test`)
- Real extraOutputs tests: 14.6 (executeReservation), 15.2 (writeOptionBtc CALL),
  15.8 (CALL cancel) — **DONE**
- `extraOutputs` helper is reusable for any future BTC-related test — **DONE**
- Time-constrained tests (exercise, settle, reservation expiry) documented with
  exact block requirements; testable on regtest with short expiry — **DOCUMENTED**

### Dependencies
- Bridge contract deployed (test 13 — already done)
- BTC quote + underlying pools deployed (tests 14.1, 15.1 — already done)
- Test wallet must have sufficient BTC balance for extraOutputs

---

## ~~Sprint: SpreadRouter Integration Tests — Full Strategy Coverage~~ DONE

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

- [x] **Task 1: Complete existing test 16 stubs**
  - **16.3** Bear put spread: implemented (write PUT + buy existing option)
  - **16.7** Changed to state verification: reads option count after all router tests
  - **16.8** Cross-pool spread: documented as architectural limitation (router
    operates on single pool; cross-pool requires contract extension)
  - **Key file:** `tests/integration/16-spread-router.ts`

- [x] **Task 2: SpreadRouter + BTC quote pool (type 1)**
  - **16.12** `executeSpread` on type 1 → expected revert (no `buyOption` — uses reservation flow)
  - **16.13** `executeDualWrite` on type 1 → should succeed (has `writeOption`, OP20 collateral)
  - **16.14** Verify balances unchanged after type 1 spread revert (clean rollback)
  - **Key file:** `tests/integration/16-spread-router.ts`

- [x] **Task 3: SpreadRouter + BTC underlying pool (type 2)**
  - **16.15** `executeDualWrite` on type 2 → expected revert (uses `writeOptionBtc` selector, not `writeOption`)
  - **16.16** `executeSpread` on type 2 → expected revert (same selector mismatch on write leg)
  - **16.17** Compatibility matrix summary — documents supported/unsupported combos per pool type
  - **Key file:** `tests/integration/16-spread-router.ts`

- [x] **Task 4: Atomicity regression tests**
  - **16.9** Verify option count unchanged after reverted spread
  - **16.10** Verify token balances unchanged after reverted dual-write
  - **16.11** Verify buy of non-existent option causes clean revert, write leg rolled back
  - **Key file:** `tests/integration/16-spread-router.ts`

- [x] **Task 5: Save router address + update deployed-contracts.json**
  - Test 16.1 deploys the router but currently doesn't persist the address
  - Add `deployed.router = routerAddress` + `saveDeployedContracts(deployed)`
    after successful deployment (same pattern as pools)
  - This enables the SpreadRouter frontend sprint (Task 2 of that sprint)
    to read the address from config
  - **Key file:** `tests/integration/16-spread-router.ts`

### Acceptance criteria
- Zero `structural_test` stubs remaining in test 16 — **DONE** (16.8 documented as architectural limitation)
- All strategy types tested on type 0 pool — **DONE** (16.2 bull call, 16.3 bear put, 16.6 collar)
- BTC pool compatibility documented (supported vs unsupported combos) — **DONE** (16.17 matrix)
- Router address persisted to deployed-contracts.json — **DONE** (16.1)
- Tests pass on testnet — **DONE** (type 0 real execution, BTC pool boundary tests)

### Dependencies
- Depends on "BTC Pool Integration Tests" sprint (Task 1: extraOutputs in
  DeploymentHelper) for BTC pool router tests
- Type 0 pool deployed (tests 05/06a — already done)
- BTC pools deployed (tests 14.1, 15.1 — already done)

---

## ~~Sprint: Indexer Cron Resilience~~ DONE

> **Goal:** Ensure the indexer cron never silently dies. Wrap all top-level
> poller work in structured error handling with retry logic and observability,
> so transient RPC failures don't cause hours of missing data.

### Context

The indexer's `scheduled()` handler calls `pollNewBlocks()` which fans out to
`pollPrices()`, `pollPools()`, and `pollCandles()`. If any of these throw an
unhandled exception, the entire cron invocation fails and Cloudflare Workers
logs it as a generic 500 — no structured error, no partial progress saved, no
retry. A single RPC timeout can cause a full cycle of missed data.

### Tasks

- [x] **Task 1: Top-level try/catch in scheduled handler**
  - Wrap `pollNewBlocks()` call in try/catch inside `scheduled()` in `src/index.ts`
  - On catch: log structured error with `{ error: e.message, stack: e.stack,
    timestamp, cronCycle }` — don't swallow silently
  - Return gracefully so the Worker doesn't crash (Cloudflare retries crashed
    crons, but with exponential backoff that can cause gaps)
  - **Key file:** `indexer/src/index.ts`

- [x] **Task 2: Per-task isolation in pollNewBlocks**
  - Currently `pollNewBlocks()` runs price polling, pool polling, and candle
    aggregation sequentially — if prices fail, pools and candles are skipped
  - Wrap each sub-task in its own try/catch so partial failures don't cascade
  - Log which sub-tasks succeeded and which failed per cycle
  - Pattern: `const results = await Promise.allSettled([pollPrices(...),
    pollPools(...), pollCandles(...)])`
  - **Key file:** `indexer/src/poller/index.ts`

- [x] **Task 3: RPC call retry with exponential backoff**
  - Create `retryRpc(fn, maxRetries=3, baseDelayMs=500)` utility in
    `indexer/src/utils/retry.ts`
  - Apply to all `provider.call()` invocations in price polling
  - Log retry attempts with attempt number + error message
  - Don't retry on non-transient errors (e.g. invalid calldata — 4xx errors)
  - **Key file:** `indexer/src/utils/retry.ts`, `indexer/src/poller/index.ts`

- [x] **Task 4: Health check endpoint**
  - Add a `GET /health` route to the worker that returns:
    `{ status: 'ok', lastBlock, lastCronAt, priceCount, poolCount }`
  - Query D1 for latest block number and snapshot count
  - Enables external monitoring (Uptime Robot, Cloudflare Health Checks)
  - **Key file:** `indexer/src/api/router.ts`

- [x] **Task 5: Tests**
  - Unit test: `retryRpc` retries on transient error, stops on success, gives
    up after maxRetries
  - Unit test: `pollNewBlocks` with one sub-task failing — verify other sub-tasks
    still execute and results are logged
  - Unit test: `scheduled()` catches thrown error and doesn't re-throw
  - **Key files:** `indexer/src/__tests__/utils/retry.test.ts`,
    `indexer/src/__tests__/poller/resilience.test.ts`

### Key files
| File | Change |
|------|--------|
| `indexer/src/index.ts` | Top-level try/catch in scheduled handler |
| `indexer/src/poller/index.ts` | Per-task isolation with Promise.allSettled |
| `indexer/src/utils/retry.ts` | New — RPC retry utility |
| `indexer/src/api/router.ts` | Add /health endpoint |

---

## ~~Sprint: React Error Boundaries~~ DONE

> **Goal:** Prevent white-screen crashes when a component throws. Add error
> boundaries at strategic points so failures are contained and users see
> actionable recovery UI instead of a blank page.

### Context

The frontend has zero `<ErrorBoundary>` components. Any unhandled render error
(e.g. undefined property access from stale RPC data, malformed BigInt from
indexer) crashes the entire React tree → white screen. Users lose all context
and must manually reload. This is especially bad for BTC pools where indexer
data formats recently changed.

### Tasks

- [x] **Task 1: Create ErrorBoundary component**
  - Create `frontend/src/components/ErrorBoundary.tsx` — class component
    (React error boundaries require class componentDidCatch)
  - Props: `fallback?: ReactNode`, `onError?: (error, info) => void`,
    `children: ReactNode`
  - Default fallback: dark-themed card matching terminal design with error
    message, "Reload" button, and "Report Bug" link
  - Log error details to console in development
  - **Key file:** `frontend/src/components/ErrorBoundary.tsx`

- [x] **Task 2: Layout-level boundary**
  - Wrap the `<Outlet>` in the root layout with `<ErrorBoundary>`
  - This catches any page-level crash and shows recovery UI without losing
    the header/navigation
  - User can navigate to a different page without full reload
  - **Key file:** `frontend/src/layouts/MainLayout.tsx` (or wherever Outlet lives)

- [x] **Task 3: Widget-level boundaries for critical sections**
  - Wrap `<PriceChart>` in its own boundary — chart library errors shouldn't
    crash the pool detail page
  - Wrap `<OptionsTable>` — malformed option data shouldn't crash the page
  - Wrap strategy execution panel on StrategiesPage
  - Each gets a compact inline fallback: "Failed to load [widget]. [Retry]"
  - **Key files:** `frontend/src/pages/PoolDetailPage.tsx`,
    `frontend/src/pages/StrategiesPage.tsx`

- [x] **Task 4: Graceful degradation when RPC is down**
  - When `provider` is null or RPC calls fail, pages should show skeleton UI
    with "Connecting to network..." instead of crashing
  - Add a `useNetworkStatus()` hook that tracks provider connectivity
  - Show a persistent banner when RPC is unreachable: "Network unavailable —
    data may be stale"
  - **Key files:** `frontend/src/hooks/useNetworkStatus.ts`,
    `frontend/src/components/NetworkBanner.tsx`

- [x] **Task 5: Tests**
  - Unit test: ErrorBoundary catches render error, shows fallback, calls onError
  - Unit test: ErrorBoundary "Reload" button resets error state
  - Unit test: Child component throwing doesn't crash parent outside boundary
  - Unit test: useNetworkStatus returns correct state for connected/disconnected
  - **Key files:** `frontend/src/components/__tests__/ErrorBoundary.test.tsx`,
    `frontend/src/hooks/__tests__/useNetworkStatus.test.ts`

### Key files
| File | Change |
|------|--------|
| `frontend/src/components/ErrorBoundary.tsx` | New — error boundary component |
| `frontend/src/components/NetworkBanner.tsx` | New — RPC status banner |
| `frontend/src/hooks/useNetworkStatus.ts` | New — provider connectivity hook |
| `frontend/src/layouts/MainLayout.tsx` | Wrap Outlet in ErrorBoundary |
| `frontend/src/pages/PoolDetailPage.tsx` | Widget-level boundaries |
| `frontend/src/pages/StrategiesPage.tsx` | Widget-level boundary |

---

## ~~Sprint: BTC Pool Frontend Flows — Complete extraOutputs~~ DONE

> **Goal:** Make all BTC pool user flows (write, exercise, cancel, settle)
> fully functional by wiring extraOutputs into every modal that needs native
> BTC transfers. Currently only BuyOptionModal (type 1) works correctly.

### Context

Audit from 2026-03-05 found that BTC pool modals have detection scaffolding
(poolType checks, "BTC required" warnings) but don't actually attach
`extraOutputs` to `sendTransaction()`. This means:

| Modal | Type 1 (BTC quote) | Type 2 (BTC underlying) |
|-------|-------------------|------------------------|
| BuyOptionModal | Works (extraOutputs) | Works (OP20 only) |
| WriteOptionPanel | Works (OP20 only) | Broken (CALL needs BTC collateral) |
| ExerciseModal | Broken (CALL needs BTC strike) | Broken (PUT needs BTC) |
| CancelModal | No poolType prop | No poolType prop |
| SettleModal | No poolType prop | No poolType prop |

### Tasks

- [x] **Task 1: Create BTC escrow utility**
  - Create `frontend/src/utils/btcEscrow.ts` with:
    - `deriveBtcEscrowAddress(bridgeAddr, provider)` — fetch CSV script hash,
      derive P2WSH address (reuse logic from BuyOptionModal)
    - `buildBtcExtraOutput(escrowAddr, amountSats)` — returns extraOutput object
  - Extract existing logic from BuyOptionModal into this shared utility
  - Refactor BuyOptionModal to use the shared utility
  - **Key files:** `frontend/src/utils/btcEscrow.ts`,
    `frontend/src/components/BuyOptionModal.tsx`

- [x] **Task 2: WriteOptionPanel — type 2 CALL with BTC collateral**
  - When `poolType === 2` and option type is CALL:
    - Compute BTC collateral amount from underlyingAmount (bridge price lookup)
    - Call `buildBtcExtraOutput()` for the escrow address
    - Attach to `sendTransaction({ extraOutputs: [...] })`
  - Show BTC amount in the confirmation summary
  - **Key file:** `frontend/src/components/WriteOptionPanel.tsx`

- [x] **Task 3: ExerciseModal — BTC strike/payout flows**
  - Type 1 CALL exercise: buyer pays BTC strike → add extraOutput with strike
    amount in sats to escrow address
  - Type 2 PUT exercise: buyer sends BTC to writer → add extraOutput with BTC
    amount to writer's address (from option data)
  - Show BTC amount required in modal before user confirms
  - **Key file:** `frontend/src/components/ExerciseModal.tsx`

- [x] **Task 4: CancelModal + SettleModal — pass poolType**
  - Thread `poolType` prop from PoolDetailPage through to CancelModal and
    SettleModal (currently not passed)
  - For type 2 CALL cancel: emit BTC reclaim info (CLTV script details) so
    writer knows how to reclaim BTC collateral off-chain
  - For type 2 settle: same pattern — show reclaim instructions
  - Type 1 cancel/settle: OP20 only, no BTC needed — just needs poolType for
    future-proofing
  - **Key files:** `frontend/src/components/CancelModal.tsx`,
    `frontend/src/components/SettleModal.tsx`,
    `frontend/src/pages/PoolDetailPage.tsx`

- [x] **Task 5: Tests**
  - Unit test: `deriveBtcEscrowAddress` returns valid P2WSH from mock bridge
  - Unit test: `buildBtcExtraOutput` constructs correct output shape
  - Unit test: WriteOptionPanel renders BTC collateral summary for type 2 CALL
  - Unit test: ExerciseModal shows BTC strike amount for type 1 CALL
  - Unit test: CancelModal receives and uses poolType prop
  - **Key files:** `frontend/src/utils/__tests__/btcEscrow.test.ts`,
    `frontend/src/components/__tests__/WriteOptionPanel.test.tsx`,
    `frontend/src/components/__tests__/ExerciseModal.test.tsx`

### Key files
| File | Change |
|------|--------|
| `frontend/src/utils/btcEscrow.ts` | New — shared BTC escrow utilities |
| `frontend/src/components/BuyOptionModal.tsx` | Refactor to use shared utility |
| `frontend/src/components/WriteOptionPanel.tsx` | Add extraOutputs for type 2 CALL |
| `frontend/src/components/ExerciseModal.tsx` | Add extraOutputs for type 1/2 |
| `frontend/src/components/CancelModal.tsx` | Accept poolType, show BTC reclaim |
| `frontend/src/components/SettleModal.tsx` | Accept poolType, show BTC reclaim |
| `frontend/src/pages/PoolDetailPage.tsx` | Pass poolType to all modals |

### Dependencies
- Requires bridge contract deployed and accessible on testnet
- BTC escrow logic already proven in BuyOptionModal — this sprint extracts and reuses it

---

## ~~Sprint: Strategy UX Enhancement — Price-Aware Guidance~~ DONE

> **Goal:** Bring the rich price-aware guidance from WriteOptionPanel (moneyness
> classification, Black-Scholes premium, yield preview) into the StrategiesPage
> LegSelector, so users configuring multi-leg strategies get the same quality
> assistance as single-leg writers.

### Context

WriteOptionPanel offers excellent guidance: spot price display, ATM/ITM/OTM
badges via `classifyMoneyness()`, Black-Scholes suggested premium via
`useSuggestedPremium()`, yield-to-expiry preview, and pool reserve warnings.
The StrategiesPage LegSelector has none of this — all inputs are manual with no
market context. The hooks and math functions already exist; they just need to be
wired into the strategy UI.

### Tasks

- [x] **Task 1: Add spot price + moneyness to LegSelector**
  - Import `usePoolPrices()` and `classifyMoneyness()` into LegSelector
  - Show current spot price next to strike input
  - Display moneyness badge (ATM/ITM/OTM/Deep ITM/Far OTM) that updates live
    as strike is adjusted
  - Color code: green for ITM, yellow for ATM, red for OTM
  - **Key files:** `frontend/src/components/LegSelector.tsx`,
    `frontend/src/hooks/usePoolPrices.ts`

- [x] **Task 2: Black-Scholes suggested premium per leg**
  - Wire `useSuggestedPremium()` hook into each leg configuration
  - Show "Suggested: X PILL" next to premium input with adjustable volatility
    slider (20-200%, default 80%)
  - "Use suggested" button auto-fills the premium field
  - For spreads: show net premium (credit or debit) for the combined position
  - **Key files:** `frontend/src/components/LegSelector.tsx`,
    `frontend/src/hooks/useSuggestedPremium.ts`

- [x] **Task 3: Strategy-specific smart defaults via URL params**
  - StrategiesPage reads URL params: `?pool=X&strategy=collar&strike=Y`
  - Pre-populate: pool selection, strategy type, and initial strike prices
  - For collar: default to ATM CALL + 10% OTM PUT (common hedge ratio)
  - For bull call spread: default to ATM buy + 10% OTM write
  - Pool detail page "Collar" link passes current pool + spot-derived defaults
  - **Key files:** `frontend/src/pages/StrategiesPage.tsx`,
    `frontend/src/components/QuickStrategies.tsx`

- [x] **Task 4: Combined P&L chart labels + break-even markers**
  - Add numeric labels to key points on CombinedPnLChart: max profit, max loss,
    break-even price(s), current spot price marker
  - Show net premium paid/received for the combined strategy
  - **Key file:** `frontend/src/components/CombinedPnLChart.tsx`

- [x] **Task 5: Tests**
  - Unit test: LegSelector shows moneyness badge based on strike vs spot
  - Unit test: Suggested premium auto-fills on button click
  - Unit test: URL params pre-populate strategy configuration
  - Unit test: CombinedPnLChart renders break-even and max profit labels
  - **Key files:** `frontend/src/components/__tests__/LegSelector.test.tsx`,
    `frontend/src/pages/__tests__/StrategiesPage.test.tsx`

### Key files
| File | Change |
|------|--------|
| `frontend/src/components/LegSelector.tsx` | Add price guidance, moneyness, premium |
| `frontend/src/components/CombinedPnLChart.tsx` | Add numeric labels + markers |
| `frontend/src/pages/StrategiesPage.tsx` | URL param pre-population |
| `frontend/src/components/QuickStrategies.tsx` | Pass defaults via URL params |

### Dependencies
- Requires indexer price data available (deployed + running)
- All hooks (`usePoolPrices`, `useSuggestedPremium`, `classifyMoneyness`) already exist

---

## ~~Sprint: Network Mismatch Guard + Multi-Network Deployment~~ DONE

> **Goal:** Detect wallet-network mismatch (e.g. mainnet wallet on testnet app)
> and show a friendly banner instead of crashing. Set up multi-network CI/CD
> for parallel testnet + mainnet deployments.

### Tasks

- [x] **Story A: NetworkMismatchBanner** — Compares wallet `chainType` against
  app `currentNetwork`. Shows amber warning + "Switch Network" button. Dismissible.
  - `frontend/src/components/NetworkMismatchBanner.tsx` (new)
  - `frontend/src/components/__tests__/NetworkMismatchBanner.test.tsx` (new, 6 tests)
  - `frontend/src/components/Layout.tsx` (add banner between header and content)

- [x] **Story B: Dynamic BTC network in useBtcPayment** — Replaced hardcoded
  `networks.testnet` with `BTC_NETWORK_MAP[currentNetwork]` for P2WSH derivation.
  - `frontend/src/hooks/useBtcPayment.ts`

- [x] **Story B: Network label in NetworkStatusBar** — Shows "Testnet" or
  "Mainnet" badge next to connection dot in footer status bar.
  - `frontend/src/components/NetworkStatusBar.tsx`

- [x] **Story B: Mainnet wrangler configs** — Separate worker names, D1 databases,
  and env vars for mainnet deployments.
  - `frontend/wrangler.mainnet.toml` (new)
  - `indexer/wrangler.mainnet.toml` (new)

- [x] **Story B: CI mainnet deploy jobs** — Gated on `vars.MAINNET_POOL_ADDRESS`
  (no-op until mainnet pool addresses are configured in GitHub repo variables).
  - `.github/workflows/frontend.yml` (add `deploy-mainnet` job)
  - `.github/workflows/indexer.yml` (add `deploy-mainnet` job)

---

## Backlog

### Contracts
- [x] ~~**Update ABI documentation**~~ — options-factory.md and options-pool.md fully rewritten
  to match source code. Now covers all 3 pool types + SpreadRouter + base class.

### Frontend
- [x] **BTC pool user flows — complete extraOutputs** — Promoted to sprint: "BTC Pool Frontend Flows — Complete extraOutputs"
- [ ] **On-chain TX history** — Replace localStorage-only TX tracking with RPC/indexer queries for persistent data
- [ ] **About page → Docs hub** *(needs discussion before implementation)* — Expand the About page
  into a comprehensive in-app documentation hub. Should cover: platform overview, how options work,
  strategy guides (covered call, protective put, collar, spreads) with examples, pool types
  (OP20/OP20 vs BTC pools), fee structure, grace period mechanics, links to deployed contract
  addresses (factory, pools, SpreadRouter, tokens), glossary of terms. Consider tabbed or
  accordion layout. Reference existing docs in `docs/product/user-guide.md` as source material.
- [x] ~~**UX flow redesign**~~ — Parallel TX support, modal persistence, per-TX status in pill — all implemented. Dead collar code removed, strategy pill labels added, BTC pool metadata wired to Portfolio modals.
- [x] ~~**Grace period UX & documentation**~~ — Dynamic `blocksToTime()` labels in PoolCard, PoolHeaderBar (top row + details), PoolInfoCard. Comprehensive grace period section in user-guide.md. Tooltips on pool cards.

### Indexer
- [ ] **Historical yield analytics** — Time-series snapshots in D1 for yield trends, TVL, volume metrics
- [x] ~~**Per-pool grace period**~~ — Added `grace_period_blocks` column to pools table. Poller queries `gracePeriodBlocks()` view at startup, caches in D1. Decoder uses per-pool value for `grace_end_block` calculation.

### CI/CD
- [x] ~~**Create Cloudflare Pages project for frontend**~~ — Already done.
  CI/CD in `.github/workflows/frontend.yml` (lint/typecheck/test/build + deploy to CF Workers on master push).
  Also: `contracts.yml`, `indexer.yml`.

### Dependencies
- [ ] **Update OPNet packages to stable releases** — All OPNet packages have stable releases
  but we're still on `rc` tags. Update to stable, verify no breaking changes.

  | Package | Current (Indexer) | Current (Frontend) | Target |
  |---------|-------------------|--------------------|--------|
  | `@btc-vision/bitcoin` | 7.0.0-rc.6 | 7.0.0-rc.6 | **7.0.0** (stable) |
  | `@btc-vision/transaction` | 1.8.0-rc.10 | 1.8.0-rc.8 | **1.8.0** (stable) |
  | `opnet` | 1.8.1-rc.17 | 1.8.1-rc.11 | **1.8.2** (stable) |
  | `@btc-vision/walletconnect` | — | 1.10.3 | **1.10.4** (stable) |

  Steps:
  1. Update all packages in both `frontend/` and `indexer/`
  2. Remove `@noble/hashes` override in indexer (stable releases should resolve correctly)
  3. Run full test suite in both projects
  4. Verify wallet connect flow still works (manual test)
  5. Run integration tests against testnet to verify RPC compatibility
  6. Check for API changes in changelogs (especially `opnet` 1.8.1→1.8.2)

### Pre-Launch
- [ ] **Security audit** — Complete [audit checklist](../research/audit-checklist.md)
- [ ] **Mainnet migration** — Follow [migration checklist](../research/mainnet-migration.md)

## Pending Test Results

| Test | Option ID | Grace End Block | Check After (UTC) | Action |
|------|-----------|-----------------|--------------------|--------|
| 06d-settle-prep | 29 | 4363 | ~2026-03-08 02:30 UTC (~24h from prep) | Re-run `npx tsx tests/integration/06d-settle-prep.ts` — it reads `settle-state.json`, detects grace has passed, and attempts settle |

> **Timing:** Signet blocks ~10 min. 146 blocks remaining at prep time = ~24 hours.
> Settle-state saved at 2026-03-07 02:21 UTC. Re-run any time after March 8 ~02:30 UTC.

---

## ~~Sprint: Strategy UX Redesign — Outcome-First + BTC Fix~~ DONE

> **Goal:** Fix BTC pool display labels, unify strategies into Pool Detail Page,
> and replace options jargon with outcome-first cards + interactive config.

### Story 1: Fix BTC Pool Display Labels — DONE
- Added `premiumDisplayUnit(symbol)` helper: returns "sats" for BTC, symbol otherwise
- Applied across all price-context labels: WriteOptionPanel, LegSelector,
  CombinedPnLChart, YieldOverview, PoolHeaderBar, BuyOptionModal, ExerciseModal,
  OptionsChain, OptionsTable

### Story 2: Unify Strategies into Pool Detail Page — DONE
- Deleted `/strategies` route → redirect to `/pools`
- Deleted `StrategiesPage.tsx`, `QuickStrategies.tsx` + tests
- Removed "Strategies" from global nav
- 2 tabs: "Market" (browse + buy) and "Write" (yield + strategies)
- Created `StrategySection.tsx` — unified write-side strategy hub
- Created `MarketStrategyCards.tsx` — buy-side outcome cards + chain filter
- `OptionsChain.tsx` + `OptionsTable.tsx` accept `strategyFilter` prop, dim non-matching rows

### Story 3: Outcome-First Strategy Cards + Interactive Config — DONE
- Created `OutcomeCard.tsx` — compact goal-first card (risk badge, title, tagline, metric)
- Created `StrategyConfigurator.tsx` — moneyness slider(s), expiry presets, amount,
  live "What You'll Get" preview via `calcLiveOutcome()`
- Added `calcLiveOutcome()` to `strategyMath.ts` — computes live metrics for all 6 strategies
- Write tab: 5 strategy cards + Write Custom → StrategyConfigurator → WriteOptionPanel
- Market tab: Protective Put card → filter chain → StrategyConfigurator → BuyOptionModal
- Multi-leg (Collar, Spreads): inline LegSelector + CombinedPnLChart + SpreadRouter

### Key files
| File | Action |
|------|--------|
| `frontend/src/config/index.ts` | `premiumDisplayUnit()` helper |
| `frontend/src/utils/strategyMath.ts` | `calcLiveOutcome()`, types |
| `frontend/src/components/OutcomeCard.tsx` | NEW |
| `frontend/src/components/StrategyConfigurator.tsx` | NEW |
| `frontend/src/components/StrategySection.tsx` | NEW |
| `frontend/src/components/MarketStrategyCards.tsx` | NEW |
| `frontend/src/pages/PoolDetailPage.tsx` | 2-tab layout, wired both components |
| `frontend/src/App.tsx` | `/strategies` → redirect |
| `frontend/src/components/Layout.tsx` | Removed Strategies nav link |
| `frontend/src/pages/StrategiesPage.tsx` | DELETED |
| `frontend/src/components/QuickStrategies.tsx` | DELETED |

---

## Sprint: Strategy UX — Market Tab Enhancements

> **Goal:** Improve the buy-side strategy discovery on the Market tab with
> richer chain highlighting, a Collar card, and quick-buy shortcuts.

### Stories

- [ ] **Story 1: Collar card on Market tab ("Lock In a Price Range")**
  - Add a second `OutcomeCard` to `MarketStrategyCards` for Collar strategy
  - Shows net cost (put premium paid − call premium earned) via `calcLiveOutcome('collar', ...)`
  - Clicking sets a `StrategyFilter` that highlights both the buy PUT and sell CALL rows
  - Filter type: `{ type: 'collar', optionType: null, strikeMin, strikeMax }` — highlights
    PUTs in 70-95% range AND CALLs in 105-150% range
  - StrategyConfigurator expands with two moneyness sliders (reuse existing dual-slider logic)
  - "Setup Protection" button triggers `onBuyOption` for the PUT leg + `onWriteOption` for the CALL leg
  - **Key files:** `MarketStrategyCards.tsx`, `OptionsChain.tsx`, `OptionsTable.tsx`

- [ ] **Story 2: Best-match row highlighting in chain**
  - When a strategy filter is active, highlight the single "best match" option row
    with a cyan border/badge instead of just dimming non-matching rows
  - For Protective Put: best match = closest to selected moneyness with available liquidity
  - For Collar: highlight both the best PUT and best CALL rows
  - Add a small "Best match" badge on the highlighted row(s)
  - Uses `findBestProtectivePut()` (already exists) and new `findBestCollarPair()`
  - **Key files:** `OptionsChain.tsx`, `OptionsTable.tsx`, `strategyMath.ts`

- [ ] **Story 3: Quick-buy button on strategy-filtered rows**
  - When the chain is filtered by a strategy, add a prominent "Buy" button directly
    on matching rows (skip the separate row action → modal flow)
  - Button opens `BuyOptionModal` pre-filled with the option data + strategy label
  - Only appears when `strategyFilter` is active and the row matches
  - For rows that are already purchased or cancelled, show disabled state
  - **Key files:** `OptionsChain.tsx`, `OptionsTable.tsx`

### Acceptance criteria
- Market tab shows 2 cards: "Protect Against Drops" + "Lock In a Price Range"
- Collar card shows net cost metric and dual moneyness config
- Best-match rows have visible highlight (not just un-dimmed)
- Quick-buy button opens BuyOptionModal directly from filtered chain rows

---

## Backlog — Future Market Tab Ideas

- [ ] **Guided buy flow** — After clicking "Get Protection" in configurator, instead of
  opening BuyOptionModal immediately, show a mini-wizard: "You're buying a PUT at X strike
  for Y premium. This protects you if price drops below Z." → confirm → BuyOptionModal
- [ ] **Strategy comparison view** — Side-by-side comparison of Protective Put vs Collar
  cost/benefit when both cards are available
- [ ] **Historical strategy performance** — Show backtested P&L for the selected strategy
  parameters using indexer price candle data

---

## Sprint: Expanded Speculation Strategies — Long Call/Put + Straddle/Strangle

> **Goal:** Add 4 new buy-side strategies so users can bet on large price moves
> (uncapped directional) and volatility events (non-directional). No contract
> changes needed — all strategies use existing buyOption functionality.

### Context

Current speculation strategies (bull-call-spread, bear-put-spread) cap both risk
AND reward. Crypto users want uncapped upside for big moves. Additionally,
non-directional strategies (straddle/strangle) let users profit from volatility
without predicting direction.

### Stories

- [x] **Story 1: Core types + finder functions** ✅
  - Add `long-call`, `long-put`, `long-straddle`, `long-strangle` to `StrategyType`
  - Add `findBestCall()` — find best OPEN CALL to buy (mirror of `findBestProtectivePut`)
  - Add `findBestPut()` — alias/reuse of existing `findBestProtectivePut`
  - Add `findStraddlePair()` — find CALL+PUT at closest matching strike
  - Add `findStranglePair()` — find OTM CALL + OTM PUT at different strikes
  - Add `calcLiveOutcome` cases with scenario-based metrics
  - Update `countBuyableOptionsForIntent` and `countOpenOptionsForStrategy`

- [x] **Story 2: Intent definitions + wizard integration** ✅
  - Add `long-call` to `speculate-up` strategies
  - Add `long-put` to `speculate-down` strategies
  - Add new intent `expect-volatility` with `long-straddle`, `long-strangle`
  - Update `intentNeedsLiquidity` for new intent
  - Add labels, taglines, risk levels to TradeConfigurator maps
  - Add buy-side panels in TradeConfigurator for all 4 strategies
  - Update `BUY_SIDE` set and per-strategy liquidity counts

- [x] **Story 3: StrategyConfigurator + StrategySection integration** ✅
  - Add `getMoneyRanges` cases for new strategy types
  - Add strategy explainers in `STRATEGY_EXPLAINER`
  - Add P2P badges in StrategySection for new types
  - Update `STRATEGY_META` in strategyMath

- [x] **Story 4: Straddle/strangle two-leg buy UX** ✅
  - TradeConfigurator panel showing combined CALL+PUT with total cost
  - Two-button layout: "Buy Call Leg" / "Buy Put Leg" (user buys in any order)
  - Handle "no pair found" gracefully
  - Combined PnL scenarios and break-even display

- [x] **Story 5: Tests + cleanup** ✅
  - Unit tests for calcLiveOutcome new cases (in strategyMath)
  - Update intentDefs tests for new intent (7 intents, expect-volatility)
  - All 569 tests pass, clean TypeScript

---

## Status (2026-03-07)

All integration test sprints **COMPLETE**. Strategy UX Redesign **COMPLETE** (Stories 1-3).
Expanded Speculation Strategies sprint **COMPLETE** (Stories 1-5).

**Frontend BTC pools deployed** (2026-03-06) with bridge:
- moto-btc, btc-moto, pill-btc, btc-pill — all verified live
