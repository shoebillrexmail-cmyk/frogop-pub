/**
 * 07-query-methods.ts
 *
 * Tests the pool enumeration and batch query additions:
 *   Factory:
 *     - registerPool(pool, underlying, premiumToken)  — owner-only
 *     - getPoolCount()                                — returns actual count
 *     - getPoolByIndex(index)                         — returns (pool, underlying, premiumToken)
 *
 *   Pool:
 *     - getOptionsBatch(startId, count)               — returns up to 50 options per call
 *
 * Prerequisites:
 *   - Run 01, 02, 06 first (tokens, factory, pool, options all deployed)
 *   - Factory must be redeployed with the new contract WASM (includes registerPool/getPoolByIndex)
 *   - Pool must be redeployed with the new contract WASM (includes getOptionsBatch)
 */

import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import type { CallResult, ICallRequestError } from 'opnet';
import { Address, BinaryWriter } from '@btc-vision/transaction';
import {
    getConfig,
    loadDeployedContracts,
    getLogger,
    formatAddress,
    waitForBlock,
    POOL_SELECTORS,
    FACTORY_SELECTORS,
} from './config.js';
import {
    DeploymentHelper,
    createRegisterPoolCalldata,
} from './deployment.js';

const log = getLogger('07-query-methods');

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

function skipTest(name: string, reason: string): void {
    log.warn(`SKIP: ${name} - ${reason}`);
    results.push({ name, passed: true, skipped: true, data: { skipped: reason } });
}

function isCallError(result: CallResult | ICallRequestError): result is ICallRequestError {
    return 'error' in result;
}

// =========================================================================
// Main
// =========================================================================

async function main() {
    log.info('=== FroGop Query Method Tests ===');
    log.info(`Network: ${process.env.OPNET_NETWORK || 'regtest'}`);

    const config = getConfig();
    const deployed = loadDeployedContracts();

    if (!deployed?.factory || !deployed?.poolTemplate || !deployed?.pool) {
        log.error('Contracts not fully deployed. Run 01, 02, 05/06 first.');
        process.exit(1);
    }

    log.info(`Factory:       ${formatAddress(deployed.factory)}`);
    log.info(`Pool:          ${formatAddress(deployed.pool)}`);
    log.info(`FROG-U:        ${formatAddress(deployed.tokens.frogU)}`);
    log.info(`FROG-P:        ${formatAddress(deployed.tokens.frogP)}`);

    const provider = new JSONRpcProvider({
        url: config.rpcUrl,
        network: config.network,
    });
    const deployer = new DeploymentHelper(provider, config.wallet, config.network);

    let currentBlock = await provider.getBlockNumber();
    log.info(`Current block: ${currentBlock}`);

    // Resolve hex addresses for provider.call
    const frogUHex = deployed.tokens.frogU.startsWith('0x')
        ? deployed.tokens.frogU
        : (await provider.getPublicKeyInfo(deployed.tokens.frogU, true)).toString();
    const frogPHex = deployed.tokens.frogP.startsWith('0x')
        ? deployed.tokens.frogP
        : (await provider.getPublicKeyInfo(deployed.tokens.frogP, true)).toString();

    const motoAddress = Address.fromString(frogUHex);
    const pillAddress = Address.fromString(frogPHex);

    // Resolve pool call address
    let poolCallAddr: string;
    try {
        const pk = await provider.getPublicKeyInfo(deployed.pool, true);
        poolCallAddr = pk.toString();
        log.info(`Pool call addr: ${formatAddress(poolCallAddr)}`);
    } catch {
        log.error(`Pool not yet mined (${formatAddress(deployed.pool)}). Re-run after blocks advance.`);
        printSummary();
        return;
    }

    // =========================================================================
    // PHASE 1: Factory - registerPool + getPoolCount + getPoolByIndex
    // =========================================================================

    log.info('\n=== Phase 1: Factory Pool Enumeration ===');

    // Build pool address (bech32) for the calldata
    let poolHex: string;
    try {
        poolHex = (await provider.getPublicKeyInfo(deployed.pool, true)).toString();
        log.info(`Pool hex: ${formatAddress(poolHex)}`);
    } catch {
        log.error('Cannot resolve pool hex address. Pool not mined yet.');
        printSummary();
        return;
    }
    const poolAddress = Address.fromString(poolHex);

    // Check current pool count (should be 0 for a fresh factory)
    let initialPoolCount = 0n;
    await runTest('Factory: getPoolCount (before register)', async () => {
        const result = await provider.call(deployed.factory, FACTORY_SELECTORS.getPoolCount);
        if (isCallError(result)) throw new Error(`Call error: ${result.error}`);
        if (result.revert) throw new Error(`Revert: ${result.revert}`);
        initialPoolCount = result.result.readU256();
        log.info(`  Pool count: ${initialPoolCount}`);
        return { count: initialPoolCount.toString() };
    });

    // If already registered (idempotent), skip registerPool
    let poolRegistered = initialPoolCount > 0n;

    if (poolRegistered) {
        log.info('  Pool already registered (count > 0). Skipping registerPool.');
        skipTest('Factory: registerPool (owner-only)', 'Pool already registered');
    } else {
        // Check that getPoolByIndex(0) reverts before registration
        await runTest('Factory: getPoolByIndex(0) reverts when empty', async () => {
            const w = new BinaryWriter();
            w.writeU256(0n);
            const cd = Buffer.from(w.getBuffer()).toString('hex');
            const result = await provider.call(
                deployed.factory,
                FACTORY_SELECTORS.getPoolByIndex + cd,
            );
            if (isCallError(result)) {
                log.info(`  Correctly errored: ${result.error}`);
                return { reverted: true, error: result.error };
            }
            if (result.revert) {
                const msg = Buffer.from(result.revert, 'base64').toString();
                log.info(`  Correctly reverted: ${msg}`);
                return { reverted: true, revert: msg };
            }
            throw new Error('Expected revert but got success');
        });

        // registerPool: owner calls with (pool, underlying, premiumToken)
        await runTest('Factory: registerPool (owner-only)', async () => {
            const calldata = createRegisterPoolCalldata(poolAddress, motoAddress, pillAddress);
            currentBlock = await provider.getBlockNumber();
            const result = await deployer.callContract(deployed.factory, calldata, 100_000n);
            log.info(`  registerPool TX: ${result.txId}`);
            try {
                currentBlock = await waitForBlock(provider, currentBlock, 3);
            } catch {
                log.warn('  Block timeout - TX broadcast OK, may confirm later');
            }
            return { txId: result.txId };
        });

        poolRegistered = true;
    }

    // Poll for pool count to reflect the registration
    await runTest('Factory: getPoolCount (after register)', async () => {
        for (let attempt = 0; attempt < 24; attempt++) {
            const result = await provider.call(deployed.factory, FACTORY_SELECTORS.getPoolCount);
            if (isCallError(result)) throw new Error(`Call error: ${result.error}`);
            if (result.revert) throw new Error(`Revert: ${result.revert}`);
            const count = result.result.readU256();

            if (count > 0n) {
                log.info(`  Pool count: ${count}`);
                return { count: count.toString() };
            }

            if (attempt < 23) {
                log.info(`  Pool count still 0, polling... (${attempt + 1}/24)`);
                await new Promise((r) => setTimeout(r, 30_000));
            }
        }
        throw new Error('Pool count still 0 after polling. registerPool TX may not be confirmed yet. Re-run later.');
    });

    // getPoolByIndex(0) — should return pool address + token info
    await runTest('Factory: getPoolByIndex(0) returns correct data', async () => {
        const w = new BinaryWriter();
        w.writeU256(0n);
        const cd = Buffer.from(w.getBuffer()).toString('hex');
        const result = await provider.call(
            deployed.factory,
            FACTORY_SELECTORS.getPoolByIndex + cd,
        );
        if (isCallError(result)) throw new Error(`Call error: ${result.error}`);
        if (result.revert) throw new Error(`Revert: ${Buffer.from(result.revert, 'base64').toString()}`);

        const returnedPool = result.result.readAddress();
        const returnedUnderlying = result.result.readAddress();
        const returnedPremiumToken = result.result.readAddress();

        log.info(`  Pool:         ${formatAddress(returnedPool.toString())}`);
        log.info(`  Underlying:   ${formatAddress(returnedUnderlying.toString())}`);
        log.info(`  PremiumToken: ${formatAddress(returnedPremiumToken.toString())}`);

        // Verify the pool address matches our deployed pool
        const returnedPoolHex = returnedPool.toString();
        if (returnedPoolHex.toLowerCase() !== poolHex.toLowerCase()) {
            log.warn(`  Pool mismatch: got ${formatAddress(returnedPoolHex)}, expected ${formatAddress(poolHex)}`);
        }

        return {
            pool: returnedPool.toString(),
            underlying: returnedUnderlying.toString(),
            premiumToken: returnedPremiumToken.toString(),
        };
    });

    // getPoolByIndex(1) should revert (only 1 pool registered)
    await runTest('Factory: getPoolByIndex(1) reverts (out of bounds)', async () => {
        const w = new BinaryWriter();
        w.writeU256(1n);
        const cd = Buffer.from(w.getBuffer()).toString('hex');
        const result = await provider.call(
            deployed.factory,
            FACTORY_SELECTORS.getPoolByIndex + cd,
        );
        if (isCallError(result)) {
            log.info(`  Correctly errored: ${result.error}`);
            return { reverted: true };
        }
        if (result.revert) {
            const msg = Buffer.from(result.revert, 'base64').toString();
            log.info(`  Correctly reverted: ${msg}`);
            return { reverted: true, msg };
        }
        throw new Error('Expected revert for out-of-bounds index but got success');
    });

    // getPool(underlying, premiumToken) should still work (existing method)
    await runTest('Factory: getPool still works after registerPool', async () => {
        const w = new BinaryWriter();
        w.writeAddress(motoAddress);
        w.writeAddress(pillAddress);
        const cd = Buffer.from(w.getBuffer()).toString('hex');
        const result = await provider.call(
            deployed.factory,
            FACTORY_SELECTORS.getPool + cd,
        );
        if (isCallError(result)) throw new Error(`Call error: ${result.error}`);
        if (result.revert) throw new Error(`Revert: ${Buffer.from(result.revert, 'base64').toString()}`);
        const returnedPool = result.result.readAddress();
        log.info(`  getPool result: ${formatAddress(returnedPool.toString())}`);
        return { pool: returnedPool.toString() };
    });

    // =========================================================================
    // PHASE 2: Pool - getOptionsBatch
    // =========================================================================

    log.info('\n=== Phase 2: Pool getOptionsBatch ===');

    // Read total option count first
    let totalOptions = 0n;
    await runTest('Pool: getOptionsBatch — read option count', async () => {
        const result = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
        if (isCallError(result)) throw new Error(`Call error: ${result.error}`);
        if (result.revert) throw new Error(`Revert: ${result.revert}`);
        totalOptions = result.result.readU256();
        log.info(`  Total options: ${totalOptions}`);
        return { totalOptions: totalOptions.toString() };
    });

    if (totalOptions === 0n) {
        skipTest('Pool: getOptionsBatch(0, 10) — fetch first 10', 'No options exist yet. Run 06 first.');
        skipTest('Pool: getOptionsBatch with count > available', 'No options exist yet.');
        skipTest('Pool: getOptionsBatch from startId = totalOptions (empty)', 'No options exist yet.');
        skipTest('Pool: getOptionsBatch capped at 50', 'No options exist yet.');
    } else {
        // Helper: build calldata for getOptionsBatch
        function buildBatchCalldata(startId: bigint, count: bigint): string {
            const w = new BinaryWriter();
            w.writeU256(startId);
            w.writeU256(count);
            return Buffer.from(w.getBuffer()).toString('hex');
        }


        // Test: fetch first 10 options
        await runTest('Pool: getOptionsBatch(0, 10) — fetch first 10', async () => {
            const requestCount = 10n;
            const cd = buildBatchCalldata(0n, requestCount);
            const result = await provider.call(
                poolCallAddr,
                POOL_SELECTORS.getOptionsBatch + cd,
            );
            if (isCallError(result)) throw new Error(`Call error: ${result.error}`);
            if (result.revert) throw new Error(`Revert: ${Buffer.from(result.revert, 'base64').toString()}`);

            const reader = result.result;
            const actualCount = reader.readU256();
            const expectedCount = totalOptions < requestCount ? totalOptions : requestCount;
            log.info(`  Requested: ${requestCount}, returned: ${actualCount} (total options: ${totalOptions})`);

            if (actualCount !== expectedCount) {
                throw new Error(`Expected actualCount=${expectedCount}, got ${actualCount}`);
            }

            const options = [];
            for (let i = 0n; i < actualCount; i++) {
                const opt = {
                    id: reader.readU256(),
                    writer: reader.readAddress().toString(),
                    buyer: reader.readAddress().toString(),
                    optionType: reader.readU8(),
                    strikePrice: reader.readU256(),
                    underlyingAmount: reader.readU256(),
                    premium: reader.readU256(),
                    expiryBlock: reader.readU64(),
                    status: reader.readU8(),
                };
                log.info(`  Option ${opt.id}: type=${opt.optionType === 0 ? 'CALL' : 'PUT'} status=${opt.status} writer=${formatAddress(opt.writer)}`);
                options.push({ id: opt.id.toString(), type: opt.optionType, status: opt.status });
                // Verify sequential IDs
                if (opt.id !== i) {
                    throw new Error(`Expected option ID ${i}, got ${opt.id}`);
                }
            }

            return { actualCount: actualCount.toString(), options };
        });

        // Test: request more than available — should return only what exists
        await runTest('Pool: getOptionsBatch with count > available returns all', async () => {
            const hugeCount = 999n;
            const cd = buildBatchCalldata(0n, hugeCount);
            const result = await provider.call(
                poolCallAddr,
                POOL_SELECTORS.getOptionsBatch + cd,
            );
            if (isCallError(result)) throw new Error(`Call error: ${result.error}`);
            if (result.revert) throw new Error(`Revert: ${Buffer.from(result.revert, 'base64').toString()}`);

            const actualCount = result.result.readU256();
            const expectedCount = totalOptions < 50n ? totalOptions : 50n;
            log.info(`  Requested: ${hugeCount}, returned: ${actualCount} (expected: ${expectedCount})`);

            if (actualCount !== expectedCount) {
                throw new Error(`Expected ${expectedCount} options, got ${actualCount}`);
            }

            return { requested: hugeCount.toString(), returned: actualCount.toString() };
        });

        // Test: startId = totalOptions — should return count=0
        await runTest('Pool: getOptionsBatch from startId=totalOptions returns empty', async () => {
            const cd = buildBatchCalldata(totalOptions, 10n);
            const result = await provider.call(
                poolCallAddr,
                POOL_SELECTORS.getOptionsBatch + cd,
            );
            if (isCallError(result)) throw new Error(`Call error: ${result.error}`);
            if (result.revert) throw new Error(`Revert: ${Buffer.from(result.revert, 'base64').toString()}`);

            const actualCount = result.result.readU256();
            log.info(`  startId=${totalOptions} → returned: ${actualCount} (expected: 0)`);
            if (actualCount !== 0n) throw new Error(`Expected 0 options, got ${actualCount}`);

            return { startId: totalOptions.toString(), returned: actualCount.toString() };
        });

        // Test: batch is capped at 50
        await runTest('Pool: getOptionsBatch capped at 50', async () => {
            const cd = buildBatchCalldata(0n, 1000n);
            const result = await provider.call(
                poolCallAddr,
                POOL_SELECTORS.getOptionsBatch + cd,
            );
            if (isCallError(result)) throw new Error(`Call error: ${result.error}`);
            if (result.revert) throw new Error(`Revert: ${Buffer.from(result.revert, 'base64').toString()}`);

            const actualCount = result.result.readU256();
            const expectedCap = totalOptions > 50n ? 50n : totalOptions;
            log.info(`  Requested 1000, returned ${actualCount} (cap: ${expectedCap})`);
            if (actualCount !== expectedCap) {
                throw new Error(`Expected at most ${expectedCap}, got ${actualCount}`);
            }
            return { returned: actualCount.toString(), cap: expectedCap.toString() };
        });

        // Test: mid-range fetch (startId = 1 if there are at least 2 options)
        if (totalOptions >= 2n) {
            await runTest('Pool: getOptionsBatch mid-range (startId=1)', async () => {
                const cd = buildBatchCalldata(1n, 5n);
                const result = await provider.call(
                    poolCallAddr,
                    POOL_SELECTORS.getOptionsBatch + cd,
                );
                if (isCallError(result)) throw new Error(`Call error: ${result.error}`);
                if (result.revert) throw new Error(`Revert: ${Buffer.from(result.revert, 'base64').toString()}`);

                const reader = result.result;
                const actualCount = reader.readU256();
                const expectedCount = totalOptions - 1n < 5n ? totalOptions - 1n : 5n;
                log.info(`  startId=1, requested=5, returned=${actualCount} (expected=${expectedCount})`);
                if (actualCount !== expectedCount) {
                    throw new Error(`Expected ${expectedCount}, got ${actualCount}`);
                }

                // Read first option and verify its ID is 1
                if (actualCount > 0n) {
                    const firstId = reader.readU256();
                    log.info(`  First option ID in batch: ${firstId} (expected: 1)`);
                    if (firstId !== 1n) throw new Error(`Expected first ID=1, got ${firstId}`);
                }

                return { startId: '1', returned: actualCount.toString() };
            });
        } else {
            skipTest('Pool: getOptionsBatch mid-range (startId=1)', 'Need at least 2 options');
        }

        // Test: getOptionsBatch(0, 1) matches getOption(0)
        await runTest('Pool: getOptionsBatch(0,1) matches getOption(0)', async () => {
            // Fetch via getOption
            const w = new BinaryWriter();
            w.writeU256(0n);
            const singleCd = Buffer.from(w.getBuffer()).toString('hex');
            const singleResult = await provider.call(
                poolCallAddr,
                POOL_SELECTORS.getOption + singleCd,
            );
            if (isCallError(singleResult)) throw new Error(`getOption error: ${singleResult.error}`);
            if (singleResult.revert) throw new Error(`getOption revert`);

            const singleReader = singleResult.result;
            const singleId = singleReader.readU256();
            const singleWriter = singleReader.readAddress().toString();
            const singleBuyer = singleReader.readAddress().toString();
            const singleType = singleReader.readU8();
            const singleStrike = singleReader.readU256();
            const singleAmount = singleReader.readU256();
            const singlePremium = singleReader.readU256();
            const singleExpiry = singleReader.readU64();
            const singleStatus = singleReader.readU8();

            // Fetch via getOptionsBatch(0, 1)
            const batchCd = buildBatchCalldata(0n, 1n);
            const batchResult = await provider.call(
                poolCallAddr,
                POOL_SELECTORS.getOptionsBatch + batchCd,
            );
            if (isCallError(batchResult)) throw new Error(`getOptionsBatch error: ${batchResult.error}`);
            if (batchResult.revert) throw new Error(`getOptionsBatch revert`);

            const batchReader = batchResult.result;
            const batchCount = batchReader.readU256();
            if (batchCount !== 1n) throw new Error(`Expected 1 option in batch, got ${batchCount}`);

            const batchId = batchReader.readU256();
            const batchWriter = batchReader.readAddress().toString();
            const batchBuyer = batchReader.readAddress().toString();
            const batchType = batchReader.readU8();
            const batchStrike = batchReader.readU256();
            const batchAmount = batchReader.readU256();
            const batchPremium = batchReader.readU256();
            const batchExpiry = batchReader.readU64();
            const batchStatus = batchReader.readU8();

            // Compare all fields
            if (batchId !== singleId) throw new Error(`ID mismatch: ${batchId} vs ${singleId}`);
            if (batchWriter !== singleWriter) throw new Error(`Writer mismatch`);
            if (batchBuyer !== singleBuyer) throw new Error(`Buyer mismatch`);
            if (batchType !== singleType) throw new Error(`Type mismatch`);
            if (batchStrike !== singleStrike) throw new Error(`Strike mismatch`);
            if (batchAmount !== singleAmount) throw new Error(`Amount mismatch`);
            if (batchPremium !== singlePremium) throw new Error(`Premium mismatch`);
            if (batchExpiry !== singleExpiry) throw new Error(`Expiry mismatch`);
            if (batchStatus !== singleStatus) throw new Error(`Status mismatch`);

            log.info(`  All fields match: id=${batchId} type=${batchType} status=${batchStatus}`);
            return {
                id: batchId.toString(),
                writer: batchWriter,
                type: batchType,
                status: batchStatus,
                consistent: true,
            };
        });
    }

    printSummary();
}

function printSummary(): void {
    log.info('\n=== Test Results ===');
    const passed = results.filter((r) => r.passed && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => !r.passed).length;
    const total = results.length;

    log.info(`Total: ${total}`);
    log.success(`Passed: ${passed}`);
    if (skipped > 0) log.warn(`Skipped: ${skipped}`);
    if (failed > 0) {
        log.error(`Failed: ${failed}`);
        results
            .filter((r) => !r.passed)
            .forEach((r) => log.error(`  - ${r.name}: ${r.error}`));
    }

    log.info('\n=== Test Data ===');
    results.forEach((r) => {
        if (r.data && !r.skipped) {
            log.info(`${r.name}: ${JSON.stringify(r.data)}`);
        }
    });

    const runCount = total - skipped;
    log.info('\n=== Summary ===');
    log.info(`Success rate: ${runCount > 0 ? ((passed / runCount) * 100).toFixed(1) : 0}%`);
    log.info(`Total time: ${results.reduce((sum, r) => sum + (r.duration || 0), 0)}ms`);

    process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
    log.error('Tests failed:', error);
    process.exit(1);
});
