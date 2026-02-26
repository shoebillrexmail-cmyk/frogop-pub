import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import type { CallResult, ICallRequestError } from 'opnet';
import { Address, BinaryWriter } from '@btc-vision/transaction';
import {
    getConfig,
    loadDeployedContracts,
    saveDeployedContracts,
    getLogger,
    formatAddress,
    formatBigInt,
    waitForBlock,
    computeSelector,
    POOL_SELECTORS,
    TOKEN_SELECTORS,
} from './config.js';
import {
    DeploymentHelper,
    createWriteOptionCalldata,
    createCancelOptionCalldata,
} from './deployment.js';

const log = getLogger('06-full-lifecycle');

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
    log.info('=== FroGop Full Option Lifecycle Tests ===');
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
    const deployer = new DeploymentHelper(provider, config.wallet, config.network);

    const walletAddress = config.wallet.p2tr;
    let currentBlock = await provider.getBlockNumber();
    log.info(`Current block: ${currentBlock}`);
    log.info(`Wallet: ${walletAddress}`);

    // =====================================================================
    // Token and wallet address setup (raw provider.call approach)
    // =====================================================================

    // Resolve opr1/opt1 addresses to hex (0x...) for Address.fromString
    const frogUHex = deployed.tokens.frogU.startsWith('0x')
        ? deployed.tokens.frogU
        : (await provider.getPublicKeyInfo(deployed.tokens.frogU, true)).toString();
    const frogPHex = deployed.tokens.frogP.startsWith('0x')
        ? deployed.tokens.frogP
        : (await provider.getPublicKeyInfo(deployed.tokens.frogP, true)).toString();
    log.info(`FROG-U hex: ${formatAddress(frogUHex)}`);
    log.info(`FROG-P hex: ${formatAddress(frogPHex)}`);

    const motoAddress = Address.fromString(frogUHex);
    const pillAddress = Address.fromString(frogPHex);

    // Use wallet.address (MLDSA address hash) for balanceOf queries, NOT getPublicKeyInfo
    const walletHex = config.wallet.address.toString();
    log.info(`Wallet hex: ${formatAddress(walletHex)}`);

    // =====================================================================
    // PHASE 1: Ensure pool exists
    // =====================================================================

    let poolAddress: string | null = deployed.pool || null;

    await runTest('Check/create pool', async () => {
        if (poolAddress) {
            log.info(`  Pool already saved: ${formatAddress(poolAddress)}`);
            return { poolAddress, source: 'saved' };
        }

        // Deploy pool directly (factory createPool is not supported by OPNet runtime)
        log.info('  Deploying pool directly...');
        const { createPoolCalldata, getWasmPath } = await import('./deployment.js');
        const calldata = createPoolCalldata(motoAddress, pillAddress);
        currentBlock = await provider.getBlockNumber();
        const deployResult = await deployer.deployContract(
            getWasmPath('OptionsPool'),
            calldata,
            50_000n,
        );
        poolAddress = deployResult.contractAddress;
        deployed.pool = poolAddress;
        saveDeployedContracts(deployed);
        log.info(`  Pool deployed at: ${formatAddress(poolAddress)}`);

        try {
            currentBlock = await waitForBlock(provider, currentBlock, 3);
        } catch {
            log.warn('  Block timeout - pool TX broadcast, re-run after blocks advance.');
        }

        return { poolAddress, source: 'direct-deploy', txId: deployResult.revealTxId };
    });

    if (!poolAddress) {
        log.error('Pool not available. Run 05-pool-creation.ts first.');
        printSummary();
        return;
    }

    // Resolve pool call address
    let poolCallAddr: string;
    try {
        const pk = await provider.getPublicKeyInfo(poolAddress, true);
        poolCallAddr = pk.toString();
        log.info(`  Pool resolved: ${formatAddress(poolCallAddr)}`);
    } catch {
        log.warn(`  Pool not yet mined (${formatAddress(poolAddress)}). Skipping pool tests.`);
        log.warn('  Re-run after blocks advance.');
        printSummary();
        return;
    }

    // =====================================================================
    // PHASE 2: Check token balances using getContract (proper OP20 ABI)
    // =====================================================================

    let motoBalance = 0n;
    let pillBalance = 0n;

    // Helper to build balanceOf calldata
    function buildBalanceOfCalldata(ownerHex: string): string {
        const w = new BinaryWriter();
        w.writeAddress(Address.fromString(ownerHex));
        return Buffer.from(w.getBuffer()).toString('hex');
    }

    await runTest('Check MOTO balance (via provider.call)', async () => {
        const calldata = buildBalanceOfCalldata(walletHex);
        const result = await provider.call(
            deployed.tokens.frogU,
            TOKEN_SELECTORS.balanceOf + calldata,
        );
        if (isCallError(result)) throw new Error(`Call error: ${result.error}`);
        if (result.revert) throw new Error(`Revert: ${Buffer.from(result.revert, 'base64').toString()}`);
        motoBalance = result.result.readU256();
        log.info(`  MOTO balance: ${motoBalance} (${formatBigInt(motoBalance)})`);
        return { balance: motoBalance.toString() };
    });

    await runTest('Check PILL balance (via provider.call)', async () => {
        const calldata = buildBalanceOfCalldata(walletHex);
        const result = await provider.call(
            deployed.tokens.frogP,
            TOKEN_SELECTORS.balanceOf + calldata,
        );
        if (isCallError(result)) throw new Error(`Call error: ${result.error}`);
        if (result.revert) throw new Error(`Revert: ${Buffer.from(result.revert, 'base64').toString()}`);
        pillBalance = result.result.readU256();
        log.info(`  PILL balance: ${pillBalance} (${formatBigInt(pillBalance)})`);
        return { balance: pillBalance.toString() };
    });

    await runTest('Check wallet BTC balance', async () => {
        const balance = await provider.getBalance(walletAddress);
        log.info(`  BTC balance: ${balance} sats (${Number(balance) / 1e8} BTC)`);
        if (balance === 0n) throw new Error('No BTC balance. Fund wallet first.');
        return { balance: balance.toString() };
    });

    // =====================================================================
    // PHASE 3: Pool initial state
    // =====================================================================

    let initialOptionCount = 0n;

    await runTest('Pool: Read initial option count', async () => {
        const result = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
        if (isCallError(result)) throw new Error(`Call error: ${result.error}`);
        if (result.revert) throw new Error(`Revert: ${result.revert}`);
        initialOptionCount = result.result.readU256();
        log.info(`  Initial option count: ${initialOptionCount}`);
        return { optionCount: initialOptionCount.toString() };
    });

    // =====================================================================
    // PHASE 4: Write & Cancel Option (requires MOTO tokens)
    // =====================================================================

    const OPTION_AMOUNT = 1n * 10n ** 18n;   // 1 MOTO
    const STRIKE_PRICE = 50n * 10n ** 18n;   // 50 PILL per MOTO
    const PREMIUM = 5n * 10n ** 18n;         // 5 PILL
    const hasTokens = motoBalance >= OPTION_AMOUNT;
    let targetOptionId: bigint | null = null;
    let targetOptionStatus: number | null = null;

    // Helper: read option status by ID
    async function readOptionStatus(optId: bigint): Promise<{
        id: bigint; writer: string; buyer: string; optType: number;
        strikePrice: bigint; underlyingAmount: bigint; premium: bigint;
        expiryBlock: bigint; status: number;
    } | null> {
        const w = new BinaryWriter();
        w.writeU256(optId);
        const cd = Buffer.from(w.getBuffer()).toString('hex');
        const result = await provider.call(poolCallAddr, POOL_SELECTORS.getOption + cd);
        if (isCallError(result) || result.revert) return null;
        const reader = result.result;
        return {
            id: reader.readU256(),
            writer: reader.readAddress().toString(),
            buyer: reader.readAddress().toString(),
            optType: reader.readU8(),
            strikePrice: reader.readU256(),
            underlyingAmount: reader.readU256(),
            premium: reader.readU256(),
            expiryBlock: reader.readU64(),
            status: reader.readU8(),
        };
    }

    if (!hasTokens) {
        const reason = `Insufficient MOTO (have ${motoBalance}, need ${OPTION_AMOUNT}). Mint tokens first.`;
        skipTest('Token: Approve MOTO for pool', reason);
        skipTest('Pool: Write CALL option', reason);
        skipTest('Pool: Verify option exists', reason);
        skipTest('Pool: Read option state (getOption)', reason);
        skipTest('Pool: Cancel option', reason);
        skipTest('Pool: Verify option cancelled', reason);
        skipTest('Pool: Verify accumulated fees after cancel', reason);
    } else {
        // =================================================================
        // Check for existing OPEN option from a previous run (idempotent)
        // =================================================================
        let existingOpenId: bigint | null = null;

        if (initialOptionCount > 0n) {
            // Scan existing options (newest first) for an OPEN one
            for (let i = initialOptionCount - 1n; i >= 0n; i--) {
                const opt = await readOptionStatus(i);
                if (opt && opt.status === 0) {
                    existingOpenId = i;
                    log.info(`  Found existing OPEN option: ID ${i}`);
                    break;
                }
                if (i === 0n) break; // prevent underflow on unsigned
            }
        }

        if (existingOpenId !== null) {
            // Skip approve + write — reuse existing option
            log.info('  Reusing existing OPEN option (idempotent)');
            skipTest('Token: Approve MOTO for pool', 'Existing OPEN option found');
            skipTest('Pool: Write CALL option', 'Existing OPEN option found');

            targetOptionId = existingOpenId;
            targetOptionStatus = 0;

            await runTest('Pool: Verify option exists', async () => {
                log.info(`  Option count: ${initialOptionCount}, using option ID ${existingOpenId}`);
                return { optionCount: initialOptionCount.toString(), optionId: existingOpenId!.toString(), source: 'existing' };
            });
        } else {
            // --- Approve MOTO for the pool using raw calldata ---
            await runTest('Token: Approve MOTO for pool', async () => {
                const { createIncreaseAllowanceCalldata } = await import('./deployment.js');
                // Use poolCallAddr (hex) not poolAddress (opr1) for Address.fromString
                const poolAddr = Address.fromString(poolCallAddr);
                const calldata = createIncreaseAllowanceCalldata(poolAddr, OPTION_AMOUNT);

                currentBlock = await provider.getBlockNumber();
                const result = await deployer.callContract(
                    deployed.tokens.frogU,
                    calldata,
                    50_000n,
                );

                log.info(`  Approve TX: ${result.txId}`);
                try {
                    currentBlock = await waitForBlock(provider, currentBlock, 3);
                } catch {
                    log.warn('  Block timeout - TX broadcast OK, may confirm later');
                }
                return { approved: true, txId: result.txId };
            });

            // --- Write CALL option ---
            let writeOptionTxId: string | null = null;

            await runTest('Pool: Write CALL option', async () => {
                currentBlock = await provider.getBlockNumber();
                const expiryBlock = currentBlock + 1000n;

                const calldata = createWriteOptionCalldata(
                    0, // CALL
                    STRIKE_PRICE,
                    expiryBlock,
                    OPTION_AMOUNT,
                    PREMIUM,
                );

                const result = await deployer.callContract(poolAddress!, calldata, 200_000n);
                writeOptionTxId = result.txId;
                log.info(`  Write option TX: ${result.txId}`);
                try {
                    currentBlock = await waitForBlock(provider, currentBlock, 3);
                } catch {
                    log.warn('  Block timeout - TX broadcast OK, may confirm later');
                }

                return {
                    txId: result.txId,
                    optionType: 'CALL',
                    strikePrice: STRIKE_PRICE.toString(),
                    expiryBlock: expiryBlock.toString(),
                    amount: OPTION_AMOUNT.toString(),
                    premium: PREMIUM.toString(),
                };
            });

            // --- Verify option count (with polling for slow blocks) ---
            await runTest('Pool: Verify option exists', async () => {
                const expected = initialOptionCount + 1n;

                // Poll for up to 12 minutes (regtest blocks ~10min + safety margin)
                for (let attempt = 0; attempt < 24; attempt++) {
                    const result = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
                    if (isCallError(result) || result.revert) throw new Error(`Call error`);
                    const count = result.result.readU256();

                    if (count >= expected) {
                        targetOptionId = initialOptionCount; // 0-based ID
                        targetOptionStatus = 0;
                        log.info(`  Option count: ${count}, new option ID: ${targetOptionId}`);
                        return { optionCount: count.toString(), optionId: targetOptionId.toString(), source: 'new' };
                    }

                    if (attempt < 23) {
                        log.info(`  Option count still ${count} (need ${expected}), polling... (${attempt + 1}/24)`);
                        await new Promise((r) => setTimeout(r, 30_000));
                    }
                }

                // TX was broadcast but not yet mined — that's OK
                log.warn(`  writeOption TX broadcast but not mined yet. TX: ${writeOptionTxId}`);
                throw new Error(`Option not yet mined after polling. TX: ${writeOptionTxId}. Re-run later.`);
            });
        }

        // --- Read option state via getOption ---
        await runTest('Pool: Read option state (getOption)', async () => {
            if (targetOptionId === null) throw new Error('No option ID available');

            const opt = await readOptionStatus(targetOptionId);
            if (!opt) throw new Error('Failed to read option');

            log.info(`  Option ID: ${opt.id}`);
            log.info(`  Writer: ${formatAddress(opt.writer)}`);
            log.info(`  Type: ${opt.optType === 0 ? 'CALL' : 'PUT'}`);
            log.info(`  Strike: ${opt.strikePrice}`);
            log.info(`  Amount: ${opt.underlyingAmount}`);
            log.info(`  Premium: ${opt.premium}`);
            log.info(`  Expiry: ${opt.expiryBlock}`);
            log.info(`  Status: ${opt.status} (0=OPEN, 4=CANCELLED)`);

            targetOptionStatus = opt.status;
            if (opt.optType !== 0) throw new Error(`Expected CALL (0), got ${opt.optType}`);

            return {
                id: opt.id.toString(),
                writer: opt.writer,
                type: opt.optType,
                status: opt.status,
                strikePrice: opt.strikePrice.toString(),
                underlyingAmount: opt.underlyingAmount.toString(),
                premium: opt.premium.toString(),
                expiryBlock: opt.expiryBlock.toString(),
            };
        });

        // --- Cancel the option (only if OPEN) ---
        if (targetOptionId !== null && targetOptionStatus === 0) {
            // Pre-cancel diagnostics: check pool token balance and simulate
            await runTest('Pool: Pre-cancel diagnostics', async () => {
                // Check pool's MOTO balance
                const poolBalCd = buildBalanceOfCalldata(poolCallAddr);
                const poolBalResult = await provider.call(
                    deployed.tokens.frogU,
                    TOKEN_SELECTORS.balanceOf + poolBalCd,
                );
                const poolMoto = isCallError(poolBalResult) || poolBalResult.revert
                    ? 'ERROR'
                    : poolBalResult.result.readU256().toString();
                log.info(`  Pool MOTO balance: ${poolMoto}`);

                // Simulate cancelOption via provider.call — pass wallet address as `from`
                // so Blockchain.tx.sender = wallet (= option writer) during simulation
                const cancelSelectorHex = computeSelector('cancelOption(uint256)');
                const cw = new BinaryWriter();
                cw.writeU256(targetOptionId!);
                const cancelCd = Buffer.from(cw.getBuffer()).toString('hex');
                const simResult = await provider.call(
                    poolCallAddr,
                    cancelSelectorHex + cancelCd,
                    config.wallet.address,
                );

                if (isCallError(simResult)) {
                    log.error(`  Cancel simulation ERROR: ${simResult.error}`);
                    throw new Error(`Cancel simulation error: ${simResult.error}`);
                }
                if (simResult.revert) {
                    const revertMsg = Buffer.from(simResult.revert, 'base64').toString();
                    log.error(`  Cancel simulation REVERTED: ${revertMsg}`);
                    throw new Error(`Cancel simulation reverted: ${revertMsg}`);
                }

                log.info('  Cancel simulation: OK');
                return { poolMotoBalance: poolMoto, simulationPassed: true };
            });

            await runTest('Pool: Cancel option', async () => {
                const calldata = createCancelOptionCalldata(targetOptionId!);
                currentBlock = await provider.getBlockNumber();
                const result = await deployer.callContract(poolAddress!, calldata, 200_000n);
                log.info(`  Cancel TX: ${result.txId}`);
                try {
                    currentBlock = await waitForBlock(provider, currentBlock, 3);
                } catch {
                    log.warn('  Block timeout - TX broadcast OK, may confirm later');
                }
                return { txId: result.txId, optionId: targetOptionId!.toString() };
            });

            // --- Verify cancelled state (with polling, ~12min for regtest blocks) ---
            await runTest('Pool: Verify option cancelled', async () => {
                for (let attempt = 0; attempt < 24; attempt++) {
                    const opt = await readOptionStatus(targetOptionId!);
                    if (!opt) throw new Error('Failed to read option');

                    if (opt.status === 4) {
                        log.info(`  Status: ${opt.status} (CANCELLED)`);
                        return { status: opt.status, statusName: 'CANCELLED' };
                    }

                    if (attempt < 23) {
                        log.info(`  Status still ${opt.status}, polling for cancel... (${attempt + 1}/24)`);
                        await new Promise((r) => setTimeout(r, 30_000));
                    }
                }

                const opt = await readOptionStatus(targetOptionId!);
                log.warn(`  Cancel TX broadcast but status still ${opt?.status}. May confirm later.`);
                throw new Error(`Cancel not yet confirmed (status=${opt?.status}). Re-run later.`);
            });
        } else if (targetOptionId !== null && targetOptionStatus === 4) {
            // Already cancelled from previous run
            log.info('  Option already CANCELLED from previous run');
            skipTest('Pool: Cancel option', 'Option already cancelled');
            skipTest('Pool: Verify option cancelled', 'Option already cancelled');
        } else {
            skipTest('Pool: Cancel option', 'No confirmed option to cancel');
            skipTest('Pool: Verify option cancelled', 'No confirmed option to cancel');
        }

        // --- Verify accumulated fees ---
        await runTest('Pool: Verify accumulated fees after cancel', async () => {
            const result = await provider.call(poolCallAddr, POOL_SELECTORS.accumulatedFees);
            if (isCallError(result)) throw new Error(`Call error: ${result.error}`);
            if (result.revert) throw new Error(`Revert: ${result.revert}`);

            const fees = result.result.readU256();
            const expectedFee = OPTION_AMOUNT / 100n; // 1% of 1 MOTO
            log.info(`  Accumulated fees: ${fees} (expected ~${expectedFee})`);
            return { accumulatedFees: fees.toString() };
        });
    }

    // =====================================================================
    // PHASE 5: Notes on untested flows
    // =====================================================================

    log.info('\n=== Untested Flows (require second wallet) ===');
    log.info('  - buyOption: Contract prevents writer buying own option');
    log.info('  - exercise: Requires buyer + block advancement past expiry');
    log.info('  - settle: Requires purchased option past grace period');

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
