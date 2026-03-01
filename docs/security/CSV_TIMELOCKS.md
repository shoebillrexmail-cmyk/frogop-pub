# CSV Timelocks

## Overview

CSV (CheckSequenceVerify) timelocks are MANDATORY for all BTC recipient addresses in FrogOp. This document explains why they're required and how they work.

## What is CSV?

CheckSequenceVerify (BIP-112) is a Bitcoin opcode that enforces a timelock on spending transaction outputs.

```
CSV Script Template:
┌─────────────────────────────────────────────────────┐
│  <n> CHECKSEQUENCEVERIFY DROP <pubkey> CHECKSIG   │
└─────────────────────────────────────────────────────┘
         │                      │
         │                      └── Can only spend with
         │                          this pubkey's signature
         │
         └── Cannot spend until n blocks have passed
             since the output was confirmed
```

## Why CSV is Mandatory

### 1. Flash Loan Prevention

Without CSV:
```
1. Attacker borrows 10 BTC (flash loan)
2. Attacker buys option with borrowed BTC
3. If ITM: Exercise immediately, receive tokens
4. If OTM: Cancel, get BTC back
5. Repay flash loan
6. Profit from arbitrage at zero cost
```

With CSV (6 blocks):
```
1. Attacker borrows 10 BTC (flash loan)
2. Attacker buys option with borrowed BTC
3. BTC locked for 6 blocks
4. Flash loan must be repaid in same block
5. Attacker CANNOT repay
6. Loan liquidates, attack fails
```

### 2. Atomic Arbitrage Prevention

Without CSV:
```
Block N:
├── TX1: Buy option at price X
├── TX2: Manipulate pool
├── TX3: Exercise option at profit
└── All in single block
```

With CSV:
```
Block N:   TX1: Buy option, BTC locked
Block N+6: BTC becomes spendable
           (Too late to affect option outcome)
```

### 3. Rate Limiting

CSV enforces minimum time between:
- Buying and using received BTC
- Rapid buy/sell cycles
- Pool manipulation attempts

## Implementation

### Script Construction

```typescript
private buildCsvScript(pubKey: Uint8Array, csvBlocks: u64): Uint8Array {
    // Script: <csvBlocks> OP_CHECKSEQUENCEVERIFY OP_DROP <pubKey> OP_CHECKSIG
    const script = new BytesWriter(50);
    
    // Push n (CSV blocks)
    if (csvBlocks <= 16) {
        script.writeU8(0x50 + csvBlocks);  // OP_1 to OP_16
    } else {
        script.writeU8(0x01);              // OP_PUSH1
        script.writeU8(csvBlocks);
    }
    
    // OP_CHECKSEQUENCEVERIFY (0xB2)
    script.writeU8(0xB2);
    
    // OP_DROP (0x75)
    script.writeU8(0x75);
    
    // Push pubkey (33 bytes compressed)
    script.writeU8(0x21);                  // OP_PUSH33
    script.writeBytes(pubKey);
    
    // OP_CHECKSIG (0xAC)
    script.writeU8(0xAC);
    
    return script.buffer;
}
```

### P2WSH Address Generation

```typescript
private generateCsvAddress(pubKey: Uint8Array, csvBlocks: u64): Address {
    // 1. Build CSV script
    const script = this.buildCsvScript(pubKey, csvBlocks);
    
    // 2. SHA256 hash of script
    const scriptHash = SHA256(script);
    
    // 3. Create P2WSH address
    // witness v0 + 32-byte hash
    const witnessProgram = new BytesWriter(34);
    witnessProgram.writeU8(0x00);          // Version 0
    witnessProgram.writeU8(0x20);          // 32 bytes
    witnessProgram.writeBytes(scriptHash);
    
    // 4. Generate address from witness program
    return Address.fromWitnessProgram(witnessProgram.buffer);
}
```

### Verification

```typescript
private hasCsvLock(scriptPubKey: Uint8Array, expectedRecipient: Address, csvBlocks: u64): bool {
    // 1. Parse scriptPubKey to extract CSV script
    // 2. Verify it contains CHECKSEQUENCEVERIFY
    // 3. Verify CSV blocks match expected
    // 4. Verify pubkey matches expected recipient
    
    // Parse witness script from P2WSH
    if (scriptPubKey.length < 34) return false;
    if (scriptPubKey[0] != 0x00) return false;  // Not v0
    if (scriptPubKey[1] != 0x20) return false;  // Not 32-byte hash
    
    // Extract script hash
    const scriptHash = scriptPubKey.slice(2, 34);
    
    // Reconstruct expected script
    const expectedScript = this.buildCsvScript(expectedRecipient.pubKey, csvBlocks);
    const expectedHash = SHA256(expectedScript);
    
    // Compare hashes
    return this.bytesEqual(scriptHash, expectedHash);
}
```

## Parameters

### Minimum CSV Blocks

```typescript
const MIN_CSV_BLOCKS: u64 = 6;  // ~1 hour on mainnet
```

**Rationale**:
- 6 blocks ≈ 60 minutes
- Sufficient to detect most attacks
- Not too long for legitimate users
- Standard in Bitcoin DeFi protocols

### Maximum CSV Blocks

```typescript
const MAX_CSV_BLOCKS: u64 = 144;  // ~24 hours
```

**Use Cases**:
- Standard options: 6 blocks
- Large options: 36 blocks (6 hours)
- Settlement disputes: 144 blocks (24 hours)

## Usage in FrogOp

### Option Writer BTC Address

When an option is written, the writer receives a CSV-locked address for BTC premiums:

```typescript
@method(...)
@emit('OptionReserved')
public reserveOption(calldata: Calldata): BytesWriter {
    // ... option setup ...
    
    // Generate CSV address for writer
    const writerPubKey = this.getPubKey(writer);
    const csvAddress = this.generateCsvAddress(writerPubKey, 6);
    
    // Store in reservation
    reservation.writerCsvAddress = csvAddress;
    
    // Return to buyer
    return encodeReservationResponse(csvAddress, btcPremium);
}
```

### BTC Payment Verification

When buyer executes the option, contract verifies BTC was sent to CSV address:

```typescript
@method(...)
public executeOption(calldata: Calldata): BytesWriter {
    const reservation = this._reservations.get(reservationId);
    
    // Verify BTC payment
    const outputs = Blockchain.tx.outputs;
    let paymentFound = false;
    
    for (let i = 0; i < outputs.length; i++) {
        const output = outputs[i];
        
        // Check amount
        if (output.value < reservation.btcPremium) continue;
        
        // Check CSV lock
        if (this.hasCsvLock(output.scriptPubKey, reservation.writer, 6)) {
            paymentFound = true;
            break;
        }
    }
    
    if (!paymentFound) {
        throw new Revert('BTC payment not verified');
    }
    
    // Activate option
    // ...
}
```

## Security Analysis

### Attack Scenarios

| Attack | Without CSV | With CSV |
|--------|-------------|----------|
| Flash loan arbitrage | Possible in 1 block | Impossible (6 block delay) |
| Atomic manipulation | Single transaction | Requires 6+ blocks |
| Rapid cycling | Unlimited | 6 blocks per cycle |
| MEV extraction | Immediate | Delayed |

### Limitations

CSV does NOT prevent:
- Long-term manipulation (attacks spanning days)
- Whale attacks (large capital)
- Cross-protocol attacks

CSV DOES prevent:
- Single-transaction exploits
- Flash loan attacks
- Atomic arbitrage
- Rapid cycling

## Testing

### Unit Tests

```typescript
describe('CSV Timelocks', () => {
    it('should generate valid CSV address', () => {
        const csvAddress = bridge.generateCsvAddress(pubKey, 6);
        expect(csvAddress).toBeDefined();
    });
    
    it('should verify CSV lock on output', () => {
        const output = createCsvOutput(pubKey, 6, 1000000n);
        const verified = bridge.hasCsvLock(output.scriptPubKey, recipient, 6);
        expect(verified).toBe(true);
    });
    
    it('should reject output without CSV', () => {
        const output = createP2WPKHOutput(pubKey, 1000000n);
        const verified = bridge.hasCsvLock(output.scriptPubKey, recipient, 6);
        expect(verified).toBe(false);
    });
    
    it('should reject wrong CSV blocks', () => {
        const output = createCsvOutput(pubKey, 3, 1000000n);  // Only 3 blocks
        const verified = bridge.hasCsvLock(output.scriptPubKey, recipient, 6);
        expect(verified).toBe(false);
    });
});
```

### Integration Tests

```typescript
describe('CSV Integration', () => {
    it('should require CSV for BTC payments', async () => {
        // Create reservation
        const reservation = await pool.reserveOption(...);
        
        // Try to execute without CSV (should fail)
        const nonCsvOutput = createP2WPKHOutput(writerPubKey, btcPremium);
        await expect(pool.executeOption(reservationId)).rejects.toThrow('BTC payment not verified');
    });
    
    it('should accept BTC with valid CSV', async () => {
        // Create reservation
        const reservation = await pool.reserveOption(...);
        
        // Send BTC with CSV
        const csvOutput = createCsvOutput(writerPubKey, 6, btcPremium);
        
        // Execute should succeed
        const result = await pool.executeOption(reservationId);
        expect(result.success).toBe(true);
    });
});
```

## References

- [BIP-68: Relative lock-time via sequence numbers](https://github.com/bitcoin/bips/blob/master/bip-0068.mediawiki)
- [BIP-112: CHECKSEQUENCEVERIFY](https://github.com/bitcoin/bips/blob/master/bip-0112.mediawiki)
- [BIP-141: Segregated Witness](https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki)

## Next Steps

- [NativeSwapBridge Contract](../contracts/NativeSwapBridge.md)
- [Threat Model](./THREAT_MODEL.md)
- [Phase 2 Roadmap](../../internal/roadmap/PHASE_2_NATIVE.md)
