# Unit Tests Status

## Current Status: Tests Created, Framework Issue

The unit tests have been created but there's a module resolution issue with `@btc-vision/unit-test-framework`. The framework's compiled JavaScript has import path issues.

## Test Files Created

```
tests/
├── OptionsFactory.test.ts     # 13 test cases
├── index.test.ts              # Test runner entry point
└── runtime/
    └── OptionsFactoryRuntime.ts  # Test runtime for OptionsFactory
```

## Test Cases

### OptionsFactory Tests

| # | Test | Status |
|---|------|--------|
| 1 | should deploy successfully | Created |
| 2 | should set owner to deployer | Created |
| 3 | should have zero pools initially | Created |
| 4 | should have dead address as pool template initially | Created |
| 5 | should allow owner to set pool template | Created |
| 6 | should reject non-owner setting template | Created |
| 7 | should create a new pool | Created |
| 8 | should retrieve created pool | Created |
| 9 | should return dead address for non-existent pool | Created |
| 10 | should reject duplicate pool | Created |
| 11 | should reject pool creation without template | Created |
| 12 | should reject pool with same tokens | Created |
| 13 | should reject pool with dead underlying | Created |

## Build Status

- TypeScript compiles successfully
- JavaScript output in `tests/dist/tests/`
- Framework module resolution issue prevents execution

## Next Steps

1. Wait for unit-test-framework fix
2. Or use alternative testing approach:
   - Manual testing via OPNet CLI
   - Integration tests with deployed contracts
   - Using opnet-cli test commands

## Alternative: Manual Test Commands

```bash
# Deploy factory
opnet deploy build/debug/frogop.wasm

# Set template (as owner)
opnet call <factory-address> setPoolTemplate <template-address> --from <owner>

# Create pool
opnet call <factory-address> createPool <underlying> <premium> --from <caller>

# Get pool
opnet call <factory-address> getPool <underlying> <premium>

# Get count
opnet call <factory-address> poolCount
```
