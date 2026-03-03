# Mode 1: NativeSwap (BTC Integration)

## Overview

NativeSwap mode enables **native BTC premiums** for options contracts. Writers receive BTC directly (via CSV-locked addresses), not wrapped tokens.

## Key Principle: No Wrapped BTC

```
❌ WRONG (Ethereum-style):
   BTC → WBTC → Contract → WBTC → BTC

✅ CORRECT (OPNet NativeSwap pattern):
   BTC → Writer's CSV Address (Bitcoin L1)
        ↑
   Contract verifies UTXO
```

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                    NATIVESWAP OPTIONS MODE                             │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                    OptionsContract.wasm                           │ │
│  │                                                                   │ │
│  │  Virtual BTC Reserve        │      Real OP20 Collateral          │ │
│  │  (u256 in storage)          │      (actual tokens held)          │ │
│  │                             │                                    │ │
│  │  Tracks "should have" BTC   │      Writer's locked tokens        │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                              │                                         │
│                              ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                    NativeSwap Bridge                              │ │
│  │                                                                   │ │
│  │  • getBtcPrice(token) → u256      (BTC/token rate)              │ │
│  │  • calculatePremium(...) → u256   (satoshis)                    │ │
│  │  • verifyBtcPayment(txOutputs) → bool                            │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                              │                                         │
│                              ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                    Bitcoin L1 (UTXOs)                             │ │
│  │                                                                   │ │
│  │  Buyer sends BTC ──► Writer's CSV-locked address                 │ │
│  │                             │                                     │ │
│  │                             ▼                                     │ │
│  │                    6+ block timelock                              │ │
│  │                    (prevents flash loans)                         │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

## Two-Phase Commit Pattern

### Phase 1: Reserve (Lock Price)

```typescript
@method(
    { name: 'underlying', type: ABIDataTypes.ADDRESS },
    { name: 'strikeBtc', type: ABIDataTypes.UINT256 },      // Satoshis per token
    { name: 'expiryBlock', type: ABIDataTypes.UINT64 },
    { name: 'optionType', type: ABIDataTypes.UINT8 },       // 0=Call, 1=Put
    { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
)
@emit('OptionReserved')
public reserveOption(calldata: Calldata): BytesWriter {
    // 1. Calculate BTC premium using NativeSwap price
    const btcPremium = this.calculateBtcPremium(
        underlying, strikeBtc, expiryBlock, optionType, underlyingAmount
    );
    
    // 2. Lock writer's OP20 collateral
    this.lockCollateral(writer, underlying, underlyingAmount);
    
    // 3. Create reservation with expiry (144 blocks ≈ 24h)
    const reservationExpiry = Blockchain.block.numberU256 + u256.fromU64(144);
    this.reservations.set(reservationId, reservation);
    
    // 4. Generate writer's CSV-locked address
    const csvAddress = this.generateCsvAddress(writer, 6);
    
    // 5. Return payment instructions
    const writer = new BytesWriter(128);
    writer.writeU256(reservationId);
    writer.writeU256(btcPremium);         // Satoshis to send
    writer.writeAddress(csvAddress);       // Where to send BTC
    return writer;
}
```

### Phase 2: Execute (Confirm BTC Payment)

```typescript
@method({ name: 'reservationId', type: ABIDataTypes.UINT256 })
@emit('OptionPurchased')
public executeOption(calldata: Calldata): BytesWriter {
    const reservation = this.reservations.get(reservationId);
    
    // 1. Verify reservation not expired
    const currentBlock = Blockchain.block.numberU256;
    if (currentBlock > reservation.expiry) {
        throw new Revert('Reservation expired');
    }
    
    // 2. Verify BTC payment via Blockchain.tx.outputs
    if (!this.verifyBtcPayment(reservation)) {
        throw new Revert('BTC payment not found');
    }
    
    // 3. Create active option
    this.createOption(reservation);
    
    // 4. Clear reservation
    this.reservations.delete(reservationId);
    
    return new BytesWriter(0);
}

private verifyBtcPayment(reservation: Reservation): bool {
    const outputs = Blockchain.tx.outputs;
    const expectedAmount = reservation.btcPremium;
    const expectedRecipient = reservation.writerCsvAddress;
    
    for (let i = 0; i < outputs.length; i++) {
        const output = outputs[i];
        
        // Check amount
        if (output.value < expectedAmount) continue;
        
        // Check recipient has CSV lock
        if (this.hasCsvLock(output, expectedRecipient, 6)) {
            return true;
        }
    }
    
    return false;
}
```

## CSV Timelocks

### Why CSV is Mandatory

| Attack Vector | Without CSV | With CSV |
|--------------|-------------|----------|
| Flash loan | Borrow BTC, buy option, exercise, repay | BTC locked 6 blocks |
| Atomic arbitrage | Single-transaction exploit | Must wait for confirmations |
| Rapid cycling | Buy/sell to manipulate price | Rate-limited by block time |

### CSV Address Generation

```typescript
private generateCsvAddress(writer: Address, csvBlocks: u64): Address {
    // Create P2WSH script with CSV:
    // <csvBlocks> CHECKSEQUENCEVERIFY DROP <writerPubKey> CHECKSIG
    
    const csvScript = new BytesWriter(40);
    csvScript.writeU64(csvBlocks);
    csvScript.writeBytes(CSV_VERIFY_OP);    // OP_CHECKSEQUENCEVERIFY
    csvScript.writeBytes(DROP_OP);           // OP_DROP
    csvScript.writeBytes(writer.pubKey);
    csvScript.writeBytes(CHECKSIG_OP);       // OP_CHECKSIG
    
    return Address.fromScript(csvScript.buffer);
}
```

## Virtual BTC Reserve

NativeSwap uses **virtual reserves** - tracking BTC amounts in contract storage without actually holding BTC.

```typescript
// Storage
private virtualBtcReservePointer: u16 = Blockchain.nextPointer;
private _virtualBtcReserve: StoredU256;

// When option is purchased, virtual reserve increases
private onBtcPremiumReceived(amount: u256): void {
    const current = this._virtualBtcReserve.get();
    this._virtualBtcReserve.set(SafeMath.add(current, amount));
}

// When option is exercised/expired, virtual reserve decreases
private onBtcPayout(amount: u256): void {
    const current = this._virtualBtcReserve.get();
    this._virtualBtcReserve.set(SafeMath.sub(current, amount));
}
```

## Price Oracle Integration

Use NativeSwap to get BTC/OP20 exchange rate:

```typescript
// Get current BTC price for a token
private getBtcPrice(token: Address): u256 {
    // Query NativeSwap contract
    const nativeSwap = NativeSwap.bind(NATIVE_SWAP_ADDRESS);
    const result = nativeSwap.getQuote(token, 100_000_000n); // 0.001 BTC
    
    // Returns tokens per 0.001 BTC
    // Calculate satoshis per token
    const satoshis = 100_000_000n;
    const tokens = result.tokensOut;
    
    return SafeMath.div(
        SafeMath.mul(satoshis, u256.fromU64(100)),
        tokens
    ); // Satoshis per 100 tokens
}

// Calculate option premium in BTC
private calculateBtcPremium(
    underlying: Address,
    strikeBtc: u256,
    expiryBlock: u64,
    optionType: u8,
    amount: u256
): u256 {
    // Get current BTC price
    const currentPrice = this.getBtcPrice(underlying);
    
    // Moneyness
    const itm = optionType === CALL 
        ? currentPrice > strikeBtc 
        : currentPrice < strikeBtc;
    
    // Time value
    const blocksRemaining = expiryBlock - Blockchain.block.number;
    const timeValue = this.sqrt(u256.fromU64(blocksRemaining));
    
    // Base premium (simplified Black-Scholes)
    let premium: u256;
    if (itm) {
        // Intrinsic value + time value
        const intrinsic = SafeMath.sub(currentPrice, strikeBtc);
        premium = SafeMath.add(intrinsic, timeValue);
    } else {
        // Only time value for OTM
        premium = timeValue;
    }
    
    // Scale by amount
    return SafeMath.mul(premium, amount);
}
```

## Settlement at Expiry

### ITM (In-the-Money)

```typescript
// Call ITM: currentPrice > strikeBtc
// Put ITM: currentPrice < strikeBtc

private settleITM(option: Option): void {
    if (option.optionType === CALL) {
        // Buyer receives underlying tokens
        this.transferToken(
            option.underlying,
            option.writer,
            option.buyer,
            option.underlyingAmount
        );
    } else {
        // Buyer sells underlying, receives strike value
        // (Buyer must have underlying to sell)
        this.transferToken(
            option.underlying,
            option.buyer,
            option.writer,
            option.underlyingAmount
        );
        
        // Writer pays strike value (already locked as collateral)
        this.transferToken(
            this.premiumToken,
            this.address,
            option.buyer,
            option.strikeValue
        );
    }
}
```

### OTM (Out-of-the-Money)

```typescript
// Call OTM: currentPrice <= strikeBtc
// Put OTM: currentPrice >= strikeBtc

private settleOTM(option: Option): void {
    // Writer keeps collateral
    // Writer already received BTC premium (on-chain)
    // Nothing to do - collateral already unlocked
}
```

## Security Considerations

### UTXO Verification

```typescript
// CRITICAL: Verify BTC was actually sent
private verifyBtcPayment(reservation: Reservation): bool {
    const outputs = Blockchain.tx.outputs;
    
    // Must check ALL outputs
    for (let i = 0; i < outputs.length; i++) {
        // Verify amount
        // Verify recipient
        // Verify CSV lock
        // Verify no dust outputs
    }
    
    return false;
}
```

### Reservation Expiry

```typescript
// Reservations expire after 144 blocks (~24 hours)
const RESERVATION_TIMEOUT_BLOCKS: u64 = 144;

// On expiry, unlock writer's collateral
if (currentBlock > reservation.expiryBlock) {
    this.unlockCollateral(reservation);
    this.reservations.delete(reservationId);
}
```

### Reorg Protection

```typescript
// Wait for confirmations before settling
const REQUIRED_CONFIRMATIONS: u64 = 6;

private canSettle(option: Option): bool {
    const currentBlock = Blockchain.block.number;
    return currentBlock >= option.expiryBlock + REQUIRED_CONFIRMATIONS;
}
```

## Events

```typescript
@emit('OptionReserved')
// reservationId, btcPremium, csvAddress, expiryBlock

@emit('OptionPurchased')
// optionId, buyer, writer, btcAmount, underlyingAmount

@emit('OptionExercised')
// optionId, buyer, settlementType, amounts

@emit('OptionExpired')
// optionId, writer, collateralReturned

@emit('ReservationExpired')
// reservationId, collateralReturned
```

## Gas Optimization

| Pattern | Cost | Alternative |
|---------|------|-------------|
| Store full CSV script | High | Store only pubkey, reconstruct |
| Multiple UTXO checks | Medium | Early exit on match |
| Bigints for satoshis | Medium | u64 sufficient (max 21M BTC) |

## Next Steps

- [Mode 2: AMM Pool](./mode-2-amm.md)
- [NativeSwapBridge Contract](../contracts/NativeSwapBridge.md)
- [Phase 2 Roadmap](../../internal/roadmap/PHASE_2_NATIVE.md)
