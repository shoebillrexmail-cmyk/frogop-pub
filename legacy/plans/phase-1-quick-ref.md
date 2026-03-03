# Phase 1: Quick Reference

## Pricing Model: Writer-Specified, No On-Chain Formula

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PHASE 1 PRICING                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   On-Chain (Contract):                                             │
│   ├── Writer specifies premium when creating option               │
│   ├── Buyer accepts or ignores                                    │
│   └── NO formula, NO oracle, NO on-chain calculation              │
│                                                                     │
│   Off-Chain (Frontend Helper):                                     │
│   ├── Shows suggested premium based on market data                │
│   ├── User can follow or ignore suggestion                        │
│   └── Market competition discovers "fair" price                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Participant Flows

### Writer Creates Option

```
1. Writer holds MOTO (for call) or PILL (for put)
2. Writer calls writeOption(type, strike, expiry, amount, premium)
3. Contract locks collateral
4. Option appears in market with specified premium
5. Writer waits for buyer OR cancels
```

### Buyer Purchases Option

```
1. Buyer browses open options
2. Buyer finds attractive option (good strike, expiry, premium)
3. Buyer calls buyOption(optionId)
4. Contract transfers premium from buyer to writer
5. Buyer waits for expiry
```

### At Expiry

```
Buyer checks price on MotoSwap/DEX:
├── If exercise is profitable → call exercise()
├── If exercise is not profitable → do nothing
└── After grace period → anyone can settle (collateral returns to writer)
```

---

## Collateral Requirements

| Option Type | Writer Locks | Example (100 MOTO @ 50 strike) |
|-------------|--------------|-------------------------------|
| Call | underlying amount | 100 MOTO |
| Put | strike × amount | 5000 PILL (50 × 100) |

**Payouts are ALWAYS possible** because collateral is locked before option is sold.

---

## Key Guarantees

1. **No Counterparty Risk**: Collateral locked in contract
2. **No Oracle Risk**: Buyer decides based on off-chain prices
3. **No Pricing Manipulation**: Writer sets, buyer accepts
4. **Always Solvent**: 100% collateralization

---

## Use Cases

### For Hedgers

| Position | Hedge With | Example |
|----------|------------|---------|
| Long MOTO | Buy Put | Protect against price drop |
| Short MOTO | Buy Call | Protect against price spike |

### For Yield Seekers

| Position | Action | Income |
|----------|--------|--------|
| Holding MOTO | Write Calls | Earn premium |
| Holding PILL | Write Puts | Earn premium |

### For Speculators

| View | Action | Risk |
|------|--------|------|
| Bullish on MOTO | Buy Call | Limited to premium |
| Bearish on MOTO | Buy Put | Limited to premium |

---

## Contract Parameters

```typescript
const GRACE_PERIOD_BLOCKS: u64 = 144;   // ~24 hours to exercise
const MAX_EXPIRY_BLOCKS: u64 = 52560;   // ~1 year
const MIN_EXPIRY_BLOCKS: u64 = 6;       // ~1 hour
const CANCEL_FEE_BPS: u64 = 100;        // 1% fee on cancel
```

---

## No Black-Scholes On-Chain

**Why?**
- Requires oracle (manipulation risk)
- Complex math (gas costs)
- May not match market reality

**Instead:**
- Writer specifies premium
- Market discovers fair price
- Frontend can show suggestions (off-chain)
- Competition between writers drives efficiency

---

## Files Reference

| Document | Purpose |
|----------|---------|
| [PHASE_1_MVP.md](./PHASE_1_MVP.md) | Scope and milestones |
| [PHASE_1_TECHNICAL_SPEC.md](./PHASE_1_TECHNICAL_SPEC.md) | Implementation details |
| [ECONOMIC_MODEL.md](./ECONOMIC_MODEL.md) | Incentives and use cases |
| [PRICING_CALCULATIONS.md](./PRICING_CALCULATIONS.md) | Math formulas |
