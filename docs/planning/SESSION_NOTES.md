# Session Notes

## Project: FrogOp - Options Protocol on OPNet

**Started**: February 2024

**Status**: Planning Phase Complete

---

## Participants

- User (Project Owner)
- AI Assistant (Planning & Documentation)

---

## Session Summary

### Initial Request

Build an options protocol on OPNet (Bitcoin Layer 1 smart contracts).

### Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Phase 2 Priority | NativeSwap (BTC) | Wider market appeal, native BTC support |
| AMM Pool Type | Covered Call + Cash-Secured Put | Conservative, capital efficient |
| Strike Denomination | Token pair (no oracle) | Simpler, no external dependency |
| Pool Creation | Permissionless factory | Like MotoSwap, composable |
| MVP Option Types | Calls + Puts | Complete option coverage |
| Doc Location | `docs/` folder | Clean structure |

---

## Design Decisions

### Integration Modes

**Mode 1: NativeSwap (Phase 2)**
- BTC premiums via CSV-locked addresses
- No wrapped BTC
- Two-phase commit (reserve → execute)
- Price oracle via NativeSwap

**Mode 2: AMM (Phase 3)**
- OP20-to-OP20 liquidity pools
- No stablecoins required
- Pool-based pricing
- LP rewards from fees + premiums

### Technical Constraints

From OPNet documentation:

| Constraint | Implication |
|------------|-------------|
| Contracts cannot hold BTC | Use UTXO verification, virtual reserves |
| medianTimestamp manipulable | Use block height for ALL time logic |
| SafeMath mandatory | No raw arithmetic on u256 |
| @nonReentrant required | All state-changing methods |
| 352 byte event limit | Keep events minimal |
| CSV timelocks required | 6+ blocks on BTC outputs |

---

## Architecture Decisions

### Contract Structure

```
OptionsFactory (permissionless pool creation)
    └── deploys
        OptionsPool (core option market)
            └── Phase 2 extends
                NativeSwapBridge (BTC support)
            └── Phase 3 extends
                AMMPool (liquidity pools)
```

### Option Lifecycle

```
OPEN (written, no buyer)
    │ buyOption()
    ▼
PURCHASED (buyer paid premium)
    │
    ├── exercise() → EXERCISED (ITM)
    ├── (expiry) → EXPIRED (OTM)
    └── cancel() → CANCELLED (pre-buy only)
```

---

## Files Created

### Documentation Structure

```
docs/
├── README.md                    ✅ Created
├── ARCHITECTURE.md              ✅ Created
│
├── modes/
│   ├── mode-1-nativeswap.md     ✅ Created
│   ├── mode-2-amm.md            ✅ Created
│   └── mode-comparison.md       ✅ Created
│
├── contracts/
│   ├── OptionsFactory.md        ✅ Created
│   ├── OptionsPool.md           ✅ Created
│   ├── NativeSwapBridge.md      ✅ Created
│   └── AMMPool.md               ✅ Created
│
├── security/
│   ├── THREAT_MODEL.md          ✅ Created
│   ├── AUDIT_CHECKLIST.md       ✅ Created
│   └── CSV_TIMELOCKS.md         ✅ Created
│
├── roadmap/
│   ├── PHASE_1_MVP.md           ✅ Created
│   ├── PHASE_2_NATIVE.md        ✅ Created
│   └── PHASE_3_AMM.md           ✅ Created
│
└── planning/
    └── SESSION_NOTES.md         ✅ Created (this file)
```

---

## Key Learnings

### OPNet Patterns

1. **Constructor Trap**: Constructor runs on EVERY call. Use `onDeployment()` for one-time init.

2. **Two-Phase Commit**: Required for any BTC-coordinated operations.

3. **Block Height > Timestamp**: `Blockchain.block.number` is safe; `medianTimestamp` is manipulable.

4. **CSV Mandatory**: All BTC recipient addresses need 6+ block timelocks.

5. **SafeMath Always**: Every u256 operation must use SafeMath.

6. **No Wrapped BTC**: Use NativeSwap pattern for BTC exposure.

### NativeSwap Integration

- Virtual BTC reserves (not actual BTC)
- UTXO verification via `Blockchain.tx.outputs`
- Price discovery via existing NativeSwap contract
- No modifications to NativeSwap needed

### AMM Design

- Constant product formula: `x * y = k`
- No stablecoins needed - any OP20/OP20 pair
- LPs earn: trading fees + option premiums + unexercised options
- Risks: impermanent loss + assignment

---

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Use wrapped BTC? | No - NativeSwap pattern instead |
| Require stablecoins for AMM? | No - any OP20/OP20 pair works |
| Permissionless pools? | Yes - factory pattern |
| Phase 2 priority? | NativeSwap (BTC) |
| AMM type? | Covered calls + cash-secured puts |
| Strike denomination? | Token pair (no oracle) |

---

## Next Steps

### Immediate (Phase 1 Start)

1. [ ] Set up project structure
2. [ ] Install OPNet dependencies
3. [ ] Create OptionsFactory contract skeleton
4. [ ] Create OptionsPool contract skeleton
5. [ ] Write initial tests

### Phase 1 Deliverables

- [ ] OptionsFactory.wasm
- [ ] OptionsPool.wasm
- [ ] Unit tests (>90% coverage)
- [ ] Integration tests
- [ ] Deployed to regtest

### Future Phases

- [ ] Phase 2: NativeSwapBridge.wasm
- [ ] Phase 2: BTC premium support
- [ ] Phase 3: AMMPool.wasm
- [ ] Phase 3: LP functionality

---

## References

### OPNet Documentation

- `docs/btc-runtime/` - Contract development
- `docs/opnet/` - Frontend integration
- `guidelines/audit-guidelines.md` - Security checklist
- `how-to/dex-building.md` - NativeSwap pattern

### External Resources

- [BIP-68](https://github.com/bitcoin/bips/blob/master/bip-0068.mediawiki) - Relative lock-time
- [BIP-112](https://github.com/bitcoin/bips/blob/master/bip-0112.mediawiki) - CHECKSEQUENCEVERIFY

---

## Changelog

| Date | Change |
|------|--------|
| Feb 2024 | Initial planning session |
| Feb 2024 | Created all documentation files |
| Feb 2024 | Design decisions finalized |

---

## Contact

For questions about this planning session, refer to the documentation in `docs/` or create an issue in the repository.
