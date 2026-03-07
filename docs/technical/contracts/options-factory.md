# OptionsFactory Contract

## Overview

OptionsFactory is the pool registry contract. Pools are deployed by the protocol admin and registered via `registerPool()`. The factory provides pool discovery methods (`getPoolCount`, `getPoolByIndex`, `getPool`).

## Contract Address

```
testnet:  (see tests/integration/deployed-contracts.json)
mainnet:  (TBD)
```

## ABI

```typescript
const OPTIONS_FACTORY_ABI = [
    // View methods
    { name: 'getOwner', inputs: [], outputs: [{ name: 'owner', type: 'address' }] },
    { name: 'getPoolTemplate', inputs: [], outputs: [{ name: 'template', type: 'address' }] },
    { name: 'getTreasury', inputs: [], outputs: [{ name: 'treasury', type: 'address' }] },
    { name: 'getPoolCount', inputs: [], outputs: [{ name: 'count', type: 'uint256' }] },
    {
        name: 'getPoolByIndex',
        inputs: [{ name: 'index', type: 'uint256' }],
        outputs: [
            { name: 'poolAddress', type: 'address' },
            { name: 'underlying', type: 'address' },
            { name: 'premiumToken', type: 'address' },
        ],
    },
    {
        name: 'getPool',
        inputs: [
            { name: 'underlying', type: 'address' },
            { name: 'premiumToken', type: 'address' },
        ],
        outputs: [{ name: 'poolAddress', type: 'address' }],
    },

    // State-changing methods
    {
        name: 'setPoolTemplate',
        inputs: [{ name: 'template', type: 'address' }],
        outputs: [{ name: 'success', type: 'bool' }],
    },
    {
        name: 'setTreasury',
        inputs: [{ name: 'treasury', type: 'address' }],
        outputs: [{ name: 'success', type: 'bool' }],
    },
    {
        name: 'registerPool',
        inputs: [
            { name: 'pool', type: 'address' },
            { name: 'underlying', type: 'address' },
            { name: 'premiumToken', type: 'address' },
        ],
        outputs: [{ name: 'success', type: 'bool' }],
    },
    {
        name: 'createPool',
        inputs: [
            { name: 'underlying', type: 'address' },
            { name: 'premiumToken', type: 'address' },
            { name: 'underlyingDecimals', type: 'uint8' },
            { name: 'premiumDecimals', type: 'uint8' },
        ],
        outputs: [{ name: 'poolAddress', type: 'address' }],
    },
];
```

## Methods

### View Methods

#### getOwner

Returns the contract owner address (set to `tx.origin` at deployment).

```typescript
@view @method()
@returns({ name: 'owner', type: ABIDataTypes.ADDRESS })
public getOwner(_calldata: Calldata): BytesWriter
```

#### getPoolTemplate

Returns the pool template address used by `createPool`.

```typescript
@view @method()
@returns({ name: 'template', type: ABIDataTypes.ADDRESS })
public getPoolTemplate(_calldata: Calldata): BytesWriter
```

#### getTreasury

Returns the treasury address.

```typescript
@view @method()
@returns({ name: 'treasury', type: ABIDataTypes.ADDRESS })
public getTreasury(_calldata: Calldata): BytesWriter
```

#### getPoolCount

Returns total number of registered pools.

```typescript
@view @method()
@returns({ name: 'count', type: ABIDataTypes.UINT256 })
public getPoolCount(_calldata: Calldata): BytesWriter
```

#### getPoolByIndex

Returns pool info by index. Returns 96 bytes: poolAddress + underlying + premiumToken.

```typescript
@view
@method({ name: 'index', type: ABIDataTypes.UINT256 })
@returns({ name: 'poolAddress', type: ABIDataTypes.ADDRESS })
public getPoolByIndex(calldata: Calldata): BytesWriter
```

**Returns:** 96 bytes — `poolAddress(32) + underlying(32) + premiumToken(32)`

**Reverts:** `'Index out of bounds'` if index >= poolCount.

#### getPool

Gets the pool address for a token pair. Returns zero address if not registered.

```typescript
@view
@method(
    { name: 'underlying', type: ABIDataTypes.ADDRESS },
    { name: 'premiumToken', type: ABIDataTypes.ADDRESS },
)
@returns({ name: 'poolAddress', type: ABIDataTypes.ADDRESS })
public getPool(calldata: Calldata): BytesWriter
```

### State-Changing Methods

#### setPoolTemplate

Sets the pool template address for `createPool`. Owner only.

```typescript
@method({ name: 'template', type: ABIDataTypes.ADDRESS })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
public setPoolTemplate(calldata: Calldata): BytesWriter
```

#### setTreasury

Sets the treasury address. Owner only. Rejects zero address.

```typescript
@method({ name: 'treasury', type: ABIDataTypes.ADDRESS })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
public setTreasury(calldata: Calldata): BytesWriter
```

**Reverts:** `'Treasury cannot be zero address'` if zero address provided.

#### registerPool

Registers an externally-deployed pool in the factory registry. Owner only. This is the **primary method** for adding pools since `createPool` is not supported by OPNet runtime.

```typescript
@method(
    { name: 'pool', type: ABIDataTypes.ADDRESS },
    { name: 'underlying', type: ABIDataTypes.ADDRESS },
    { name: 'premiumToken', type: ABIDataTypes.ADDRESS },
)
@returns({ name: 'success', type: ABIDataTypes.BOOL })
public registerPool(calldata: Calldata): BytesWriter
```

**Reverts:**
- `'Invalid pool address'` — zero address
- `'Invalid underlying'` — zero address
- `'Invalid premiumToken'` — zero address
- `'Pool already registered'` — token pair already has a pool

#### createPool

Creates a new pool from the template via `deployContractFromExisting`.

```typescript
@method(
    { name: 'underlying', type: ABIDataTypes.ADDRESS },
    { name: 'premiumToken', type: ABIDataTypes.ADDRESS },
    { name: 'underlyingDecimals', type: ABIDataTypes.UINT8 },
    { name: 'premiumDecimals', type: ABIDataTypes.UINT8 },
)
@returns({ name: 'poolAddress', type: ABIDataTypes.ADDRESS })
@emit('PoolCreated')
public createPool(calldata: Calldata): BytesWriter
```

> **Runtime Limitation:** `createPool()` relies on `Blockchain.deployContractFromExisting()` which is **not supported** by the OPNet runtime. Use `registerPool()` with externally-deployed pools instead.

## Storage Layout

```
Pointer 10: owner (StoredAddress) — contract owner (tx.origin at deployment)
Pointer 11: poolTemplate (StoredAddress) — template for createPool
Pointer 12: pools (MapOfMap<u256>) — nested map: underlying → premiumToken → poolAddress
Pointer 13: treasury (StoredAddress) — lazy-loaded
Pointer 14: poolCount (StoredU256) — lazy-loaded, incremented by registerPool/createPool
Pointer 15: poolList (SHA256-keyed raw storage) — enumerable pool list (3 slots per index)
```

## Events

### PoolCreated

Emitted by `createPool` (not by `registerPool`).

```typescript
// Event data: 96 bytes
{
    poolAddress: Address,    // 32 bytes
    underlying: Address,     // 32 bytes
    premiumToken: Address,   // 32 bytes
}
```

## Access Control

| Method | Access |
|--------|--------|
| `getOwner`, `getPoolTemplate`, `getTreasury`, `getPoolCount`, `getPoolByIndex`, `getPool` | Public (view) |
| `setPoolTemplate`, `setTreasury`, `registerPool` | Owner only |
| `createPool` | Any (but unsupported by runtime) |

## Source

`src/contracts/factory/contract.ts`
