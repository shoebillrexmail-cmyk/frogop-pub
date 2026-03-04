/**
 * 06d-settle-prep.ts
 *
 * Write + Buy for future settle (from Phase 8 of the old 06-full-lifecycle).
 *
 * Tests (~7):
 *   - Writer: Approve MOTO + Write CALL (short expiry)
 *   - Verify option exists (poll)
 *   - Re-fund buyer BTC if needed
 *   - Buyer: Approve PILL + Buy option
 *   - Verify PURCHASED + save settle-state.json
 *   - Check for pending settle from previous run → execute if grace ended
 *
 * Reads: pool-state.json
 * Writes: settle-state.json
 * Dependencies: 06a.
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
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
    waitForBlock,
} from './config.js';
import {
    DeploymentHelper,
    createWriteOptionCalldata,
    createBuyOptionCalldata,
    createSettleCalldata,
    createIncreaseAllowanceCalldata,
} from './deployment.js';

const { runTest, skipTest, printSummary } = createTestHarness('06d-settle-prep');

async function main() {
    const { config, deployed, provider, deployer, walletHex, poolAddress, poolCallAddr } = await initTestContext();
    const log = (await import('./config.js')).getLogger('06d-settle-prep');

    loadPoolState();

    log.info('=== Settle Prep Tests ===');

    // Check readiness
    const motoBalance = await readTokenBalance(provider, deployed.tokens.frogU, walletHex);
    const hasTokens = motoBalance >= 1n * 10n ** 18n;

    const buyerWallet = config.mnemonic.deriveOPWallet(AddressTypes.P2TR, 1);
    const buyerHex = buyerWallet.address.toString();
    const buyerDeployer = new DeploymentHelper(provider, buyerWallet, config.network, false);
    let buyerBtcBalance = await provider.getBalance(buyerWallet.p2tr);
    const buyerPillBalance = await readTokenBalance(provider, deployed.tokens.frogP, buyerHex);
    const buyerReady = buyerBtcBalance >= 100_000n && buyerPillBalance >= 5n * 10n ** 18n;

    let currentBlock = await provider.getBlockNumber();

    const BUY_STRIKE_PRICE = 50n * 10n ** 18n;
    const BUY_PREMIUM = 5n * 10n ** 18n;
    const BUY_AMOUNT = 1n * 10n ** 18n;

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

        let preSettleCount = 0n;
        {
            const r = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
            if (!isCallError(r) && !r.revert) preSettleCount = r.result.readU256();
        }

        await runTest('Settle prep: Writer approve MOTO', async () => {
            const poolAddr = Address.fromString(poolCallAddr);
            const calldata = createIncreaseAllowanceCalldata(poolAddr, BUY_AMOUNT);
            currentBlock = await provider.getBlockNumber();
            const result = await deployer.callContract(deployed.tokens.frogU, calldata, 50_000n);
            log.info(`  Approve TX: ${result.txId}`);
            try { currentBlock = await waitForBlock(provider, currentBlock, 1); } catch { log.warn('  Block timeout'); }
            return { txId: result.txId };
        });

        await runTest('Settle prep: Writer write CALL', async () => {
            currentBlock = await provider.getBlockNumber();
            settleExpiryBlock = currentBlock + 6n;
            const calldata = createWriteOptionCalldata(0, BUY_STRIKE_PRICE, settleExpiryBlock, BUY_AMOUNT, BUY_PREMIUM);
            const result = await deployer.callContract(poolAddress, calldata, 200_000n);
            log.info(`  Write TX: ${result.txId}`);
            log.info(`  Expiry: block ${settleExpiryBlock}`);
            return { txId: result.txId, expiryBlock: settleExpiryBlock.toString() };
        });

        await runTest('Settle prep: Verify option exists', async () => {
            await pollForOptionCount(provider, poolCallAddr, preSettleCount + 1n);
            settleOptionId = preSettleCount;
            log.info(`  Settle-prep option ID: ${settleOptionId}`);
            return { optionId: settleOptionId.toString() };
        });

        if (settleOptionId !== null) {
            // Re-fund buyer with BTC if needed
            buyerBtcBalance = await provider.getBalance(buyerWallet.p2tr);
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

            await runTest('Settle prep: Buyer approve PILL premium', async () => {
                const poolAddr = Address.fromString(poolCallAddr);
                const calldata = createIncreaseAllowanceCalldata(poolAddr, BUY_PREMIUM);
                const result = await buyerDeployer.callContract(deployed.tokens.frogP, calldata, 50_000n);
                log.info(`  Buyer approve TX: ${result.txId}`);
                currentBlock = await provider.getBlockNumber();
                try { currentBlock = await waitForBlock(provider, currentBlock, 1); } catch { log.warn('  Block timeout'); }
                return { txId: result.txId };
            });

            await runTest('Settle prep: Buyer buy option', async () => {
                const calldata = createBuyOptionCalldata(settleOptionId!);
                const result = await buyerDeployer.callContract(poolAddress, calldata, 200_000n);
                log.info(`  Buy TX: ${result.txId}`);
                currentBlock = await provider.getBlockNumber();
                try { currentBlock = await waitForBlock(provider, currentBlock, 1); } catch { log.warn('  Block timeout'); }
                return { txId: result.txId };
            });

            await runTest('Settle prep: Verify PURCHASED + save state', async () => {
                const opt = await pollForOptionStatus(provider, poolCallAddr, settleOptionId!, 1, 40);
                log.info(`  Status: ${opt.status} (PURCHASED) - ready for settle`);

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
                const result = await deployer.callContract(poolAddress, calldata, 200_000n);
                log.info(`  Settle TX: ${result.txId}`);
                return { txId: result.txId, optionId: settleState.optionId };
            });

            await runTest('Settle: Verify option status = EXPIRED', async () => {
                const optId = BigInt(settleState.optionId);
                const opt = await pollForOptionStatus(provider, poolCallAddr, optId, 3);
                log.info(`  Status: ${opt.status} (EXPIRED/SETTLED)`);
                fs.unlinkSync(settleStatePath);
                log.info('  Settle state file cleaned up.');
                return { status: opt.status, statusName: 'EXPIRED' };
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

main().catch((error) => {
    console.error('Tests failed:', error);
    process.exit(1);
});
