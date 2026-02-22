# OptionsPool Contract

## Overview

OptionsPool is the core contract for an individual option market. Each pool handles a specific token pair (underlying + premium token) and manages option lifecycle.

## Contract Address

Deployed per-token-pair via [OptionsFactory](./OptionsFactory.md).

## ABI

```typescript
const OPTIONS_POOL_ABI = [
    // View methods
    { name: 'underlying', inputs: [], outputs: [{ name: 'token', type: 'address' }] },
    { name: 'premiumToken', inputs: [], outputs: [{ name: 'token', type: 'address' }] },
    { name: 'getOption', inputs: [{ name: 'optionId', type: 'uint256' }], outputs: [{ name: 'option', type: 'tuple' }] },
    { name: 'getOptionCount', inputs: [], outputs: [{ name: 'count', type: 'uint256' }] },
    { name: 'getReserves', inputs: [], outputs: [{ name: 'underlying', type: 'uint256' }, { name: 'premium', type: 'uint256' }] },
    
    // Write methods
    {
        name: 'writeOption',
        inputs: [
            { name: 'optionType', type: 'uint8' },
            { name: 'strikePrice', type: 'uint256' },
            { name: 'expiryBlock', type: 'uint64' },
            { name: 'underlyingAmount', type: 'uint256' },
        ],
        outputs: [{ name: 'optionId', type: 'uint256' }],
    },
    
    // Buy methods
    {
        name: 'buyOption',
        inputs: [{ name: 'optionId', type: 'uint256' }],
        outputs: [{ name: 'success', type: 'bool' }],
    },
    
    // Exercise methods
    {
        name: 'exercise',
        inputs: [{ name: 'optionId', type: 'uint256' }],
        outputs: [{ name: 'success', type: 'bool' }],
    },
    
    // Cancel methods
    {
        name: 'cancelOption',
        inputs: [{ name: 'optionId', type: 'uint256' }],
        outputs: [{ name: 'success', type: 'bool' }],
    },
    
    // LP methods (Phase 3)
    {
        name: 'addLiquidity',
        inputs: [
            { name: 'underlyingAmount', type: 'uint256' },
            { name: 'premiumAmount', type: 'uint256' },
        ],
        outputs: [{ name: 'lpTokens', type: 'uint256' }],
    },
    {
        name: 'removeLiquidity',
        inputs: [{ name: 'lpTokens', type: 'uint256' }],
        outputs: [
            { name: 'underlyingAmount', type: 'uint256' },
            { name: 'premiumAmount', type: 'uint256' },
        ],
    },
];
```

## Methods

### View Methods

#### underlying

Returns the underlying token address.

```typescript
@method()
@returns({ name: 'token', type: ABIDataTypes.ADDRESS })
public underlying(calldata: Calldata): BytesWriter
```

#### premiumToken

Returns the premium token address.

```typescript
@method()
@returns({ name: 'token', type: ABIDataTypes.ADDRESS })
public premiumToken(calldata: Calldata): BytesWriter
```

#### getOption

Returns option details by ID.

```typescript
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@returns({ name: 'option', type: ABIDataTypes.TUPLE, components: [
    { name: 'id', type: ABIDataTypes.UINT256 },
    { name: 'writer', type: ABIDataTypes.ADDRESS },
    { name: 'buyer', type: ABIDataTypes.ADDRESS },
    { name: 'optionType', type: ABIDataTypes.UINT8 },
    { name: 'strikePrice', type: ABIDataTypes.UINT256 },
    { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
    { name: 'premium', type: ABIDataTypes.UINT256 },
    { name: 'expiryBlock', type: ABIDataTypes.UINT64 },
    { name: 'status', type: ABIDataTypes.UINT8 },
]})
public getOption(calldata: Calldata): BytesWriter
```

#### getReserves

Returns pool reserves (for AMM mode).

```typescript
@method()
@returns({ name: 'underlying', type: ABIDataTypes.UINT256 }, { name: 'premium', type: ABIDataTypes.UINT256 })
public getReserves(calldata: Calldata): BytesWriter
```

### Write Option

Creates a new option by locking collateral.

```typescript
@method(
    { name: 'optionType', type: ABIDataTypes.UINT8 },        // 0=Call, 1=Put
    { name: 'strikePrice', type: ABIDataTypes.UINT256 },     // Premium tokens per underlying
    { name: 'expiryBlock', type: ABIDataTypes.UINT64 },
    { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
)
@emit('OptionWritten')
@returns({ name: 'optionId', type: ABIDataTypes.UINT256 })
public writeOption(calldata: Calldata): BytesWriter
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| optionType | u8 | 0 = Call, 1 = Put |
| strikePrice | u256 | Strike in premium tokens per underlying |
| expiryBlock | u64 | Block height for expiry |
| underlyingAmount | u256 | Amount of underlying covered |

**Example:**

```typescript
// Write a call option
const simulation = await pool.writeOption(
    0,                    // Call
    50_00000000n,         // Strike: 50 PILL per MOTO (8 decimals)
    864000n,              // Expires at block 864,000
    100_00000000n,        // 100 MOTO
);

// First approve token spend
const underlying = getContract<IOP20Contract>(motoAddress, OP_20_ABI, provider, network, wallet.address);
await (await underlying.increaseAllowance(pool.address, 100_00000000n)).sendTransaction({
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    refundTo: wallet.p2tr,
    feeRate: 10,
    network,
});

// Then write option
await simulation.sendTransaction({
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    refundTo: wallet.p2tr,
    feeRate: 10,
    network,
});

console.log('Option ID:', simulation.properties.optionId);
```

### Buy Option

Purchases an option by paying premium.

```typescript
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@emit('OptionPurchased')
@returns({ name: 'success', type: ABIDataTypes.BOOL })
public buyOption(calldata: Calldata): BytesWriter
```

**Prerequisites:**

1. Option must be in `OPEN` status
2. Option must not be expired
3. Buyer must have approved premium token spend

**Example:**

```typescript
// Get option details first
const optionResult = await pool.getOption(1n);
const option = optionResult.properties.option;

// Approve premium spend
const premiumToken = getContract<IOP20Contract>(pillAddress, OP_20_ABI, provider, network, wallet.address);
await (await premiumToken.increaseAllowance(pool.address, option.premium)).sendTransaction({...});

// Buy option
const simulation = await pool.buyOption(1n);
await simulation.sendTransaction({...});
```

### Exercise

Exercises an ITM option at or after expiry.

```typescript
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@emit('OptionExercised')
@returns({ name: 'success', type: ABIDataTypes.BOOL })
public exercise(calldata: Calldata): BytesWriter
```

**Conditions:**

1. Option must be `PURCHASED`
2. Current block >= expiry block
3. Option must be ITM (checked internally)
4. Caller must be the buyer

**Example:**

```typescript
const simulation = await pool.exercise(1n);
await simulation.sendTransaction({...});
```

### Cancel Option

Cancels an unpurchased option.

```typescript
@method({ name: 'optionId', type: ABIDataTypes.UINT256 })
@emit('OptionCancelled')
@returns({ name: 'success', type: ABIDataTypes.BOOL })
public cancelOption(calldata: Calldata): BytesWriter
```

**Conditions:**

1. Option must be `OPEN` (not yet purchased)
2. Caller must be the writer
3. Small cancellation fee (1%) applies

## Option States

```typescript
enum OptionStatus: u8 {
    OPEN = 0,       // Written, waiting for buyer
    PURCHASED = 1,  // Buyer paid premium
    EXERCISED = 2,  // ITM, buyer exercised
    EXPIRED = 3,    // OTM, expired worthless
    CANCELLED = 4,  // Cancelled by writer
}
```

## Option Types

### Call Option

```
Call = Right to BUY underlying at strike price

ITM when: currentPrice > strikePrice
Buyer profit = currentPrice - strikePrice - premium

Example:
├── Strike: 50 PILL per MOTO
├── Premium: 5 PILL
├── At expiry MOTO = 60 PILL
├── ITM: 60 > 50
├── Buyer pays 50 PILL, gets 1 MOTO (worth 60 PILL)
└── Net profit: 60 - 50 - 5 = 5 PILL
```

### Put Option

```
Put = Right to SELL underlying at strike price

ITM when: currentPrice < strikePrice
Buyer profit = strikePrice - currentPrice - premium

Example:
├── Strike: 50 PILL per MOTO
├── Premium: 3 PILL
├── At expiry MOTO = 40 PILL
├── ITM: 40 < 50
├── Buyer sells 1 MOTO (worth 40), gets 50 PILL
└── Net profit: 50 - 40 - 3 = 7 PILL
```

## Storage Layout

```typescript
class OptionsPool extends Upgradeable implements ReentrancyGuard {
    // Configuration
    private underlyingPointer: u16 = Blockchain.nextPointer;
    private premiumTokenPointer: u16 = Blockchain.nextPointer;
    
    // Options
    private optionsPointer: u16 = Blockchain.nextPointer;
    private nextIdPointer: u16 = Blockchain.nextPointer;
    private writerOptionsPointer: u16 = Blockchain.nextPointer;  // writer → optionIds
    private buyerOptionsPointer: u16 = Blockchain.nextPointer;   // buyer → optionIds
    
    // Reserves (AMM mode)
    private underlyingReservePointer: u16 = Blockchain.nextPointer;
    private premiumReservePointer: u16 = Blockchain.nextPointer;
    private totalLiquidityPointer: u16 = Blockchain.nextPointer;
    private lpBalancesPointer: u16 = Blockchain.nextPointer;
    
    // Emergency
    private pausedPointer: u16 = Blockchain.nextPointer;
    
    // Storage instances
    private _underlying: StoredAddress;
    private _premiumToken: StoredAddress;
    private _options: StoredMapU256;           // optionId → serialized Option
    private _nextId: StoredU256;
    private _writerOptions: AddressMemoryMap;  // writer → List<optionId>
    private _buyerOptions: AddressMemoryMap;   // buyer → List<optionId>
    private _underlyingReserve: StoredU256;
    private _premiumReserve: StoredU256;
    private _totalLiquidity: StoredU256;
    private _lpBalances: StoredMap;            // address → balance
    private _paused: StoredBoolean;
}
```

## Events

### OptionWritten

```typescript
interface OptionWrittenEvent {
    optionId: u256;
    writer: Address;
    optionType: u8;          // 0=Call, 1=Put
    strikePrice: u256;
    expiryBlock: u64;
    underlyingAmount: u256;
    premium: u256;           // Calculated premium
}
```

### OptionPurchased

```typescript
interface OptionPurchasedEvent {
    optionId: u256;
    buyer: Address;
    writer: Address;
    premium: u256;
    blockNumber: u64;
}
```

### OptionExercised

```typescript
interface OptionExercisedEvent {
    optionId: u256;
    buyer: Address;
    writer: Address;
    settlementType: u8;      // 0=Physical delivery, 1=Cash settlement
    underlyingAmount: u256;
    strikeValue: u256;
}
```

### OptionExpired

```typescript
interface OptionExpiredEvent {
    optionId: u256;
    writer: Address;
    collateralReturned: u256;
    premiumKept: u256;
}
```

### OptionCancelled

```typescript
interface OptionCancelledEvent {
    optionId: u256;
    writer: Address;
    collateralReturned: u256;
    cancellationFee: u256;
}
```

## Error Codes

| Code | Message | Cause |
|------|---------|-------|
| 0x01 | "Option not found" | Invalid option ID |
| 0x02 | "Option not open" | Already purchased/cancelled |
| 0x03 | "Option expired" | Block >= expiry |
| 0x04 | "Not option owner" | Wrong caller for operation |
| 0x05 | "Insufficient allowance" | Token not approved |
| 0x06 | "Option not ITM" | Cannot exercise OTM option |
| 0x07 | "Pool paused" | Emergency pause active |
| 0x08 | "Invalid strike" | Strike <= 0 |
| 0x09 | "Invalid expiry" | Expiry in past or too far |
| 0x0A | "Invalid amount" | Amount <= 0 |
| 0x0B | "Reentrancy detected" | Nested call detected |

## Security

### Reentrancy Guard

All state-changing methods use `@nonReentrant`:

```typescript
@method(...)
@nonReentrant
public buyOption(calldata: Calldata): BytesWriter {
    // State changes FIRST
    this._options.set(optionId, updatedOption);
    
    // External calls LAST
    this.transferToken(premiumToken, buyer, writer, premium);
}
```

### Block Height Validation

```typescript
// ALWAYS use block number, never timestamp
const currentBlock = Blockchain.block.number;
const expired = currentBlock >= option.expiryBlock;
```

### Collateral Validation

```typescript
// Call: Lock 100% of underlying
const collateralRequired = underlyingAmount;

// Put: Lock 100% of strike value
const collateralRequired = SafeMath.mul(strikePrice, underlyingAmount);
```

## Frontend Integration

### Hook: Use Option

```typescript
function useOption(poolAddress: Address, optionId: bigint) {
    const provider = useProvider();
    const [option, setOption] = useState<Option | null>(null);
    
    useEffect(() => {
        async function fetchOption() {
            const pool = getContract<IOptionsPoolContract>(
                poolAddress,
                OPTIONS_POOL_ABI,
                provider,
                network
            );
            
            const result = await pool.getOption(optionId);
            setOption(result.properties.option);
        }
        
        fetchOption();
    }, [poolAddress, optionId]);
    
    return option;
}
```

### Hook: Write Option

```typescript
function useWriteOption(poolAddress: Address) {
    const { wallet } = useWallet();
    const provider = useProvider();
    
    async function writeOption(params: WriteOptionParams): Promise<string> {
        const pool = getContract<IOptionsPoolContract>(
            poolAddress,
            OPTIONS_POOL_ABI,
            provider,
            network,
            wallet.address
        );
        
        // Approve underlying
        const underlying = getContract<IOP20Contract>(
            params.underlying,
            OP_20_ABI,
            provider,
            network,
            wallet.address
        );
        
        await (await underlying.increaseAllowance(pool.address, params.amount)).sendTransaction({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            refundTo: wallet.p2tr,
            feeRate: 10,
            network,
        });
        
        // Write option
        const simulation = await pool.writeOption(
            params.type,
            params.strike,
            params.expiry,
            params.amount
        );
        
        const receipt = await simulation.sendTransaction({
            signer: wallet.keypair,
            mldsaSigner: wallet.mldsaKeypair,
            refundTo: wallet.p2tr,
            feeRate: 10,
            network,
        });
        
        return receipt.transactionId;
    }
    
    return { writeOption };
}
```

## Next Steps

- [OptionsFactory Contract](./OptionsFactory.md)
- [Security Threat Model](../security/THREAT_MODEL.md)
- [Phase 1 MVP](../roadmap/PHASE_1_MVP.md)
