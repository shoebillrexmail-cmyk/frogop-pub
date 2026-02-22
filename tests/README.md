# tests/

Unit tests for the FroGop options protocol.

## Overview

This directory contains comprehensive unit tests for both OptionsFactory and OptionsPool contracts. Tests are written in TypeScript using the OPNet unit test framework.

## Structure

```
tests/
├── OptionsFactory.test.ts         # Factory contract tests
├── OptionsPool.test.ts            # Pool contract tests
├── runtime/                       # Test runtime helpers
│   ├── OptionsFactoryRuntime.ts   # Factory test runtime
│   └── OptionsPoolRuntime.ts      # Pool test runtime
└── dist/                          # Compiled test output
```

## Test Commands

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:factory    # OptionsFactory tests only
npm run test:pool       # OptionsPool tests only

# Build tests (TypeScript compilation)
npm run build:tests
```

## Test Runtime Architecture

The test framework uses runtime wrappers to interact with WASM contracts:

```
┌─────────────────────────────────────────────────────────────┐
│                     Test Architecture                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Test File ───────► TestRuntime ───────► WASM Contract     │
│  (.test.ts)          (.Runtime.ts)       (.wasm)           │
│                                                             │
│  - Test cases        - Method selectors    - Actual logic  │
│  - Assertions        - Calldata encoding   - Storage       │
│  - Setup/teardown    - Gas management      - Events        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## OptionsFactory Tests

**File**: `OptionsFactory.test.ts`

**Test Count**: 13 tests

### Passing Tests (10) ✅

| Test | Description |
|------|-------------|
| should deploy successfully | Contract instantiation |
| should set owner to deployer | Ownership assignment |
| should have zero pools initially | Initial state check |
| should have dead address as pool template initially | Default template check |
| should allow owner to set pool template | Admin functionality |
| should reject non-owner setting template | Access control |
| should return dead address for non-existent pool | Empty pool handling |
| should reject pool creation without template | Validation |
| should reject pool with same tokens | Token validation |
| should reject pool with dead underlying | Address validation |

### Failing Tests (3) ❌

| Test | Reason |
|------|--------|
| should create a new pool | OptionsPool deployment fails (gas) |
| should retrieve created pool | Depends on pool creation |
| should reject duplicate pool | Depends on pool creation |

**Failure Cause**: OptionsPool WASM (30KB) exceeds unit test framework's 500B gas limit during deployment.

## OptionsPool Tests

**File**: `OptionsPool.test.ts`

**Test Count**: 22 tests written

**Status**: Limited by gas constraint - cannot deploy OptionsPool in unit tests.

### Test Coverage

If gas limit were resolved, tests would cover:

- **Deployment**: Pool initialization with token pairs
- **Constants**: Grace period, max expiry, fees
- **Collateral Calculation**: CALL and PUT formulas
- **Option Lifecycle**: Write, buy, cancel, exercise, settle
- **Access Control**: Writer/buyer permissions
- **Revert Cases**: Invalid inputs, unauthorized access

### Current Status

Tests are written and ready, but cannot execute due to gas limit. OptionsPool needs testing on:
- OPNet testnet
- Local OPNet node
- Mainnet (after deployment)

## Writing Tests

### Basic Test Structure

```typescript
import { opnet, OPNetUnit, Assert, Blockchain } from '@btc-vision/unit-test-framework';
import { Address } from '@btc-vision/transaction';

await opnet('Test Suite Name', async (vm: OPNetUnit) => {
    let contract: ContractRuntime;
    let deployer: Address;
    
    // Run before each test
    vm.beforeEach(async () => {
        Blockchain.dispose();
        Blockchain.clearContracts();
        await Blockchain.init();
        
        deployer = Blockchain.generateRandomAddress();
        contract = new ContractRuntime(deployer);
        
        Blockchain.register(contract);
        await contract.init();
    });
    
    // Run after each test
    vm.afterEach(() => {
        contract.dispose();
        Blockchain.dispose();
    });
    
    // Test case
    await vm.it('should do something', async () => {
        Blockchain.msgSender = deployer;
        Blockchain.txOrigin = deployer;
        
        const result = await contract.someMethod();
        Assert.equal(result, expectedValue);
    });
});

// Must call run() at end
OPNetUnit.run();
```

### Testing Reverts

```typescript
// Method that expects revert
async someMethodExpectRevert(): Promise<Error> {
    const writer = new BinaryWriter();
    writer.writeSelector(this.selector);
    
    const result = await this.execute({
        calldata: writer.getBuffer(),
        sender: Blockchain.msgSender,
    });
    
    if (!result.error) {
        throw new Error('Expected revert');
    }
    return result.error;
}

// Test usage
const error = await contract.someMethodExpectRevert();
Assert.expect(error).toBeDefined();
```

## Bytecode Loading

For tests that deploy contracts (like pool via factory), load bytecode first:

```typescript
// In test, before creating pool
const template = Blockchain.generateRandomAddress();
factory.loadPoolBytecodeAt(template);

// Now pool deployment will work (if gas limit permits)
await factory.createPool(underlying, premiumToken);
```

## Known Issues

### Gas Limit Constraint

**Problem**: OptionsPool (30KB) > 500B gas limit

**Affected**:
- Direct OptionsPool deployment tests
- Factory tests that create pools

**Solutions**:
1. Test on OPNet testnet
2. Wait for unit test framework update
3. Increase test gas limit (if configurable)

## Test Status Summary

| Component | Tests | Passing | Status |
|-----------|-------|---------|--------|
| OptionsFactory | 13 | 10 (77%) | ✅ Functional |
| OptionsPool | 22 | 0* | ⚠️ Gas limited |

*Tests written but cannot execute due to deployment failure

## References

- [docs/tests/UNIT_TESTS_STATUS.md](../docs/tests/UNIT_TESTS_STATUS.md) - Detailed status
- [docs/tests/REGTEST_TEST_PLAN.md](../docs/tests/REGTEST_TEST_PLAN.md) - Integration testing
- OPNet Unit Test Framework docs
