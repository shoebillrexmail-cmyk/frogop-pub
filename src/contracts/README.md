# src/contracts

Core smart contract implementations for the FroGop options protocol.

## Structure

```
contracts/
├── factory/              # OptionsFactory - creates and manages pools
│   ├── index.ts          # WASM entry point
│   └── contract.ts       # Implementation
└── pool/                 # OptionsPool - manages individual options
    ├── index.ts          # WASM entry point
    └── contract.ts       # Implementation
```

## Contracts

### factory/contract.ts

The factory contract manages the creation and registration of options pools.

**Key Features:**
- Pool deployment via `createPool()`
- Template management for pool creation
- Pool registry tracking (underlying → premiumToken → poolAddress)
- Owner-only administrative functions

**Storage Layout:**
```typescript
Pointer 10: owner (StoredAddress)
Pointer 11: poolTemplate (StoredAddress)
Pointer 12: pools (MapOfMap<u256>)
```

### pool/contract.ts

The pool contract manages individual options for a specific token pair.

**Key Features:**
- Write CALL/PUT options with collateral locking
- Purchase options with premium payment
- Exercise options during grace period
- Cancel options (with fee before purchase)
- Settle expired options

**Storage Layout:**
```typescript
Pointer 10: underlying (StoredAddress)
Pointer 11: premiumToken (StoredAddress)
Pointer 12: nextId (StoredU256)
Pointer 101: accumulatedFees (StoredU256) - lazy loaded
Pointer 200: options (OptionStorage with SHA256 keys) - lazy loaded
Pointer 300: locked (StoredBoolean) - lazy loaded
```

**Option Lifecycle:**
1. **OPEN** → Writer creates option
2. **PURCHASED** → Buyer purchases option
3. **EXERCISED** → Buyer exercises at expiry
4. **EXPIRED** → Auto-settled after grace period
5. **CANCELLED** → Writer cancels before purchase

## Design Patterns

### Hybrid Storage Pattern

Critical fields initialized in constructor, additional fields lazy-loaded:

```typescript
// Critical fields in constructor
private _underlying: StoredAddress;
private _premiumToken: StoredAddress;
private _nextId: StoredU256;

// Additional fields lazy-loaded on first access
private _locked: StoredBoolean | null = null;
private _accumulatedFees: StoredU256 | null = null;
private _options: OptionStorage | null = null;
```

### SHA256-Based Option Storage

Option storage uses SHA256-based keys for unlimited capacity:

```typescript
// StorageKey = SHA256(basePointer || optionId || slot)
// Allows unlimited options without pointer overflow
private getKey(optionId: u256, slot: u8): Uint8Array {
    const writer = new BytesWriter(35);
    writer.writeU16(this.basePointer);
    writer.writeU256(optionId);
    writer.writeU8(slot);
    return sha256(writer.getBuffer());
}
```

## Compilation

```bash
# Build individual contracts
npm run build:factory
npm run build:pool

# Build all
npm run build
```

Output goes to `build/` directory:
- `OptionsFactory.wasm` (~22KB)
- `OptionsPool.wasm` (~30KB)

## References

- [docs/contracts/OptionsFactory.md](../../docs/contracts/OptionsFactory.md) - Design specification
- [docs/contracts/OptionsPool.md](../../docs/contracts/OptionsPool.md) - Design specification
- [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) - System overview
