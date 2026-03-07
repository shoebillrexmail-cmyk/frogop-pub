# Integration Testing Technical Guide: FroGop on OPNet Regtest

## Overview

This document provides technical details for integration testing FroGop on OPNet regtest. It covers wallet setup, contract deployment, and integration test execution.

## Quick Start

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Edit .env with your mnemonic
# OPNET_MNEMONIC="your 24 word seed phrase"
# OPNET_NETWORK="regtest"

# 3. Run integration tests
npm run test:integration
```

## Files Created

| File | Purpose |
|------|---------|
| `tests/integration/config.ts` | Configuration, wallet setup, logging |
| `tests/integration/deployment.ts` | Deployment helper class |
| `tests/integration/01-deploy-tokens.ts` | Deploy FROG-U and FROG-P |
| `tests/integration/02-deploy-factory.ts` | Deploy Factory and Pool template |
| `tests/integration/03-option-lifecycle.ts` | Integration tests |
| `tests/integration/run-integration-tests.ts` | Test runner |

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

## OPNet Regtest Behavior

### Block Production

OPNet regtest automatically produces blocks - **no manual mining required**. However, blocks are not instant:

| Timing | Description |
|--------|-------------|
| Block time | ~10-30 seconds (automatic) |
| Transaction confirmation | Wait 1-2 blocks after broadcast |
| State queries | May return stale data immediately after TX |

### Transaction Flow

```typescript
// 1. Broadcast transaction
const result = await deployer.callContract(contractAddress, calldata);
console.log('TX broadcast:', result.txId);

// 2. Wait for confirmation (CRITICAL!)
await sleep(30000);  // 30 seconds = ~1-2 blocks

// 3. Query state (now reflects the transaction)
const template = await provider.call(factoryAddr, '0x8fe49911');
```

### Common Pitfall: Querying Too Early

```typescript
// ❌ WRONG: Query immediately after broadcast
await deployer.callContract(factoryAddr, setTemplateCalldata);
const template = await provider.call(factoryAddr, '0x8fe49911');
// Result: Still 0x0...0 (old state)

// ✅ CORRECT: Wait for block confirmation
await deployer.callContract(factoryAddr, setTemplateCalldata);
await sleep(30000);  // Wait for block
const template = await provider.call(factoryAddr, '0x8fe49911');
// Result: 0x473d99d1... (new state)
```

### Helper Function

```typescript
async function waitForConfirmation(
    provider: JSONRpcProvider, 
    initialBlock: bigint,
    blocksToWait: number = 2
): Promise<void> {
    const targetBlock = initialBlock + BigInt(blocksToWait);
    while (true) {
        const currentBlock = await provider.getBlockNumber();
        if (currentBlock >= targetBlock) break;
        await sleep(5000);
    }
}

// Usage
const startBlock = await provider.getBlockNumber();
await deployer.callContract(factoryAddr, calldata);
await waitForConfirmation(provider, startBlock);
// Now safe to query state
```

### Transaction Receipts

Note: Transaction receipts may not be immediately available on regtest. Use state queries to verify:

```typescript
// Instead of waiting for receipt, query contract state
const result = await provider.call(contractAddress, selector);
```

## Troubleshooting

### Transaction Not Confirming

1. **Wait longer** - regtest blocks take 10-30 seconds
2. **Check balance** - fees are deducted from UTXOs
3. **Verify gas** - insufficient gas causes silent failures

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
2. ✅ Document results in `internal/tests/`
3. ✅ Verify all write methods work
4. ✅ Validate gas usage
5. ✅ Proceed to Sprint 6 (Frontend MVP)

## Lessons Learned (Sprint 5 Integration)

### 1. OPNet Address Types — CRITICAL PITFALL

OPNet has **three distinct address formats** that are NOT interchangeable:

| Format | Example | Source | Used For |
|--------|---------|--------|----------|
| P2TR (bech32) | `bcrt1pfteyvlu...` | `wallet.p2tr` | UTXO queries, `refundTo`, human display |
| MLDSA Hash (hex) | `0xd9fec7f7...b48a20ed` | `wallet.address.toString()` | `balanceOf`, contract state, `getContract()` sender |
| PublicKeyInfo (hex) | `0x4af2467f...db86029c` | `provider.getPublicKeyInfo(p2tr, true)` | Converting `opr1` addresses to hex for `provider.call()` |

**The bug**: Using `getPublicKeyInfo()` result for `balanceOf()` queries returns 0, because token
balances are keyed by `wallet.address` (the MLDSA address hash). These two hex values are
**completely different keys** — there's no error, just wrong data.

```typescript
// ❌ WRONG: getPublicKeyInfo returns a different key
const pubKeyInfo = await provider.getPublicKeyInfo(wallet.p2tr, true);
const balance = await getTokenBalance(provider, tokenAddr, pubKeyInfo.toString());
// Returns 0 — tokens are not stored under this key

// ✅ CORRECT: wallet.address is the MLDSA address hash used in contract state
const senderAddr = config.wallet.address;
const balance = await getTokenBalance(provider, tokenAddr, senderAddr.toString());
// Returns actual token balance
```

**When to use which:**
- **`wallet.address`**: For `balanceOf`, `getContract()` sender param, and any contract state lookup
- **`getPublicKeyInfo()`**: For converting `opr1...` addresses to hex for `provider.call()`
- **`wallet.p2tr`**: For `refundTo` in transactions, UTXO queries, and `getBalance()`

### 2. Address.fromString() Requires Hex Format

`Address.fromString()` only accepts `0x...` hex format. It does NOT accept `opr1...` format.

```typescript
// ❌ WRONG: opr1 format throws "must pass public keys in hexadecimal format"
const poolAddr = Address.fromString('opr1sqzkv45guftsqldyc5s00a83aejqslyqt9cuyy8xq');

// ✅ CORRECT: Convert opr1 to hex first via getPublicKeyInfo
const poolHex = await provider.getPublicKeyInfo('opr1sqzkv45guftsqldyc5s00a83aejqslyqt9cuyy8xq', true);
const poolAddr = Address.fromString(poolHex.toString());
```

The `deployed-contracts.json` stores factory/pool addresses in `opr1...` format, so always convert
before passing to `Address.fromString()` or `getContract()`.

### 3. NativeSwap Integration Guide

NativeSwap uses a **two-phase commit** flow for token swaps:

```
Phase 1: RESERVE                    Phase 2: SWAP
┌──────────────────────┐            ┌──────────────────────┐
│ 1. getQuote()        │            │ 1. setTransactionDetails()
│ 2. setTransactionDetails()        │    (LP payment outputs)
│    (fee output)      │            │ 2. swap(token)
│ 3. reserve(token,    │            │ 3. sendTransaction()
│    sats, minOut, 0)  │            │    (with extraOutputs
│ 4. sendTransaction() │──mine──►   │     to LP addresses)
│    (with fee output) │            └──────────────────────┘
└──────────────────────┘
```

**Key rules:**
- One active reservation per (wallet, token) pair
- Reservation fee: 5,000 sats to the fees address
- `setTransactionDetails()` MUST be called BEFORE simulation
- LP payment details come from `LiquidityReserved` events in the reserve TX receipt
- If the swap phase fails, the reservation may expire — start a fresh reserve

#### NativeSwap Code Pattern

```typescript
import { getContract, NativeSwapAbi, TransactionOutputFlags } from 'opnet';

const NATIVE_SWAP = '0xb056ba05448cf4a5468b3e1190b0928443981a93c3aff568467f101e94302422';
const FEES_ADDR = 'bcrt1qup339pnfsgz7rwu5qvw7e3pgdjmpda9zlwlg8ua70v3p8xl3tnqsjm472h';
const RESERVATION_FEE = 5_000n;

// 1. Set fee output BEFORE reserve simulation
nativeSwap.setTransactionDetails({
    inputs: [],
    outputs: [{
        to: FEES_ADDR,
        value: RESERVATION_FEE,
        index: 1,
        flags: TransactionOutputFlags.hasTo,
        scriptPubKey: undefined,
    }],
});

// 2. Simulate reserve
const reservation = await nativeSwap.reserve(token, satoshiAmount, minTokensOut, 0);

// 3. Send with fee as extraOutput
await reservation.sendTransaction({
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    extraOutputs: [{ address: FEES_ADDR, value: RESERVATION_FEE }],
    // ... other params
});

// 4. Wait for mining, get receipt, decode LiquidityReserved events
const events = nativeSwap.decodeEvents(receipt.events);
const lpPayments = events.filter(e => e.type === 'LiquidityReserved');

// 5. Set LP payment outputs BEFORE swap simulation
nativeSwap.setTransactionDetails({
    inputs: [],
    outputs: lpPayments.map((lp, i) => ({
        to: lp.properties.depositAddress,
        value: lp.properties.satoshisAmount,
        index: i + 1,
        flags: TransactionOutputFlags.hasTo,
        scriptPubKey: undefined,
    })),
});

// 6. Simulate and send swap
const swap = await nativeSwap.swap(token);
await swap.sendTransaction({
    extraOutputs: lpPayments.map(lp => ({
        address: lp.properties.depositAddress,
        value: lp.properties.satoshisAmount,
    })),
    // ... other params
});
```

#### State Persistence for Interrupted Swaps

The reserve→swap flow spans two separate transactions. If the process crashes between them,
the reservation is still active on-chain. Use a state file to track pending reservations:

```typescript
// Save after reserve TX mines, before swap
swapState[tokenName] = {
    reserveTxId,
    tokenAddress,
    recipients: lpPayments.map(r => ({ address: r.address, amount: r.amount.toString() })),
    createdAt: new Date().toISOString(),
};
fs.writeFileSync('swap-state.json', JSON.stringify(swapState, null, 2));

// On next run: check for pending state and resume swap phase
```

### 4. Transaction Receipt Event Structure

Receipt events are NOT a flat array. They are keyed by contract address in `opr1` format:

```typescript
// ❌ WRONG: events is not a flat array
receipt.events.forEach(e => console.log(e.type));

// ✅ CORRECT: events keyed by contract address
const contractEvents = receipt.events['opr1sqps4u...'];  // opr1 format key
contractEvents.forEach(event => {
    console.log(event.type);  // e.g., 'LiquidityReserved'
    console.log(event.data);  // event-specific data
});

// Using getContract's decodeEvents helper (recommended):
const decoded = nativeSwap.decodeEvents(receipt.events);
// Returns flat array of { type, properties } objects
```

### 5. Block Transaction Fields

When scanning blocks for transactions:

```typescript
const block = await provider.getBlockByNumber(blockNum, true);

// ❌ WRONG: tx.hash is NOT the transaction ID
const receipt = await provider.getTransactionReceipt(tx.hash);

// ✅ CORRECT: tx.id is the actual transaction ID
const receipt = await provider.getTransactionReceipt(tx.id);
```

`tx.hash` and `tx.id` are **different values**. Always use `tx.id` for receipt lookups.

### 6. Regtest Block Timeout Handling

Regtest blocks can take 5+ minutes between productions. Write operations should treat
TX broadcast as success and not fail on block confirmation timeouts:

```typescript
// ✅ PATTERN: Broadcast = success, timeout = warning
const txResult = await simulation.sendTransaction(params);
log.success(`TX broadcast: ${txResult.transactionId}`);

try {
    await waitForBlock(provider, currentBlock, 3, 120);
} catch {
    log.warn('Block timeout - TX broadcast OK, may confirm later');
}

// Continue with next operation or verification
```

For read-after-write verification, add retry logic:

```typescript
let receipt;
for (let attempt = 0; attempt < 10; attempt++) {
    try {
        receipt = await provider.getTransactionReceipt(txId);
        break;
    } catch {
        if (attempt < 9) await sleep(15_000);
    }
}
```

### 7. Satoshi Branded Type

The `extraOutputs.value` field expects a `Satoshi` branded bigint type. Use `as any` cast:

```typescript
const extraOutputs = recipients.map(r => ({
    address: r.address,
    value: r.amount,  // bigint
}));

await swap.sendTransaction({
    extraOutputs: extraOutputs as any,  // Cast needed for Satoshi brand
    // ...
});
```

### 8. Token Balance Queries via Raw Calldata

For integration tests, raw `provider.call()` is simpler than `getContract` for token reads:

```typescript
import { BinaryWriter, Address } from '@btc-vision/transaction';

function computeSelector(signature: string): string {
    const hash = sha256(Buffer.from(signature));
    return hash.slice(0, 8);  // First 4 bytes
}

async function getTokenBalance(
    provider: JSONRpcProvider,
    tokenAddress: string,
    ownerHex: string,
): Promise<bigint> {
    const w = new BinaryWriter();
    w.writeAddress(Address.fromString(ownerHex));
    const calldata = Buffer.from(w.getBuffer()).toString('hex');
    const result = await provider.call(
        tokenAddress,
        computeSelector('balanceOf(address)') + calldata,
    );
    if ('error' in result || result.revert) return 0n;
    return result.result.readU256();
}
```

## References

- [OPNet Regtest Docs](https://docs.opnet.org)
- [OP20 Standard](../contracts/OP20_STANDARD.md)
- [Contract Deployment Guide](../contracts/DEPLOYMENT_GUIDE.md)
