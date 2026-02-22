# FrogOp Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FROGOP OPTIONS PROTOCOL                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      OptionsFactory.wasm                            │ │
│  │                                                                     │ │
│  │  createPool(underlying, premiumToken) → poolAddress                │ │
│  │  getPool(underlying, premiumToken) → poolAddress                   │ │
│  │  allPools(index) → poolAddress                                     │ │
│  │  poolCount() → u256                                                │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              │ deploys                                   │
│                              ▼                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      OptionsPool.wasm                               │ │
│  │                                                                     │ │
│  │  STORAGE:                                                           │ │
│  │  ├── underlying: Address          // e.g., MOTO                    │ │
│  │  ├── premiumToken: Address        // e.g., PILL                    │ │
│  │  ├── options: Map<u256, Option>   // Option structs                │ │
│  │  ├── nextOptionId: u256           // Counter                       │ │
│  │  └── paused: bool                 // Emergency stop                │ │
│  │                                                                     │ │
│  │  METHODS:                                                           │ │
│  │  ├── writeOption(type, strike, expiry, amount) → optionId         │ │
│  │  ├── buyOption(optionId) → success                                 │ │
│  │  ├── exercise(optionId) → success                                  │ │
│  │  ├── cancel(optionId) → success                                    │ │
│  │  └── settle(optionId) → success                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│          ┌───────────────────┼───────────────────┐                      │
│          │                   │                   │                       │
│          ▼                   ▼                   ▼                       │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                 │
│  │   PHASE 1    │   │   PHASE 2    │   │   PHASE 3    │                 │
│  │   Core       │   │   NativeSwap │   │   AMM        │                 │
│  │   OP20-only  │   │   BTC        │   │   Pools      │                 │
│  └──────────────┘   └──────────────┘   └──────────────┘                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Core Data Structures

### Option Struct

```typescript
struct Option {
    // Identification
    id: u256,
    
    // Parties
    writer: Address,        // Option seller (collateral provider)
    buyer: Address,         // Option holder (null if unpurchased)
    
    // Token pair
    underlying: Address,    // Token being optioned (e.g., MOTO)
    premiumToken: Address,  // Token for premium/strike (e.g., PILL)
    
    // Option details
    optionType: u8,         // 0 = Call, 1 = Put
    strikePrice: u256,      // Premium tokens per underlying token
    underlyingAmount: u256, // How much underlying this option covers
    premium: u256,          // Premium paid by buyer (in premiumToken)
    
    // Timing
    expiryBlock: u64,       // Block height when option expires
    createdBlock: u64,      // Block when option was written
    
    // State
    status: u8,             // 0=Open, 1=Purchased, 2=Exercised, 3=Expired, 4=Cancelled
}
```

### Storage Layout

```typescript
// Pointer allocation (AssemblyScript)
class OptionsPool extends Upgradeable {
    // Storage pointers
    private underlyingPointer: u16 = Blockchain.nextPointer;
    private premiumTokenPointer: u16 = Blockchain.nextPointer;
    private optionsPointer: u16 = Blockchain.nextPointer;
    private nextIdPointer: u16 = Blockchain.nextPointer;
    private pausedPointer: u16 = Blockchain.nextPointer;
    
    // Storage instances
    private _underlying: StoredAddress;
    private _premiumToken: StoredAddress;
    private _options: StoredMapU256;      // optionId → Option
    private _nextId: StoredU256;
    private _paused: StoredBoolean;
}
```

## Option Lifecycle

### Call Option Flow

```
┌─────────┐                    ┌─────────┐                    ┌─────────┐
│ WRITER  │                    │ CONTRACT│                    │  BUYER  │
└────┬────┘                    └────┬────┘                    └────┬────┘
     │                              │                              │
     │  1. writeOption()            │                              │
     │  Lock 100 MOTO collateral    │                              │
     │─────────────────────────────►│                              │
     │                              │                              │
     │                              │  2. buyOption()              │
     │                              │  Pay 5 PILL premium          │
     │                              │◄─────────────────────────────│
     │                              │                              │
     │                              │  Wait until expiry...        │
     │                              │                              │
     │                              │  3a. ITM (MOTO > 50 PILL)    │
     │                              │  Buyer exercises             │
     │                              │◄─────────────────────────────│
     │                              │                              │
     │                              │  Buyer receives 1 MOTO       │
     │                              │  Writer keeps 5 PILL         │
     │                              │─────────────────────────────►│
     │                              │                              │
     │                              │  OR                          │
     │                              │                              │
     │                              │  3b. OTM (MOTO ≤ 50 PILL)    │
     │                              │  Option expires worthless    │
     │                              │                              │
     │  Writer keeps 1 MOTO         │                              │
     │  Writer keeps 5 PILL         │                              │
     │◄─────────────────────────────│                              │
     │                              │                              │
```

### Put Option Flow

```
┌─────────┐                    ┌─────────┐                    ┌─────────┐
│ WRITER  │                    │ CONTRACT│                    │  BUYER  │
└────┬────┘                    └────┬────┘                    └────┬────┘
     │                              │                              │
     │  1. writeOption()            │                              │
     │  Lock 50 PILL collateral     │                              │
     │─────────────────────────────►│                              │
     │                              │                              │
     │                              │  2. buyOption()              │
     │                              │  Pay 3 PILL premium          │
     │                              │◄─────────────────────────────│
     │                              │                              │
     │                              │  Wait until expiry...        │
     │                              │                              │
     │                              │  3a. ITM (MOTO < 40 PILL)    │
     │                              │  Buyer exercises             │
     │                              │◄─────────────────────────────│
     │                              │                              │
     │                              │  Buyer sells 1 MOTO          │
     │                              │  Buyer receives 40 PILL      │
     │                              │─────────────────────────────►│
     │                              │                              │
     │                              │  OR                          │
     │                              │                              │
     │                              │  3b. OTM (MOTO ≥ 40 PILL)    │
     │                              │  Option expires worthless    │
     │                              │                              │
     │  Writer keeps 50 PILL        │                              │
     │  Writer keeps 3 PILL premium │                              │
     │◄─────────────────────────────│                              │
```

## State Machine

```
                    ┌─────────┐
                    │  OPEN   │  ← Option written, no buyer yet
                    └────┬────┘
                         │ buyOption()
                         ▼
                    ┌─────────┐
                    │PURCHASED│  ← Buyer paid premium
                    └────┬────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │EXERCISED │   │ EXPIRED  │   │ CANCELLED│
   │ (ITM)    │   │  (OTM)   │   │(pre-buy) │
   └──────────┘   └──────────┘   └──────────┘
```

## Price Determination

### No Oracle Required

Strike prices are expressed as **token pair ratios**, not external prices:

```
Call Option: "Right to buy 1 MOTO for 50 PILL"
- Strike = 50 PILL per MOTO
- Settlement: Compare current pool ratio at expiry
- ITM if: actualRatio > strikeRatio
```

### ITM/OTM Determination

```typescript
// At expiry, check if option is in-the-money
function isInTheMoney(option: Option): bool {
    // Get current token ratio from reserves or pool
    const currentRatio = this.getCurrentRatio();
    
    if (option.optionType === CALL) {
        // Call ITM when underlying is worth MORE than strike
        return currentRatio > option.strikePrice;
    } else {
        // Put ITM when underlying is worth LESS than strike
        return currentRatio < option.strikePrice;
    }
}
```

## Security Model

### Collateralization

| Option Type | Writer Locks | Max Loss |
|-------------|--------------|----------|
| Call | 100% underlying | 100% of underlying |
| Put | 100% strike value (in premiumToken) | 100% of strike |

### Time-Based Logic

**CRITICAL**: Always use `Blockchain.block.number` (block height), NEVER `medianTimestamp`.

```typescript
// CORRECT
const expired = Blockchain.block.number >= option.expiryBlock;

// WRONG - medianTimestamp is manipulable by miners
const expired = Blockchain.block.medianTimestamp >= option.expiryTimestamp;
```

### Reentrancy Protection

All state-changing methods use `ReentrancyGuard`:

```typescript
@method(...)
@nonReentrant
public buyOption(calldata: Calldata): BytesWriter {
    // State changes BEFORE external transfers
    this.updateOptionStatus(optionId, PURCHASED);
    
    // THEN transfer tokens
    this.transferPremium(option);
}
```

## Gas Optimization

### Storage Efficiency

```typescript
// Use smallest sufficient types
optionType: u8,        // 1 byte (only need 0 or 1)
status: u8,            // 1 byte (only need 0-4)
expiryBlock: u64,      // 8 bytes (block heights fit in u64)
strikePrice: u256,     // 32 bytes (large token amounts)
```

### Batch Operations

```typescript
// Future: Batch exercise multiple options
@method({ name: 'optionIds', type: ABIDataTypes.UINT256_ARRAY })
public batchExercise(calldata: Calldata): BytesWriter {
    // Process multiple exercises in single transaction
}
```

## Next Steps

- [OptionsFactory Contract](./contracts/OptionsFactory.md)
- [OptionsPool Contract](./contracts/OptionsPool.md)
- [Security Threat Model](./security/THREAT_MODEL.md)
