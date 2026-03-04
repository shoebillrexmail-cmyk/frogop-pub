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
# Contract unit tests
npm test                   # Run all tests (build + factory + pool)
npm run test:factory       # Test OptionsFactory only
npm run test:pool          # Test OptionsPool only

# Integration tests (testnet — requires OPNET_MNEMONIC in .env)
npm run test:integration   # Run all integration tests (01–11)
npm run test:integration:state          # Run 06a pool state only
npm run test:integration:write-cancel   # Run 06b write+cancel only
npm run test:integration:buy-exercise   # Run 06c buy+exercise only
npm run test:integration:put            # Run 06f PUT lifecycle only

# Frontend tests
cd frontend && npm test                # Run all frontend tests
cd frontend && npm run test:coverage   # Coverage report

# Indexer tests
cd indexer && npm test                 # Run all indexer tests
```

### Development

```bash
npm run dev                # Run indexer + frontend concurrently
npm run dev:frontend       # Frontend only (Vite, port 5173)
npm run dev:indexer         # Indexer only (Wrangler, port 8787)
```

### Lint & Typecheck

```bash
npm run lint               # Run ESLint
npm run typecheck          # Run TypeScript type checking
```

### MANDATORY Before Committing

After making ANY code changes, you MUST complete ALL of the following before creating a commit:

#### 1. Build verification
```bash
npm run lint && npm run typecheck && npm run build
```
Fix ALL errors before proceeding.

#### 2. Documentation sync (CRITICAL — do not skip)

For every code change in the commit, check whether documentation needs updating. Code is source of truth — docs must reflect it.

| What Changed | Update These Docs |
|-------------|-------------------|
| Contract methods, params, events, constants | `docs/technical/contracts/options-factory.md` and/or `options-pool.md` |
| Frontend pages, components, modals, hooks | `docs/technical/frontend/user-flows.md` and/or `flow-state.md` |
| System architecture, new services, project structure | `docs/technical/architecture.md` |
| Deployment config, CI/CD workflows | `docs/technical/deployment/` |
| OPNet patterns, WASM optimization | `docs/technical/opnet/` |
| Fee model, pricing, product behavior | `docs/product/fee-model.md` and/or `user-guide.md` |
| Bug fix or feature completion | `docs/planning/sprintboard.md` — update backlog/in-progress status |

**Rules:**
- `docs/technical/` must ONLY describe what is actually in the code — never document aspirational features here
- If you add a new public method, it MUST appear in the contract ABI docs before committing
- If you complete a sprintboard item, mark it done in `docs/planning/sprintboard.md`
- If you discover new backlog work during implementation, add it to the sprintboard
- If the change doesn't affect any docs, explicitly confirm this in your commit reasoning

---

## Project Structure

```
frogop/
├── src/contracts/             # Smart contracts (AssemblyScript → WASM)
│   ├── factory/               # OptionsFactory — pool registry & enumeration
│   │   └── index.ts
│   └── pool/                  # OptionsPool — full options lifecycle
│       └── index.ts
├── frontend/                  # React 19 + Vite 7 + Tailwind 4 SPA
│   ├── src/components/        # UI (modals, tables, charts, strategies)
│   ├── src/pages/             # Landing, PoolList, PoolDetail, Portfolio, About
│   ├── src/hooks/             # Contract interaction & WS hooks
│   ├── src/services/          # RPC service layer, ABI encoding
│   └── src/utils/             # Option math, Black-Scholes, strategies
├── indexer/                   # Cloudflare Workers price indexer + D1
│   ├── src/api/               # REST API (15 endpoints)
│   ├── src/poller/            # Block polling & event decoding
│   ├── src/decoder/           # NativeSwap event decoder
│   └── src/db/                # D1 schema & queries
├── tests/
│   ├── integration/           # Testnet integration suite (11 test files)
│   ├── runtime/               # Test helpers
│   ├── OptionsFactory.test.ts
│   └── OptionsPool.test.ts
├── docs/                      # Documentation
│   ├── technical/             # Implemented code docs (contracts, frontend, deployment, opnet)
│   ├── product/               # Business logic & usage (user guide, fee model)
│   ├── research/              # Unimplemented feature specs (NativeSwap, AMM, CSV, modes)
│   └── planning/              # Roadmap, sprintboard, phase specs, completed work
├── abis/                      # Generated ABIs (JSON, TS, type defs)
└── build/                     # Compiled WASM (OptionsFactory, OptionsPool)
```

---

## Documentation Synchronization

### CRITICAL: Keep Documentation in Sync

When making changes to contracts or architecture, you MUST update the relevant documentation:

| Change Type | Files to Update |
|-------------|-----------------|
| Contract methods/ABI | `docs/technical/contracts/options-factory.md`, `docs/technical/contracts/options-pool.md` |
| Architecture changes | `docs/technical/architecture.md`, `README.md` |
| Frontend flows | `docs/technical/frontend/user-flows.md`, `docs/technical/frontend/flow-state.md` |
| Deployment changes | `docs/technical/deployment/` |
| Completing a story / new tasks | `docs/planning/sprintboard.md` |
| Roadmap / phase changes | `docs/planning/roadmap.md` |
| Security changes | `docs/research/threat-model.md` |

### Documentation Checklist

After making code changes, verify:

- [ ] README.md reflects current status and features
- [ ] Contract docs in `docs/technical/contracts/` match actual implementation
- [ ] Architecture doc (`docs/technical/architecture.md`) is accurate
- [ ] Sprintboard updated if story completed (`docs/planning/sprintboard.md`)

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

### Planning Documents

| Document | Purpose | When to Update |
|----------|---------|----------------|
| `docs/planning/sprintboard.md` | Active backlog and in-progress work | After completing stories, adding new tasks |
| `docs/planning/roadmap.md` | Unified Phase 1-3 timeline | When changing scope or phase plans |
| `docs/planning/phase-1-completed.md` | Record of all Phase 1 deliverables | Reference only (completed) |
| `docs/planning/phase-2-native.md` | Phase 2 spec (NativeSwap/BTC) | When planning Phase 2 work |
| `docs/planning/phase-3-amm.md` | Phase 3 spec (AMM liquidity) | When planning Phase 3 work |

### Before Starting Work

1. Check `docs/planning/sprintboard.md` for backlog items
2. Pick the next priority item
3. Check `docs/research/` for relevant specs if the task involves unimplemented features

### After Completing Work

1. Update `docs/planning/sprintboard.md` — move item to Done or add new backlog items
2. Update relevant technical docs in `docs/technical/` if code changed

### Phase 1 — Complete

All Phase 1 epics delivered. See `docs/planning/phase-1-completed.md` for full record.

Integration tests run against **OPNet testnet** (`https://testnet.opnet.org`). Deployed contracts in `tests/integration/deployed-contracts.json`.

---

## Key Documentation

### Must Read

1. **[docs/technical/opnet/optimization.md](docs/technical/opnet/optimization.md)** - WASM optimization patterns (READ THIS FIRST)
2. **[docs/technical/opnet/complexity-guide.md](docs/technical/opnet/complexity-guide.md)** - OPNet constraints and DO/DON'T
3. **[docs/technical/architecture.md](docs/technical/architecture.md)** - System architecture
4. **[docs/planning/sprintboard.md](docs/planning/sprintboard.md)** - Active backlog and in-progress work

### Reference

- **[docs/technical/contracts/options-factory.md](docs/technical/contracts/options-factory.md)** - Factory ABI
- **[docs/technical/contracts/options-pool.md](docs/technical/contracts/options-pool.md)** - Pool ABI
- **[docs/research/threat-model.md](docs/research/threat-model.md)** - Security threat model
- **[docs/planning/phase-1-completed.md](docs/planning/phase-1-completed.md)** - Phase 1 completed work record

---

## Known Limitations

### Unit Test Gas Limit

The OptionsPool contract (~30KB WASM) exceeds the unit test framework's 500B gas limit during deployment. This is a test framework constraint - contracts work correctly on mainnet (4.5T gas target).

**Affected**: Pool creation tests, direct deployment tests

**Workaround**: Test on OPNet testnet or wait for framework update

---

## Git Strategy

### Branch Model

| Branch | Purpose | Deploys to |
|--------|---------|------------|
| `master` | Production — stable releases only | Cloudflare Pages (production) |
| `develop` | Integration — daily work lands here | Cloudflare Pages (preview) |
| `feat/*` / `fix/*` | Topic branches for individual work | Nothing (PR only) |

**NEVER push directly to `master`.** All changes go through `develop` first.

### Workflow

```bash
# Always branch from develop
git checkout develop && git pull origin develop
git checkout -b feat/my-feature   # or fix/my-fix

# ... implement, test, commit ...

# Push topic branch and open PR → develop
git push origin feat/my-feature

# To release to production: open PR develop → master
```

### Commit Guidelines

1. Run `npm run lint && npm run typecheck && npm run build` before committing
2. Update relevant documentation
3. Write descriptive commit messages using conventional format: `feat:`, `fix:`, `chore:`, `docs:`
4. Reference issue numbers when applicable
5. Add `Co-Authored-By:` line when using AI assistance

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

- Architecture: See `docs/technical/architecture.md`
- Security: See `docs/research/threat-model.md`
- OPNet Patterns: See `docs/technical/opnet/complexity-guide.md`
- Planning & Backlog: See `docs/planning/sprintboard.md`
- Roadmap: See `docs/planning/roadmap.md`
- Completed Work: See `docs/planning/phase-1-completed.md`
