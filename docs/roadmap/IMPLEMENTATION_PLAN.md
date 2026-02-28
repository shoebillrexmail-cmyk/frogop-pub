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

**As an** admin
**I want** to deploy and register option pools for token pairs
**So that** users can trade options

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

### Story 4.8: Frontend Content Completeness & Accuracy

**As a** user
**I want** the frontend to fully and accurately describe the FroGop protocol
**So that** I understand how it works, what it costs, and what risks are involved before trading

#### Background

Gap analysis revealed the frontend is incomplete and missing critical user-facing information:
- No FAQ/Q&A section
- Fees (1% cancellation) barely mentioned, buried in one sentence
- No risk disclosure for writers or buyers
- No concrete P&L examples with numbers
- No glossary of options terminology
- Exercise mechanics unclear (when, how, what you need)
- Grace period / max duration not explained in human terms
- "What is OPNet?" never explained
- Security described in developer terms ("ReentrancyGuard") instead of user terms
- Phase 2/3 roadmap items are bullet points without user context

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 4.8.1 | Expand About page: "What is FroGop?" + "What is OPNet?" sections | 1h | User-friendly language, no developer jargon |
| 4.8.2 | Expand About page: detailed option lifecycle with P&L examples | 2h | Concrete number examples for CALL and PUT |
| 4.8.3 | Add dedicated Fees & Costs section | 1h | 1% cancel fee with example, future fees (Phase 3: 0.3% trading, 2-3% premium, 0.1% exercise), gas note |
| 4.8.4 | Add Safety & Security section in user language | 1h | 100% collateralization, no oracle, block-height expiry, self-custodial — no developer terms |
| 4.8.5 | Add Key Parameters reference table | 0.5h | Grace period (144 blocks / ~24h), max duration (~1 year), cancel fee (1%), collateral (100%) |
| 4.8.6 | Add Glossary section | 1h | Define: strike price, premium, collateral, ITM/OTM, expiry, grace period, underlying, writer, buyer, exercise, settlement |
| 4.8.7 | Add FAQ/Q&A section (14+ questions) | 2h | Covers: max loss, exercise timing, cancellation, fees, wallet, token support, risks |
| 4.8.8 | Add risk disclosure to About and Landing pages | 0.5h | Buyers: max loss = premium. Writers: assignment risk. Brief but honest |
| 4.8.9 | Improve Landing page: add "Why FroGop?" section with user benefits | 1h | Value proposition for writers (yield) and buyers (leverage/hedging) |
| 4.8.10 | Improve Landing page: add concrete example scenario | 1h | "Alice writes a covered call..." walkthrough with numbers |
| 4.8.11 | Add user context to Phase 2/3 roadmap items | 0.5h | Each bullet explains what it means for the user |
| 4.8.12 | Translate all block references to human time | 0.5h | Every "144 blocks" also shows "(~24 hours)", every "52,560 blocks" shows "(~1 year)" |

**Definition of Done**:
- [ ] All protocol facts on frontend match contract source code
- [ ] Fees section exists and lists all current + planned fees
- [ ] FAQ covers 14+ user questions
- [ ] Glossary defines all options terminology
- [ ] At least 2 concrete P&L examples with numbers
- [ ] Risk disclosure present on About page
- [ ] All block-height references include human-readable time equivalent
- [ ] No developer jargon in user-facing content
- [ ] OPNet explained for users who don't know what it is

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

### Story 5.3: Docker Dev Container

**As a** developer
**I want** a reproducible Docker-based development environment
**So that** any developer can run the frontend locally without installing Node manually

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 5.3.1 | Create `frontend/Dockerfile.dev` (node:22-alpine, Vite dev server, `--host 0.0.0.0`) | 1h | Container starts and serves hot-reload on port 5173 |
| 5.3.2 | Create `docker-compose.dev.yml` at project root | 1h | `docker compose -f docker-compose.dev.yml up` works |
| 5.3.3 | Bind-mount source code and isolate node_modules (anonymous volume) | 0.5h | Code changes reflect instantly without rebuild |
| 5.3.4 | Document dev workflow in README | 0.5h | Developers can onboard without reading source |

**Design**:
- Source code mounted as volume — hot reload works natively
- `node_modules` as anonymous volume — container modules don't conflict with host
- `.env` file loaded from project root via `env_file` in compose
- Network default: `VITE_OPNET_NETWORK=regtest`

**Definition of Done**:
- [ ] `docker compose -f docker-compose.dev.yml up` starts Vite dev server
- [ ] Hot reload works on source file changes
- [ ] `.env` vars passed through correctly
- [ ] No node_modules conflict between host and container

---

### Story 5.4: Docker Prod Container (Nginx + Multi-Stage Build)

**As a** DevOps
**I want** a production-optimized Docker container
**So that** the frontend is served securely and efficiently via nginx

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 5.4.1 | Create `frontend/Dockerfile.prod` — Stage 1: node:22-alpine builder | 1h | Vite build runs cleanly, outputs `dist/` |
| 5.4.2 | Stage 2: nginx:1.27-alpine — copy `dist/` from builder | 0.5h | nginx serves static files |
| 5.4.3 | Create `frontend/nginx/nginx.conf` — SPA routing, gzip, cache headers | 2h | All routes resolve to `index.html`; assets cached immutably |
| 5.4.4 | Add SSL config in nginx.conf (Cloudflare Origin Cert, TLS 1.2/1.3) | 1h | HTTPS on port 443 with Origin Cert |
| 5.4.5 | Add security headers (HSTS, CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy) | 1h | Headers present in responses |
| 5.4.6 | Add Cloudflare real-IP passthrough (`set_real_ip_from` for CF IP ranges) | 0.5h | Logs show visitor IPs, not Cloudflare proxy IPs |
| 5.4.7 | Create `docker-compose.prod.yml` at project root | 1h | `docker compose -f docker-compose.prod.yml up -d --build` works |
| 5.4.8 | Mount `./frontend/nginx/ssl/` as read-only volume for certs | 0.5h | Certs never baked into image |
| 5.4.9 | HTTP (port 80) → HTTPS (port 443) redirect in nginx | 0.5h | All HTTP requests redirect to HTTPS |
| 5.4.10 | Add `frontend/nginx/ssl/.gitignore` to exclude cert files | 0.5h | `origin.crt` and `origin.key` never committed |

**Design**:
- Build args: `VITE_OPNET_NETWORK`, `VITE_FACTORY_ADDRESS`, `VITE_POOL_TEMPLATE_ADDRESS` (baked into static bundle at build time — safe, these are public values)
- Certs mounted at runtime, never in image layer
- Restart policy: `unless-stopped`
- Image size target: <30MB (nginx:alpine base)

**Definition of Done**:
- [ ] Multi-stage build produces nginx image <30MB
- [ ] Vite build args passed and baked into bundle correctly
- [ ] SPA routing works (all paths return `index.html`)
- [ ] HTTPS works with Cloudflare Origin Cert
- [ ] HTTP redirects to HTTPS
- [ ] Security headers present (verified with `curl -I`)
- [ ] Gzip enabled for JS/CSS/HTML
- [ ] Hashed assets cached with `immutable` header, `index.html` with `no-cache`
- [ ] Cert files gitignored

---

### Story 5.5: Network & Environment Strategy (Testnet as Production Default)

**As a** product owner
**I want** production to target OPNet testnet until mainnet launch
**So that** users can test the real protocol without risking mainnet funds

#### Background

OPNet testnet is a Signet fork with real smart contracts but no financial risk. Production will
serve testnet until contracts are deployed and verified on mainnet. A clear migration path is
needed so the switch to mainnet is a single config change with no code changes.

**Key constraint**: `VITE_` env vars are baked into the static JS bundle at Docker build time.
Changing the network requires a rebuild and redeploy of the container.

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 5.5.1 | Audit `src/config/index.ts` — verify all network-dependent values read from `VITE_` vars | 0.5h | No hardcoded regtest/mainnet addresses in source |
| 5.5.2 | Add `networks.opnetTestnet` from `@btc-vision/bitcoin` as the default for testnet | 0.5h | Testnet uses correct network constant (NOT `networks.testnet`) |
| 5.5.3 | Create `.env.testnet` template (committed, no secrets) with testnet contract addresses | 0.5h | Developers can copy and use immediately |
| 5.5.4 | Create `.env.mainnet` template (committed, no secrets) as placeholder for future mainnet addresses | 0.5h | Mainnet migration is a 1-line env change |
| 5.5.5 | Update `docker-compose.prod.yml`: default build arg `VITE_OPNET_NETWORK=testnet` | 0.5h | Prod container defaults to testnet |
| 5.5.6 | Add network indicator in frontend UI (small badge showing current network) | 1h | Users can always see which network they are on; badge hidden on mainnet |
| 5.5.7 | Document mainnet migration checklist in `docs/deployment/MAINNET_MIGRATION.md` | 1h | Step-by-step: deploy contracts → update env → rebuild → redeploy |

**Network Mapping**:
| Environment | `VITE_OPNET_NETWORK` | Bitcoin Network Constant |
|-------------|---------------------|------------------------|
| Dev (local) | `regtest` | `networks.regtest` |
| Production (now) | `testnet` | `networks.opnetTestnet` ⚠️ NOT `networks.testnet` |
| Production (future) | `mainnet` | `networks.bitcoin` |

**Definition of Done**:
- [ ] Production container defaults to `testnet`
- [ ] No hardcoded network addresses in source code
- [ ] `.env.testnet` and `.env.mainnet` templates committed
- [ ] Network badge visible in UI on testnet (hidden on mainnet)
- [ ] Mainnet migration doc written
- [ ] Switching networks requires only env change + rebuild (no code change)

---

### Story 5.6: Hetzner Server Setup & Cloudflare Configuration

**As a** DevOps
**I want** the server and CDN configured securely
**So that** only legitimate traffic reaches the origin and the site is protected

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 5.6.1 | Provision Hetzner VPS (Ubuntu 24.04 LTS, minimum CX22: 2vCPU, 4GB RAM) | 0.5h | Server accessible via SSH |
| 5.6.2 | Harden SSH: disable password auth, key-only login, change default port (optional) | 0.5h | `PasswordAuthentication no` in sshd_config |
| 5.6.3 | Install Docker + Docker Compose plugin | 0.5h | `docker compose version` works |
| 5.6.4 | Configure UFW: deny all → allow SSH + 80 + 443 | 0.5h | Only required ports open |
| 5.6.5 | Restrict ports 80/443 to Cloudflare IP ranges only (script fetches CF IP list) | 1h | Direct access to server IP blocked; only CF proxy can reach nginx |
| 5.6.6 | Add Cloudflare A record → Hetzner IP, enable proxy (orange cloud) | 0.5h | DNS resolves through Cloudflare |
| 5.6.7 | Set Cloudflare SSL/TLS mode to **Full (Strict)** | 0.5h | CF validates Origin Cert on server |
| 5.6.8 | Generate Cloudflare Origin Certificate (15-year) → place in `frontend/nginx/ssl/` on server | 0.5h | nginx starts with cert; HTTPS works end-to-end |
| 5.6.9 | Enable Cloudflare: Always Use HTTPS, Bot Fight Mode, HSTS in edge | 0.5h | Security features active at Cloudflare edge |
| 5.6.10 | Add Cloudflare Cache Rule: cache `/assets/*` at edge (Cache Everything) | 0.5h | Static assets served from CF edge, reducing origin load |
| 5.6.11 | Verify end-to-end: DNS → Cloudflare → nginx → SPA routing | 0.5h | All routes work, HTTPS green, no mixed content |
| 5.6.12 | Document deployment runbook in `docs/deployment/DEPLOY.md` | 1h | Any developer can deploy from scratch using the doc |

**Security Architecture**:
```
Internet → Cloudflare (DDoS, WAF, CDN, SSL termination)
             ↓ HTTPS (Origin Cert, TLS 1.2/1.3 only)
           Hetzner VPS (UFW: only CF IPs on 80/443)
             ↓
           nginx Docker container (security headers, gzip, SPA routing)
```

**Definition of Done**:
- [ ] Server accessible via SSH (key only)
- [ ] UFW blocks all ports except SSH, 80, 443 (80/443 CF IPs only)
- [ ] Docker running prod container successfully
- [ ] Cloudflare proxy active (orange cloud) with Full Strict SSL
- [ ] Origin Cert installed and valid
- [ ] Site loads over HTTPS with Cloudflare in the path
- [ ] Direct server IP access returns connection refused or Cloudflare error
- [ ] Deployment runbook documented

---

## Epic 8: Contract Hardening (BLOCKING before Frontend Contract Integration)

**Based on critical design review (2026-02-25). Must complete before Sprint 6 stories 6.5-6.9.**

**Rationale**: Design review identified that accumulated fees mix two token types into one counter
(meaningless), there's no way to withdraw protocol fees (locked forever), and writers are unfairly
penalized when reclaiming collateral from expired unsold options. These changes modify method
signatures and add new methods, so they must land before the frontend contract service layer.

### Story 8.1: Split Fee Tracking Per Token

**As a** protocol operator
**I want** fees tracked separately per token type
**So that** accumulated fees are meaningful and withdrawable

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 8.1.1 | Add `ACCUMULATED_FEES_PREMIUM_POINTER` after existing pointers | 0.5h | New pointer appended, no existing pointer shift |
| 8.1.2 | Add lazy-loaded `accumulatedFeesPremium: StoredU256` | 0.5h | Lazy getter pattern consistent with existing fields |
| 8.1.3 | Rename existing `accumulatedFees` to `accumulatedFeesUnderlying` (same pointer) | 0.5h | Semantics clarified, no storage migration needed |
| 8.1.4 | Update `cancelOption()`: route fees to correct bucket by option type | 1h | CALL fees → underlying, PUT fees → premium |
| 8.1.5 | Add view methods: `accumulatedFeesUnderlying()`, `accumulatedFeesPremium()` | 1h | Both return correct per-token amounts |
| 8.1.6 | Update `execute()` router with new selectors | 0.5h | New selectors reachable |
| 8.1.7 | Update unit tests | 1h | Tests verify per-token accumulation for CALL and PUT cancels |

**Definition of Done**:
- [ ] CALL cancellation fees accumulate in `accumulatedFeesUnderlying`
- [ ] PUT cancellation fees accumulate in `accumulatedFeesPremium`
- [ ] Both view methods return correct values
- [ ] Old `accumulatedFees()` selector removed or aliased
- [ ] Unit tests verify per-token fee accumulation

---

### Story 8.2: Fee Withdrawal Mechanism

**As a** protocol deployer
**I want** to withdraw accumulated fees to a designated address
**So that** protocol revenue isn't locked forever in the contract

#### Blocker

> Verify `onlyDeployer()` is accessible from `ReentrancyGuard → OP_NET` inheritance chain.
> If not available, implement manual deployer check using a `StoredAddress` set in `onDeployment()`
> (same pattern as Factory's `_owner`).

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 8.2.1 | Add `FEE_RECIPIENT_POINTER`, lazy-loaded `StoredAddress` | 0.5h | Pointer appended after 8.1 pointers |
| 8.2.2 | Set fee recipient to deployer in `onDeployment()` | 0.5h | Default recipient = deployer |
| 8.2.3 | Implement `setFeeRecipient(address)` with deployer-only guard | 1h | Only deployer can change recipient |
| 8.2.4 | Implement `withdrawFees()` with checks-effects-interactions | 2h | Zeros accumulators before transfers |
| 8.2.5 | Add `FeesWithdrawnEvent` and `FeeRecipientChangedEvent` | 0.5h | Events emitted with amounts/addresses |
| 8.2.6 | Add view method `feeRecipient()` | 0.5h | Returns current fee recipient address |
| 8.2.7 | Add selectors to `execute()` router | 0.5h | All new methods routable |
| 8.2.8 | Unit + integration tests | 2h | Withdrawal tested for both token types |

**Design Notes**:
- `withdrawFees()`: Only callable by fee recipient (or deployer if recipient not set)
- Zeros BOTH accumulators BEFORE `_transfer` calls (checks-effects-interactions)
- Transfers underlying fees then premium fees in two separate `_transfer` calls
- Emits `FeesWithdrawn(recipient, underlyingAmount, premiumAmount)`
- Reverts if both accumulators are zero (no-op protection)

**Definition of Done**:
- [ ] Fee recipient defaults to deployer on deployment
- [ ] Only deployer can call `setFeeRecipient()`
- [ ] Only fee recipient can call `withdrawFees()`
- [ ] Fees zeroed before transfers (reentrancy safe)
- [ ] Both token types transferred correctly
- [ ] Events emitted for withdrawal and recipient change
- [ ] Unauthorized callers revert
- [ ] Integration test on regtest passes

---

### Story 8.3: Free Reclaim for Expired Unsold Options

**As a** writer
**I want** to reclaim full collateral from options that expired without being bought
**So that** I'm not penalized for market conditions beyond my control

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 8.3.1 | Add expiry check in `cancelOption()`: if expired, fee = 0 | 1h | Zero fee when `currentBlock >= expiryBlock` |
| 8.3.2 | Update cancel event to reflect zero fee when expired | 0.5h | Event fee field = 0 for expired options |
| 8.3.3 | Unit tests: cancel before expiry (1% fee) and after expiry (0% fee) | 1.5h | Both paths verified |
| 8.3.4 | Integration test: write option, wait for expiry, reclaim full collateral | 1h | Full collateral returned on regtest |

**Definition of Done**:
- [ ] Cancel before expiry: 1% fee deducted, fee accumulated
- [ ] Cancel after expiry: 0% fee, full collateral returned, no fee accumulated
- [ ] Events correctly reflect fee amount (0 for expired reclaim)
- [ ] Unit tests cover both paths

---

### Story 8.4: Fix Fee Rounding Direction

**As a** protocol
**I want** cancellation fees rounded up (ceiling division)
**So that** the protocol never under-collects on dust amounts

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 8.4.1 | Replace floor division with ceiling division in fee calculation | 0.5h | `ceilDiv(a, b) = (a + b - 1) / b` |
| 8.4.2 | Update tests to verify rounding direction | 0.5h | Non-divisible amounts round up |

**Definition of Done**:
- [ ] Fee rounds up on non-divisible amounts
- [ ] Tests verify rounding with edge case values
- [ ] Writer receives `collateral - ceilFee` (never more than collateral)

---

### Story 8.5: Protocol Buy Fee (1% of Premium)

**As a** protocol
**I want** a 1% fee charged on option purchases
**So that** the protocol generates sustainable revenue from trading volume

#### Background

Research across DeFi options protocols (Deribit, Lyra, Premia, Hegic, Panoptic, Stryke/Dopex)
shows the competitive fee range is 0.5–3% of premium. The current protocol has no revenue from
the core trading flow — the 1% cancellation fee only triggers on a rare edge case.

**Benchmarks**:
- Deribit: ~0.6% effective (0.03% of notional)
- Lyra: 0.5% of premium
- Premia: 3% of premium (high end)
- Hegic: 1% of notional (~1-3% of premium)
- Opyn: 0% (shut down — unsustainable)

**Decision**: 1% of premium on buy — mid-low range, competitive, simple to implement.

**Fee flow**: Buyer pays `premium + 1% protocolFee`. Writer receives full `premium`. Protocol
receives `protocolFee` (accumulated in pool, withdrawable via Story 8.2).

#### Tasks

| # | Task | Est. | Acceptance Criteria |
|---|------|------|---------------------|
| 8.5.1 | Add `PROTOCOL_FEE_BPS` constant (100 = 1%) | 0.5h | Constant defined alongside CANCEL_FEE_BPS |
| 8.5.2 | Add `protocolFeeBps()` view method | 0.5h | Returns 100 (1%) |
| 8.5.3 | Modify `buyOption()`: calculate protocolFee = ceilDiv(premium * PROTOCOL_FEE_BPS, 10000) | 1h | Fee calculated with ceiling division |
| 8.5.4 | Modify `buyOption()`: transfer `premium` from buyer to writer, `protocolFee` from buyer to contract | 2h | Two transfers; buyer must have approved premium + fee |
| 8.5.5 | Accumulate buy fees into `accumulatedFeesPremium` (always premium token) | 0.5h | Buy fees always denominated in premium token |
| 8.5.6 | Add `OptionPurchased` event update: include protocolFee field | 0.5h | Event reflects fee amount |
| 8.5.7 | Add selector to `execute()` router for `protocolFeeBps()` | 0.5h | View method routable |
| 8.5.8 | Unit tests: verify buyer pays premium + fee, writer receives full premium | 1.5h | All fee paths tested |
| 8.5.9 | Integration test: buy option and verify fee accumulation | 1h | Fee shows in accumulatedFeesPremium |

**Design Notes**:
- Fee is always in premium token (regardless of CALL/PUT) — buy fees are premium-denominated
- Ceiling division ensures protocol never under-collects on dust
- Buyer must `approve(poolAddress, premium + protocolFee)` before buying
- Writer receives exactly the premium they set — no reduction
- Frontend must display total cost = premium + 1% fee to buyer

**Definition of Done**:
- [ ] `buyOption()` charges buyer `premium + 1% fee`
- [ ] Writer receives full premium (unchanged)
- [ ] Protocol fee accumulated in `accumulatedFeesPremium`
- [ ] `protocolFeeBps()` view returns 100
- [ ] Event includes fee amount
- [ ] Ceiling division used for fee calculation
- [ ] Unit tests pass for fee paths
- [ ] Integration test verifies fee accumulation
- [ ] Frontend fee documentation updated

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
| 5.2 Frontend Deployment (IPFS) | 3 | Should |
| 5.3 Docker Dev Container | 3 | Must |
| 5.4 Docker Prod Container (nginx) | 8 | Must |
| 5.5 Network & Environment Strategy (testnet default) | 5 | Must |
| 5.6 Hetzner + Cloudflare Setup | 5 | Must |

**Sprint Goal**: Full option lifecycle tested on regtest; frontend deployable via Docker to Hetzner with Cloudflare; testnet as production default

**BLOCKING**: Frontend contract integration cannot start until integration tests pass on regtest.

### Sprint 5.5 (INSERT): Contract Hardening 🔴 BLOCKING

| Story | Points | Priority |
|-------|--------|----------|
| 8.1 Split Fee Tracking | 3 | Must |
| 8.2 Fee Withdrawal | 5 | Must |
| 8.3 Free Expired Reclaim | 3 | Must |
| 8.4 Fix Fee Rounding | 1 | Should |
| 8.5 Protocol Buy Fee (1%) | 5 | Must |

**Sprint Goal**: Protocol fees withdrawable, writers treated fairly, contract ready for frontend

**Rationale**: Design review revealed fee accounting bugs, locked protocol revenue, and unfair
writer penalties. These changes modify contract method signatures (new methods, renamed views),
so they must land before the frontend contract service layer (Sprint 6 stories 6.5-6.9).

**Post-sprint**: Redeploy contracts on regtest, re-run integration tests.

### Sprint 6 (Week 6-7): Frontend MVP

| Story | Points | Priority |
|-------|--------|----------|
| 4.1 Frontend Setup | 5 | Must |
| 4.2 Pool Discovery | 3 | Must |
| 4.3 Option Browse | 5 | Must |
| 4.4 Write Flow | 8 | Must |
| 4.5 Buy Flow | 5 | Must |

**Sprint Goal**: Users can write and buy options via UI

**Note**: Stories 6.5-6.9 (contract service layer, exercise/cancel modals) depend on Sprint 5.5
completion for final method signatures.

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
                                                          │
6.x (Gas Optimization) depends on 1.x, 2.x              │
        │                                                 │
        ▼                                                 │
5.x (Integration Testing) depends on 6.x                │
        │                                                 │
        ▼                                                 │
8.x (Contract Hardening) depends on 5.x ◄─── NEW        │
        │                                                 │
        ├── 8.1 (Split Fees) ── no deps                  │
        ├── 8.2 (Withdrawal) ── depends on 8.1           │
        ├── 8.3 (Expired Reclaim) ── no deps             │
        └── 8.4 (Rounding) ── no deps                    │
        │                                                 │
        ▼                                                 │
4.x (Frontend 6.5-6.9) depends on 8.x ◄── CRITICAL PATH │
        │                                                 │
        ▼                                                 │
5.2 (Deploy) depends on 4.x                         ◄───┘
```

### Critical Path Update

**Original**: 1.x → 2.x → 3.x → 4.x → 5.x
**Previous**: 1.x → 2.x → 6.x → 5.x → 4.x → 5.x
**Current**:  1.x → 2.x → 6.x → 5.x → **8.x** → 4.x (6.5-6.9) → 5.2

**Epic 6 (Gas Optimization)**: Completed - on critical path
1. Frontend depends on stable contract ABIs (Story 6.4)
2. Mainnet deployment requires acceptable gas costs (Story 6.2)
3. Event indexing needed for frontend (Story 6.5)

**Epic 5 (Integration Testing)**: In progress - BLOCKING
1. Unit tests cannot test token transfers (Blockchain.call() limitation)
2. Frontend needs verified contract behavior on real network
3. Must test full option lifecycle with real OP20 tokens
4. Regtest deployment required before frontend development

**Epic 8 (Contract Hardening)**: Planned - BLOCKING before frontend contract integration
1. New methods (`withdrawFees`, `setFeeRecipient`) change the contract ABI
2. Renamed view methods (`accumulatedFeesUnderlying`, `accumulatedFeesPremium`) affect frontend
3. Modified `cancelOption` behavior (free expired reclaim) affects frontend UX
4. Must redeploy and re-test before frontend service layer (stories 6.5-6.9)

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
| **`onlyDeployer` not in inheritance** | **Low** | **Low** | **Fallback: manual deployer check via StoredAddress** |
| **Contract hardening delays frontend** | **Medium** | **Medium** | **17.5h est., stories are independent and parallelizable** |

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

1. ~~**IMMEDIATE**: Review GAS_OPTIMIZATION_REFACTOR.md~~ ✅ Done (Sprint 4.5)
2. ~~**APPROVE**: Sprint 4.5 insertion into roadmap~~ ✅ Done
3. ~~**EXECUTE**: Story 6.1 (Gas Baseline)~~ ✅ Done
4. ~~**THEN**: Proceed with stories 6.2-6.5~~ ✅ Done
5. **CURRENT**: Complete Sprint 5 integration testing
6. **NEXT**: Investigate blocker for Story 8.2 (`onlyDeployer` availability)
7. **THEN**: Execute Sprint 5.5 (Stories 8.1-8.4, contract hardening)
8. **THEN**: Redeploy contracts, re-run integration tests
9. **RESUME**: Sprint 6 stories 6.5-6.9 (frontend contract service layer)

---

## Document References

- [Gas Optimization Refactor Plan](./GAS_OPTIMIZATION_REFACTOR.md) - Detailed analysis and plan
- [OPNet Complexity Best Practices](../contracts/OPNET_COMPLEXITY_BEST_PRACTICES.md) - Reference guide
- [Sprint Board](./SPRINT_BOARD.md) - Current sprint status
