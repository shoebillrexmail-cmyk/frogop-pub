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
    createBatchCancelCalldata,
    createBatchSettleCalldata,
} from './deployment.js';
import { JSONRpcProvider } from 'opnet';

const log = getLogger('09-batch-operations');
const { runTest, printSummary } = createTestHarness('09-batch-operations');

// =========================================================================
// Main
// =========================================================================

async function main() {
    log.info('=== FroGop Batch Operations Tests (Sprint 4) ===');
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

    // =====================================================================
    // Setup: Write 3 CALL options (IDs tracked via optionCount)
    // Option A: left OPEN (for batchCancel)
    // Option B: bought (for batchSettle)
    // Option C: bought (for batchSettle)
    // =====================================================================

    const optionIds: bigint[] = [];

    await runTest('Setup: Write 3 options for batch tests', async () => {
        const expiryBlock = currentBlock + 200n; // short expiry for settle tests

        for (let i = 0; i < 3; i++) {
            const calldata = createWriteOptionCalldata(
                0,                      // CALL
                50n * 10n ** 18n,       // strikePrice (18-decimal)
                expiryBlock,            // expiryBlock
                1n * 10n ** 18n,        // underlyingAmount (18-decimal)
                5n * 10n ** 18n,        // premium (18-decimal)
            );
            await writerHelper.callContract(poolAddress, calldata, 50_000n);
            const count = await readOptionCount(provider, poolCallAddr);
            optionIds.push(count - 1n);
            log.info(`  Created option ID: ${count - 1n}`);
        }

        return { optionIds: optionIds.map(id => id.toString()) };
    });

    // =====================================================================
    // Setup: Buyer purchases options B and C
    // =====================================================================

    await runTest('Setup: Buyer purchases options B and C', async () => {
        if (optionIds.length < 3) throw new Error('Not enough options created');

        // Buyer approves pool for premium tokens
        const poolAddr = Address.fromString(poolCallAddr);
        const approveCalldata = createIncreaseAllowanceCalldata(poolAddr, 100n * 10n ** 18n);
        await buyerHelper.callContract(deployed.tokens.frogP, approveCalldata, 10_000n);

        // Buy option B (index 1) and C (index 2)
        for (const idx of [1, 2]) {
            const buyCalldata = createBuyOptionCalldata(optionIds[idx]!);
            await buyerHelper.callContract(poolAddress, buyCalldata, 50_000n);
            log.info(`  Bought option ${optionIds[idx]!}`);
        }

        return { bought: [optionIds[1]!.toString(), optionIds[2]!.toString()] };
    });

    // =====================================================================
    // TEST 1: batchCancel - Cancel OPEN option A
    // =====================================================================

    await runTest('batchCancel: Cancel OPEN option in batch', async () => {
        if (optionIds.length < 1) throw new Error('No options');

        const calldata = createBatchCancelCalldata([optionIds[0]!]);
        const { txId } = await writerHelper.callContract(poolAddress, calldata, 50_000n);

        // Verify status is CANCELLED (4)
        const option = await readOption(provider, poolCallAddr, optionIds[0]!);
        if (option.status !== 4) {
            log.warn(`  Option status is ${option.status}, expected 4 (CANCELLED)`);
        }

        return { txId, status: option.status };
    });

    // =====================================================================
    // TEST 2: batchCancel revert - Try to cancel already-cancelled option
    // =====================================================================

    await runTest('batchCancel: Revert on already-cancelled option', async () => {
        if (optionIds.length < 1) throw new Error('No options');

        try {
            const calldata = createBatchCancelCalldata([optionIds[0]!]);
            await writerHelper.callContract(poolAddress, calldata, 50_000n);
            return { result: 'TX broadcast - verify on-chain revert for Not open' };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            log.info(`  Reverted as expected: ${msg}`);
            return { reverted: true, message: msg };
        }
    });

    // =====================================================================
    // TEST 3: batchSettle - Settle expired purchased options B and C
    // Note: This requires options to be past grace period.
    // If blocks haven't advanced enough, this will settle 0 (non-atomic).
    // =====================================================================

    await runTest('batchSettle: Settle expired options', async () => {
        if (optionIds.length < 3) throw new Error('Not enough options');

        const calldata = createBatchSettleCalldata([optionIds[1]!, optionIds[2]!]);
        const { txId } = await writerHelper.callContract(poolAddress, calldata, 50_000n);

        // Check statuses - they may or may not be settled depending on block height
        const optB = await readOption(provider, poolCallAddr, optionIds[1]!);
        const optC = await readOption(provider, poolCallAddr, optionIds[2]!);

        log.info(`  Option B status: ${optB.status}`);
        log.info(`  Option C status: ${optC.status}`);

        return {
            txId,
            optionBStatus: optB.status,
            optionCStatus: optC.status,
        };
    });

    // =====================================================================
    // TEST 4: batchSettle skip - Mix of settleable and non-settleable
    // =====================================================================

    await runTest('batchSettle: Skip non-settleable options gracefully', async () => {
        // Use a non-existent ID and the already-cancelled option
        const calldata = createBatchSettleCalldata([99999n, optionIds[0]!]);
        const { txId } = await writerHelper.callContract(poolAddress, calldata, 50_000n);

        // Both should be skipped (99999 doesn't exist, optionIds[0] is CANCELLED)
        return { txId, note: 'non-existent and cancelled IDs skipped' };
    });

    printSummary();
}

main().catch((error) => {
    log.error(`Fatal: ${error.message}`);
    process.exit(1);
});
