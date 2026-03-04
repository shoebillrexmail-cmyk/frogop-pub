# Phase 2 Security Audit Report

**Date:** 2026-03-04
**Scope:** Phase 2 AssemblyScript/WASM contracts — OptionsPool (type 0/1/2), NativeSwapBridge, SpreadRouter, OptionsFactory
**Status:** Findings documented, remediation pending

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 4     |
| HIGH     | 6     |
| MEDIUM   | 6     |
| LOW      | 6     |

---

## CRITICAL Findings

### CRIT-1: BTC UTXO Output Not Marked Consumed — Double-Spend

**Files:** `bridge/contract.ts` (`verifyBtcOutput`), `btc-quote.ts` (`executeReservation`, `exercise`), `btc-underlying.ts` (`writeOptionBtc`, `exercise`)

`verifyBtcOutput()` scans `Blockchain.tx.outputs` and returns `true` if a matching P2WSH output exists with sufficient value. It **never marks that output as consumed**. A single BTC output can satisfy multiple `verifyBtcOutput` calls within the same transaction.

**Fix:** Implement a consumed-output registry keyed on `sha256(scriptHash || value)` in the bridge. Mark outputs consumed on first verification; reject subsequent calls with the same key.

### CRIT-2: Fake Writer Pubkey — BTC Addresses Unspendable

**Files:** `btc-quote.ts` (`getWriterPubkey`), `btc-underlying.ts` (`getActorPubkey`)

Both pools derive "public keys" from OPNet MLDSA address hashes with a hardcoded `0x02` prefix. These are **not valid Bitcoin compressed public keys** — no private key corresponds to them. BTC locked to the resulting P2WSH addresses is permanently lost.

**Fix:** Implement on-chain Bitcoin pubkey registration. Require writers to submit their actual 33-byte compressed pubkey when writing options.

### CRIT-3: Missing @nonReentrant on All State-Changing Methods

**Files:** All pool contracts (`contract.ts`, `btc-quote.ts`, `btc-underlying.ts`)

`OptionsPoolBase` extends `ReentrancyGuard` but no state-changing method carries `@nonReentrant`. The guard is declared but never invoked. Cross-contract token transfers via `Blockchain.call()` can be re-entered.

**Fix:** Add `@nonReentrant` to: `writeOption`, `cancelOption`, `buyOption`, `exercise`, `settle`, `transferOption`, `rollOption`, `batchCancel`, `batchSettle`, `reserveOption`, `executeReservation`, `cancelReservation`, `writeOptionBtc`.

### CRIT-4: Single-Token Price Cache Enables Price Manipulation

**File:** `bridge/contract.ts` (`getBtcPrice`)

The price cache stores exactly one `(token, price, block)` tuple. Multi-token queries evict each other's cache. A manipulated NativeSwap price is cached for 6 blocks (~1 hour) and used for all `reserveOption` calls during that window.

**Fix:** Use per-token cache mapping. Add TWAP or price sanity bounds.

---

## HIGH Findings

### HIGH-1: CEI Violation in `writeOptionBtc` CALL Branch

**File:** `btc-underlying.ts` (lines 148-182)

`_nextId` counter is incremented before BTC output verification succeeds. Option stored after external bridge call.

**Fix:** Verify BTC output first, then allocate ID and store option.

### HIGH-2: Exercise Re-derives CSV Hash Instead of Using Stored Reservation Hash

**File:** `btc-quote.ts` (`exercise` CALL branch, lines 463-486)

The contract re-derives the writer's CSV script hash with a hardcoded `csvBlocks=6` instead of using the stored reservation hash. If the writer used a different lock duration, verification fails.

**Fix:** Store CSV script hash on the option at purchase time; reuse during exercise.

### HIGH-3: Duplicate IDs in `batchCancel` Cause Full Revert

**File:** `contract.ts` (`batchCancel`, lines 587-666)

No duplicate ID detection in batch operations. Status check prevents double-refund but causes the entire batch to revert on duplicate.

**Fix:** Add explicit duplicate detection before processing.

### HIGH-4: `updateFeeRecipient` Lacks ReentrancyGuard

**File:** `base.ts` (`updateFeeRecipientMethod`, lines 297-321)

Most sensitive admin function (controls fee routing) has no reentrancy protection.

**Fix:** Add `@nonReentrant` decorator.

### HIGH-5: Reservation Window Can Exceed Option Expiry

**File:** `btc-quote.ts` (`reserveOption`, lines 254-322)

No check that `option.expiryBlock > currentBlock + RESERVATION_EXPIRY_BLOCKS`. Options near expiry can be locked in RESERVED state past their natural expiry, preventing writer cancel/settle.

**Fix:** Add: `if (option.expiryBlock <= currentBlock + RESERVATION_EXPIRY_BLOCKS) throw new Revert('Option expires before reservation window')`.

### HIGH-6: CALL Exercise BTC Payment Model Ambiguity

**File:** `btc-quote.ts` (`exercise` CALL branch)

Verifies `Blockchain.tx.outputs` during exercise call, but it's unclear whether the BTC payment and OPNet contract call can be atomically combined in the same Bitcoin transaction. If they cannot, tokens are released without BTC payment.

**Fix:** Clarify OPNet execution model. Consider two-phase exercise reservation if needed.

---

## MEDIUM Findings

| ID | File | Finding |
|----|------|---------|
| MED-1 | btc-quote.ts, btc-underlying.ts | Silent `u256 → u64` truncation via `.lo1` for BTC amounts |
| MED-2 | btc-underlying.ts | Magic constant `0xFFFF` for extended storage namespace |
| MED-3 | btc-underlying.ts | No cancellation fee for type 2 CALL cancel |
| MED-4 | bridge/contract.ts | State writes inside `@view` method (`getBtcPrice`) |
| MED-5 | contract.ts | Fragile `u256 → i32` narrowing in batch methods |
| MED-6 | router/contract.ts | Router does not validate `buyOptionId != 0` |

## LOW Findings

| ID | File | Finding |
|----|------|---------|
| LOW-1 | btc-quote.ts | `cancelReservation` does not emit option availability event |
| LOW-2 | All pools | `settle()` permissionless — should be documented |
| LOW-3 | base.ts | `updateFeeRecipient` allows no-op same-address update |
| LOW-4 | contract.ts | `rollOption` cancel event emits misleading `returnAmount` |
| LOW-5 | factory/contract.ts | Decimal params in `createPool` calldata ignored by pool |
| LOW-6 | bridge/contract.ts | No pubkey length validation in escrow script builder |

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

## Priority Remediation Order

1. **CRIT-1** — Consumed-output registry (highest fund-loss risk)
2. **CRIT-2** — Bitcoin pubkey registration (BTC pools non-functional without)
3. **CRIT-3** — Add `@nonReentrant` to all state-changing methods
4. **HIGH-6** — Clarify OPNet tx output model for exercise
5. **HIGH-5** — Reservation/expiry overlap check
6. **CRIT-4** — Per-token price cache + TWAP
7. **HIGH-1** — CEI reorder in `writeOptionBtc`
8. **HIGH-2** — Use stored CSV hash during exercise
9. **MED-1** — u64 overflow guards on `.lo1` casts
10. **MED-4** — Remove `@view` from `getBtcPrice`
