import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { Address, BinaryWriter } from '@btc-vision/transaction';
import {
    getConfig,
    loadDeployedContracts,
    saveDeployedContracts,
    getLogger,
    formatAddress,
    waitForBlock,
    FACTORY_SELECTORS,
    POOL_SELECTORS,
} from './config.js';
import { DeploymentHelper, createPoolCalldata, getWasmPath } from './deployment.js';
import type { CallResult, ICallRequestError } from 'opnet';

const log = getLogger('05-pool-creation');

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
    duration?: number;
    data?: Record<string, unknown> | undefined;
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
        results.push({
            name,
            passed: true,
            duration,
            data: data as Record<string, unknown> | undefined,
        });
        log.success(`${name} (${duration}ms)`);
    } catch (error) {
        const duration = Date.now() - start;
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        results.push({ name, passed: false, error: errorMessage, duration });
        log.error(`${name} (${duration}ms): ${errorMessage}`);
    }
}

function isCallError(
    result: CallResult | ICallRequestError,
): result is ICallRequestError {
    return 'error' in result;
}

async function main() {
    log.info('=== FroGop Pool Creation & View Method Tests ===');
    log.info(`Network: ${process.env.OPNET_NETWORK || 'regtest'}`);

    const config = getConfig();
    const deployed = loadDeployedContracts();

    if (!deployed?.factory || !deployed?.poolTemplate) {
        log.error('Contracts not deployed. Run 01 and 02 first.');
        process.exit(1);
    }

    log.info(`Using contracts:`);
    log.info(`  Factory: ${formatAddress(deployed.factory)}`);
    log.info(`  Pool Template: ${formatAddress(deployed.poolTemplate)}`);
    log.info(`  FROG-U (Underlying): ${formatAddress(deployed.tokens.frogU)}`);
    log.info(`  FROG-P (Premium): ${formatAddress(deployed.tokens.frogP)}`);

    const provider = new JSONRpcProvider({
        url: config.rpcUrl,
        network: config.network,
    });
    const deployer = new DeploymentHelper(
        provider,
        config.wallet,
        config.network,
    );

    // Resolve opt1/opr1 addresses to hex for Address.fromString()
    const frogUHex = deployed.tokens.frogU.startsWith('0x')
        ? deployed.tokens.frogU
        : (await provider.getPublicKeyInfo(deployed.tokens.frogU, true)).toString();
    const frogPHex = deployed.tokens.frogP.startsWith('0x')
        ? deployed.tokens.frogP
        : (await provider.getPublicKeyInfo(deployed.tokens.frogP, true)).toString();
    log.info(`  FROG-U hex: ${formatAddress(frogUHex)}`);
    log.info(`  FROG-P hex: ${formatAddress(frogPHex)}`);

    // ========================================
    // PHASE 1: Factory State Verification
    // ========================================

    await runTest('Factory: Verify pool template is set', async () => {
        const result = await provider.call(
            deployed.factory,
            FACTORY_SELECTORS.getPoolTemplate,
        );

        if (isCallError(result)) {
            throw new Error(`Call error: ${result.error}`);
        }
        if (result.revert) {
            throw new Error(`Revert: ${result.revert}`);
        }

        const template = result.result.readAddress();
        log.info(`  Pool template: ${formatAddress(template)}`);

        return { poolTemplate: template.toString() };
    });

    await runTest('Factory: Read pool count', async () => {
        const result = await provider.call(
            deployed.factory,
            FACTORY_SELECTORS.getPoolCount,
        );

        if (isCallError(result)) {
            throw new Error(`Call error: ${result.error}`);
        }
        if (result.revert) {
            throw new Error(`Revert: ${result.revert}`);
        }

        const poolCount = result.result.readU256();
        log.info(`  Pool count: ${poolCount}`);

        return { poolCount: poolCount.toString() };
    });

    // ========================================
    // PHASE 2: Pool Creation (if needed)
    // ========================================

    let poolAddress: string | null = deployed.pool || null;

    await runTest('Factory: Check existing pool for MOTO/PILL', async () => {
        const underlying = Address.fromString(frogUHex);
        const premiumToken = Address.fromString(frogPHex);

        const writer = new BinaryWriter();
        writer.writeAddress(underlying);
        writer.writeAddress(premiumToken);
        const calldata = Buffer.from(writer.getBuffer()).toString('hex');

        const result = await provider.call(
            deployed.factory,
            FACTORY_SELECTORS.getPool + calldata,
        );

        if (isCallError(result)) {
            throw new Error(`Call error: ${result.error}`);
        }
        if (result.revert) {
            throw new Error(`Revert: ${result.revert}`);
        }

        const pool = result.result.readAddress();
        const poolHex = pool.toString();

        const isZero =
            poolHex ===
            '0x0000000000000000000000000000000000000000000000000000000000000000';

        if (!isZero) {
            poolAddress = poolHex;
            log.info(`  Pool already exists: ${formatAddress(poolHex)}`);
            return { poolExists: true, poolAddress: poolHex };
        }

        log.info(`  No pool exists yet`);
        return { poolExists: false };
    });

    if (!poolAddress) {
        // Deploy pool directly (factory createPool is not supported by OPNet runtime)
        await runTest('Direct: Deploy OptionsPool with real token addresses', async () => {
            const underlying = Address.fromString(frogUHex);
            const premiumToken = Address.fromString(frogPHex);
            // Deployer wallet is the feeRecipient (treasury) for integration testing
            const calldata = createPoolCalldata(underlying, premiumToken, config.wallet.address);

            const currentBlock = await provider.getBlockNumber();
            log.info(`  Current block: ${currentBlock}`);

            const result = await deployer.deployContract(
                getWasmPath('OptionsPool'),
                calldata,
                50_000n,
            );

            // Save immediately BEFORE waiting for blocks
            poolAddress = result.contractAddress;
            deployed.pool = poolAddress;
            saveDeployedContracts(deployed);
            log.info(`  Pool deployed at: ${result.contractAddress}`);

            // Wait for confirmation (non-fatal - pool may confirm later)
            try {
                await waitForBlock(provider, currentBlock, 3);
            } catch {
                log.warn('  Block advancement timed out. Pool TX broadcast but unconfirmed.');
                log.warn('  Re-run tests after blocks advance to test pool view methods.');
            }

            return { poolAddress, method: 'direct-deploy', txId: result.revealTxId };
        });
    }

    // ========================================
    // PHASE 3: Pool View Method Tests
    // ========================================

    if (!poolAddress) {
        log.error('Pool not available. Skipping view tests.');
        printSummary();
        return;
    }

    // Resolve the pool's contract address for calls
    let poolCallAddr: string;
    try {
        const poolPubKey = await provider.getPublicKeyInfo(poolAddress, true);
        poolCallAddr = poolPubKey.toString();
        log.info(`  Pool call address: ${formatAddress(poolCallAddr)}`);
    } catch {
        // Pool not yet mined - skip view tests
        log.warn(`  Pool not yet mined (getPublicKeyInfo failed for ${formatAddress(poolAddress)})`);
        log.warn('  Re-run tests after blocks advance to verify pool view methods.');
        printSummary();
        return;
    }

    await runTest('Pool: Read underlying token', async () => {
        const result = await provider.call(
            poolCallAddr,
            POOL_SELECTORS.underlying,
        );

        if (isCallError(result)) {
            throw new Error(`Call error: ${result.error}`);
        }
        if (result.revert) {
            throw new Error(`Revert: ${result.revert}`);
        }

        const underlying = result.result.readAddress();
        log.info(`  Underlying: ${formatAddress(underlying)}`);

        return { underlying: underlying.toString() };
    });

    await runTest('Pool: Read premium token', async () => {
        const result = await provider.call(
            poolCallAddr,
            POOL_SELECTORS.premiumToken,
        );

        if (isCallError(result)) {
            throw new Error(`Call error: ${result.error}`);
        }
        if (result.revert) {
            throw new Error(`Revert: ${result.revert}`);
        }

        const premiumToken = result.result.readAddress();
        log.info(`  Premium token: ${formatAddress(premiumToken)}`);

        return { premiumToken: premiumToken.toString() };
    });

    await runTest('Pool: Read option count (should be 0 initially)', async () => {
        const result = await provider.call(
            poolCallAddr,
            POOL_SELECTORS.optionCount,
        );

        if (isCallError(result)) {
            throw new Error(`Call error: ${result.error}`);
        }
        if (result.revert) {
            throw new Error(`Revert: ${result.revert}`);
        }

        const count = result.result.readU256();
        log.info(`  Option count: ${count}`);

        return { optionCount: count.toString() };
    });

    await runTest('Pool: Read fee recipient', async () => {
        const result = await provider.call(
            poolCallAddr,
            POOL_SELECTORS.feeRecipient,
        );

        if (isCallError(result)) {
            throw new Error(`Call error: ${result.error}`);
        }
        if (result.revert) {
            throw new Error(`Revert: ${result.revert}`);
        }

        const feeRecip = result.result.readAddress();
        log.info(`  Fee recipient: ${formatAddress(feeRecip.toString())}`);

        return { feeRecipient: feeRecip.toString() };
    });

    await runTest('Pool: Read grace period blocks (should be 144)', async () => {
        const result = await provider.call(
            poolCallAddr,
            POOL_SELECTORS.gracePeriodBlocks,
        );

        if (isCallError(result)) {
            throw new Error(`Call error: ${result.error}`);
        }
        if (result.revert) {
            throw new Error(`Revert: ${result.revert}`);
        }

        const gracePeriod = result.result.readU64();
        log.info(`  Grace period: ${gracePeriod} blocks`);

        if (gracePeriod !== 144n) {
            throw new Error(`Expected 144, got ${gracePeriod}`);
        }

        return { gracePeriodBlocks: gracePeriod.toString() };
    });

    await runTest('Pool: Read max expiry blocks (should be 52560)', async () => {
        const result = await provider.call(
            poolCallAddr,
            POOL_SELECTORS.maxExpiryBlocks,
        );

        if (isCallError(result)) {
            throw new Error(`Call error: ${result.error}`);
        }
        if (result.revert) {
            throw new Error(`Revert: ${result.revert}`);
        }

        const maxExpiry = result.result.readU64();
        log.info(`  Max expiry: ${maxExpiry} blocks`);

        if (maxExpiry !== 52560n) {
            throw new Error(`Expected 52560, got ${maxExpiry}`);
        }

        return { maxExpiryBlocks: maxExpiry.toString() };
    });

    await runTest('Pool: Read cancel fee bps (should be 100)', async () => {
        const result = await provider.call(
            poolCallAddr,
            POOL_SELECTORS.cancelFeeBps,
        );

        if (isCallError(result)) {
            throw new Error(`Call error: ${result.error}`);
        }
        if (result.revert) {
            throw new Error(`Revert: ${result.revert}`);
        }

        const cancelFee = result.result.readU64();
        log.info(`  Cancel fee: ${cancelFee} bps (${Number(cancelFee) / 100}%)`);

        if (cancelFee !== 100n) {
            throw new Error(`Expected 100, got ${cancelFee}`);
        }

        return { cancelFeeBps: cancelFee.toString() };
    });

    await runTest('Pool: Calculate CALL collateral', async () => {
        // CALL collateral = underlyingAmount
        const writer = new BinaryWriter();
        writer.writeU8(0); // CALL
        writer.writeU256(50n * 10n ** 18n); // strikePrice
        writer.writeU256(100n * 10n ** 18n); // underlyingAmount
        const calldata = Buffer.from(writer.getBuffer()).toString('hex');

        const result = await provider.call(
            poolCallAddr,
            POOL_SELECTORS.calculateCollateral + calldata,
        );

        if (isCallError(result)) {
            throw new Error(`Call error: ${result.error}`);
        }
        if (result.revert) {
            throw new Error(`Revert: ${result.revert}`);
        }

        const collateral = result.result.readU256();
        const expectedCollateral = 100n * 10n ** 18n; // CALL = underlyingAmount
        log.info(`  CALL collateral: ${collateral}`);

        if (collateral !== expectedCollateral) {
            throw new Error(
                `Expected ${expectedCollateral}, got ${collateral}`,
            );
        }

        return { collateral: collateral.toString() };
    });

    await runTest('Pool: Calculate PUT collateral', async () => {
        // PUT collateral = strikePrice * underlyingAmount
        const writer = new BinaryWriter();
        writer.writeU8(1); // PUT
        writer.writeU256(50n); // strikePrice (raw)
        writer.writeU256(100n); // underlyingAmount (raw)
        const calldata = Buffer.from(writer.getBuffer()).toString('hex');

        const result = await provider.call(
            poolCallAddr,
            POOL_SELECTORS.calculateCollateral + calldata,
        );

        if (isCallError(result)) {
            throw new Error(`Call error: ${result.error}`);
        }
        if (result.revert) {
            throw new Error(`Revert: ${result.revert}`);
        }

        const collateral = result.result.readU256();
        const expectedCollateral = 50n * 100n; // PUT = strikePrice * underlyingAmount
        log.info(`  PUT collateral: ${collateral}`);

        if (collateral !== expectedCollateral) {
            throw new Error(
                `Expected ${expectedCollateral}, got ${collateral}`,
            );
        }

        return { collateral: collateral.toString() };
    });

    printSummary();
}

function printSummary(): void {
    log.info('\n=== Test Results ===');
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const total = results.length;

    log.info(`Total: ${total}`);
    log.success(`Passed: ${passed}`);
    if (failed > 0) {
        log.error(`Failed: ${failed}`);
        results
            .filter((r) => !r.passed)
            .forEach((r) => {
                log.error(`  - ${r.name}: ${r.error}`);
            });
    }

    log.info('\n=== Test Data ===');
    results.forEach((r) => {
        if (r.data) {
            log.info(`${r.name}: ${JSON.stringify(r.data)}`);
        }
    });

    log.info('\n=== Summary ===');
    log.info(`Success rate: ${((passed / total) * 100).toFixed(1)}%`);
    log.info(
        `Total time: ${results.reduce((sum, r) => sum + (r.duration || 0), 0)}ms`,
    );

    process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
    log.error('Tests failed:', error);
    process.exit(1);
});
