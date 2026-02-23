# Phase 1: Agile Implementation Plan

## Overview

**Goal**: Deliver a working options trading protocol on OPNet regtest with basic UI.

**Methodology**: Agile with 1-week sprints

**Duration**: 6 weeks

**Team Size Assumption**: 1-2 developers

---

## Sprint Overview

| Sprint | Focus | Deliverable |
|--------|-------|-------------|
| 1 | Project Setup & Factory | Deployable OptionsFactory contract |
| 2 | Core Options (Write/Cancel) | OptionsPool with writeOption, cancelOption |
| 3 | Trading (Buy/Exercise) | Full option lifecycle |
| 4 | Security & Testing | Audited, tested contracts |
| 5 | Frontend MVP | Basic web UI |
| 6 | Integration & Deployment | Live on regtest |

---

## Epic 1: Smart Contracts

### Story 1.1: Project Setup

**As a** developer  
**I want** a properly configured OPNet project  
**So that** I can build and test smart contracts

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 1.1.1 | Initialize npm project with OPNet dependencies | 2h | package.json with @btc-vision/btc-runtime, @btc-vision/assemblyscript |
| 1.1.2 | Configure asconfig.json for AssemblyScript | 1h | Builds successfully with `npm run build` |
| 1.1.3 | Set up testing framework | 2h | Tests run with `npm test` using @btc-vision/unit-test-framework |
| 1.1.4 | Create project structure | 1h | src/, tests/, asconfig.json, package.json exist |
| 1.1.5 | Set up TypeScript Law compliance | 1h | ESLint config with strict rules, no `any` |

**Definition of Done**:
- [ ] `npm install` succeeds
- [ ] `npm run build` compiles empty contract
- [ ] `npm test` runs (even if no tests)
- [ ] Linting passes

---

### Story 1.2: OptionsFactory Contract

**As a** user  
**I want** to create option pools for any token pair  
**So that** I can trade options on different markets

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 1.2.1 | Create OptionsFactory.wasm skeleton | 2h | Contract compiles, extends Upgradeable |
| 1.2.2 | Implement createPool() method | 4h | Deploys new OptionsPool, returns address |
| 1.2.3 | Implement getPool() method | 1h | Returns pool address or zero |
| 1.2.4 | Implement pool registry storage | 2h | Stores mapping of token pairs to pools |
| 1.2.5 | Add pool template address configuration | 2h | Owner can set template for pool deployment |
| 1.2.6 | Write unit tests for factory | 4h | 100% coverage on factory methods |
| 1.2.7 | Add events (PoolCreated) | 1h | Event emitted on pool creation |

**Definition of Done**:
- [ ] Factory deploys on regtest
- [ ] createPool() creates new pool
- [ ] getPool() returns correct address
- [ ] Events emitted correctly
- [ ] Unit tests pass

---

### Story 1.3: OptionsPool - Write Option

**As an** option writer  
**I want** to create options by locking collateral  
**So that** I can earn premiums

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 1.3.1 | Create OptionsPool.wasm skeleton | 2h | Contract compiles, extends Upgradeable |
| 1.3.2 | Implement storage layout (pointers) | 2h | All pointers uniquely allocated |
| 1.3.3 | Implement Option struct serialization | 3h | serialize/deserialize roundtrip works |
| 1.3.4 | Implement writeOption() for calls | 4h | Locks underlying, creates option |
| 1.3.5 | Implement writeOption() for puts | 3h | Locks strike value, creates option |
| 1.3.6 | Add input validation | 2h | Rejects invalid strike/amount/expiry |
| 1.3.7 | Implement collateral transfer | 2h | Transfers from writer to contract |
| 1.3.8 | Write unit tests for writeOption | 4h | 100% coverage on write path |
| 1.3.9 | Add events (OptionWritten) | 1h | Event emitted with all option data |

**Definition of Done**:
- [ ] writeOption() creates option for calls
- [ ] writeOption() creates option for puts
- [ ] Collateral locked correctly
- [ ] Option stored in contract
- [ ] Events emitted
- [ ] Unit tests pass

---

### Story 1.4: OptionsPool - Cancel Option

**As an** option writer  
**I want** to cancel unpurchased options  
**So that** I can reclaim my collateral

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 1.4.1 | Implement cancelOption() | 3h | Returns collateral minus fee |
| 1.4.2 | Add access control (writer only) | 1h | Non-writer cannot cancel |
| 1.4.3 | Add status check (OPEN only) | 1h | Purchased options cannot cancel |
| 1.4.4 | Implement cancellation fee (1%) | 2h | Fee deducted, stays in contract |
| 1.4.5 | Write unit tests for cancel | 3h | 100% coverage on cancel path |
| 1.4.6 | Add events (OptionCancelled) | 1h | Event emitted with fee amount |

**Definition of Done**:
- [ ] Writer can cancel open options
- [ ] Non-writer cannot cancel
- [ ] Purchased options cannot cancel
- [ ] Fee deducted correctly
- [ ] Events emitted
- [ ] Unit tests pass

---

### Story 1.5: OptionsPool - Buy Option

**As an** option buyer  
**I want** to purchase options  
**So that** I can hedge or speculate

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 1.5.1 | Implement buyOption() | 3h | Transfers premium, updates status |
| 1.5.2 | Add status check (OPEN only) | 1h | Cannot buy purchased/cancelled options |
| 1.5.3 | Add expiry check | 1h | Cannot buy expired options |
| 1.5.4 | Prevent writer from buying own option | 1h | Writer address blocked |
| 1.5.5 | Implement premium transfer | 2h | Transfers from buyer to writer |
| 1.5.6 | Write unit tests for buy | 3h | 100% coverage on buy path |
| 1.5.7 | Add events (OptionPurchased) | 1h | Event emitted with buyer address |

**Definition of Done**:
- [ ] Buyer can purchase open options
- [ ] Premium transferred correctly
- [ ] Status updated to PURCHASED
- [ ] Writer cannot buy own option
- [ ] Events emitted
- [ ] Unit tests pass

---

### Story 1.6: OptionsPool - Exercise

**As an** option buyer  
**I want** to exercise ITM options  
**So that** I realize my profit

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 1.6.1 | Implement exercise() for calls | 4h | Buyer pays strike, receives underlying |
| 1.6.2 | Implement exercise() for puts | 4h | Buyer gives underlying, receives strike |
| 1.6.3 | Add access control (buyer only) | 1h | Non-buyer cannot exercise |
| 1.6.4 | Add timing check (after expiry) | 1h | Cannot exercise before expiry |
| 1.6.5 | Add grace period check | 1h | Cannot exercise after grace period |
| 1.6.6 | Implement strike value calculation | 2h | SafeMath for all operations |
| 1.6.7 | Write unit tests for exercise | 4h | 100% coverage on exercise path |
| 1.6.8 | Add events (OptionExercised) | 1h | Event emitted with settlement details |

**Definition of Done**:
- [ ] Buyer can exercise calls
- [ ] Buyer can exercise puts
- [ ] Non-buyer cannot exercise
- [ ] Timing enforced
- [ ] All transfers correct
- [ ] Events emitted
- [ ] Unit tests pass

---

### Story 1.7: OptionsPool - Settle (Expire)

**As a** user  
**I want** to settle expired options  
**So that** writers reclaim collateral on OTM options

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 1.7.1 | Implement settle() | 3h | Returns collateral to writer |
| 1.7.2 | Add timing check (after grace period) | 1h | Cannot settle during grace period |
| 1.7.3 | Add status check (PURCHASED only) | 1h | Only purchased options can be settled |
| 1.7.4 | Allow anyone to call settle | 1h | No access restriction (incentivized) |
| 1.7.5 | Write unit tests for settle | 3h | 100% coverage on settle path |
| 1.7.6 | Add events (OptionExpired) | 1h | Event emitted with collateral returned |

**Definition of Done**:
- [ ] Anyone can settle after grace period
- [ ] Collateral returned to writer
- [ ] Premium kept by writer
- [ ] Status updated to EXPIRED
- [ ] Events emitted
- [ ] Unit tests pass

---

### Story 1.8: View Methods

**As a** frontend developer  
**I want** view methods to query option data  
**So that** I can display options in the UI

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 1.8.1 | Implement getOption(id) | 2h | Returns full option struct |
| 1.8.2 | Implement getOptionCount() | 1h | Returns total option count |
| 1.8.3 | Implement getWriterOptions(writer) | 2h | Returns array of option IDs |
| 1.8.4 | Implement getBuyerOptions(buyer) | 2h | Returns array of option IDs |
| 1.8.5 | Implement underlying() and premiumToken() | 1h | Returns token addresses |
| 1.8.6 | Write unit tests for view methods | 2h | All view methods tested |

**Definition of Done**:
- [ ] All view methods implemented
- [ ] Return correct data
- [ ] No gas cost for calls
- [ ] Unit tests pass

---

## Epic 2: Security

### Story 2.1: Reentrancy Protection

**As a** security auditor  
**I want** all state-changing methods protected from reentrancy  
**So that** the protocol is secure

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 2.1.1 | Add @nonReentrant to writeOption | 0.5h | Decorator applied |
| 2.1.2 | Add @nonReentrant to buyOption | 0.5h | Decorator applied |
| 2.1.3 | Add @nonReentrant to exercise | 0.5h | Decorator applied |
| 2.1.4 | Add @nonReentrant to cancelOption | 0.5h | Decorator applied |
| 2.1.5 | Add @nonReentrant to settle | 0.5h | Decorator applied |
| 2.1.6 | Write reentrancy tests | 2h | Reentrancy blocked in tests |

**Definition of Done**:
- [ ] All state-changing methods protected
- [ ] Reentrancy tests pass
- [ ] Code review completed

---

### Story 2.2: SafeMath Compliance

**As a** security auditor  
**I want** all u256 arithmetic to use SafeMath  
**So that** there are no overflow/underflow vulnerabilities

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 2.2.1 | Audit all u256 operations | 2h | List of all arithmetic operations |
| 2.2.2 | Replace raw operators with SafeMath | 3h | No raw +, -, *, / on u256 |
| 2.2.3 | Add overflow/underflow tests | 2h | Tests revert on overflow |
| 2.2.4 | Static analysis verification | 1h | Script confirms no raw operators |

**Definition of Done**:
- [ ] Zero raw arithmetic operators on u256
- [ ] All operations use SafeMath
- [ ] Overflow tests pass
- [ ] Static analysis clean

---

### Story 2.3: Access Control

**As a** security auditor  
**I want** proper access control on restricted methods  
**So that** unauthorized users cannot perform restricted actions

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 2.3.1 | Review all access control points | 1h | List of all restricted operations |
| 2.3.2 | Add tests for unauthorized access | 2h | All unauthorized calls revert |
| 2.3.3 | Add onlyOwner to admin methods | 1h | pause, unpause, setTemplate |

**Definition of Done**:
- [ ] All access control documented
- [ ] Tests for all unauthorized scenarios
- [ ] Code review completed

---

## Epic 3: Testing

### Story 3.1: Unit Test Coverage

**As a** developer  
**I want** comprehensive unit tests  
**So that** I can refactor with confidence

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 3.1.1 | Test writeOption (all branches) | 3h | Call/Put, valid/invalid |
| 3.1.2 | Test buyOption (all branches) | 2h | Valid/invalid/expired |
| 3.1.3 | Test exercise (all branches) | 3h | Call/Put, timing, access |
| 3.1.4 | Test cancelOption (all branches) | 2h | Valid/invalid/access |
| 3.1.5 | Test settle (all branches) | 2h | Timing, status |
| 3.1.6 | Achieve >90% coverage | 2h | Coverage report shows >90% |

**Definition of Done**:
- [ ] All methods tested
- [ ] All branches covered
- [ ] Coverage > 90%
- [ ] All tests pass

---

### Story 3.2: Integration Tests

**As a** developer  
**I want** end-to-end integration tests  
**So that** the full flow works correctly

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 3.2.1 | Test full call option lifecycle | 2h | Write → Buy → Exercise (ITM) |
| 3.2.2 | Test full put option lifecycle | 2h | Write → Buy → Exercise (ITM) |
| 3.2.3 | Test OTM expiry flow | 2h | Write → Buy → Settle |
| 3.2.4 | Test cancel flow | 1h | Write → Cancel |
| 3.2.5 | Test multi-option scenarios | 2h | Multiple options in same pool |

**Definition of Done**:
- [ ] All lifecycles tested
- [ ] Integration tests pass
- [ ] Gas usage documented

---

---

## Epic 6: Gas Optimization (CRITICAL - INSERT BEFORE FRONTEND)

### Background

Analysis of contracts against OPNet best practices revealed significant gas inefficiencies:

| Issue | Impact | Location |
|-------|--------|----------|
| SHA256 per field access | 9× hash = ~180M gas per option read | OptionStorage.getKey() |
| Manual reentrancy guard | Error-prone, forgot reset in error paths | All state-changing methods |
| No @method decorators | Poor ABI, callers hand-roll calldata | All public methods |
| Missing PoolCreated event | No event indexing for pools | OptionsFactory |

**Recommendation**: Complete Epic 6 before Epic 4 (Frontend) to ensure mainnet viability.

### Story 6.1: Create Gas Baseline

**As a** developer  
**I want** to measure current gas usage  
**So that** I can verify optimization improvements

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 6.1.1 | Add gas measurement to tests | 2h | Tests output gas used |
| 6.1.2 | Record baseline for all methods | 1h | Document with gas numbers |
| 6.1.3 | Create gas comparison script | 1h | Script compares before/after |

**Definition of Done**:
- [ ] Gas measurements recorded for all methods
- [ ] Baseline document created

---

### Story 6.2: Redesign OptionStorage

**As a** developer  
**I want** an efficient OptionStorage class  
**So that** option reads/writes use minimal gas

#### Tasks

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

### Story 6.3: Use ReentrancyGuard

**As a** security auditor  
**I want** proper ReentrancyGuard usage  
**So that** reentrancy protection is reliable

#### Tasks

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

### Story 6.4: Add @method Decorators

**As a** frontend developer  
**I want** proper ABI declarations  
**So that** contract calls are type-safe

#### Tasks

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

### Story 6.5: Add Missing Events

**As a** frontend developer  
**I want** events for all state changes  
**So that** UI can react to blockchain events

#### Tasks

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

## Epic 4: Frontend MVP

### Story 4.1: Project Setup

**As a** frontend developer  
**I want** a React + Vite project with OPNet integration  
**So that** I can build the options UI

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 4.1.1 | Create Vite + React project | 1h | `npm run dev` works |
| 4.1.2 | Add @btc-vision/opwallet integration | 2h | Wallet connection works |
| 4.1.3 | Add opnet package | 1h | Contract interaction works |
| 4.1.4 | Configure Tailwind CSS | 1h | Styling works |
| 4.1.5 | Set up routing | 1h | Pages navigable |

**Definition of Done**:
- [ ] Project builds
- [ ] Wallet connects
- [ ] Basic routing works

---

### Story 4.2: Pool Discovery Page

**As a** user  
**I want** to see available option pools  
**So that** I can choose which market to trade

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 4.2.1 | Create PoolList component | 2h | Shows all pools |
| 4.2.2 | Display pool info (tokens, reserves) | 2h | Token pair visible |
| 4.2.3 | Add pool creation button | 1h | Links to create pool |
| 4.2.4 | Add loading/error states | 1h | Handles RPC failures |

**Definition of Done**:
- [ ] Pool list displays
- [ ] Pool info correct
- [ ] Create button works
- [ ] Error handling works

---

### Story 4.3: Option Browse Page

**As a** user  
**I want** to see available options in a pool  
**So that** I can find options to buy

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 4.3.1 | Create OptionList component | 2h | Shows all options |
| 4.3.2 | Filter by status (OPEN, PURCHASED) | 2h | Toggle filters |
| 4.3.3 | Display option details | 2h | Strike, expiry, premium, amount |
| 4.3.4 | Add buy button for open options | 1h | Links to buy flow |
| 4.3.5 | Calculate and display P/L estimates | 2h | Shows break-even, potential profit |

**Definition of Done**:
- [ ] Options display
- [ ] Filters work
- [ ] Details correct
- [ ] Buy button functional

---

### Story 4.4: Write Option Flow

**As a** writer  
**I want** to create new options  
**So that** I can earn premiums

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 4.4.1 | Create WriteOption form | 3h | Form with all inputs |
| 4.4.2 | Add option type selector (Call/Put) | 1h | Toggle between types |
| 4.4.3 | Add strike/amount/expiry inputs | 2h | Validation on all inputs |
| 4.4.4 | Add premium input with suggestion | 2h | Shows suggested premium |
| 4.4.5 | Calculate and display collateral required | 1h | Shows what will be locked |
| 4.4.6 | Implement approval flow | 2h | Approve token → Write option |
| 4.4.7 | Handle transaction states | 2h | Loading, success, error |

**Definition of Done**:
- [ ] Form validates input
- [ ] Premium suggestion works
- [ ] Collateral calculated
- [ ] Approval flow works
- [ ] Transaction completes

---

### Story 4.5: Buy Option Flow

**As a** buyer  
**I want** to purchase options  
**So that** I can hedge or speculate

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 4.5.1 | Create BuyOption modal | 2h | Modal with option details |
| 4.5.2 | Display total cost (premium) | 1h | Shows amount to pay |
| 4.5.3 | Implement approval flow | 2h | Approve premium token |
| 4.5.4 | Execute buyOption transaction | 2h | Transaction completes |
| 4.5.5 | Handle transaction states | 1h | Loading, success, error |

**Definition of Done**:
- [ ] Modal displays option
- [ ] Cost shown
- [ ] Approval works
- [ ] Purchase completes

---

### Story 4.6: Portfolio Page

**As a** user  
**I want** to see my options  
**So that** I can manage my positions

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 4.6.1 | Create Portfolio component | 2h | Shows user's options |
| 4.6.2 | Display written options | 2h | Options user has written |
| 4.6.3 | Display purchased options | 2h | Options user has bought |
| 4.6.4 | Add exercise button for ITM options | 2h | Appears when exercisable |
| 4.6.5 | Add cancel button for open options | 1h | Appears when cancellable |
| 4.6.6 | Calculate P/L for each position | 2h | Shows current profit/loss |

**Definition of Done**:
- [ ] Written options shown
- [ ] Purchased options shown
- [ ] Exercise button appears when valid
- [ ] Cancel button appears when valid
- [ ] P/L calculated

---

### Story 4.7: Exercise Flow

**As a** buyer  
**I want** to exercise my options  
**So that** I realize my profit

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 4.7.1 | Create ExerciseModal | 2h | Modal with exercise details |
| 4.7.2 | Calculate and display outcome | 2h | What you pay/receive |
| 4.7.3 | Handle approval (for calls - strike payment) | 2h | Approve if needed |
| 4.7.4 | Execute exercise transaction | 2h | Transaction completes |
| 4.7.5 | Handle transaction states | 1h | Loading, success, error |

**Definition of Done**:
- [ ] Modal shows outcome
- [ ] Approval handled
- [ ] Exercise completes
- [ ] Success feedback

---

## Epic 5: Integration Testing & Deployment (BLOCKING)

**PREREQUISITE: Complete before Epic 4 (Frontend)**

### Story 5.1: Regtest Setup & Integration Testing

**As a** developer  
**I want** integration tests on OPNet regtest  
**So that** I can verify token transfers work before frontend development

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 5.1.1 | Setup regtest wallet | 1h | Mnemonic in .env, test BTC balance |
| 5.1.2 | Deploy custom OP20 tokens | 2h | FROG-U (MOTO), FROG-P (PILL) |
| 5.1.3 | Deploy OptionsFactory | 1h | Factory with template configured |
| 5.1.4 | Deploy Pool Template | 1h | Reusable template for pools |
| 5.1.5 | Create Pool | 1h | MOTO/PILL pool created |
| 5.1.6 | Write Option Test | 2h | Collateral locked, option created |
| 5.1.7 | Buy Option Test | 2h | Premium transferred, status updated |
| 5.1.8 | Exercise/Test Settle | 2h | Full lifecycle verified |
| 5.1.9 | Gas Validation | 1h | On-chain gas within expected range |
| 5.1.10 | Documentation | 2h | Integration test guide updated |

**Definition of Done**:
- [ ] Integration tests pass on regtest
- [ ] All write methods tested (write, buy, cancel, exercise, settle)
- [ ] Token transfers work correctly
- [ ] Gas usage within 20% of baseline
- [ ] Custom test tokens deployed (FROG-U, FROG-P)
- [ ] Documentation updated in `docs/tests/`

---

### Story 5.2: Frontend Deployment

**As a** developer  
**I want** the frontend deployed  
**So that** users can access the protocol

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 5.2.1 | Build production bundle | 1h | `npm run build` succeeds |
| 5.2.2 | Deploy to IPFS | 1h | Using opnet-cli script |
| 5.2.3 | Configure contract addresses | 1h | Points to regtest contracts |
| 5.2.4 | Test deployed frontend | 1h | All features work |

**Definition of Done**:
- [ ] Frontend builds
- [ ] IPFS deployment works
- [ ] Contract addresses correct
- [ ] All features functional

---

## Sprint Backlog Summary

### Sprint 1 (Week 1): Setup & Factory

| Story | Points | Priority |
|-------|--------|----------|
| 1.1 Project Setup | 5 | Must |
| 1.2 OptionsFactory | 8 | Must |

**Sprint Goal**: Project builds, factory deploys pools

### Sprint 2 (Week 2): Write & Cancel

| Story | Points | Priority |
|-------|--------|----------|
| 1.3 Write Option | 8 | Must |
| 1.4 Cancel Option | 5 | Must |

**Sprint Goal**: Writers can create and cancel options

### Sprint 3 (Week 3): Buy & Exercise

| Story | Points | Priority |
|-------|--------|----------|
| 1.5 Buy Option | 5 | Must |
| 1.6 Exercise | 8 | Must |
| 1.7 Settle | 5 | Must |

**Sprint Goal**: Full option lifecycle works

### Sprint 4 (Week 4): Security & Testing

| Story | Points | Priority |
|-------|--------|----------|
| 2.1 Reentrancy | 3 | Must |
| 2.2 SafeMath | 3 | Must |
| 2.3 Access Control | 3 | Must |
| 1.8 View Methods | 3 | Should |
| 3.1 Unit Tests | 8 | Must |
| 3.2 Integration Tests | 5 | Should |

**Sprint Goal**: Contracts secure and tested

### Sprint 4.5 (INSERT): Gas Optimization 🔴 BLOCKING

| Story | Points | Priority |
|-------|--------|----------|
| 6.1 Gas Baseline | 3 | Must |
| 6.2 Redesign OptionStorage | 8 | Must |
| 6.3 Use ReentrancyGuard | 2 | Must |
| 6.4 Add @method Decorators | 3 | Should |
| 6.5 Add Missing Events | 2 | Should |

**Sprint Goal**: Reduce gas by 50%+, no behavior changes

**Rationale**: Analysis revealed OptionsPool uses 9 SHA256 operations per option read.
Must optimize before frontend to ensure mainnet viability.
See [GAS_OPTIMIZATION_REFACTOR.md](./GAS_OPTIMIZATION_REFACTOR.md) for details.

### Sprint 5 (Week 5): Integration Testing & Deployment 🔴 BLOCKING

| Story | Points | Priority |
|-------|--------|----------|
| 5.1 Regtest Setup & Integration Testing | 13 | Must |
| 5.2 Frontend Deployment | 3 | Should |

**Sprint Goal**: Full option lifecycle tested on regtest with real OP20 tokens

**BLOCKING**: Frontend cannot start until integration tests pass on regtest.
This sprint replaces Sprint 6 from original plan.

### Sprint 6 (Week 6): Frontend MVP

| Story | Points | Priority |
|-------|--------|----------|
| 4.1 Frontend Setup | 5 | Must |
| 4.2 Pool Discovery | 3 | Must |
| 4.3 Option Browse | 5 | Must |
| 4.4 Write Flow | 8 | Must |
| 4.5 Buy Flow | 5 | Must |

**Sprint Goal**: Users can write and buy options via UI

---

## Dependencies

```
Story Dependencies:

1.1 (Setup) ─────────────────────────────────────────────┐
                                                          │
1.2 (Factory) depends on 1.1                              │
        │                                                 │
        ▼                                                 │
1.3 (Write) depends on 1.2                               │
        │                                                 │
        ├── 1.4 (Cancel) depends on 1.3                  │
        │                                                 │
        └── 1.5 (Buy) depends on 1.3                     │
                │                                         │
                └── 1.6 (Exercise) depends on 1.5        │
                        │                                 │
                        └── 1.7 (Settle) depends on 1.5  │
                                                          │
2.x (Security) depends on 1.x contracts                  │
3.x (Testing) depends on 1.x contracts                   │

6.x (Gas Optimization) depends on 1.x, 2.x contracts ◄── CRITICAL PATH
        │
        ▼
4.x (Frontend) depends on 6.x (optimized contracts) ◄───┘
        │
        ▼
5.x (Deploy) depends on 4.x
```

### Critical Path Update

**Before**: 1.x → 2.x → 3.x → 4.x → 5.x
**After**: 1.x → 2.x → **6.x** → **5.x** → 4.x → 5.x

**Epic 6 (Gas Optimization)**: On critical path - must complete before frontend
1. Frontend depends on stable contract ABIs (Story 6.4)
2. Mainnet deployment requires acceptable gas costs (Story 6.2)
3. Event indexing needed for frontend (Story 6.5)

**Epic 5 (Integration Testing)**: NEW - BLOCKING before frontend
1. Unit tests cannot test token transfers (Blockchain.call() limitation)
2. Frontend needs verified contract behavior on real network
3. Must test full option lifecycle with real OP20 tokens
4. Regtest deployment required before frontend development

---

## Definition of Done (Per Story)

- [ ] Code complete and reviewed
- [ ] Unit tests pass (coverage > 80% for story)
- [ ] No lint errors
- [ ] No type errors
- [ ] Documentation updated
- [ ] Acceptance criteria met

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| OPNet API changes | Medium | High | Pin versions, monitor changelog |
| Testing framework issues | Low | Medium | Early spike in Sprint 1 |
| Frontend wallet integration | Medium | Medium | Use documented patterns |
| **Gas optimization introduces bugs** | **Medium** | **High** | **Comprehensive tests, incremental changes** |
| **Storage migration needed** | **Low** | **High** | **Design for upgradability, test on regtest** |
| ~~Gas optimization late~~ | ~~Low~~ | ~~Medium~~ | **MOVED to Sprint 4.5 (blocking)** |

---

## Gas Optimization Summary

### Problem
OptionsPool uses SHA256 for every field access:
- 9 SHA256 operations per `getOption()` call
- Estimated ~180M gas per option read
- Unusable on mainnet at current costs

### Solution
Redesign OptionStorage to use direct pointer arithmetic:
- No SHA256, just `basePointer + optionId * stride + offset`
- Pack small fields (u64 + u64 → u128, u8 + u8 → u16)
- Target: 50%+ gas reduction

### Impact on Timeline
- Sprint 4.5 (new): Gas Optimization (~23 hours)
- Sprint 5-6 delayed by 1 week
- Total project: 7 weeks instead of 6

### Success Criteria
- [ ] getOption gas reduced by >50%
- [ ] All tests pass with no behavior changes
- [ ] @method decorators on all public methods
- [ ] PoolCreated event emitted

---

## Next Steps

1. **IMMEDIATE**: Review [GAS_OPTIMIZATION_REFACTOR.md](./GAS_OPTIMIZATION_REFACTOR.md)
2. **APPROVE**: Sprint 4.5 insertion into roadmap
3. **EXECUTE**: Story 6.1 (Gas Baseline) to measure current state
4. **THEN**: Proceed with stories 6.2-6.5
5. **RESUME**: Sprint 5 (Frontend) after optimization complete

---

## Document References

- [Gas Optimization Refactor Plan](./GAS_OPTIMIZATION_REFACTOR.md) - Detailed analysis and plan
- [OPNet Complexity Best Practices](../contracts/OPNET_COMPLEXITY_BEST_PRACTICES.md) - Reference guide
- [Sprint Board](./SPRINT_BOARD.md) - Current sprint status
