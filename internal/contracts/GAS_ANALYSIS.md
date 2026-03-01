# Gas Analysis: OPNet Constructor & Unit Test Framework

## Executive Summary

The OptionsPool contract (29KB WASM) exceeds the unit test framework's gas limit during WASM instantiation. This is caused by the framework re-instantiating the WASM module on every method call, not by our constructor code.

**Status**: OptionsFactory tests pass ✓ | OptionsPool tests fail ✗

---

## How OPNet Contracts Execute

### Execution Flow Per Call

```
┌─────────────────────────────────────────────────────────────┐
│ 1. WASM MODULE INSTANTIATION                                │
│    └── WASM start function runs                             │
│        • Proportional to WASM size (~30KB = ~5T gas)        │
│        • Unit test framework limit: 500B-5T                 │
│        • THIS IS THE BOTTLENECK                             │
├─────────────────────────────────────────────────────────────┤
│ 2. CONTRACT CONSTRUCTOR                                     │
│    └── super() called (empty in OP_NET)                     │
│    └── StoredAddress/StoredU256 initialization              │
│        • Just memory allocation, no storage I/O             │
│        • Minimal gas (<1M per field)                        │
├─────────────────────────────────────────────────────────────┤
│ 3. METHOD EXECUTION                                         │
│    └── execute() called with selector                       │
│    └── Actual business logic runs                           │
│    └── Storage reads/writes happen here                     │
└─────────────────────────────────────────────────────────────┘
```

### Key OPNet Concepts

| Concept | When It Runs | Purpose |
|---------|--------------|---------|
| WASM start function | Every module instantiation | AssemblyScript runtime init |
| Constructor | Every interaction | Initialize class fields |
| onDeployment | Only once at deployment | Set initial storage values |

**From OPNet Docs:**
> **Constructor**: Runs on EVERY contract interaction  
> **onDeployment**: Runs ONLY on first deployment

---

## Current Contract Analysis

### OptionsFactory (21,716 bytes)

```typescript
public constructor() {
    super();
    this._owner = new StoredAddress(OWNER_POINTER);        // ~1M gas
    this._poolTemplate = new StoredAddress(POOL_TEMPLATE_POINTER);  // ~1M gas
    this._pools = new MapOfMap<u256>(POOLS_POINTER);       // ~1M gas
}
```

**Constructor overhead**: ~3M gas (minimal)  
**WASM start function**: ~2T gas  
**Test status**: ✅ Passes (under limit)

### OptionsPool (29,474 bytes)

```typescript
public constructor() {
    super();
    this._underlying = new StoredAddress(UNDERLYING_POINTER);      // ~1M gas
    this._premiumToken = new StoredAddress(PREMIUM_TOKEN_POINTER); // ~1M gas
    this._nextId = new StoredU256(NEXT_ID_POINTER, EMPTY_BUFFER);  // ~1M gas
    // Lazy fields: locked, accumulatedFees, options (good pattern)
}
```

**Constructor overhead**: ~3M gas (minimal)  
**WASM start function**: ~5T gas  
**Test status**: ❌ Fails (exceeds 5T limit)

### Why Pool is Larger

| Component | Impact |
|-----------|--------|
| OptionStorage class | +3KB |
| 5 event classes | +2KB |
| 15+ methods | +4KB |
| Total overhead | ~9KB more than Factory |

---

## Root Cause

The issue is **NOT** the constructor code. The issue is:

1. **Unit test framework re-instantiates WASM on every call**
2. **WASM start function gas scales with module size**
3. **OptionsPool's 29KB exceeds the framework's gas allocation**

```
OptionsFactory: 21KB × ~100M/KB = ~2.1T gas (passes)
OptionsPool:    29KB × ~170M/KB = ~5T gas (fails)
```

---

## Options to Resolve

### Option 1: Reduce WASM Size (Recommended)

Refactor to eliminate class overhead by using direct Blockchain API.

**Before (class-based):**
```typescript
class OptionStorage {
    private basePointer: u16;
    
    getWriter(optionId: u256): Address {
        return Address.fromUint8Array(
            Blockchain.getStorageAt(this.getSlotPointer(optionId, 0))
        );
    }
}
```

**After (direct API):**
```typescript
// Inline helper functions, no class
@inline
function getOptionWriter(optionId: u256): Address {
    const ptr = OPTIONS_BASE + u16(optionId.toU64() * 7);
    return Address.fromUint8Array(Blockchain.getStorageAt(encodePtr(ptr)));
}
```

**Estimated savings**: 5-8KB WASM reduction  
**Risk**: Low, same functionality

### Option 2: Split Into Multiple Contracts

Separate concerns into smaller contracts:

```
OptionsPoolCore (15KB)
├── writeOption, buyOption, cancelOption
└── Minimal storage

OptionsPoolSettlement (10KB)  
├── exercise, settle
└── Called by Core contract
```

**Estimated savings**: Each contract under 20KB  
**Risk**: Medium, adds cross-contract calls

### Option 3: Remove Unused Code

Audit and remove:
- Unused imports (OP20, OP721 base classes add overhead)
- Unused event classes
- Dead code paths

**Estimated savings**: 2-4KB  
**Risk**: Low

### Option 4: Accept Limitation, Use Integration Tests

Document that:
- OptionsFactory unit tests work ✓
- OptionsPool requires testnet deployment for full testing
- Contracts work correctly on mainnet (4.5T block gas limit)

**Risk**: None, but less test coverage

---

## Recommended Action Plan

### Phase 1: Quick Wins (2-4 hours)

1. **Audit imports** - Remove unused OP20/OP721 imports
2. **Inline OptionStorage** - Convert class to inline functions
3. **Rebuild and measure** - Verify WASM size reduction

### Phase 2: If Needed (4-8 hours)

4. **Direct storage API** - Replace StoredAddress/StoredU256 with raw calls
5. **Minimize event classes** - Reduce to essential events only

### Phase 3: Last Resort

6. **Contract splitting** - Only if Phase 1-2 insufficient

---

## Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| OptionsPool WASM | 29,474 bytes | < 22,000 bytes |
| Start function gas | ~5T | < 3T |
| Unit tests | 1/22 pass | All pass |

---

## Appendix: StoredAddress Analysis

```typescript
// StoredAddress constructor does minimal work:
constructor(public pointer: u16) {
    this.addressPointer = encodePointer(pointer, EMPTY_POINTER, true, 'StoredAddress');
    // encodePointer just creates a 32-byte array, no storage I/O
}

// Storage read happens on first .value access:
public get value(): Address {
    this.ensureValue();  // Reads from storage here
    return this._value;
}
```

This confirms: **Constructor overhead is minimal. The WASM size is the problem.**
