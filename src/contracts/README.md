# src/contracts

Core smart contract implementations for the FroGop options protocol.

## Structure

```
contracts/
├── factory/              # OptionsFactory - creates and manages pools
│   ├── index.ts          # WASM entry point
│   └── contract.ts       # Implementation
├── pool/                 # OptionsPool - manages individual options
│   ├── index.ts          # WASM entry point
│   └── contract.ts       # Implementation
└── test-contracts/       # Demonstration contracts
    ├── three-field/      # 3-field gas limit demo
    └── four-field/       # 4-field gas limit demo
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

**Gas Optimization:** Uses 3-field constructor pattern to avoid WASM start function gas limit.

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
Pointer 100: locked (StoredBoolean) - lazy loaded
Pointer 101: accumulatedFees (StoredU256) - lazy loaded
Pointer 102: options (OptionStorage) - lazy loaded
```

**Option Lifecycle:**
1. **OPEN** → Writer creates option
2. **PURCHASED** → Buyer purchases option
3. **EXERCISED** → Buyer exercises at expiry
4. **EXPIRED** → Auto-settled after grace period
5. **CANCELLED** → Writer cancels before purchase

### test-contracts/

Demonstration contracts used to document the WASM start function gas limit.

- **three-field/**: Simple contract with 3 storage fields (17KB WASM)
- **four-field/**: Simple contract with 4 storage fields (17KB WASM)

See [tests/GasLimitDemonstration.test.ts](../../tests/GasLimitDemonstration.test.ts) for the demonstration.

## Design Patterns

### Hybrid Storage Pattern

To avoid gas limits while maintaining functionality:

```typescript
// 3 critical fields in constructor
private _owner: StoredAddress;
private _poolTemplate: StoredAddress;
private _pools: MapOfMap<u256>;

// Additional fields lazy-loaded on first access
private _poolCount: StoredU256 | null = null;
```

### Reentrancy Guard

```typescript
private _locked: StoredBoolean | null = null;

public writeOption(calldata: Calldata): BytesWriter {
    if (this.locked.value) throw new Revert('LOCKED');
    this.locked.value = true;
    // ... business logic ...
    this.locked.value = false;
}
```

## Known Issues

### Gas Limit in Tests

**OptionsPool** (946 lines, 30KB WASM) exceeds the unit test framework's 500B gas limit during deployment. This is a test framework constraint only - the contract works on mainnet (4.5T gas target).

**Workaround:**
- Factory tests work (21KB WASM, 3 fields)
- Pool tests require testnet/regtest deployment
- See [docs/tests/UNIT_TESTS_STATUS.md](../../docs/tests/UNIT_TESTS_STATUS.md)

## Compilation

```bash
# Build individual contracts
npm run build:factory
npm run build:pool

# Build all
npm run build

# Build test contracts
npm run build:three-field
npm run build:four-field
```

Output goes to `build/` directory:
- `OptionsFactory.wasm` (21KB)
- `OptionsPool.wasm` (30KB)

## References

- [docs/contracts/OptionsFactory.md](../../docs/contracts/OptionsFactory.md) - Design specification
- [docs/contracts/OptionsPool.md](../../docs/contracts/OptionsPool.md) - Design specification
- [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) - System overview
