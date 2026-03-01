# OptionsFactory Contract

## Overview

OptionsFactory is the pool registry contract. Pools are deployed by the protocol admin and registered via `registerPool()`. The factory provides pool discovery methods (`getPoolCount`, `getPoolByIndex`, `getPool`).

## Contract Address

```
regtest:  (TBD after deployment)
mainnet:  (TBD after deployment)
```

## ABI

```typescript
const OPTIONS_FACTORY_ABI = [
    {
        name: 'createPool',
        inputs: [
            { name: 'underlying', type: 'address' },
            { name: 'premiumToken', type: 'address' },
        ],
        outputs: [{ name: 'pool', type: 'address' }],
    },
    {
        name: 'getPool',
        inputs: [
            { name: 'underlying', type: 'address' },
            { name: 'premiumToken', type: 'address' },
        ],
        outputs: [{ name: 'pool', type: 'address' }],
    },
    {
        name: 'allPools',
        inputs: [{ name: 'index', type: 'uint256' }],
        outputs: [{ name: 'pool', type: 'address' }],
    },
    {
        name: 'poolCount',
        inputs: [],
        outputs: [{ name: 'count', type: 'uint256' }],
    },
];
```

## Methods

### createPool

Creates a new option pool for a token pair.

```typescript
@method(
    { name: 'underlying', type: ABIDataTypes.ADDRESS },
    { name: 'premiumToken', type: ABIDataTypes.ADDRESS },
)
@emit('PoolCreated')
@returns({ name: 'pool', type: ABIDataTypes.ADDRESS })
public createPool(calldata: Calldata): BytesWriter
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| underlying | Address | Token being optioned (e.g., MOTO) |
| premiumToken | Address | Token for premiums and strikes (e.g., PILL) |

**Returns:**

| Name | Type | Description |
|------|------|-------------|
| pool | Address | Address of newly created pool |

**Events:**

```typescript
@emit('PoolCreated')
{
    underlying: Address,
    premiumToken: Address,
    pool: Address,
    creator: Address,
    blockNumber: u64
}
```

**Example (Frontend):**

```typescript
import { getContract, OPTIONS_FACTORY_ABI, IOptionsFactoryContract } from 'opnet';

const factory = getContract<IOptionsFactoryContract>(
    factoryAddress,
    OPTIONS_FACTORY_ABI,
    provider,
    network,
    wallet.address
);

// Create MOTO/PILL option pool
const simulation = await factory.createPool(motoAddress, pillAddress);

const receipt = await simulation.sendTransaction({
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    refundTo: wallet.p2tr,
    feeRate: 10,
    network,
});

console.log('Pool created:', simulation.properties.pool.toHex());
```

> **Runtime Limitation:** `createPool()` relies on `Blockchain.deployContractFromExisting()` which is **not supported** by the OPNet runtime. Calling `createPool()` will revert on-chain. Instead, deploy pools via CLI/script and register them with `registerPool()`.

### getPool

Gets the pool address for a token pair.

```typescript
@method(
    { name: 'underlying', type: ABIDataTypes.ADDRESS },
    { name: 'premiumToken', type: ABIDataTypes.ADDRESS },
)
@returns({ name: 'pool', type: ABIDataTypes.ADDRESS })
public getPool(calldata: Calldata): BytesWriter
```

**Returns:**

- Pool address if exists
- Zero address (`0x0000...`) if not exists

**Example:**

```typescript
const result = await factory.getPool(motoAddress, pillAddress);
const poolAddress = result.properties.pool;

if (poolAddress.toHex() === '0x' + '0'.repeat(64)) {
    console.log('Pool does not exist');
} else {
    console.log('Pool address:', poolAddress.toHex());
}
```

### allPools

Gets pool address by index.

```typescript
@method({ name: 'index', type: ABIDataTypes.UINT256 })
@returns({ name: 'pool', type: ABIDataTypes.ADDRESS })
public allPools(calldata: Calldata): BytesWriter
```

**Example:**

```typescript
// Get total count
const countResult = await factory.poolCount();
const count = countResult.properties.count;

// Iterate all pools
for (let i = 0n; i < count; i++) {
    const poolResult = await factory.allPools(i);
    console.log(`Pool ${i}:`, poolResult.properties.pool.toHex());
}
```

### poolCount

Returns total number of pools created.

```typescript
@method()
@returns({ name: 'count', type: ABIDataTypes.UINT256 })
public poolCount(calldata: Calldata): BytesWriter
```

## Storage Layout

```typescript
class OptionsFactory extends Upgradeable {
    // Pointers
    private poolsPointer: u16 = Blockchain.nextPointer;      // Map<underlying, Map<premium, pool>>
    private poolListPointer: u16 = Blockchain.nextPointer;   // Array<pool>
    
    // Storage
    private _pools: StoredMap;       // Nested map: underlying → premium → pool
    private _poolList: StoredList;   // All pool addresses
}
```

## Factory Pattern Implementation

### Template Contract

```typescript
// OptionsPool template is deployed once
private OPTIONS_POOL_TEMPLATE: Address;

constructor() {
    super();
    this.OPTIONS_POOL_TEMPLATE = Address.fromString(TEMPLATE_ADDRESS);
}
```

### Salt-Based Deployment

```typescript
private salt(underlying: Address, premiumToken: Address): Uint8Array {
    // Deterministic salt for pool address
    const writer = new BytesWriter(64);
    writer.writeAddress(underlying);
    writer.writeAddress(premiumToken);
    return SHA256(writer.buffer);
}

// Pool addresses are deterministic
// Same underlying + premiumToken = same address
// Prevents duplicate pools
```

### Deployment

```typescript
private deployPool(underlying: Address, premiumToken: Address): Address {
    // Prepare init calldata
    const initData = new BytesWriter(64);
    initData.writeAddress(underlying);
    initData.writeAddress(premiumToken);
    
    // Deploy from template
    const poolAddress = Blockchain.deployContractFromExisting(
        this.OPTIONS_POOL_TEMPLATE,
        this.salt(underlying, premiumToken),
        initData.buffer
    );
    
    return poolAddress;
}
```

## Events Reference

### PoolCreated

Emitted when a new pool is created.

```typescript
interface PoolCreatedEvent {
    underlying: Address;      // Token being optioned
    premiumToken: Address;    // Token for premiums
    pool: Address;           // New pool address
    creator: Address;        // Who created it
    blockNumber: u64;        // Creation block
}
```

## Error Codes

| Code | Message | Cause |
|------|---------|-------|
| 0x01 | "Pool already exists" | Token pair already has a pool |
| 0x02 | "Invalid token address" | Zero address passed |
| 0x03 | "Same token pair" | underlying == premiumToken |
| 0x04 | "Template not set" | Factory not initialized |

## Security

### Access Control

- **createPool**: Not supported by OPNet runtime (use `registerPool` instead)
- **registerPool**: Owner only
- **setTemplate**: Owner only

### Validation

```typescript
private validateTokens(underlying: Address, premiumToken: Address): void {
    // Not zero addresses
    if (underlying.isZero() || premiumToken.isZero()) {
        throw new Revert('Invalid token address');
    }
    
    // Not same token
    if (underlying.equals(premiumToken)) {
        throw new Revert('Same token pair');
    }
    
    // Pool doesn't exist
    if (this.poolExists(underlying, premiumToken)) {
        throw new Revert('Pool already exists');
    }
}
```

## Upgrade Pattern

Factory extends `Upgradeable` for future improvements:

```typescript
class OptionsFactory extends Upgradeable {
    // Upgrade requires:
    // 1. 2/3 multisig approval
    // 2. 48 hour timelock
    // 3. No breaking changes to existing pools
}
```

## Frontend Integration

### Pool Discovery Hook

```typescript
import { useContract, useProvider } from 'opnet';
import { useState, useEffect } from 'react';

function usePoolDiscovery(factoryAddress: Address) {
    const provider = useProvider();
    const [pools, setPools] = useState<PoolInfo[]>([]);
    
    useEffect(() => {
        async function fetchPools() {
            const factory = getContract<IOptionsFactoryContract>(
                factoryAddress,
                OPTIONS_FACTORY_ABI,
                provider,
                network
            );
            
            const count = await factory.poolCount();
            const poolInfos: PoolInfo[] = [];
            
            for (let i = 0n; i < count.properties.count; i++) {
                const poolAddr = await factory.allPools(i);
                const pool = getContract<IOptionsPoolContract>(
                    poolAddr.properties.pool,
                    OPTIONS_POOL_ABI,
                    provider,
                    network
                );
                
                const [underlying, premium, reserves] = await Promise.all([
                    pool.underlying(),
                    pool.premiumToken(),
                    pool.getReserves(),
                ]);
                
                poolInfos.push({
                    address: poolAddr.properties.pool,
                    underlying: underlying.properties.token,
                    premiumToken: premium.properties.token,
                    reserve0: reserves.properties.reserve0,
                    reserve1: reserves.properties.reserve1,
                });
            }
            
            setPools(poolInfos);
        }
        
        fetchPools();
    }, [factoryAddress]);
    
    return pools;
}
```

## Next Steps

- [OptionsPool Contract](./OptionsPool.md)
- [AMMPool Contract](./AMMPool.md)
- [Phase 1 MVP](../../internal/roadmap/PHASE_1_MVP.md)
