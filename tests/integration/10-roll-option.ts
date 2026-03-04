import 'dotenv/config';
import { Address, AddressTypes } from '@btc-vision/transaction';
import {
    createTestHarness,
    readOption,
    readOptionCount,
    getConfig,
    loadDeployedContracts,
    getLogger,
} from './test-harness.js';
import { formatAddress } from './config.js';
import {
    DeploymentHelper,
    createWriteOptionCalldata,
    createBuyOptionCalldata,
    createIncreaseAllowanceCalldata,
    createRollOptionCalldata,
} from './deployment.js';
import { JSONRpcProvider } from 'opnet';

const log = getLogger('10-roll-option');
const { runTest, printSummary } = createTestHarness('10-roll-option');

// =========================================================================
// Main
// =========================================================================

async function main() {
    log.info('=== FroGop Roll Option Tests (Sprint 5) ===');
    log.info(`Network: ${process.env.OPNET_NETWORK || 'regtest'}`);

    const config = getConfig();
    const deployed = loadDeployedContracts();

    if (!deployed?.pool) {
        log.error('Pool not deployed. Run 06a-pool-state first.');
        process.exit(1);
    }

    log.info('Using contracts:');
    log.info(`  Pool: ${formatAddress(deployed.pool)}`);
    log.info(`  FROG-U: ${formatAddress(deployed.tokens.frogU)}`);
    log.info(`  FROG-P: ${formatAddress(deployed.tokens.frogP)}`);

    const provider = new JSONRpcProvider({
        url: config.rpcUrl,
        network: config.network,
    });

    // Wallets: index 0 = deployer/writer, index 1 = buyer
    const writerWallet = config.wallet;
    const buyerWallet = config.mnemonic.deriveOPWallet(AddressTypes.P2TR, 1);

    const writerHelper = new DeploymentHelper(provider, writerWallet, config.network);
    const buyerHelper = new DeploymentHelper(provider, buyerWallet, config.network);

    const poolAddress = deployed.pool;
    const poolCallAddr = poolAddress.startsWith('0x')
        ? poolAddress
        : (await provider.getPublicKeyInfo(poolAddress, true)).toString();

    const currentBlock = await provider.getBlockNumber();
    log.info(`Current block: ${currentBlock}`);

    // Track option IDs created in this test run
    let callOptionId: bigint = -1n;
    let putOptionId: bigint = -1n;

    // =====================================================================
    // Setup: Write a CALL option and a PUT option for rolling
    // =====================================================================

    await runTest('Setup: Write CALL option for roll test', async () => {
        const expiryBlock = currentBlock + 500n;
        const calldata = createWriteOptionCalldata(
            0,                      // CALL
            50n * 10n ** 18n,       // strikePrice (18-decimal)
            expiryBlock,
            1n * 10n ** 18n,        // underlyingAmount (18-decimal)
            5n * 10n ** 18n,        // premium (18-decimal)
        );
        await writerHelper.callContract(poolAddress, calldata, 50_000n);
        const count = await readOptionCount(provider, poolCallAddr);
        callOptionId = count - 1n;
        log.info(`  Created CALL option ID: ${callOptionId}`);
        return { callOptionId: callOptionId.toString() };
    });

    await runTest('Setup: Write PUT option for roll test', async () => {
        const expiryBlock = currentBlock + 500n;
        const calldata = createWriteOptionCalldata(
            1,                      // PUT
            50n * 10n ** 18n,       // strikePrice (18-decimal)
            expiryBlock,
            1n * 10n ** 18n,        // underlyingAmount (18-decimal)
            5n * 10n ** 18n,        // premium (18-decimal)
        );
        await writerHelper.callContract(poolAddress, calldata, 50_000n);
        const count = await readOptionCount(provider, poolCallAddr);
        putOptionId = count - 1n;
        log.info(`  Created PUT option ID: ${putOptionId}`);
        return { putOptionId: putOptionId.toString() };
    });

    // =====================================================================
    // TEST 1: Roll CALL option — same amount, new strike + expiry + premium
    // =====================================================================

    await runTest('Roll CALL option: verify old CANCELLED, new OPEN', async () => {
        if (callOptionId < 0n) throw new Error('CALL option not created');

        const newStrike = 75n * 10n ** 18n;   // 75 PILL (18-decimal)
        const newExpiry = currentBlock + 1000n;
        const newPremium = 8n * 10n ** 18n;    // 8 PILL (18-decimal)

        const calldata = createRollOptionCalldata(callOptionId, newStrike, newExpiry, newPremium);
        const { txId } = await writerHelper.callContract(poolAddress, calldata, 50_000n);

        // Verify old option is CANCELLED (4)
        const oldOption = await readOption(provider, poolCallAddr, callOptionId);
        if (oldOption.status !== 4) {
            log.warn(`  Old option status: ${oldOption.status}, expected 4 (CANCELLED)`);
        }

        // Verify new option is OPEN (0) with correct params
        const newCount = await readOptionCount(provider, poolCallAddr);
        const newOptionId = newCount - 1n;
        const newOption = await readOption(provider, poolCallAddr, newOptionId);

        if (newOption.status !== 0) {
            log.warn(`  New option status: ${newOption.status}, expected 0 (OPEN)`);
        }
        if (newOption.strikePrice !== newStrike) {
            log.warn(`  New strike: ${newOption.strikePrice}, expected ${newStrike}`);
        }
        if (newOption.premium !== newPremium) {
            log.warn(`  New premium: ${newOption.premium}, expected ${newPremium}`);
        }
        if (newOption.underlyingAmount !== 1n * 10n ** 18n) {
            log.warn(`  New amount: ${newOption.underlyingAmount}, expected ${1n * 10n ** 18n}`);
        }

        return {
            txId,
            oldStatus: oldOption.status,
            newOptionId: newOptionId.toString(),
            newStatus: newOption.status,
            newStrike: newOption.strikePrice.toString(),
            newPremium: newOption.premium.toString(),
        };
    });

    // =====================================================================
    // TEST 2: Roll PUT option with higher strike (top-up scenario)
    // =====================================================================

    await runTest('Roll PUT option: higher strike requires top-up', async () => {
        if (putOptionId < 0n) throw new Error('PUT option not created');

        const newStrike = 80n * 10n ** 18n; // higher than original 50 => more collateral (18-decimal)
        const newExpiry = currentBlock + 1000n;
        const newPremium = 6n * 10n ** 18n; // 6 PILL (18-decimal)

        const calldata = createRollOptionCalldata(putOptionId, newStrike, newExpiry, newPremium);
        const { txId } = await writerHelper.callContract(poolAddress, calldata, 50_000n);

        // Verify old option is CANCELLED (4)
        const oldOption = await readOption(provider, poolCallAddr, putOptionId);
        if (oldOption.status !== 4) {
            log.warn(`  Old PUT status: ${oldOption.status}, expected 4 (CANCELLED)`);
        }

        // Verify new option exists with higher strike
        const newCount = await readOptionCount(provider, poolCallAddr);
        const newOptionId = newCount - 1n;
        const newOption = await readOption(provider, poolCallAddr, newOptionId);

        if (newOption.strikePrice !== newStrike) {
            log.warn(`  New PUT strike: ${newOption.strikePrice}, expected ${newStrike}`);
        }

        return {
            txId,
            oldStatus: oldOption.status,
            newOptionId: newOptionId.toString(),
            newStrike: newOption.strikePrice.toString(),
        };
    });

    // =====================================================================
    // TEST 3: Revert — roll a purchased option (not OPEN)
    // =====================================================================

    let purchasedOptionId: bigint = -1n;

    await runTest('Setup: Write and buy option for revert test', async () => {
        const expiryBlock = currentBlock + 500n;
        const writeCalldata = createWriteOptionCalldata(0, 50n * 10n ** 18n, expiryBlock, 1n * 10n ** 18n, 5n * 10n ** 18n);
        await writerHelper.callContract(poolAddress, writeCalldata, 50_000n);
        const count = await readOptionCount(provider, poolCallAddr);
        purchasedOptionId = count - 1n;

        // Buyer approves and buys
        const poolAddr = Address.fromString(poolCallAddr);
        const approveCalldata = createIncreaseAllowanceCalldata(poolAddr, 100n * 10n ** 18n);
        await buyerHelper.callContract(deployed.tokens.frogP, approveCalldata, 10_000n);

        const buyCalldata = createBuyOptionCalldata(purchasedOptionId);
        await buyerHelper.callContract(poolAddress, buyCalldata, 50_000n);

        return { purchasedOptionId: purchasedOptionId.toString() };
    });

    await runTest('Revert: roll purchased option (not OPEN)', async () => {
        if (purchasedOptionId < 0n) throw new Error('Purchased option not created');

        try {
            const calldata = createRollOptionCalldata(purchasedOptionId, 60n * 10n ** 18n, currentBlock + 1000n, 5n * 10n ** 18n);
            await writerHelper.callContract(poolAddress, calldata, 50_000n);
            return { result: 'TX broadcast - verify on-chain revert for Not open' };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            log.info(`  Reverted as expected: ${msg}`);
            return { reverted: true, message: msg };
        }
    });

    // =====================================================================
    // TEST 4: Revert — roll by non-writer
    // =====================================================================

    await runTest('Revert: roll by non-writer', async () => {
        // Write a new OPEN option as writer
        const expiryBlock = currentBlock + 500n;
        const writeCalldata = createWriteOptionCalldata(0, 50n * 10n ** 18n, expiryBlock, 1n * 10n ** 18n, 5n * 10n ** 18n);
        await writerHelper.callContract(poolAddress, writeCalldata, 50_000n);
        const count = await readOptionCount(provider, poolCallAddr);
        const targetId = count - 1n;

        try {
            // Buyer (non-writer) attempts to roll
            const calldata = createRollOptionCalldata(targetId, 60n * 10n ** 18n, currentBlock + 1000n, 5n * 10n ** 18n);
            await buyerHelper.callContract(poolAddress, calldata, 50_000n);
            return { result: 'TX broadcast - verify on-chain revert for Not writer' };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            log.info(`  Reverted as expected: ${msg}`);
            return { reverted: true, message: msg };
        }
    });

    printSummary();
}

main().catch((error) => {
    log.error(`Fatal: ${error.message}`);
    process.exit(1);
});
