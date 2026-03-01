# Option Pricing & Calculations

## Document Purpose

This document defines all mathematical calculations for the FrogOp options protocol with emphasis on:
1. Gas efficiency (minimal on-chain computation)
2. Security (overflow/underflow protection)
3. Precision (handling token decimals correctly)

---

## 1. Core Constants

```typescript
// Time constants (in blocks)
const BLOCKS_PER_HOUR: u64 = 6;          // ~10 min per block
const BLOCKS_PER_DAY: u64 = 144;         // 24 hours
const BLOCKS_PER_WEEK: u64 = 1008;       // 7 days
const BLOCKS_PER_MONTH: u64 = 4320;      // 30 days
const BLOCKS_PER_YEAR: u64 = 52560;      // 365 days

// Option parameters
const MAX_EXPIRY_BLOCKS: u64 = 52560;    // 1 year maximum
const MIN_EXPIRY_BLOCKS: u64 = 6;        // 1 hour minimum
const GRACE_PERIOD_BLOCKS: u64 = 144;    // 24 hour exercise window

// Fee constants (in basis points)
const CANCEL_FEE_BPS: u64 = 100;         // 1% cancellation fee
const BPS_DENOMINATOR: u64 = 10000;      // Basis point denominator

// Precision
const ONE_TOKEN: u256 = u256.fromU64(100000000);  // 1e8 for 8 decimal tokens
```

---

## 2. Collateral Calculations

### Call Option Collateral

```
Writer locks: underlyingAmount of underlying token

Example:
├── underlyingAmount = 100 MOTO (100 * 1e8 = 10,000,000,000 base units)
├── strikePrice = 50 PILL/MOTO (50 * 1e8 = 5,000,000,000 base units)
└── Collateral = 10,000,000,000 base units of MOTO
```

```typescript
function callCollateral(underlyingAmount: u256): u256 {
    // No calculation needed - just the underlying amount
    return underlyingAmount;
}
```

### Put Option Collateral

```
Writer locks: strikePrice * underlyingAmount of premium token

Example:
├── underlyingAmount = 100 MOTO
├── strikePrice = 50 PILL/MOTO
└── Collateral = 50 * 100 = 5,000 PILL (5,000 * 1e8 = 500,000,000,000 base units)
```

```typescript
function putCollateral(strikePrice: u256, underlyingAmount: u256): u256 {
    // MUST use SafeMath for all u256 multiplication
    return SafeMath.mul(strikePrice, underlyingAmount);
}
```

---

## 3. Strike Value Calculation

The strike value is the amount the buyer pays (call) or receives (put) on exercise.

### Formula

```
strikeValue = strikePrice × underlyingAmount
```

### Implementation

```typescript
function calculateStrikeValue(strikePrice: u256, underlyingAmount: u256): u256 {
    return SafeMath.mul(strikePrice, underlyingAmount);
}
```

### Example

```
strikePrice = 50 PILL/MOTO (50 * 1e8)
underlyingAmount = 100 MOTO (100 * 1e8)

strikeValue = 50 * 1e8 * 100 * 1e8 / 1e8  // Decimals cancel
            = 5000 * 1e8
            = 5000 PILL
```

**Note**: The decimals work out because:
- strikePrice is expressed as "premium tokens per underlying token"
- underlyingAmount is in underlying tokens
- Result is in premium tokens

---

## 4. Cancellation Fee

### Formula

```
fee = collateralAmount × CANCEL_FEE_BPS / BPS_DENOMINATOR
returnAmount = collateralAmount - fee
```

### Implementation

```typescript
function calculateCancellationFee(collateralAmount: u256): u256 {
    // fee = collateral * 100 / 10000 = 1%
    return SafeMath.div(
        SafeMath.mul(collateralAmount, u256.fromU64(CANCEL_FEE_BPS)),
        u256.fromU64(BPS_DENOMINATOR)
    );
}

function calculateReturnAmount(collateralAmount: u256): u256 {
    const fee = this.calculateCancellationFee(collateralAmount);
    return SafeMath.sub(collateralAmount, fee);
}
```

### Example

```
collateralAmount = 100 MOTO = 10,000,000,000 base units

fee = 10,000,000,000 * 100 / 10000
    = 100,000,000 base units (1 MOTO)

returnAmount = 10,000,000,000 - 100,000,000
             = 9,900,000,000 base units (99 MOTO)
```

---

## 5. Time Calculations

### Blocks Until Expiry

```typescript
function blocksUntilExpiry(expiryBlock: u64): u64 {
    const currentBlock = Blockchain.block.number;
    
    // Must check for underflow
    if (expiryBlock <= currentBlock) {
        return 0;  // Already expired
    }
    
    return expiryBlock - currentBlock;
}
```

### Time to Expiry (as fraction of year)

For off-chain premium suggestions:

```typescript
function timeToExpiryYears(expiryBlock: u64): f64 {
    const blocks = this.blocksUntilExpiry(expiryBlock);
    return f64(blocks) / f64(BLOCKS_PER_YEAR);
}
```

### Is In Exercise Window

```typescript
function isInExerciseWindow(option: Option): bool {
    const currentBlock = Blockchain.block.number;
    
    // After expiry, before grace period ends
    return currentBlock >= option.expiryBlock && 
           currentBlock < option.expiryBlock + GRACE_PERIOD_BLOCKS;
}
```

### Is Grace Period Over

```typescript
function isGracePeriodOver(option: Option): bool {
    const currentBlock = Blockchain.block.number;
    return currentBlock >= option.expiryBlock + GRACE_PERIOD_BLOCKS;
}
```

---

## 6. Premium Suggestion Formula (Off-Chain)

This is computed OFF-CHAIN by the frontend. The contract does NOT use this.

### Black-Scholes Inspired Model

```
premium = intrinsicValue + timeValue

Where:
├── intrinsicValue = max(0, |spotPrice - strikePrice|)  [for ITM options]
└── timeValue = spotPrice × σ × sqrt(T) × sqrt(2/π)
                └── σ = implied volatility
                └── T = time to expiry in years
```

### Simplified Formula

For simplicity and gas efficiency, we use a square-root time decay:

```typescript
// OFF-CHAIN only - for frontend suggestion
function suggestPremium(
    spotPrice: bigint,        // Current market price
    strikePrice: bigint,      // Option strike
    blocksToExpiry: bigint,   // Blocks until expiry
    amount: bigint,           // Underlying amount
    optionType: 0 | 1,        // Call or Put
    volatility: number        // Implied volatility (e.g., 0.20 = 20%)
): bigint {
    // 1. Time value
    const timeInYears = Number(blocksToExpiry) / 52560;
    const timeValue = Math.sqrt(timeInYears) * volatility * Number(spotPrice);
    
    // 2. Intrinsic value
    let intrinsic = 0n;
    if (optionType === 0) {  // Call
        if (spotPrice > strikePrice) {
            intrinsic = spotPrice - strikePrice;
        }
    } else {  // Put
        if (spotPrice < strikePrice) {
            intrinsic = strikePrice - spotPrice;
        }
    }
    
    // 3. Premium per unit
    const premiumPerUnit = intrinsic + BigInt(Math.floor(timeValue));
    
    // 4. Total premium (scale by amount, accounting for decimals)
    // Assuming 8 decimal tokens
    return (premiumPerUnit * amount) / 100000000n;
}
```

### Example Calculation

```
Inputs:
├── spotPrice = 55 PILL/MOTO
├── strikePrice = 50 PILL/MOTO
├── blocksToExpiry = 144 (1 day)
├── amount = 100 MOTO
├── optionType = Call
└── volatility = 0.20 (20%)

Calculation:
├── timeInYears = 144 / 52560 = 0.00274
├── timeValue = sqrt(0.00274) × 0.20 × 55 = 0.0523 × 0.20 × 55 = 0.575 PILL
├── intrinsic = 55 - 50 = 5 PILL
├── premiumPerUnit = 5 + 0.575 = 5.575 PILL
└── totalPremium = 5.575 × 100 = 557.5 PILL

Suggested Premium: ~558 PILL
```

---

## 7. Profit/Loss Calculations (Off-Chain)

### For Display Purposes Only

```typescript
// Call Option P/L at Exercise
function callProfitLoss(
    strikePrice: bigint,
    premium: bigint,
    amount: bigint,
    marketPrice: bigint  // Price at exercise
): bigint {
    // Cost = (strike * amount) + premium
    const cost = strikePrice * amount / ONE_TOKEN + premium;
    
    // Value received = market * amount
    const value = marketPrice * amount / ONE_TOKEN;
    
    // P/L = value - cost
    return value - cost;
}

// Put Option P/L at Exercise
function putProfitLoss(
    strikePrice: bigint,
    premium: bigint,
    amount: bigint,
    marketPrice: bigint
): bigint {
    // Value received = strike * amount
    const received = strikePrice * amount / ONE_TOKEN;
    
    // Cost = market * amount + premium
    const cost = marketPrice * amount / ONE_TOKEN + premium;
    
    // P/L = received - cost
    return received - cost;
}
```

### Break-Even Points

```typescript
// Call Break-Even
function callBreakEven(strikePrice: bigint, premiumPerUnit: bigint): bigint {
    return strikePrice + premiumPerUnit;
}

// Put Break-Even
function putBreakEven(strikePrice: bigint, premiumPerUnit: bigint): bigint {
    return strikePrice - premiumPerUnit;
}
```

---

## 8. Integer Square Root

For time value calculations (off-chain only, or for AMM Phase 3):

### Babylonian Method

```typescript
// Integer square root using Babylonian method
// Only needed for Phase 3 AMM, included here for reference
function sqrt(value: u256): u256 {
    if (value == u256.Zero) return u256.Zero;
    
    let x: u256 = value;
    let y: u256 = SafeMath.add(SafeMath.div(value, u256.fromU64(2)), u256.One);
    
    // Iterate until convergence
    while (y < x) {
        x = y;
        y = SafeMath.div(
            SafeMath.add(SafeMath.div(value, y), y),
            u256.fromU64(2)
        );
    }
    
    return x;
}
```

---

## 9. Decimal Handling

### Token Decimals

OP20 tokens typically have 8 decimals (like Bitcoin).

```
1 MOTO = 1 * 10^8 base units = 100,000,000
50 PILL = 50 * 10^8 base units = 5,000,000,000
```

### Strike Price Representation

Strike price is expressed as "premium tokens per underlying token":

```
strikePrice = 50 * 10^8 = 5,000,000,000

Meaning: 1 MOTO costs 50 PILL
```

### Cross-Token Calculations

When multiplying strike by amount:

```
strikePrice = 50 PILL/MOTO = 5,000,000,000 (8 decimals)
underlyingAmount = 100 MOTO = 10,000,000,000 (8 decimals)

strikeValue = strikePrice × underlyingAmount / 10^8
            = 5,000,000,000 × 10,000,000,000 / 100,000,000
            = 500,000,000,000 (5000 PILL in 8 decimals)

Note: We divide by 10^8 because strikePrice already has 8 decimals built in
```

**Simplified**: If all tokens have 8 decimals, no division needed:
```
The decimal representation handles it:
├── strikePrice = 50 tokens worth = 50 * 10^8
├── underlyingAmount = 100 tokens = 100 * 10^8
└── Result = 5000 tokens worth = 5000 * 10^8

The multiplication "50 * 100" gives "5000" in the right magnitude.
```

---

## 10. Validation Calculations

### Strike Validation

```typescript
function validateStrike(strikePrice: u256): bool {
    return strikePrice > u256.Zero;
}
```

### Expiry Validation

```typescript
function validateExpiry(expiryBlock: u64): bool {
    const currentBlock = Blockchain.block.number;
    
    // Must be in future
    if (expiryBlock <= currentBlock) return false;
    
    // Must not be too far in future
    if (expiryBlock > currentBlock + MAX_EXPIRY_BLOCKS) return false;
    
    return true;
}
```

### Amount Validation

```typescript
function validateAmount(amount: u256, minAmount: u256): bool {
    return amount >= minAmount;
}
```

---

## 11. Summary Table

| Calculation | Formula | Units | Where Used |
|-------------|---------|-------|------------|
| Call Collateral | `underlyingAmount` | underlying tokens | writeOption |
| Put Collateral | `strikePrice × amount` | premium tokens | writeOption |
| Strike Value | `strikePrice × amount` | premium tokens | exercise |
| Cancel Fee | `collateral × 100 / 10000` | same as collateral | cancelOption |
| Time to Expiry | `expiryBlock - currentBlock` | blocks | validation |
| Premium (off-chain) | `intrinsic + timeValue` | premium tokens | frontend |

---

## Next Steps

- [Phase 1 Technical Spec](./PHASE_1_TECHNICAL_SPEC.md)
- [OptionsPool Contract](../../docs/contracts/OptionsPool.md)
