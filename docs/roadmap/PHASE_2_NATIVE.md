# Phase 2: NativeSwap Integration

## Overview

Phase 2 adds native BTC support via NativeSwap integration. Buyers can pay premiums in BTC, and strikes can be denominated in BTC.

**Status**: Future

**Timeline**: 6-8 weeks

**Prerequisite**: Phase 1 complete

---

## Scope

### Included

- ✅ BTC premiums (buyers pay BTC to writers)
- ✅ BTC-denominated strikes
- ✅ NativeSwap price oracle
- ✅ CSV timelocks on BTC outputs
- ✅ UTXO verification
- ✅ Two-phase commit (reserve → execute)

### Excluded

- ❌ AMM liquidity pools (Phase 3)
- ❌ BTC collateral (contracts cannot hold BTC)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PHASE 2 ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │                   OptionsFactory.wasm                        │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │                    OptionsPool.wasm                          │  │
│   │                          +                                   │  │
│   │              BTC Premium Support                             │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              │ uses                                 │
│                              ▼                                      │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │                 NativeSwapBridge.wasm                        │  │
│   │                                                              │  │
│   │   getBtcPrice(token) → satoshisPerToken                     │  │
│   │   verifyBtcPayment(outputs, expected) → bool                │  │
│   │   generateCsvAddress(pubkey, blocks) → Address              │  │
│   │   calculateBtcPremium(...) → satoshis                       │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              │ queries                              │
│                              ▼                                      │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │                    NativeSwap.wasm                           │  │
│   │                                                              │  │
│   │   getQuote(token, satoshis) → tokensOut                     │  │
│   │   (Existing DEX - no modifications needed)                   │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │                    Bitcoin L1                                │  │
│   │                                                              │  │
│   │   Buyer ──(BTC)──► Writer's CSV Address                     │  │
│   │                           │                                  │  │
│   │                           ▼                                  │  │
│   │                    6+ block timelock                         │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## New Contract: NativeSwapBridge

### Purpose

Provides BTC-related functionality to OptionsPool contracts.

### Methods

| Method | Description |
|--------|-------------|
| `getBtcPrice(token)` | Returns satoshis per token |
| `verifyBtcPayment(outputs, expected)` | Verifies BTC was sent |
| `generateCsvAddress(pubkey, blocks)` | Creates CSV-locked address |
| `calculateBtcPremium(...)` | Calculates premium in satoshis |

---

## Two-Phase Commit

### Why Two Phases?

| Problem | Solution |
|---------|----------|
| BTC takes time to confirm | Reserve locks price first |
| Price can move during wait | Reservation guarantees rate |
| User might not send BTC | Reservation expires, collateral returns |
| Front-running | Per-user reservation, not broadcast |

### Phase 1: Reserve

```typescript
@method(
    { name: 'underlying', type: ABIDataTypes.ADDRESS },
    { name: 'strikeBtc', type: ABIDataTypes.UINT256 },
    { name: 'expiryBlock', type: ABIDataTypes.UINT64 },
    { name: 'optionType', type: ABIDataTypes.UINT8 },
    { name: 'underlyingAmount', type: ABIDataTypes.UINT256 },
)
@emit('OptionReserved')
public reserveOption(calldata: Calldata): BytesWriter {
    // 1. Calculate BTC premium
    const btcPremium = bridge.calculateBtcPremium(...);
    
    // 2. Lock writer's collateral
    this.lockCollateral(writer, underlying, underlyingAmount);
    
    // 3. Generate CSV address for writer
    const csvAddress = bridge.generateCsvAddress(writerPubKey, 6);
    
    // 4. Create reservation (expires in 144 blocks)
    reservation.expiryBlock = Blockchain.block.number + 144;
    
    // 5. Return payment instructions
    return {
        reservationId,
        btcPremium,
        csvAddress
    };
}
```

### Phase 2: Execute

```typescript
@method({ name: 'reservationId', type: ABIDataTypes.UINT256 })
@emit('OptionPurchased')
public executeOption(calldata: Calldata): BytesWriter {
    // 1. Get reservation
    const reservation = this.reservations.get(reservationId);
    
    // 2. Check not expired
    if (Blockchain.block.number > reservation.expiryBlock) {
        throw new Revert('Reservation expired');
    }
    
    // 3. Verify BTC payment
    if (!bridge.verifyBtcPayment(outputs, reservation)) {
        throw new Revert('BTC payment not verified');
    }
    
    // 4. Create active option
    this.createOption(reservation);
    
    // 5. Clear reservation
    this.reservations.delete(reservationId);
}
```

---

## CSV Timelocks

### Mandatory for All BTC Outputs

```typescript
// Minimum CSV: 6 blocks (~1 hour)
const MIN_CSV_BLOCKS: u64 = 6;

// Writer receives BTC at CSV-locked address
const csvAddress = bridge.generateCsvAddress(writerPubKey, MIN_CSV_BLOCKS);
```

### Why Mandatory?

| Attack | Without CSV | With CSV |
|--------|-------------|----------|
| Flash loan | Borrow BTC, buy option, exercise, repay | BTC locked 6 blocks, can't repay |
| Atomic arb | All in 1 transaction | Must wait 6 blocks |
| Rapid cycling | Unlimited | 6 blocks per cycle |

---

## BTC Strike Denomination

### Option Types

```
Call Option:
├── Underlying: MOTO (OP20)
├── Strike: 0.0001 BTC per MOTO
├── Premium: 0.00005 BTC
└── At expiry:
    ├── If MOTO > 0.0001 BTC: ITM
    └── If MOTO <= 0.0001 BTC: OTM

Put Option:
├── Underlying: MOTO (OP20)
├── Strike: 0.0001 BTC per MOTO
├── Premium: 0.00003 BTC
└── At expiry:
    ├── If MOTO < 0.0001 BTC: ITM
    └── If MOTO >= 0.0001 BTC: OTM
```

### Price Resolution

At expiry, contract queries NativeSwap for current BTC price:

```typescript
private getCurrentBtcPrice(token: Address): u256 {
    const bridge = NativeSwapBridge.bind(BRIDGE_ADDRESS);
    return bridge.getBtcPrice(token);
}

private isITM(option: Option): bool {
    const currentPrice = this.getCurrentBtcPrice(option.underlying);
    
    if (option.optionType === CALL) {
        return currentPrice > option.strikeBtc;
    } else {
        return currentPrice < option.strikeBtc;
    }
}
```

---

## UTXO Verification

### What We Verify

```typescript
private verifyBtcPayment(expected: Reservation): bool {
    const outputs = Blockchain.tx.outputs;
    
    for (let i = 0; i < outputs.length; i++) {
        const output = outputs[i];
        
        // 1. Exact amount match
        if (output.value != expected.btcPremium) continue;
        
        // 2. Correct recipient with CSV
        if (!hasCsvLock(output, expected.writer, 6)) continue;
        
        // 3. No dust outputs
        if (hasDustOutputs(outputs)) continue;
        
        return true;
    }
    
    return false;
}
```

---

## Security Considerations

### Price Staleness

```typescript
const MAX_PRICE_AGE: u64 = 6;  // 6 blocks

private checkPriceFreshness(lastUpdate: u64): void {
    if (Blockchain.block.number - lastUpdate > MAX_PRICE_AGE) {
        throw new Revert('Price data stale');
    }
}
```

### Reorg Protection

```typescript
const REQUIRED_CONFIRMATIONS: u64 = 6;

private canSettle(option: Option): bool {
    return Blockchain.block.number >= option.expiryBlock + REQUIRED_CONFIRMATIONS;
}
```

---

## Milestones

### Week 1-2: NativeSwapBridge

- [ ] Contract structure
- [ ] Price oracle integration
- [ ] CSV address generation
- [ ] UTXO verification
- [ ] Unit tests

### Week 3-4: OptionsPool Integration

- [ ] Two-phase commit in OptionsPool
- [ ] BTC premium calculation
- [ ] BTC strike support
- [ ] Reservation management
- [ ] Integration tests

### Week 5-6: Security

- [ ] CSV enforcement
- [ ] Price freshness checks
- [ ] Reorg handling
- [ ] Security audit
- [ ] Penetration testing

### Week 7-8: Testing & Deployment

- [ ] End-to-end tests
- [ ] Mainnet preparation
- [ ] Documentation
- [ ] Deployment to regtest

---

## Dependencies

### Existing

- Phase 1 contracts
- NativeSwap (deployed)
- OPNet runtime

### New

```json
{
  "NativeSwapBridge.wasm": "New contract"
}
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| NativeSwap oracle failure | Low | High | Fallback pricing, circuit breaker |
| BTC price manipulation | Medium | High | TWAP, freshness checks |
| Chain reorg | Low | Medium | Confirmation delays |
| CSV bypass | Very Low | Critical | Script verification |

---

## Success Criteria

Phase 2 is complete when:

1. ✅ Buyers can pay BTC premiums
2. ✅ Strikes can be denominated in BTC
3. ✅ All BTC outputs have CSV timelocks
4. ✅ UTXO verification works correctly
5. ✅ Two-phase commit prevents front-running
6. ✅ NativeSwap oracle integration stable
7. ✅ All security tests pass
8. ✅ Deployed to regtest

---

## Next Steps

- [Phase 1: MVP](./PHASE_1_MVP.md)
- [Phase 3: AMM Pools](./PHASE_3_AMM.md)
- [NativeSwapBridge Contract](../contracts/NativeSwapBridge.md)
- [CSV Timelocks](../security/CSV_TIMELOCKS.md)
