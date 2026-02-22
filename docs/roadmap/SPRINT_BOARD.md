# Sprint Board: Phase 1

## Sprint 1: Setup & Factory (Week 1) ✅

### Done
| # | Task | Completed |
|---|------|-----------|
| 1.1 | Project Setup | ✅ npm, AS config, tests |
| 1.2 | OptionsFactory | ✅ createPool, getPool, registry |

---

## Sprint 2: Write & Cancel (Week 2) ✅

### Done
| # | Story | Tasks | Status |
|---|-------|-------|--------|
| 1.3 | Write Option | writeOption(), OptionStorage, validation, token transfer | ✅ Complete |
| 1.4 | Cancel Option | cancelOption(), writer-only, 1% fee, fee accumulation | ✅ Complete |

---

## Sprint 3: Buy & Exercise (Week 3) ✅

### Done
| # | Story | Tasks | Status |
|---|-------|-------|--------|
| 1.5 | Buy Option | buyOption(), premium to writer, status PURCHASED | ✅ Complete |
| 1.6 | Exercise | exercise() call/put, grace period, transfers | ✅ Complete |
| 1.7 | Settle | settle(), after grace period, collateral to writer | ✅ Complete |

---

## Sprint 4: Security & Testing (Week 4) ✅

### Done
| # | Story | Tasks | Status |
|---|-------|-------|--------|
| 2.1 | Reentrancy | All 5 state-changing methods protected | ✅ Complete |
| 2.2 | SafeMath | All u256 arithmetic uses SafeMath | ✅ Complete |
| 2.3 | Access Control | All restrictions verified | ✅ Complete |
| 1.8 | View Methods | accumulatedFees, constants, calculateCollateral | ✅ Complete |

### Security Fixes Applied
- Fixed checks-effects-interactions pattern in `exercise()` and `settle()`
- State now updated BEFORE external token transfers

### View Methods Added
- `accumulatedFees()` → total cancellation fees collected
- `gracePeriodBlocks()` → 144 blocks
- `maxExpiryBlocks()` → 52560 blocks (~1 year)
- `cancelFeeBps()` → 100 basis points (1%)
- `calculateCollateral(type, strike, amount)` → helper for frontend

---

## Sprint 4.5: Gas Optimization (INSERT WEEK - HIGH PRIORITY) 🔴

### Rationale
Analysis revealed OptionsPool uses 9 SHA256 operations per option read, causing excessive gas costs.
Must optimize before frontend work to ensure mainnet viability.

### To Do
| # | Story | Tasks | Est. | Priority |
|---|-------|-------|------|----------|
| 6.1 | Gas Baseline | Measure current gas, create comparison script | 4h | Must |
| 6.2 | Redesign OptionStorage | Remove SHA256, use direct pointers, pack fields | 12h | Must |
| 6.3 | Use ReentrancyGuard | Replace manual lock with @nonReentrant | 2h | Must |
| 6.4 | Add @method Decorators | Proper ABI declarations on all methods | 3h | Should |
| 6.5 | Add Missing Events | PoolCreated event, verify sizes | 2h | Should |

**Sprint Goal**: Reduce gas by 50%+, no behavior changes

**Success Criteria**:
- [ ] getOption gas reduced by >50%
- [ ] All tests pass
- [ ] No behavior changes

**See**: [GAS_OPTIMIZATION_REFACTOR.md](./GAS_OPTIMIZATION_REFACTOR.md)

---

## Sprint 5: Frontend MVP (Week 5) - DELAYED

### To Do
| # | Story | Tasks | Est. |
|---|-------|-------|------|
| 4.1 | Frontend Setup | Vite, React, opwallet, opnet | 6h |
| 4.2 | Pool Discovery | Pool list, create button | 6h |
| 4.3 | Option Browse | Option list, filters, details | 9h |
| 4.4 | Write Flow | Form, validation, approval, submit | 14h |
| 4.5 | Buy Flow | Modal, approval, purchase | 8h |

---

## Sprint 6: Portfolio & Deploy (Week 6)

### To Do
| # | Story | Tasks | Est. |
|---|-------|-------|------|
| 4.6 | Portfolio | Written/purchased options, P/L | 11h |
| 4.7 | Exercise Flow | Modal, outcome, approval, submit | 9h |
| 5.1 | Regtest Deploy | Scripts, tokens, contracts | 8h |
| 5.2 | Frontend Deploy | Build, IPFS, configure | 4h |

---

## Story Point Summary

| Sprint | Stories | Points | Hours | Status |
|--------|---------|--------|-------|--------|
| 1 | 1.1, 1.2 | 13 | 23h | ✅ Done |
| 2 | 1.3, 1.4 | 13 | 33h | ✅ Done |
| 3 | 1.5, 1.6, 1.7 | 18 | 40h | ✅ Done |
| 4 | 2.1-2.3, 1.8 | 14 | 27h | ✅ Done |
| **4.5** | **6.1-6.5** | **18** | **23h** | **🔴 BLOCKING** |
| 5 | 4.1-4.5 | 26 | 43h | ⏸️ Delayed |
| 6 | 4.6, 4.7, 5.1, 5.2 | 18 | 32h | - |
| **Total** | **25 stories** | **131** | **244h** | **54% Complete** |

---

## Gas Optimization Epic (Epic 6)

### Contract Stories (Epic 6) - NEW
- 6.1: Gas Baseline Measurement ⬜
- 6.2: Redesign OptionStorage ⬜
- 6.3: Use ReentrancyGuard ⬜
- 6.4: Add @method Decorators ⬜
- 6.5: Add Missing Events ⬜

### Quick Reference

### Contract Stories (Epic 1)
- 1.1: Project Setup ✅
- 1.2: OptionsFactory ✅
- 1.3: Write Option ✅
- 1.4: Cancel Option ✅
- 1.5: Buy Option ✅
- 1.6: Exercise ✅
- 1.7: Settle ✅
- 1.8: View Methods ✅

### Security Stories (Epic 2)
- 2.1: Reentrancy Protection ✅
- 2.2: SafeMath Compliance ✅
- 2.3: Access Control ✅

### Testing Stories (Epic 3)
- 3.1: Unit Test Coverage
- 3.2: Integration Tests

### Frontend Stories (Epic 4)
- 4.1: Frontend Setup
- 4.2: Pool Discovery
- 4.3: Option Browse
- 4.4: Write Flow
- 4.5: Buy Flow
- 4.6: Portfolio
- 4.7: Exercise Flow

### Deployment Stories (Epic 5)
- 5.1: Regtest Deployment
- 5.2: Frontend Deployment

---

## OptionsPool Methods Summary

### Write Methods (State-Changing)
| Method | Access | Description |
|--------|--------|-------------|
| `writeOption(type, strike, expiry, amount, premium)` | Anyone | Create option, lock collateral |
| `cancelOption(optionId)` | Writer only | Cancel unpurchased option, 1% fee |
| `buyOption(optionId)` | Anyone but writer | Pay premium, become buyer |
| `exercise(optionId)` | Buyer only | After expiry, during grace period |
| `settle(optionId)` | Anyone | After grace period, return collateral |

### View Methods
| Method | Returns | Description |
|--------|---------|-------------|
| `underlying()` | Address | Underlying token |
| `premiumToken()` | Address | Premium/strike token |
| `optionCount()` | u256 | Total options created |
| `getOption(id)` | Tuple | Full option details |
| `accumulatedFees()` | u256 | Collected cancellation fees |
| `gracePeriodBlocks()` | u64 | 144 blocks |
| `maxExpiryBlocks()` | u64 | 52560 blocks |
| `cancelFeeBps()` | u64 | 100 (1%) |
| `calculateCollateral(type, strike, amount)` | u256 | Helper for frontend |
