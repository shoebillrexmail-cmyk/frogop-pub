# Regtest Test Plan: OptionsFactory

## WASM Verification

```
File: build/debug/frogop.wasm
Size: 21,485 bytes
Type: WebAssembly binary module version 0x1 (MVP)
Status: ✅ Valid WASM
```

---

## Why Do We Need a Template?

### The Factory Pattern

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FACTORY PATTERN EXPLAINED                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   WITHOUT Factory:                                                 │
│   ┌──────────────────────────────────────────────────────────┐     │
│   │  User deploys OptionsPool directly                       │     │
│   │                                                          │     │
│   │  Problem:                                                │     │
│   │  - User must have pool bytecode                          │     │
│   │  - No verification of correct pool                       │     │
│   │  - No registry of pools                                  │     │
│   │  - Fragmented liquidity                                  │     │
│   └──────────────────────────────────────────────────────────┘     │
│                                                                     │
│   WITH Factory:                                                    │
│   ┌──────────────────────────────────────────────────────────┐     │
│   │  Factory holds TEMPLATE (bytecode reference)             │     │
│   │                                                          │     │
│   │  createPool(underlying, premium):                        │     │
│   │  1. Factory clones template bytecode                     │     │
│   │  2. Deploys new pool at deterministic address            │     │
│   │  3. Initializes pool with token pair                     │     │
│   │  4. Registers pool in factory registry                   │     │
│   │  5. Returns pool address                                 │     │
│   │                                                          │     │
│   │  Benefits:                                               │     │
│   │  - All pools use same verified code                      │     │
│   │  - Pools discoverable via factory                        │     │
│   │  - Deterministic pool addresses                          │     │
│   │  - Single registry for all pools                         │     │
│   └──────────────────────────────────────────────────────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Template = Already Deployed Contract

```
Template is NOT:
❌ A blueprint file
❌ Source code
❌ A special contract type

Template IS:
✅ A deployed OptionsPool contract
✅ bytecode that can be cloned
✅ Referenced by address
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Step 1: Deploy Factory                                           │
│   ┌─────────────────┐                                              │
│   │ OptionsFactory  │  ← Holds no template yet                     │
│   │ 0xAAA...        │    poolTemplate = 0x0000...                  │
│   └─────────────────┘                                              │
│                                                                     │
│   Step 2: Deploy Template Pool                                     │
│   ┌─────────────────┐                                              │
│   │ OptionsPool     │  ← This becomes the template                 │
│   │ 0xBBB...        │    (initialized with zero addresses)         │
│   └─────────────────┘                                              │
│                                                                     │
│   Step 3: Set Template                                             │
│   ┌─────────────────┐                                              │
│   │ factory.set     │                                              │
│   │ Template(0xBBB) │  → Factory now has template                  │
│   └─────────────────┘                                              │
│                                                                     │
│   Step 4: Create Pools                                             │
│   ┌─────────────────┐      ┌─────────────────┐                    │
│   │ factory.create  │ ───► │ New OptionsPool │                    │
│   │ (MOTO, PILL)    │      │ 0xCCC...        │                    │
│   └─────────────────┘      └─────────────────┘                    │
│                                                                     │
│                          ┌─────────────────┐                       │
│                          │ New OptionsPool │                       │
│                          │ 0xDDD...        │                       │
│                          └─────────────────┘                       │
│                          (MOTO, ODYS pool)                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Test Plan

### Prerequisites

1. OPNet regtest node running
2. `opnet-cli` installed
3. 2+ OP20 tokens deployed (e.g., MOTO, PILL)
4. Wallet with funds

### Test 1: Deploy Factory

**Command:**
```bash
opnet deploy build/debug/frogop.wasm --network regtest
```

**Expected:**
- Transaction succeeds
- Returns deployed address (e.g., `0xAAA...`)

**Verify:**
```bash
# Get owner (should be deployer)
opnet call 0xAAA... owner --network regtest
# Expected: Your wallet address

# Get pool count (should be 0)
opnet call 0xAAA... poolCount --network regtest
# Expected: 0

# Get pool template (should be zero address)
opnet call 0xAAA... poolTemplate --network regtest
# Expected: 0x0000000000000000000000000000000000000000
```

---

### Test 2: Deploy Template Pool

**Command:**
```bash
# Deploy another instance to use as template
opnet deploy build/debug/frogop.wasm --network regtest
```

**Expected:**
- New address (e.g., `0xBBB...`)
- This will be our template

---

### Test 3: Set Template (Owner Only)

**Command:**
```bash
# As owner, set the template
opnet call 0xAAA... setPoolTemplate 0xBBB... --from <owner-address> --network regtest
```

**Expected:**
- Returns `true`
- Template is set

**Verify:**
```bash
opnet call 0xAAA... poolTemplate --network regtest
# Expected: 0xBBB...
```

---

### Test 4: Set Template (Non-Owner Should Fail)

**Command:**
```bash
# As different address, try to set template
opnet call 0xAAA... setPoolTemplate 0xCCC... --from <different-address> --network regtest
```

**Expected:**
- Transaction reverts
- Error: "Only owner can call this function"

---

### Test 5: Create Pool (No Template - Should Fail)

**Reset template first (if needed)**

**Without template set:**
```bash
# Deploy fresh factory (no template)
opnet deploy build/debug/frogop.wasm --network regtest
# New factory at 0xNEW...

# Try to create pool
opnet call 0xNEW... createPool <moto-address> <pill-address> --network regtest
```

**Expected:**
- Transaction reverts
- Error: "Pool template not set"

---

### Test 6: Create Pool (Valid)

**Prerequisites:**
- Factory has template set
- Two token addresses ready (MOTO, PILL)

**Command:**
```bash
opnet call 0xAAA... createPool <moto-address> <pill-address> --network regtest
```

**Expected:**
- Returns new pool address (e.g., `0xCCC...`)
- Pool count increases

**Verify:**
```bash
# Check pool count
opnet call 0xAAA... poolCount --network regtest
# Expected: 1

# Get pool address
opnet call 0xAAA... getPool <moto-address> <pill-address> --network regtest
# Expected: 0xCCC...

# Verify pool has correct tokens
opnet call 0xCCC... underlying --network regtest
# Expected: <moto-address>

opnet call 0xCCC... premiumToken --network regtest
# Expected: <pill-address>
```

---

### Test 7: Create Duplicate Pool (Should Fail)

**Command:**
```bash
# Try to create same pool again
opnet call 0xAAA... createPool <moto-address> <pill-address> --network regtest
```

**Expected:**
- Transaction reverts
- Error: "Pool already exists"

---

### Test 8: Create Pool with Same Tokens (Should Fail)

**Command:**
```bash
opnet call 0xAAA... createPool <moto-address> <moto-address> --network regtest
```

**Expected:**
- Transaction reverts
- Error: "Tokens must be different"

---

### Test 9: Create Pool with Zero Address (Should Fail)

**Command:**
```bash
opnet call 0xAAA... createPool 0x0000000000000000000000000000000000000000 <pill-address> --network regtest
```

**Expected:**
- Transaction reverts
- Error: "Invalid underlying token: zero address"

---

### Test 10: Create Multiple Pools

**Command:**
```bash
# Create second pool (different token pair)
opnet call 0xAAA... createPool <moto-address> <odys-address> --network regtest

# Verify count
opnet call 0xAAA... poolCount --network regtest
# Expected: 2

# Get second pool
opnet call 0xAAA... getPool <moto-address> <odys-address> --network regtest
# Expected: New pool address
```

---

### Test 11: Get Non-Existent Pool

**Command:**
```bash
# Query pool that doesn't exist
opnet call 0xAAA... getPool <random-address-1> <random-address-2> --network regtest
```

**Expected:**
- Returns zero address
- No error

---

## Summary Table

| # | Test | Expected Result |
|---|------|-----------------|
| 1 | Deploy factory | Success, address returned |
| 2 | Get owner | Returns deployer address |
| 3 | Get pool count (initial) | Returns 0 |
| 4 | Get pool template (initial) | Returns zero address |
| 5 | Deploy template | Success, address returned |
| 6 | Set template (owner) | Success, returns true |
| 7 | Set template (non-owner) | Revert: "Only owner" |
| 8 | Create pool (no template) | Revert: "template not set" |
| 9 | Create pool (valid) | Success, pool address returned |
| 10 | Create duplicate pool | Revert: "already exists" |
| 11 | Create pool same tokens | Revert: "must be different" |
| 12 | Create pool zero address | Revert: "zero address" |
| 13 | Get pool count (after create) | Returns 1 |
| 14 | Get pool (exists) | Returns pool address |
| 15 | Get pool (not exists) | Returns zero address |

---

## Selectors (for direct calls)

```
owner()                    → 0x39d26091
poolTemplate()             → 0xb0522e52
setPoolTemplate(address)   → 0x09ca4697
poolCount()               → 0x91427849
createPool(address,address)→ 0x3c56793f
getPool(address,address)   → 0x00bdc06a
```

---

## Notes

1. **Template vs Pool**: The same WASM can serve as both factory and pool. The factory uses `deployContractFromExisting` to clone the template's bytecode.

2. **Deterministic Addresses**: Pool addresses are deterministic based on the token pair (salt = hash(underlying, premium)).

3. **No AMM Yet**: This is Phase 1 - no liquidity pools, just P2P option creation and registry.

---

## Files

```
build/debug/frogop.wasm      → Deploy this
abis/OptionsFactory.abi.json → ABI for factory
abis/OptionsPool.abi.json    → ABI for pools
```
