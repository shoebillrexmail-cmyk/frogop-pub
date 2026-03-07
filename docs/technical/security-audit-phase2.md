# Phase 2 Security Audit Report

**Date:** 2026-03-04
**Scope:** Phase 2 AssemblyScript/WASM contracts — OptionsPool (type 0/1/2), NativeSwapBridge, SpreadRouter, OptionsFactory
**Status:** All findings remediated (except LOW-5 — factory-side, out of scope)

---

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| CRITICAL | 4     | 4/4   |
| HIGH     | 6     | 6/6   |
| MEDIUM   | 6     | 6/6   |
| LOW      | 6     | 5/6   |

---

## CRITICAL Findings

### CRIT-1: BTC UTXO Output Not Marked Consumed — Double-Spend — FIXED

**Files:** `bridge/contract.ts` (`verifyBtcOutput`)

`verifyBtcOutput()` now maintains a consumed-output registry keyed on `sha256(CONSUMED_OUTPUTS_POINTER || scriptHash || value)`. Each output can only be consumed once; subsequent calls with the same key are rejected.

Also removed `@view` from `verifyBtcOutput` since it writes state (MED-4 related).

### CRIT-2: Fake Writer Pubkey — BTC Addresses Unspendable — FIXED

**Files:** `base.ts` (new `registerBtcPubkey`, `getRegisteredPubkey`, `getRegisteredPubkeyInternal`), `btc-quote.ts`, `btc-underlying.ts`

Implemented on-chain Bitcoin pubkey registration in `OptionsPoolBase`:
- `registerBtcPubkey(bytes33)` — validates 33-byte compressed pubkey (0x02/0x03 prefix), stores in `PUBKEY_REGISTRY_POINTER`-keyed storage
- `getRegisteredPubkey(address)` — view method to query registry
- `getRegisteredPubkeyInternal(address)` — protected helper for subclasses (reverts if unregistered)

Deleted `getWriterPubkey()` from btc-quote.ts and `getActorPubkey()` from btc-underlying.ts. All BTC pool methods now use `this.getRegisteredPubkeyInternal(writer)`.

### CRIT-3: Missing @nonReentrant on All State-Changing Methods — FIXED

**Files:** `contract.ts` (9 methods), `btc-quote.ts` (7 methods), `btc-underlying.ts` (5 methods), `base.ts` (2 methods)

Added `@nonReentrant` decorator to all state-changing methods:
- Type 0: writeOption, cancelOption, buyOption, exercise, settle, transferOption, rollOption, batchCancel, batchSettle
- Type 1: writeOption, reserveOption, executeReservation, cancelReservation, exercise, cancelOption, settle
- Type 2: writeOptionBtc, buyOption, exercise, cancelOption, settle
- Base: updateFeeRecipient, registerBtcPubkey

### CRIT-4: Single-Token Price Cache Enables Price Manipulation — FIXED

**File:** `bridge/contract.ts` (`getBtcPrice`)

Replaced single-value cache (`_cachedPrice`, `_cachedBlock`, `_cachedToken`) with per-token cache using SHA256-keyed storage: `sha256(PRICE_CACHE_POINTER || token || slot)`. Each token's price is cached independently. Removed `@view` since it writes cache state.

---

## HIGH Findings

### HIGH-1: CEI Violation in `writeOptionBtc` CALL Branch — FIXED

**File:** `btc-underlying.ts`

Reordered CALL branch: BTC output verification now happens BEFORE ID allocation and option storage. Pattern: verify → allocate → store.

### HIGH-2: Exercise Re-derives CSV Hash Instead of Using Stored Reservation Hash — FIXED

**File:** `btc-quote.ts`

Added `setCsvScriptHashForOption()` / `getCsvScriptHashForOption()` using `EXTENDED_SLOTS_POINTER`-keyed extended storage (slot 9). In `executeReservation`, the CSV hash is stored on the option. In `exercise` CALL branch, the stored hash is read instead of re-deriving.

### HIGH-3: Duplicate IDs in `batchCancel` Cause Full Revert — FIXED

**File:** `contract.ts`

Added O(n²) duplicate ID detection before the processing loop in both `batchCancel` and `batchSettle` (n≤5, acceptable cost).

### HIGH-4: `updateFeeRecipient` Lacks ReentrancyGuard — FIXED

**File:** `base.ts`

Added `@nonReentrant` decorator to `updateFeeRecipientMethod`.

### HIGH-5: Reservation Window Can Exceed Option Expiry — FIXED

**File:** `btc-quote.ts` (`reserveOption`)

Added check: `if (option.expiryBlock <= currentBlock + RESERVATION_EXPIRY_BLOCKS) throw new Revert('Option expires before reservation window')`.

### HIGH-6: CALL Exercise BTC Payment Model Ambiguity — FIXED

**File:** `btc-quote.ts`

Added block comment at file header documenting the OPNet transaction output model: contract calls are Tapscript-encoded in Bitcoin transaction inputs, and BTC outputs exist in the same transaction, ensuring atomicity.

---

## MEDIUM Findings

| ID | Status | Fix |
|----|--------|-----|
| MED-1 | FIXED | Added `u64` overflow guards (`hi1 != 0 \|\| hi2 != 0 \|\| lo2 != 0`) before all `.lo1` casts in btc-quote.ts and btc-underlying.ts |
| MED-2 | FIXED | Replaced hardcoded `0xFFFF` with `EXTENDED_SLOTS_POINTER` from constants in btc-underlying.ts |
| MED-3 | FIXED | Added doc comment in btc-underlying.ts `cancelOption` explaining no fee for type 2 CALL cancel (BTC in escrow, not contract-held) |
| MED-4 | FIXED | Removed `@view` from `getBtcPrice` and `verifyBtcOutput` in bridge/contract.ts (both write state) |
| MED-5 | FIXED | Added explicit `count.lo1 <= MAX_BATCH_SIZE` guard before u256→i32 narrowing in batch methods |
| MED-6 | FIXED | Added `if (buyOptionId.isZero()) throw Revert('Invalid buy option ID')` in router `executeSpread` |

## LOW Findings

| ID | Status | Fix |
|----|--------|-----|
| LOW-1 | FIXED | `cancelReservation` now emits `OptionRestoredEvent` after returning option to OPEN state |
| LOW-2 | FIXED | Added doc comment to `settle()` explaining permissionless design (keeper pattern) |
| LOW-3 | FIXED | `updateFeeRecipient` now reverts on same-address update |
| LOW-4 | FIXED | Added doc comment to `rollOption` clarifying cancel event `returnAmount` is net-of-fee |
| LOW-5 | NOT FIXED | Factory-side issue (decimal params ignored) — out of scope for pool remediation |
| LOW-6 | FIXED | Added pubkey length validation (33 bytes) in bridge `generateEscrowScriptHash` and in btc-underlying before escrow queries |

---

## What Passes the Audit (No Issues Found)

1. Access control — `onlyOwner` in OptionsFactory
2. Fee calculation — ceiling division `(amount * BPS + 9999) / 10000`
3. Zero-address guards in all `onDeployment` methods
4. Expiry bounds validation (1 year max)
5. Option ID sequential allocation with SafeMath
6. Writer cannot buy own option
7. Grace period enforcement
8. Status state machine transitions
9. `cancelOption` requires OPEN status
10. `getOptionsBatch` bounded to 9
11. `batchCancel`/`batchSettle` fixed iteration (max 5)
12. CEI correct in `cancelOption`, `buyOption`, `exercise` (type 0)
13. SpreadRouter uses `stopOnFailure=true` for atomicity
14. Bridge validates CSV params and P2WSH format
15. Reservation expiry correctly enforced

---

## Remediation Verification

All contracts compiled successfully after remediation:
- `build:pool` (type 0) — OK
- `build:pool-btc-quote` (type 1) — OK
- `build:pool-btc-underlying` (type 2) — OK
- `build:bridge` — OK
- `build:router` — OK
