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
