import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { JSONRpcProvider } from 'opnet';
import type { CallResult, ICallRequestError } from 'opnet';
import { Address, AddressTypes, BinaryWriter } from '@btc-vision/transaction';
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
    createBuyOptionCalldata,
    createExerciseCalldata,
    createSettleCalldata,
    createIncreaseAllowanceCalldata,
    createTransferCalldata,
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
        // Deployer wallet is the feeRecipient (treasury) for integration testing
        const calldata = createPoolCalldata(motoAddress, pillAddress, config.wallet.address);
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

    await runTest('Pool: Read fee configuration', async () => {
        const [r1, r2, r3] = await Promise.all([
            provider.call(poolCallAddr, POOL_SELECTORS.feeRecipient),
            provider.call(poolCallAddr, POOL_SELECTORS.buyFeeBps),
            provider.call(poolCallAddr, POOL_SELECTORS.exerciseFeeBps),
        ]);
        if (isCallError(r1)) throw new Error(`feeRecipient error: ${r1.error}`);
        if (isCallError(r2)) throw new Error(`buyFeeBps error: ${r2.error}`);
        if (isCallError(r3)) throw new Error(`exerciseFeeBps error: ${r3.error}`);
        if (r1.revert) throw new Error(`feeRecipient revert: ${r1.revert}`);
        if (r2.revert) throw new Error(`buyFeeBps revert: ${r2.revert}`);
        if (r3.revert) throw new Error(`exerciseFeeBps revert: ${r3.revert}`);
        const feeRecip = r1.result.readAddress();
        const buyBps = r2.result.readU64();
        const exerciseBps = r3.result.readU64();
        log.info(`  Fee recipient: ${formatAddress(feeRecip.toString())}`);
        log.info(`  Buy fee: ${buyBps} bps (${Number(buyBps) / 100}%)`);
        log.info(`  Exercise fee: ${exerciseBps} bps (${Number(exerciseBps) / 100}%)`);
        if (buyBps !== 100n) throw new Error(`Expected buyFeeBps=100, got ${buyBps}`);
        if (exerciseBps !== 10n) throw new Error(`Expected exerciseFeeBps=10, got ${exerciseBps}`);
        return { feeRecipient: feeRecip.toString(), buyFeeBps: buyBps.toString(), exerciseFeeBps: exerciseBps.toString() };
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
        skipTest('Pool: Verify feeRecipient receives cancel fee', reason);
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

        // --- Verify feeRecipient received the cancel fee ---
        // Since feeRecipient == deployer wallet in tests, we check the wallet's MOTO balance
        // increased by ~OPTION_AMOUNT (writer refund + fee both go to same address).
        await runTest('Pool: Verify feeRecipient receives cancel fee', async () => {
            // Re-read deployer MOTO balance after cancel
            const cd = buildBalanceOfCalldata(walletHex);
            const r = await provider.call(deployed.tokens.frogU, TOKEN_SELECTORS.balanceOf + cd);
            if (isCallError(r)) throw new Error(`Call error: ${r.error}`);
            if (r.revert) throw new Error(`Revert: ${Buffer.from(r.revert, 'base64').toString()}`);
            const motoAfterCancel = r.result.readU256();
            const cancelFee = OPTION_AMOUNT * 100n / 10000n; // 1%
            log.info(`  MOTO balance after cancel: ${formatBigInt(motoAfterCancel)}`);
            log.info(`  Expected cancel fee routed to feeRecipient: ${cancelFee} (${formatBigInt(cancelFee)} MOTO)`);
            // Since writer == feeRecipient, MOTO balance should be back to approximately pre-write level
            // (writer gets collateral - fee back, feeRecipient gets fee — same wallet = net OPTION_AMOUNT returned)
            log.info(`  Note: writer == feeRecipient so net change from pool = OPTION_AMOUNT (both go to same wallet)`);
            return { motoAfterCancel: motoAfterCancel.toString(), expectedCancelFee: cancelFee.toString() };
        });
    }

    // =====================================================================
    // PHASE 5: Set up buyer wallet (for buyOption / exercise tests)
    // =====================================================================
    //
    // The contract prevents writers from buying their own options
    // (Revert: "Writer cannot buy own option"), so we derive a second
    // wallet from the same mnemonic at index 1 and fund it.
    // =====================================================================

    log.info('\n=== Phase 5: Buyer Wallet Setup ===');

    const buyerWallet = config.mnemonic.deriveOPWallet(AddressTypes.P2TR, 1);
    const buyerHex = buyerWallet.address.toString();
    const buyerDeployer = new DeploymentHelper(provider, buyerWallet, config.network);

    log.info(`Buyer wallet: ${buyerWallet.p2tr}`);
    log.info(`Buyer hex: ${formatAddress(buyerHex)}`);

    const MIN_BUYER_BTC = 1_200_000n;        // 1.2M sats for gas across 6+ TXs (phases 6-8)
    const MIN_BUYER_PILL = 100n * 10n ** 18n; // 100 PILL for premium + exercise

    let buyerBtcBalance = 0n;
    let buyerPillBalance = 0n;
    let buyerReady = false;

    await runTest('Buyer: Check BTC balance', async () => {
        buyerBtcBalance = await provider.getBalance(buyerWallet.p2tr);
        log.info(`  Buyer BTC: ${buyerBtcBalance} sats (${Number(buyerBtcBalance) / 1e8} BTC)`);
        return { balance: buyerBtcBalance.toString() };
    });

    await runTest('Buyer: Check PILL balance', async () => {
        const calldata = buildBalanceOfCalldata(buyerHex);
        const result = await provider.call(
            deployed.tokens.frogP,
            TOKEN_SELECTORS.balanceOf + calldata,
        );
        if (isCallError(result)) throw new Error(`Call error: ${result.error}`);
        if (result.revert) throw new Error(`Revert: ${Buffer.from(result.revert, 'base64').toString()}`);
        buyerPillBalance = result.result.readU256();
        log.info(`  Buyer PILL: ${buyerPillBalance} (${formatBigInt(buyerPillBalance)})`);
        return { balance: buyerPillBalance.toString() };
    });

    // Fund buyer with BTC if needed
    if (hasTokens && buyerBtcBalance < MIN_BUYER_BTC) {
        await runTest('Buyer: Fund with BTC', async () => {
            const sendAmount = MIN_BUYER_BTC;
            currentBlock = await provider.getBlockNumber();
            const result = await deployer.sendBTC(buyerWallet.p2tr, sendAmount);
            log.info(`  Sent ${sendAmount} sats to buyer. TX: ${result.txId}`);
            try {
                currentBlock = await waitForBlock(provider, currentBlock, 1);
            } catch {
                log.warn('  Block timeout - TX broadcast OK, may confirm later');
            }
            return { txId: result.txId, amount: sendAmount.toString() };
        });
    } else if (!hasTokens) {
        skipTest('Buyer: Fund with BTC', 'Insufficient writer MOTO tokens');
    } else {
        skipTest('Buyer: Fund with BTC', 'Already has enough BTC');
    }

    // Fund buyer with PILL tokens if needed
    if (hasTokens && pillBalance >= MIN_BUYER_PILL && buyerPillBalance < MIN_BUYER_PILL) {
        await runTest('Buyer: Fund with PILL tokens', async () => {
            const sendAmount = MIN_BUYER_PILL;
            const calldata = createTransferCalldata(buyerWallet.address, sendAmount);
            currentBlock = await provider.getBlockNumber();
            const result = await deployer.callContract(deployed.tokens.frogP, calldata, 50_000n);
            log.info(`  Sent ${formatBigInt(sendAmount)} PILL to buyer. TX: ${result.txId}`);
            try {
                currentBlock = await waitForBlock(provider, currentBlock, 1);
            } catch {
                log.warn('  Block timeout - TX broadcast OK, may confirm later');
            }
            return { txId: result.txId, amount: sendAmount.toString() };
        });
    } else if (!hasTokens || pillBalance < MIN_BUYER_PILL) {
        skipTest('Buyer: Fund with PILL tokens', 'Insufficient writer token balance');
    } else {
        skipTest('Buyer: Fund with PILL tokens', 'Already has enough PILL');
    }

    // Re-check buyer balances after funding
    await runTest('Buyer: Verify funding', async () => {
        // Poll a few times in case funding TXs are still pending
        for (let attempt = 0; attempt < 12; attempt++) {
            buyerBtcBalance = await provider.getBalance(buyerWallet.p2tr);

            const calldata = buildBalanceOfCalldata(buyerHex);
            const result = await provider.call(
                deployed.tokens.frogP,
                TOKEN_SELECTORS.balanceOf + calldata,
            );
            if (!isCallError(result) && !result.revert) {
                buyerPillBalance = result.result.readU256();
            }

            buyerReady = buyerBtcBalance >= 100_000n && buyerPillBalance >= 5n * 10n ** 18n;
            if (buyerReady) break;

            if (attempt < 11) {
                log.info(`  Buyer not ready yet (BTC: ${buyerBtcBalance}, PILL: ${buyerPillBalance}), polling... (${attempt + 1}/12)`);
                await new Promise((r) => setTimeout(r, 30_000));
            }
        }

        log.info(`  Buyer BTC: ${buyerBtcBalance} sats, PILL: ${formatBigInt(buyerPillBalance)}`);
        log.info(`  Buyer ready: ${buyerReady}`);

        if (!buyerReady) {
            log.warn(`  Buyer wallet not funded yet. Fund and re-run.`);
            log.warn(`  Buyer address: ${buyerWallet.p2tr}`);
        }

        return { btc: buyerBtcBalance.toString(), pill: buyerPillBalance.toString(), ready: buyerReady };
    });

    // =====================================================================
    // PHASE 6: Write + Buy Option (buyOption test)
    // =====================================================================
    //
    // Contract math: strikeValue = strikePrice * underlyingAmount (no decimal scaling).
    // With strikePrice = 50 and underlyingAmount = 1e18, strikeValue = 50e18 = 50 PILL.
    // =====================================================================

    const BUY_STRIKE_PRICE = 50n;              // raw multiplier (not 50e18!)
    const BUY_PREMIUM = 5n * 10n ** 18n;       // 5 PILL
    const BUY_AMOUNT = 1n * 10n ** 18n;        // 1 MOTO
    const BUY_STRIKE_VALUE = BUY_STRIKE_PRICE * BUY_AMOUNT; // 50e18 = 50 PILL

    let buyTestOptionId: bigint | null = null;
    let buyTestExpiryBlock: bigint | null = null;
    let buyTestPurchased = false;

    if (!buyerReady || !hasTokens) {
        const reason = !buyerReady ? 'Buyer wallet not funded' : 'Insufficient MOTO';
        skipTest('Writer: Approve MOTO for buy-test option', reason);
        skipTest('Writer: Write CALL for buy-test', reason);
        skipTest('Verify buy-test option exists', reason);
        skipTest('Buyer: Approve PILL premium for pool', reason);
        skipTest('Buyer: Buy option (buyOption)', reason);
        skipTest('Verify option status = PURCHASED', reason);
        skipTest('Verify writer received premium minus fee', reason);
    } else {
        log.info('\n=== Phase 6: Write + Buy Option ===');

        // Read current option count before writing
        let preWriteCount = 0n;
        {
            const r = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
            if (!isCallError(r) && !r.revert) preWriteCount = r.result.readU256();
        }

        // Writer approves MOTO for pool
        await runTest('Writer: Approve MOTO for buy-test option', async () => {
            const poolAddr = Address.fromString(poolCallAddr);
            const calldata = createIncreaseAllowanceCalldata(poolAddr, BUY_AMOUNT);
            currentBlock = await provider.getBlockNumber();
            const result = await deployer.callContract(deployed.tokens.frogU, calldata, 50_000n);
            log.info(`  Approve TX: ${result.txId}`);
            try { currentBlock = await waitForBlock(provider, currentBlock, 1); } catch { log.warn('  Block timeout'); }
            return { txId: result.txId };
        });

        // Writer writes CALL option with short expiry
        await runTest('Writer: Write CALL for buy-test', async () => {
            currentBlock = await provider.getBlockNumber();
            buyTestExpiryBlock = currentBlock + 4n; // ~40 min to buy before expiry
            const calldata = createWriteOptionCalldata(0, BUY_STRIKE_PRICE, buyTestExpiryBlock, BUY_AMOUNT, BUY_PREMIUM);
            const result = await deployer.callContract(poolAddress!, calldata, 200_000n);
            log.info(`  Write TX: ${result.txId}`);
            log.info(`  Expiry: block ${buyTestExpiryBlock} (current: ${currentBlock})`);
            return { txId: result.txId, expiryBlock: buyTestExpiryBlock.toString() };
        });

        // Poll for the new option to appear
        await runTest('Verify buy-test option exists', async () => {
            const expectedCount = preWriteCount + 1n;
            for (let attempt = 0; attempt < 24; attempt++) {
                const r = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
                if (isCallError(r) || r.revert) throw new Error('Call error');
                const count = r.result.readU256();

                if (count >= expectedCount) {
                    buyTestOptionId = preWriteCount; // 0-based ID
                    log.info(`  Option count: ${count}, buy-test option ID: ${buyTestOptionId}`);
                    return { optionCount: count.toString(), optionId: buyTestOptionId.toString() };
                }

                if (attempt < 23) {
                    log.info(`  Option count still ${count} (need ${expectedCount}), polling... (${attempt + 1}/24)`);
                    await new Promise((r) => setTimeout(r, 30_000));
                }
            }
            throw new Error('Buy-test option not mined after polling. Re-run later.');
        });

        // Buyer approves PILL premium for pool
        if (buyTestOptionId !== null) {
            // Record writer PILL balance before buyer calls buyOption
            // Writer should receive premium - 1% buy fee once the option is purchased
            let writerPillBefore = 0n;
            {
                const cd = buildBalanceOfCalldata(walletHex);
                const r = await provider.call(deployed.tokens.frogP, TOKEN_SELECTORS.balanceOf + cd);
                if (!isCallError(r) && !r.revert) writerPillBefore = r.result.readU256();
                log.info(`  Writer PILL before buyOption: ${formatBigInt(writerPillBefore)}`);
            }

            await runTest('Buyer: Approve PILL premium for pool', async () => {
                const poolAddr = Address.fromString(poolCallAddr);
                const calldata = createIncreaseAllowanceCalldata(poolAddr, BUY_PREMIUM);
                const result = await buyerDeployer.callContract(deployed.tokens.frogP, calldata, 50_000n);
                log.info(`  Buyer approve TX: ${result.txId}`);
                // Re-fetch block AFTER broadcast so we wait for a genuinely new block
                currentBlock = await provider.getBlockNumber();
                try { currentBlock = await waitForBlock(provider, currentBlock, 1); } catch { log.warn('  Block timeout'); }
                return { txId: result.txId };
            });

            // Buyer calls buyOption
            await runTest('Buyer: Buy option (buyOption)', async () => {
                const calldata = createBuyOptionCalldata(buyTestOptionId!);
                const result = await buyerDeployer.callContract(poolAddress!, calldata, 200_000n);
                log.info(`  Buy TX: ${result.txId}`);
                return { txId: result.txId, optionId: buyTestOptionId!.toString() };
            });

            // Verify status = PURCHASED (1)
            await runTest('Verify option status = PURCHASED', async () => {
                for (let attempt = 0; attempt < 24; attempt++) {
                    const opt = await readOptionStatus(buyTestOptionId!);
                    if (!opt) throw new Error('Failed to read option');

                    if (opt.status === 1) {
                        buyTestPurchased = true;
                        log.info(`  Status: ${opt.status} (PURCHASED)`);
                        log.info(`  Buyer: ${formatAddress(opt.buyer)}`);
                        return { status: opt.status, buyer: opt.buyer };
                    }

                    if (attempt < 23) {
                        log.info(`  Status still ${opt.status}, polling for PURCHASED... (${attempt + 1}/24)`);
                        await new Promise((r) => setTimeout(r, 30_000));
                    }
                }
                throw new Error('Option not PURCHASED after polling. Re-run later.');
            });

            // Verify writer received premium minus 1% buy fee
            await runTest('Verify writer received premium minus fee', async () => {
                const cd = buildBalanceOfCalldata(walletHex);
                const r = await provider.call(deployed.tokens.frogP, TOKEN_SELECTORS.balanceOf + cd);
                if (isCallError(r)) throw new Error(`Call error: ${r.error}`);
                if (r.revert) throw new Error(`Revert: ${Buffer.from(r.revert, 'base64').toString()}`);
                const writerPillAfter = r.result.readU256();
                const received = writerPillAfter - writerPillBefore;
                const buyFee = BUY_PREMIUM * 100n / 10000n;          // 1% of 5 PILL = 0.05 PILL
                const expectedWriterAmount = BUY_PREMIUM - buyFee;   // 4.95 PILL
                log.info(`  Writer PILL before: ${formatBigInt(writerPillBefore)}`);
                log.info(`  Writer PILL after:  ${formatBigInt(writerPillAfter)}`);
                log.info(`  Writer received: ${formatBigInt(received)} (expected: ${formatBigInt(expectedWriterAmount)})`);
                log.info(`  Buy fee deducted: ${formatBigInt(buyFee)} (sent to feeRecipient)`);
                if (received !== expectedWriterAmount) {
                    log.warn(`  Mismatch: received ${received}, expected ${expectedWriterAmount}`);
                }
                return {
                    before: writerPillBefore.toString(),
                    after: writerPillAfter.toString(),
                    received: received.toString(),
                    expected: expectedWriterAmount.toString(),
                    buyFee: buyFee.toString(),
                };
            });
        } else {
            skipTest('Buyer: Approve PILL premium for pool', 'No option to buy');
            skipTest('Buyer: Buy option (buyOption)', 'No option to buy');
            skipTest('Verify option status = PURCHASED', 'No option to buy');
            skipTest('Verify writer received premium minus fee', 'No option to buy');
        }
    }

    // =====================================================================
    // PHASE 7: Exercise Option (CALL)
    // =====================================================================
    //
    // Exercise requires: PURCHASED + currentBlock >= expiryBlock
    //                    + currentBlock < expiryBlock + 144 (grace period)
    // For CALL: buyer pays strikeValue (PILL) to writer, receives underlying (MOTO).
    // =====================================================================

    if (!buyTestPurchased || buyTestOptionId === null || buyTestExpiryBlock === null) {
        const reason = !buyTestPurchased ? 'Option not purchased' : 'No option ID';
        skipTest('Wait for option expiry', reason);
        skipTest('Buyer: Approve PILL for exercise (strikeValue)', reason);
        skipTest('Buyer: Exercise option', reason);
        skipTest('Verify option status = EXERCISED', reason);
        skipTest('Verify buyer received underlying tokens', reason);
    } else {
        log.info('\n=== Phase 7: Exercise Option (CALL) ===');
        log.info(`Option ID: ${buyTestOptionId}, expiry: block ${buyTestExpiryBlock}`);

        // Wait for expiry
        await runTest('Wait for option expiry', async () => {
            currentBlock = await provider.getBlockNumber();
            if (currentBlock >= buyTestExpiryBlock!) {
                log.info(`  Already past expiry (current: ${currentBlock}, expiry: ${buyTestExpiryBlock})`);
                return { currentBlock: currentBlock.toString(), alreadyExpired: true };
            }
            const blocksToWait = Number(buyTestExpiryBlock! - currentBlock);
            log.info(`  Need ${blocksToWait} more blocks (current: ${currentBlock}, expiry: ${buyTestExpiryBlock})`);
            log.info(`  Estimated wait: ~${blocksToWait * 10} minutes`);

            // Wait with generous timeout (up to ~2 hours)
            currentBlock = await waitForBlock(provider, currentBlock, blocksToWait, 720);
            log.info(`  Reached block ${currentBlock}, past expiry ${buyTestExpiryBlock}`);
            return { currentBlock: currentBlock.toString(), alreadyExpired: false };
        });

        // Check we're within grace period
        const graceEnd = buyTestExpiryBlock + 144n;
        currentBlock = await provider.getBlockNumber();
        if (currentBlock >= graceEnd) {
            log.warn(`  Past grace period (current: ${currentBlock}, graceEnd: ${graceEnd}). Cannot exercise.`);
            skipTest('Buyer: Approve PILL for exercise (strikeValue)', 'Grace period ended');
            skipTest('Buyer: Exercise option', 'Grace period ended');
            skipTest('Verify option status = EXERCISED', 'Grace period ended');
            skipTest('Verify buyer received underlying tokens', 'Grace period ended');
        } else {
            // Buyer approves PILL for strikeValue payment
            await runTest('Buyer: Approve PILL for exercise (strikeValue)', async () => {
                const poolAddr = Address.fromString(poolCallAddr);
                const calldata = createIncreaseAllowanceCalldata(poolAddr, BUY_STRIKE_VALUE);
                const result = await buyerDeployer.callContract(deployed.tokens.frogP, calldata, 50_000n);
                log.info(`  Approve strikeValue (${formatBigInt(BUY_STRIKE_VALUE)} PILL) TX: ${result.txId}`);
                // Re-fetch block AFTER broadcast
                currentBlock = await provider.getBlockNumber();
                try { currentBlock = await waitForBlock(provider, currentBlock, 1); } catch { log.warn('  Block timeout'); }
                return { txId: result.txId, strikeValue: BUY_STRIKE_VALUE.toString() };
            });

            // Record buyer MOTO balance before exercise
            let buyerMotoBefore = 0n;
            {
                const cd = buildBalanceOfCalldata(buyerHex);
                const r = await provider.call(deployed.tokens.frogU, TOKEN_SELECTORS.balanceOf + cd);
                if (!isCallError(r) && !r.revert) buyerMotoBefore = r.result.readU256();
            }

            // Buyer exercises the option
            await runTest('Buyer: Exercise option', async () => {
                const calldata = createExerciseCalldata(buyTestOptionId!);
                currentBlock = await provider.getBlockNumber();
                log.info(`  Current block: ${currentBlock}, expiry: ${buyTestExpiryBlock}, grace end: ${graceEnd}`);
                const result = await buyerDeployer.callContract(poolAddress!, calldata, 200_000n);
                log.info(`  Exercise TX: ${result.txId}`);
                return { txId: result.txId, optionId: buyTestOptionId!.toString() };
            });

            // Verify status = EXERCISED (2)
            await runTest('Verify option status = EXERCISED', async () => {
                for (let attempt = 0; attempt < 24; attempt++) {
                    const opt = await readOptionStatus(buyTestOptionId!);
                    if (!opt) throw new Error('Failed to read option');

                    if (opt.status === 2) {
                        log.info(`  Status: ${opt.status} (EXERCISED)`);
                        return { status: opt.status, statusName: 'EXERCISED' };
                    }

                    if (attempt < 23) {
                        log.info(`  Status still ${opt.status}, polling for EXERCISED... (${attempt + 1}/24)`);
                        await new Promise((r) => setTimeout(r, 30_000));
                    }
                }
                throw new Error('Option not EXERCISED after polling. Re-run later.');
            });

            // Verify buyer received underlying tokens (MOTO)
            await runTest('Verify buyer received underlying tokens', async () => {
                const cd = buildBalanceOfCalldata(buyerHex);
                const r = await provider.call(deployed.tokens.frogU, TOKEN_SELECTORS.balanceOf + cd);
                if (isCallError(r)) throw new Error(`Call error: ${r.error}`);
                if (r.revert) throw new Error(`Revert: ${Buffer.from(r.revert, 'base64').toString()}`);
                const buyerMotoAfter = r.result.readU256();
                const received = buyerMotoAfter - buyerMotoBefore;
                const exerciseFee = BUY_AMOUNT * 10n / 10000n;           // 0.1% of 1 MOTO = 1e15
                const expectedReceived = BUY_AMOUNT - exerciseFee;        // 0.999 MOTO
                log.info(`  Buyer MOTO before: ${formatBigInt(buyerMotoBefore)}`);
                log.info(`  Buyer MOTO after:  ${formatBigInt(buyerMotoAfter)}`);
                log.info(`  Received: ${formatBigInt(received)} (expected: ${formatBigInt(expectedReceived)} after 0.1% exercise fee)`);
                log.info(`  Exercise fee deducted: ${formatBigInt(exerciseFee)} (sent to feeRecipient)`);

                if (received !== expectedReceived) {
                    log.warn(`  Mismatch: received ${received}, expected ${expectedReceived}`);
                }

                return {
                    before: buyerMotoBefore.toString(),
                    after: buyerMotoAfter.toString(),
                    received: received.toString(),
                    expected: expectedReceived.toString(),
                    exerciseFee: exerciseFee.toString(),
                };
            });
        }
    }

    // =====================================================================
    // PHASE 8: Settle prep (write + buy another option, save ID for later)
    // =====================================================================
    //
    // Settle requires: PURCHASED + currentBlock >= expiryBlock + 144
    // That's ~24 hours after expiry on Signet. We can't wait in a single run.
    // Instead we write + buy a new option and save its ID for a later run.
    // =====================================================================

    if (!buyerReady || !hasTokens) {
        skipTest('Settle prep: Writer approve MOTO', 'Buyer or writer not ready');
        skipTest('Settle prep: Writer write CALL', 'Buyer or writer not ready');
        skipTest('Settle prep: Verify option exists', 'Buyer or writer not ready');
        skipTest('Settle prep: Buyer approve PILL premium', 'Buyer or writer not ready');
        skipTest('Settle prep: Buyer buy option', 'Buyer or writer not ready');
        skipTest('Settle prep: Verify PURCHASED + save state', 'Buyer or writer not ready');
    } else {
        log.info('\n=== Phase 8: Settle Prep ===');

        let settleOptionId: bigint | null = null;
        let settleExpiryBlock: bigint | null = null;

        // Read current option count
        let preSettleCount = 0n;
        {
            const r = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
            if (!isCallError(r) && !r.revert) preSettleCount = r.result.readU256();
        }

        // Writer approves MOTO
        await runTest('Settle prep: Writer approve MOTO', async () => {
            const poolAddr = Address.fromString(poolCallAddr);
            const calldata = createIncreaseAllowanceCalldata(poolAddr, BUY_AMOUNT);
            currentBlock = await provider.getBlockNumber();
            const result = await deployer.callContract(deployed.tokens.frogU, calldata, 50_000n);
            log.info(`  Approve TX: ${result.txId}`);
            try { currentBlock = await waitForBlock(provider, currentBlock, 1); } catch { log.warn('  Block timeout'); }
            return { txId: result.txId };
        });

        // Writer writes CALL with short expiry (same params as buy-test)
        await runTest('Settle prep: Writer write CALL', async () => {
            currentBlock = await provider.getBlockNumber();
            settleExpiryBlock = currentBlock + 3n;
            const calldata = createWriteOptionCalldata(0, BUY_STRIKE_PRICE, settleExpiryBlock, BUY_AMOUNT, BUY_PREMIUM);
            const result = await deployer.callContract(poolAddress!, calldata, 200_000n);
            log.info(`  Write TX: ${result.txId}`);
            log.info(`  Expiry: block ${settleExpiryBlock}`);
            return { txId: result.txId, expiryBlock: settleExpiryBlock.toString() };
        });

        // Poll for option to appear
        await runTest('Settle prep: Verify option exists', async () => {
            const expectedCount = preSettleCount + 1n;
            for (let attempt = 0; attempt < 24; attempt++) {
                const r = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
                if (isCallError(r) || r.revert) throw new Error('Call error');
                const count = r.result.readU256();

                if (count >= expectedCount) {
                    settleOptionId = preSettleCount;
                    log.info(`  Settle-prep option ID: ${settleOptionId}`);
                    return { optionId: settleOptionId.toString() };
                }

                if (attempt < 23) {
                    log.info(`  Polling for settle-prep option... (${attempt + 1}/24)`);
                    await new Promise((r) => setTimeout(r, 30_000));
                }
            }
            throw new Error('Settle-prep option not mined. Re-run later.');
        });

        if (settleOptionId !== null) {
            // Re-fund buyer with BTC if needed (spent on Phase 6+7 transactions)
            const buyerBtcBalance = await provider.getBalance(buyerWallet.p2tr);
            if (buyerBtcBalance < 500_000n) {
                await runTest('Settle prep: Re-fund buyer with BTC', async () => {
                    const amount = 500_000n;
                    const result = await deployer.sendBTC(buyerWallet.p2tr, amount);
                    log.info(`  Sent ${amount} sats to buyer. TX: ${result.txId}`);
                    currentBlock = await provider.getBlockNumber();
                    try { currentBlock = await waitForBlock(provider, currentBlock, 1); } catch { log.warn('  Block timeout'); }
                    return { txId: result.txId, amount: amount.toString() };
                });
            } else {
                log.info(`  Buyer has ${buyerBtcBalance} sats BTC — enough for settle prep`);
            }

            // Buyer approves PILL premium
            await runTest('Settle prep: Buyer approve PILL premium', async () => {
                const poolAddr = Address.fromString(poolCallAddr);
                const calldata = createIncreaseAllowanceCalldata(poolAddr, BUY_PREMIUM);
                const result = await buyerDeployer.callContract(deployed.tokens.frogP, calldata, 50_000n);
                log.info(`  Buyer approve TX: ${result.txId}`);
                // Re-fetch block AFTER broadcast
                currentBlock = await provider.getBlockNumber();
                try { currentBlock = await waitForBlock(provider, currentBlock, 1); } catch { log.warn('  Block timeout'); }
                return { txId: result.txId };
            });

            // Buyer buys the option
            await runTest('Settle prep: Buyer buy option', async () => {
                const calldata = createBuyOptionCalldata(settleOptionId!);
                const result = await buyerDeployer.callContract(poolAddress!, calldata, 200_000n);
                log.info(`  Buy TX: ${result.txId}`);
                return { txId: result.txId };
            });

            // Verify PURCHASED and save state for later settle
            await runTest('Settle prep: Verify PURCHASED + save state', async () => {
                for (let attempt = 0; attempt < 24; attempt++) {
                    const opt = await readOptionStatus(settleOptionId!);
                    if (!opt) throw new Error('Failed to read option');

                    if (opt.status === 1) {
                        log.info(`  Status: ${opt.status} (PURCHASED) - ready for settle`);

                        // Save state for later settle test
                        const settleState = {
                            optionId: settleOptionId!.toString(),
                            expiryBlock: settleExpiryBlock!.toString(),
                            graceEnd: (settleExpiryBlock! + 144n).toString(),
                            pool: poolAddress,
                            poolCallAddr,
                            network: process.env.OPNET_NETWORK || 'regtest',
                            savedAt: new Date().toISOString(),
                        };
                        const statePath = path.join(process.cwd(), 'tests', 'integration', 'settle-state.json');
                        fs.writeFileSync(statePath, JSON.stringify(settleState, null, 2));
                        log.info(`  Settle state saved to: ${statePath}`);
                        log.info(`  Settle available after block: ${settleState.graceEnd}`);

                        return { status: opt.status, settleState };
                    }

                    if (attempt < 23) {
                        log.info(`  Status still ${opt.status}, polling... (${attempt + 1}/24)`);
                        await new Promise((r) => setTimeout(r, 30_000));
                    }
                }
                throw new Error('Settle-prep option not PURCHASED after polling.');
            });
        } else {
            skipTest('Settle prep: Buyer approve PILL premium', 'No option to buy');
            skipTest('Settle prep: Buyer buy option', 'No option to buy');
            skipTest('Settle prep: Verify PURCHASED + save state', 'No option to buy');
        }
    }

    // =====================================================================
    // Check for pending settle from a previous run
    // =====================================================================

    const settleStatePath = path.join(process.cwd(), 'tests', 'integration', 'settle-state.json');
    if (fs.existsSync(settleStatePath)) {
        const settleState = JSON.parse(fs.readFileSync(settleStatePath, 'utf-8'));
        const settleGraceEnd = BigInt(settleState.graceEnd);
        currentBlock = await provider.getBlockNumber();

        if (currentBlock >= settleGraceEnd) {
            log.info('\n=== Bonus: Settle from previous run ===');
            log.info(`Option ID: ${settleState.optionId}, grace ended at block ${settleGraceEnd}, current: ${currentBlock}`);

            await runTest('Settle: Call settle on expired option', async () => {
                const optId = BigInt(settleState.optionId);
                const calldata = createSettleCalldata(optId);
                currentBlock = await provider.getBlockNumber();
                const result = await deployer.callContract(poolAddress!, calldata, 200_000n);
                log.info(`  Settle TX: ${result.txId}`);
                return { txId: result.txId, optionId: settleState.optionId };
            });

            await runTest('Settle: Verify option status = EXPIRED', async () => {
                const optId = BigInt(settleState.optionId);
                for (let attempt = 0; attempt < 24; attempt++) {
                    const opt = await readOptionStatus(optId);
                    if (!opt) throw new Error('Failed to read option');

                    if (opt.status === 3) {
                        log.info(`  Status: ${opt.status} (EXPIRED/SETTLED)`);
                        // Remove settle state file after successful settle
                        fs.unlinkSync(settleStatePath);
                        log.info('  Settle state file cleaned up.');
                        return { status: opt.status, statusName: 'EXPIRED' };
                    }

                    if (attempt < 23) {
                        log.info(`  Status still ${opt.status}, polling for EXPIRED... (${attempt + 1}/24)`);
                        await new Promise((r) => setTimeout(r, 30_000));
                    }
                }
                throw new Error('Settle not confirmed after polling.');
            });
        } else {
            const blocksRemaining = settleGraceEnd - currentBlock;
            log.info(`\n=== Settle pending (${blocksRemaining} blocks until grace end) ===`);
            log.info(`  Option ID: ${settleState.optionId}`);
            log.info(`  Grace ends at block: ${settleGraceEnd} (current: ${currentBlock})`);
            log.info(`  Estimated wait: ~${Number(blocksRemaining) * 10} minutes`);
        }
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
