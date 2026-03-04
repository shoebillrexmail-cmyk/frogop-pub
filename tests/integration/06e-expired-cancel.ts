/**
 * 06e-expired-cancel.ts
 *
 * Story 8.3: Free reclaim on expired unsold options (from Phase 9 of the old 06-full-lifecycle).
 *
 * Two-run design:
 *   Run 1 (no state file): Approve MOTO + Write CALL (expiry=current+1), save expired-cancel-state.json
 *   Run 2 (state file exists + expired): Capture balances → Cancel → Verify CANCELLED →
 *          Verify 100% collateral returned → Verify feeRecipient unchanged (0% fee)
 *
 * Reads: pool-state.json, expired-cancel-state.json (from prior run)
 * Dependencies: 06a.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Address } from '@btc-vision/transaction';
import {
    createTestHarness,
    initTestContext,
    isCallError,
    loadPoolState,
    readTokenBalance,
    buildBalanceOfCalldata,
    pollForOptionStatus,
    POOL_SELECTORS,
    TOKEN_SELECTORS,
} from './test-harness.js';
import {
    formatBigInt,
    waitForBlock,
} from './config.js';
import {
    createWriteOptionCalldata,
    createCancelOptionCalldata,
    createIncreaseAllowanceCalldata,
} from './deployment.js';

const { runTest, printSummary } = createTestHarness('06e-expired-cancel');

async function main() {
    const { deployed, provider, deployer, walletHex, poolAddress, poolCallAddr } = await initTestContext();
    const log = (await import('./config.js')).getLogger('06e-expired-cancel');

    const poolState = loadPoolState();
    const poolFeeRecipientHex = poolState.poolFeeRecipientHex;

    log.info('=== Expired Cancel (Story 8.3) Tests ===');

    let currentBlock = await provider.getBlockNumber();

    const expiredCancelStatePath = path.join(
        process.cwd(), 'tests', 'integration', 'expired-cancel-state.json',
    );

    if (fs.existsSync(expiredCancelStatePath)) {
        // =====================================================================
        // Run 2: Cancel the expired option
        // =====================================================================
        const ecState = JSON.parse(fs.readFileSync(expiredCancelStatePath, 'utf-8'));
        const ecOptionId = BigInt(ecState.optionId);
        const ecExpiryBlock = BigInt(ecState.expiryBlock);
        const ecCollateralAmount = BigInt(ecState.collateralAmount);
        currentBlock = await provider.getBlockNumber();

        if (currentBlock >= ecExpiryBlock) {
            log.info('\n=== Phase 9: Expired cancel (Story 8.3) ===');
            log.info(`Option ID: ${ecOptionId}, expired at block ${ecExpiryBlock}, current: ${currentBlock}`);

            let feeRecipMotoBeforeExpiredCancel = 0n;
            let writerMotoBeforeExpiredCancel = 0n;

            await runTest('Expired cancel: Capture pre-cancel balances', async () => {
                const feeQueryHex = poolFeeRecipientHex || walletHex;
                const [feeBalResult, writerBalResult] = await Promise.all([
                    provider.call(deployed.tokens.frogU, TOKEN_SELECTORS.balanceOf + buildBalanceOfCalldata(feeQueryHex)),
                    provider.call(deployed.tokens.frogU, TOKEN_SELECTORS.balanceOf + buildBalanceOfCalldata(walletHex)),
                ]);
                if (!isCallError(feeBalResult) && !feeBalResult.revert) {
                    feeRecipMotoBeforeExpiredCancel = feeBalResult.result.readU256();
                }
                if (!isCallError(writerBalResult) && !writerBalResult.revert) {
                    writerMotoBeforeExpiredCancel = writerBalResult.result.readU256();
                }
                log.info(`  Fee recipient MOTO before: ${formatBigInt(feeRecipMotoBeforeExpiredCancel)}`);
                log.info(`  Writer MOTO before:        ${formatBigInt(writerMotoBeforeExpiredCancel)}`);
                log.info(`  Expected collateral return: ${formatBigInt(ecCollateralAmount)} (100%, no fee)`);
                return { feeRecipBefore: feeRecipMotoBeforeExpiredCancel.toString(), writerBefore: writerMotoBeforeExpiredCancel.toString() };
            });

            await runTest('Expired cancel: Call cancelOption on expired option', async () => {
                const calldata = createCancelOptionCalldata(ecOptionId);
                currentBlock = await provider.getBlockNumber();
                const result = await deployer.callContract(poolAddress, calldata, 200_000n);
                log.info(`  Expired cancel TX: ${result.txId}`);
                try { currentBlock = await waitForBlock(provider, currentBlock, 3); } catch { log.warn('  Block timeout'); }
                return { txId: result.txId, optionId: ecOptionId.toString() };
            });

            await runTest('Expired cancel: Verify status = CANCELLED', async () => {
                const opt = await pollForOptionStatus(provider, poolCallAddr, ecOptionId, 4);
                log.info(`  Status: ${opt.status} (CANCELLED)`);
                return { status: opt.status };
            });

            await runTest('Expired cancel: Verify writer received 100% collateral (no fee)', async () => {
                const writerMotoAfter = await readTokenBalance(provider, deployed.tokens.frogU, walletHex);
                const received = writerMotoAfter - writerMotoBeforeExpiredCancel;
                log.info(`  Writer MOTO before: ${formatBigInt(writerMotoBeforeExpiredCancel)}`);
                log.info(`  Writer MOTO after:  ${formatBigInt(writerMotoAfter)}`);
                log.info(`  Received: ${formatBigInt(received)} (expected: ${formatBigInt(ecCollateralAmount)})`);
                if (received !== ecCollateralAmount) {
                    throw new Error(`Expected full collateral ${ecCollateralAmount}, got ${received}. Fee was charged on expired option!`);
                }
                log.info('  100% collateral returned — 0% fee on expired cancel confirmed');
                fs.unlinkSync(expiredCancelStatePath);
                log.info('  Expired cancel state file cleaned up.');
                return { received: received.toString(), expected: ecCollateralAmount.toString() };
            });

            await runTest('Expired cancel: Verify feeRecipient balance unchanged', async () => {
                const feeQueryHex = poolFeeRecipientHex || walletHex;
                const feeRecipMotoAfter = await readTokenBalance(provider, deployed.tokens.frogU, feeQueryHex);
                const feeReceived = feeRecipMotoAfter - feeRecipMotoBeforeExpiredCancel;
                log.info(`  Fee recipient MOTO before: ${formatBigInt(feeRecipMotoBeforeExpiredCancel)}`);
                log.info(`  Fee recipient MOTO after:  ${formatBigInt(feeRecipMotoAfter)}`);
                log.info(`  Fee received: ${formatBigInt(feeReceived)} (expected: 0)`);
                const isSeparate = feeQueryHex.toLowerCase() !== walletHex.toLowerCase();
                if (isSeparate && feeReceived !== 0n) {
                    throw new Error(`feeRecipient received ${feeReceived} — expected 0 for expired cancel!`);
                } else if (!isSeparate) {
                    log.info('  Note: writer == feeRecipient — net balance change covers refund');
                } else {
                    log.info('  feeRecipient balance unchanged — no fee on expired cancel confirmed');
                }
                return { feeReceived: feeReceived.toString(), expected: '0', separateRecipient: isSeparate };
            });
        } else {
            const blocksRemaining = ecExpiryBlock - currentBlock;
            log.info(`\n=== Phase 9: Expired cancel pending (${blocksRemaining} blocks until expiry) ===`);
            log.info(`  Option ID: ${ecOptionId}, expires at block ${ecExpiryBlock} (current: ${currentBlock})`);
            log.info(`  Estimated wait: ~${Number(blocksRemaining) * 10} minutes`);
            log.info('  Re-run after expiry to complete Phase 9.');
        }
    } else {
        // =====================================================================
        // Run 1: Write option with minimum expiry block, save state
        // =====================================================================
        const motoBalance = await readTokenBalance(provider, deployed.tokens.frogU, walletHex);

        if (poolAddress && motoBalance >= 1n * 10n ** 18n) {
            log.info('\n=== Phase 9: Story 8.3 setup — writing option with min expiry ===');

            const EC_AMOUNT = 1n * 10n ** 18n;
            const EC_STRIKE = 50n;
            const EC_PREMIUM = 1n * 10n ** 18n;

            let ecOptionId: bigint | null = null;

            let preEcCount = 0n;
            {
                const r = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
                if (!isCallError(r) && !r.revert) preEcCount = r.result.readU256();
            }

            await runTest('Expired cancel setup: Approve MOTO for pool', async () => {
                const poolAddr = Address.fromString(poolCallAddr);
                const calldata = createIncreaseAllowanceCalldata(poolAddr, EC_AMOUNT);
                const result = await deployer.callContract(deployed.tokens.frogU, calldata, 100_000n);
                log.info(`  Approve TX: ${result.txId}`);
                return { txId: result.txId };
            });

            await runTest('Expired cancel setup: Write CALL option (expiry = currentBlock + 1)', async () => {
                currentBlock = await provider.getBlockNumber();
                const expiry = currentBlock + 1n;
                const calldata = createWriteOptionCalldata(0, EC_STRIKE, expiry, EC_AMOUNT, EC_PREMIUM);
                const result = await deployer.callContract(poolAddress, calldata, 200_000n);
                log.info(`  Write TX: ${result.txId}`);

                const expectedCount = preEcCount + 1n;
                for (let attempt = 0; attempt < 24; attempt++) {
                    const r = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
                    if (!isCallError(r) && !r.revert) {
                        const count = r.result.readU256();
                        if (count >= expectedCount) {
                            ecOptionId = preEcCount;
                            log.info(`  New option ID: ${ecOptionId}, expiryBlock: ${expiry}`);

                            fs.writeFileSync(expiredCancelStatePath, JSON.stringify({
                                optionId: ecOptionId.toString(),
                                expiryBlock: expiry.toString(),
                                collateralAmount: EC_AMOUNT.toString(),
                                writerHex: walletHex,
                            }, null, 2));
                            log.info(`  State saved to expired-cancel-state.json. Re-run after block ${expiry} to complete.`);
                            break;
                        }
                    }
                    if (attempt < 23) {
                        log.info(`  Waiting for option to confirm (count still ${preEcCount})... (${attempt + 1}/24)`);
                        await new Promise((r) => setTimeout(r, 30_000));
                    }
                }
                return { txId: result.txId, expiryBlock: expiry.toString() };
            });
        } else {
            log.info('\n=== Phase 9: Expired cancel setup skipped (no pool or insufficient MOTO) ===');
        }
    }

    printSummary();
}

main().catch((error) => {
    console.error('Tests failed:', error);
    process.exit(1);
});
