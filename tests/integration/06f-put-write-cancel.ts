/**
 * 06f-put-write-cancel.ts
 *
 * PUT lifecycle + fee verification (from Phase 11 of the old 06-full-lifecycle).
 * Replaces both Phase 11 and the standalone 11-put-lifecycle.ts.
 *
 * Tests (~7):
 *   - Approve PILL collateral for pool
 *   - Write PUT option
 *   - Verify PUT exists (poll)
 *   - Read PUT state (optType=1, status=0)
 *   - Verify PILL locked in pool
 *   - Cancel PUT + verify CANCELLED (poll)
 *   - Verify feeRecipient received cancel fee in PILL (1%)
 *
 * Reads: pool-state.json
 * Dependencies: 06a. Completely independent of CALL tests.
 */

import 'dotenv/config';
import { Address } from '@btc-vision/transaction';
import {
    createTestHarness,
    initTestContext,
    isCallError,
    loadPoolState,
    readTokenBalance,
    readOptionStatus,
    buildBalanceOfCalldata,
    pollForOptionCount,
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

const { runTest, skipTest, printSummary } = createTestHarness('06f-put-write-cancel');

async function main() {
    const { deployed, provider, deployer, walletHex, poolAddress, poolCallAddr } = await initTestContext();
    const log = (await import('./config.js')).getLogger('06f-put-write-cancel');

    const poolState = loadPoolState();
    const poolFeeRecipientHex = poolState.poolFeeRecipientHex;

    log.info('=== PUT Write & Cancel Tests ===');

    const PUT_STRIKE = 50n * 10n ** 18n;     // 50 PILL per MOTO (18-decimal)
    const PUT_AMOUNT = 1n * 10n ** 18n;      // 1 MOTO (underlying amount for PUT)
    const PUT_PREMIUM = 3n * 10n ** 18n;     // 3 PILL premium
    // Collateral = (50e18 * 1e18) / 1e18 = 50e18 = 50 PILL
    const PUT_COLLATERAL = PUT_STRIKE * PUT_AMOUNT / (10n ** 18n);

    // Check writer PILL balance
    const writerPillBalance = await readTokenBalance(provider, deployed.tokens.frogP, walletHex);
    const hasPillForPut = writerPillBalance >= PUT_COLLATERAL;

    let currentBlock = await provider.getBlockNumber();

    if (!hasPillForPut) {
        const reason = `Insufficient PILL (have ${formatBigInt(writerPillBalance)}, need ${formatBigInt(PUT_COLLATERAL)})`;
        skipTest('PUT: Approve PILL collateral for pool', reason);
        skipTest('PUT: Write PUT option', reason);
        skipTest('PUT: Verify PUT option exists', reason);
        skipTest('PUT: Read PUT option state', reason);
        skipTest('PUT: Verify PILL locked in pool', reason);
        skipTest('PUT: Cancel PUT option', reason);
        skipTest('PUT: Verify feeRecipient received PUT cancel fee in PILL', reason);
    } else {
        log.info(`  Writer PILL balance: ${formatBigInt(writerPillBalance)}`);
        log.info(`  PUT collateral needed: ${formatBigInt(PUT_COLLATERAL)} PILL`);

        let putOptionId: bigint | null = null;

        // Record PILL balances before PUT write
        let prePutPoolPill = 0n;
        let prePutFeePill = 0n;
        {
            const poolCd = buildBalanceOfCalldata(poolCallAddr);
            const feeCd = poolFeeRecipientHex ? buildBalanceOfCalldata(poolFeeRecipientHex) : null;

            const pr = await provider.call(deployed.tokens.frogP, TOKEN_SELECTORS.balanceOf + poolCd);
            if (!isCallError(pr) && !pr.revert) prePutPoolPill = pr.result.readU256();

            if (feeCd) {
                const fr = await provider.call(deployed.tokens.frogP, TOKEN_SELECTORS.balanceOf + feeCd);
                if (!isCallError(fr) && !fr.revert) prePutFeePill = fr.result.readU256();
            }
        }

        // Approve PILL for pool
        await runTest('PUT: Approve PILL collateral for pool', async () => {
            const poolAddr = Address.fromString(poolCallAddr);
            const calldata = createIncreaseAllowanceCalldata(poolAddr, PUT_COLLATERAL);
            currentBlock = await provider.getBlockNumber();
            const result = await deployer.callContract(deployed.tokens.frogP, calldata, 50_000n);
            log.info(`  Approve PILL TX: ${result.txId}`);
            try { currentBlock = await waitForBlock(provider, currentBlock, 3); } catch { log.warn('  Block timeout'); }
            return { approved: true, txId: result.txId, amount: formatBigInt(PUT_COLLATERAL) };
        });

        // Read option count before write
        let prePutOptionCount = 0n;
        {
            const r = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
            if (!isCallError(r) && !r.revert) prePutOptionCount = r.result.readU256();
        }

        // Write PUT option
        await runTest('PUT: Write PUT option', async () => {
            currentBlock = await provider.getBlockNumber();
            const expiryBlock = currentBlock + 1000n;
            const calldata = createWriteOptionCalldata(1, PUT_STRIKE, expiryBlock, PUT_AMOUNT, PUT_PREMIUM);
            const result = await deployer.callContract(poolAddress, calldata, 200_000n);
            log.info(`  Write PUT TX: ${result.txId}`);
            return { txId: result.txId };
        });

        // Wait for the PUT option to appear
        await runTest('PUT: Verify PUT option exists', async () => {
            const count = await pollForOptionCount(provider, poolCallAddr, prePutOptionCount + 1n);
            putOptionId = prePutOptionCount;
            log.info(`  Option count: ${count}, PUT option ID: ${putOptionId}`);
            return { optionCount: count.toString(), optionId: putOptionId.toString() };
        });

        // Read PUT option state
        await runTest('PUT: Read PUT option state', async () => {
            if (putOptionId === null) throw new Error('No PUT option ID');
            const opt = await readOptionStatus(provider, poolCallAddr, putOptionId);
            if (!opt) throw new Error('Failed to read PUT option');

            log.info(`  optType: ${opt.optType} (1=PUT)`);
            log.info(`  strikePrice: ${opt.strikePrice}`);
            log.info(`  underlyingAmount: ${opt.underlyingAmount}`);
            log.info(`  premium: ${opt.premium}`);
            log.info(`  status: ${opt.status} (0=OPEN)`);

            if (opt.optType !== 1) throw new Error(`Expected PUT (1), got ${opt.optType}`);
            if (opt.status !== 0) throw new Error(`Expected OPEN (0), got ${opt.status}`);
            if (opt.strikePrice !== PUT_STRIKE) throw new Error(`Strike mismatch: ${opt.strikePrice} vs ${PUT_STRIKE}`);

            return { optionType: 'PUT', strikePrice: opt.strikePrice.toString(), status: opt.status };
        });

        // Verify PILL locked in pool
        await runTest('PUT: Verify PILL locked in pool', async () => {
            const poolCd = buildBalanceOfCalldata(poolCallAddr);
            const pr = await provider.call(deployed.tokens.frogP, TOKEN_SELECTORS.balanceOf + poolCd);
            if (isCallError(pr) || pr.revert) throw new Error('Failed to read pool PILL balance');

            const postPoolPill = pr.result.readU256();
            const pillIncrease = postPoolPill - prePutPoolPill;
            log.info(`  Pool PILL before: ${formatBigInt(prePutPoolPill)}`);
            log.info(`  Pool PILL after:  ${formatBigInt(postPoolPill)}`);
            log.info(`  PILL increase:    ${formatBigInt(pillIncrease)}`);
            log.info(`  Expected:         ${formatBigInt(PUT_COLLATERAL)}`);

            if (pillIncrease < PUT_COLLATERAL) {
                throw new Error(`Pool PILL increase ${pillIncrease} less than expected ${PUT_COLLATERAL}`);
            }

            return { poolPillBefore: formatBigInt(prePutPoolPill), poolPillAfter: formatBigInt(postPoolPill), collateralLocked: formatBigInt(pillIncrease) };
        });

        // Cancel PUT and verify fee in PILL
        await runTest('PUT: Cancel PUT option', async () => {
            if (putOptionId === null) throw new Error('No PUT option ID');
            const calldata = createCancelOptionCalldata(putOptionId);
            currentBlock = await provider.getBlockNumber();
            const result = await deployer.callContract(poolAddress, calldata, 200_000n);
            log.info(`  Cancel PUT TX: ${result.txId}`);
            try { currentBlock = await waitForBlock(provider, currentBlock, 3); } catch { log.warn('  Block timeout'); }

            // Poll for status = CANCELLED (4)
            await pollForOptionStatus(provider, poolCallAddr, putOptionId!, 4, 12);
            log.info(`  PUT option cancelled (status=4)`);
            return { txId: result.txId, status: 'CANCELLED' };
        });

        // Verify fee recipient received cancel fee in PILL
        await runTest('PUT: Verify feeRecipient received PUT cancel fee in PILL', async () => {
            if (!poolFeeRecipientHex) throw new Error('No fee recipient');
            const postFeePill = await readTokenBalance(provider, deployed.tokens.frogP, poolFeeRecipientHex);
            const feeReceived = postFeePill - prePutFeePill;

            // Expected: ceiling(50e18 * 100 / 10000) = ceiling(50e16) = 5e17 = 0.5 PILL
            const expectedFee = (PUT_COLLATERAL * 100n + 9999n) / 10000n;
            log.info(`  Fee recipient PILL before: ${formatBigInt(prePutFeePill)}`);
            log.info(`  Fee recipient PILL after:  ${formatBigInt(postFeePill)}`);
            log.info(`  Fee received: ${formatBigInt(feeReceived)}`);
            log.info(`  Expected fee: ${formatBigInt(expectedFee)}`);

            if (feeReceived < expectedFee) {
                throw new Error(`Fee ${feeReceived} less than expected ${expectedFee}`);
            }

            return { feeReceivedPill: formatBigInt(feeReceived), expectedFee: formatBigInt(expectedFee) };
        });
    }

    printSummary();
}

main().catch((error) => {
    console.error('Tests failed:', error);
    process.exit(1);
});
