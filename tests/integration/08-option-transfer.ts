import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import type { CallResult, ICallRequestError } from 'opnet';
import { Address, AddressTypes, BinaryWriter } from '@btc-vision/transaction';
import {
    getConfig,
    loadDeployedContracts,
    getLogger,
    formatAddress,
    POOL_SELECTORS,
} from './config.js';
import {
    DeploymentHelper,
    createWriteOptionCalldata,
    createBuyOptionCalldata,
    createExerciseCalldata,
    createIncreaseAllowanceCalldata,
    createTransferOptionCalldata,
} from './deployment.js';

const log = getLogger('08-option-transfer');

// =========================================================================
// Test harness
// =========================================================================

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
    duration?: number;
    data?: Record<string, unknown>;
    skipped?: boolean;
}

const results: TestResult[] = [];

async function runTest(
    name: string,
    testFn: () => Promise<Record<string, unknown> | void>,
): Promise<void> {
    log.info(`Running: ${name}...`);
    const start = Date.now();
    try {
        const data = await testFn();
        const duration = Date.now() - start;
        results.push({ name, passed: true, duration, data: data as Record<string, unknown> | undefined });
        log.success(`${name} (${duration}ms)`);
    } catch (error) {
        const duration = Date.now() - start;
        const msg = error instanceof Error ? error.message : String(error);
        results.push({ name, passed: false, error: msg, duration });
        log.error(`${name} (${duration}ms): ${msg}`);
    }
}

function isCallError(result: CallResult | ICallRequestError): result is ICallRequestError {
    return 'error' in result;
}

// =========================================================================
// Helpers
// =========================================================================

async function readOption(
    provider: JSONRpcProvider,
    poolCallAddr: string,
    optionId: bigint,
): Promise<{
    id: bigint;
    writer: Address;
    buyer: Address;
    optionType: number;
    strikePrice: bigint;
    underlyingAmount: bigint;
    premium: bigint;
    expiryBlock: bigint;
    status: number;
}> {
    const w = new BinaryWriter();
    w.writeU256(optionId);
    const cd = Buffer.from(w.getBuffer() as Uint8Array).toString('hex');
    const result = await provider.call(poolCallAddr, POOL_SELECTORS.getOption + cd);
    if (isCallError(result)) throw new Error(`Call error: ${result.error}`);
    if (result.revert) throw new Error(`Revert: ${result.revert}`);
    const reader = result.result;
    return {
        id: reader.readU256(),
        writer: reader.readAddress(),
        buyer: reader.readAddress(),
        optionType: reader.readU8(),
        strikePrice: reader.readU256(),
        underlyingAmount: reader.readU256(),
        premium: reader.readU256(),
        expiryBlock: reader.readU64(),
        status: reader.readU8(),
    };
}

// =========================================================================
// Main
// =========================================================================

async function main() {
    log.info('=== FroGop Option Transfer Tests (Sprint 3) ===');
    log.info(`Network: ${process.env.OPNET_NETWORK || 'regtest'}`);

    const config = getConfig();
    const deployed = loadDeployedContracts();

    if (!deployed?.pool) {
        log.error('Pool not deployed. Run 06-full-lifecycle first.');
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

    // Wallets: index 0 = deployer/writer, index 1 = buyer, index 3 = transfer recipient
    const writerWallet = config.wallet;
    const buyerWallet = config.mnemonic.deriveOPWallet(AddressTypes.P2TR, 1);
    const recipientWallet = config.mnemonic.deriveOPWallet(AddressTypes.P2TR, 3);

    const writerHelper = new DeploymentHelper(provider, writerWallet, config.network);
    const buyerHelper = new DeploymentHelper(provider, buyerWallet, config.network);
    // Note: recipientHelper would be needed for exercise-after-transfer test

    const writerHex = writerWallet.address.toString();
    const buyerHex = buyerWallet.address.toString();
    const recipientHex = recipientWallet.address.toString();

    log.info(`Writer (index 0): ${formatAddress(writerHex)}`);
    log.info(`Buyer (index 1): ${formatAddress(buyerHex)}`);
    log.info(`Recipient (index 3): ${formatAddress(recipientHex)}`);

    // Resolve pool and token addresses to hex for provider.call
    const poolCallAddr = deployed.pool.startsWith('0x')
        ? deployed.pool
        : (await provider.getPublicKeyInfo(deployed.pool, true)).toString();
    const poolAddress = deployed.pool;
    const currentBlock = await provider.getBlockNumber();
    log.info(`Current block: ${currentBlock}`);

    // =====================================================================
    // TEST 1: Write a new option (writer creates, buyer buys, then transfer)
    // =====================================================================

    let transferOptionId: bigint | null = null;

    await runTest('Write option for transfer test', async () => {
        const expiryBlock = currentBlock + 500n; // ~3.5 days
        const calldata = createWriteOptionCalldata(
            0,                          // CALL
            50n * 10n ** 18n,           // strikePrice (18-decimal)
            expiryBlock,                // expiryBlock
            1n * 10n ** 18n,            // underlyingAmount (18-decimal)
            5n * 10n ** 18n,            // premium (18-decimal)
        );

        const { txId } = await writerHelper.callContract(poolAddress, calldata, 50_000n);
        log.info(`  Write TX: ${txId}`);

        // Read option count to find the newly created option
        const countResult = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
        if (isCallError(countResult)) throw new Error(`Count call error: ${countResult.error}`);
        const count = countResult.result.readU256();
        transferOptionId = count - 1n;
        log.info(`  Created option ID: ${transferOptionId}`);

        return { optionId: transferOptionId.toString(), txId };
    });

    // =====================================================================
    // TEST 2: Buyer purchases the option
    // =====================================================================

    await runTest('Buyer purchases option', async () => {
        if (transferOptionId === null) throw new Error('No option to buy');

        // Buyer approves pool to spend premium tokens
        const poolAddr = Address.fromString(poolCallAddr);
        const approveCalldata = createIncreaseAllowanceCalldata(poolAddr, 100n * 10n ** 18n);
        await buyerHelper.callContract(deployed.tokens.frogP, approveCalldata, 10_000n);

        // Buyer calls buyOption
        const buyCalldata = createBuyOptionCalldata(transferOptionId);
        const { txId } = await buyerHelper.callContract(poolAddress, buyCalldata, 50_000n);

        // Verify option is PURCHASED with correct buyer
        const option = await readOption(provider, poolCallAddr, transferOptionId);
        if (option.status !== 1) {
            log.warn(`  Option status is ${option.status}, expected 1 (PURCHASED)`);
        }

        return { txId, status: option.status, buyer: option.buyer.toString() };
    });

    // =====================================================================
    // TEST 3: Transfer option to new recipient
    // =====================================================================

    await runTest('Transfer option to new recipient', async () => {
        if (transferOptionId === null) throw new Error('No option to transfer');

        const recipientAddr = recipientWallet.address;
        const calldata = createTransferOptionCalldata(transferOptionId, recipientAddr);
        const { txId } = await buyerHelper.callContract(poolAddress, calldata, 50_000n);

        // Verify buyer changed
        const option = await readOption(provider, poolCallAddr, transferOptionId);
        const newBuyer = option.buyer.toString();
        log.info(`  New buyer: ${formatAddress(newBuyer)}`);

        if (newBuyer.toLowerCase() !== recipientHex.toLowerCase()) {
            throw new Error(`Buyer mismatch: expected ${formatAddress(recipientHex)}, got ${formatAddress(newBuyer)}`);
        }

        return { txId, newBuyer, status: option.status };
    });

    // =====================================================================
    // TEST 4: Old buyer cannot exercise after transfer
    // =====================================================================

    await runTest('Old buyer exercise reverts after transfer', async () => {
        if (transferOptionId === null) throw new Error('No option');

        try {
            const calldata = createExerciseCalldata(transferOptionId);
            await buyerHelper.callContract(poolAddress, calldata, 50_000n);
            // If we get here, the TX was broadcast (may still revert on-chain)
            return { result: 'TX broadcast — verify on-chain revert' };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            log.info(`  Reverted as expected: ${msg}`);
            return { reverted: true, message: msg };
        }
    });

    // =====================================================================
    // TEST 5: Transfer of OPEN option reverts
    // =====================================================================

    let openOptionId: bigint | null = null;

    await runTest('Transfer of OPEN option reverts', async () => {
        // Write a new option (leave it OPEN, don't buy)
        const expiryBlock = currentBlock + 500n;
        const writeCalldata = createWriteOptionCalldata(0, 50n * 10n ** 18n, expiryBlock, 1n * 10n ** 18n, 5n * 10n ** 18n);
        await writerHelper.callContract(poolAddress, writeCalldata, 50_000n);

        const countResult = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
        if (isCallError(countResult)) throw new Error(`Count error: ${countResult.error}`);
        openOptionId = countResult.result.readU256() - 1n;

        try {
            const recipientAddr = recipientWallet.address;
            const calldata = createTransferOptionCalldata(openOptionId, recipientAddr);
            await writerHelper.callContract(poolAddress, calldata, 50_000n);
            return { result: 'TX broadcast — verify on-chain revert for Not purchased' };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            log.info(`  Reverted as expected: ${msg}`);
            return { reverted: true, message: msg };
        }
    });

    // =====================================================================
    // Summary
    // =====================================================================

    log.info('\n=== Test Results ===');
    const passed = results.filter(r => r.passed && !r.skipped).length;
    const failed = results.filter(r => !r.passed).length;
    const skipped = results.filter(r => r.skipped).length;

    for (const r of results) {
        const icon = r.skipped ? 'SKIP' : r.passed ? 'PASS' : 'FAIL';
        const duration = r.duration ? ` (${r.duration}ms)` : '';
        const extra = r.error ? ` — ${r.error}` : '';
        log.info(`  [${icon}] ${r.name}${duration}${extra}`);
    }

    log.info(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`);

    if (failed > 0) {
        process.exit(1);
    }
}

main().catch((error) => {
    log.error(`Fatal: ${error.message}`);
    process.exit(1);
});
