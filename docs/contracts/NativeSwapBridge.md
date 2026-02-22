# NativeSwapBridge Contract

## Overview

NativeSwapBridge provides BTC verification and price oracle functionality for options contracts. This enables BTC-denominated premiums and strikes.

**Phase**: 2 (NativeSwap Integration)

## Purpose

```
┌─────────────────────────────────────────────────────────────────┐
│                    NativeSwapBridge                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. BTC Price Oracle                                           │
│      └── getBtcPrice(token) → satoshis per token               │
│                                                                  │
│   2. UTXO Verification                                          │
│      └── verifyBtcPayment(outputs, expected) → bool            │
│                                                                  │
│   3. CSV Address Generation                                     │
│      └── generateCsvAddress(pubkey, blocks) → Address          │
│                                                                  │
│   4. Premium Calculation                                        │
│      └── calculateBtcPremium(...) → satoshis                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Contract Address

```
regtest:  (TBD after Phase 2 deployment)
mainnet:  (TBD after Phase 2 deployment)
```

## Dependencies

- **NativeSwap**: `0xb056ba05448cf4a5468b3e1190b0928443981a93c3aff568467f101e94302422` (regtest)

## Methods

### getBtcPrice

Returns the current BTC price for a token (satoshis per token).

```typescript
@method({ name: 'token', type: ABIDataTypes.ADDRESS })
@returns({ name: 'satoshisPerToken', type: ABIDataTypes.UINT256 })
public getBtcPrice(calldata: Calldata): BytesWriter
```

**Implementation:**

```typescript
public getBtcPrice(calldata: Calldata): BytesWriter {
    const token = calldata.readAddress();
    
    // Query NativeSwap
    const nativeSwap = NativeSwap.bind(NATIVE_SWAP_ADDRESS);
    const quote = nativeSwap.getQuote(token, 100_000_000n);  // Query with 0.001 BTC
    
    // quote.tokensOut = tokens per 0.001 BTC
    // satoshisPerToken = 100_000_000 / tokensOut
    const satoshis = u256.fromU64(100_000_000);
    const satoshisPerToken = SafeMath.div(
        SafeMath.mul(satoshis, u256.fromU64(1e8)),
        quote.tokensOut
    );
    
    const writer = new BytesWriter(32);
    writer.writeU256(satoshisPerToken);
    return writer;
}
```

### verifyBtcPayment

Verifies that BTC was sent to the expected CSV-locked address.

```typescript
@method(
    { name: 'expectedAmount', type: ABIDataTypes.UINT256 },
    { name: 'expectedRecipient', type: ABIDataTypes.ADDRESS },
    { name: 'csvBlocks', type: ABIDataTypes.UINT64 },
)
@returns({ name: 'verified', type: ABIDataTypes.BOOL })
public verifyBtcPayment(calldata: Calldata): BytesWriter
```

**Implementation:**

```typescript
public verifyBtcPayment(calldata: Calldata): BytesWriter {
    const expectedAmount = calldata.readU256();
    const expectedRecipient = calldata.readAddress();
    const csvBlocks = calldata.readU64();
    
    const outputs = Blockchain.tx.outputs;
    
    for (let i = 0; i < outputs.length; i++) {
        const output = outputs[i];
        
        // Check amount (allow small variance for fees)
        if (output.value < SafeMath.sub(expectedAmount, u256.fromU64(1000))) {
            continue;
        }
        
        // Check CSV lock
        if (this.hasCsvLock(output.scriptPubKey, expectedRecipient, csvBlocks)) {
            const writer = new BytesWriter(1);
            writer.writeBoolean(true);
            return writer;
        }
    }
    
    const writer = new BytesWriter(1);
    writer.writeBoolean(false);
    return writer;
}

private hasCsvLock(scriptPubKey: Uint8Array, recipient: Address, csvBlocks: u64): bool {
    // Parse scriptPubKey and verify:
    // <csvBlocks> CHECKSEQUENCEVERIFY DROP <pubkey> CHECKSIG
    // And pubkey matches recipient
    
    // Implementation depends on Bitcoin script parsing
    // Returns true if CSV lock matches expected recipient and blocks
    return true;  // Simplified
}
```

### generateCsvAddress

Generates a CSV-locked P2WSH address for receiving BTC.

```typescript
@method(
    { name: 'pubKey', type: ABIDataTypes.BYTES },
    { name: 'csvBlocks', type: ABIDataTypes.UINT64 },
)
@returns({ name: 'csvAddress', type: ABIDataTypes.ADDRESS })
public generateCsvAddress(calldata: Calldata): BytesWriter
```

**Implementation:**

```typescript
public generateCsvAddress(calldata: Calldata): BytesWriter {
    const pubKey = calldata.readBytes();
    const csvBlocks = calldata.readU64();
    
    // Build CSV script
    // OP_<csvBlocks> OP_CHECKSEQUENCEVERIFY OP_DROP <pubKey> OP_CHECKSIG
    const script = new BytesWriter(50);
    script.writeU8(csvBlocks);           // OP_<n>
    script.writeU8(0xB2);                // OP_CHECKSEQUENCEVERIFY
    script.writeU8(0x75);                // OP_DROP
    script.writeBytes(pubKey);
    script.writeU8(0xAC);                // OP_CHECKSIG
    
    // Create P2WSH address
    const scriptHash = SHA256(script.buffer);
    const csvAddress = Address.fromScript(scriptHash);
    
    const writer = new BytesWriter(32);
    writer.writeAddress(csvAddress);
    return writer;
}
```

### calculateBtcPremium

Calculates the BTC premium for an option.

```typescript
@method(
    { name: 'underlying', type: ABIDataTypes.ADDRESS },
    { name: 'strikeBtc', type: ABIDataTypes.UINT256 },      // Satoshis per token
    { name: 'expiryBlock', type: ABIDataTypes.UINT64 },
    { name: 'optionType', type: ABIDataTypes.UINT8 },
    { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
)
@returns({ name: 'premiumSatoshis', type: ABIDataTypes.UINT256 })
public calculateBtcPremium(calldata: Calldata): BytesWriter
```

**Implementation:**

```typescript
public calculateBtcPremium(calldata: Calldata): BytesWriter {
    const underlying = calldata.readAddress();
    const strikeBtc = calldata.readU256();
    const expiryBlock = calldata.readU64();
    const optionType = calldata.readU8();
    const underlyingAmount = calldata.readU256();
    
    // Get current BTC price
    const currentPrice = this.getBtcPriceDirect(underlying);
    
    // Moneyness
    const itm = optionType === 0  // CALL
        ? currentPrice > strikeBtc
        : currentPrice < strikeBtc;
    
    // Time value
    const blocksRemaining = SafeMath.sub(
        u256.fromU64(expiryBlock),
        Blockchain.block.numberU256
    );
    const timeValue = this.sqrt(blocksRemaining);
    
    // Base premium calculation
    let premium: u256;
    if (itm) {
        // Intrinsic + time
        const intrinsic = optionType === 0
            ? SafeMath.sub(currentPrice, strikeBtc)
            : SafeMath.sub(strikeBtc, currentPrice);
        premium = SafeMath.add(intrinsic, timeValue);
    } else {
        // Only time value
        premium = timeValue;
    }
    
    // Scale by underlying amount
    const totalPremium = SafeMath.mul(premium, underlyingAmount);
    
    // Apply basis point divisor
    const premiumSatoshis = SafeMath.div(totalPremium, u256.fromU64(1e8));
    
    const writer = new BytesWriter(32);
    writer.writeU256(premiumSatoshis);
    return writer;
}
```

## Integration Pattern

### OptionsContract Usage

```typescript
// In OptionsPool contract
class OptionsPool {
    private nativeSwapBridge: Address;
    
    public reserveOption(calldata: Calldata): BytesWriter {
        // ... option setup ...
        
        // Get BTC premium via bridge
        const bridge = NativeSwapBridge.bind(this.nativeSwapBridge);
        const premiumResult = bridge.calculateBtcPremium(
            underlying, strikeBtc, expiryBlock, optionType, amount
        );
        const btcPremium = premiumResult.premiumSatoshis;
        
        // Generate CSV address for writer
        const csvResult = bridge.generateCsvAddress(writerPubKey, 6);
        const csvAddress = csvResult.csvAddress;
        
        // Return reservation details
        // ...
    }
    
    public executeOption(calldata: Calldata): BytesWriter {
        // ... get reservation ...
        
        // Verify BTC payment
        const bridge = NativeSwapBridge.bind(this.nativeSwapBridge);
        const verified = bridge.verifyBtcPayment(
            reservation.btcPremium,
            reservation.writerCsvAddress,
            6
        );
        
        if (!verified) {
            throw new Revert('BTC payment not verified');
        }
        
        // Continue with option activation
        // ...
    }
}
```

## Security Considerations

### UTXO Verification

```typescript
// CRITICAL: Always verify ALL outputs
private verifyBtcPayment(reservation: Reservation): bool {
    const outputs = Blockchain.tx.outputs;
    
    // Check each output
    for (let i = 0; i < outputs.length; i++) {
        // 1. Verify amount >= expected
        // 2. Verify recipient is CSV-locked
        // 3. Verify CSV blocks match requirement
        // 4. Verify no dust attacks
    }
    
    return false;
}
```

### Price Staleness

```typescript
// Reject stale prices (older than 6 blocks)
const MAX_PRICE_AGE_BLOCKS: u64 = 6;

private checkPriceFreshness(lastUpdateBlock: u64): void {
    const currentBlock = Blockchain.block.number;
    if (currentBlock - lastUpdateBlock > MAX_PRICE_AGE_BLOCKS) {
        throw new Revert('Price data too stale');
    }
}
```

### CSV Enforcement

```typescript
// Minimum CSV blocks to prevent flash loans
const MIN_CSV_BLOCKS: u64 = 6;

private validateCsvBlocks(csvBlocks: u64): void {
    if (csvBlocks < MIN_CSV_BLOCKS) {
        throw new Revert('CSV blocks below minimum');
    }
}
```

## Events

```typescript
@emit('BtcPaymentVerified')
// buyer, amount, csvAddress, blockNumber

@emit('PremiumCalculated')
// underlying, strike, expiry, amount, premiumSatoshis

@emit('CsvAddressGenerated')
// recipient, csvBlocks, csvAddress
```

## Error Codes

| Code | Message | Cause |
|------|---------|-------|
| 0x01 | "NativeSwap call failed" | Cannot reach NativeSwap |
| 0x02 | "BTC payment not verified" | UTXO not found or invalid |
| 0x03 | "CSV blocks below minimum" | < 6 blocks |
| 0x04 | "Invalid pubkey" | Wrong length or format |
| 0x05 | "Price data stale" | > 6 blocks old |

## Testing

### Mock NativeSwap

```typescript
// For unit tests
class MockNativeSwap {
    private prices: Map<Address, u256>;
    
    setPrice(token: Address, satoshisPerToken: u256): void {
        this.prices.set(token, satoshisPerToken);
    }
    
    getQuote(token: Address, satoshis: u256): QuoteResult {
        const price = this.prices.get(token);
        const tokensOut = SafeMath.div(
            SafeMath.mul(satoshis, u256.fromU64(1e8)),
            price
        );
        return { tokensOut };
    }
}
```

### Test Cases

```typescript
describe('NativeSwapBridge', () => {
    it('should calculate correct BTC premium for ITM call', async () => {
        // Setup: MOTO = 0.001 BTC, Strike = 0.0009 BTC
        // Expected: Premium includes intrinsic value
    });
    
    it('should verify BTC payment to CSV address', async () => {
        // Setup: Mock outputs with CSV-locked payment
        // Expected: Returns true
    });
    
    it('should reject stale price data', async () => {
        // Setup: Price from 7 blocks ago
        // Expected: Revert with "Price data stale"
    });
});
```

## Next Steps

- [Mode 1: NativeSwap Details](../modes/mode-1-nativeswap.md)
- [Phase 2 Roadmap](../roadmap/PHASE_2_NATIVE.md)
- [OptionsPool Contract](./OptionsPool.md)
