# Flow State Architecture: On-Chain-First Derivation

This document describes how FroGop tracks multi-step transaction flows (approve -> action) in the frontend, the design decisions made, and the trade-offs involved.

---

## Problem Statement

FroGop's options platform has three two-step transaction flows (Write, Buy, Exercise) that each require an ERC-20 `increaseAllowance` approval followed by the actual contract call. On OPNet's Signet-based testnet, blocks take ~10 minutes, so there is a significant window between broadcasting a TX and it being confirmed on-chain.

The original implementation stored flow status (`approval_pending`, `approval_confirmed`, etc.) in localStorage. This caused **stale-state bugs twice** where localStorage state contradicted on-chain reality:

- A user's approval TX confirmed, but localStorage still said `approval_pending` (because the tab was closed before the poller ran).
- A flow was marked `approval_confirmed` in localStorage, but the on-chain allowance was actually 0 (the approval was for a different amount, or was spent by another operation).

**Root cause**: status was *stored* when it should have been *derived*.

---

## Architecture Overview

```
                    On-chain (RPC)                    localStorage
                    ────────────                    ──────────────
                    allowance query  ◄──────┐       StoredFlow[]
                    TX receipts      ◄──┐   │       (no status field)
                                        │   │       TrackedTransaction[]
                                        │   │
                    ┌───────────────────┴───┴───────────────────┐
                    │           TransactionContext               │
                    │                                           │
                    │  storedFlows (useState<StoredFlow[]>)     │
                    │  + state.transactions (useReducer)        │
                    │                                           │
                    │  activeFlows = useMemo(() =>              │
                    │    storedFlows.map(f => ({                │
                    │      ...f,                                │
                    │      status: deriveFlowStatus(f, txs)    │
                    │    }))                                    │
                    │  )                                        │
                    └───────────────────────────────────────────┘
                                        │
                         ┌──────────────┼──────────────┐
                         ▼              ▼              ▼
                    useActiveFlow  FlowResumeCard  TransactionToast
                    (per-modal)    (pill dropdown) (header pill)
```

### Key Principle

**Status is never stored, only derived.** The `deriveFlowStatus()` pure function computes status at read-time from two inputs:

1. Which TX IDs are associated with the flow (`approvalTxId`, `actionTxId`)
2. The confirmation status of those TXs (from the TX poller)

This means:
- Clearing localStorage cannot put the system into an inconsistent state
- An approval TX confirming while the user is away is detected on the next page load (via the TX poller)
- External allowance changes (from another app) are detected via on-chain allowance queries

---

## Data Model

### What lives in localStorage

| Key | Shape | Purpose | Critical? |
|-----|-------|---------|-----------|
| `frogop_active_flows_{wallet}` | `StoredFlow[]` | Flow identity, TX IDs, form state | No — UX convenience only |
| `frogop_pending_txs_{wallet}` | `TrackedTransaction[]` | TX history for pill/history page | No — display only |

### What is derived from RPC at runtime

| State | Source | Refresh trigger |
|-------|--------|-----------------|
| Flow status | `deriveFlowStatus(flow, transactions)` | Automatic — `useMemo` recomputes when any TX status changes |
| Needs approval? | On-chain `allowance < cost` | Every new block (via `useTokenInfo` + `currentBlock` from WebSocket) |
| TX confirmed? | `getTransactionReceipt()` | Every new block (via `useTransactionPoller`) or 15s fallback |

### Type definitions

```typescript
// Persisted — no status field
interface StoredFlow {
    flowId: string;
    actionType: 'writeOption' | 'buyOption' | 'exercise';
    poolAddress: string;
    optionId: string | null;
    approvalTxId: string | null;    // set when approval TX is broadcast
    actionTxId: string | null;      // set when action TX is broadcast
    claimedAt: string;              // ISO timestamp
    label: string;                  // human-readable description
    formState: Record<string, string> | null;  // preserved for resume
    strategyLabel: string | null;   // e.g. 'Protective Put'
}

// Read-time only — StoredFlow + computed status
interface ActiveFlow extends StoredFlow {
    status: FlowStatus;  // derived, never persisted
}
```

---

## Status Derivation Logic

`deriveFlowStatus()` is a pure function in `flowDefs.ts`:

```
INPUT: StoredFlow + TrackedTransaction[]

IF flow has actionTxId:
    FIND action TX in transactions
    IF not found OR broadcast/pending → action_pending
    IF confirmed                     → action_confirmed
    IF failed                        → action_failed

IF flow has approvalTxId:
    FIND approval TX in transactions
    IF not found OR broadcast/pending → approval_pending
    IF confirmed                     → approval_confirmed
    IF failed                        → approval_failed

DEFAULT (no TX IDs at all)           → approval_pending
```

**Priority rule**: Action TX status always takes precedence over approval TX status. If a flow has both `approvalTxId` and `actionTxId`, only the action TX determines status.

---

## Flow Lifecycle

### Two-step flow (Write / Buy / Exercise)

```
[User opens modal]
        │
        ▼
[Check on-chain allowance via useTokenInfo]
        │
        ├── allowance >= cost ──► Skip to step 2
        │
        ▼
[Step 1: Approve]
        │
        ├── claimFlow() → creates StoredFlow (no status)
        ├── broadcast approve TX
        ├── updateFlow({ approvalTxId }) → stores TX ID
        │
        ▼
[Wait for confirmation]  ◄── TX poller detects receipt
        │                     deriveFlowStatus() → approval_confirmed
        ├── useTokenInfo refreshes on new block
        ├── on-chain allowance now >= cost
        ├── needsApproval becomes false
        │
        ▼
[Step 2: Action]
        │
        ├── broadcast action TX (writeOption / buyOption / exercise)
        ├── updateFlow({ actionTxId }) → stores TX ID
        │
        ▼
[Wait for confirmation]  ◄── TX poller detects receipt
        │                     deriveFlowStatus() → action_confirmed
        ▼
[Auto-release flow after 3 seconds]
```

### Single-step flows (Cancel, Settle, Transfer, Roll, Batch*)

These do not use the active flow system. They are fire-and-forget: broadcast the TX, add it to `TrackedTransaction[]`, and let the TX poller confirm it.

### Strategies (Covered Call, Protective Put, Collar)

These orchestrate existing two-step modals. A Collar, for example, opens the Write panel for a CALL, then the Buy modal for a PUT. Each leg is a standard two-step flow with its own `strategyLabel` for pill display.

---

## Block-Reactive Allowance

`useTokenInfo` accepts an optional `currentBlock` parameter. When a new block arrives via WebSocket, the hook re-fetches the on-chain allowance. This means:

- After an approval TX confirms in a new block, the modal **automatically advances** to step 2 without user interaction.
- If someone approves from another app/tab, the allowance change is detected at the next block.
- Overhead: ~1 extra RPC call per ~10 min per open modal. Zero when no modal is open.

Each modal gets `currentBlock` from a different source:
- **BuyOptionModal**: receives `currentBlock` as a prop (already available from the page)
- **WriteOptionPanel**: calls `useWsBlock()` directly
- **ExerciseModal**: calls `useWsBlock()` directly

---

## Double-Approve Prevention

Between broadcasting an approval TX and the next block confirming it, the on-chain allowance hasn't changed yet. Without a guard, the modal would still show "Approve" because `allowance < cost`.

The `approvalPending` guard prevents this:

```typescript
const approvalPending = myFlow?.status === 'approval_pending' && myFlow.approvalTxId != null;
const needsApproval = !approvalPending && !approvalReady && allowance < cost;
```

This replaces the simpler `!approvalReady` check with: "don't show approve if we have a pending approval TX in flight OR if the on-chain allowance is already sufficient."

---

## Resume and Recovery

### FlowResumeCard (in TransactionToast dropdown)

Each active flow appears in the header pill's dropdown with:
- Status label (derived in real-time)
- Elapsed time
- View TX link (to OpScan block explorer)
- Resume button (reopens the correct modal with form state restored)
- Abandon button (removes flow from tracking)

### ActiveFlowBanner (inside modals)

When a modal opens and finds an existing flow for the same identity (actionType + poolAddress + optionId), it shows a banner with:
- Current status
- Continue (keep the existing flow) or Start Fresh (abandon and restart)

### Edge cases

| Scenario | Behavior |
|----------|----------|
| User clears localStorage mid-flow | On-chain allowance still works. If >= cost, proceeds to step 2. If < cost, user re-approves (safe, just sets allowance again). |
| Approval TX dropped from mempool | TX poller marks it `failed` after 2 hours. Derived status becomes `approval_failed`. User can retry. |
| External approval (another app) | On-chain allowance detected on next block via `useTokenInfo`. Auto-advances to step 2. |
| Multiple tabs | `StorageEvent` syncs `StoredFlow` data. Each tab derives status independently from its own TX poller. |
| Page reload during mempool wait | `StoredFlow` is loaded from localStorage. TX poller re-checks receipt. If TX confirmed while away, derived status updates automatically. |

---

## Trade-offs

### Chose: Derive status vs. Store status

**Before**: Status stored in localStorage, synced via `syncFlowStatus()` useEffect.

**After**: Status derived via `useMemo` from TX receipts.

| | Stored status | Derived status |
|---|---|---|
| **Correctness** | Can disagree with chain | Always matches chain |
| **Complexity** | `syncFlowStatus` useEffect + manual `updateFlow({ status })` calls in 3 modals | Single `deriveFlowStatus` pure function |
| **Performance** | No recomputation | `useMemo` runs on every TX status change — negligible cost (array scan of max ~100 TXs against max 5 flows) |
| **Testability** | Hard to test sync timing | Pure function with 11 unit tests |
| **localStorage migration** | N/A | `loadFlows()` strips legacy `status` field from old entries |

### Chose: Block-reactive allowance vs. Manual refetch

**Alternative considered**: Only re-fetch allowance when user clicks "Refresh" or after a timer.

**Chose**: Re-fetch on every new block via WebSocket subscription.

| | Manual refetch | Block-reactive |
|---|---|---|
| **UX** | User must click refresh or wait for arbitrary timer | Auto-advances when approval confirms |
| **RPC load** | Lower | ~1 extra call per ~10 min per open modal |
| **Consistency** | Can miss external approvals | Catches all allowance changes |

The extra RPC call every ~10 minutes is negligible given OPNet's block time.

### Chose: Minimal TX interface vs. Full TrackedTransaction import

`deriveFlowStatus()` accepts `readonly TxStatusRecord[]` (just `txId` + `status`) instead of the full `TrackedTransaction` type. This:

- Avoids a circular import between `flowDefs.ts` and `transactionDefs.ts`
- Makes the function easier to test (minimal mock data)
- Is structurally compatible with `TrackedTransaction[]` (TypeScript's structural typing handles this)

### Chose: Parallel flows (max 5) vs. Single active flow

**Rationale**: OPNet enforces a 25-descendant mempool chain limit. Each two-step flow uses up to 2 unconfirmed TXs. 5 flows = 10 TXs, safely under the limit. This allows a user to approve multiple options simultaneously and complete step 2 on each as approvals confirm.

---

## File Map

| File | Role |
|------|------|
| `contexts/flowDefs.ts` | Type definitions (`StoredFlow`, `ActiveFlow`, `FlowStatus`), `deriveFlowStatus()`, `flowIdentityKey()` |
| `contexts/transactionDefs.ts` | `TrackedTransaction`, `TransactionContextValue` (includes `updateFlow` with no `status` param) |
| `contexts/TransactionContext.tsx` | Provider: `storedFlows` state, `useMemo` derivation to `activeFlows`, localStorage persistence, auto-release |
| `hooks/useActiveFlow.ts` | Per-modal hook: identity matching, `claimFlow`, `updateFlow` (TX IDs only), `approvalReady` |
| `hooks/useTransactionFlow.ts` | Generates flow UUIDs, `trackApproval` / `trackAction` helpers, resume detection |
| `hooks/useTransactionPoller.ts` | Polls `getTransactionReceipt()` on new blocks; marks TXs confirmed/failed |
| `hooks/useTokenInfo.ts` | Queries on-chain balance + allowance; re-fetches on `currentBlock` change |
| `hooks/useWebSocketProvider.ts` | WebSocket block subscription; `useWsBlock()` hook |
| `components/BuyOptionModal.tsx` | Buy flow modal — uses `useActiveFlow`, `useTokenInfo` with block-reactive allowance |
| `components/WriteOptionPanel.tsx` | Write flow panel — same pattern |
| `components/ExerciseModal.tsx` | Exercise flow modal — same pattern |
| `components/TransactionToast.tsx` | Header pill + dropdown with `FlowResumeCard` per active flow |
| `components/FlowResumeCard.tsx` | Per-flow card: derived status label, Resume/Abandon/View TX |
| `components/ActiveFlowBanner.tsx` | In-modal banner: Continue/Start Fresh for existing flows |
| `components/StepIndicator.tsx` | Visual 2-step progress bar |
| `contexts/__tests__/deriveFlowStatus.test.ts` | 11 tests covering all status derivation paths |

---

## Testing

### deriveFlowStatus (11 tests)

All 7 status derivation paths plus edge cases:
- No TXs at all -> `approval_pending`
- Approval broadcast/pending -> `approval_pending`
- Approval confirmed -> `approval_confirmed`
- Approval failed -> `approval_failed`
- Action broadcast/pending -> `action_pending`
- Action confirmed -> `action_confirmed`
- Action failed -> `action_failed`
- Action TX priority over approval TX
- TX ID set but TX not found in array (treat as pending)

### useActiveFlow (8 tests)

- `canStartFlow` gating with parallel flow limits
- Identity matching by (actionType, poolAddress, optionId)
- `approvalReady` from derived status
- Form state restoration for resumed flows
- `claimFlow` delegation to context

### Integration (491 total tests across 39 files)

All existing modal tests, component tests, and utility tests pass with the refactored types.
