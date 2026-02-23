# AGENTS.md - AI Agent Instructions for FroGop

This file provides instructions for AI agents working on the FroGop codebase. Read this document completely before making any changes.

---

## Project Overview

**FroGop** is a decentralized options protocol built on Bitcoin L1 using OPNet smart contracts. It enables users to write, trade, and exercise CALL and PUT options for any Bitcoin-native assets.

### Core Components

| Component | Location | Description |
|-----------|----------|-------------|
| OptionsFactory | `src/contracts/factory/` | Factory contract that deploys and registers OptionsPool instances |
| OptionsPool | `src/contracts/pool/` | Pool contract for option writing, buying, exercising, and settlement |

### Key Concepts

- **CALL Options**: Right to buy underlying at strike price
- **PUT Options**: Right to sell underlying at strike price
- **No Oracle**: Strike prices are token pair ratios, not external prices
- **Trustless Settlement**: Automated via smart contracts with grace periods

---

## Critical Rules (READ FIRST)

### OPNet-Specific Rules

1. **NEVER use `Blockchain.block.medianTimestamp`** - Use `Blockchain.block.number` for ALL time-dependent logic. Median timestamp is manipulable by miners.

2. **Constructor runs on EVERY call** - Use `onDeployment()` for one-time initialization, NOT the constructor.

3. **Always use SafeMath** - Never use raw arithmetic (`+`, `-`, `*`, `/`). Use `SafeMath.add()`, `SafeMath.sub()`, etc.

4. **Always use SHA256** - OPNet uses SHA256, NOT Keccak256 (this is Bitcoin, not Ethereum).

5. **OP-20 has no `approve()`** - Use `increaseAllowance()` / `decreaseAllowance()` instead.

6. **Always simulate before sendTransaction** - Bitcoin transfers are irreversible.

### FORBIDDEN Patterns

```typescript
// FORBIDDEN - Unbounded loops
while (condition) { ... }
for (let i = 0; i < array.length; i++) { ... }  // If array grows

// FORBIDDEN - Raw arithmetic
const newBalance = currentBalance - amount;

// FORBIDDEN - Iterating all map keys
const keys = this.balances.keys();

// FORBIDDEN - Using medianTimestamp for logic
if (Blockchain.block.medianTimestamp >= expiry) { ... }
```

### Required Patterns

```typescript
// REQUIRED - SafeMath for all arithmetic
const newBalance = SafeMath.sub(currentBalance, amount);

// REQUIRED - Block height for time logic
if (Blockchain.block.number >= option.expiryBlock) { ... }

// REQUIRED - onDeployment for one-time init
public override onDeployment(_calldata: Calldata): void {
    this._totalSupply.value = u256.fromU64(1000000);
}

// REQUIRED - Checks-Effects-Interactions pattern
// 1. Validate inputs
// 2. Update state
// 3. External calls (last)
```

---

## Build & Test Commands

### Build

```bash
npm run build              # Build both contracts
npm run build:factory      # Build OptionsFactory only
npm run build:pool         # Build OptionsPool only
```

### Test

```bash
npm test                   # Run all tests
npm run test:factory       # Test OptionsFactory only
npm run test:pool          # Test OptionsPool only
```

### Lint & Typecheck

```bash
npm run lint               # Run ESLint
npm run typecheck          # Run TypeScript type checking
```

### MANDATORY Before Committing

After making ANY code changes, you MUST run:

```bash
npm run lint && npm run typecheck && npm run build
```

Fix ALL errors before creating commits or PRs.

---

## Project Structure

```
frogop/
├── src/
│   └── contracts/
│       ├── factory/           # OptionsFactory contract
│       │   ├── contract.ts    # Contract implementation
│       │   └── index.ts       # Entry point
│       └── pool/              # OptionsPool contract
│           ├── contract.ts    # Contract implementation
│           └── index.ts       # Entry point
├── tests/
│   ├── runtime/               # Test helpers
│   ├── OptionsFactory.test.ts
│   └── OptionsPool.test.ts
├── docs/
│   ├── contracts/             # Contract documentation
│   ├── roadmap/               # Planning documents
│   ├── security/              # Security documentation
│   └── tests/                 # Test documentation
├── abis/                      # Generated ABIs
└── build/                     # Compiled WASM
```

---

## Documentation Synchronization

### CRITICAL: Keep Documentation in Sync

When making changes to contracts or architecture, you MUST update the relevant documentation:

| Change Type | Files to Update |
|-------------|-----------------|
| Contract methods/ABI | `docs/contracts/[ContractName].md`, `README.md` |
| Architecture changes | `docs/ARCHITECTURE.md`, `README.md` |
| New features | `docs/roadmap/IMPLEMENTATION_PLAN.md` |
| Security changes | `docs/security/THREAT_MODEL.md` |
| Test changes | `docs/tests/UNIT_TESTS_STATUS.md` |
| Completing a story | `docs/roadmap/SPRINT_BOARD.md` |
| Gas optimizations | `docs/roadmap/GAS_OPTIMIZATION_REFACTOR.md` |

### Documentation Checklist

After making code changes, verify:

- [ ] README.md reflects current status and features
- [ ] Contract docs match actual implementation
- [ ] Architecture diagrams are accurate
- [ ] Test status is updated
- [ ] Sprint board updated if story completed

---

## Code Style

### AssemblyScript/TypeScript

- Use explicit types (no `any`)
- Use `SafeMath` for all arithmetic
- Follow Checks-Effects-Interactions pattern
- Document pointer layout in comments
- Use `@view` decorator on read-only methods
- Declare all parameters in `@method()` decorator

### Pointer Management

```typescript
/**
 * Storage Layout:
 * Pointer 0: owner (address)
 * Pointer 1: paused (bool)
 * Pointer 2: nextId (u256)
 */
export class MyContract extends OP_NET {
    private ownerPointer: u16 = Blockchain.nextPointer;
    private pausedPointer: u16 = Blockchain.nextPointer;
    private nextIdPointer: u16 = Blockchain.nextPointer;
}
```

### Never Do

- Reuse pointers for different data
- Hardcode pointer values
- Skip `super.callMethod()` in custom callMethod

---

## Common Mistakes to Avoid

| Mistake | Correct Approach |
|---------|------------------|
| `approve()` on OP-20 | Use `increaseAllowance()` / `decreaseAllowance()` |
| Keccak256 hashing | Use SHA256 |
| `medianTimestamp` for deadlines | Use `Blockchain.block.number` |
| Raw arithmetic | Use SafeMath methods |
| Heavy computation in constructor | Use `onDeployment()` |
| Iterating all map keys | Use pagination or store aggregates |
| Bare `@method()` with no params | Declare all parameters |

---

## Roadmap & Planning (CRITICAL - Follow Always)

### Planning Documents to Maintain

| Document | Purpose | When to Update |
|----------|---------|----------------|
| `docs/roadmap/IMPLEMENTATION_PLAN.md` | Full implementation plan with stories, tasks, estimates | When adding/removing features, changing scope |
| `docs/roadmap/SPRINT_BOARD.md` | Current sprint status, completed/pending stories | After completing stories, starting new sprint |
| `docs/roadmap/GAS_OPTIMIZATION_REFACTOR.md` | Gas optimization analysis and plan | When optimizing contracts, measuring gas |

### Current Sprint

**Check `docs/roadmap/SPRINT_BOARD.md` for current sprint status.**

Before starting work:
1. Read the current sprint goal
2. Check which stories are pending
3. Pick the next priority item

After completing work:
1. Update the sprint board
2. Mark story as complete
3. Update story point summary

### Epic Summary

| Epic | Description | Status |
|------|-------------|--------|
| Epic 1 | Smart Contracts | ✅ Done |
| Epic 2 | Security | ✅ Done |
| Epic 3 | Testing | 🔄 Partial |
| **Epic 6** | **Gas Optimization** | **✅ Done** |
| **Epic 5** | **Integration Testing** | **🔴 BLOCKING - MUST COMPLETE** |
| Epic 4 | Frontend MVP | ⏸️ Blocked by Epic 5 |

### CRITICAL: Epic 5 (Integration Testing)

**Current blocker**: Unit tests cannot test token transfers (Blockchain.call() limitation).

Before frontend work (Epic 4), complete Epic 5:
1. **Story 5.1**: Regtest Setup - Wallet, mnemonic, .env, test BTC
2. **Story 5.2**: Deploy Test OP20 Tokens - Custom tokens (FROG-U, FROG-P)
3. **Story 5.3**: Deploy OptionsFactory - With template configuration
4. **Story 5.4**: Deploy Pool Template - For pool creation
5. **Story 5.5**: Create Integration Tests - Full option lifecycle on regtest
6. **Story 5.6**: Test Token Transfers - writeOption, buyOption, exercise
7. **Story 5.7**: Gas Validation - Verify gas usage on-chain

**Why before frontend?**
- Unit tests cannot test actual token transfers
- Frontend needs verified contract behavior
- Must test full option lifecycle with real OP20 tokens
- Regtest deployment required before frontend development

**See**: `docs/tests/INTEGRATION_TEST_TECHNICAL.md` for technical details.

---

## Key Documentation

### Must Read

1. **[docs/contracts/OPNET_OPTIMIZATION_BEST_PRACTICES.md](docs/contracts/OPNET_OPTIMIZATION_BEST_PRACTICES.md)** - Optimization lessons learned (READ THIS FIRST)
2. **[docs/contracts/OPNET_COMPLEXITY_BEST_PRACTICES.md](docs/contracts/OPNET_COMPLEXITY_BEST_PRACTICES.md)** - OPNet complexity and gas optimization
3. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System architecture
4. **[docs/security/THREAT_MODEL.md](docs/security/THREAT_MODEL.md)** - Security considerations
5. **[docs/roadmap/SPRINT_BOARD.md](docs/roadmap/SPRINT_BOARD.md)** - Current sprint status

### Reference

- **[docs/contracts/OptionsFactory.md](docs/contracts/OptionsFactory.md)** - Factory specification
- **[docs/contracts/OptionsPool.md](docs/contracts/OptionsPool.md)** - Pool specification
- **[docs/roadmap/GAS_OPTIMIZATION_REFACTOR.md](docs/roadmap/GAS_OPTIMIZATION_REFACTOR.md)** - Gas optimization plan
- **[docs/tests/UNIT_TESTS_STATUS.md](docs/tests/UNIT_TESTS_STATUS.md)** - Test coverage

---

## Known Limitations

### Unit Test Gas Limit

The OptionsPool contract (~30KB WASM) exceeds the unit test framework's 500B gas limit during deployment. This is a test framework constraint - contracts work correctly on mainnet (4.5T gas target).

**Affected**: Pool creation tests, direct deployment tests

**Workaround**: Test on OPNet testnet or wait for framework update

---

## Commit Guidelines

1. Run `npm run lint && npm run typecheck && npm run build` before committing
2. Update relevant documentation
3. Write descriptive commit messages
4. Reference issue numbers when applicable

---

## Quick Reference

### Block Height Constants

- ~144 blocks = 1 day
- ~1008 blocks = 1 week
- ~4320 blocks = 1 month
- ~52560 blocks = 1 year

### Option Status Codes

| Status | Code | Description |
|--------|------|-------------|
| OPEN | 0 | Written, no buyer |
| PURCHASED | 1 | Buyer paid premium |
| EXERCISED | 2 | Exercised ITM |
| EXPIRED | 3 | Expired OTM |
| CANCELLED | 4 | Cancelled pre-buy |

---

## Questions?

- Architecture: See `docs/ARCHITECTURE.md`
- Security: See `docs/security/THREAT_MODEL.md`
- OPNet Patterns: See `docs/contracts/OPNET_COMPLEXITY_BEST_PRACTICES.md`
- Planning: See `docs/roadmap/IMPLEMENTATION_PLAN.md`
- Current Sprint: See `docs/roadmap/SPRINT_BOARD.md`
- Gas Optimization: See `docs/roadmap/GAS_OPTIMIZATION_REFACTOR.md`
