# Security Audit Checklist

## Pre-Deployment Checklist

This checklist must be completed before any mainnet deployment.

---

## 1. Arithmetic Safety

### SafeMath Usage

- [ ] ALL u256 additions use `SafeMath.add()`
- [ ] ALL u256 subtractions use `SafeMath.sub()`
- [ ] ALL u256 multiplications use `SafeMath.mul()`
- [ ] ALL u256 divisions use `SafeMath.div()`
- [ ] NO raw `+`, `-`, `*`, `/` on u256 values

**Example Violation**:
```typescript
// WRONG
const total = amount1 + amount2;

// CORRECT
const total = SafeMath.add(amount1, amount2);
```

### Type Safety

- [ ] No signed/unsigned confusion (i8 → u8)
- [ ] No truncation on downcasts (u256 → u64)
- [ ] sizeof<T>() matches actual sizes
- [ ] No division before multiplication (precision loss)

---

## 2. Reentrancy Protection

### NonReentrant Decorator

- [ ] All public/external methods have `@nonReentrant`
- [ ] State changes happen BEFORE external calls
- [ ] No untrusted external calls in internal methods

**Checks-Effects-Interactions Pattern**:
```typescript
@nonReentrant
public buyOption(calldata: Calldata): BytesWriter {
    // 1. CHECKS
    const option = this._options.get(optionId);
    if (option.status != OPEN) throw new Revert('Not open');
    
    // 2. EFFECTS (state changes)
    option.status = PURCHASED;
    option.buyer = Blockchain.msgSender;
    this._options.set(optionId, option);
    
    // 3. INTERACTIONS (external calls)
    this.transferToken(premiumToken, buyer, writer, premium);
    
    return new BytesWriter(0);
}
```

---

## 3. Access Control

### Owner-Only Functions

- [ ] `setFeeRecipient()` - onlyOwner
- [ ] `pause()` - onlyOwner
- [ ] `unpause()` - onlyOwner
- [ ] `upgrade()` - onlyOwner (with timelock)

### Role-Based Access

- [ ] `writeOption()` - any address
- [ ] `buyOption()` - any address (if option open)
- [ ] `exercise()` - buyer only
- [ ] `cancelOption()` - writer only

### Validation

```typescript
public exercise(calldata: Calldata): BytesWriter {
    const option = this._options.get(optionId);
    
    // Only buyer can exercise
    if (!Blockchain.msgSender.equals(option.buyer)) {
        throw new Revert('Not option buyer');
    }
    
    // ...
}
```

---

## 4. Time-Based Logic

### Block Height (CORRECT)

- [ ] All expiry checks use `Blockchain.block.number`
- [ ] All deadlines use block height, not timestamp
- [ ] Constants defined in blocks (144 = ~24 hours)

```typescript
// CORRECT
const expired = Blockchain.block.number >= option.expiryBlock;
```

### Timestamp (FORBIDDEN)

- [ ] NO use of `Blockchain.block.medianTimestamp` for logic
- [ ] Timestamp only for informational display

```typescript
// WRONG - timestamp manipulable by miners
const expired = Blockchain.block.medianTimestamp >= option.expiryTimestamp;
```

---

## 5. Storage Safety

### Pointer Allocation

- [ ] Each storage field has unique pointer
- [ ] Pointers allocated via `Blockchain.nextPointer`
- [ ] No pointer collisions

```typescript
class OptionsPool {
    private underlyingPointer: u16 = Blockchain.nextPointer;
    private premiumTokenPointer: u16 = Blockchain.nextPointer;
    private optionsPointer: u16 = Blockchain.nextPointer;
    // ...
}
```

### Deletion

- [ ] Deletions use 32-byte EMPTY_BUFFER
- [ ] `has()` returns false after deletion
- [ ] No stale data in deleted slots

```typescript
// Correct deletion
this._options.delete(optionId);  // Uses EMPTY_BUFFER internally
```

---

## 6. Serialization Consistency

### BytesWriter/BytesReader

- [ ] Write type matches read type
- [ ] `writeU16()` paired with `readU16()`, NOT `readU32()`
- [ ] `sizeof<T>()` correctly calculated

**Common Violations**:
```typescript
// WRONG: Type mismatch
writer.writeU16(value);
reader.readU32();  // Wrong!

// CORRECT
writer.writeU16(value);
reader.readU16();  // Correct
```

---

## 7. Bitcoin-Specific Security

### UTXO Verification (Phase 2)

- [ ] All outputs checked, not just first match
- [ ] Amount matches expected exactly
- [ ] Recipient address verified
- [ ] CSV lock verified on recipient

```typescript
private verifyBtcPayment(expected: Reservation): bool {
    const outputs = Blockchain.tx.outputs;
    
    for (let i = 0; i < outputs.length; i++) {
        if (outputs[i].value != expected.amount) continue;
        if (!this.hasCsvLock(outputs[i], expected.recipient, 6)) continue;
        return true;
    }
    
    return false;
}
```

### CSV Timelocks

- [ ] All BTC recipient addresses have CSV >= 6 blocks
- [ ] CSV enforced at Bitcoin script level
- [ ] No way to bypass CSV

### Reorg Protection

- [ ] Settlement waits for confirmations
- [ ] Graceful handling of reorg events
- [ ] User funds protected in reorg scenarios

---

## 8. Oracle Security (Phase 2)

### Price Freshness

- [ ] Price data age checked
- [ ] Revert if price too stale (> 6 blocks)
- [ ] Fallback for missing data

### Price Manipulation Resistance

- [ ] TWAP for large transactions
- [ ] Maximum price movement per block
- [ ] Circuit breakers on extreme moves

```typescript
const MAX_PRICE_AGE: u64 = 6;

private checkPriceFreshness(lastUpdate: u64): void {
    if (Blockchain.block.number - lastUpdate > MAX_PRICE_AGE) {
        throw new Revert('Price data stale');
    }
}
```

---

## 9. AMM-Specific Security (Phase 3)

### Pool Invariants

- [ ] `x * y = k` maintained after all operations
- [ ] LP tokens correctly calculated
- [ ] No rounding errors that break invariant

### Utilization Limits

- [ ] Maximum utilization <= 80%
- [ ] Options rejected when pool over-utilized
- [ ] Warning at high utilization

### Flash Loan Protection

- [ ] Options cannot exercise in same block as purchase
- [ ] No single-block arbitrage possible

```typescript
private checkExerciseDelay(option: Option): void {
    if (Blockchain.block.number <= option.purchaseBlock) {
        throw new Revert('Cannot exercise in same block');
    }
}
```

---

## 10. Event Emission

### Required Events

- [ ] `OptionWritten` emitted on write
- [ ] `OptionPurchased` emitted on buy
- [ ] `OptionExercised` emitted on exercise
- [ ] `OptionExpired` emitted on expiry
- [ ] `OptionCancelled` emitted on cancel
- [ ] `LiquidityAdded` emitted on LP deposit (Phase 3)
- [ ] `LiquidityRemoved` emitted on LP withdraw (Phase 3)

### Event Size

- [ ] All events <= 352 bytes (OPNet limit)
- [ ] No sensitive data in events

---

## 11. Gas Optimization

### Loop Safety

- [ ] No unbounded loops
- [ ] All loops have maximum iterations
- [ ] No `while (true)` patterns

### Storage Efficiency

- [ ] Use smallest sufficient types (u8, u64 vs u256)
- [ ] Pack related data into structs
- [ ] Minimize storage writes

---

## 12. Upgrade Safety

### Timelock

- [ ] Upgrades require 48-hour timelock
- [ ] Users can exit before upgrade
- [ ] No immediate upgrades possible

### Multisig

- [ ] Upgrades require 2/3 multisig
- [ ] Key holders are independent
- [ ] Recovery procedures documented

### Upgrade Pattern

```typescript
class OptionsPool extends Upgradeable {
    // Upgrade guarded by:
    // 1. 48-hour timelock
    // 2. 2/3 multisig approval
    // 3. No breaking changes to storage layout
}
```

---

## 13. Testing Requirements

### Unit Tests

- [ ] All public methods tested
- [ ] Edge cases covered
- [ ] Error conditions tested
- [ ] State transitions verified

### Integration Tests

- [ ] Full option lifecycle tested
- [ ] Multi-user scenarios tested
- [ ] Upgrade process tested

### Fuzzing

- [ ] Price inputs fuzzed
- [ ] Amount inputs fuzzed
- [ ] Block number inputs fuzzed

### Gas Profiling

- [ ] All methods profiled
- [ ] Gas limits documented
- [ ] No unbounded gas usage

---

## 14. Code Quality

### TypeScript Law Compliance

- [ ] No `any` types
- [ ] No non-null assertions (`!`)
- [ ] No `@ts-ignore`
- [ ] Explicit null checks
- [ ] Readonly where appropriate

### Documentation

- [ ] All public methods documented
- [ ] Complex logic explained
- [ ] Security assumptions documented

---

## Pre-Deployment Sign-Off

| Reviewer | Date | Status |
|----------|------|--------|
| Developer | | |
| Security Reviewer | | |
| Protocol Lead | | |

### Final Checks

- [ ] All checklist items verified
- [ ] Known issues documented
- [ ] Incident response plan ready
- [ ] Monitoring configured

---

## Disclaimer

This checklist does not guarantee security. Always engage professional auditors for contracts handling real value.

---

## Next Steps

- [Threat Model](../../docs/security/THREAT_MODEL.md)
- [CSV Timelocks](../../docs/security/CSV_TIMELOCKS.md)
