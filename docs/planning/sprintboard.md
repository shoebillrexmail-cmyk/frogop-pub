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

## Backlog

### Contracts
- [ ] **Update ABI documentation** — options-factory.md and options-pool.md have 23 discrepancies vs source code (see AUDIT notes)

### Frontend
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
