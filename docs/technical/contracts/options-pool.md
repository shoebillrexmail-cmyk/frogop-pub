# OptionsPool Contract

## Overview

OptionsPool is the core contract for an individual option market. Each pool handles a specific token pair (underlying + premium token) and manages the full option lifecycle: write, buy, exercise, settle, cancel, transfer, and roll. Includes batch operations and a protocol fee system.

**Source:** `src/contracts/pool/contract.ts` (1,398 lines)

## Deployment

Deployed per-token-pair. Registered in [OptionsFactory](./options-factory.md) via `registerPool()`.

**Constructor calldata (3 addresses):**

```typescript
// onDeployment reads:
const underlying = calldata.readAddress();      // underlying token (e.g. MOTO)
const premiumToken = calldata.readAddress();    // premium token (e.g. PILL)
const feeRecipient = calldata.readAddress();    // protocol fee destination (must not be zero)
```

## Constants

| Name | Value | Description |
|------|-------|-------------|
| `CALL` | `0` | Option type: right to buy underlying at strike |
| `PUT` | `1` | Option type: right to sell underlying at strike |
| `GRACE_PERIOD_BLOCKS` | `144` | ~1 day for buyer to exercise after expiry |
| `MAX_EXPIRY_BLOCKS` | `52560` | ~1 year maximum expiry from creation |
| `CANCEL_FEE_BPS` | `100` | 1% cancellation fee (basis points) |
| `BUY_FEE_BPS` | `100` | 1% buy fee deducted from premium |
| `EXERCISE_FEE_BPS` | `10` | 0.1% exercise fee on proceeds |
| `MAX_BATCH_SIZE` | `5` | Max options per batch operation |
| `PRECISION` | `1e18` | Fixed-point precision for strike x amount math |

## Option States

```typescript
enum OptionStatus: u8 {
    OPEN = 0,       // Written, waiting for buyer
    PURCHASED = 1,  // Buyer paid premium
    EXERCISED = 2,  // Buyer exercised the option
    EXPIRED = 3,    // Settled after grace period (collateral returned to writer)
    CANCELLED = 4,  // Cancelled by writer (fee deducted)
}
```

## Option Data Structure

```typescript
class Option {
    id: u256;
    writer: Address;
    buyer: Address;
    strikePrice: u256;         // 18-decimal fixed-point
    underlyingAmount: u256;    // 18-decimal fixed-point
    premium: u256;             // 18-decimal fixed-point
    expiryBlock: u64;
    createdBlock: u64;
    optionType: u8;            // 0=CALL, 1=PUT
    status: u8;                // 0-4 per OptionStatus
}
```

## ABI

```typescript
const OPTIONS_POOL_ABI = [
    // === View Methods ===
    { name: 'underlying', inputs: [], outputs: [{ name: 'underlying', type: 'address' }] },
    { name: 'premiumToken', inputs: [], outputs: [{ name: 'premiumToken', type: 'address' }] },
    {
        name: 'getOption',
        inputs: [{ name: 'optionId', type: 'uint256' }],
        outputs: [/* 202-byte packed record */],
    },
    { name: 'optionCount', inputs: [], outputs: [{ name: 'count', type: 'uint256' }] },
    {
        name: 'getOptionsBatch',
        inputs: [
            { name: 'startId', type: 'uint256' },
            { name: 'count', type: 'uint256' },
        ],
        outputs: [/* u256 actualCount + actualCount x 202-byte records */],
    },
    { name: 'feeRecipient', inputs: [], outputs: [{ name: 'recipient', type: 'address' }] },
    { name: 'buyFeeBps', inputs: [], outputs: [{ name: 'bps', type: 'uint64' }] },
    { name: 'exerciseFeeBps', inputs: [], outputs: [{ name: 'bps', type: 'uint64' }] },
    { name: 'cancelFeeBps', inputs: [], outputs: [{ name: 'bps', type: 'uint64' }] },
    { name: 'gracePeriodBlocks', inputs: [], outputs: [{ name: 'blocks', type: 'uint64' }] },
    { name: 'maxExpiryBlocks', inputs: [], outputs: [{ name: 'blocks', type: 'uint64' }] },
    {
        name: 'calculateCollateral',
        inputs: [
            { name: 'optionType', type: 'uint8' },
            { name: 'strikePrice', type: 'uint256' },
            { name: 'underlyingAmount', type: 'uint256' },
        ],
        outputs: [{ name: 'collateral', type: 'uint256' }],
    },

    // === State-Changing Methods ===
    {
        name: 'writeOption',
        inputs: [
            { name: 'optionType', type: 'uint8' },
            { name: 'strikePrice', type: 'uint256' },
            { name: 'expiryBlock', type: 'uint64' },
            { name: 'underlyingAmount', type: 'uint256' },
            { name: 'premium', type: 'uint256' },
        ],
        outputs: [{ name: 'optionId', type: 'uint256' }],
    },
    {
        name: 'buyOption',
        inputs: [{ name: 'optionId', type: 'uint256' }],
        outputs: [{ name: 'success', type: 'bool' }],
    },
    {
        name: 'exercise',
        inputs: [{ name: 'optionId', type: 'uint256' }],
        outputs: [{ name: 'success', type: 'bool' }],
    },
    {
        name: 'cancelOption',
        inputs: [{ name: 'optionId', type: 'uint256' }],
        outputs: [{ name: 'success', type: 'bool' }],
    },
    {
        name: 'settle',
        inputs: [{ name: 'optionId', type: 'uint256' }],
        outputs: [{ name: 'success', type: 'bool' }],
    },
    {
        name: 'transferOption',
        inputs: [
            { name: 'optionId', type: 'uint256' },
            { name: 'to', type: 'address' },
        ],
        outputs: [{ name: 'success', type: 'bool' }],
    },
    {
        name: 'rollOption',
        inputs: [
            { name: 'optionId', type: 'uint256' },
            { name: 'newStrikePrice', type: 'uint256' },
            { name: 'newExpiryBlock', type: 'uint64' },
            { name: 'newPremium', type: 'uint256' },
        ],
        outputs: [{ name: 'newOptionId', type: 'uint256' }],
    },
    {
        name: 'updateFeeRecipient',
        inputs: [{ name: 'newRecipient', type: 'address' }],
        outputs: [{ name: 'success', type: 'bool' }],
    },
    {
        name: 'batchCancel',
        inputs: [
            { name: 'count', type: 'uint256' },
            { name: 'id0', type: 'uint256' },
            { name: 'id1', type: 'uint256' },
            { name: 'id2', type: 'uint256' },
            { name: 'id3', type: 'uint256' },
            { name: 'id4', type: 'uint256' },
        ],
        outputs: [{ name: 'success', type: 'bool' }],
    },
    {
        name: 'batchSettle',
        inputs: [
            { name: 'count', type: 'uint256' },
            { name: 'id0', type: 'uint256' },
            { name: 'id1', type: 'uint256' },
            { name: 'id2', type: 'uint256' },
            { name: 'id3', type: 'uint256' },
            { name: 'id4', type: 'uint256' },
        ],
        outputs: [{ name: 'settledCount', type: 'uint256' }],
    },
];
```

## Methods

### View Methods

#### underlying

Returns the underlying token address (set at deployment).

```typescript
@view @method('underlying')
@returns({ name: 'underlying', type: ABIDataTypes.ADDRESS })
public getUnderlying(_calldata: Calldata): BytesWriter
```

#### premiumToken

Returns the premium token address (set at deployment).

```typescript
@view @method('premiumToken')
@returns({ name: 'premiumToken', type: ABIDataTypes.ADDRESS })
public getPremiumToken(_calldata: Calldata): BytesWriter
```

#### getOption

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

#### optionCount

Returns total number of options ever created (next available ID).

```typescript
@view @method()
@returns({ name: 'count', type: ABIDataTypes.UINT256 })
public optionCount(_calldata: Calldata): BytesWriter
```

#### getOptionsBatch

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

Returns `actualCount = 0` if `startId >= optionCount`.

#### feeRecipient

Returns the protocol fee destination address.

```typescript
@view @method('feeRecipient')
@returns({ name: 'recipient', type: ABIDataTypes.ADDRESS })
public feeRecipientMethod(_calldata: Calldata): BytesWriter
```

#### buyFeeBps

Returns the buy fee in basis points (100 = 1%).

```typescript
@view @method('buyFeeBps')
@returns({ name: 'bps', type: ABIDataTypes.UINT64 })
public buyFeeBpsMethod(_calldata: Calldata): BytesWriter
```

#### exerciseFeeBps

Returns the exercise fee in basis points (10 = 0.1%).

```typescript
@view @method('exerciseFeeBps')
@returns({ name: 'bps', type: ABIDataTypes.UINT64 })
public exerciseFeeBpsMethod(_calldata: Calldata): BytesWriter
```

#### cancelFeeBps

Returns the cancel fee in basis points (100 = 1%).

```typescript
@view @method()
@returns({ name: 'bps', type: ABIDataTypes.UINT64 })
public cancelFeeBps(_calldata: Calldata): BytesWriter
```

#### gracePeriodBlocks

Returns the grace period in blocks (144 = ~1 day).

```typescript
@view @method()
@returns({ name: 'blocks', type: ABIDataTypes.UINT64 })
public gracePeriodBlocks(_calldata: Calldata): BytesWriter
```

#### maxExpiryBlocks

Returns the maximum expiry duration in blocks (52560 = ~1 year).

```typescript
@view @method()
@returns({ name: 'blocks', type: ABIDataTypes.UINT64 })
public maxExpiryBlocks(_calldata: Calldata): BytesWriter
```

#### calculateCollateral

Calculates the collateral required for an option. CALL: `underlyingAmount`. PUT: `(strikePrice * underlyingAmount) / PRECISION`.

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

### State-Changing Methods

#### writeOption

Creates a new option by locking collateral. **5 parameters** (not 4 — premium is writer-specified).

```typescript
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

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| optionType | u8 | 0 = Call, 1 = Put |
| strikePrice | u256 | Strike price (18-decimal fixed-point) |
| expiryBlock | u64 | Block height for expiry |
| underlyingAmount | u256 | Amount of underlying covered (18-decimal) |
| premium | u256 | Premium price set by writer (18-decimal) |

**Validation:**
- `optionType` must be 0 or 1
- `strikePrice`, `underlyingAmount`, `premium` must all be > 0
- `expiryBlock` must be in future and within `MAX_EXPIRY_BLOCKS` from current block

**Collateral:**
- CALL: locks `underlyingAmount` of underlying token
- PUT: locks `(strikePrice * underlyingAmount) / PRECISION` of premium token

**Prerequisite:** Writer must approve collateral token spend to pool address.

#### buyOption

Purchases an open option by paying premium. 1% buy fee deducted from premium before writer receives.

```typescript
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('OptionPurchased')
public buyOption(calldata: Calldata): BytesWriter
```

**Conditions:**
1. Option must be `OPEN`
2. Option must not be expired
3. Buyer must not be the writer
4. Buyer must have approved premium token spend

**Fee:** `buyFee = ceil(premium * BUY_FEE_BPS / 10000)`, writer receives `premium - buyFee`.

#### exercise

Exercises a purchased option. Only callable by buyer, only during grace period (between expiry and expiry + 144 blocks).

```typescript
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('OptionExercised')
public exercise(calldata: Calldata): BytesWriter
```

**Conditions:**
1. Option must be `PURCHASED`
2. Caller must be the buyer
3. Current block >= expiry block (not before expiry)
4. Current block < expiry + GRACE_PERIOD_BLOCKS (within grace period)

**CALL exercise:**
- Buyer pays `strikeValue = (strikePrice * underlyingAmount) / PRECISION` in premium token to writer
- Buyer receives `underlyingAmount - exerciseFee` of underlying token
- `exerciseFee = ceil(underlyingAmount * EXERCISE_FEE_BPS / 10000)`

**PUT exercise:**
- Buyer sends `underlyingAmount` of underlying token to writer
- Buyer receives `strikeValue - exerciseFee` of premium token
- `exerciseFee = ceil(strikeValue * EXERCISE_FEE_BPS / 10000)`

#### settle

Settles an expired, unexercised option after grace period. Returns full collateral to writer. Callable by anyone.

```typescript
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('OptionExpired')
public settle(calldata: Calldata): BytesWriter
```

**Conditions:**
1. Option must be `PURCHASED`
2. Current block >= expiry + GRACE_PERIOD_BLOCKS (grace period ended)

**No fee** — writer receives full collateral back.

#### cancelOption

Cancels an unpurchased option. Writer only. 1% cancel fee applies (0% if already expired).

```typescript
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('OptionCancelled')
public cancelOption(calldata: Calldata): BytesWriter
```

**Conditions:**
1. Option must be `OPEN`
2. Caller must be the writer

**Fee:** If unexpired: `cancelFee = ceil(collateral * CANCEL_FEE_BPS / 10000)`. If expired: fee = 0 (full collateral returned).

#### transferOption

Transfers ownership of a purchased option to a new buyer. No fee.

```typescript
@method(
    { name: 'optionId', type: ABIDataTypes.UINT256 },
    { name: 'to', type: ABIDataTypes.ADDRESS },
)
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('OptionTransferred')
public transferOption(calldata: Calldata): BytesWriter
```

**Conditions:**
1. Option must be `PURCHASED`
2. Caller must be the current buyer
3. Recipient must not be zero address
4. Recipient must not be current buyer
5. Grace period must not have ended

#### rollOption

Atomically cancels an open option and creates a new one with updated parameters. Same underlying amount and option type are preserved.

```typescript
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

**Conditions:**
1. Option must be `OPEN`
2. Caller must be the writer
3. `newStrikePrice` and `newPremium` must be > 0
4. `newExpiryBlock` must be in future and within `MAX_EXPIRY_BLOCKS`

**Collateral handling:**
- Cancel fee applied to old collateral (0% if expired)
- Net difference settled: writer tops up if new collateral > (old - fee), surplus returned if less
- Emits `OptionCancelled` + `OptionWritten` + `OptionRolled` events for indexer compatibility

#### updateFeeRecipient

Updates the protocol fee recipient address. Only callable by the current fee recipient.

```typescript
@method('updateFeeRecipient', { name: 'newRecipient', type: ABIDataTypes.ADDRESS })
@returns({ name: 'success', type: ABIDataTypes.BOOL })
@emit('FeeRecipientUpdated')
public updateFeeRecipientMethod(calldata: Calldata): BytesWriter
```

**Conditions:**
1. Caller must be the current fee recipient
2. New address must not be zero

### Batch Operations

Both batch methods use fixed 6-param calldata: `count(u256) + id0 + id1 + id2 + id3 + id4`. Always reads 5 IDs; unused slots padded with 0. MAX_BATCH_SIZE = 5.

#### batchCancel

Cancels multiple OPEN options atomically. Reverts if ANY option fails validation.

```typescript
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

**Behavior:** Atomic — if any option is not found, not open, or not owned by caller, the entire batch reverts. Emits individual `OptionCancelled` events per option.

#### batchSettle

Settles multiple expired options. Non-atomic — skips unsettleable options.

```typescript
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

**Behavior:** Non-atomic — skips options that don't exist, aren't PURCHASED, or whose grace period hasn't ended. Returns count of successfully settled options. Emits individual `OptionExpired` events per settled option. Callable by anyone.

## Option Types

### Call Option

```
Call = Right to BUY underlying at strike price

Collateral: underlyingAmount of underlying token
ITM when: currentPrice > strikePrice

Exercise flow:
├── Buyer pays strikeValue in premium token → writer
├── Buyer receives underlyingAmount - exerciseFee of underlying → buyer
└── exerciseFee of underlying → feeRecipient
```

### Put Option

```
Put = Right to SELL underlying at strike price

Collateral: (strikePrice * underlyingAmount) / PRECISION of premium token
ITM when: currentPrice < strikePrice

Exercise flow:
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

## Storage Layout

```
Pointer 0-1: ReentrancyGuard internal (statusPointer, depthPointer)
Pointer 2:  underlying (StoredAddress) — constructor-initialized
Pointer 3:  premiumToken (StoredAddress) — constructor-initialized
Pointer 4:  nextId (StoredU256) — constructor-initialized, incremented per writeOption/rollOption
Pointer 5:  feeRecipient (StoredAddress) — lazy-loaded on first access
Pointer 6:  options base pointer — used by OptionStorage (SHA256-keyed)
```

### Option Storage (SHA256-keyed)

Each option uses 7 storage slots, keyed by `SHA256(basePointer || optionId || slotIndex)`:

| Slot | Contents | Size |
|------|----------|------|
| 0 | writer (Address) | 32 bytes |
| 1 | buyer (Address) | 32 bytes |
| 2 | strikePrice (u256) | 32 bytes |
| 3 | underlyingAmount (u256) | 32 bytes |
| 4 | premium (u256) | 32 bytes |
| 5 | expiryBlock (u64) + createdBlock (u64) — packed | 32 bytes (16 bytes used) |
| 6 | optionType (u8) + status (u8) — packed | 32 bytes (2 bytes used) |

This pattern supports unlimited options without requiring fixed-size arrays or nested maps.

## Events

### OptionWritten

Emitted by `writeOption` and `rollOption`.

```typescript
// 200 bytes
{
    optionId: u256,         // 32 bytes
    writer: Address,        // 32 bytes
    optionType: u8,         // 1 byte
    strikePrice: u256,      // 32 bytes
    underlyingAmount: u256, // 32 bytes
    premium: u256,          // 32 bytes
    expiryBlock: u64,       // 8 bytes
}
```

### OptionPurchased

Emitted by `buyOption`.

```typescript
// 168 bytes
{
    optionId: u256,         // 32 bytes
    buyer: Address,         // 32 bytes
    writer: Address,        // 32 bytes
    premium: u256,          // 32 bytes (full premium)
    writerAmount: u256,     // 32 bytes (premium - buyFee)
    blockNumber: u64,       // 8 bytes
}
```

### OptionExercised

Emitted by `exercise`.

```typescript
// 193 bytes
{
    optionId: u256,         // 32 bytes
    buyer: Address,         // 32 bytes
    writer: Address,        // 32 bytes
    optionType: u8,         // 1 byte
    underlyingAmount: u256, // 32 bytes
    strikeValue: u256,      // 32 bytes
    exerciseFee: u256,      // 32 bytes
}
```

### OptionExpired

Emitted by `settle` and `batchSettle`.

```typescript
// 96 bytes
{
    optionId: u256,             // 32 bytes
    writer: Address,            // 32 bytes
    collateralReturned: u256,   // 32 bytes
}
```

### OptionCancelled

Emitted by `cancelOption`, `batchCancel`, and `rollOption`.

```typescript
// 128 bytes
{
    optionId: u256,             // 32 bytes
    writer: Address,            // 32 bytes
    collateralReturned: u256,   // 32 bytes
    cancellationFee: u256,      // 32 bytes
}
```

### OptionTransferred

Emitted by `transferOption`.

```typescript
// 96 bytes
{
    optionId: u256,     // 32 bytes
    from: Address,      // 32 bytes (previous buyer)
    to: Address,        // 32 bytes (new buyer)
}
```

### OptionRolled

Emitted by `rollOption`.

```typescript
// 168 bytes
{
    oldOptionId: u256,      // 32 bytes
    newOptionId: u256,      // 32 bytes
    writer: Address,        // 32 bytes
    newStrikePrice: u256,   // 32 bytes
    newExpiryBlock: u64,    // 8 bytes
    newPremium: u256,       // 32 bytes
}
```

### FeeRecipientUpdated

Emitted by `updateFeeRecipient`.

```typescript
// 64 bytes
{
    oldRecipient: Address,  // 32 bytes
    newRecipient: Address,  // 32 bytes
}
```

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
| `'Grace period ended'` | exercise, transferOption | Block >= expiry + GRACE_PERIOD_BLOCKS |
| `'Grace period not ended'` | settle | Block < expiry + GRACE_PERIOD_BLOCKS |
| `'Writer cannot buy own option'` | buyOption | Buyer address == writer address |
| `'Invalid recipient'` | transferOption | Recipient is zero address |
| `'Already owner'` | transferOption | Recipient == current buyer |
| `'Values must be > 0'` | writeOption, rollOption | Strike, amount, or premium is zero |
| `'Invalid option type'` | writeOption | optionType > 1 |
| `'Expiry in past'` | writeOption, rollOption | expiryBlock <= currentBlock |
| `'Expiry too far'` | writeOption, rollOption | expiryBlock > currentBlock + MAX_EXPIRY_BLOCKS |
| `'Only fee recipient'` | updateFeeRecipient | Caller is not current fee recipient |
| `'Zero address not allowed'` | updateFeeRecipient | New recipient is zero address |
| `'Fee recipient cannot be zero'` | onDeployment | Constructor given zero fee recipient |
| `'Empty batch'` | batchCancel, batchSettle | count = 0 |
| `'Batch too large'` | batchCancel, batchSettle | count > MAX_BATCH_SIZE |
| `'Token transferFrom failed'` | writeOption, buyOption, exercise | Token approval insufficient |
| `'Transfer out failed'` | cancelOption, exercise, settle, batchCancel, batchSettle, rollOption | Internal token transfer failed |

## Security

### Reentrancy Guard

Contract extends `ReentrancyGuard` with `ReentrancyLevel.STANDARD`. All state-changing methods follow checks-effects-interactions: state updates before external token calls.

### Cross-Contract Token Transfers

The contract uses two internal helpers:

- `_transferFrom(token, from, to, amount)` — calls OP20 `transferFrom()` with `stopOnFailure=true`. Used when pulling tokens from external wallets (collateral deposits, premium payments).
- `_transfer(token, to, amount)` — calls OP20 `transferFrom(contractAddress, to, amount)` with `stopOnFailure=false`. When `from == contractAddress`, OP20 bypasses allowance check. Used for all outbound transfers (collateral returns, fee routing).

### Block Height Validation

All time checks use block number, never timestamps:

```typescript
const currentBlock = Blockchain.block.number;
const expired = currentBlock >= option.expiryBlock;
const graceEnded = currentBlock >= option.expiryBlock + GRACE_PERIOD_BLOCKS;
```

## Access Control

| Method | Access |
|--------|--------|
| All view methods | Public |
| `writeOption` | Any (locks caller's collateral) |
| `buyOption` | Any (except writer of that option) |
| `exercise` | Buyer only |
| `cancelOption` | Writer only |
| `settle` | Any (public good) |
| `transferOption` | Buyer only |
| `rollOption` | Writer only |
| `updateFeeRecipient` | Current fee recipient only |
| `batchCancel` | Writer of all options in batch |
| `batchSettle` | Any (public good) |

## Source

`src/contracts/pool/contract.ts`
