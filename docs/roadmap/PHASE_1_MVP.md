# Phase 1: MVP - Core Options

## Overview

Phase 1 delivers the minimum viable product: peer-to-peer options trading with OP20 tokens only. No BTC, no AMM - just the core option mechanics.

**Status**: Planning

**Timeline**: 4-6 weeks

---

## Scope

### Included

- ✅ Call Options (buy underlying at strike)
- ✅ Put Options (sell underlying at strike)
- ✅ Token-pair strikes (PILL per MOTO)
- ✅ 100% collateralization
- ✅ Block-height expiry
- ✅ Permissionless pool creation
- ✅ Option lifecycle management

### Excluded (Future Phases)

- ❌ BTC premiums (Phase 2)
- ❌ BTC strikes (Phase 2)
- ❌ NativeSwap integration (Phase 2)
- ❌ AMM liquidity pools (Phase 3)
- ❌ LP rewards (Phase 3)
- ❌ Partial collateral/leverage

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PHASE 1 ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │                   OptionsFactory.wasm                        │  │
│   │                                                              │  │
│   │   createPool(underlying, premiumToken) → poolAddress        │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              │ deploys                              │
│                              ▼                                      │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │                    OptionsPool.wasm                          │  │
│   │                                                              │  │
│   │   writeOption(type, strike, expiry, amount) → optionId     │  │
│   │   buyOption(optionId) → success                             │  │
│   │   exercise(optionId) → success                              │  │
│   │   cancelOption(optionId) → success                          │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   Collateral: 100% OP20 tokens                                     │
│   Premium: OP20 tokens                                             │
│   Strike: Token pair ratio                                         │
│   Expiry: Block height                                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Contracts

### 1. OptionsFactory

Permissionless pool creation.

**Key Methods**:
- `createPool(underlying, premiumToken)` → poolAddress
- `getPool(underlying, premiumToken)` → poolAddress
- `allPools(index)` → poolAddress
- `poolCount()` → count

**Storage**:
- Pool registry (underlying → premium → address)
- Pool list (array of all pools)

### 2. OptionsPool

Individual option market.

**Key Methods**:
- `writeOption(type, strike, expiry, amount)` → optionId
- `buyOption(optionId)` → success
- `exercise(optionId)` → success
- `cancelOption(optionId)` → success
- `getOption(optionId)` → Option struct

**Storage**:
- Options map (id → Option)
- Writer options (writer → [optionIds])
- Buyer options (buyer → [optionIds])

---

## Data Structures

### Option Struct

```typescript
struct Option {
    id: u256,
    writer: Address,
    buyer: Address,
    optionType: u8,           // 0=Call, 1=Put
    strikePrice: u256,        // Premium tokens per underlying
    underlyingAmount: u256,
    premium: u256,
    expiryBlock: u64,
    createdBlock: u64,
    status: u8,               // 0=Open, 1=Purchased, 2=Exercised, 3=Expired, 4=Cancelled
}
```

### OptionStatus Enum

```typescript
enum OptionStatus: u8 {
    OPEN = 0,
    PURCHASED = 1,
    EXERCISED = 2,
    EXPIRED = 3,
    CANCELLED = 4,
}
```

---

## User Flows

### Writer Flow

```
1. Select pool (e.g., MOTO/PILL)
2. Call writeOption():
   ├── Option type: Call
   ├── Strike: 50 PILL per MOTO
   ├── Expiry: Block 864,000 (144 blocks from now)
   └── Amount: 100 MOTO
3. Approve MOTO transfer
4. Contract locks 100 MOTO collateral
5. Receive optionId
6. Wait for buyer (or cancel)
```

### Buyer Flow

```
1. Browse open options
2. Find attractive option
3. Call buyOption(optionId):
   └── Pay premium (e.g., 200 PILL)
4. Approve PILL transfer
5. Contract transfers premium to writer
6. Option marked as PURCHASED
7. Wait until expiry
8. If ITM: Call exercise()
   └── Receive 100 MOTO for 5000 PILL (strike * amount)
```

### Settlement

```
At expiry block:
├── Option status = PURCHASED
├── Check if ITM or OTM
│
├── ITM (Call: price > strike):
│   ├── Buyer calls exercise()
│   ├── Buyer pays strike * amount (PILL)
│   ├── Buyer receives underlyingAmount (MOTO)
│   └── Writer keeps premium + strike payment
│
└── OTM (Call: price <= strike):
    ├── Option expires worthless
    ├── Writer keeps collateral (MOTO)
    └── Writer keeps premium (PILL)
```

---

## Pricing Model

### Premium Calculation

```typescript
// Simplified Black-Scholes-inspired pricing
function calculatePremium(
    optionType: u8,
    strike: u256,
    expiryBlock: u64,
    amount: u256,
    spotPrice: u256
): u256 {
    // Time value (sqrt of blocks)
    const blocksRemaining = expiryBlock - Blockchain.block.number;
    const timeValue = sqrt(blocksRemaining);
    
    // Intrinsic value
    let intrinsic: u256 = 0;
    if (optionType === CALL && spotPrice > strike) {
        intrinsic = spotPrice - strike;
    } else if (optionType === PUT && spotPrice < strike) {
        intrinsic = strike - spotPrice;
    }
    
    // Premium = Intrinsic + Time
    return SafeMath.mul(
        SafeMath.add(intrinsic, timeValue),
        amount
    );
}
```

### Spot Price

Phase 1 uses a simple oracle or allows writers to set any strike. Future phases use pool reserves.

---

## Security Requirements

### Mandatory

- [x] SafeMath for all u256 arithmetic
- [x] @nonReentrant on all state-changing methods
- [x] Blockchain.block.number for time (NOT medianTimestamp)
- [x] Access control on exercise (buyer only)
- [x] Access control on cancel (writer only)

### Validation

- [x] Strike > 0
- [x] Expiry > current block
- [x] Expiry < current block + MAX_EXPIRY (50,000 blocks ≈ 1 year)
- [x] Amount >= MIN_AMOUNT
- [x] Token approvals verified

---

## Testing Plan

### Unit Tests

```
OptionsPool.test.ts
├── writeOption()
│   ├── should create call option
│   ├── should create put option
│   ├── should lock collateral
│   ├── should reject invalid strike
│   └── should reject past expiry
│
├── buyOption()
│   ├── should transfer premium
│   ├── should update status
│   ├── should reject if not open
│   └── should reject if expired
│
├── exercise()
│   ├── should work if ITM
│   ├── should reject if OTM
│   ├── should reject if not buyer
│   └── should reject if not expired
│
└── cancelOption()
    ├── should return collateral
    ├── should apply cancellation fee
    ├── should reject if purchased
    └── should reject if not writer
```

### Integration Tests

```
Full lifecycle tests:
├── Writer creates, buyer purchases, ITM exercise
├── Writer creates, buyer purchases, OTM expire
├── Writer creates, no buyer, writer cancels
└── Multiple options in same pool
```

---

## Milestones

### Week 1-2: Core Contracts

- [ ] OptionsFactory contract
- [ ] OptionsPool contract (basic structure)
- [ ] Storage layout
- [ ] Basic tests

### Week 3-4: Option Lifecycle

- [ ] writeOption() implementation
- [ ] buyOption() implementation
- [ ] exercise() implementation
- [ ] cancelOption() implementation
- [ ] Full test coverage

### Week 5: Security

- [ ] Reentrancy guards
- [ ] Access control
- [ ] Input validation
- [ ] Security tests

### Week 6: Deployment Prep

- [ ] Gas optimization
- [ ] Integration tests
- [ ] Documentation
- [ ] Deployment scripts

---

## Dependencies

### OPNet Packages

```json
{
  "@btc-vision/btc-runtime": "^0.3.x",
  "@btc-vision/assemblyscript": "^0.29.2",
  "@btc-vision/opnet-transform": "^0.1.x"
}
```

### Testing

```json
{
  "@btc-vision/unit-test-framework": "^0.1.x",
  "@btc-vision/transaction": "^0.3.x",
  "@btc-vision/bitcoin": "^0.3.x"
}
```

---

## Success Criteria

Phase 1 is complete when:

1. ✅ Users can create option pools (permissionless)
2. ✅ Writers can write calls and puts
3. ✅ Buyers can purchase options
4. ✅ Options can be exercised (ITM) or expire (OTM)
5. ✅ Writers can cancel unpurchased options
6. ✅ All security checks pass
7. ✅ Test coverage > 90%
8. ✅ Deployed to regtest

---

## Next Steps

- [Phase 2: NativeSwap Integration](./PHASE_2_NATIVE.md)
- [Phase 3: AMM Pools](./PHASE_3_AMM.md)
- [OptionsPool Contract](../contracts/OptionsPool.md)
