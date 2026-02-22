# OPNet Contract Complexity & Best Practices

## Overview

This document compiles findings from OPNet documentation regarding contract complexity limits, gas optimization patterns, and best practices for avoiding common pitfalls.

---

## Quick Reference: DO's and DON'Ts

### DO

- Use `onDeployment()` for one-time initialization
- Use `SafeMath` for all arithmetic operations
- Use maps for O(1) lookups instead of arrays
- Store running totals instead of computing aggregates
- Use pagination when iterating is necessary
- Limit array sizes with explicit caps
- Follow Checks-Effects-Interactions pattern
- Document your pointer layout
- Emit events for all state changes
- Use `@view` decorator on read-only methods
- Declare all method parameters in `@method()` decorator

### DON'T

- Put heavy computation in constructor (runs every call)
- Use `while` loops or unbounded `for` loops
- Iterate over all map keys or array elements
- Let arrays grow without bounds
- Use raw arithmetic (always use SafeMath)
- Reuse pointers for different data
- Use `tx.origin` for authentication
- Hardcode pointer values
- Exclude state-changing functions from ReentrancyGuard
- Use bare `@method()` without parameter declarations

---

## Key Constraints & Limits

| Constraint | Value | Description |
|------------|-------|-------------|
| Pointers per contract | **65,535** | `u16` range - effectively unlimited for most use cases |
| Contract bytecode (compressed) | **128 KB** | After compression, enforced by `DeploymentTransaction.MAXIMUM_CONTRACT_SIZE` |
| Constructor calldata | **1 MB** | Maximum initialization data size |
| Array length | ~4 billion | `u32` range (configurable) |
| String length | 65,535 bytes | Encoded in storage |
| Event data | **352 bytes** | Maximum event data size |

### Important Finding

**There is NO hard limit on the number of data pointers in a constructor.** The bottleneck is **overall complexity** - specifically the computational operations performed during initialization, not the pointer count itself.

---

## The Constructor Trap

In OPNet, the constructor behaves differently than in Solidity:

| Event | Solidity | OPNet |
|-------|----------|-------|
| Constructor runs | Once at deployment | **Every contract interaction** |
| One-time init | In constructor | In `onDeployment()` |

```typescript
// WRONG -- this runs on EVERY call!
constructor() {
    super();
    this._totalSupply.value = u256.fromU64(1000000);
}

// CORRECT -- runs once at deployment
public override onDeployment(_calldata: Calldata): void {
    this._totalSupply.value = u256.fromU64(1000000);
    this._owner.value = Blockchain.tx.origin;
}
```

**Key Insight:** The constructor sets up storage pointers on every interaction. Heavy computation in the constructor will be paid on every call.

---

## FORBIDDEN Patterns

These patterns cause gas explosions and should never be used:

### 1. Unbounded Loops

```typescript
// FORBIDDEN
while (condition) {
    // Can run forever, consume infinite gas
}

// FORBIDDEN - loops that grow with state
for (let i = 0; i < this.holders.length; i++) {
    // If holders grows to 10,000, this becomes unusable
}
```

### 2. Iterating All Keys/Elements

```typescript
// FORBIDDEN - O(n) just to get keys
const keys = this.balances.keys();
for (let i = 0; i < keys.length; i++) {
    const balance = this.balances.get(keys[i]);
    total = SafeMath.add(total, balance);
}

// FORBIDDEN - O(n) membership check
for (let i = 0; i < this.whitelist.length; i++) {
    if (this.whitelist[i] === address) return true;
}
```

### 3. Growing Arrays Without Bounds

```typescript
// FORBIDDEN
class BadContract extends OP_NET {
    private holders: Address[] = []; // Grows forever!

    transfer(to: Address, amount: u256): void {
        if (!this.holders.includes(to)) {
            this.holders.push(to); // Eventually makes transfer unusable
        }
    }
}
```

### 4. Raw Arithmetic Instead of SafeMath

```typescript
// FORBIDDEN - Can underflow!
const newBalance = currentBalance - amount;

// CORRECT - Reverts on underflow
const newBalance = SafeMath.sub(currentBalance, amount);
```

### 5. Incorrect BytesWriter Size

```typescript
// WRONG - Size mismatch
const writer = new BytesWriter(1);  // Only 1 byte
writer.writeU256(value);            // Needs 32 bytes!

// CORRECT - Proper size calculation
const writer = new BytesWriter(32);
writer.writeU256(value);

// For multiple values - calculate total
const writer = new BytesWriter(1 + 32 + 8 + 8);  // bool + u256 + u64 + u64
writer.writeBoolean(isClosed);
writer.writeU256(totalMinted);
writer.writeU64(remainingBlocks);
writer.writeU64(deploymentBlock);
```

---

## REQUIRED Patterns

### 1. SafeMath for All Arithmetic

```typescript
// Always use SafeMath methods
SafeMath.add(a, b)    // Addition with overflow check
SafeMath.sub(a, b)    // Subtraction with underflow check
SafeMath.mul(a, b)    // Multiplication with overflow check
SafeMath.div(a, b)    // Division with zero check
```

### 2. Checks-Effects-Interactions Pattern

Even with ReentrancyGuard, always follow this pattern:

```typescript
@method({ name: 'amount', type: ABIDataTypes.UINT256 })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
public withdraw(calldata: Calldata): BytesWriter {
    const amount = calldata.readU256();

    // 1. CHECKS - Validate inputs
    if (amount.isZero()) {
        throw new Revert('Amount is zero');
    }

    const balance = this.balances.get(Blockchain.tx.sender);
    if (balance < amount) {
        throw new Revert('Insufficient balance');
    }

    // 2. EFFECTS - Update state
    this.balances.set(Blockchain.tx.sender, SafeMath.sub(balance, amount));

    // 3. INTERACTIONS - External calls last
    this.sendFunds(Blockchain.tx.sender, amount);

    return new BytesWriter(0);
}
```

### 3. Full Input Validation

```typescript
// WRONG - No validation
public freeMint(calldata: Calldata): BytesWriter {
    this._mint(Blockchain.tx.sender, MINT_AMOUNT);
    return new BytesWriter(1).writeBoolean(true);
}

// CORRECT - Full validation
public freeMint(calldata: Calldata): BytesWriter {
    // Check mint is open
    if (this.mintClosed.get()) {
        throw new Revert('Mint is closed');
    }

    // Check block deadline
    const deadline = SafeMath.add(this.deploymentBlock.get(), MINT_PERIOD);
    if (Blockchain.block.number >= deadline) {
        throw new Revert('Mint period ended');
    }

    // Check per-address limit
    const sender = Blockchain.tx.sender;
    const currentMints = this.mintsPerAddress.get(sender).get();
    if (u256.gte(currentMints, MAX_MINTS)) {
        throw new Revert('Max mints reached');
    }

    // Update state BEFORE minting (checks-effects-interactions)
    this.mintsPerAddress.get(sender).set(SafeMath.add(currentMints, u256.One));

    // Mint
    this._mint(sender, MINT_AMOUNT);

    return new BytesWriter(1).writeBoolean(true);
}
```

### 4. Always Extend Parent callMethod

```typescript
// WRONG - Breaks inherited functionality
public callMethod(calldata: Calldata): BytesWriter {
    switch (calldata.readSelector()) {
        case this.mySelector:
            return this.myMethod(calldata);
    }
    // Missing: return super.callMethod(calldata);
}

// CORRECT
public callMethod(calldata: Calldata): BytesWriter {
    const selector = calldata.readSelector();
    switch (selector) {
        case this.mySelector:
            return this.myMethod(calldata);
        default:
            return super.callMethod(calldata);  // Handle inherited methods
    }
}
```

---

## Gas-Efficient Patterns

### 1. Store Running Totals

Instead of computing aggregates on-demand, track them incrementally:

```typescript
class EfficientToken extends OP20 {
    private totalSupplyStorage: StoredU256;

    constructor() {
        super();
        this.totalSupplyStorage = new StoredU256(TOTAL_SUPPLY_POINTER);
    }

    // O(1) - Just read stored value
    public totalSupply(): u256 {
        return this.totalSupplyStorage.get();
    }

    protected _mint(to: Address, amount: u256): void {
        // Update running total - O(1)
        const current = this.totalSupplyStorage.get();
        this.totalSupplyStorage.set(SafeMath.add(current, amount));
    }
}
```

### 2. Use Maps Instead of Arrays for Lookups

```typescript
// WRONG - O(n) lookup
class BadWhitelist {
    private whitelist: Address[] = [];

    isWhitelisted(addr: Address): bool {
        for (let i = 0; i < this.whitelist.length; i++) {
            if (this.whitelist[i].equals(addr)) return true;
        }
        return false;
    }
}

// CORRECT - O(1) lookup
class GoodWhitelist {
    private whitelistMap: StoredMapU256;

    constructor() {
        this.whitelistMap = new StoredMapU256(WHITELIST_POINTER);
    }

    isWhitelisted(addr: Address): bool {
        return this.whitelistMap.get(addr) === u256.One;
    }
}
```

### 3. Pagination for Large Data Sets

```typescript
class PaginatedContract extends OP_NET {
    private readonly PAGE_SIZE: i32 = 100;

    @method({ name: 'page', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'data', type: ABIDataTypes.TUPLE_ARRAY },
        { name: 'hasMore', type: ABIDataTypes.BOOL }
    )
    public getHolders(calldata: Calldata): BytesWriter {
        const page = calldata.readU256().toI32();
        const start = page * this.PAGE_SIZE;
        const end = min(start + this.PAGE_SIZE, this.holderCount);
        // ... return paginated results
    }
}
```

### 4. Lazy Initialization

Initialize storage on first use rather than all at once:

```typescript
class LazyContract extends OP_NET {
    private _data: StoredU256 | null = null;
    private dataPointer: u16 = Blockchain.nextPointer;

    private get data(): StoredU256 {
        if (!this._data) {
            this._data = new StoredU256(this.dataPointer, EMPTY_POINTER);
        }
        return this._data;
    }
}
```

### 5. Counter Pattern

```typescript
private counterPointer: u16 = Blockchain.nextPointer;
private _counter: StoredU256 = new StoredU256(this.counterPointer, EMPTY_POINTER);

public getNextId(): u256 {
    const current = this._counter.value;
    this._counter.value = SafeMath.add(current, u256.One);
    return current;
}
```

### 6. Limit Array Size

```typescript
const MAX_ARRAY_SIZE: u32 = 1000;

public addItem(calldata: Calldata): BytesWriter {
    if (this.items.getLength() >= MAX_ARRAY_SIZE) {
        throw new Revert('Array size limit reached');
    }
    this.items.push(calldata.readU256());
    this.items.save();
    return new BytesWriter(0);
}
```

---

## Pointer Management Best Practices

### Allocation Rules

```typescript
@final
export class MyContract extends OP_NET {
    // Each call returns a unique, sequential u16
    private counterPointer: u16 = Blockchain.nextPointer;     // e.g., 0
    private ownerPointer: u16 = Blockchain.nextPointer;       // e.g., 1
    private balancesPointer: u16 = Blockchain.nextPointer;    // e.g., 2
}
```

1. **Call `nextPointer` once per storage slot** - Never reuse pointers
2. **Allocate at class level** - Pointers should be class properties
3. **Order matters** - Pointers are assigned sequentially
4. **Never hardcode** - Always use `Blockchain.nextPointer`

### Document Your Pointer Layout

```typescript
/**
 * Storage Layout:
 * Pointer 0: totalSupply (u256)
 * Pointer 1: name (string)
 * Pointer 2: symbol (string)
 * Pointer 3: decimals (u8)
 * Pointer 4: balances (address => u256)
 * Pointer 5: allowances (address => address => u256)
 * Pointer 6: paused (bool)
 */
export class MyToken extends OP20 {
    // ... pointers allocated in this order
}
```

### Group Related Pointers

```typescript
// Token metadata pointers
private namePointer: u16 = Blockchain.nextPointer;
private symbolPointer: u16 = Blockchain.nextPointer;
private decimalsPointer: u16 = Blockchain.nextPointer;

// Balance pointers
private balancesPointer: u16 = Blockchain.nextPointer;
private totalSupplyPointer: u16 = Blockchain.nextPointer;

// Approval pointers
private allowancesPointer: u16 = Blockchain.nextPointer;
```

### Never Reuse Pointers

```typescript
// WRONG: Reusing pointer for different data
private myPointer: u16 = Blockchain.nextPointer;
private valueA: StoredU256 = new StoredU256(this.myPointer, EMPTY_POINTER);
private valueB: StoredU256 = new StoredU256(this.myPointer, EMPTY_POINTER);  // BUG!

// CORRECT: Unique pointer for each
private pointerA: u16 = Blockchain.nextPointer;
private pointerB: u16 = Blockchain.nextPointer;
private valueA: StoredU256 = new StoredU256(this.pointerA, EMPTY_POINTER);
private valueB: StoredU256 = new StoredU256(this.pointerB, EMPTY_POINTER);
```

### Understand Inheritance

When extending contracts, parent pointers are allocated first:

```typescript
// OP20 allocates pointers 0-6 internally
export class MyToken extends OP20 {
    // Your pointers start after OP20's
    private customPointer: u16 = Blockchain.nextPointer;  // ~7
}
```

---

## Method Decorator Best Practices

### Always Use @view for Read-Only Methods

```typescript
// Good - clearly signals read-only to callers
@view
@method({ name: 'owner', type: ABIDataTypes.ADDRESS })
@returns({ name: 'balance', type: ABIDataTypes.UINT256 })
public balanceOf(calldata: Calldata): BytesWriter { ... }

// Bad - missing @view on a getter
@method({ name: 'owner', type: ABIDataTypes.ADDRESS })
@returns({ name: 'balance', type: ABIDataTypes.UINT256 })
public balanceOf(calldata: Calldata): BytesWriter { ... }
```

### Match Read Order with Parameter Order

```typescript
@method(
    { name: 'to', type: ABIDataTypes.ADDRESS },
    { name: 'amount', type: ABIDataTypes.UINT256 },
)
public transfer(calldata: Calldata): BytesWriter {
    // Read in same order as @method parameters
    const to = calldata.readAddress();       // First
    const amount = calldata.readU256();      // Second
    // ...
}
```

### Declare All Parameters

```typescript
// WRONG — zero ABI inputs, callers must hand-roll calldata
@method()
@returns({ name: 'success', type: ABIDataTypes.BOOL })
public airdrop(calldata: Calldata): BytesWriter {
    const count: u16 = calldata.readU16();
    // ...
}

// CORRECT — declare all inputs; tuples and structs are supported
@method({ name: 'entries', type: ABIDataTypes.TUPLE, components: [
    { name: 'recipient', type: ABIDataTypes.ADDRESS },
    { name: 'amountPill', type: ABIDataTypes.UINT64 },
    { name: 'amountMoto', type: ABIDataTypes.UINT64 },
]})
@returns({ name: 'success', type: ABIDataTypes.BOOL })
public airdrop(calldata: Calldata): BytesWriter { ... }
```

### Use Descriptive Names

```typescript
// Good - clear names
@method({ name: 'recipient', type: ABIDataTypes.ADDRESS })
@returns({ name: 'success', type: ABIDataTypes.BOOL })

// Less clear
@method({ name: 'a', type: ABIDataTypes.ADDRESS })
@returns({ name: 'r', type: ABIDataTypes.BOOL })
```

### Group Related Returns

```typescript
@view
@method()
@returns(
    { name: 'name', type: ABIDataTypes.STRING },
    { name: 'symbol', type: ABIDataTypes.STRING },
    { name: 'decimals', type: ABIDataTypes.UINT8 },
    { name: 'totalSupply', type: ABIDataTypes.UINT256 },
    { name: 'domainSeparator', type: ABIDataTypes.BYTES32 },
)
public metadata(_: Calldata): BytesWriter {
    // Single call returns all token metadata
}
```

---

## Event Best Practices

### Event for Every State Change

```typescript
@method()
@emit('Transferred')  // Decorator documents which event this method emits
public transfer(calldata: Calldata): BytesWriter {
    // Update state first
    this._transfer(from, to, amount);

    // Then emit event
    this.emitEvent(new TransferredEvent(from, to, amount));

    return new BytesWriter(0);
}
```

### Meaningful Event Names

```typescript
// Good: Descriptive names
@final class TokenStaked extends NetEvent { /* ... */ }
@final class RewardsClaimed extends NetEvent { /* ... */ }
@final class PoolCreated extends NetEvent { /* ... */ }

// Bad: Generic names
@final class Event1 extends NetEvent { /* ... */ }
@final class DataChanged extends NetEvent { /* ... */ }
```

### Include Context

```typescript
// Good: Include relevant context
@final
class SwapExecuted extends NetEvent {
    public constructor(
        user: Address,
        tokenIn: Address,
        tokenOut: Address,
        amountIn: u256,
        amountOut: u256,
        timestamp: u64
    ) {
        const data: BytesWriter = new BytesWriter(ADDRESS_BYTE_LENGTH * 3 + U256_BYTE_LENGTH * 2 + 8);
        data.writeAddress(user);
        data.writeAddress(tokenIn);
        data.writeAddress(tokenOut);
        data.writeU256(amountIn);
        data.writeU256(amountOut);
        data.writeU64(timestamp);
        super('SwapExecuted', data);
    }
}
```

### Check Event Size

Event data is limited to **352 bytes**:

```typescript
function testEventSize(): void {
    const event = new MyEvent(/* max size parameters */);
    assert(event.length <= 352, 'Event exceeds size limit');
}
```

---

## Reentrancy Protection

### Use STANDARD Mode by Default

```typescript
// Default to strictest protection
protected readonly reentrancyLevel: ReentrancyLevel = ReentrancyLevel.STANDARD;

// Only use CALLBACK when specifically needed
protected readonly reentrancyLevel: ReentrancyLevel = ReentrancyLevel.CALLBACK;
```

### Protect All State-Changing Functions

```typescript
// View functions can be excluded
protected override isSelectorExcluded(selector: Selector): boolean {
    const BALANCE_OF_SELECTOR: u32 = encodeSelector('balanceOf');
    const NAME_SELECTOR: u32 = encodeSelector('name');

    // Only exclude read-only functions
    if (selector === BALANCE_OF_SELECTOR) return true;
    if (selector === NAME_SELECTOR) return true;

    // All state-changing functions stay protected
    return false;
}
```

### Don't Over-Exclude

```typescript
// WRONG: Excluding state-changing functions
protected override isSelectorExcluded(selector: Selector): boolean {
    const TRANSFER_SELECTOR: u32 = encodeSelector('transfer');

    // DON'T exclude state-changing functions!
    if (selector === TRANSFER_SELECTOR) return true;  // DANGEROUS
    return false;
}
```

---

## Storage Patterns Reference

### Solidity vs OPNet Comparison

| Pattern | Solidity | OPNet |
|---------|----------|-------|
| Increment counter | `counter++;` | `counter.value = SafeMath.add(counter.value, u256.One);` |
| Read balance | `balances[addr]` | `balanceOf.get(addr)` |
| Write balance | `balances[addr] = x` | `balanceOf.set(addr, x)` |
| Check approval | `allowances[owner][spender]` | `allowances.get(owner).get(spender)` |
| Set approval | `allowances[owner][spender] = x` | `ownerMap.set(spender, x); allowances.set(owner, ownerMap);` |
| Array push | `arr.push(x)` | `arr.push(x); arr.save()` |
| Array length | `arr.length` | `arr.getLength()` |
| Array access | `arr[i]` | `arr.get(i)` |
| Require/revert | `require(cond, "msg")` | `if (!cond) throw new Revert("msg")` |
| Get sender | `msg.sender` | `Blockchain.tx.sender` |
| Get origin | `tx.origin` | `Blockchain.tx.origin` |
| Block number | `block.number` | `Blockchain.block.number` |

### Nested Mapping Pattern

```typescript
// Solidity: mapping(address => mapping(address => uint256)) public allowances;
private readonly allowancesPointer: u16 = Blockchain.nextPointer;
private readonly allowances: MapOfMap<u256>;

public constructor() {
    super();
    this.allowances = new MapOfMap<u256>(this.allowancesPointer);
}

// Getting nested value - two-step process
public getAllowance(owner: Address, spender: Address): u256 {
    const ownerMap = this.allowances.get(owner);  // Returns Nested<u256>
    return ownerMap.get(spender);                  // Returns u256
}

// Setting nested value - get, modify, commit back
protected setAllowance(owner: Address, spender: Address, amount: u256): void {
    const ownerMap = this.allowances.get(owner);
    ownerMap.set(spender, amount);
    this.allowances.set(owner, ownerMap);  // Commit back
}
```

---

## Project Organization

### Single Contract Project

```
src/
├── token/
│   ├── MyToken.ts
│   └── index.ts
└── tsconfig.json
```

### Multi-Contract Project

```
src/
├── token/
│   ├── MyToken.ts
│   └── index.ts
├── stablecoin/
│   ├── MyStablecoin.ts
│   └── index.ts
├── nft/
│   ├── MyNFT.ts
│   └── index.ts
├── shared/
│   ├── CustomTypes.ts
│   └── Helpers.ts
└── tsconfig.json
```

### Shared Logic Pattern

```typescript
// src/shared/Pausable.ts
export abstract class Pausable extends OP_NET {
    private _paused: StoredBoolean = new StoredBoolean(pausedPointer, false);

    protected whenNotPaused(): void {
        if (this._paused.value) {
            throw new Revert('Contract is paused');
        }
    }

    protected pause(): void {
        this.onlyDeployer(Blockchain.tx.sender);
        this._paused.value = true;
    }
}

// src/token/MyToken.ts
import { Pausable } from '../shared/Pausable';

export class MyToken extends Pausable {
    // Now has pause functionality
}
```

---

## Security Checklist

Before deploying, verify:

- [ ] All arithmetic uses SafeMath
- [ ] ReentrancyGuard on sensitive functions
- [ ] Access control on admin functions
- [ ] Input validation on all public methods
- [ ] No floating-point arithmetic
- [ ] No `tx.origin` for authentication
- [ ] Events emitted for state changes
- [ ] Tests cover edge cases
- [ ] No hardcoded secrets
- [ ] Proper BytesWriter sizes
- [ ] All parameters declared in `@method()`

---

## Complexity Diagnosis Checklist

When facing deployment or execution failures, check:

1. **Constructor operations** - Is heavy computation in the constructor (runs every call)?
2. **onDeployment loops** - Are you iterating during initialization?
3. **Array iterations** - Any O(n) operations over growing data?
4. **Map key iterations** - Are you calling `.keys()` on large maps?
5. **Unbounded growth** - Do arrays grow without cleanup?
6. **Bytecode size** - Is compressed bytecode under 128 KB?
7. **BytesWriter sizes** - Are all return writers sized correctly?
8. **Parent callMethod** - Does custom callMethod call `super.callMethod()`?

---

## Summary: Complexity vs. Limits

| Issue | NOT the problem | Likely the problem |
|-------|-----------------|-------------------|
| Too many pointers | Pointer limit is 65K | Operations on pointers |
| Constructor size | Calldata limit is 1MB | Computation in constructor |
| Deployment fails | Usually not bytecode size | Gas cost of initialization |
| Method fails | Usually not logic error | Missing validation or SafeMath |

**Rule of thumb:** OPNet limits are generous. Issues arise from **O(n) operations** where n can grow unboundedly, not from static limits on data structures.

---

## References

- OPNet Gas Optimization Documentation
- OPNet Storage System Documentation
- OPNet Ethereum Migration Guidelines
- OPNet Security Documentation
