# User Action Flows — Design Reference

> **Status**: Draft — initial intent & research findings
> **Roadmap**: Sprint 6, Stories 6.6 + 6.7
> **Last updated**: 2026-03-01

---

## Context & Motivation

FroGop runs on OPNet (Bitcoin L1, Signet fork) with **~10-minute block times**. Users initiating transactions face long waits between broadcast and confirmation. The current UX must be redesigned around this constraint:

1. **Never block the user** from doing other things while a TX is pending
2. **Always show status** — from broadcast through confirmation
3. **Allow parallel operations** — OPNet has no nonce serialization; multiple TXs can be in-flight simultaneously
4. **Persist state across modal close/reopen** — the blockchain doesn't stop when a modal closes

### Current Problems

| Problem | Impact | Example |
|---------|--------|---------|
| **Global singleton flow lock** | User blocked from ALL two-step actions while one is pending | Buying Option #5 blocks buying Option #7 for ~10 min |
| **No "View" during pending** | User has no way to verify TX was broadcast | FlowResumeCard only shows "Resume" after confirmation |
| **Modal amnesia** | Closing and reopening a modal shows fresh state | User sees empty form while their approval is still pending on-chain |
| **Silent button failure** | Clicking "Approve" when blocked does nothing | No error toast, no disabled state — just `return;` |
| **No progress in pill** | Transaction pill shows count but no per-TX detail during pending | User doesn't know which TX is pending or its status |

### Research Findings

| Finding | Source | Implication |
|---------|--------|-------------|
| OPNet allows parallel TXs (UTXO-based, no nonce) | Codebase analysis | Global lock is unnecessary at protocol level |
| Approvals are general allowances (`increaseAllowance`) | Contract code | Approval for Buy #5 doesn't conflict with approval for Buy #7 |
| GMX v2 allows parallel swaps with pending balance | GMX open-source | Industry precedent for parallel flows |
| Uniswap's hard global lock was widely criticized | GitHub issues #1814, #6294 | Users got permanently stuck; caused major support burden |
| Leading DeFi shows "View on Explorer" from broadcast | Blocknative, Uniswap, MultiversX | Users need verification immediately, not after ~10 min |
| MultiversX persists all pending TXs across page reload | sdk-dapp docs | Full session persistence is the standard |

---

## Design Principles

1. **Broadcast = success for the user** — once TX is broadcast, show confirmation and let them move on
2. **The pill is the dashboard** — all active TXs visible at a glance with status + actions
3. **Modals are stateless entry points, not status screens** — close anytime, reopen to resume
4. **Per-option soft lock, not global lock** — can't double-buy the SAME option; CAN buy different ones in parallel
5. **10-minute blocks = users WILL leave and come back** — state must survive everything

---

## Proposed Flow Architecture

### Lock Scope Change

```
CURRENT:  Global singleton lock — one two-step flow per wallet
PROPOSED: Per-identity soft lock — one flow per (actionType + poolAddress + optionId)

Examples:
  Buy #5 pending  → Buy #7 ALLOWED (different optionId)
  Buy #5 pending  → Buy #5 again BLOCKED (same identity)
  Buy #5 pending  → Write option ALLOWED (different actionType)
  Buy #5 pending  → Exercise #3 ALLOWED (different actionType + optionId)
```

### Flow State: Map Instead of Singleton

```typescript
// CURRENT (singleton):
activeFlow: ActiveFlow | null;

// PROPOSED (map keyed by identity):
activeFlows: Map<string, ActiveFlow>;
// Key: `${actionType}:${poolAddress}:${optionId ?? 'none'}`
```

### Transaction Pill: Enhanced Status

```
CURRENT:
  [3 pending] ▼  →  (dropdown with flat TX list + single FlowResumeCard)

PROPOSED:
  [3 pending] ▼  →  (dropdown with per-flow cards, each showing):
    ┌──────────────────────────────────────────────┐
    │ ⏳ Buying Option #5         2m ago           │
    │    Step 1: Approval confirmed ✓              │
    │    Step 2: Purchase pending...               │
    │    [View TX ↗]  [Resume]  [Abandon]          │
    ├──────────────────────────────────────────────┤
    │ ⏳ Writing CALL Option       30s ago          │
    │    Step 1: Approval pending...               │
    │    [View TX ↗]  [Abandon]                    │
    ├──────────────────────────────────────────────┤
    │ ✓  Exercise #3 confirmed     5m ago          │
    │    [View TX ↗]  [Dismiss]                    │
    └──────────────────────────────────────────────┘
```

Key changes:
- **"View TX" button available from broadcast** — links to OPNet explorer
- **Per-step status** visible (Step 1 / Step 2)
- **Multiple flows shown simultaneously** in the dropdown
- **"Resume" opens the correct modal** at the right step

### Modal Behavior: Flow-Aware

```
CURRENT:
  Open BuyModal for #5 → fresh form → user must click Approve again
  (even though approval is pending on-chain)

PROPOSED:
  Open BuyModal for #5 → detect active flow for Buy #5 →
    If approval_pending:  Show "Approval pending..." with spinner + View TX link
    If approval_confirmed: Show "Confirm Purchase" button (skip Step 1)
    If action_pending:     Show "Purchase pending..." with spinner + View TX link
    If no active flow:     Show fresh form (normal)
```

---

## User Flow Diagrams

### Flow 1: Write Option (Two-Step)

```
User clicks "Write Option" on Pools page
         │
         ▼
┌─────────────────────┐
│  WriteOptionPanel    │
│  (slide-in panel)    │
│                      │
│  Type: CALL/PUT      │
│  Strike: ___         │
│  Amount: ___         │
│  Premium: ___        │
│  Expiry: ___ days    │
│                      │
│  [Approve Collateral]│
└─────────┬───────────┘
          │ click
          ▼
    ┌─────────────┐     TX broadcast
    │ Approve TX  │────────────────────► Pill shows:
    │ (MOTO/PILL) │                      "Writing CALL — Approving..."
    └─────┬───────┘                      [View TX ↗]
          │
          │  User CAN close panel now
          │  User CAN start other operations
          │
          ▼  (~10 min later, approval mines)
    ┌─────────────┐
    │ Approval    │────────────────────► Pill updates:
    │ Confirmed   │                      "Writing CALL — Ready for step 2"
    └─────┬───────┘                      [Resume] [View TX ↗]
          │
          │  User clicks "Resume" OR reopens WriteOptionPanel
          │  Form values restored from flow.formState
          ▼
    ┌─────────────┐     TX broadcast
    │ Write TX    │────────────────────► Pill shows:
    │             │                      "Writing CALL — Confirming..."
    └─────┬───────┘                      [View TX ↗]
          │
          ▼  (~10 min later)
    ┌─────────────┐
    │  SUCCESS    │────────────────────► Pill shows:
    │             │                      "CALL written ✓"
    └─────────────┘                      [View TX ↗] [Dismiss]
                                         Auto-dismiss after 30s
```

### Flow 2: Buy Option (Two-Step)

```
User clicks "Buy" on option row in OptionsTable
         │
         ▼
┌─────────────────────┐
│  BuyOptionModal      │
│                      │
│  Option #42 — CALL   │
│  Strike: 50 PILL     │
│  Premium: 5 PILL     │
│  Fee: 0.05 PILL (1%) │
│  Total: 5.05 PILL    │
│                      │
│  P&L chart preview   │
│                      │
│  [Approve PILL]      │  ◄── if allowance < totalCost
│  [Confirm Purchase]  │  ◄── if allowance sufficient or approval confirmed
└─────────┬───────────┘
          │
          ▼ (same two-step pattern as Write)
```

### Flow 3: Exercise Option (Two-Step)

```
User clicks "Exercise" on purchased option (Portfolio or Pools page)
         │
         ▼
┌─────────────────────┐
│  ExerciseModal       │
│                      │
│  Option #42 — CALL   │
│  You pay: strikeValue│
│  You receive: amount │
│  Fee: 0.1% of recv   │
│                      │
│  [Approve Payment]   │  ◄── PILL for calls, MOTO for puts
│  [Confirm Exercise]  │
└─────────┬───────────┘
          │
          ▼ (same two-step pattern)
```

### Flow 4: Cancel Option (Single-Step)

```
User clicks "Cancel" on written OPEN option
         │
         ▼
┌─────────────────────┐
│  CancelModal         │
│                      │
│  Option #42          │
│  Collateral returned │
│  Fee: 1% (if active) │
│  Net refund: ___     │
│                      │
│  [Cancel Option]     │  ◄── single TX, no approval needed
└─────────┬───────────┘
          │ click
          ▼
    ┌─────────────┐     TX broadcast
    │ Cancel TX   │────────────────────► Pill shows:
    │             │                      "Cancelling #42..."
    └─────┬───────┘                      [View TX ↗]
          │
          │  User CAN close modal immediately
          │  No flow lock — single step
          │
          ▼  (~10 min later)
    ┌─────────────┐
    │  SUCCESS    │────────────────────► Pill: "Option #42 cancelled ✓"
    └─────────────┘                      Auto-dismiss after 30s
```

### Flow 5: Settle Option (Single-Step)

```
User clicks "Settle" on expired, unsettled option
         │
         ▼
┌─────────────────────┐
│  SettleModal         │
│                      │
│  Option #42 (expired)│
│  Collateral returned │
│  to writer           │
│                      │
│  [Settle Option]     │  ◄── single TX
└─────────┬───────────┘
          │
          ▼ (same single-step pattern as Cancel)
```

### Flow 6: Transfer Option (Single-Step)

```
User clicks "Transfer" on purchased option
         │
         ▼
┌─────────────────────┐
│  TransferModal       │
│                      │
│  Option #42          │
│  Recipient: ________ │  ◄── bech32 address input
│                      │
│  [Transfer]          │  ◄── single TX
└─────────┬───────────┘
          │
          ▼ (same single-step pattern)
```

### Flow 7: Roll Option (Single-Step)

```
Writer clicks "Roll" on written OPEN option
         │
         ▼
┌─────────────────────┐
│  RollModal           │
│                      │
│  Current: Strike 50, │
│    Expiry +30d       │
│  New: Strike ___,    │
│    Expiry ___, Prem  │
│  Net collateral: ___ │
│                      │
│  [Roll Option]       │  ◄── single TX (cancel + create atomic)
└─────────┬───────────┘
          │
          ▼ (same single-step pattern)
```

### Flow 8: Batch Cancel (Single-Step)

```
User clicks "Cancel All" on Portfolio page
         │
         ▼
┌─────────────────────┐
│  BatchCancelModal    │
│                      │
│  3 options selected  │
│  Per-option breakdown│
│  Total fees: ___     │
│  Total refund: ___   │
│                      │
│  [Cancel 3 Options]  │  ◄── single TX (up to 5 per batch)
└─────────┬───────────┘
          │
          ▼ (same single-step pattern)
```

### Flow 9: Collar Strategy (Composite)

```
User clicks "Collar" on Pools page
         │
         ▼
┌─────────────────────┐
│  CollarModal         │
│                      │
│  Leg 1: Write CALL   │
│    Strike: 120% spot │
│  Leg 2: Buy PUT      │
│    Best available     │
│  Net premium: ___    │
│                      │
│  [Write CALL]        │  ◄── opens WriteOptionPanel (two-step)
│  [Buy PUT]           │  ◄── opens BuyOptionModal (two-step)
└─────────────────────┘
          │
          │  Each leg is an independent flow
          │  Leg 1 and Leg 2 can be in-flight simultaneously
          │  (with proposed parallel flow support)
```

---

## Parallel Flow: Detailed Interaction

```
Timeline (10-min blocks)
═══════════════════════════════════════════════════════════════

t=0   User clicks "Buy #5" → Approval TX broadcast
      Pill: [1 pending] "Buying #5 — Approving..."

t=1   User clicks "Buy #7" → Approval TX broadcast    ◄── CURRENTLY BLOCKED, PROPOSED: ALLOWED
      Pill: [2 pending] "Buying #5 — Approving..."
                         "Buying #7 — Approving..."

t=10  Buy #5 approval mines
      Pill: [1 pending, 1 ready] "Buying #5 — Ready ✓ [Resume]"
                                  "Buying #7 — Approving..."

t=11  User clicks "Resume" for #5 → Confirm Purchase TX broadcast
      Pill: [2 pending] "Buying #5 — Confirming..."
                         "Buying #7 — Approving..."

t=12  Buy #7 approval mines
      Pill: [1 pending, 1 ready] "Buying #5 — Confirming..."
                                  "Buying #7 — Ready ✓ [Resume]"

t=20  Buy #5 purchase mines
      Pill: [1 ready, 1 done] "Buying #7 — Ready ✓ [Resume]"
                               "Option #5 bought ✓ [Dismiss]"

t=21  User clicks "Resume" for #7, confirms purchase
      ...and so on
```

---

## Technical Changes Required

### 1. TransactionContext: Singleton → Map

Replace `activeFlow: ActiveFlow | null` with `activeFlows: Map<string, ActiveFlow>`.

| Current API | Proposed API |
|-------------|-------------|
| `activeFlow` | `activeFlows` (Map) |
| `claimFlow(params)` → `ActiveFlow \| null` | `claimFlow(params)` → same, but only blocks on same identity |
| `updateFlow(updates)` | `updateFlow(flowId, updates)` — target specific flow |
| `abandonFlow()` | `abandonFlow(flowId)` — abandon specific flow |
| `requestResume()` | `requestResume(flowId)` — resume specific flow |

### 2. useActiveFlow: Identity-Scoped

No change to the hook API — it already matches on `(actionType + poolAddress + optionId)`. Internally it would find its own flow in the map instead of checking the singleton.

### 3. FlowResumeCard → FlowResumeCards

Render one card per active flow in the dropdown. Each card has its own View/Resume/Abandon actions.

### 4. TransactionToast: Enhanced Pill

Show per-flow status cards. Add "View TX" link (opens OPNet explorer) available from broadcast time.

### 5. Modal Flow Awareness

Each two-step modal checks for an active flow matching its identity on mount:
- If found in pending state → show spinner + "View TX" link
- If found in confirmed state → skip to step 2
- If not found → show fresh form

### 6. Explorer Link

Add OPNet testnet explorer URL to config:
```typescript
const EXPLORER_TX_URL = 'https://testnet.opnet.org/tx/';
```

---

## Resolved Questions (via OPNet MCP — 2026-03-02)

### 1. Per-option lock (not per-pool)

**Answer: Per-option lock is correct and safe.**

OPNet is UTXO-based with no nonce serialization. Approvals are general per-token per-spender allowances (`increaseAllowance`), not per-transaction. Buying Option #5 and Option #7 simultaneously is safe at the protocol level — they use different contract calls that don't conflict. The lock key should be `${actionType}:${poolAddress}:${optionId}` as originally proposed.

### 2. Max parallel flows: 5 concurrent (10 unconfirmed TXs)

**Answer: Cap at 5 concurrent two-step flows.**

OPNet enforces a **mempool chain limit of 25 unconfirmed transaction descendants** (same as Bitcoin Core's BIP125 Rule 5). Each two-step flow produces up to 2 unconfirmed TXs, so 5 concurrent flows = 10 TXs max, well within the 25-descendant limit. This also prevents UI clutter in the pill dropdown. Single-step operations (cancel, settle, transfer) don't count toward the flow limit but do consume UTXOs.

### 3. Stale flow cleanup: 4h timeout unchanged

**Answer: Keep the existing 4h timeout for `approval_pending`.**

The constraint is the 25-descendant chain limit, not time-based. With the per-option lock, a stale flow only blocks re-initiating the *same* operation. 4 hours is generous enough for OPNet's ~10-min blocks (covers ~24 blocks) while preventing permanent stuck states.

### 4. OPWallet handles UTXO selection for frontend

**Answer: OPWallet manages UTXO selection internally — frontend does NOT need to handle this.**

Per OPNet frontend rules: `signer: null, mldsaSigner: null` in `sendTransaction()` — OPWallet handles signing AND UTXO selection. The `splitUTXOs()` and `utxoManager` APIs are for **backend** use only. On frontend, if the user has insufficient separate UTXOs for parallel TXs, OPWallet will return an error (`too-long-mempool-chain`), which we should catch and display as: *"Too many pending transactions. Wait for a confirmation before starting another."* This is a graceful degradation, not a hard architectural constraint.

**Implementation note:** The documented `splitUTXOs` pattern (split wallet into N UTXOs for batch operations) is a backend optimization. For frontend, the practical limit is the user's UTXO count. Most users with normal wallet activity will have enough UTXOs for 2-3 parallel flows.

### 5. OPNet testnet explorer: confirmed available

**Answer: `https://testnet.opnet.org/tx/{txId}`**

The OPNet contract addresses registry confirms the mempool explorer URL: `https://testnet.opnet.org/tx/`. This should be used for all "View TX" links from the moment of broadcast.

```typescript
// config/index.ts
export const EXPLORER_TX_URL = 'https://testnet.opnet.org/tx/';

// Usage in components
const viewUrl = `${EXPLORER_TX_URL}${txId}`;
```

---

## Success Criteria

| Criteria | Metric |
|----------|--------|
| No global blocking | User can initiate Buy #7 while Buy #5 approval is pending |
| View from broadcast | "View TX" link available within 1 second of TX broadcast |
| Modal state restoration | Reopening modal shows pending flow state, not fresh form |
| Pill shows all active | Each pending flow has its own card with status + actions |
| No stuck states | Stale flows auto-cleaned; user can always abandon |
| All flows documented | Diagrams for all 9 user action flows in this document |

---

## Related

- [ROADMAP.md](./ROADMAP.md) — Sprint 6, Stories 6.6 + 6.7
- `frontend/src/contexts/flowDefs.ts` — Flow type definitions
- `frontend/src/contexts/TransactionContext.tsx` — Flow state management
- `frontend/src/hooks/useActiveFlow.ts` — Modal flow hook
- `frontend/src/components/FlowResumeCard.tsx` — Flow status card
- `frontend/src/components/TransactionToast.tsx` — Transaction pill
