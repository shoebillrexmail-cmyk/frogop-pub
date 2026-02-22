# Phase 1: Technical Specification

## Document Purpose

This document provides detailed technical specifications for Phase 1 implementation, addressing:
1. Oracle-less settlement mechanism
2. Expiration and exercise mechanics
3. Collateral model
4. Pricing calculations
5. Security-critical implementation details

---

## 1. Oracle Solution: Exercise-Based Settlement

### The Problem

Traditional options require an oracle to determine if an option is "in-the-money" (ITM) at expiry. Oracles introduce:
- External dependencies
- Manipulation vectors
- Latency and staleness issues
- Additional gas costs

### The Solution: No Oracle Needed

**Key Insight**: In peer-to-peer options, the buyer makes the economic decision. The contract doesn't need to know if the option is "really" ITM - the buyer decides based on market conditions they observe off-chain.

```
┌─────────────────────────────────────────────────────────────────────┐
│              EXERCISE-BASED SETTLEMENT (NO ORACLE)                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Traditional Oracle Model:                                        │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐         │
│   │   Option    │ ──► │   Oracle    │ ──► │  Contract   │         │
│   │   Expires   │     │ Price Query │     │  Decides    │         │
│   └─────────────┘     └─────────────┘     └─────────────┘         │
│                              ↑                                      │
│                        Dependency                                   │
│                                                                     │
│   Exercise-Based Model:                                            │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐         │
│   │   Option    │ ──► │    Buyer    │ ──► │  Contract   │         │
│   │   Expires   │     │   Decides   │     │  Executes   │         │
│   └─────────────┘     └─────────────┘     └─────────────┘         │
│                              ↑                                      │
│                     Off-chain price discovery                      │
│                     (MotoSwap, NativeSwap, etc.)                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Buyer's Economic Decision

**Call Option @ Strike 50, Premium 5:**

```
At expiry, buyer observes off-chain price from MotoSwap/etc:
├── If MOTO trading at 60 PILL:
│   ├── Exercise: Pay 50 PILL, get 1 MOTO (worth 60)
│   ├── Net: +5 PILL (60 - 50 - 5 premium)
│   └── Decision: EXERCISE ✓
│
└── If MOTO trading at 40 PILL:
    ├── Exercise: Pay 50 PILL, get 1 MOTO (worth 40)
    ├── Net: -15 PILL (40 - 50 - 5 premium)
    └── Decision: DON'T EXERCISE ✗
```

**Put Option @ Strike 50, Premium 3:**

```
At expiry, buyer observes off-chain price:
├── If MOTO trading at 40 PILL:
│   ├── Exercise: Give 1 MOTO (worth 40), get 50 PILL
│   ├── Net: +7 PILL (50 - 40 - 3 premium)
│   └── Decision: EXERCISE ✓
│
└── If MOTO trading at 60 PILL:
    ├── Exercise: Give 1 MOTO (worth 60), get 50 PILL
    ├── Net: -13 PILL (50 - 60 - 3 premium)
    └── Decision: DON'T EXERCISE ✗
```

### Contract Enforcement

The contract enforces only:
1. **Timing**: Exercise allowed after expiry, before grace period ends
2. **Authorization**: Only buyer can exercise
3. **Collateral**: Sufficient collateral locked

The contract does NOT:
- Query any price oracle
- Determine if option is "really" ITM
- Prevent "irrational" exercises (buyer can exercise even if OTM)

---

## 2. Expiration Mechanics

### Timeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                      OPTION LIFECYCLE                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Block N              Block M              Block E                 │
│   Option Written       Option Purchased    Expiry Block            │
│       │                    │                    │                   │
│       ├────────────────────┼────────────────────┤                   │
│       │                    │                    │                   │
│       │   OPEN             │   PURCHASED        │                   │
│       │   (can cancel)     │   (can't cancel)   │                   │
│       │                    │                    │                   │
│       └────────────────────┴────────────────────┼──────────────────┤│
│                                                 │                   │
│                                                 │   EXERCISE        │
│                                                 │   WINDOW          │
│                                                 │   (buyer only)    │
│                                                 │                   │
│                                                 ├───────────────────┤
│                                                 │                   │
│                                                 E+G                E+G+
│                                                 Grace Ends         Anyone
│                                                                     can settle
│                                                                     (expire)
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Block Parameters

```typescript
// Constants
const GRACE_PERIOD_BLOCKS: u64 = 144;      // ~24 hours after expiry
const MAX_EXPIRY_BLOCKS: u64 = 52560;      // ~1 year max expiry
const MIN_EXPIRY_BLOCKS: u64 = 6;          // ~1 hour min expiry
const CANCEL_FEE_BPS: u64 = 100;           // 1% cancellation fee
```

### Exercise Window

```
Exercise Window: [expiryBlock, expiryBlock + GRACE_PERIOD_BLOCKS)

During window:
├── Buyer can call exercise()
├── Requires: underlying approval (for puts)
├── Requires: premium token approval (for calls)
└── Transfers happen atomically

After window:
├── Option can be marked EXPIRED
├── Collateral returns to writer
└── Premium kept by writer
```

### Settlement Methods

#### exercise() - Buyer Initiates

```typescript
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@emit('OptionExercised')
@nonReentrant
public exercise(calldata: Calldata): BytesWriter {
    const optionId = calldata.readU256();
    const option = this._options.get(optionId);
    const caller = Blockchain.msgSender;
    
    // Validation
    if (option.status != PURCHASED) throw new Revert('Not purchased');
    if (!caller.equals(option.buyer)) throw new Revert('Not buyer');
    if (Blockchain.block.number < option.expiryBlock) throw new Revert('Not yet expired');
    if (Blockchain.block.number >= option.expiryBlock + GRACE_PERIOD_BLOCKS) {
        throw new Revert('Grace period ended');
    }
    
    // Execute based on type
    if (option.optionType == CALL) {
        this.exerciseCall(option);
    } else {
        this.exercisePut(option);
    }
    
    // Update status
    option.status = EXERCISED;
    this._options.set(optionId, option);
    
    return this.encodeBool(true);
}
```

#### settle() - Anyone Triggers Expiry

```typescript
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@emit('OptionExpired')
@nonReentrant
public settle(calldata: Calldata): BytesWriter {
    const optionId = calldata.readU256();
    const option = this._options.get(optionId);
    
    // Validation
    if (option.status != PURCHASED) throw new Revert('Not purchased');
    if (Blockchain.block.number < option.expiryBlock + GRACE_PERIOD_BLOCKS) {
        throw new Revert('Grace period not ended');
    }
    
    // Return collateral to writer
    if (option.optionType == CALL) {
        this.transferToken(
            this._underlying.get(),
            this.address,
            option.writer,
            option.underlyingAmount
        );
    } else {
        const strikeValue = SafeMath.mul(option.strikePrice, option.underlyingAmount);
        this.transferToken(
            this._premiumToken.get(),
            this.address,
            option.writer,
            strikeValue
        );
    }
    
    // Update status
    option.status = EXPIRED;
    this._options.set(optionId, option);
    
    return this.encodeBool(true);
}
```

---

## 3. Collateral Model

### Call Option Collateral

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CALL OPTION COLLATERAL                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   writeOption(CALL, strike=50, amount=100, premium=200):           │
│   ├── Writer locks: 100 MOTO (underlying)                          │
│   └── Writer specifies: 200 PILL premium                           │
│                                                                     │
│   buyOption():                                                      │
│   ├── Buyer pays: 200 PILL to writer                               │
│   └── Status: PURCHASED                                            │
│                                                                     │
│   exercise() [Buyer's choice]:                                     │
│   ├── Buyer pays: 50 * 100 = 5000 PILL to writer                   │
│   ├── Buyer receives: 100 MOTO                                     │
│   └── Writer total: 200 + 5000 = 5200 PILL                         │
│                                                                     │
│   settle() [No exercise]:                                          │
│   ├── Writer receives: 100 MOTO back                               │
│   └── Writer keeps: 200 PILL premium                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Put Option Collateral

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PUT OPTION COLLATERAL                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   writeOption(PUT, strike=50, amount=100, premium=150):            │
│   ├── Writer locks: 50 * 100 = 5000 PILL (strike value)            │
│   └── Writer specifies: 150 PILL premium                           │
│                                                                     │
│   buyOption():                                                      │
│   ├── Buyer pays: 150 PILL to writer                               │
│   └── Status: PURCHASED                                            │
│                                                                     │
│   exercise() [Buyer's choice, requires MOTO]:                      │
│   ├── Buyer provides: 100 MOTO to writer                           │
│   ├── Buyer receives: 5000 PILL                                    │
│   └── Writer total: 150 + 100 MOTO                                 │
│                                                                     │
│   settle() [No exercise]:                                          │
│   ├── Writer receives: 5000 PILL back                              │
│   └── Writer keeps: 150 PILL premium                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Collateral Calculation

```typescript
private calculateCollateral(option: Option): u256 {
    if (option.optionType == CALL) {
        // Call: Lock underlying amount
        return option.underlyingAmount;
    } else {
        // Put: Lock strike value (strike * amount)
        return SafeMath.mul(option.strikePrice, option.underlyingAmount);
    }
}
```

---

## 4. Option Pricing (Writer-Specified)

### Contract Does NOT Calculate Premium

Phase 1 uses **writer-specified premium**:
- Writer sets the premium they want
- Buyer chooses to accept or not
- No on-chain pricing formula

### Why Not On-Chain Pricing?

| Approach | Pros | Cons |
|----------|------|------|
| On-chain formula | "Fair" pricing | Oracle dependency, gas cost, manipulation risk |
| Writer-specified | Simple, P2P, no oracle | Requires market knowledge |

### Frontend Premium Suggestion

The frontend CAN suggest a premium based on off-chain price queries:

```typescript
// Frontend helper (NOT contract code)
async function suggestPremium(
    pool: OptionsPool,
    optionType: 'call' | 'put',
    strike: bigint,
    expiryBlock: bigint,
    amount: bigint
): Promise<bigint> {
    // 1. Get current price from MotoSwap
    const spotPrice = await getMotoSwapPrice(pool.underlying, pool.premiumToken);
    
    // 2. Calculate time to expiry
    const currentBlock = await provider.getBlockNumber();
    const blocksToExpiry = expiryBlock - currentBlock;
    
    // 3. Estimate implied volatility (could be config or historical)
    const iv = 0.20; // 20% annualized, simplified
    
    // 4. Time value (simplified Black-Scholes)
    const timeInYears = blocksToExpiry / 52560; // blocks per year
    const timeValue = Math.sqrt(timeInYears) * iv * Number(spotPrice);
    
    // 5. Intrinsic value
    let intrinsic = 0n;
    if (optionType === 'call' && spotPrice > strike) {
        intrinsic = spotPrice - strike;
    } else if (optionType === 'put' && spotPrice < strike) {
        intrinsic = strike - spotPrice;
    }
    
    // 6. Total premium per unit
    const premiumPerUnit = intrinsic + BigInt(Math.floor(timeValue));
    
    // 7. Total premium
    return premiumPerUnit * amount / ONE_TOKEN;
}
```

---

## 5. Exercise Implementation

### exerciseCall()

```typescript
private exerciseCall(option: Option): void {
    const caller = Blockchain.msgSender;
    
    // Calculate strike value
    const strikeValue = SafeMath.mul(option.strikePrice, option.underlyingAmount);
    
    // 1. Transfer strike payment from buyer to writer
    this.transferFrom(
        this._premiumToken.get(),
        caller,           // buyer
        option.writer,
        strikeValue
    );
    
    // 2. Transfer underlying from contract to buyer
    this.transfer(
        this._underlying.get(),
        caller,           // buyer
        option.underlyingAmount
    );
    
    // Premium was already transferred to writer on purchase
}
```

### exercisePut()

```typescript
private exercisePut(option: Option): void {
    const caller = Blockchain.msgSender;
    
    // Calculate strike value
    const strikeValue = SafeMath.mul(option.strikePrice, option.underlyingAmount);
    
    // 1. Transfer underlying from buyer to writer
    this.transferFrom(
        this._underlying.get(),
        caller,           // buyer
        option.writer,
        option.underlyingAmount
    );
    
    // 2. Transfer strike value from contract to buyer
    this.transfer(
        this._premiumToken.get(),
        caller,           // buyer
        strikeValue
    );
    
    // Premium was already transferred to writer on purchase
}
```

---

## 6. Full Option Struct

### Optimized for Storage Efficiency

```typescript
// Packed struct for storage efficiency
struct Option {
    // Header (32 bytes)
    id: u256,                   // 32 bytes - Option identifier
    
    // Parties (64 bytes)
    writer: Address,            // 32 bytes - Option writer
    buyer: Address,             // 32 bytes - Option buyer (zero if unpurchased)
    
    // Option parameters (40 bytes packed)
    strikePrice: u256,          // 32 bytes - Premium tokens per underlying unit
    underlyingAmount: u256,     // 32 bytes - How much underlying
    
    // Premium (32 bytes)
    premium: u256,              // 32 bytes - Premium paid by buyer
    
    // Timing (16 bytes)
    expiryBlock: u64,           // 8 bytes - When option expires
    createdBlock: u64,          // 8 bytes - When created
    
    // Flags (2 bytes)
    optionType: u8,             // 1 byte - 0=Call, 1=Put
    status: u8,                 // 1 byte - 0=Open, 1=Purchased, 2=Exercised, 3=Expired, 4=Cancelled
}

// Total: ~250 bytes per option
// With pointer overhead: ~280 bytes in storage
```

### Serialization

```typescript
private serializeOption(option: Option): Uint8Array {
    const writer = new BytesWriter(280);
    
    writer.writeU256(option.id);
    writer.writeAddress(option.writer);
    writer.writeAddress(option.buyer);
    writer.writeU256(option.strikePrice);
    writer.writeU256(option.underlyingAmount);
    writer.writeU256(option.premium);
    writer.writeU64(option.expiryBlock);
    writer.writeU64(option.createdBlock);
    writer.writeU8(option.optionType);
    writer.writeU8(option.status);
    
    return writer.buffer;
}

private deserializeOption(data: Uint8Array): Option {
    const reader = new BytesReader(data);
    
    return {
        id: reader.readU256(),
        writer: reader.readAddress(),
        buyer: reader.readAddress(),
        strikePrice: reader.readU256(),
        underlyingAmount: reader.readU256(),
        premium: reader.readU256(),
        expiryBlock: reader.readU64(),
        createdBlock: reader.readU64(),
        optionType: reader.readU8(),
        status: reader.readU8(),
    };
}
```

---

## 7. Complete Method Specifications

### writeOption()

```typescript
@method(
    { name: 'optionType', type: ABIDataTypes.UINT8 },
    { name: 'strikePrice', type: ABIDataTypes.UINT256 },
    { name: 'expiryBlock', type: ABIDataTypes.UINT64 },
    { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
    { name: 'premium', type: ABIDataTypes.UINT256 },
)
@emit('OptionWritten')
@returns({ name: 'optionId', type: ABIDataTypes.UINT256 })
@nonReentrant
public writeOption(calldata: Calldata): BytesWriter {
    const optionType = calldata.readU8();
    const strikePrice = calldata.readU256();
    const expiryBlock = calldata.readU64();
    const underlyingAmount = calldata.readU256();
    const premium = calldata.readU256();
    const writer = Blockchain.msgSender;
    
    // Validation
    if (optionType > 1) throw new Revert('Invalid option type');
    if (strikePrice == u256.Zero) throw new Revert('Strike must be > 0');
    if (underlyingAmount == u256.Zero) throw new Revert('Amount must be > 0');
    if (premium == u256.Zero) throw new Revert('Premium must be > 0');
    
    const currentBlock = Blockchain.block.number;
    if (expiryBlock <= currentBlock) throw new Revert('Expiry in past');
    if (expiryBlock > currentBlock + MAX_EXPIRY_BLOCKS) throw new Revert('Expiry too far');
    
    // Calculate collateral
    let collateralToken: Address;
    let collateralAmount: u256;
    
    if (optionType == CALL) {
        collateralToken = this._underlying.get();
        collateralAmount = underlyingAmount;
    } else {
        collateralToken = this._premiumToken.get();
        collateralAmount = SafeMath.mul(strikePrice, underlyingAmount);
    }
    
    // Transfer collateral from writer
    this.transferFrom(collateralToken, writer, this.address, collateralAmount);
    
    // Create option
    const optionId = this._nextId.get();
    this._nextId.set(SafeMath.add(optionId, u256.One));
    
    const option: Option = {
        id: optionId,
        writer: writer,
        buyer: Address.zero(),
        strikePrice: strikePrice,
        underlyingAmount: underlyingAmount,
        premium: premium,
        expiryBlock: expiryBlock,
        createdBlock: currentBlock,
        optionType: optionType,
        status: OPEN,
    };
    
    this._options.set(optionId, this.serializeOption(option));
    
    // Track writer's options
    this.addToWriterOptions(writer, optionId);
    
    // Emit event
    const event = new BytesWriter(200);
    event.writeU256(optionId);
    event.writeAddress(writer);
    event.writeU8(optionType);
    event.writeU256(strikePrice);
    event.writeU256(underlyingAmount);
    event.writeU256(premium);
    event.writeU64(expiryBlock);
    NetEvent.emit('OptionWritten', event.buffer);
    
    // Return option ID
    const result = new BytesWriter(32);
    result.writeU256(optionId);
    return result;
}
```

### buyOption()

```typescript
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@emit('OptionPurchased')
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@nonReentrant
public buyOption(calldata: Calldata): BytesWriter {
    const optionId = calldata.readU256();
    const option = this.deserializeOption(this._options.get(optionId));
    const buyer = Blockchain.msgSender;
    
    // Validation
    if (option.status != OPEN) throw new Revert('Not open');
    if (Blockchain.block.number >= option.expiryBlock) throw new Revert('Already expired');
    if (buyer.equals(option.writer)) throw new Revert('Writer cannot buy own option');
    
    // Transfer premium from buyer to writer
    this.transferFrom(
        this._premiumToken.get(),
        buyer,
        option.writer,
        option.premium
    );
    
    // Update option
    option.buyer = buyer;
    option.status = PURCHASED;
    this._options.set(optionId, this.serializeOption(option));
    
    // Track buyer's options
    this.addToBuyerOptions(buyer, optionId);
    
    // Emit event
    const event = new BytesWriter(100);
    event.writeU256(optionId);
    event.writeAddress(buyer);
    event.writeAddress(option.writer);
    event.writeU256(option.premium);
    event.writeU64(Blockchain.block.number);
    NetEvent.emit('OptionPurchased', event.buffer);
    
    return this.encodeBool(true);
}
```

### cancelOption()

```typescript
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@emit('OptionCancelled')
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@nonReentrant
public cancelOption(calldata: Calldata): BytesWriter {
    const optionId = calldata.readU256();
    const option = this.deserializeOption(this._options.get(optionId));
    const caller = Blockchain.msgSender;
    
    // Validation
    if (!caller.equals(option.writer)) throw new Revert('Not writer');
    if (option.status != OPEN) throw new Revert('Not open');
    
    // Calculate collateral
    let collateralToken: Address;
    let collateralAmount: u256;
    
    if (option.optionType == CALL) {
        collateralToken = this._underlying.get();
        collateralAmount = option.underlyingAmount;
    } else {
        collateralToken = this._premiumToken.get();
        collateralAmount = SafeMath.mul(option.strikePrice, option.underlyingAmount);
    }
    
    // Apply cancellation fee (1%)
    const fee = SafeMath.div(
        SafeMath.mul(collateralAmount, u256.fromU64(CANCEL_FEE_BPS)),
        u256.fromU64(10000)
    );
    const returnAmount = SafeMath.sub(collateralAmount, fee);
    
    // Transfer collateral back (minus fee)
    this.transfer(collateralToken, option.writer, returnAmount);
    
    // Fee stays in contract (accumulates for pool/protocol)
    this._accumulatedFees.set(SafeMath.add(
        this._accumulatedFees.get(),
        fee
    ));
    
    // Update status
    option.status = CANCELLED;
    this._options.set(optionId, this.serializeOption(option));
    
    // Emit event
    const event = new BytesWriter(100);
    event.writeU256(optionId);
    event.writeAddress(option.writer);
    event.writeU256(returnAmount);
    event.writeU256(fee);
    NetEvent.emit('OptionCancelled', event.buffer);
    
    return this.encodeBool(true);
}
```

---

## 8. Security Checklist

### Pre-Implementation

- [ ] All u256 operations use SafeMath
- [ ] All state-changing methods have @nonReentrant
- [ ] All time comparisons use Blockchain.block.number
- [ ] All transfers use checks-effects-interactions pattern
- [ ] All serialization read/write types match
- [ ] All pointers uniquely allocated

### Input Validation

- [ ] optionType in [0, 1]
- [ ] strikePrice > 0
- [ ] underlyingAmount > 0
- [ ] premium > 0
- [ ] expiryBlock > currentBlock
- [ ] expiryBlock < currentBlock + MAX_EXPIRY

### Access Control

- [ ] exercise() - buyer only
- [ ] cancelOption() - writer only
- [ ] settle() - anyone (after grace period)

---

## 9. Gas Optimization

### Storage Efficiency

| Data | Type | Bytes | Justification |
|------|------|-------|---------------|
| optionType | u8 | 1 | Only 2 values |
| status | u8 | 1 | Only 5 values |
| expiryBlock | u64 | 8 | Block height fits in u64 |
| createdBlock | u64 | 8 | Block height fits in u64 |
| strikePrice | u256 | 32 | Large token amounts |
| underlyingAmount | u256 | 32 | Large token amounts |
| premium | u256 | 32 | Large token amounts |

### Batch Operations (Future)

```typescript
// Future optimization for multiple exercises
@method({ name: 'optionIds', type: ABIDataTypes.UINT256_ARRAY })
public batchExercise(calldata: Calldata): BytesWriter {
    // Exercise multiple options in single transaction
    // Reduces per-option overhead
}
```

---

## Next Steps

1. Review this specification
2. Create contract skeleton
3. Implement storage layout
4. Implement core methods
5. Write unit tests
