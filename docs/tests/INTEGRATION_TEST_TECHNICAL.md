# Integration Testing Technical Guide: FroGop on OPNet Regtest

## Overview

This document provides technical details for integration testing FroGop on OPNet regtest. It covers wallet setup, contract deployment, and integration test execution.

## Prerequisites

### 1. Wallet Setup

You need a wallet with rBTC for deployment fees. The wallet mnemonic should be stored in `.env`:

```bash
# .env (add to .gitignore)
OPNET_MNEMONIC="your twenty four word seed phrase goes here ..."
OPNET_NETWORK="regtest"
```

### 2. OPNet Regtest RPC

- **URL**: `https://regtest.opnet.org`
- **Network**: regtest (Bitcoin L1 test network)
- **No local node required** - use OPNet's public regtest

## Token Strategy

### Custom Test Tokens

Use custom token names to avoid conflicts with existing contracts:

| Token | Symbol | Decimals | Max Supply | Purpose |
|-------|--------|----------|------------|---------|
| Frogop Underlying | `FROG-U` | 18 | 1,000,000 | MOTO equivalent - option underlying |
| Frogop Premium | `FROG-P` | 18 | 1,000,000 | PILL equivalent - premium/strike token |

**Why custom names?**
- Isolation from other developers' tokens
- Predictable supply and decimals
- No approval conflicts
- Clear identification in tests

## Deployment Process

### Step 1: Generate Wallet

```typescript
import 'dotenv/config';
import { Mnemonic, networks, MLDSASecurityLevel, AddressTypes } from '@btc-vision/transaction';

const network = networks.regtest;
const mnemonic = new Mnemonic(process.env.OPNET_MNEMONIC, '', network, MLDSASecurityLevel.LEVEL2);
const wallet = mnemonic.deriveUnisat(AddressTypes.P2TR, 0);

console.log('Address:', wallet.p2tr);
```

### Step 2: Deploy Custom OP20 Tokens

Use OPNet's OP20_DEPLOYER contract (`0x1d2d60f610018e30c043f5a2af2ce57931759358f83ed144cb32717a9ad22345`):

```typescript
import { OPNetProvider } from '@btc-vision/opnet';
import { BinaryWriter, Address } from '@btc-vision/transaction';

const OP20_DEPLOYER = Address.fromString('0x1d2d60f610018e30c043f5a2af2ce57931759358f83ed144cb32717a9ad22345');
const provider = new OPNetProvider('https://regtest.opnet.org');

async function deployOP20Token(name: string, symbol: string, decimals: number, maxSupply: bigint): Promise<string> {
    const writer = new BinaryWriter();
    writer.writeStringWithLength(name);
    writer.writeStringWithLength(symbol);
    writer.writeU8(decimals);
    writer.writeU256(maxSupply);
    
    // Build deployment transaction with OP20_DEPLOYER bytecode
    // ... (see full code in main integration test guide)
}
```

### Step 3: Deploy OptionsFactory

```typescript
import fs from 'fs';

const FACTORY_WASM = fs.readFileSync('./build/OptionsFactory.wasm');

// Deployment parameters
const factoryParams = {
    from: wallet.p2tr,
    utxos: utxos,
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    network: network,
    feeRate: 5,
    priorityFee: 0n,
    gasSatFee: 10_000n,
    bytecode: FACTORY_WASM,
    challenge: challenge,
    linkMLDSAPublicKeyToAddress: true,
    revealMLDSAPublicKey: true,
};
```

### Step 4: Deploy Pool Template

Same process as Factory, but use `OptionsPool.wasm`:

```typescript
const POOL_WASM = fs.readFileSync('./build/OptionsPool.wasm');
const poolParams = { ...factoryParams, bytecode: POOL_WASM };
```

### Step 5: Configure Factory

```typescript
// Set pool template
await factoryContract.setPoolTemplate(poolAddress, {
    from: wallet.p2tr,
    gasLimit: 2_000_000n,
});

// Create pool for FROG-U/FROG-P
await factoryContract.createPool(frogUAddress, frogPAddress, {
    from: wallet.p2tr,
    gasLimit: 3_000_000n,
});
```

## Integration Test Scenarios

### Test 1: Full Option Lifecycle

```typescript
// Writer flow
await motoContract.increaseAllowance(poolAddress, 100n * 10n ** 18n, {
    from: writerWallet.p2tr,
    gasLimit: 1_000_000n,
});

await poolContract.writeOption(
    0, // CALL
    50n, // strike: 50 PILL per MOTO
    864000n, // expiry block
    100n * 10n ** 18n, // underlying amount
    200n * 10n ** 18n, // premium
    { from: writerWallet.p2tr, gasLimit: 5_000_000n }
);

// Buyer flow
await pillContract.increaseAllowance(poolAddress, 200n * 10n ** 18n, {
    from: buyerWallet.p2tr,
    gasLimit: 1_000_000n,
});

await poolContract.buyOption(optionId, {
    from: buyerWallet.p2tr,
    gasLimit: 4_000_000n,
});

// Verify collateral locked
const motoBalance = await motoContract.balanceOf(poolAddress);
assert.equal(motoBalance, 100n * 10n ** 18n);

// Verify premium transferred
const pillBalance = await pillContract.balanceOf(writerWallet.p2tr);
assert.equal(pillBalance, 200n * 10n ** 18n);
```

### Test 2: Exercise Option (ITM)

```typescript
// Advance to expiry block
await provider.mineBlocks(100); // Or simulate time passing

await poolContract.exercise(optionId, {
    from: buyerWallet.p2tr,
    gasLimit: 6_000_000n,
});

// Verify settlement
// Buyer paid strike (5000 PILL), received underlying (100 MOTO)
```

### Test 3: Cancel Option

```typescript
await poolContract.cancelOption(optionId, {
    from: writerWallet.p2tr,
    gasLimit: 3_000_000n,
});

// Verify collateral returned (minus 1% fee)
// Writer receives 99 MOTO, 1 MOTO stays as fee
```

## Gas Validation

Measure gas usage on-chain:

```typescript
const receipt = await provider.getTransactionReceipt(tx.txid);
const gasUsed = receipt.gasUsed;

console.log('writeOption gas:', gasUsed);
console.log('buyOption gas:', gasUsed);
console.log('exercise gas:', gasUsed);
```

## File Structure

```
tests/
├── integration/
│   ├── setup.ts              # Wallet, token deployment
│   ├── deploy-contracts.ts   # Factory, Pool, tokens
│   ├── lifecycle.test.ts     # Full option lifecycle
│   └── gas-baseline.ts       # Gas measurements
├── test-tokens.json          # Deployed token addresses (regtest)
└── integration-results.md    # Test results summary
```

## Troubleshooting

### No UTXOs Available

```bash
# Get test BTC from OPNet faucet
curl -X POST https://regtest.opnet.org/faucet -d "address=<your-address>"
```

### Token Transfer Fails

1. Verify `increaseAllowance()` was called first
2. Check token contract address is correct
3. Ensure sufficient balance
4. Verify gas limit is adequate

### Contract Deployment Fails

1. Check wallet has sufficient rBTC
2. Verify WASM file exists and is valid
3. Ensure challenge is fetched before deployment
4. Check ML-DSA keys are properly configured

## Next Steps

1. ✅ Complete integration tests on regtest
2. ✅ Document results in `docs/tests/`
3. ✅ Verify all write methods work
4. ✅ Validate gas usage
5. ✅ Proceed to Sprint 6 (Frontend MVP)

## References

- [OPNet Regtest Docs](https://docs.opnet.org)
- [OP20 Standard](../contracts/OP20_STANDARD.md)
- [Contract Deployment Guide](../contracts/DEPLOYMENT_GUIDE.md)
