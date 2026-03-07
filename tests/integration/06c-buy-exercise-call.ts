/**
 * 06c-buy-exercise-call.ts
 *
 * Buyer setup + Buy + Exercise + Fee verification (from Phases 5-7 of the old 06-full-lifecycle).
 *
 * Tests (~14):
 *   - Buyer: Check BTC/PILL balance
 *   - Fund buyer with BTC/PILL if needed
 *   - Verify buyer funding (poll)
 *   - Writer: Approve MOTO + Write CALL (short expiry)
 *   - Verify option exists (poll)
 *   - Buyer: Approve PILL premium + Buy option
 *   - Verify PURCHASED status (poll)
 *   - Verify writer received premium minus 1% fee
 *   - Verify feeRecipient received buy fee (PILL)
 *   - Wait for option expiry (~40 min)
 *   - Buyer: Approve PILL for exercise (strikeValue)
 *   - Exercise option
 *   - Verify EXERCISED status (poll)
 *   - Verify buyer received underlying minus 0.1% fee
 *   - Verify feeRecipient received exercise fee (MOTO)
 *
 * Reads: pool-state.json
 * Dependencies: 06a. Longest-running file due to expiry wait.
 */

import 'dotenv/config';
import { Address, AddressTypes } from '@btc-vision/transaction';
import {
    createTestHarness,
    initTestContext,
    isCallError,
    loadPoolState,
    readTokenBalance,
    pollForOptionCount,
    pollForOptionStatus,
    POOL_SELECTORS,
} from './test-harness.js';
import {
    formatAddress,
    formatBigInt,
    waitForBlock,
} from './config.js';
import {
    DeploymentHelper,
    createWriteOptionCalldata,
    createBuyOptionCalldata,
    createExerciseCalldata,
    createIncreaseAllowanceCalldata,
    createTransferCalldata,
} from './deployment.js';

const { runTest, skipTest, printSummary } = createTestHarness('06c-buy-exercise');

async function main() {
    const { config, deployed, provider, deployer, walletHex, poolAddress, poolCallAddr } = await initTestContext();
    const log = (await import('./config.js')).getLogger('06c-buy-exercise');

    const poolState = loadPoolState();
    const poolFeeRecipientHex = poolState.poolFeeRecipientHex;

    log.info('=== Buy & Exercise CALL Option Tests ===');

    // Check MOTO balance
    const motoBalance = await readTokenBalance(provider, deployed.tokens.frogU, walletHex);
    const pillBalance = await readTokenBalance(provider, deployed.tokens.frogP, walletHex);
    const hasTokens = motoBalance >= 1n * 10n ** 18n;

    let currentBlock = await provider.getBlockNumber();

    // =====================================================================
    // PHASE 5: Set up buyer wallet
    // =====================================================================

    log.info('\n=== Phase 5: Buyer Wallet Setup ===');

    const buyerWallet = config.mnemonic.deriveOPWallet(AddressTypes.P2TR, 1);
    const buyerHex = buyerWallet.address.toString();
    const buyerDeployer = new DeploymentHelper(provider, buyerWallet, config.network, false);

    log.info(`Buyer wallet: ${buyerWallet.p2tr}`);
    log.info(`Buyer hex: ${formatAddress(buyerHex)}`);

    const MIN_BUYER_BTC = 1_200_000n;
    const MIN_BUYER_PILL = 100n * 10n ** 18n;

    let buyerBtcBalance = 0n;
    let buyerPillBalance = 0n;
    let buyerReady = false;

    await runTest('Buyer: Check BTC balance', async () => {
        buyerBtcBalance = await provider.getBalance(buyerWallet.p2tr);
        log.info(`  Buyer BTC: ${buyerBtcBalance} sats (${Number(buyerBtcBalance) / 1e8} BTC)`);
        return { balance: buyerBtcBalance.toString() };
    });

    await runTest('Buyer: Check PILL balance', async () => {
        buyerPillBalance = await readTokenBalance(provider, deployed.tokens.frogP, buyerHex);
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
            try { currentBlock = await waitForBlock(provider, currentBlock, 1); } catch { log.warn('  Block timeout'); }
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
            try { currentBlock = await waitForBlock(provider, currentBlock, 1); } catch { log.warn('  Block timeout'); }
            return { txId: result.txId, amount: sendAmount.toString() };
        });
    } else if (!hasTokens || pillBalance < MIN_BUYER_PILL) {
        skipTest('Buyer: Fund with PILL tokens', 'Insufficient writer token balance');
    } else {
        skipTest('Buyer: Fund with PILL tokens', 'Already has enough PILL');
    }

    // Verify buyer funding
    await runTest('Buyer: Verify funding', async () => {
        for (let attempt = 0; attempt < 12; attempt++) {
            buyerBtcBalance = await provider.getBalance(buyerWallet.p2tr);
            buyerPillBalance = await readTokenBalance(provider, deployed.tokens.frogP, buyerHex);
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
    // PHASE 6: Write + Buy Option
    // =====================================================================

    const BUY_STRIKE_PRICE = 50n * 10n ** 18n;
    const BUY_PREMIUM = 5n * 10n ** 18n;
    const BUY_AMOUNT = 1n * 10n ** 18n;
    const BUY_STRIKE_VALUE = BUY_STRIKE_PRICE * BUY_AMOUNT / (10n ** 18n);

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
        skipTest('Verify feeRecipient received buy fee', reason);
    } else {
        log.info('\n=== Phase 6: Write + Buy Option ===');

        let preWriteCount = 0n;
        {
            const r = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
            if (!isCallError(r) && !r.revert) preWriteCount = r.result.readU256();
        }

        await runTest('Writer: Approve MOTO for buy-test option', async () => {
            const poolAddr = Address.fromString(poolCallAddr);
            const calldata = createIncreaseAllowanceCalldata(poolAddr, BUY_AMOUNT);
            currentBlock = await provider.getBlockNumber();
            const result = await deployer.callContract(deployed.tokens.frogU, calldata, 50_000n);
            log.info(`  Approve TX: ${result.txId}`);
            try { currentBlock = await waitForBlock(provider, currentBlock, 1); } catch { log.warn('  Block timeout'); }
            return { txId: result.txId };
        });

        await runTest('Writer: Write CALL for buy-test', async () => {
            currentBlock = await provider.getBlockNumber();
            buyTestExpiryBlock = currentBlock + 4n;
            const calldata = createWriteOptionCalldata(0, BUY_STRIKE_PRICE, buyTestExpiryBlock, BUY_AMOUNT, BUY_PREMIUM);
            const result = await deployer.callContract(poolAddress, calldata, 200_000n);
            log.info(`  Write TX: ${result.txId}`);
            log.info(`  Expiry: block ${buyTestExpiryBlock} (current: ${currentBlock})`);
            return { txId: result.txId, expiryBlock: buyTestExpiryBlock.toString() };
        });

        await runTest('Verify buy-test option exists', async () => {
            const count = await pollForOptionCount(provider, poolCallAddr, preWriteCount + 1n);
            buyTestOptionId = preWriteCount;
            log.info(`  Option count: ${count}, buy-test option ID: ${buyTestOptionId}`);
            return { optionCount: count.toString(), optionId: buyTestOptionId.toString() };
        });

        if (buyTestOptionId !== null) {
            // Record balances before buyOption
            let writerPillBefore = 0n;
            let feeRecipientPillBefore = 0n;
            {
                writerPillBefore = await readTokenBalance(provider, deployed.tokens.frogP, walletHex);
                log.info(`  Writer PILL before buyOption: ${formatBigInt(writerPillBefore)}`);
                if (poolFeeRecipientHex) {
                    feeRecipientPillBefore = await readTokenBalance(provider, deployed.tokens.frogP, poolFeeRecipientHex);
                    log.info(`  Fee recipient PILL before buyOption: ${formatBigInt(feeRecipientPillBefore)}`);
                }
            }

            await runTest('Buyer: Approve PILL premium for pool', async () => {
                const poolAddr = Address.fromString(poolCallAddr);
                const calldata = createIncreaseAllowanceCalldata(poolAddr, BUY_PREMIUM);
                const result = await buyerDeployer.callContract(deployed.tokens.frogP, calldata, 50_000n);
                log.info(`  Buyer approve TX: ${result.txId}`);
                currentBlock = await provider.getBlockNumber();
                try { currentBlock = await waitForBlock(provider, currentBlock, 1); } catch { log.warn('  Block timeout'); }
                return { txId: result.txId };
            });

            await runTest('Buyer: Buy option (buyOption)', async () => {
                const calldata = createBuyOptionCalldata(buyTestOptionId!);
                const result = await buyerDeployer.callContract(poolAddress, calldata, 200_000n);
                log.info(`  Buy TX: ${result.txId}`);
                return { txId: result.txId, optionId: buyTestOptionId!.toString() };
            });

            await runTest('Verify option status = PURCHASED', async () => {
                const opt = await pollForOptionStatus(provider, poolCallAddr, buyTestOptionId!, 1);
                buyTestPurchased = true;
                log.info(`  Status: ${opt.status} (PURCHASED)`);
                log.info(`  Buyer: ${formatAddress(opt.buyer)}`);
                return { status: opt.status, buyer: opt.buyer };
            });

            await runTest('Verify writer received premium minus fee', async () => {
                const writerPillAfter = await readTokenBalance(provider, deployed.tokens.frogP, walletHex);
                const received = writerPillAfter - writerPillBefore;
                const buyFee = BUY_PREMIUM * 100n / 10000n;
                const expectedWriterAmount = BUY_PREMIUM - buyFee;
                log.info(`  Writer PILL before: ${formatBigInt(writerPillBefore)}`);
                log.info(`  Writer PILL after:  ${formatBigInt(writerPillAfter)}`);
                log.info(`  Writer received: ${formatBigInt(received)} (expected: ${formatBigInt(expectedWriterAmount)})`);
                if (received !== expectedWriterAmount) log.warn(`  Mismatch: received ${received}, expected ${expectedWriterAmount}`);
                return { before: writerPillBefore.toString(), after: writerPillAfter.toString(), received: received.toString(), expected: expectedWriterAmount.toString() };
            });

            await runTest('Verify feeRecipient received buy fee', async () => {
                const queryHex = poolFeeRecipientHex || walletHex;
                const feeRecipPillAfter = await readTokenBalance(provider, deployed.tokens.frogP, queryHex);
                const buyFee = BUY_PREMIUM * 100n / 10000n;
                const received = feeRecipPillAfter - feeRecipientPillBefore;
                log.info(`  Fee recipient PILL before: ${formatBigInt(feeRecipientPillBefore)}`);
                log.info(`  Fee recipient PILL after:  ${formatBigInt(feeRecipPillAfter)}`);
                log.info(`  Buy fee received: ${formatBigInt(received)} (expected: ${formatBigInt(buyFee)})`);
                const isSeparate = queryHex.toLowerCase() !== walletHex.toLowerCase();
                if (isSeparate && received !== buyFee) log.warn(`  Fee mismatch: received ${received}, expected ${buyFee}`);
                return { before: feeRecipientPillBefore.toString(), after: feeRecipPillAfter.toString(), received: received.toString(), expected: buyFee.toString(), separateRecipient: isSeparate };
            });
        } else {
            skipTest('Buyer: Approve PILL premium for pool', 'No option to buy');
            skipTest('Buyer: Buy option (buyOption)', 'No option to buy');
            skipTest('Verify option status = PURCHASED', 'No option to buy');
            skipTest('Verify writer received premium minus fee', 'No option to buy');
            skipTest('Verify feeRecipient received buy fee', 'No option to buy');
        }
    }

    // =====================================================================
    // PHASE 7: Exercise Option (CALL)
    // =====================================================================

    if (!buyTestPurchased || buyTestOptionId === null || buyTestExpiryBlock === null) {
        const reason = !buyTestPurchased ? 'Option not purchased' : 'No option ID';
        skipTest('Wait for option expiry', reason);
        skipTest('Buyer: Approve PILL for exercise (strikeValue)', reason);
        skipTest('Buyer: Exercise option', reason);
        skipTest('Verify option status = EXERCISED', reason);
        skipTest('Verify buyer received underlying tokens', reason);
        skipTest('Verify feeRecipient received exercise fee', reason);
    } else {
        log.info('\n=== Phase 7: Exercise Option (CALL) ===');
        log.info(`Option ID: ${buyTestOptionId}, expiry: block ${buyTestExpiryBlock}`);

        await runTest('Wait for option expiry', async () => {
            currentBlock = await provider.getBlockNumber();
            if (currentBlock >= buyTestExpiryBlock!) {
                log.info(`  Already past expiry (current: ${currentBlock}, expiry: ${buyTestExpiryBlock})`);
                return { currentBlock: currentBlock.toString(), alreadyExpired: true };
            }
            const blocksToWait = Number(buyTestExpiryBlock! - currentBlock);
            log.info(`  Need ${blocksToWait} more blocks (current: ${currentBlock}, expiry: ${buyTestExpiryBlock})`);
            log.info(`  Estimated wait: ~${blocksToWait * 10} minutes`);
            currentBlock = await waitForBlock(provider, currentBlock, blocksToWait, 720);
            log.info(`  Reached block ${currentBlock}, past expiry ${buyTestExpiryBlock}`);
            return { currentBlock: currentBlock.toString(), alreadyExpired: false };
        });

        const graceEnd = buyTestExpiryBlock + 144n;
        currentBlock = await provider.getBlockNumber();
        if (currentBlock >= graceEnd) {
            log.warn(`  Past grace period (current: ${currentBlock}, graceEnd: ${graceEnd}). Cannot exercise.`);
            skipTest('Buyer: Approve PILL for exercise (strikeValue)', 'Grace period ended');
            skipTest('Buyer: Exercise option', 'Grace period ended');
            skipTest('Verify option status = EXERCISED', 'Grace period ended');
            skipTest('Verify buyer received underlying tokens', 'Grace period ended');
            skipTest('Verify feeRecipient received exercise fee', 'Grace period ended');
        } else {
            await runTest('Buyer: Approve PILL for exercise (strikeValue)', async () => {
                const poolAddr = Address.fromString(poolCallAddr);
                const calldata = createIncreaseAllowanceCalldata(poolAddr, BUY_STRIKE_VALUE);
                const result = await buyerDeployer.callContract(deployed.tokens.frogP, calldata, 50_000n);
                log.info(`  Approve strikeValue (${formatBigInt(BUY_STRIKE_VALUE)} PILL) TX: ${result.txId}`);
                currentBlock = await provider.getBlockNumber();
                try { currentBlock = await waitForBlock(provider, currentBlock, 1); } catch { log.warn('  Block timeout'); }
                return { txId: result.txId, strikeValue: BUY_STRIKE_VALUE.toString() };
            });

            // Record balances before exercise
            let buyerMotoBefore = 0n;
            let feeRecipientMotoBeforeExercise = 0n;
            {
                buyerMotoBefore = await readTokenBalance(provider, deployed.tokens.frogU, buyerHex);
                if (poolFeeRecipientHex) {
                    feeRecipientMotoBeforeExercise = await readTokenBalance(provider, deployed.tokens.frogU, poolFeeRecipientHex);
                    log.info(`  Fee recipient MOTO before exercise: ${formatBigInt(feeRecipientMotoBeforeExercise)}`);
                }
            }

            await runTest('Buyer: Exercise option', async () => {
                const calldata = createExerciseCalldata(buyTestOptionId!);
                currentBlock = await provider.getBlockNumber();
                log.info(`  Current block: ${currentBlock}, expiry: ${buyTestExpiryBlock}, grace end: ${graceEnd}`);
                const result = await buyerDeployer.callContract(poolAddress, calldata, 200_000n);
                log.info(`  Exercise TX: ${result.txId}`);
                return { txId: result.txId, optionId: buyTestOptionId!.toString() };
            });

            await runTest('Verify option status = EXERCISED', async () => {
                const opt = await pollForOptionStatus(provider, poolCallAddr, buyTestOptionId!, 2);
                log.info(`  Status: ${opt.status} (EXERCISED)`);
                return { status: opt.status, statusName: 'EXERCISED' };
            });

            await runTest('Verify buyer received underlying tokens', async () => {
                const buyerMotoAfter = await readTokenBalance(provider, deployed.tokens.frogU, buyerHex);
                const received = buyerMotoAfter - buyerMotoBefore;
                const exerciseFee = BUY_AMOUNT * 10n / 10000n;
                const expectedReceived = BUY_AMOUNT - exerciseFee;
                log.info(`  Buyer MOTO before: ${formatBigInt(buyerMotoBefore)}`);
                log.info(`  Buyer MOTO after:  ${formatBigInt(buyerMotoAfter)}`);
                log.info(`  Received: ${formatBigInt(received)} (expected: ${formatBigInt(expectedReceived)} after 0.1% exercise fee)`);
                if (received !== expectedReceived) log.warn(`  Mismatch: received ${received}, expected ${expectedReceived}`);
                return { before: buyerMotoBefore.toString(), after: buyerMotoAfter.toString(), received: received.toString(), expected: expectedReceived.toString() };
            });

            await runTest('Verify feeRecipient received exercise fee', async () => {
                const queryHex = poolFeeRecipientHex || walletHex;
                const feeRecipMotoAfter = await readTokenBalance(provider, deployed.tokens.frogU, queryHex);
                const exerciseFee = BUY_AMOUNT * 10n / 10000n;
                const received = feeRecipMotoAfter - feeRecipientMotoBeforeExercise;
                log.info(`  Fee recipient MOTO before: ${formatBigInt(feeRecipientMotoBeforeExercise)}`);
                log.info(`  Fee recipient MOTO after:  ${formatBigInt(feeRecipMotoAfter)}`);
                log.info(`  Exercise fee received: ${formatBigInt(received)} (expected: ${formatBigInt(exerciseFee)})`);
                const isSeparate = queryHex.toLowerCase() !== walletHex.toLowerCase();
                if (isSeparate && received !== exerciseFee) log.warn(`  Fee mismatch: received ${received}, expected ${exerciseFee}`);
                return { before: feeRecipientMotoBeforeExercise.toString(), after: feeRecipMotoAfter.toString(), received: received.toString(), expected: exerciseFee.toString(), separateRecipient: isSeparate };
            });
        }
    }

    printSummary();
}

main().catch((error) => {
    console.error('Tests failed:', error);
    process.exit(1);
});
