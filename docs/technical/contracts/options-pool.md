# OptionsPool Contracts

## Overview

The options pool system consists of a base class and three pool implementations, each handling a specific collateral model:

| Contract | Type | Underlying | Quote/Premium | Source |
|----------|------|-----------|---------------|--------|
| `OptionsPool` | 0 | OP20 | OP20 | `src/contracts/pool/contract.ts` |
| `OptionsPoolBtcQuote` | 1 | OP20 | BTC (satoshis) | `src/contracts/pool/btc-quote.ts` |
| `OptionsPoolBtcUnderlying` | 2 | BTC (satoshis) | OP20 | `src/contracts/pool/btc-underlying.ts` |

All inherit from `OptionsPoolBase` (`src/contracts/pool/base.ts`) which provides view methods, fee constants, pubkey registry, and storage.

Additionally, `SpreadRouter` (`src/contracts/router/contract.ts`) is a stateless orchestrator that executes multi-leg strategies atomically on type 0 and type 1 pools.

## Deployment

Deployed per-token-pair. Registered in [OptionsFactory](./options-factory.md) via `registerPool()`.

**Constructor calldata:**

Type 0 — 3 addresses + 1 u64:
```typescript
const underlying = calldata.readAddress();      // underlying token (e.g. MOTO)
const premiumToken = calldata.readAddress();    // premium token (e.g. PILL)
const feeRecipient = calldata.readAddress();    // protocol fee destination (must not be zero)
const gracePeriod = calldata.readU64();         // blocks after expiry for exercise (6–4320)
```

Type 1 and Type 2 — 3 addresses + 1 u64 + 1 address:
```typescript
const underlying = calldata.readAddress();      // underlying token
const premiumToken = calldata.readAddress();    // premium token
const feeRecipient = calldata.readAddress();    // protocol fee destination
const gracePeriod = calldata.readU64();         // blocks after expiry for exercise (6–4320)
const bridge = calldata.readAddress();          // NativeSwapBridge address (must not be zero)
```

## Constants

| Name | Value | Description |
|------|-------|-------------|
| `CALL` | `0` | Option type: right to buy underlying at strike |
| `PUT` | `1` | Option type: right to sell underlying at strike |
| `DEFAULT_GRACE_PERIOD_BLOCKS` | `144` | Default grace period (~1 day). Configurable per-pool at deployment. |
| `MIN_GRACE_PERIOD_BLOCKS` | `6` | Minimum allowed grace period (~1 hour) |
| `MAX_GRACE_PERIOD_BLOCKS` | `4320` | Maximum allowed grace period (~30 days) |
| `MAX_EXPIRY_BLOCKS` | `52560` | ~1 year maximum expiry from creation |
| `CANCEL_FEE_BPS` | `100` | 1% cancellation fee (basis points) |
| `BUY_FEE_BPS` | `100` | 1% buy fee deducted from premium |
| `EXERCISE_FEE_BPS` | `10` | 0.1% exercise fee on proceeds |
| `MAX_BATCH_SIZE` | `5` | Max options per batch operation (type 0 only) |
| `PRECISION` | `1e18` | Fixed-point precision for strike x amount math |
| `RESERVATION_EXPIRY_BLOCKS` | `144` | Reservation timeout (type 1 only) |

## Option States

```typescript
enum OptionStatus: u8 {
    OPEN = 0,       // Written, waiting for buyer
    PURCHASED = 1,  // Buyer paid premium
    EXERCISED = 2,  // Buyer exercised the option
    EXPIRED = 3,    // Settled after grace period (collateral returned to writer)
    CANCELLED = 4,  // Cancelled by writer (fee deducted)
    RESERVED = 5,   // Reserved for BTC commit (type 1 only)
}
```

## Option Data Structure

```typescript
class Option {
    id: u256;
    writer: Address;
    buyer: Address;
    strikePrice: u256;         // 18-decimal fixed-point
    underlyingAmount: u256;    // 18-decimal fixed-point (or satoshis for type 2 CALL)
    premium: u256;             // 18-decimal fixed-point
    expiryBlock: u64;
    createdBlock: u64;
    optionType: u8;            // 0=CALL, 1=PUT
    status: u8;                // 0-5 per OptionStatus
}
```

---

## Base View Methods (all pool types)

All pool types inherit these from `OptionsPoolBase`.

### underlying

Returns the underlying token address.

```typescript
@view @method('underlying')
@returns({ name: 'underlying', type: ABIDataTypes.ADDRESS })
public getUnderlying(_calldata: Calldata): BytesWriter
```

### premiumToken

Returns the premium token address.

```typescript
@view @method('premiumToken')
@returns({ name: 'premiumToken', type: ABIDataTypes.ADDRESS })
public getPremiumToken(_calldata: Calldata): BytesWriter
```

### getOption

Returns a single option record by ID. Response is a packed 202-byte record:

```
id(32) + writer(32) + buyer(32) + optionType(1) + strikePrice(32)
+ underlyingAmount(32) + premium(32) + expiryBlock(8) + status(1) = 202 bytes
```

```typescript
@view
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
public getOption(calldata: Calldata): BytesWriter
```

**Reverts:** `'Option not found'` if ID doesn't exist.

### optionCount

Returns total number of options ever created (next available ID).

```typescript
@view @method()
@returns({ name: 'count', type: ABIDataTypes.UINT256 })
public optionCount(_calldata: Calldata): BytesWriter
```

### getOptionsBatch

Returns a batch of options starting at `startId`. Capped at 9 options per call (OPNet 2048-byte response limit, 202 bytes per option).

```typescript
@view
@method(
    { name: 'startId', type: ABIDataTypes.UINT256 },
    { name: 'count', type: ABIDataTypes.UINT256 },
)
public getOptionsBatch(calldata: Calldata): BytesWriter
```

**Response:** `actualCount(32) + actualCount x option records (202 bytes each)`

### feeRecipient

Returns the protocol fee destination address.

```typescript
@view @method('feeRecipient')
@returns({ name: 'recipient', type: ABIDataTypes.ADDRESS })
public feeRecipientMethod(_calldata: Calldata): BytesWriter
```

### buyFeeBps / exerciseFeeBps / cancelFeeBps

Return fee rates in basis points.

```typescript
@view @method('buyFeeBps')
@returns({ name: 'bps', type: ABIDataTypes.UINT64 })
public buyFeeBpsMethod(_calldata: Calldata): BytesWriter     // 100 = 1%

@view @method('exerciseFeeBps')
@returns({ name: 'bps', type: ABIDataTypes.UINT64 })
public exerciseFeeBpsMethod(_calldata: Calldata): BytesWriter // 10 = 0.1%

@view @method()
@returns({ name: 'bps', type: ABIDataTypes.UINT64 })
public cancelFeeBps(_calldata: Calldata): BytesWriter         // 100 = 1%
```

### gracePeriodBlocks / maxExpiryBlocks

Return timing parameters. `gracePeriodBlocks` returns the per-pool value set at deployment (configurable, default 144). `maxExpiryBlocks` returns the compile-time constant.

```typescript
@view @method()
@returns({ name: 'blocks', type: ABIDataTypes.UINT64 })
public gracePeriodBlocks(_calldata: Calldata): BytesWriter    // per-pool stored value (default 144)

@view @method()
@returns({ name: 'blocks', type: ABIDataTypes.UINT64 })
public maxExpiryBlocks(_calldata: Calldata): BytesWriter      // 52560
```

### calculateCollateral

Calculates collateral required for an option. CALL: `underlyingAmount`. PUT: `(strikePrice * underlyingAmount) / PRECISION`.

```typescript
@view
@method(
    { name: 'optionType', type: ABIDataTypes.UINT8 },
    { name: 'strikePrice', type: ABIDataTypes.UINT256 },
    { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
)
@returns({ name: 'collateral', type: ABIDataTypes.UINT256 })
public calculateCollateral(calldata: Calldata): BytesWriter
```

### getRegisteredPubkey

Returns the registered BTC compressed pubkey for an address (33 bytes as bytes32).

```typescript
@view
@method({ name: 'addr', type: ABIDataTypes.ADDRESS })
@returns({ name: 'pubkey', type: ABIDataTypes.BYTES32 })
public getRegisteredPubkey(calldata: Calldata): BytesWriter
```

---

## Base State-Changing Methods (all pool types)

### registerBtcPubkey

Registers a compressed Bitcoin pubkey for the caller. Required before BTC pool operations (type 1 reserveOption, type 2 writeOptionBtc CALL).

```typescript
@nonReentrant
@method({ name: 'pubkey', type: ABIDataTypes.BYTES32 })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
public registerBtcPubkey(calldata: Calldata): BytesWriter
```

### updateFeeRecipient

Updates the protocol fee recipient address. Only callable by the current fee recipient.

```typescript
@nonReentrant
@method('updateFeeRecipient', { name: 'newRecipient', type: ABIDataTypes.ADDRESS })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('FeeRecipientUpdated')
public updateFeeRecipientMethod(calldata: Calldata): BytesWriter
```

---

## Type 0: OptionsPool (OP20/OP20)

**Source:** `src/contracts/pool/contract.ts`

Standard pool where both collateral and premium are OP20 tokens.

### writeOption

Creates a new option by locking OP20 collateral.

```typescript
@nonReentrant
@method(
    { name: 'optionType', type: ABIDataTypes.UINT8 },
    { name: 'strikePrice', type: ABIDataTypes.UINT256 },
    { name: 'expiryBlock', type: ABIDataTypes.UINT64 },
    { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
    { name: 'premium', type: ABIDataTypes.UINT256 },
)
@returns({ name: 'optionId', type: ABIDataTypes.UINT256 })
@emit('OptionWritten')
public writeOption(calldata: Calldata): BytesWriter
```

**Collateral:** CALL locks `underlyingAmount` of underlying. PUT locks `(strikePrice * underlyingAmount) / PRECISION` of premium token.

**Prerequisite:** Writer must approve collateral token spend to pool address.

### buyOption

Purchases an open option by paying OP20 premium. 1% buy fee deducted.

```typescript
@nonReentrant
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('OptionPurchased')
public buyOption(calldata: Calldata): BytesWriter
```

### exercise

Exercises a purchased option. Buyer only, during grace period.

```typescript
@nonReentrant
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('OptionExercised')
public exercise(calldata: Calldata): BytesWriter
```

**CALL exercise:** Buyer pays `strikeValue` in premium token to writer, receives `underlyingAmount - exerciseFee` of underlying.

**PUT exercise:** Buyer sends `underlyingAmount` of underlying to writer, receives `strikeValue - exerciseFee` of premium token.

### cancelOption

Cancels an unpurchased option. Writer only. 1% cancel fee (0% if expired).

```typescript
@nonReentrant
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('OptionCancelled')
public cancelOption(calldata: Calldata): BytesWriter
```

### settle

Settles an expired, unexercised option after grace period. Returns full collateral to writer. Callable by anyone.

```typescript
@nonReentrant
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('OptionExpired')
public settle(calldata: Calldata): BytesWriter
```

### transferOption

Transfers ownership of a purchased option to a new buyer.

```typescript
@nonReentrant
@method(
    { name: 'optionId', type: ABIDataTypes.UINT256 },
    { name: 'to', type: ABIDataTypes.ADDRESS },
)
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('OptionTransferred')
public transferOption(calldata: Calldata): BytesWriter
```

### rollOption

Atomically cancels an open option and creates a new one with updated parameters.

```typescript
@nonReentrant
@method(
    { name: 'optionId', type: ABIDataTypes.UINT256 },
    { name: 'newStrikePrice', type: ABIDataTypes.UINT256 },
    { name: 'newExpiryBlock', type: ABIDataTypes.UINT64 },
    { name: 'newPremium', type: ABIDataTypes.UINT256 },
)
@returns({ name: 'newOptionId', type: ABIDataTypes.UINT256 })
@emit('OptionRolled')
public rollOption(calldata: Calldata): BytesWriter
```

Emits `OptionCancelled` + `OptionWritten` + `OptionRolled` events.

### batchCancel

Cancels multiple OPEN options atomically. Reverts if ANY option fails.

```typescript
@nonReentrant
@method(
    { name: 'count', type: ABIDataTypes.UINT256 },
    { name: 'id0', type: ABIDataTypes.UINT256 },
    { name: 'id1', type: ABIDataTypes.UINT256 },
    { name: 'id2', type: ABIDataTypes.UINT256 },
    { name: 'id3', type: ABIDataTypes.UINT256 },
    { name: 'id4', type: ABIDataTypes.UINT256 },
)
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('OptionCancelled')
public batchCancel(calldata: Calldata): BytesWriter
```

### batchSettle

Settles multiple expired options. Non-atomic — skips unsettleable options.

```typescript
@nonReentrant
@method(
    { name: 'count', type: ABIDataTypes.UINT256 },
    { name: 'id0', type: ABIDataTypes.UINT256 },
    { name: 'id1', type: ABIDataTypes.UINT256 },
    { name: 'id2', type: ABIDataTypes.UINT256 },
    { name: 'id3', type: ABIDataTypes.UINT256 },
    { name: 'id4', type: ABIDataTypes.UINT256 },
)
@returns({ name: 'settledCount', type: ABIDataTypes.UINT256 })
@emit('OptionExpired')
public batchSettle(calldata: Calldata): BytesWriter
```

---

## Type 1: OptionsPoolBtcQuote (OP20 underlying, BTC quote)

**Source:** `src/contracts/pool/btc-quote.ts`

Premium and strike are denominated in BTC (satoshis). Collateral is OP20 tokens. Uses a two-phase commit for BTC payments: `reserveOption()` → `executeReservation()`.

### Additional View Methods

#### bridge

Returns the NativeSwapBridge address.

```typescript
@view @method('bridge')
@returns({ name: 'address', type: ABIDataTypes.ADDRESS })
public getBridge(_calldata: Calldata): BytesWriter
```

#### getReservation

Returns reservation data by ID.

```typescript
@view
@method({ name: 'reservationId', type: ABIDataTypes.UINT256 })
public getReservation(calldata: Calldata): BytesWriter
```

**Response:** `id(u256) + optionId(u256) + buyer(Address) + btcAmount(u256) + csvScriptHash(bytes32) + expiryBlock(u64) + status(u8)`

### State-Changing Methods

#### writeOption

Same as type 0 — locks OP20 collateral. Same signature.

#### reserveOption

Phase 1 of two-phase BTC commit. Transitions option OPEN → RESERVED. Queries bridge for BTC price and generates CSV script hash.

```typescript
@nonReentrant
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@returns({ name: 'reservationId', type: ABIDataTypes.UINT256 })
@emit('OptionReserved')
public reserveOption(calldata: Calldata): BytesWriter
```

**Prerequisite:** Writer must have registered BTC pubkey via `registerBtcPubkey`.

#### executeReservation

Phase 2 of two-phase BTC commit. Verifies BTC UTXO output in the calling transaction, transitions RESERVED → PURCHASED.

```typescript
@nonReentrant
@method({ name: 'reservationId', type: ABIDataTypes.UINT256 })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('ReservationExecuted')
public executeReservation(calldata: Calldata): BytesWriter
```

**Requires:** BTC `extraOutput` in the same transaction paying to the CSV P2WSH address.

#### cancelReservation

Cancels an expired reservation, returns option to OPEN state.

```typescript
@nonReentrant
@method({ name: 'reservationId', type: ABIDataTypes.UINT256 })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('ReservationCancelled')
public cancelReservation(calldata: Calldata): BytesWriter
```

Also emits `OptionRestored` event.

#### exercise

CALL exercise: buyer pays BTC strike via UTXO `extraOutput` to writer's CSV address, receives OP20 underlying minus 0.1% fee.

PUT exercise: same as type 0 (OP20 only, no BTC).

```typescript
@nonReentrant
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('OptionExercised')
public exercise(calldata: Calldata): BytesWriter
```

#### cancelOption / settle

Same as type 0 — OP20 collateral returned.

### Type 1-Specific Events

| Event | Emitted By | Data |
|-------|-----------|------|
| `OptionReserved` | `reserveOption` | reservationId, optionId, buyer, btcAmount, csvScriptHash, expiryBlock |
| `ReservationExecuted` | `executeReservation` | reservationId, optionId, buyer |
| `ReservationCancelled` | `cancelReservation` | reservationId, optionId |
| `OptionRestored` | `cancelReservation` | optionId |

---

## Type 2: OptionsPoolBtcUnderlying (BTC underlying, OP20 quote)

**Source:** `src/contracts/pool/btc-underlying.ts`

Writer locks BTC collateral for CALL options via P2WSH escrow. PUT options use OP20 premium token as collateral (same as base). Premium and strike are denominated in OP20.

### Additional View Methods

#### bridge

Returns the NativeSwapBridge address.

```typescript
@view @method('bridge')
@returns({ name: 'address', type: ABIDataTypes.ADDRESS })
public getBridge(_calldata: Calldata): BytesWriter
```

### State-Changing Methods

#### writeOptionBtc

Creates an option. CALL: verifies BTC UTXO output to P2WSH escrow. PUT: locks OP20 premium token.

```typescript
@nonReentrant
@method(
    { name: 'optionType', type: ABIDataTypes.UINT8 },
    { name: 'strikePrice', type: ABIDataTypes.UINT256 },
    { name: 'expiryBlock', type: ABIDataTypes.UINT64 },
    { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
    { name: 'premium', type: ABIDataTypes.UINT256 },
)
@returns({ name: 'optionId', type: ABIDataTypes.UINT256 })
@emit('OptionWrittenBtc')  // CALL
@emit('OptionWritten')     // PUT
public writeOptionBtc(calldata: Calldata): BytesWriter
```

**CALL requirements:**
- Writer must have registered BTC pubkey via `registerBtcPubkey`
- Transaction must include BTC `extraOutput` to escrow P2WSH address
- `underlyingAmount` is in satoshis (must fit in u64)
- Escrow derived from: `bridge.generateEscrowScriptHash(placeholderBuyer, writerPubkey, expiryBlock + gracePeriod)`

**PUT:** Same as type 0 `writeOption` — locks `(strikePrice * underlyingAmount) / PRECISION` of premium token.

> **Note:** This pool uses `writeOptionBtc` (different selector than `writeOption`). The base `writeOption` selector does not exist on type 2 pools.

#### buyOption

Buyer pays OP20 premium. Same as type 0. 1% buy fee.

```typescript
@nonReentrant
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('OptionPurchased')
public buyOption(calldata: Calldata): BytesWriter
```

#### exercise

CALL: buyer pays OP20 strike value to writer, BTC collateral marked claimable. Emits `BtcClaimable` event with escrow details for off-chain BTC sweep.

PUT: buyer sends BTC to writer's CSV address via `extraOutput`, receives OP20 strike value minus 0.1% fee.

```typescript
@nonReentrant
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('OptionExercised')
public exercise(calldata: Calldata): BytesWriter
```

#### cancelOption

CALL: no on-chain fee (BTC in P2WSH escrow). State → CANCELLED, escrow info emitted. Writer reclaims BTC via CLTV off-chain.

PUT: OP20 collateral returned with 1% cancel fee (same as type 0).

```typescript
@nonReentrant
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('OptionCancelled')
public cancelOption(calldata: Calldata): BytesWriter
```

#### settle

CALL: state → EXPIRED, escrow info emitted. Writer reclaims BTC via CLTV.

PUT: OP20 collateral returned to writer (same as type 0).

```typescript
@nonReentrant
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('OptionExpired')
public settle(calldata: Calldata): BytesWriter
```

### Type 2-Specific Events

| Event | Emitted By | Data |
|-------|-----------|------|
| `OptionWrittenBtc` | `writeOptionBtc` (CALL) | id, writer, optionType, strikePrice, underlyingAmount, premium, expiryBlock, escrowHash |
| `BtcClaimable` | `exercise` (CALL) | optionId, buyer, btcAmount, escrowHash |

### Extended Storage (per option)

| Slot | Contents |
|------|----------|
| 7 | btcCollateralAmount (u256, satoshis) |
| 8 | escrowScriptHash (bytes32) |

---

## SpreadRouter

**Source:** `src/contracts/router/contract.ts`

Stateless orchestrator for atomic multi-leg option strategies. Calls pool methods via `Blockchain.call()` with `stopOnFailure=true`.

**Key:** `Blockchain.tx.sender` is the wallet (not the router), so pool's `_transferFrom()` uses the wallet's balance directly.

### executeSpread

Write one option + buy another atomically (bull call spread, bear put spread).

```typescript
@method(
    { name: 'pool', type: ABIDataTypes.ADDRESS },
    { name: 'writeOptionType', type: ABIDataTypes.UINT8 },
    { name: 'writeStrikePrice', type: ABIDataTypes.UINT256 },
    { name: 'writeExpiryBlock', type: ABIDataTypes.UINT64 },
    { name: 'writeUnderlyingAmount', type: ABIDataTypes.UINT256 },
    { name: 'writePremium', type: ABIDataTypes.UINT256 },
    { name: 'buyOptionId', type: ABIDataTypes.UINT256 },
)
@returns({ name: 'newOptionId', type: ABIDataTypes.UINT256 })
public executeSpread(calldata: Calldata): BytesWriter
```

**Validation:** `buyOptionId` must not be zero.

### executeDualWrite

Write two options atomically (collar, straddle, strangle).

```typescript
@method(
    { name: 'pool', type: ABIDataTypes.ADDRESS },
    { name: 'type1', type: ABIDataTypes.UINT8 },
    { name: 'strike1', type: ABIDataTypes.UINT256 },
    { name: 'expiry1', type: ABIDataTypes.UINT64 },
    { name: 'amount1', type: ABIDataTypes.UINT256 },
    { name: 'premium1', type: ABIDataTypes.UINT256 },
    { name: 'type2', type: ABIDataTypes.UINT8 },
    { name: 'strike2', type: ABIDataTypes.UINT256 },
    { name: 'expiry2', type: ABIDataTypes.UINT64 },
    { name: 'amount2', type: ABIDataTypes.UINT256 },
    { name: 'premium2', type: ABIDataTypes.UINT256 },
)
@returns({ name: 'optionId1', type: ABIDataTypes.UINT256 })
public executeDualWrite(calldata: Calldata): BytesWriter
```

### Pool Type Compatibility

| Pool Type | executeSpread | executeDualWrite | Reason |
|-----------|--------------|-----------------|--------|
| Type 0 (OP20/OP20) | Supported | Supported | Has `writeOption` and `buyOption` |
| Type 1 (OP20/BTC) | Not supported | Supported | Has `writeOption` but no `buyOption` (uses reservation flow) |
| Type 2 (BTC/OP20) | Not supported | Not supported | Uses `writeOptionBtc` selector (different from `writeOption`) |

---

## Option Types

### Call Option

```
Call = Right to BUY underlying at strike price

Collateral: underlyingAmount of underlying token (or BTC for type 2)
ITM when: currentPrice > strikePrice

Exercise flow (type 0):
├── Buyer pays strikeValue in premium token → writer
├── Buyer receives underlyingAmount - exerciseFee of underlying → buyer
└── exerciseFee of underlying → feeRecipient
```

### Put Option

```
Put = Right to SELL underlying at strike price

Collateral: (strikePrice * underlyingAmount) / PRECISION of premium token
ITM when: currentPrice < strikePrice

Exercise flow (type 0):
├── Buyer sends underlyingAmount of underlying token → writer
├── Buyer receives strikeValue - exerciseFee of premium token → buyer
└── exerciseFee of premium token → feeRecipient
```

### Fixed-Point Math

All token amounts use 18-decimal encoding: "50 PILL" = `50n * 10n**18n`.

```
strikeValue = (strikePrice * underlyingAmount) / PRECISION
PRECISION = 1_000_000_000_000_000_000 (1e18)
```

### Fee Calculation (Ceiling Division)

All fees use ceiling division so the protocol never under-collects on dust:

```
fee = (amount * feeBps + 9999) / 10000
```

---

## Storage Layout

### Base (all pool types)

```
Pointer 0-1: ReentrancyGuard internal (statusPointer, depthPointer)
Pointer 2:  underlying (StoredAddress) — constructor-initialized
Pointer 3:  premiumToken (StoredAddress) — constructor-initialized
Pointer 4:  nextId (StoredU256) — constructor-initialized
Pointer 5:  feeRecipient (StoredAddress) — lazy-loaded
Pointer 6:  options base pointer — used by OptionStorage (SHA256-keyed)
Pointer 7:  pubkeyRegistry (AddressMap<Uint8Array>) — BTC pubkey per address
Pointer 8:  extended slots base pointer — for BTC pool extra data
Pointer 9:  gracePeriod (StoredU256 storing u64) — per-pool, set at deployment
```

### Option Storage (SHA256-keyed, per option)

| Slot | Contents | Size |
|------|----------|------|
| 0 | writer (Address) | 32 bytes |
| 1 | buyer (Address) | 32 bytes |
| 2 | strikePrice (u256) | 32 bytes |
| 3 | underlyingAmount (u256) | 32 bytes |
| 4 | premium (u256) | 32 bytes |
| 5 | expiryBlock (u64) + createdBlock (u64) — packed | 32 bytes (16 bytes used) |
| 6 | optionType (u8) + status (u8) — packed | 32 bytes (2 bytes used) |
| 7 | btcCollateralAmount (u256) — type 2 CALL only | 32 bytes |
| 8 | escrowScriptHash (bytes32) — type 2 CALL only | 32 bytes |

### Type 1 Additional Storage

```
BRIDGE_POINTER: bridge (StoredAddress) — NativeSwapBridge address
Reservation storage: SHA256-keyed map (ReservationStorage)
```

### Type 2 Additional Storage

```
BRIDGE_POINTER: bridge (StoredAddress) — NativeSwapBridge address
```

---

## Events

### Shared Events (all pool types)

| Event | Emitted By | Size | Fields |
|-------|-----------|------|--------|
| `OptionWritten` | `writeOption`, `rollOption` | 200 bytes | optionId, writer, optionType, strikePrice, underlyingAmount, premium, expiryBlock |
| `OptionPurchased` | `buyOption` | 168 bytes | optionId, buyer, writer, premium, writerAmount, blockNumber |
| `OptionExercised` | `exercise` | 193 bytes | optionId, buyer, writer, optionType, underlyingAmount, strikeValue, exerciseFee |
| `OptionExpired` | `settle`, `batchSettle` | 96 bytes | optionId, writer, collateralReturned |
| `OptionCancelled` | `cancelOption`, `batchCancel`, `rollOption` | 128 bytes | optionId, writer, collateralReturned, cancellationFee |
| `OptionTransferred` | `transferOption` | 96 bytes | optionId, from, to |
| `OptionRolled` | `rollOption` | 168 bytes | oldOptionId, newOptionId, writer, newStrikePrice, newExpiryBlock, newPremium |
| `FeeRecipientUpdated` | `updateFeeRecipient` | 64 bytes | oldRecipient, newRecipient |

### Type 1-Specific Events

| Event | Emitted By | Fields |
|-------|-----------|--------|
| `OptionReserved` | `reserveOption` | reservationId, optionId, buyer, btcAmount, csvScriptHash, expiryBlock |
| `ReservationExecuted` | `executeReservation` | reservationId, optionId, buyer |
| `ReservationCancelled` | `cancelReservation` | reservationId, optionId |
| `OptionRestored` | `cancelReservation` | optionId |

### Type 2-Specific Events

| Event | Emitted By | Fields |
|-------|-----------|--------|
| `OptionWrittenBtc` | `writeOptionBtc` (CALL) | optionId, writer, optionType, strikePrice, underlyingAmount, premium, expiryBlock, escrowHash |
| `BtcClaimable` | `exercise` (CALL) | optionId, buyer, btcAmount, escrowHash |

---

## Error Messages

| Message | Methods | Cause |
|---------|---------|-------|
| `'Option not found'` | getOption, cancelOption, buyOption, exercise, settle, transferOption, rollOption, batchCancel | Invalid option ID |
| `'Not open'` | cancelOption, buyOption, rollOption, batchCancel | Option already purchased/cancelled |
| `'Not purchased'` | exercise, settle, transferOption | Wrong status for operation |
| `'Not writer'` | cancelOption, rollOption, batchCancel | Caller is not the writer |
| `'Not buyer'` | exercise, transferOption | Caller is not the buyer |
| `'Already expired'` | buyOption | Block >= expiry |
| `'Not yet expired'` | exercise | Block < expiry |
| `'Grace period ended'` | exercise, transferOption | Block >= expiry + gracePeriod |
| `'Grace period not ended'` | settle | Block < expiry + gracePeriod |
| `'Grace period too short'` | onDeployment | gracePeriod < MIN_GRACE_PERIOD_BLOCKS (6) |
| `'Grace period too long'` | onDeployment | gracePeriod > MAX_GRACE_PERIOD_BLOCKS (4320) |
| `'Writer cannot buy own option'` | buyOption | Buyer == writer |
| `'Invalid recipient'` | transferOption | Zero address |
| `'Already owner'` | transferOption | Recipient == current buyer |
| `'Values must be > 0'` | writeOption, rollOption, writeOptionBtc | Strike, amount, or premium is zero |
| `'Invalid option type'` | writeOption, writeOptionBtc | optionType > 1 |
| `'Expiry in past'` | writeOption, rollOption, writeOptionBtc | expiryBlock <= currentBlock |
| `'Expiry too far'` | writeOption, rollOption, writeOptionBtc | expiryBlock > currentBlock + MAX_EXPIRY_BLOCKS |
| `'Only fee recipient'` | updateFeeRecipient | Caller is not current fee recipient |
| `'Zero address not allowed'` | updateFeeRecipient | New recipient is zero |
| `'Fee recipient cannot be zero'` | onDeployment | Constructor given zero fee recipient |
| `'Empty batch'` | batchCancel, batchSettle | count = 0 |
| `'Batch too large'` | batchCancel, batchSettle | count > MAX_BATCH_SIZE |
| `'BTC collateral output not found'` | writeOptionBtc (CALL) | No matching P2WSH output in TX |
| `'Underlying amount overflows u64'` | writeOptionBtc (CALL) | Amount too large for satoshis |
| `'Invalid writer pubkey length'` | writeOptionBtc (CALL) | Pubkey not 33 bytes |
| `'Reservation expired'` | executeReservation | Block >= reservation.expiryBlock |
| `'BTC strike payment not found'` | exercise (type 1 CALL) | No matching BTC output |
| `'Invalid pool address'` | SpreadRouter | Pool is zero address |
| `'Invalid buy option ID'` | SpreadRouter.executeSpread | buyOptionId is zero |
| `'Write leg failed'` | SpreadRouter | Pool writeOption reverted |
| `'Buy leg failed'` | SpreadRouter | Pool buyOption reverted |

## Access Control

| Method | Access |
|--------|--------|
| All view methods | Public |
| `writeOption` / `writeOptionBtc` | Any (locks caller's collateral) |
| `buyOption` | Any (except writer of that option) |
| `exercise` | Buyer only |
| `cancelOption` | Writer only |
| `settle` | Any (public good) |
| `transferOption` | Buyer only |
| `rollOption` | Writer only |
| `updateFeeRecipient` | Current fee recipient only |
| `registerBtcPubkey` | Any (registers for caller) |
| `batchCancel` | Writer of all options in batch |
| `batchSettle` | Any (public good) |
| `reserveOption` | Any (except writer) |
| `executeReservation` | Reservation buyer only |
| `cancelReservation` | Any (after expiry) |
| `executeSpread` / `executeDualWrite` | Any (SpreadRouter) |

## Sources

- `src/contracts/pool/base.ts` — base class
- `src/contracts/pool/contract.ts` — type 0 (OP20/OP20)
- `src/contracts/pool/btc-quote.ts` — type 1 (OP20/BTC)
- `src/contracts/pool/btc-underlying.ts` — type 2 (BTC/OP20)
- `src/contracts/router/contract.ts` — SpreadRouter
- `src/contracts/pool/constants.ts` — shared constants
- `src/contracts/pool/storage.ts` — option storage
- `src/contracts/pool/events.ts` — event definitions
