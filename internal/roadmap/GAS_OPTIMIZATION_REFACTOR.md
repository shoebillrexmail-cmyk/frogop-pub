# Gas Optimization & Complexity Refactor Plan

## Executive Summary

Analysis of OptionsFactory and OptionsPool contracts against OPNet best practices reveals significant gas inefficiencies that will cause:
- High transaction costs on mainnet
- Potential out-of-gas errors for complex operations
- Poor user experience (slow, expensive transactions)

**Recommendation**: Pause Sprint 5 (Frontend) and insert a 1-week optimization sprint before proceeding.

---

## Analysis: OptionsFactory (Low Priority)

### Current State: GOOD ✅

The OptionsFactory contract follows best practices well:

| Aspect | Status | Notes |
|--------|--------|-------|
| Constructor fields | ✅ | Only 3 fields (safe under gas limit) |
| onDeployment | ✅ | Used correctly for one-time init |
| Storage pattern | ✅ | MapOfMap for pools |
| SafeMath | ✅ | Uses library functions |
| Input validation | ✅ | Validates addresses |

### Minor Issues (P3 - Backlog)

| Issue | Location | Fix | Priority |
|-------|----------|-----|----------|
| Missing `@method` decorators | All public methods | Add proper decorators | P3 |
| Missing `@view` decorators | View methods | Add decorator | P3 |
| No PoolCreated event | createPool() | Add event emission | P3 |
| getPoolCount returns 0 | getPoolCount() | Track with counter | P3 |

---

## Analysis: OptionsPool (HIGH PRIORITY)

### Current State: PROBLEMATIC ⚠️

The OptionsPool has significant gas inefficiencies:

### Critical Issues

#### 1. OptionStorage Class - Excessive SHA256 Operations

**Location**: `contract.ts:213-351`

**Problem**: Every field access requires:
1. `BytesWriter` allocation (34 bytes)
2. SHA256 hash computation
3. Storage read/write

**Impact**: Reading one option = **9 SHA256 + 9 storage reads**

```typescript
// Current (EXPENSIVE)
private getKey(optionId: u256, fieldOffset: u8): Uint8Array {
    const writer = new BytesWriter(34);
    writer.writeU16(this.basePointer);
    writer.writeU256(optionId);
    writer.writeU8(fieldOffset);
    return sha256(writer.getBuffer());  // SHA256 on every field!
}

get(optionId: u256): Option {
    option.writer = this.getWriter(optionId);    // SHA256 + read
    option.buyer = this.getBuyer(optionId);      // SHA256 + read
    option.strikePrice = this.getStrikePrice(optionId);  // SHA256 + read
    // ... 6 more SHA256 + reads
}
```

**Estimated gas**: ~180M gas per option read (9 × 20M)

#### 2. Non-Contiguous Pointer Allocation

**Location**: `contract.ts:107-147`

**Problem**: Pointers are hardcoded with gaps (10-12, 100-102) instead of contiguous allocation.

**Impact**: Wastes pointer space, harder to reason about.

#### 3. Manual Reentrancy Guard

**Location**: `contract.ts:587-590`, `674-676`, etc.

**Problem**: Manual `this.locked.value = true/false` instead of using `ReentrancyGuard`.

**Impact**: Error-prone, forgot to reset in some error paths.

#### 4. No `@method` Decorators

**Problem**: All public methods lack proper ABI declarations.

**Impact**: Poor interoperability, callers must hand-roll calldata.

### Performance Comparison

| Operation | Current Gas | Optimized Gas | Savings |
|-----------|-------------|---------------|---------|
| writeOption | ~200M | ~50M | 75% |
| getOption | ~180M | ~20M | 89% |
| exercise | ~300M | ~80M | 73% |

---

## Refactoring Strategy

### Approach: Incremental Refactor

Follow agile principles:
1. **Vertical slices**: Each story delivers working contract
2. **Test-first**: Ensure behavior preserved
3. **Measure**: Gas before/after each change
4. **Revert-friendly**: Small commits, easy to roll back

### Storage Redesign

#### Option 1: Packed Fields (Recommended)

Store each option in contiguous pointers, use bit packing:

```
Base Pointer = 1000 (options start)
For each optionId:
  [base + id*10 + 0] = writer (Address, 32 bytes)
  [base + id*10 + 1] = buyer (Address, 32 bytes)
  [base + id*10 + 2] = strikePrice (u256, 32 bytes)
  [base + id*10 + 3] = underlyingAmount (u256, 32 bytes)
  [base + id*10 + 4] = premium (u256, 32 bytes)
  [base + id*10 + 5] = expiryBlock | createdBlock (u64 | u64 = u128 packed)
  [base + id*10 + 6] = optionType | status (u8 | u8 = u16 packed)
```

**Benefits**:
- No SHA256 needed (direct pointer arithmetic)
- 7 storage slots instead of 9
- O(1) direct access

#### Option 2: Use StoredMap

Use OPNet's built-in StoredMap instead of custom OptionStorage:

```typescript
// Simpler approach
private optionsWriter: StoredMap<Address>;     // optionId => writer
private optionsBuyer: StoredMap<Address>;      // optionId => buyer
private optionsStrike: StoredMap<u256>;        // optionId => strike
// etc.
```

**Benefits**:
- Uses OPNet primitives
- Less custom code
- Built-in optimizations

### Recommended: Option 1 (Packed Fields)

Best gas efficiency with direct pointer access.

---

## Refactor Backlog (Agile Format)

### Epic 6: Gas Optimization

#### Story 6.1: Create Gas Baseline

**As a** developer  
**I want** to measure current gas usage  
**So that** I can verify optimization improvements

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 6.1.1 | Add gas measurement to tests | 2h | Tests output gas used |
| 6.1.2 | Record baseline for all methods | 1h | Document with gas numbers |
| 6.1.3 | Create gas comparison script | 1h | Script compares before/after |

**Definition of Done**:
- [ ] Gas measurements recorded for all methods
- [ ] Baseline document created

---

#### Story 6.2: Redesign OptionStorage

**As a** developer  
**I want** an efficient OptionStorage class  
**So that** option reads/writes use minimal gas

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 6.2.1 | Design new pointer layout | 1h | Document pointer ranges |
| 6.2.2 | Implement PackedOptionStorage | 4h | Direct pointer access, no SHA256 |
| 6.2.3 | Implement pack/unpack helpers | 2h | Pack u64s into u128, u8s into u16 |
| 6.2.4 | Update all get/set methods | 3h | Use new storage class |
| 6.2.5 | Run tests, verify behavior | 2h | All tests pass |
| 6.2.6 | Measure gas improvement | 1h | Document savings |

**Definition of Done**:
- [ ] New storage class implemented
- [ ] All tests pass
- [ ] Gas reduced by >50% for getOption
- [ ] No behavior changes

---

#### Story 6.3: Use ReentrancyGuard

**As a** security auditor  
**I want** proper ReentrancyGuard usage  
**So that** reentrancy protection is reliable

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 6.3.1 | Import ReentrancyGuard from OP_NET | 0.5h | Import added |
| 6.3.2 | Remove manual locked flag | 0.5h | Code removed |
| 6.3.3 | Apply @nonReentrant to methods | 0.5h | All 5 methods decorated |
| 6.3.4 | Update tests | 1h | Tests verify reentrancy blocked |

**Definition of Done**:
- [ ] Manual lock removed
- [ ] @nonReentrant on all state-changing methods
- [ ] Tests pass

---

#### Story 6.4: Add @method Decorators

**As a** frontend developer  
**I want** proper ABI declarations  
**So that** contract calls are type-safe

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 6.4.1 | Add @method to OptionsFactory | 1h | All methods decorated |
| 6.4.2 | Add @method to OptionsPool | 2h | All methods decorated |
| 6.4.3 | Add @view to view methods | 0.5h | View methods marked |
| 6.4.4 | Verify ABI generation | 0.5h | ABIs match methods |

**Definition of Done**:
- [ ] All methods have @method decorators
- [ ] View methods have @view decorators
- [ ] ABIs generated correctly

---

#### Story 6.5: Add Missing Events

**As a** frontend developer  
**I want** events for all state changes  
**So that** UI can react to blockchain events

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 6.5.1 | Add PoolCreated event to factory | 1h | Event emitted on createPool |
| 6.5.2 | Verify all pool events present | 0.5h | 5 events exist |
| 6.5.3 | Check event size limits | 0.5h | All events < 352 bytes |

**Definition of Done**:
- [ ] PoolCreated event emitted
- [ ] All events under size limit
- [ ] Tests verify events

---

## Sprint Plan

### Sprint 4.5: Gas Optimization (INSERT - Week 4.5)

**Goal**: Reduce gas usage by 50%+ without changing behavior

| Story | Points | Priority |
|-------|--------|----------|
| 6.1 Gas Baseline | 3 | Must |
| 6.2 Redesign OptionStorage | 8 | Must |
| 6.3 Use ReentrancyGuard | 2 | Must |
| 6.4 Add @method Decorators | 3 | Should |
| 6.5 Add Missing Events | 2 | Should |

**Total**: 18 points (~32 hours)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Behavior change during refactor | Medium | High | Comprehensive tests, gas comparison |
| New storage pattern bugs | Medium | High | Incremental migration, parallel test |
| ABI incompatibility | Low | Medium | Test with frontend after changes |

---

## Success Criteria

- [ ] Gas usage reduced by 50%+ for core operations
- [ ] All existing tests pass
- [ ] No behavior changes
- [ ] @method decorators on all public methods
- [ ] Events for all state changes
- [ ] Gas measurement in CI

---

## Timeline

```
Week 4.5 (INSERT): Gas Optimization Sprint
├── Day 1-2: Story 6.1 (Baseline) + Story 6.3 (ReentrancyGuard)
├── Day 2-4: Story 6.2 (OptionStorage redesign)
├── Day 4-5: Story 6.4 (Decorators) + Story 6.5 (Events)
└── Day 5: Verification, documentation

Week 5: Frontend MVP (resumes after optimization)
Week 6: Portfolio & Deploy
```

---

## Next Steps

1. **Approve** this refactor plan
2. **Insert** Sprint 4.5 before Sprint 5
3. **Execute** stories 6.1-6.5
4. **Resume** frontend work with optimized contracts
