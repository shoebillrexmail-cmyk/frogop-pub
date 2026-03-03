# Threat Model

## Overview

This document identifies potential security threats and attack vectors for the FrogOp options protocol.

## Attack Surface

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FROGOP ATTACK SURFACE                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────────┐                                              │
│   │  Smart Contract │  ← Reentrancy, overflow, logic bugs          │
│   └────────┬────────┘                                              │
│            │                                                        │
│   ┌────────┴────────┐                                              │
│   │  Bitcoin Layer  │  ← UTXO manipulation, reorgs, pinning        │
│   └────────┬────────┘                                              │
│            │                                                        │
│   ┌────────┴────────┐                                              │
│   │  Oracle/External│  ← Price manipulation, staleness             │
│   └────────┬────────┘                                              │
│            │                                                        │
│   ┌────────┴────────┐                                              │
│   │   Frontend/User │  ← Phishing, wallet compromise               │
│   └─────────────────┘                                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Threat Categories

### 1. Smart Contract Vulnerabilities

#### 1.1 Reentrancy

**Threat**: Attacker re-enters contract before state update completes.

**Example Attack**:
```typescript
// VULNERABLE CODE
public buyOption(calldata: Calldata): BytesWriter {
    // Transfer tokens BEFORE state update
    this.transferToken(premium, buyer, writer, premium);  // External call
    
    // State update AFTER external call - VULNERABLE
    this._options.set(optionId, updatedOption);
}
```

**Mitigation**:
```typescript
// SECURE CODE
@nonReentrant
public buyOption(calldata: Calldata): BytesWriter {
    // State update FIRST
    this._options.set(optionId, updatedOption);
    
    // External calls LAST
    this.transferToken(premium, buyer, writer, premium);
}
```

**Severity**: CRITICAL

#### 1.2 Integer Overflow/Underflow

**Threat**: Arithmetic operations exceed type bounds.

**Vulnerable**:
```typescript
const total = amount1 + amount2;  // Can overflow
```

**Mitigation**:
```typescript
const total = SafeMath.add(amount1, amount2);  // Reverts on overflow
```

**Severity**: CRITICAL

#### 1.3 Access Control Bypass

**Threat**: Unauthorized users call restricted functions.

**Mitigation**:
```typescript
public cancelOption(calldata: Calldata): BytesWriter {
    const option = this._options.get(optionId);
    
    // Only writer can cancel
    if (!Blockchain.msgSender.equals(option.writer)) {
        throw new Revert('Not option writer');
    }
    
    // ...
}
```

**Severity**: HIGH

#### 1.4 Logic Errors

**Threat**: Incorrect ITM/OTM determination.

**Vulnerable**:
```typescript
// WRONG: Off-by-one error
if (currentPrice >= strikePrice) {  // Should be >
    // ITM for call
}
```

**Mitigation**:
```typescript
// CORRECT
if (currentPrice > strikePrice) {
    // ITM for call (price ABOVE strike)
}
```

**Severity**: HIGH

---

### 2. Bitcoin Layer Vulnerabilities

#### 2.1 UTXO Manipulation

**Threat**: Attacker creates fake UTXO that passes verification.

**Attack Vector**:
1. Attacker calls `executeOption` with crafted transaction
2. Transaction has output that LOOKS like valid BTC payment
3. But output is from different transaction or has wrong conditions

**Mitigation**:
```typescript
private verifyBtcPayment(expected: Reservation): bool {
    const outputs = Blockchain.tx.outputs;
    
    for (let i = 0; i < outputs.length; i++) {
        const output = outputs[i];
        
        // 1. Verify exact amount (no more, no less)
        if (output.value != expected.btcPremium) continue;
        
        // 2. Verify CSV lock on correct recipient
        if (!this.hasCsvLock(output, expected.writer, 6)) continue;
        
        // 3. Verify no additional outputs (dust attack)
        if (this.hasDustOutputs(outputs)) continue;
        
        return true;
    }
    
    return false;
}
```

**Severity**: CRITICAL

#### 2.2 Transaction Pinning

**Threat**: Attacker prevents transaction confirmation.

**Attack Vector**:
1. User reserves option
2. User sends BTC to writer
3. Attacker sees mempool, creates competing transaction
4. User's transaction gets stuck

**Mitigation**: CSV timelocks prevent immediate use of received BTC.

**Severity**: MEDIUM

#### 2.3 Chain Reorganization

**Threat**: Confirmed transaction gets reversed in reorg.

**Attack Vector**:
1. Buyer purchases option after N confirmations
2. Chain reorgs, transaction reversed
3. Option still exists but BTC payment gone

**Mitigation**:
```typescript
// Wait for extra confirmations before settling
const REQUIRED_CONFIRMATIONS: u64 = 6;

private canSettle(option: Option): bool {
    return Blockchain.block.number >= option.expiryBlock + REQUIRED_CONFIRMATIONS;
}
```

**Severity**: HIGH

---

### 3. Oracle/External Vulnerabilities

#### 3.1 Price Manipulation

**Threat**: Attacker manipulates NativeSwap price to affect option pricing.

**Attack Vector**:
1. Attacker sees pending option reservation
2. Executes large swap on NativeSwap to move price
3. Option priced at manipulated rate

**Mitigation**:
```typescript
// Use time-weighted average price (TWAP)
private getTwapPrice(token: Address): u256 {
    const blocks = 144;  // 24 hours
    let sum: u256 = u256.Zero;
    
    for (let i = 0; i < blocks; i++) {
        const price = this.getPriceAtBlock(token, Blockchain.block.number - i);
        sum = SafeMath.add(sum, price);
    }
    
    return SafeMath.div(sum, u256.fromU64(blocks));
}
```

**Severity**: HIGH

#### 3.2 Stale Price Data

**Threat**: Using outdated price information.

**Mitigation**:
```typescript
const MAX_PRICE_AGE: u64 = 6;  // 6 blocks

private checkPriceFreshness(lastUpdate: u64): void {
    if (Blockchain.block.number - lastUpdate > MAX_PRICE_AGE) {
        throw new Revert('Price data too stale');
    }
}
```

**Severity**: MEDIUM

---

### 4. Economic Vulnerabilities

#### 4.1 Front-Running

**Threat**: Attacker sees pending transaction, executes first for profit.

**Attack Vector**:
1. User submits buyOption transaction
2. Attacker sees in mempool
3. Attacker submits same transaction with higher fee
4. Attacker gets the option

**Mitigation**:
```typescript
// Reservation system locks price
// User reserves first, then confirms BTC payment
// Front-running reservation doesn't help attacker
```

**Severity**: MEDIUM

#### 4.2 Flash Loan Attack

**Threat**: Borrow funds, manipulate price, profit, repay in same block.

**Attack Vector**:
1. Borrow large amount on lending protocol
2. Buy options at manipulated price
3. Immediately exercise (if ITM after manipulation)
4. Repay loan

**Mitigation**:
```typescript
// 1. Options cannot be exercised in same block as purchase
private checkExerciseDelay(option: Option): void {
    if (Blockchain.block.number <= option.purchaseBlock) {
        throw new Revert('Cannot exercise in same block');
    }
}

// 2. CSV timelocks on BTC payouts (Phase 2)
// 3. Pool utilization limits (Phase 3)
```

**Severity**: HIGH

#### 4.3 Impermanent Loss Exploitation

**Threat**: LPs suffer losses from price movement without compensation.

**Mitigation**: Trading fees and option premiums compensate LPs.

**Severity**: LOW (user risk, not protocol)

---

### 5. Denial of Service

#### 5.1 Griefing

**Threat**: Attacker creates many options to consume resources.

**Mitigation**:
```typescript
// Minimum option size
const MIN_OPTION_SIZE: u256 = u256.fromU64(1_00000000);  // 1 token

// Maximum options per user per block
const MAX_OPTIONS_PER_BLOCK: u64 = 5;

private checkRateLimit(): void {
    const count = this._userOptionCount.get(Blockchain.msgSender);
    if (count >= MAX_OPTIONS_PER_BLOCK) {
        throw new Revert('Rate limit exceeded');
    }
}
```

**Severity**: LOW

#### 5.2 Pool Drain

**Threat**: Attacker exercises all ITM options, draining pool.

**Mitigation**:
```typescript
const MAX_UTILIZATION: u64 = 8000;  // 80%

private checkUtilization(): void {
    const utilization = this.calculateUtilization();
    if (utilization > MAX_UTILIZATION) {
        throw new Revert('Pool over-utilized');
    }
}
```

**Severity**: MEDIUM

---

## Threat Summary Matrix

| Threat | Severity | Likelihood | Impact | Mitigation Status |
|--------|----------|------------|--------|-------------------|
| Reentrancy | CRITICAL | Low | Critical | SafeMath, @nonReentrant |
| Integer Overflow | CRITICAL | Low | Critical | SafeMath |
| UTXO Manipulation | CRITICAL | Medium | Critical | Verification logic |
| Chain Reorg | HIGH | Medium | High | Confirmation delays |
| Price Manipulation | HIGH | Medium | High | TWAP, freshness checks |
| Flash Loan | HIGH | Medium | High | Block delay, CSV |
| Front-Running | MEDIUM | High | Medium | Reservation system |
| DoS/Griefing | LOW | High | Low | Rate limits, min size |

## Security Checklist

- [ ] All u256 operations use SafeMath
- [ ] All state-changing methods use @nonReentrant
- [ ] All time logic uses Blockchain.block.number (NOT medianTimestamp)
- [ ] UTXO verification checks all outputs
- [ ] CSV timelocks >= 6 blocks
- [ ] Price data freshness validated
- [ ] Rate limits on option creation
- [ ] Utilization caps on AMM pools
- [ ] Access control on admin functions
- [ ] Events emitted for all state changes

## Incident Response

### Detection
- Monitor for unusual option volume
- Alert on large exercises
- Track pool utilization spikes

### Response
1. Pause contract if critical vulnerability found
2. Analyze affected transactions
3. Notify users
4. Deploy fix via upgrade mechanism

### Recovery
- Upgradeable contract allows patch deployment
- 48-hour timelock on upgrades
- 2/3 multisig required

## Next Steps

- [Audit Checklist](../../internal/security/AUDIT_CHECKLIST.md)
- [CSV Timelocks](./CSV_TIMELOCKS.md)
- [Architecture](../ARCHITECTURE.md)
