# Unit Tests Status

## Overview

This document tracks the status of unit tests for the FroGop options protocol.

## Current Status: Gas Issue RESOLVED ✅

The gas issue was fixed by optimizing the WASM binary:
- `shrinkLevel: 2` (aggressive binary reduction)
- `noAssert: true` (strip runtime assertions)

| Contract | Before | After | Tests |
|----------|--------|-------|-------|
| OptionsFactory | 21.7 KB | 20.3 KB | 10/13 (77%) |
| OptionsPool | 29.5 KB | 27.9 KB | 9/9 (100%) |

## Test Status

### OptionsFactory Tests (10/13 - 77%)

| Test | Status |
|------|--------|
| deploy successfully | ✅ |
| set owner to deployer | ✅ |
| zero pools initially | ✅ |
| dead address template initially | ✅ |
| allow owner to set template | ✅ |
| reject non-owner setting template | ✅ |
| return dead address for non-existent pool | ✅ |
| reject duplicate pool | ✅ |
| reject pool creation without template | ✅ |
| reject pool with same tokens | ✅ |
| reject pool with dead underlying | ✅ |
| **create a new pool** | ❌ Requires OP20 tokens |
| **retrieve created pool** | ❌ Requires OP20 tokens |

### OptionsPool Tests (9/9 - 100%) ✅

| Test | Status |
|------|--------|
| deploy successfully | ✅ |
| return correct underlying token | ✅ |
| return correct premium token | ✅ |
| have zero options initially | ✅ |
| return correct grace period | ✅ |
| return correct max expiry | ✅ |
| return correct cancel fee | ✅ |
| calculate collateral correctly for CALL | ✅ |
| calculate collateral correctly for PUT | ✅ |

### OptionsPool Write Tests (Integration Required)

Tests requiring token transfers need actual OP20 contracts:

| Test | Status | Reason |
|------|--------|--------|
| write a new option | 🔶 | Requires OP20 tokens |
| retrieve option details | 🔶 | Depends on writeOption |
| buy option | 🔶 | Requires OP20 tokens |
| cancel option | 🔶 | Requires OP20 tokens |
| exercise option | 🔶 | Requires OP20 tokens |
| settle option | 🔶 | Requires OP20 tokens |
| rejection tests | 🔶 | Depends on writeOption |

**Why?** `Blockchain.call()` is a WASM-level operation that calls OP20 contracts for token transfers. The unit test framework cannot easily mock this.

## Known Limitations

### Mock Token Transfers

The unit test framework's `Blockchain.call()` is a WASM-level operation. Tests that transfer tokens require:
- Actual OP20 token contracts deployed, OR
- Integration testing on testnet/regtest

### Factory Pool Creation

The factory's `createPool()` deploys a new OptionsPool contract, which requires OP20 tokens for initialization.

## Recent Fixes Applied (Sprint 4.6)

1. **deploymentCalldata** ✅
   - Added to test runtime for proper `onDeployment()` initialization
   - Fixes: underlying/premiumToken storage initialization

2. **SHA256 Storage Keys** ✅
   - Reverted to SHA256-based keys for unlimited options
   - Removed u16 pointer arithmetic limit (was capped at ~9,333 options)

3. **WASM Optimization** ✅
   - `shrinkLevel: 2` + `noAssert: true`
   - Reduced pool WASM from 29.5 KB to 27.9 KB
   - All view tests now pass

## Test Files

```
tests/
├── OptionsFactory.test.ts     # Factory tests (10/13 passing)
├── OptionsPool.test.ts        # Pool view tests (9/9 passing)
├── gas-baseline.test.ts       # Gas measurement tests
└── runtime/
    ├── OptionsFactoryRuntime.ts
    └── OptionsPoolRuntime.ts
```

## Integration Testing

For full test coverage, deploy to testnet with:
1. Two OP20 tokens (underlying, premium)
2. OptionsFactory with pool template
3. OptionsPool instances
4. Fund test accounts with tokens

See the integration test documentation for details.
