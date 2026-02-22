# AMMPool Contract

## Overview

AMMPool provides liquidity pool functionality for options trading. Users can provide liquidity, earn fees, and trade options against pooled capital.

**Phase**: 3 (AMM Liquidity Pools)

## Purpose

```
┌─────────────────────────────────────────────────────────────────┐
│                        AMMPool                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. Liquidity Management                                       │
│      ├── addLiquidity(underlying, premium) → lpTokens          │
│      └── removeLiquidity(lpTokens) → (underlying, premium)     │
│                                                                  │
│   2. Pool-Based Options                                         │
│      ├── writeOption(...) → optionId (uses pool collateral)    │
│      └── Options backed by pooled capital                       │
│                                                                  │
│   3. Fee Collection                                             │
│      ├── 0.3% trading fees                                      │
│      ├── 2-3% option premiums                                   │
│      └── Distributed to LPs                                     │
│                                                                  │
│   4. Price Discovery                                            │
│      └── Spot price from reserves (x * y = k)                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Inheritance

```typescript
class AMMPool extends OptionsPool {
    // Extends OptionsPool with:
    // - Liquidity provision
    // - Pool-based option writing
    // - LP token management
}
```

## Additional ABI (extends OptionsPool)

```typescript
const AMM_POOL_ABI = [
    // ... OptionsPool methods ...
    
    // Liquidity
    {
        name: 'addLiquidity',
        inputs: [
            { name: 'underlyingAmount', type: 'uint256' },
            { name: 'premiumAmount', type: 'uint256' },
        ],
        outputs: [{ name: 'lpTokens', type: 'uint256' }],
    },
    {
        name: 'removeLiquidity',
        inputs: [{ name: 'lpTokens', type: 'uint256' }],
        outputs: [
            { name: 'underlyingAmount', type: 'uint256' },
            { name: 'premiumAmount', type: 'uint256' },
        ],
    },
    
    // LP Token (OP20-like)
    { name: 'balanceOf', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: 'balance', type: 'uint256' }] },
    { name: 'totalSupply', inputs: [], outputs: [{ name: 'supply', type: 'uint256' }] },
    { name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: 'success', type: 'bool' }] },
    
    // Pool Info
    { name: 'getReserves', inputs: [], outputs: [{ name: 'underlying', type: 'uint256' }, { name: 'premium', type: 'uint256' }] },
    { name: 'getSpotPrice', inputs: [], outputs: [{ name: 'price', type: 'uint256' }] },
    { name: 'getImpliedVolatility', inputs: [], outputs: [{ name: 'iv', type: 'uint256' }] },
    { name: 'getUtilization', inputs: [], outputs: [{ name: 'utilization', type: 'uint256' }] },
];
```

## Methods

### addLiquidity

Adds liquidity to the pool and receives LP tokens.

```typescript
@method(
    { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
    { name: 'premiumAmount', type: ABIDataTypes.UINT256 },
)
@emit('LiquidityAdded')
@returns({ name: 'lpTokens', type: ABIDataTypes.UINT256 })
public addLiquidity(calldata: Calldata): BytesWriter
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| underlyingAmount | u256 | Amount of underlying to deposit |
| premiumAmount | u256 | Amount of premium token to deposit |

**Returns:**

| Name | Type | Description |
|------|------|-------------|
| lpTokens | u256 | LP tokens minted |

**Rules:**

1. First LP sets initial ratio
2. Subsequent LPs must match current ratio
3. Minimum LP tokens enforced (prevents dust)

**Example:**

```typescript
const pool = getContract<IAMMPoolContract>(poolAddress, AMM_POOL_ABI, provider, network, wallet.address);

// Approve both tokens
const underlying = getContract<IOP20Contract>(motoAddress, OP_20_ABI, provider, network, wallet.address);
const premium = getContract<IOP20Contract>(pillAddress, OP_20_ABI, provider, network, wallet.address);

await (await underlying.increaseAllowance(pool.address, 1000_00000000n)).sendTransaction({...});
await (await premium.increaseAllowance(pool.address, 50000_00000000n)).sendTransaction({...});

// Add liquidity
const simulation = await pool.addLiquidity(1000_00000000n, 50000_00000000n);
await simulation.sendTransaction({...});

console.log('LP tokens received:', simulation.properties.lpTokens);
```

### removeLiquidity

Removes liquidity from the pool by burning LP tokens.

```typescript
@method({ name: 'lpTokens', type: ABIDataTypes.UINT256 })
@emit('LiquidityRemoved')
@returns({ name: 'underlyingAmount', type: ABIDataTypes.UINT256 }, { name: 'premiumAmount', type: ABIDataTypes.UINT256 })
public removeLiquidity(calldata: Calldata): BytesWriter
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| lpTokens | u256 | Amount of LP tokens to burn |

**Returns:**

| Name | Type | Description |
|------|------|-------------|
| underlyingAmount | u256 | Underlying tokens received |
| premiumAmount | u256 | Premium tokens received |

**Example:**

```typescript
const lpBalance = await pool.balanceOf(wallet.address);
const simulation = await pool.removeLiquidity(lpBalance.properties.balance);
await simulation.sendTransaction({...});

console.log('Received:', simulation.properties.underlyingAmount, simulation.properties.premiumAmount);
```

### getSpotPrice

Returns current spot price from pool reserves.

```typescript
@method()
@returns({ name: 'price', type: ABIDataTypes.UINT256 })
public getSpotPrice(calldata: Calldata): BytesWriter
```

**Returns:** Premium tokens per underlying token (scaled by 1e8)

```typescript
// Price = premiumReserve / underlyingReserve * 1e8
const price = SafeMath.div(
    SafeMath.mul(premiumReserve, u256.fromU64(1e8)),
    underlyingReserve
);
```

### getImpliedVolatility

Returns current implied volatility used for pricing.

```typescript
@method()
@returns({ name: 'iv', type: ABIDataTypes.UINT256 })
public getImpliedVolatility(calldata: Calldata): BytesWriter
```

**Returns:** IV in basis points (e.g., 2000 = 20%)

### getUtilization

Returns pool utilization percentage.

```typescript
@method()
@returns({ name: 'utilization', type: ABIDataTypes.UINT256 })
public getUtilization(calldata: Calldata): BytesWriter
```

**Returns:** Utilization in basis points (e.g., 5000 = 50%)

## Pool Mechanics

### Constant Product

```
underlyingReserve * premiumReserve = k (invariant)

Price = premiumReserve / underlyingReserve

When option is written:
├── underlyingReserve decreases (collateral locked)
└── k remains constant

When option expires ITM:
├── underlying transferred to buyer
└── premium (strike) added to reserve

When option expires OTM:
├── underlying returns to reserve
└── premium kept by pool
```

### LP Token Calculation

```typescript
// First LP
lpTokens = sqrt(underlyingAmount * premiumAmount) * 1000

// Subsequent LPs
lpTokens = (underlyingAmount * totalSupply) / underlyingReserve

// On removal
underlyingAmount = (lpTokens * underlyingReserve) / totalSupply
premiumAmount = (lpTokens * premiumReserve) / totalSupply
```

### Option Pricing (Pool-Based)

```typescript
// Premium calculation uses pool reserves
private calculatePremium(option: OptionSpec): u256 {
    // Get spot price
    const spot = this.getSpotPrice();
    
    // Moneyness
    const itm = option.type === CALL
        ? spot > option.strike
        : spot < option.strike;
    
    // Time value
    const blocksRemaining = option.expiry - Blockchain.block.number;
    const timeValue = sqrt(blocksRemaining);
    
    // IV from utilization
    const iv = this.getImpliedVolatility();
    
    // Calculate premium
    let premium: u256;
    if (itm) {
        const intrinsic = abs(spot - option.strike);
        premium = intrinsic + (timeValue * iv / 10000);
    } else {
        premium = timeValue * iv / 10000;
    }
    
    return premium * option.amount;
}
```

## Fee Structure

| Fee Type | Rate | Destination |
|----------|------|-------------|
| Trading fee | 30 bps (0.3%) | Pool (LPs) |
| Option premium | 200 bps (2%) | Pool (LPs) |
| Protocol fee | 30 bps (0.3%) | Fee recipient |
| Withdrawal fee | 0 bps | - |

### Fee Calculation

```typescript
const TRADING_FEE_BPS: u64 = 30;    // 0.3%
const PROTOCOL_FEE_BPS: u64 = 30;   // 0.3%

private applyFees(amount: u256): u256 {
    // Trading fee stays in pool
    const tradingFee = (amount * TRADING_FEE_BPS) / 10000;
    const poolAmount = amount - tradingFee;
    
    // Protocol fee goes to recipient
    const protocolFee = (amount * PROTOCOL_FEE_BPS) / 10000;
    this._accumulatedProtocolFees.set(
        this._accumulatedProtocolFees.get() + protocolFee
    );
    
    return poolAmount - protocolFee;
}
```

## LP Rewards

### Reward Sources

```
┌────────────────────────────────────────────────────────────────┐
│                    LP REWARD SOURCES                           │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   1. Trading Fees (0.3%)                                       │
│      └── Added to pool reserves automatically                 │
│                                                                │
│   2. Option Premiums (2%)                                      │
│      └── Buyers pay premiums → distributed to LPs             │
│                                                                │
│   3. Unexercised Options                                       │
│      └── OTM options expire → collateral + premium in pool    │
│                                                                │
│   4. Assignment Risk                                           │
│      └── ITM exercise → pool loses underlying, gains strike   │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### APR Calculation

```typescript
function calculateAPR(pool: AMMPool): number {
    const reserves = pool.getReserves();
    const tvl = calculateTvl(reserves);
    
    // Fees collected in last 24 hours
    const dailyFees = pool.getFees24h();
    
    // Annualized
    const yearlyFees = dailyFees * 365;
    const apr = (yearlyFees / tvl) * 100;
    
    return apr;
}
```

## Storage Layout

```typescript
class AMMPool extends OptionsPool {
    // Additional storage for AMM functionality
    private underlyingReservePointer: u16 = Blockchain.nextPointer;
    private premiumReservePointer: u16 = Blockchain.nextPointer;
    private totalLiquidityPointer: u16 = Blockchain.nextPointer;
    private lpBalancesPointer: u16 = Blockchain.nextPointer;
    private allowancesPointer: u16 = Blockchain.nextPointer;
    private feesPointer: u16 = Blockchain.nextPointer;
    private utilizationPointer: u16 = Blockchain.nextPointer;
    
    // Storage instances
    private _underlyingReserve: StoredU256;
    private _premiumReserve: StoredU256;
    private _totalLiquidity: StoredU256;
    private _lpBalances: StoredMap;        // address → balance
    private _allowances: StoredMap;        // owner → spender → amount
    private _accumulatedFees: StoredU256;
    private _lastFeeBlock: StoredU64;
}
```

## Events

### LiquidityAdded

```typescript
interface LiquidityAddedEvent {
    provider: Address;
    underlyingAmount: u256;
    premiumAmount: u256;
    lpTokens: u256;
    blockNumber: u64;
}
```

### LiquidityRemoved

```typescript
interface LiquidityRemovedEvent {
    provider: Address;
    underlyingAmount: u256;
    premiumAmount: u256;
    lpTokensBurned: u256;
    blockNumber: u64;
}
```

### FeesCollected

```typescript
interface FeesCollectedEvent {
    tradingFees: u256;
    protocolFees: u256;
    blockNumber: u64;
}
```

## Security Considerations

### Impermanent Loss

```typescript
// Warn LPs about IL
function calculateImpermanentLoss(priceRatio: u256): u256 {
    // IL = 2 * sqrt(ratio) / (1 + ratio) - 1
    const sqrt = this.sqrt(priceRatio);
    const numerator = u256.fromU64(2) * sqrt;
    const denominator = u256.fromU64(1) + priceRatio;
    
    const value = numerator / denominator;
    return u256.fromU64(1) - value;  // Negative = loss
}
```

### Flash Loan Protection

```typescript
// Prevent exercise in same block as purchase
private checkExerciseDelay(option: Option): void {
    const blocksSincePurchase = Blockchain.block.number - option.purchaseBlock;
    if (blocksSincePurchase < 1) {
        throw new Revert('Cannot exercise in same block');
    }
}
```

### Pool Drain Prevention

```typescript
// Maximum utilization before rejecting new options
const MAX_UTILIZATION: u64 = 8000;  // 80%

private checkUtilization(): void {
    const utilization = this.getUtilization();
    if (utilization > u256.fromU64(MAX_UTILIZATION)) {
        throw new Revert('Pool utilization too high');
    }
}
```

## Frontend Integration

### Hook: Use Pool Info

```typescript
function usePoolInfo(poolAddress: Address) {
    const provider = useProvider();
    const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
    
    useEffect(() => {
        async function fetchPoolInfo() {
            const pool = getContract<IAMMPoolContract>(poolAddress, AMM_POOL_ABI, provider, network);
            
            const [reserves, spotPrice, iv, utilization, totalSupply] = await Promise.all([
                pool.getReserves(),
                pool.getSpotPrice(),
                pool.getImpliedVolatility(),
                pool.getUtilization(),
                pool.totalSupply(),
            ]);
            
            setPoolInfo({
                underlyingReserve: reserves.properties.underlying,
                premiumReserve: reserves.properties.premium,
                spotPrice: spotPrice.properties.price,
                impliedVolatility: iv.properties.iv,
                utilization: utilization.properties.utilization,
                totalLiquidity: totalSupply.properties.supply,
            });
        }
        
        fetchPoolInfo();
    }, [poolAddress]);
    
    return poolInfo;
}
```

### Hook: Manage Liquidity

```typescript
function useLiquidity(poolAddress: Address) {
    const { wallet } = useWallet();
    const provider = useProvider();
    
    const addLiquidity = async (underlying: bigint, premium: bigint) => {
        const pool = getContract<IAMMPoolContract>(poolAddress, AMM_POOL_ABI, provider, network, wallet.address);
        
        // Approve tokens
        // ... approval logic ...
        
        const simulation = await pool.addLiquidity(underlying, premium);
        const receipt = await simulation.sendTransaction({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            refundTo: wallet.p2tr,
            feeRate: 10,
            network,
        });
        
        return receipt.transactionId;
    };
    
    const removeLiquidity = async (lpTokens: bigint) => {
        const pool = getContract<IAMMPoolContract>(poolAddress, AMM_POOL_ABI, provider, network, wallet.address);
        
        const simulation = await pool.removeLiquidity(lpTokens);
        const receipt = await simulation.sendTransaction({...});
        
        return receipt;
    };
    
    return { addLiquidity, removeLiquidity };
}
```

## Next Steps

- [Mode 2: AMM Details](../modes/mode-2-amm.md)
- [Phase 3 Roadmap](../roadmap/PHASE_3_AMM.md)
- [OptionsPool Contract](./OptionsPool.md)
