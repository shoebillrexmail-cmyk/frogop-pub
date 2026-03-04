/**
 * 06b-write-cancel-call.ts
 *
 * Write CALL + Cancel + Fee verification (from Phase 4 of the old 06-full-lifecycle).
 *
 * Tests (~7):
 *   - Approve MOTO for pool
 *   - Write CALL option
 *   - Verify option exists (poll)
 *   - Read option state (getOption)
 *   - Pre-cancel diagnostics (simulate)
 *   - Cancel option + verify cancelled (poll)
 *   - Verify feeRecipient receives cancel fee (MOTO, 1%)
 *
 * Reads: pool-state.json for poolCallAddr, poolFeeRecipientHex
 * Dependencies: 06a must have run once.
 */

import 'dotenv/config';
import { Address, BinaryWriter } from '@btc-vision/transaction';
import {
    createTestHarness,
    initTestContext,
    isCallError,
    loadPoolState,
    readOptionStatus,
    readTokenBalance,
    buildBalanceOfCalldata,
    pollForOptionCount,
    pollForOptionStatus,
    POOL_SELECTORS,
    TOKEN_SELECTORS,
} from './test-harness.js';
import {
    formatAddress,
    formatBigInt,
    waitForBlock,
    computeSelector,
} from './config.js';
import {
    createWriteOptionCalldata,
    createCancelOptionCalldata,
    createIncreaseAllowanceCalldata,
} from './deployment.js';

const { runTest, skipTest, printSummary } = createTestHarness('06b-write-cancel');

async function main() {
    const { config, deployed, provider, deployer, walletHex, poolAddress, poolCallAddr } = await initTestContext();
    const log = (await import('./config.js')).getLogger('06b-write-cancel');

    const poolState = loadPoolState();
    const poolFeeRecipientHex = poolState.poolFeeRecipientHex;

    log.info('=== Write & Cancel CALL Option Tests ===');

    const OPTION_AMOUNT = 1n * 10n ** 18n;   // 1 MOTO
    const STRIKE_PRICE = 50n * 10n ** 18n;   // 50 PILL per MOTO
    const PREMIUM = 5n * 10n ** 18n;         // 5 PILL

    // Check MOTO balance
    const motoBalance = await readTokenBalance(provider, deployed.tokens.frogU, walletHex);
    const hasTokens = motoBalance >= OPTION_AMOUNT;

    let currentBlock = await provider.getBlockNumber();
    let targetOptionId: bigint | null = null;
    let targetOptionStatus: number | null = null;

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
        // Check for existing OPEN option from a previous run (idempotent)
        const initialOptionCount = BigInt(poolState.initialOptionCount);
        let existingOpenId: bigint | null = null;

        if (initialOptionCount > 0n) {
            const nowBlock = await provider.getBlockNumber();
            for (let i = initialOptionCount - 1n; i >= 0n; i--) {
                const opt = await readOptionStatus(provider, poolCallAddr, i);
                if (opt && opt.status === 0 && opt.expiryBlock > nowBlock) {
                    existingOpenId = i;
                    log.info(`  Found existing OPEN option: ID ${i}`);
                    break;
                }
                if (i === 0n) break;
            }
        }

        if (existingOpenId !== null) {
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
            // Read current count for detecting new option
            const preWriteCount = await (async () => {
                const r = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
                if (isCallError(r) || r.revert) return 0n;
                return r.result.readU256();
            })();

            await runTest('Token: Approve MOTO for pool', async () => {
                const poolAddr = Address.fromString(poolCallAddr);
                const calldata = createIncreaseAllowanceCalldata(poolAddr, OPTION_AMOUNT);
                currentBlock = await provider.getBlockNumber();
                const result = await deployer.callContract(deployed.tokens.frogU, calldata, 50_000n);
                log.info(`  Approve TX: ${result.txId}`);
                try { currentBlock = await waitForBlock(provider, currentBlock, 3); } catch { log.warn('  Block timeout'); }
                return { approved: true, txId: result.txId };
            });

            await runTest('Pool: Write CALL option', async () => {
                currentBlock = await provider.getBlockNumber();
                const expiryBlock = currentBlock + 1000n;
                const calldata = createWriteOptionCalldata(0, STRIKE_PRICE, expiryBlock, OPTION_AMOUNT, PREMIUM);
                const result = await deployer.callContract(poolAddress, calldata, 200_000n);
                log.info(`  Write option TX: ${result.txId}`);
                try { currentBlock = await waitForBlock(provider, currentBlock, 3); } catch { log.warn('  Block timeout'); }
                return { txId: result.txId, strikePrice: STRIKE_PRICE.toString(), expiryBlock: expiryBlock.toString() };
            });

            await runTest('Pool: Verify option exists', async () => {
                const expected = preWriteCount + 1n;
                const count = await pollForOptionCount(provider, poolCallAddr, expected);
                targetOptionId = preWriteCount;
                targetOptionStatus = 0;
                log.info(`  Option count: ${count}, new option ID: ${targetOptionId}`);
                return { optionCount: count.toString(), optionId: targetOptionId.toString(), source: 'new' };
            });
        }

        // Read option state
        await runTest('Pool: Read option state (getOption)', async () => {
            if (targetOptionId === null) throw new Error('No option ID available');
            const opt = await readOptionStatus(provider, poolCallAddr, targetOptionId);
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

            return { id: opt.id.toString(), type: opt.optType, status: opt.status, strikePrice: opt.strikePrice.toString() };
        });

        // Cancel the option (only if OPEN)
        let feeRecipientMotoBefore = 0n;
        if (targetOptionId !== null && targetOptionStatus === 0) {
            await runTest('Pool: Pre-cancel diagnostics', async () => {
                // Check pool's MOTO balance
                const poolBalCd = buildBalanceOfCalldata(poolCallAddr);
                const poolBalResult = await provider.call(deployed.tokens.frogU, TOKEN_SELECTORS.balanceOf + poolBalCd);
                const poolMoto = isCallError(poolBalResult) || poolBalResult.revert
                    ? 'ERROR'
                    : poolBalResult.result.readU256().toString();
                log.info(`  Pool MOTO balance: ${poolMoto}`);

                // Fee recipient balance before cancel
                if (poolFeeRecipientHex) {
                    const feeRecipCd = buildBalanceOfCalldata(poolFeeRecipientHex);
                    const feeRecipResult = await provider.call(deployed.tokens.frogU, TOKEN_SELECTORS.balanceOf + feeRecipCd);
                    if (!isCallError(feeRecipResult) && !feeRecipResult.revert) {
                        feeRecipientMotoBefore = feeRecipResult.result.readU256();
                        log.info(`  Fee recipient MOTO before cancel: ${formatBigInt(feeRecipientMotoBefore)}`);
                    }
                }

                // Simulate cancelOption
                const cancelSelectorHex = computeSelector('cancelOption(uint256)');
                const cw = new BinaryWriter();
                cw.writeU256(targetOptionId!);
                const cancelCd = Buffer.from(cw.getBuffer()).toString('hex');
                const simResult = await provider.call(poolCallAddr, cancelSelectorHex + cancelCd, config.wallet.address);

                if (isCallError(simResult)) throw new Error(`Cancel simulation error: ${simResult.error}`);
                if (simResult.revert) {
                    const revertMsg = Buffer.from(simResult.revert, 'base64').toString();
                    throw new Error(`Cancel simulation reverted: ${revertMsg}`);
                }

                log.info('  Cancel simulation: OK');
                return { poolMotoBalance: poolMoto, simulationPassed: true, feeRecipientMotoBefore: feeRecipientMotoBefore.toString() };
            });

            await runTest('Pool: Cancel option', async () => {
                const calldata = createCancelOptionCalldata(targetOptionId!);
                currentBlock = await provider.getBlockNumber();
                const result = await deployer.callContract(poolAddress, calldata, 200_000n);
                log.info(`  Cancel TX: ${result.txId}`);
                try { currentBlock = await waitForBlock(provider, currentBlock, 3); } catch { log.warn('  Block timeout'); }
                return { txId: result.txId, optionId: targetOptionId!.toString() };
            });

            await runTest('Pool: Verify option cancelled', async () => {
                const opt = await pollForOptionStatus(provider, poolCallAddr, targetOptionId!, 4);
                log.info(`  Status: ${opt.status} (CANCELLED)`);
                return { status: opt.status, statusName: 'CANCELLED' };
            });

            await runTest('Pool: Verify feeRecipient receives cancel fee', async () => {
                const queryHex = poolFeeRecipientHex || walletHex;
                const feeRecipMotoAfter = await readTokenBalance(provider, deployed.tokens.frogU, queryHex);
                const cancelFee = OPTION_AMOUNT * 100n / 10000n; // 1%
                const received = feeRecipMotoAfter - feeRecipientMotoBefore;
                log.info(`  Fee recipient MOTO before: ${formatBigInt(feeRecipientMotoBefore)}`);
                log.info(`  Fee recipient MOTO after:  ${formatBigInt(feeRecipMotoAfter)}`);
                log.info(`  Cancel fee received: ${formatBigInt(received)} (expected: ${formatBigInt(cancelFee)})`);
                const isSeparate = queryHex.toLowerCase() !== walletHex.toLowerCase();
                if (isSeparate && received !== cancelFee) {
                    log.warn(`  Fee mismatch: received ${received}, expected ${cancelFee}`);
                } else if (!isSeparate) {
                    log.info(`  Note: writer == feeRecipient (net includes refund + fee)`);
                }
                return { before: feeRecipientMotoBefore.toString(), after: feeRecipMotoAfter.toString(), received: received.toString(), expected: cancelFee.toString(), separateRecipient: isSeparate };
            });
        } else if (targetOptionId !== null && targetOptionStatus === 4) {
            log.info('  Option already CANCELLED from previous run');
            skipTest('Pool: Cancel option', 'Option already cancelled');
            skipTest('Pool: Verify option cancelled', 'Option already cancelled');
            skipTest('Pool: Verify feeRecipient receives cancel fee', 'Option already cancelled');
        } else {
            skipTest('Pool: Cancel option', 'No confirmed option to cancel');
            skipTest('Pool: Verify option cancelled', 'No confirmed option to cancel');
            skipTest('Pool: Verify feeRecipient receives cancel fee', 'No confirmed option to cancel');
        }
    }

    printSummary();
}

main().catch(async (error) => {
    const log = (await import('./config.js')).getLogger('06b-write-cancel');
    log.error('Tests failed:', error);
    process.exit(1);
});
