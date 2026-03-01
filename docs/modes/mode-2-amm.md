# Mode 2: AMM Pool (OP20 Liquidity)

## Overview

AMM mode provides **liquidity pools** for options trading. Users can:
- **Write options**: Deposit collateral, earn premiums
- **Buy options**: Pay premium, get option rights
- **Provide liquidity**: Deposit both assets, earn fees

## Key Principle: No Stablecoins Required

Unlike traditional options AMMs, FrogOp uses **any OP20 token pair**:

```
Traditional:   Underlying (BTC) + Stablecoin (USDT)
FrogOp:        Underlying (MOTO) + Premium (PILL)

Strike expressed as: "50 PILL per MOTO"
```

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                    AMM OPTIONS POOL                                     │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                    Liquidity Pool                                 │ │
│  │                                                                   │ │
│  │   ┌─────────────────┐        ┌─────────────────┐                │ │
│  │   │  UNDERLYING     │        │    PREMIUM      │                │ │
│  │   │    RESERVE      │        │    RESERVE      │                │ │
│  │   │                 │        │                 │                │ │
│  │   │  10,000 MOTO    │        │  500,000 PILL   │                │ │
│  │   │                 │        │                 │                │ │
│  │   └────────┬────────┘        └────────┬────────┘                │ │
│  │            │                          │                          │ │
│  │            └──────────┬───────────────┘                          │ │
│  │                       ▼                                          │ │
│  │              ┌─────────────────┐                                │ │
│  │              │  x * y = k      │                                │ │
│  │              │  Constant       │                                │ │
│  │              │  Product        │                                │ │
│  │              └─────────────────┘                                │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                    Active Options                                 │ │
│  │                                                                   │ │
│  │   Option #1: Call @ 45 PILL, expires block 850,000              │ │
│  │   Option #2: Put  @ 55 PILL, expires block 860,000              │ │
│  │   Option #3: Call @ 48 PILL, expires block 855,000              │ │
│  │   ...                                                            │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

## Permissionless Pool Creation

### Factory Pattern

```typescript
// OptionsFactory.wasm
@method(
    { name: 'underlying', type: ABIDataTypes.ADDRESS },
    { name: 'premiumToken', type: ABIDataTypes.ADDRESS },
)
@emit('PoolCreated')
public createPool(calldata: Calldata): BytesWriter {
    const underlying = calldata.readAddress();
    const premiumToken = calldata.readAddress();
    
    // Check pool doesn't already exist
    if (this.poolExists(underlying, premiumToken)) {
        throw new Revert('Pool already exists');
    }
    
    // Deploy new OptionsPool contract
    const poolAddress = Blockchain.deployContractFromExisting(
        OPTIONS_POOL_TEMPLATE,
        this.salt(underlying, premiumToken),
        this.encodeInitData(underlying, premiumToken)
    );
    
    // Register pool
    this.pools.set(underlying, premiumToken, poolAddress);
    this.poolList.push(poolAddress);
    
    // Return pool address
    const writer = new BytesWriter(32);
    writer.writeAddress(poolAddress);
    return writer;
}
```

### Pool Discovery

```typescript
// Get pool for a token pair
@method(
    { name: 'underlying', type: ABIDataTypes.ADDRESS },
    { name: 'premiumToken', type: ABIDataTypes.ADDRESS },
)
@returns({ name: 'pool', type: ABIDataTypes.ADDRESS })
public getPool(calldata: Calldata): BytesWriter {
    const pool = this.pools.get(underlying, premiumToken);
    const writer = new BytesWriter(32);
    writer.writeAddress(pool);
    return writer;
}

// Get all pools
@method({ name: 'index', type: ABIDataTypes.UINT256 })
@returns({ name: 'pool', type: ABIDataTypes.ADDRESS })
public allPools(calldata: Calldata): BytesWriter {
    const pool = this.poolList.get(index);
    const writer = new BytesWriter(32);
    writer.writeAddress(pool);
    return writer;
}
```

## Covered Call Pool Mechanics

### Writer Flow

```
Writer deposits 100 MOTO
       │
       ▼
┌─────────────────────────────────────────┐
│  Pool Reserve: +100 MOTO                │
│  Writer receives:                       │
│  ├── Option NFT (right to write calls) │
│  └── LP tokens (share of pool)          │
└─────────────────────────────────────────┘
       │
       ▼
When buyer purchases call:
├── Writer's MOTO locked for option duration
├── Writer receives premium (PILL)
└── At expiry:
    ├── ITM: MOTO transferred to buyer
    └── OTM: MOTO returned to pool
```

### Buyer Flow

```
Buyer pays 5 PILL premium
       │
       ▼
┌─────────────────────────────────────────┐
│  Strike: 50 PILL per MOTO               │
│  Underlying: 1 MOTO                     │
│  Expiry: Block 864,000                  │
└─────────────────────────────────────────┘
       │
       ▼
At expiry, if MOTO price > 50 PILL:
├── Buyer exercises
├── Pays 50 PILL (strike price)
├── Receives 1 MOTO
└── Net: 1 MOTO for 55 PILL total

At expiry, if MOTO price ≤ 50 PILL:
├── Option expires worthless
└── Buyer loses 5 PILL premium
```

### LP Flow

```
LP deposits 1,000 MOTO + 40,000 PILL
       │
       ▼
┌─────────────────────────────────────────┐
│  Receives LP tokens                     │
│                                         │
│  Earns from:                            │
│  ├── Option premiums (2-3% fee)        │
│  ├── Trading fees (0.3% per trade)     │
│  └── Unexercised options                │
│                                         │
│  Risks:                                 │
│  ├── Impermanent loss                   │
│  ├── Assignment (options exercised)    │
│  └── Large price moves                  │
└─────────────────────────────────────────┘
```

## Option Pricing (AMM-Based)

### Pricing Formula

```typescript
private calculatePremium(
    optionType: u8,        // 0=Call, 1=Put
    strikePrice: u256,     // PILL per MOTO
    expiryBlock: u64,
    amount: u256
): u256 {
    // Get current price from pool reserves
    const spotPrice = this.getSpotPrice();
    
    // Moneyness factor
    const itm = optionType === CALL
        ? spotPrice > strikePrice
        : spotPrice < strikePrice;
    
    // Time value (square root of blocks remaining)
    const blocksRemaining = expiryBlock - Blockchain.block.number;
    const timeValue = this.sqrt(u256.fromU64(blocksRemaining));
    
    // Implied volatility from pool utilization
    const iv = this.getImpliedVolatility();
    
    // Intrinsic value
    let intrinsic: u256 = u256.Zero;
    if (itm) {
        if (optionType === CALL) {
            intrinsic = SafeMath.sub(spotPrice, strikePrice);
        } else {
            intrinsic = SafeMath.sub(strikePrice, spotPrice);
        }
    }
    
    // Premium = Intrinsic + Time * IV
    const premium = SafeMath.add(
        intrinsic,
        SafeMath.div(
            SafeMath.mul(timeValue, iv),
            u256.fromU64(10000)  // IV in basis points
        )
    );
    
    // Scale by amount
    return SafeMath.mul(premium, amount);
}

// Get spot price from pool reserves
private getSpotPrice(): u256 {
    const underlyingReserve = this._underlyingReserve.get();
    const premiumReserve = this._premiumReserve.get();
    
    // Price = premiumReserve / underlyingReserve
    return SafeMath.div(
        SafeMath.mul(premiumReserve, u256.fromU64(1e8)),
        underlyingReserve
    );
}

// Implied volatility from pool utilization
private getImpliedVolatility(): u256 {
    const totalCapacity = this._totalCapacity.get();
    const usedCapacity = this._usedCapacity.get();
    
    if (totalCapacity == u256.Zero) return u256.fromU64(2000); // 20% default
    
    // IV scales with utilization
    const utilization = SafeMath.div(
        SafeMath.mul(usedCapacity, u256.fromU64(10000)),
        totalCapacity
    );
    
    // Base 10% + utilization factor
    return SafeMath.add(u256.fromU64(1000), utilization);
}
```

### Price Impact

```typescript
private getPriceImpact(amount: u256): u256 {
    const reserve = this._underlyingReserve.get();
    
    // Impact = amount / reserve
    const impact = SafeMath.div(
        SafeMath.mul(amount, u256.fromU64(10000)),
        reserve
    );
    
    // Reject trades with > 5% impact
    if (impact > u256.fromU64(500)) {
        throw new Revert('Price impact too high');
    }
    
    return impact;
}
```

## Liquidity Provision

### Add Liquidity

```typescript
@method(
    { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
    { name: 'premiumAmount', type: ABIDataTypes.UINT256 },
)
@emit('LiquidityAdded')
public addLiquidity(calldata: Calldata): BytesWriter {
    const underlyingAmount = calldata.readU256();
    const premiumAmount = calldata.readU256();
    
    // Calculate LP tokens to mint
    const totalSupply = this._totalLiquidity.get();
    let lpTokens: u256;
    
    if (totalSupply == u256.Zero) {
        // First LP sets initial ratio
        lpTokens = SafeMath.mul(
            SafeMath.sqrt(underlyingAmount * premiumAmount),
            u256.fromU64(1000)  // Initial multiplier
        );
    } else {
        // Subsequent LPs must match current ratio
        const reserve0 = this._underlyingReserve.get();
        const reserve1 = this._premiumReserve.get();
        
        const expectedPremium = SafeMath.div(
            SafeMath.mul(underlyingAmount, reserve1),
            reserve0
        );
        
        if (premiumAmount < expectedPremium) {
            throw new Revert('Insufficient premium amount');
        }
        
        // Mint proportional to underlying deposit
        lpTokens = SafeMath.div(
            SafeMath.mul(underlyingAmount, totalSupply),
            reserve0
        );
    }
    
    // Transfer tokens
    this.transferFrom(this._underlying.get(), msgSender, this.address, underlyingAmount);
    this.transferFrom(this._premiumToken.get(), msgSender, this.address, premiumAmount);
    
    // Update reserves
    this._underlyingReserve.set(SafeMath.add(
        this._underlyingReserve.get(),
        underlyingAmount
    ));
    this._premiumReserve.set(SafeMath.add(
        this._premiumReserve.get(),
        premiumAmount
    ));
    
    // Mint LP tokens
    this._totalLiquidity.set(SafeMath.add(totalSupply, lpTokens));
    this._lpBalances.set(msgSender, SafeMath.add(
        this._lpBalances.get(msgSender),
        lpTokens
    ));
    
    // Return LP tokens minted
    const writer = new BytesWriter(32);
    writer.writeU256(lpTokens);
    return writer;
}
```

### Remove Liquidity

```typescript
@method({ name: 'lpTokens', type: ABIDataTypes.UINT256 })
@emit('LiquidityRemoved')
public removeLiquidity(calldata: Calldata): BytesWriter {
    const lpTokens = calldata.readU256();
    
    // Check balance
    const balance = this._lpBalances.get(msgSender);
    if (balance < lpTokens) {
        throw new Revert('Insufficient LP balance');
    }
    
    // Calculate share of reserves
    const totalSupply = this._totalLiquidity.get();
    const underlyingAmount = SafeMath.div(
        SafeMath.mul(lpTokens, this._underlyingReserve.get()),
        totalSupply
    );
    const premiumAmount = SafeMath.div(
        SafeMath.mul(lpTokens, this._premiumReserve.get()),
        totalSupply
    );
    
    // Burn LP tokens
    this._lpBalances.set(msgSender, SafeMath.sub(balance, lpTokens));
    this._totalLiquidity.set(SafeMath.sub(totalSupply, lpTokens));
    
    // Update reserves
    this._underlyingReserve.set(SafeMath.sub(
        this._underlyingReserve.get(),
        underlyingAmount
    ));
    this._premiumReserve.set(SafeMath.sub(
        this._premiumReserve.get(),
        premiumAmount
    ));
    
    // Transfer tokens back
    this.transfer(this._underlying.get(), msgSender, underlyingAmount);
    this.transfer(this._premiumToken.get(), msgSender, premiumAmount);
    
    // Return amounts
    const writer = new BytesWriter(64);
    writer.writeU256(underlyingAmount);
    writer.writeU256(premiumAmount);
    return writer;
}
```

## Fee Structure

| Fee Type | Amount | Destination |
|----------|--------|-------------|
| Trading fee | 0.3% | LPs |
| Option premium | 2-3% | LPs + protocol |
| Exercise fee | 0.1% | LPs |
| Withdrawal fee | 0% | - |

```typescript
private collectFee(amount: u256, feeBps: u64): u256 {
    const fee = SafeMath.div(
        SafeMath.mul(amount, u256.fromU64(feeBps)),
        u256.fromU64(10000)
    );
    
    // Add to fee accumulator
    this._accumulatedFees.set(SafeMath.add(
        this._accumulatedFees.get(),
        fee
    ));
    
    return SafeMath.sub(amount, fee);
}
```

## LP Rewards

### Reward Sources

```
┌─────────────────────────────────────────────────────────────────┐
│                    LP REWARD BREAKDOWN                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   1. Option Premiums (60% of revenue)                          │
│      └── Buyers pay premiums → distributed to LPs              │
│                                                                 │
│   2. Trading Fees (30% of revenue)                             │
│      └── 0.3% on each trade → stays in pool                    │
│                                                                 │
│   3. Unexercised Options (10% of revenue)                      │
│      └── OTM options expire → collateral returns to pool       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Reward Distribution

```typescript
// Called periodically to distribute accumulated fees
@method()
@emit('RewardsDistributed')
public distributeRewards(): BytesWriter {
    const fees = this._accumulatedFees.get();
    if (fees == u256.Zero) return new BytesWriter(0);
    
    const totalLiquidity = this._totalLiquidity.get();
    
    // Add fees to premium reserve (LPs earn via LP token value)
    this._premiumReserve.set(SafeMath.add(
        this._premiumReserve.get(),
        fees
    ));
    
    // Reset accumulator
    this._accumulatedFees.set(u256.Zero);
    
    // Emit event
    const writer = new BytesWriter(32);
    writer.writeU256(fees);
    return writer;
}
```

## Example: MOTO/PILL Pool

### Pool Parameters

| Parameter | Value |
|-----------|-------|
| Underlying | MOTO |
| Premium Token | PILL |
| Initial Reserves | 10,000 MOTO / 500,000 PILL |
| Spot Price | 50 PILL per MOTO |
| Trading Fee | 0.3% |
| LP Count | 5 |

### Sample Option

```
Call Option:
├── Strike: 55 PILL per MOTO
├── Underlying: 10 MOTO
├── Expiry: 144 blocks (~24 hours)
├── Premium: 2 PILL per MOTO = 20 PILL total
└── Collateral: 10 MOTO locked by writer

At Expiry:
├── If MOTO > 55 PILL (ITM): Buyer exercises, pays 550 PILL, gets 10 MOTO
└── If MOTO ≤ 55 PILL (OTM): Writer keeps 10 MOTO, keeps 20 PILL premium
```

## Events

```typescript
@emit('PoolCreated')
// underlying, premiumToken, poolAddress

@emit('LiquidityAdded')
// provider, underlyingAmount, premiumAmount, lpTokens

@emit('LiquidityRemoved')
// provider, underlyingAmount, premiumAmount, lpTokens

@emit('OptionWritten')
// writer, optionId, optionType, strike, amount, premium

@emit('OptionPurchased')
// buyer, optionId, premium, premiumToken

@emit('OptionExercised')
// optionId, buyer, settlementAmount

@emit('OptionExpired')
// optionId, writer, collateralReturned

@emit('RewardsDistributed')
// totalFees, lpCount
```

## Security Considerations

### Impermanent Loss

LPs face impermanent loss when price moves significantly:

```typescript
// Calculate impermanent loss
function calculateIL(priceRatio: u256): u256 {
    // IL = 2 * sqrt(ratio) / (1 + ratio) - 1
    // Simplified approximation
    const sqrt = this.sqrt(priceRatio);
    const onePlusRatio = SafeMath.add(u256.fromU64(1), priceRatio);
    
    const value = SafeMath.div(
        SafeMath.mul(u256.fromU64(2), sqrt),
        onePlusRatio
    );
    
    return SafeMath.sub(u256.fromU64(1), value);
}
```

### Flash Loan Protection

```typescript
// Options cannot be written and exercised in same block
private checkExerciseDelay(option: Option): void {
    const currentBlock = Blockchain.block.number;
    const blocksSinceCreation = currentBlock - option.createdBlock;
    
    if (blocksSinceCreation < 1) {
        throw new Revert('Cannot exercise in same block');
    }
}
```

## Next Steps

- [Mode Comparison](./mode-comparison.md)
- [AMMPool Contract](../contracts/AMMPool.md)
- [Phase 3 Roadmap](../../internal/roadmap/PHASE_3_AMM.md)
