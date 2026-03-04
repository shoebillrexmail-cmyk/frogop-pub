/**
 * 06a-pool-state.ts
 *
 * Pool reads + fee recipient setup (from Phases 1-3 of the old 06-full-lifecycle).
 * Writes pool-state.json consumed by 06b-06f.
 *
 * Tests (~7):
 *   - Check/create pool
 *   - Check MOTO balance
 *   - Check PILL balance
 *   - Check wallet BTC balance
 *   - Read initial option count
 *   - Read fee configuration (buyFeeBps=100, exerciseFeeBps=10)
 *   - Set fee recipient to dedicated address
 *
 * Dependencies: Requires deployed contracts (01+02). Can run independently.
 */

import 'dotenv/config';
import { Address, AddressTypes } from '@btc-vision/transaction';
import {
    createTestHarness,
    isCallError,
    readTokenBalance,
    savePoolState,
    getConfig,
    loadDeployedContracts,
    getLogger,
    POOL_SELECTORS,
} from './test-harness.js';
import {
    saveDeployedContracts,
    formatAddress,
    formatBigInt,
    waitForBlock,
} from './config.js';
import {
    DeploymentHelper,
    createUpdateFeeRecipientCalldata,
} from './deployment.js';
import { JSONRpcProvider } from 'opnet';

const log = getLogger('06a-pool-state');
const { runTest, printSummary } = createTestHarness('06a-pool-state');

async function main() {
    log.info('=== FroGop Pool State & Fee Config Tests ===');
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

    // Resolve token hex addresses
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

    const walletHex = config.wallet.address.toString();
    log.info(`Wallet hex: ${formatAddress(walletHex)}`);

    // Dedicated fee recipient (mnemonic index 2)
    const feeRecipientWallet = config.mnemonic.deriveOPWallet(AddressTypes.P2TR, 2);
    const feeRecipientHex = feeRecipientWallet.address.toString();
    const feeRecipientAddress = feeRecipientWallet.address;
    log.info(`Dedicated fee recipient (index 2): ${formatAddress(feeRecipientHex)}`);

    // =====================================================================
    // PHASE 1: Ensure pool exists
    // =====================================================================

    let poolAddress: string | null = deployed.pool || null;

    await runTest('Check/create pool', async () => {
        if (poolAddress) {
            log.info(`  Pool already saved: ${formatAddress(poolAddress)}`);
            return { poolAddress, source: 'saved' };
        }

        log.info('  Deploying pool directly...');
        const { createPoolCalldata, getWasmPath } = await import('./deployment.js');
        const calldata = createPoolCalldata(motoAddress, pillAddress, feeRecipientAddress);
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
    // PHASE 2: Check token balances
    // =====================================================================

    await runTest('Check MOTO balance (via provider.call)', async () => {
        const balance = await readTokenBalance(provider, deployed.tokens.frogU, walletHex);
        log.info(`  MOTO balance: ${balance} (${formatBigInt(balance)})`);
        return { balance: balance.toString() };
    });

    await runTest('Check PILL balance (via provider.call)', async () => {
        const balance = await readTokenBalance(provider, deployed.tokens.frogP, walletHex);
        log.info(`  PILL balance: ${balance} (${formatBigInt(balance)})`);
        return { balance: balance.toString() };
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
    let poolFeeRecipientHex = '';

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
        poolFeeRecipientHex = feeRecip.toString();
        log.info(`  Fee recipient: ${formatAddress(poolFeeRecipientHex)}`);
        log.info(`  Buy fee: ${buyBps} bps (${Number(buyBps) / 100}%)`);
        log.info(`  Exercise fee: ${exerciseBps} bps (${Number(exerciseBps) / 100}%)`);
        if (buyBps !== 100n) throw new Error(`Expected buyFeeBps=100, got ${buyBps}`);
        if (exerciseBps !== 10n) throw new Error(`Expected exerciseFeeBps=10, got ${exerciseBps}`);
        return { feeRecipient: poolFeeRecipientHex, buyFeeBps: buyBps.toString(), exerciseFeeBps: exerciseBps.toString() };
    });

    // Update fee recipient if needed
    await runTest('Pool: Set fee recipient to dedicated address', async () => {
        if (!poolFeeRecipientHex) {
            log.warn('  poolFeeRecipientHex not set — skipping fee recipient update');
            return { skipped: true };
        }

        if (poolFeeRecipientHex.toLowerCase() === feeRecipientHex.toLowerCase()) {
            log.info(`  Fee recipient already set to dedicated address: ${formatAddress(poolFeeRecipientHex)}`);
            return { alreadySet: true };
        }

        if (poolFeeRecipientHex.toLowerCase() !== walletHex.toLowerCase()) {
            log.warn(`  Current fee recipient (${formatAddress(poolFeeRecipientHex)}) is not deployer — cannot update`);
            log.warn(`  Re-deploy pool or manually call updateFeeRecipient from the current fee recipient`);
            return { skipped: true, currentFeeRecipient: poolFeeRecipientHex };
        }

        log.info(`  Updating fee recipient: ${formatAddress(walletHex)} → ${formatAddress(feeRecipientHex)}`);
        const calldata = createUpdateFeeRecipientCalldata(feeRecipientAddress);
        currentBlock = await provider.getBlockNumber();
        const result = await deployer.callContract(poolAddress!, calldata, 50_000n);
        log.info(`  UpdateFeeRecipient TX: ${result.txId}`);

        try { currentBlock = await waitForBlock(provider, currentBlock, 3); } catch { log.warn('  Block timeout'); }

        for (let attempt = 0; attempt < 12; attempt++) {
            const r = await provider.call(poolCallAddr, POOL_SELECTORS.feeRecipient);
            if (!isCallError(r) && !r.revert) {
                const updated = r.result.readAddress().toString();
                if (updated.toLowerCase() === feeRecipientHex.toLowerCase()) {
                    poolFeeRecipientHex = updated;
                    log.info(`  Fee recipient confirmed: ${formatAddress(poolFeeRecipientHex)}`);
                    return { updated: true, txId: result.txId, newRecipient: poolFeeRecipientHex };
                }
            }
            if (attempt < 11) {
                log.info(`  Waiting for fee recipient update... (${attempt + 1}/12)`);
                await new Promise(r => setTimeout(r, 30_000));
            }
        }
        throw new Error('Fee recipient update not confirmed after polling. Re-run later.');
    });

    // =====================================================================
    // Save pool-state.json for 06b-06f
    // =====================================================================

    savePoolState({
        poolCallAddr,
        poolFeeRecipientHex,
        initialOptionCount: initialOptionCount.toString(),
        updatedAt: new Date().toISOString(),
    });
    log.info('  Wrote pool-state.json');

    printSummary();
}

main().catch((error) => {
    log.error('Tests failed:', error);
    process.exit(1);
});
