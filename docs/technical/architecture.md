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
│  │  registerPool(poolAddress) → void                                  │ │
│  │  getPool(underlying, premiumToken) → poolAddress                   │ │
│  │  getPoolByIndex(index) → poolAddress                               │ │
│  │  getPoolCount() → u256                                             │ │
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
│  │  ├── writeOption(type, strike, expiry, amount, premium) → id      │ │
│  │  ├── buyOption(optionId) → success                                 │ │
│  │  ├── exercise(optionId) → success                                  │ │
│  │  ├── cancelOption(optionId) → success                              │ │
│  │  ├── settle(optionId) → success                                    │ │
│  │  ├── getOption(optionId) → Option                                  │ │
│  │  ├── getOptionsBatch(startId, count) → Option[]                   │ │
│  │  └── updateFeeRecipient(newRecipient) → void                      │ │
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

## Frontend Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Frontend (React 19 + Vite 7)                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Pages:   Landing │ Pool List │ Pool Detail │ Portfolio │ About      │
│                                                                      │
│  Components:                                                         │
│  ├── WriteOptionPanel    (create options, strategy templates)        │
│  ├── OptionsTable        (filterable, sortable, action buttons)     │
│  ├── BuyOptionModal      (premium display, P&L chart, Greeks)       │
│  ├── ExerciseModal       (ITM check, proceed/cancel)                │
│  ├── CancelModal / SettleModal                                      │
│  ├── PriceChart          (lightweight-charts, OHLCV candles)        │
│  └── TransactionToast    (TX tracking, receipt polling)             │
│                                                                      │
│  Hooks:                                                              │
│  ├── usePool             (pool info + options, paginated)           │
│  ├── useUserOptions      (indexer fast-path for portfolio)          │
│  ├── useTransactionFlow  (2-step approval + localStorage resume)   │
│  ├── useBlockTracker     (WS blocks + HTTP fallback)                │
│  └── useSuggestedPremium (Black-Scholes based)                      │
│                                                                      │
│  Services:                                                           │
│  ├── PoolService         (RPC: getOption, getOptionsBatch, views)   │
│  ├── IndexerService      (REST: /pools, /user, /prices)             │
│  └── FactoryService      (RPC: getPoolCount, getPoolByIndex)        │
│                                                                      │
│  State: React Context (WS, TX, Wallet)                              │
│  Wallet: @btc-vision/walletconnect (OPWallet browser extension)     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Indexer Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│               Indexer (Cloudflare Workers + D1 SQLite)                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Trigger: Cron (*/5 * * * *) ───► Poller                            │
│                                                                      │
│  Poller:                                                             │
│  ├── Fetches blocks from last_indexed → chain tip (max 20/run)     │
│  ├── Decodes pool events (OptionWritten, OptionPurchased, etc.)     │
│  ├── Decodes NativeSwap SwapExecuted events                         │
│  ├── Polls NativeSwap getQuote for spot prices                      │
│  └── Batched D1 writes (single db.batch() per cron)                │
│                                                                      │
│  Database (D1 SQLite):                                               │
│  ├── pools          (address, underlying, premium, created_at)      │
│  ├── options        (pool, id, writer, buyer, type, status, ...)   │
│  ├── transfers      (pool, option_id, from, to, block, tx)         │
│  ├── prices         (token, price, block_height, timestamp)         │
│  ├── candles        (token, interval, open, high, low, close, vol) │
│  └── indexer_state  (last_indexed_block)                            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Indexer REST API

Base URL: `https://api.frogop.net`

| Method | Endpoint | Description | Query Params |
|--------|----------|-------------|--------------|
| GET | `/health` | Health check + last indexed block | — |
| GET | `/pools` | List all tracked pools | — |
| GET | `/pools/:address` | Single pool details | — |
| GET | `/pools/:address/options` | Options for a pool | `writer`, `buyer`, `status`, `page`, `limit` |
| GET | `/pools/:address/options/:id` | Single option details | — |
| GET | `/pools/:address/options/:id/transfers` | Transfer history for option | — |
| GET | `/user/:address/options` | All options for user (writer or buyer) | — |
| GET | `/user/:address/transfers` | All transfers for user | — |
| GET | `/prices/:token/candles` | OHLCV candles | `interval` (1h/4h/1d/1w), `from`, `to`, `limit` |
| GET | `/prices/:token/latest` | Latest spot price | — |
| GET | `/prices/:token/history` | Raw price history | `from`, `to`, `limit` |

Tokens: `MOTO`, `PILL`, `MOTO_PILL` (cross-rate). CORS: `frogop.net`, `*.workers.dev`, `*.pages.dev`, `localhost`.

## Fee System

| Action | Fee (bps) | Applied To | Recipient |
|--------|-----------|------------|-----------|
| Write | 0 | — | — |
| Buy | 100 (1%) | Premium — deducted before writer receives | feeRecipient |
| Exercise | 10 (0.1%) | Buyer's proceeds | feeRecipient |
| Cancel (before expiry) | 100 (1%) | Collateral — deducted from writer's refund | feeRecipient |
| Cancel (after expiry) | 0 | — | — |
| Settle | 0 | — | — |

Fees use ceiling division. `feeRecipient` is set at pool deployment and updatable by current recipient only.

## Next Steps

- [OptionsFactory Contract](./contracts/OptionsFactory.md)
- [OptionsPool Contract](./contracts/OptionsPool.md)
- [Security Threat Model](./security/THREAT_MODEL.md)
