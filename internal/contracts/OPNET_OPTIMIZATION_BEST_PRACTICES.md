# OPNet Contract Optimization Best Practices

This document captures lessons learned from developing the FroGop options protocol, including common pitfalls and their solutions.

## Table of Contents

1. [WASM Binary Optimization](#wasm-binary-optimization)
2. [Constructor Patterns](#constructor-patterns)
3. [Storage Design](#storage-design)
4. [Test Runtime Setup](#test-runtime-setup)
5. [Gas-Saving Patterns](#gas-saving-patterns)
6. [Common Pitfalls](#common-pitfalls)

---

## WASM Binary Optimization

### The Problem

Unit tests failed with `out of gas during start function (consumed: <gas_limit>)`. The gas consumed always equaled the limit, regardless of how high the limit was set.

**Symptoms:**
- OptionsFactory tests (21.7 KB WASM) passed
- OptionsPool tests (29.5 KB WASM) failed
- Error: `out of gas during start function (consumed: 5000000000000)`

### Root Cause

The unit test framework has a hard limit on gas consumption during WASM instantiation (the "start function"). Larger WASM binaries consume more gas during initialization.

### Solution: Optimize asconfig.json

```json
{
  "options": {
    "optimizeLevel": 3,    // Maximum optimization
    "shrinkLevel": 2,      // CRITICAL: Aggressive binary size reduction
    "converge": true,      // Run optimizer until no improvement
    "noAssert": true       // CRITICAL: Strip runtime assertions
  }
}
```

| Setting | Purpose | Impact |
|---------|---------|--------|
| `shrinkLevel: 2` | Aggressive dead code elimination, binary shrinking | **High** - Reduces WASM size |
| `noAssert: true` | Remove runtime boundary checks and assertions | **Medium** - Reduces WASM size |

### Results

| Contract | Before | After | Reduction |
|----------|--------|-------|-----------|
| OptionsFactory | 21.7 KB | 20.3 KB | 6% |
| OptionsPool | 29.5 KB | 27.9 KB | 6% |

**Key Insight:** Even a 6% reduction was enough to get tests passing. The test framework's gas limit is sensitive to WASM size.

### Community Guidance

> "40KB works every time. If you're at 51KB, try the optimization flags first -- might get you under 40KB. If not, split the contract."

---

## Constructor Patterns

### OPNet-Specific Behavior

**CRITICAL:** In OPNet, the constructor runs on **EVERY** contract interaction, not just deployment.

```typescript
// WRONG: Heavy initialization in constructor
public constructor() {
    super();
    this._owner = new StoredAddress(OWNER_POINTER);
    this._token1 = new StoredAddress(TOKEN1_POINTER);
    this._token2 = new StoredAddress(TOKEN2_POINTER);
    this._token3 = new StoredAddress(TOKEN3_POINTER);
    this._token4 = new StoredAddress(TOKEN4_POINTER);
    this._data1 = new StoredU256(DATA1_POINTER);
    this._data2 = new StoredU256(DATA2_POINTER);
    // ... more fields = more gas on EVERY call
}
```

### Best Practice: Hybrid Storage Pattern

Use minimal constructor initialization + lazy loading for non-critical fields:

```typescript
public constructor() {
    super();
    // ONLY critical fields needed for basic operation
    this._underlying = new StoredAddress(UNDERLYING_POINTER);
    this._premiumToken = new StoredAddress(PREMIUM_TOKEN_POINTER);
    this._nextId = new StoredU256(NEXT_ID_POINTER);
    // Other fields: lazy-loaded on first access
}

private _locked: StoredBoolean | null = null;
private get locked(): StoredBoolean {
    if (!this._locked) {
        this._locked = new StoredBoolean(LOCKED_POINTER, false);
    }
    return this._locked!;
}
```

### onDeployment vs Constructor

| Method | When it runs | Use for |
|--------|--------------|---------|
| `constructor()` | Every interaction | Minimal field initialization |
| `onDeployment()` | Once at deployment | Set initial values from calldata |

```typescript
public override onDeployment(calldata: Calldata): void {
    // This runs ONLY once during deployment
    const underlying = calldata.readAddress();
    const premiumToken = calldata.readAddress();
    
    this._underlying.value = underlying;
    this._premiumToken.value = premiumToken;
}
```

---

## Storage Design

### Pointer Overflow Risk

**Problem:** Using u16 pointer arithmetic limits storage capacity.

```typescript
// DANGEROUS: Overflow at ~9,333 options
private getSlotPointer(optionId: u256, slot: u8): Uint8Array {
    const ptr = this.basePointer + u16(optionId.toU64() * 7) + u16(slot);
    // max ptr = 65535, with base=200 and 7 slots/option
    // max options = (65535 - 200) / 7 = 9,333
}
```

### Solution: SHA256-Based Storage Keys

```typescript
// SAFE: Unlimited options via SHA256 keys
private getKey(optionId: u256, slot: u8): Uint8Array {
    const writer = new BytesWriter(35);
    writer.writeU16(this.basePointer);
    writer.writeU256(optionId);
    writer.writeU8(slot);
    return sha256(writer.getBuffer());
}
```

**Trade-off:** SHA256 adds gas cost per read/write, but provides unlimited capacity.

### OPNet Storage Limits

| Limit | Value | Notes |
|-------|-------|-------|
| Pointers per contract | 65,535 | u16 range |
| Storage key size | 32 bytes | SHA256 output |
| Storage value size | 32 bytes | One word |
| Total storage | Unlimited | Via SHA256 keys |

---

## Test Runtime Setup

### Problem: Missing deploymentCalldata

Tests passed deployment but failed when calling methods that accessed storage:

```
Error: Contract not found at address 0x...
```

### Root Cause

The test runtime wasn't passing deployment calldata, so `onDeployment()` never initialized storage:

```typescript
// WRONG: No deploymentCalldata
constructor(deployer: Address, underlying: Address, premiumToken: Address) {
    super({
        deployer,
        address: Blockchain.generateRandomAddress(),
        gasLimit: 5_000_000_000_000n,
        // MISSING: deploymentCalldata!
    });
}
```

### Solution

```typescript
// CORRECT: Pass deploymentCalldata
constructor(deployer: Address, underlying: Address, premiumToken: Address) {
    const deploymentCalldata = new BinaryWriter();
    deploymentCalldata.writeAddress(underlying);
    deploymentCalldata.writeAddress(premiumToken);
    
    super({
        deployer,
        address: Blockchain.generateRandomAddress(),
        gasLimit: 5_000_000_000_000n,
        deploymentCalldata: Buffer.from(deploymentCalldata.getBuffer() as Uint8Array),
    });
}
```

### Test Gas Limits

The unit test framework has different limits than mainnet:

| Environment | Gas Limit | Notes |
|-------------|-----------|-------|
| Unit tests | ~50T (variable) | Framework limitation |
| Testnet | 4.5T target | Consensus |
| Mainnet | 4.5T target | Consensus |

---

## Gas-Saving Patterns

### 1. Minimize Constructor Work

```typescript
// BAD
public constructor() {
    super();
    this.initAllFields(); // Expensive on every call
}

// GOOD
public constructor() {
    super();
    this._critical = new StoredU256(CRITICAL_POINTER);
    // Lazy-load others
}
```

### 2. Use Built-in ReentrancyGuard

```typescript
// BAD: Manual reentrancy guard (error-prone)
private _locked: StoredBoolean | null = null;
public writeOption(calldata: Calldata): BytesWriter {
    if (this.locked.value) throw new Revert('LOCKED');
    this.locked.value = true;
    // ... must remember to set false on every exit path
}

// GOOD: Built-in ReentrancyGuard
import { ReentrancyGuard } from '@btc-vision/btc-runtime/runtime';

export class OptionsPool extends ReentrancyGuard {
    protected readonly reentrancyLevel = ReentrancyLevel.STANDARD;
    // Automatic protection, no manual lock management
}
```

### 3. Use @method Decorators

```typescript
// BAD: Manual router (error-prone, missing from ABI)
public override execute(method: Selector, calldata: Calldata): BytesWriter {
    switch (method) {
        case encodeSelector('writeOption(...)'):
            return this.writeOption(calldata);
        // Easy to miss methods
    }
}

// GOOD: @method decorators (auto-routing, ABI generation)
@method(
    { name: 'optionType', type: ABIDataTypes.UINT8 },
    { name: 'strikePrice', type: ABIDataTypes.UINT256 },
)
public writeOption(calldata: Calldata): BytesWriter {
    // Method automatically routed
}
```

### 4. Pack Small Values

```typescript
// BAD: Two storage slots
private _expiryBlock: StoredU64;  // Slot 1
private _createdBlock: StoredU64; // Slot 2

// GOOD: One storage slot (packed)
// Bytes 0-7: expiryBlock, Bytes 8-15: createdBlock
private packBlocks(expiry: u64, created: u64): Uint8Array {
    const data = new Uint8Array(32);
    for (let i = 0; i < 8; i++) {
        data[i] = u8((expiry >> u64(i * 8)) & 0xFF);
        data[8 + i] = u8((created >> u64(i * 8)) & 0xFF);
    }
    return data;
}
```

---

## Common Pitfalls

### 1. Using `medianTimestamp` for Time Logic

```typescript
// DANGEROUS: Miner-manipulable
if (Blockchain.block.medianTimestamp >= expiry) { ... }

// SAFE: Use block number
if (Blockchain.block.number >= expiryBlock) { ... }
```

### 2. Raw Arithmetic Instead of SafeMath

```typescript
// DANGEROUS: Can overflow
const newBalance = currentBalance - amount;

// SAFE: Use SafeMath
const newBalance = SafeMath.sub(currentBalance, amount);
```

### 3. Using Keccak256 Instead of SHA256

```typescript
// WRONG: Ethereum uses Keccak256
import { keccak256 } from '...';

// CORRECT: OPNet/Bitcoin uses SHA256
import { sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
```

### 4. Using `approve()` on OP-20

```typescript
// WRONG: OP-20 doesn't have approve()
await token.approve(spender, amount);

// CORRECT: Use increaseAllowance()
await token.increaseAllowance(spender, amount);
```

### 5. Unbounded Loops

```typescript
// DANGEROUS: Unbounded gas consumption
for (let i = 0; i < array.length; i++) { ... }

// SAFE: Bounded iteration with pagination
const MAX_ITERATIONS = 100;
for (let i = offset; i < min(offset + MAX_ITERATIONS, array.length); i++) { ... }
```

### 6. Decimal Mismatch in Calculations

```typescript
// PROBLEM: Assumes same decimals
const collateral = strikePrice * underlyingAmount;
// If strikePrice is USDT (6 decimals) and underlyingAmount is BTC (8 decimals)
// Result is off by 10^14

// SOLUTION: Normalize decimals before calculation
const normalizedStrike = strikePrice * 10n ** (18n - strikeDecimals);
const normalizedAmount = underlyingAmount * 10n ** (18n - underlyingDecimals);
const collateral = (normalizedStrike * normalizedAmount) / (10n ** 18n);
```

---

## Optimization Checklist

Before deploying, verify:

- [ ] `asconfig.json` has `shrinkLevel: 2` and `noAssert: true`
- [ ] Constructor only initializes critical fields
- [ ] Non-critical fields use lazy loading
- [ ] Storage keys use SHA256 for unlimited capacity (or validate pointer limits)
- [ ] Test runtime passes `deploymentCalldata`
- [ ] Using built-in `ReentrancyGuard` instead of manual locks
- [ ] Using `@method` decorators instead of manual `execute()` router
- [ ] All arithmetic uses `SafeMath`
- [ ] Time logic uses `Blockchain.block.number`, not `medianTimestamp`
- [ ] Hashing uses SHA256, not Keccak256
- [ ] OP-20 approvals use `increaseAllowance()`
- [ ] No unbounded loops

---

## References

- [AGENTS.md](../../AGENTS.md) - Project-specific rules
- [OPNET_COMPLEXITY_BEST_PRACTICES.md](./OPNET_COMPLEXITY_BEST_PRACTICES.md) - Complexity guidelines
- [THREAT_MODEL.md](../../docs/security/THREAT_MODEL.md) - Security considerations
