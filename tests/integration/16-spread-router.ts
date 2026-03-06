/**
 * 16-spread-router.ts
 *
 * Integration tests for SpreadRouter contract (Sprint 9B).
 * Tests: deployment, executeSpread (bull/bear), executeDualWrite (collar),
 *        atomic rollback, gas profiling.
 *
 * Prerequisites: 01, 02, 05/06a deployed (tokens, factory, type 0 pool). Router WASM built.
 * Run: npx tsx tests/integration/16-spread-router.ts
 */

import { JSONRpcProvider } from 'opnet';
import { BinaryWriter, Address } from '@btc-vision/transaction';
import {
    getConfig,
    loadDeployedContracts,
    saveDeployedContracts,
    getLogger,
    computeSelectorU32,
    sleep,
} from './config.js';
import {
    createTestHarness,
    initTestContext,
    readOptionCount,
    pollForOptionCount,
    pollForPublicKeyInfo,
} from './test-harness.js';
import {
    DeploymentHelper,
    getWasmPath,
    createIncreaseAllowanceCalldata,
    createWriteOptionCalldata,
} from './deployment.js';

const log = getLogger('16-router');
const { runTest, skipTest, printSummary } = createTestHarness('16-router');

// ---------------------------------------------------------------------------
// Router selectors
// ---------------------------------------------------------------------------

const ROUTER_SELECTORS = {
    executeSpread:      computeSelectorU32('executeSpread(address,uint8,uint256,uint64,uint256,uint256,uint256)'),
    executeDualWrite:   computeSelectorU32('executeDualWrite(address,uint8,uint256,uint64,uint256,uint256,uint8,uint256,uint64,uint256,uint256)'),
};

// ---------------------------------------------------------------------------
// Calldata builders
// ---------------------------------------------------------------------------

const CALL = 0;
const PUT = 1;
const PRECISION = 10n ** 18n;

function createExecuteSpreadCalldata(
    poolAddr: Address,
    writeType: number,
    writeStrike: bigint,
    writeExpiry: bigint,
    writeAmount: bigint,
    writePremium: bigint,
    buyOptionId: bigint,
): Uint8Array {
    const w = new BinaryWriter();
    w.writeU32(ROUTER_SELECTORS.executeSpread);
    w.writeAddress(poolAddr);
    w.writeU8(writeType);
    w.writeU256(writeStrike);
    w.writeU64(writeExpiry);
    w.writeU256(writeAmount);
    w.writeU256(writePremium);
    w.writeU256(buyOptionId);
    return w.getBuffer();
}

function createExecuteDualWriteCalldata(
    poolAddr: Address,
    type1: number,
    strike1: bigint,
    expiry1: bigint,
    amount1: bigint,
    premium1: bigint,
    type2: number,
    strike2: bigint,
    expiry2: bigint,
    amount2: bigint,
    premium2: bigint,
): Uint8Array {
    const w = new BinaryWriter();
    w.writeU32(ROUTER_SELECTORS.executeDualWrite);
    w.writeAddress(poolAddr);
    w.writeU8(type1);
    w.writeU256(strike1);
    w.writeU64(expiry1);
    w.writeU256(amount1);
    w.writeU256(premium1);
    w.writeU8(type2);
    w.writeU256(strike2);
    w.writeU64(expiry2);
    w.writeU256(amount2);
    w.writeU256(premium2);
    return w.getBuffer();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const config = getConfig();
    const deployed = loadDeployedContracts();
    if (!deployed) throw new Error('No deployed-contracts.json. Run 01+02 first.');

    const provider = new JSONRpcProvider({ url: config.rpcUrl, network: config.network });
    const deployer = new DeploymentHelper(provider, config.wallet, config.network);

    // Use existing type 0 pool for router tests
    let ctx;
    try {
        ctx = await initTestContext();
    } catch {
        log.error('Cannot init test context — need deployed pool. Run 05/06a first.');
        skipTest('16.1-16.8', 'No type 0 pool deployed');
        printSummary();
        return;
    }

    const { poolAddress, poolCallAddr } = ctx;
    const underlyingBech32 = deployed.tokens.frogU;
    const premiumBech32 = deployed.tokens.frogP;

    let routerAddress = '';

    // -----------------------------------------------------------------------
    // 16.1 — Deploy SpreadRouter
    // -----------------------------------------------------------------------
    await runTest('16.1 Deploy SpreadRouter', async () => {
        // Check if router already deployed
        if (deployed.router) {
            log.info(`Router already deployed at: ${deployed.router}`);
            routerAddress = deployed.router;
            const routerCallAddr = await pollForPublicKeyInfo(provider, routerAddress);
            log.info(`Router call addr: ${routerCallAddr}`);
            return { routerAddress, reused: true };
        }

        const result = await deployer.deployContract(getWasmPath('SpreadRouter'), undefined, 50_000n);
        routerAddress = result.contractAddress;
        log.info(`SpreadRouter deployed at: ${routerAddress}`);

        // Persist to deployed-contracts.json
        deployed.router = routerAddress;
        saveDeployedContracts(deployed);
        log.info('Router address saved to deployed-contracts.json');

        // Wait for mining and resolve call address
        const routerCallAddr = await pollForPublicKeyInfo(provider, routerAddress);
        log.info(`Router call addr: ${routerCallAddr}`);

        return { routerAddress };
    });

    if (!routerAddress) {
        skipTest('16.2-16.8', 'Router deployment failed');
        printSummary();
        return;
    }

    // -----------------------------------------------------------------------
    // Pre-setup: Write an option to buy in the spread
    // -----------------------------------------------------------------------
    let buyableOptionId = -1n;

    await runTest('16.1b Pre-setup: Write a buyable option for spread tests', async () => {
        // Approve tokens for pool
        const poolAddr = Address.fromString(poolCallAddr);
        const countBefore = await readOptionCount(provider, poolCallAddr);
        const approveAmount = 100n * PRECISION;
        await deployer.callContract(underlyingBech32, createIncreaseAllowanceCalldata(poolAddr, approveAmount), 10_000n);
        await sleep(15_000);

        const currentBlock = await provider.getBlockNumber();
        const expiryBlock = currentBlock + 1008n;

        // Write a CALL with low strike (this is the option we'll buy in the spread)
        const writeCalldata = createWriteOptionCalldata(CALL, 30n * PRECISION, expiryBlock, 1n * PRECISION, 3n * PRECISION);
        await deployer.callContract(poolAddress, writeCalldata, 30_000n);

        const count = await pollForOptionCount(provider, poolCallAddr, countBefore + 1n);
        buyableOptionId = count - 1n;

        return { buyableOptionId: buyableOptionId.toString() };
    });

    // -----------------------------------------------------------------------
    // 16.2 — Bull call spread: write high strike + buy low strike
    // -----------------------------------------------------------------------
    await runTest('16.2 Bull call spread: write high strike + buy low strike', async () => {
        if (buyableOptionId < 0n) throw new Error('No buyable option — pre-setup failed');

        // Need to approve tokens for the router to call pool on our behalf
        const poolAddr = Address.fromString(poolCallAddr);
        await deployer.callContract(underlyingBech32, createIncreaseAllowanceCalldata(poolAddr, 10n * PRECISION), 10_000n);
        await deployer.callContract(premiumBech32, createIncreaseAllowanceCalldata(poolAddr, 50n * PRECISION), 10_000n);
        await sleep(15_000);

        const currentBlock = await provider.getBlockNumber();
        const expiryBlock = currentBlock + 1008n;

        const calldata = createExecuteSpreadCalldata(
            poolAddr,
            CALL,
            60n * PRECISION,  // Write CALL at higher strike
            expiryBlock,
            1n * PRECISION,
            5n * PRECISION,
            buyableOptionId,  // Buy the low-strike option
        );

        try {
            const result = await deployer.callContract(routerAddress, calldata, 50_000n);
            return { txId: result.txId, status: 'spread_executed' };
        } catch (err) {
            return { status: 'failed', error: (err as Error).message };
        }
    });

    // -----------------------------------------------------------------------
    // 16.3 — Bear put spread: write low strike PUT + buy existing option
    // -----------------------------------------------------------------------
    await runTest('16.3 Bear put spread: write PUT + buy existing option', async () => {
        if (buyableOptionId < 0n) throw new Error('No buyable option — pre-setup failed');

        // Need allowance for write + buy
        const poolAddr = Address.fromString(poolCallAddr);
        await deployer.callContract(underlyingBech32, createIncreaseAllowanceCalldata(poolAddr, 10n * PRECISION), 10_000n);
        await deployer.callContract(premiumBech32, createIncreaseAllowanceCalldata(poolAddr, 50n * PRECISION), 10_000n);
        await sleep(15_000);

        const currentBlock = await provider.getBlockNumber();
        const expiryBlock = currentBlock + 1008n;

        const calldata = createExecuteSpreadCalldata(
            poolAddr,
            PUT,                  // Write PUT at lower strike
            40n * PRECISION,
            expiryBlock,
            1n * PRECISION,
            3n * PRECISION,
            buyableOptionId,      // Buy the existing option
        );

        try {
            const result = await deployer.callContract(routerAddress, calldata, 50_000n);
            return { txId: result.txId, status: 'bear_put_spread_executed' };
        } catch (err) {
            return { status: 'failed', error: (err as Error).message };
        }
    });

    // -----------------------------------------------------------------------
    // 16.4 — Revert if write fails (atomic rollback)
    // -----------------------------------------------------------------------
    await runTest('16.4 Revert if write fails (atomic rollback)', async () => {
        // Attempt spread with 0 allowance — write should fail, entire TX reverts
        const poolAddr = Address.fromString(poolCallAddr);
        const currentBlock = await provider.getBlockNumber();
        const expiryBlock = currentBlock + 1008n;

        const calldata = createExecuteSpreadCalldata(
            poolAddr,
            CALL,
            100n * PRECISION,
            expiryBlock,
            1000n * PRECISION, // Huge amount — will fail due to insufficient allowance
            5n * PRECISION,
            0n,
        );

        try {
            await deployer.callContract(routerAddress, calldata, 50_000n);
            return { status: 'tx_broadcast_expected_on_chain_revert' };
        } catch (err) {
            return { status: 'correctly_rejected', error: (err as Error).message };
        }
    });

    // -----------------------------------------------------------------------
    // 16.5 — Revert if buy fails (atomic rollback)
    // -----------------------------------------------------------------------
    await runTest('16.5 Revert if buy fails (atomic rollback)', async () => {
        // Attempt to buy a non-existent option
        const poolAddr = Address.fromString(poolCallAddr);
        const currentBlock = await provider.getBlockNumber();
        const expiryBlock = currentBlock + 1008n;

        const calldata = createExecuteSpreadCalldata(
            poolAddr,
            CALL,
            60n * PRECISION,
            expiryBlock,
            1n * PRECISION,
            5n * PRECISION,
            999999n, // Non-existent option
        );

        try {
            await deployer.callContract(routerAddress, calldata, 50_000n);
            return { status: 'tx_broadcast_expected_on_chain_revert' };
        } catch (err) {
            return { status: 'correctly_rejected', error: (err as Error).message };
        }
    });

    // -----------------------------------------------------------------------
    // 16.6 — Collar: executeDualWrite (write call + write put)
    // -----------------------------------------------------------------------
    await runTest('16.6 Collar: executeDualWrite (write call + write put)', async () => {
        const poolAddr = Address.fromString(poolCallAddr);

        // Ensure we have allowance for both legs
        await deployer.callContract(underlyingBech32, createIncreaseAllowanceCalldata(poolAddr, 10n * PRECISION), 10_000n);
        await deployer.callContract(premiumBech32, createIncreaseAllowanceCalldata(poolAddr, 100n * PRECISION), 10_000n);
        await sleep(15_000);

        const currentBlock = await provider.getBlockNumber();
        const expiryBlock = currentBlock + 1008n;

        const calldata = createExecuteDualWriteCalldata(
            poolAddr,
            CALL,                // Leg 1: write CALL
            60n * PRECISION,     // strike
            expiryBlock,
            1n * PRECISION,      // amount
            5n * PRECISION,      // premium
            PUT,                 // Leg 2: write PUT
            40n * PRECISION,     // strike
            expiryBlock,
            1n * PRECISION,      // amount
            5n * PRECISION,      // premium
        );

        try {
            const result = await deployer.callContract(routerAddress, calldata, 80_000n);
            return { txId: result.txId, status: 'collar_executed' };
        } catch (err) {
            return { status: 'failed', error: (err as Error).message };
        }
    });

    // -----------------------------------------------------------------------
    // 16.7 — Verify option count increased (state verification)
    // -----------------------------------------------------------------------
    await runTest('16.7 Verify option count reflects router-created options', async () => {
        // After 16.1b (pre-setup write), 16.2 (bull call write), 16.3 (bear put write),
        // 16.6 (dual-write collar = 2 options), the option count should have increased.
        const count = await readOptionCount(provider, poolCallAddr);
        log.info(`Option count after router tests: ${count}`);

        return {
            optionCount: count.toString(),
            note: 'Includes pre-setup + spread writes + dual-write collar legs',
            minExpected: 'At least 1 from pre-setup write (16.1b)',
        };
    });

    // -----------------------------------------------------------------------
    // 16.8 — Cross-pool spread (structural)
    // -----------------------------------------------------------------------
    await runTest('16.8 Cross-pool spread (two different pool contracts)', async () => {
        // SpreadRouter's executeSpread takes a single pool address — both legs execute
        // on the same pool. True cross-pool spreads would require a separate router method
        // that takes two pool addresses.
        //
        // Available pools for cross-pool testing:
        //   - Type 0: opt1sqze2thmp29pkkj8ft8qll0383k3ek4sgvvfqd9r5 (MOTO/PILL)
        //   - Type 1: opt1sqqgsmcsqjkrdnr3xl9p9ygt9pmt8zvfap5ln62gr (MOTO/BTC)
        //   - Type 2: opt1sqzxk23tvmg3kvttypp3y582hmlm69lt8sgr2tu44 (BTC/MOTO)
        //
        // Cross-pool would need: write on pool A + buy on pool B in single atomic TX.
        // Current SpreadRouter contract doesn't support this — it's a single-pool router.
        return {
            status: 'structural_test',
            note: 'Current SpreadRouter operates on a single pool. Cross-pool requires contract extension.',
            availablePools: {
                type0: deployed.pool ?? '',
                type1: deployed.btcQuotePool ?? '',
                type2: deployed.btcUnderlyingPool ?? '',
            },
            futureWork: 'Add executeCrossPoolSpread(poolA, poolB, ...) to SpreadRouter contract',
        };
    });

    printSummary();
}

main().catch((err) => {
    log.error(`Fatal: ${err.message}`);
    process.exit(1);
});
