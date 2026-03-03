# Phase 3: AMM Liquidity Pools

## Overview

Phase 3 adds automated market maker (AMM) functionality for options trading. Users can provide liquidity and earn fees, while options are priced and settled using pool reserves.

**Status**: Future

**Timeline**: 8-10 weeks

**Prerequisite**: Phase 2 complete

---

## Scope

### Included

- ✅ AMM liquidity pools
- ✅ LP token management
- ✅ Pool-based option pricing
- ✅ Covered call pools
- ✅ Cash-secured put pools
- ✅ Trading fees
- ✅ LP rewards

### Excluded

- ❌ Leverage/margin trading
- ❌ Partial collateralization
- ❌ Complex derivatives

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PHASE 3 ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │                   OptionsFactory.wasm                        │  │
│   │                                                              │  │
│   │   createPool(underlying, premiumToken) → AMMPool            │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              │ deploys                              │
│                              ▼                                      │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │                     AMMPool.wasm                             │  │
│   │                                                              │  │
│   │   extends OptionsPool + AMM functionality                    │  │
│   │                                                              │  │
│   │   ┌─────────────────────┬─────────────────────┐            │  │
│   │   │   Underlying Reserve│   Premium Reserve   │            │  │
│   │   │      (MOTO)         │       (PILL)        │            │  │
│   │   │      10,000         │      500,000        │            │  │
│   │   └─────────────────────┴─────────────────────┘            │  │
│   │                     x * y = k                               │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│         ┌────────────────────┼────────────────────┐               │
│         ▼                    ▼                    ▼                │
│   ┌──────────┐         ┌──────────┐         ┌──────────┐         │
│   │  Writer  │         │  Buyer   │         │    LP    │         │
│   │          │         │          │         │          │         │
│   │ Provides │         │   Pays   │         │ Provides │         │
│   │ collateral│        │ premium  │         │ liquidity│         │
│   └──────────┘         └──────────┘         └──────────┘         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Pool Types

### Covered Call Pool

```
┌─────────────────────────────────────────────────────────────────┐
│                    COVERED CALL POOL                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Writers deposit:     Underlying tokens (MOTO)                │
│   Buyers pay:          Premium tokens (PILL)                   │
│   Strike expressed as: PILL per MOTO                           │
│                                                                 │
│   Writer deposits 100 MOTO:                                    │
│   ├── Receives right to write calls                           │
│   ├── Earns premium when options sold                         │
│   └── Risk: Assignment if ITM (MOTO sold to buyer)            │
│                                                                 │
│   Buyer pays 5 PILL for call @ 50 strike:                      │
│   ├── Right to buy 1 MOTO at 50 PILL                          │
│   └── Profit if MOTO > 55 PILL at expiry                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Cash-Secured Put Pool

```
┌─────────────────────────────────────────────────────────────────┐
│                  CASH-SECURED PUT POOL                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Writers deposit:     Premium tokens (PILL)                   │
│   Buyers pay:          Premium tokens (PILL)                   │
│   Strike expressed as: PILL per MOTO                           │
│                                                                 │
│   Writer deposits 500 PILL (strike * amount):                  │
│   ├── Right to write puts @ 50 strike                         │
│   ├── Earns premium when options sold                         │
│   └── Risk: Assignment if ITM (must buy MOTO at 50)           │
│                                                                 │
│   Buyer pays 3 PILL for put @ 40 strike:                       │
│   ├── Right to sell 1 MOTO at 40 PILL                         │
│   └── Profit if MOTO < 37 PILL at expiry                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## AMM Mechanics

### Constant Product Formula

```
x * y = k

Where:
├── x = underlying reserve (MOTO)
├── y = premium reserve (PILL)
└── k = constant (invariant)

Spot price = y / x
```

### LP Token Calculation

```typescript
// First LP (sets initial ratio)
lpTokens = sqrt(underlyingAmount * premiumAmount) * 1000

// Subsequent LPs (must match ratio)
lpTokens = (underlyingAmount * totalSupply) / underlyingReserve
```

### Pool-Based Pricing

```typescript
function calculatePremium(
    optionType: u8,
    strike: u256,
    expiryBlock: u64,
    amount: u256
): u256 {
    // Get spot price from reserves
    const spotPrice = this.getSpotPrice();
    
    // Moneyness
    const itm = optionType === CALL
        ? spotPrice > strike
        : spotPrice < strike;
    
    // Time value
    const blocksRemaining = expiryBlock - Blockchain.block.number;
    const timeValue = sqrt(blocksRemaining);
    
    // Implied volatility from utilization
    const iv = this.getImpliedVolatility();
    
    // Premium
    let premium: u256;
    if (itm) {
        const intrinsic = abs(spotPrice - strike);
        premium = intrinsic + (timeValue * iv / 10000);
    } else {
        premium = timeValue * iv / 10000;
    }
    
    return premium * amount;
}
```

---

## Fee Structure

| Fee Type | Rate | Destination |
|----------|------|-------------|
| Trading fee | 30 bps (0.3%) | Pool (LPs) |
| Option premium | 200 bps (2%) | Pool (LPs) |
| Protocol fee | 30 bps (0.3%) | Fee recipient |
| Withdrawal | 0 bps | - |

### Fee Distribution

```typescript
// Trading fees stay in pool (increase k)
// This increases LP token value over time

// Protocol fees accumulated separately
this._protocolFees.set(
    this._protocolFees.get() + protocolFee
);

// Distributed to fee recipient on call
public collectProtocolFees(): void {
    const fees = this._protocolFees.get();
    this.transfer(this.feeRecipient, fees);
    this._protocolFees.set(0);
}
```

---

## LP Rewards

### Sources

```
LP Earnings:
├── Trading fees (0.3%) - automatic via pool growth
├── Option premiums (2%) - from option buyers
├── Unexercised options - OTM options expire in pool's favor
└── Assignment spreads - ITM exercise at strike
```

### APR Calculation

```typescript
function calculateAPR(pool: AMMPool): number {
    const tvl = calculateTotalValueLocked(pool);
    const dailyFees = pool.getFees24h();
    const yearlyFees = dailyFees * 365;
    const apr = (yearlyFees / tvl) * 100;
    return apr;
}
```

### Impermanent Loss

```typescript
function calculateIL(priceRatio: u256): u256 {
    // IL = 2 * sqrt(ratio) / (1 + ratio) - 1
    const sqrt = this.sqrt(priceRatio);
    const numerator = 2 * sqrt;
    const denominator = 1 + priceRatio;
    
    const value = numerator / denominator;
    return 1 - value;  // Negative = loss
}
```

---

## Security Considerations

### Pool Invariants

```typescript
// CRITICAL: Maintain x * y = k
private checkInvariant(): void {
    const x = this._underlyingReserve.get();
    const y = this._premiumReserve.get();
    const k = this._k.get();
    
    if (SafeMath.mul(x, y) != k) {
        throw new Revert('Invariant violation');
    }
}
```

### Utilization Limits

```typescript
const MAX_UTILIZATION: u64 = 8000;  // 80%

private checkUtilization(): void {
    const utilization = this.calculateUtilization();
    if (utilization > MAX_UTILIZATION) {
        throw new Revert('Pool over-utilized');
    }
}
```

### Flash Loan Protection

```typescript
private checkExerciseDelay(option: Option): void {
    const blocksSincePurchase = Blockchain.block.number - option.purchaseBlock;
    if (blocksSincePurchase < 1) {
        throw new Revert('Cannot exercise in same block');
    }
}
```

---

## Milestones

### Week 1-2: AMM Core

- [ ] AMMPool contract structure
- [ ] LP token implementation
- [ ] Reserve management
- [ ] Constant product math
- [ ] Unit tests

### Week 3-4: Liquidity Management

- [ ] addLiquidity() implementation
- [ ] removeLiquidity() implementation
- [ ] LP token transfers
- [ ] Fee collection
- [ ] Integration tests

### Week 5-6: Pool-Based Options

- [ ] Pool collateral for options
- [ ] AMM-based pricing
- [ ] Exercise against pool
- [ ] Settlement logic
- [ ] Full lifecycle tests

### Week 7-8: Security & Optimization

- [ ] Invariant verification
- [ ] Utilization limits
- [ ] Flash loan protection
- [ ] Gas optimization
- [ ] Security audit

### Week 9-10: Testing & Deployment

- [ ] End-to-end tests
- [ ] Fuzzing
- [ ] Documentation
- [ ] Deployment to regtest

---

## Dependencies

### Existing

- Phase 1 contracts
- Phase 2 contracts (optional)
- OPNet runtime

### New

```json
{
  "AMMPool.wasm": "Extends OptionsPool"
}
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Impermanent loss | High | Medium | LP education, fee compensation |
| Pool drain | Medium | High | Utilization limits |
| Flash loan attack | Medium | High | Block delays, CSV |
| Oracle failure | Low | High | Pool-based pricing (no oracle) |

---

## Success Criteria

Phase 3 is complete when:

1. ✅ Users can add/remove liquidity
2. ✅ Options priced from pool reserves
3. ✅ LPs earn fees and premiums
4. ✅ Pool invariants maintained
5. ✅ Utilization limits enforced
6. ✅ Flash loan protection active
7. ✅ All security tests pass
8. ✅ Test coverage > 90%
9. ✅ Deployed to regtest

---

## Future Considerations

### Phase 4+ Possibilities

- Leverage/margin trading
- Cross-pool arbitrage
- Options on options
- Perpetual options
- Dynamic volatility curves

---

## Next Steps

- [Phase 1: MVP](./PHASE_1_MVP.md)
- [Phase 2: NativeSwap](./PHASE_2_NATIVE.md)
- [AMMPool Contract](../../docs/contracts/AMMPool.md)
- [Mode 2: AMM Details](../../docs/modes/mode-2-amm.md)
