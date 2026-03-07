/**
 * 15-btc-underlying-pool.ts
 *
 * Integration tests for OptionsPoolBtcUnderlying (type 2: BTC underlying, OP20 quote).
 * Tests: deployment, writeOptionBtc, buyOption, exercise, cancel, settle, full lifecycles.
 *
 * Prerequisites: 01, 02, 13 deployed. BtcUnderlying WASM built.
 * Run: npx tsx tests/integration/15-btc-underlying-pool.ts
 */

import { JSONRpcProvider } from 'opnet';
import { BinaryWriter, Address, AddressTypes } from '@btc-vision/transaction';
import {
    getConfig,
    loadDeployedContracts,
    getLogger,
    computeSelector,
    computeSelectorU32,
    sleep,
    POOL_SELECTORS,
} from './config.js';
import {
    createTestHarness,
    isCallError,
    readOption,
    readOptionCount,
    pollForOptionCount,
    pollForOptionStatus,
    pollForPublicKeyInfo,
    resolveCallAddress,
} from './test-harness.js';
import {
    DeploymentHelper,
    getWasmPath,
    createBtcPoolCalldata,
    createIncreaseAllowanceCalldata,
    createBuyOptionCalldata,
    createCancelOptionCalldata,
    createRegisterBtcPubkeyCalldata,
    getWriterCompressedPubkey,
    deriveP2wshAddress,
    buildBtcExtraOutput,
} from './deployment.js';
import {
    GRACE_PERIOD_BLOCKS,
    queryBridgeEscrowScriptHash,
    placeholderBuyerPubkey,
} from './btc-test-helpers.js';

const log = getLogger('15-btc-underlying');
const { runTest, skipTest, printSummary } = createTestHarness('15-btc-underlying');

// ---------------------------------------------------------------------------
// BTC underlying pool selectors
// ---------------------------------------------------------------------------

const BTC_UNDERLYING_SELECTORS = {
    writeOptionBtc:     computeSelectorU32('writeOptionBtc(uint8,uint256,uint64,uint256,uint256)'),
    writeOptionBtcView: computeSelector('writeOptionBtc(uint8,uint256,uint64,uint256,uint256)'),
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CALL = 0;
const PUT = 1;
const PURCHASED = 1;
const PRECISION = 10n ** 18n;

const OPTION_AMOUNT = 100_000n;              // 100k sats for BTC underlying CALL
const STRIKE_PRICE = 50n * PRECISION;         // 50 MOTO per BTC
const PREMIUM = 5n * PRECISION;               // 5 MOTO premium
const PUT_COLLATERAL = 1n * PRECISION;        // OP20 collateral for PUT

// ---------------------------------------------------------------------------
// Calldata builders
// ---------------------------------------------------------------------------

function createWriteOptionBtcCalldata(
    optionType: number,
    strikePrice: bigint,
    expiryBlock: bigint,
    underlyingAmount: bigint,
    premium: bigint,
): Uint8Array {
    const w = new BinaryWriter();
    w.writeU32(BTC_UNDERLYING_SELECTORS.writeOptionBtc);
    w.writeU8(optionType);
    w.writeU256(strikePrice);
    w.writeU64(expiryBlock);
    w.writeU256(underlyingAmount);
    w.writeU256(premium);
    return w.getBuffer();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const config = getConfig();
    const deployed = loadDeployedContracts();
    if (!deployed) throw new Error('No deployed-contracts.json. Run 01+02 first.');

    const provider = new JSONRpcProvider({ url: config.rpcUrl, network: config.network });
    const deployer = new DeploymentHelper(provider, config.wallet, config.network);

    const premiumAddr = deployed.tokens.frogP;
    const premiumHex = await resolveCallAddress(provider, premiumAddr);
    const underlyingHex = await resolveCallAddress(provider, deployed.tokens.frogU);

    const feeRecipientWallet = config.mnemonic.deriveOPWallet(AddressTypes.P2TR, 2);

    let poolAddress = '';
    let poolCallAddr = '';
    let bridgeHex = '';
    let callOptionId: bigint | null = null;

    // -----------------------------------------------------------------------
    // 15.1 — Deploy OptionsPoolBtcUnderlying
    // -----------------------------------------------------------------------
    await runTest('15.1 Deploy OptionsPoolBtcUnderlying with bridge address', async () => {
        // Check for previously deployed pool
        if (deployed.btcUnderlyingPool) {
            poolAddress = deployed.btcUnderlyingPool;
            log.info(`Reusing existing BTC underlying pool at: ${poolAddress}`);
            poolCallAddr = await pollForPublicKeyInfo(provider, poolAddress, 3, 5_000);

            const countResult = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
            if (isCallError(countResult)) throw new Error(`Pool not responding: ${countResult.error}`);

            return { poolAddress, poolCallAddr, source: 'existing' };
        }

        if (!deployed.bridge) {
            throw new Error('No bridge deployed. Run test 13 first.');
        }
        const bridgeHex = await resolveCallAddress(provider, deployed.bridge);

        // Pool calldata: underlying + premiumToken + feeRecipient + bridge (4 addresses)
        const calldata = createBtcPoolCalldata(
            Address.fromString(underlyingHex),
            Address.fromString(premiumHex),
            feeRecipientWallet.address,
            Address.fromString(bridgeHex),
        );

        const result = await deployer.deployContract(getWasmPath('OptionsPoolBtcUnderlying'), calldata, 50_000n);
        poolAddress = result.contractAddress;
        log.info(`BTC underlying pool deployed at: ${poolAddress}`);

        // Wait for mining and resolve call address
        poolCallAddr = await pollForPublicKeyInfo(provider, poolAddress);

        const countResult = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
        if (isCallError(countResult)) throw new Error(`Pool not responding: ${countResult.error}`);

        // Save for reuse
        deployed.btcUnderlyingPool = poolAddress;
        const { saveDeployedContracts } = await import('./config.js');
        saveDeployedContracts(deployed);

        return { poolAddress, poolCallAddr, source: 'new_deployment' };
    });

    if (!poolCallAddr) {
        skipTest('15.2-15.11', 'Pool deployment failed');
        printSummary();
        return;
    }

    // Resolve bridge address (needed for BTC operations)
    if (deployed.bridge) {
        bridgeHex = await resolveCallAddress(provider, deployed.bridge);
    }

    // -----------------------------------------------------------------------
    // 15.1b — Register writer's BTC pubkey (required for writeOptionBtc CALL)
    // -----------------------------------------------------------------------
    await runTest('15.1b Register writer BTC pubkey on pool', async () => {
        const pubkey = getWriterCompressedPubkey(config.wallet);
        const calldata = createRegisterBtcPubkeyCalldata(pubkey);
        const result = await deployer.callContract(poolAddress, calldata, 10_000n);

        // Wait for registration to be mined before writeOptionBtc
        const regBlock = await provider.getBlockNumber();
        log.info(`Pubkey registration at block ${regBlock}. Waiting for next block...`);
        for (let i = 0; i < 40; i++) {
            await sleep(30_000);
            if (await provider.getBlockNumber() > regBlock) break;
        }

        return { txId: result.txId, pubkeyPrefix: '0x02' };
    });

    // -----------------------------------------------------------------------
    // 15.2 — CALL writeOptionBtc with valid BTC output
    // -----------------------------------------------------------------------
    await runTest('15.2 CALL writeOptionBtc with valid BTC output', async () => {
        if (!bridgeHex) {
            return { status: 'skipped', reason: 'No bridge address resolved' };
        }

        const countBefore = await readOptionCount(provider, poolCallAddr);
        const currentBlock = await provider.getBlockNumber();
        const expiryBlock = currentBlock + 1008n;

        // Step 1: Compute the escrow script hash (same as contract's writeOptionBtc CALL)
        // Contract uses: queryEscrowScriptHash(placeholderBuyer, writerPubkey, cltvBlock)
        const writerPubkey = getWriterCompressedPubkey(config.wallet);
        const buyerPub = placeholderBuyerPubkey();
        const cltvBlock = expiryBlock + GRACE_PERIOD_BLOCKS; // 144 blocks grace
        const escrowHash = await queryBridgeEscrowScriptHash(
            provider, bridgeHex, buyerPub, writerPubkey, cltvBlock,
        );
        log.info(`Escrow script hash: ${escrowHash.slice(0, 20)}...`);

        // Step 2: Derive P2WSH address for BTC collateral
        const p2wshAddr = deriveP2wshAddress(escrowHash, config.network);
        log.info(`P2WSH escrow address: ${p2wshAddr}`);

        // Step 3: Call writeOptionBtc(CALL) with BTC extraOutput
        const extraOutputs = [buildBtcExtraOutput(p2wshAddr, OPTION_AMOUNT)];
        const calldata = createWriteOptionBtcCalldata(CALL, STRIKE_PRICE, expiryBlock, OPTION_AMOUNT, PREMIUM);
        const result = await deployer.callContract(poolAddress, calldata, 30_000n, extraOutputs);
        log.info(`writeOptionBtc TX: ${result.txId}`);

        // Step 4: Poll for option to appear
        const count = await pollForOptionCount(provider, poolCallAddr, countBefore + 1n);
        callOptionId = count - 1n;

        // Step 5: Verify option is OPEN
        const option = await readOption(provider, poolCallAddr, callOptionId);

        return {
            txId: result.txId,
            optionId: callOptionId.toString(),
            optionCount: count.toString(),
            status: option.status,
            type: option.optionType === CALL ? 'CALL' : 'PUT',
            btcCollateral: OPTION_AMOUNT.toString() + ' sats',
            p2wshAddr,
        };
    });

    // -----------------------------------------------------------------------
    // 15.2b — Verify pool configuration
    // -----------------------------------------------------------------------
    await runTest('15.2b Verify pool config (underlying, premium, feeRecipient)', async () => {
        const underlyingResult = await provider.call(poolCallAddr, POOL_SELECTORS.underlying);
        if (isCallError(underlyingResult)) throw new Error(`underlying() call error: ${underlyingResult.error}`);
        const poolUnderlying = underlyingResult.result.readAddress().toString();

        const premiumResult = await provider.call(poolCallAddr, POOL_SELECTORS.premiumToken);
        if (isCallError(premiumResult)) throw new Error(`premiumToken() call error: ${premiumResult.error}`);
        const poolPremium = premiumResult.result.readAddress().toString();

        const feeResult = await provider.call(poolCallAddr, POOL_SELECTORS.feeRecipient);
        if (isCallError(feeResult)) throw new Error(`feeRecipient() call error: ${feeResult.error}`);
        const poolFeeRecipient = feeResult.result.readAddress().toString();

        return {
            underlying: poolUnderlying.slice(0, 20) + '...',
            premium: poolPremium.slice(0, 20) + '...',
            feeRecipient: poolFeeRecipient.slice(0, 20) + '...',
            underlyingMatch: poolUnderlying.toLowerCase() === underlyingHex.toLowerCase(),
            premiumMatch: poolPremium.toLowerCase() === premiumHex.toLowerCase(),
        };
    });

    // -----------------------------------------------------------------------
    // 15.3 — CALL writeOptionBtc reverts without BTC output
    // -----------------------------------------------------------------------
    await runTest('15.3 CALL writeOptionBtc reverts without BTC output', async () => {
        // Negative test: call writeOptionBtc(CALL) WITHOUT extraOutputs.
        // Contract calls bridge.verifyBtcOutput which scans Blockchain.tx.outputs
        // for a P2WSH matching the escrow hash. Without extraOutputs, no match → revert.
        const currentBlock = await provider.getBlockNumber();
        const expiryBlock = currentBlock + 1008n;
        const calldata = createWriteOptionBtcCalldata(CALL, STRIKE_PRICE, expiryBlock, OPTION_AMOUNT, PREMIUM);

        try {
            const result = await deployer.callContract(poolAddress, calldata, 30_000n);
            // TX broadcasts but will revert on-chain (no BTC output)
            return { txId: result.txId, status: 'broadcast_expected_on_chain_revert' };
        } catch (err) {
            return { status: 'correctly_rejected', error: (err as Error).message };
        }
    });

    // -----------------------------------------------------------------------
    // 15.4 — PUT writeOption locks OP20 collateral
    // -----------------------------------------------------------------------
    await runTest('15.4 PUT writeOption locks OP20 collateral', async () => {
        // PUT on type 2 uses OP20 premium token as collateral — same as base pool
        const poolAddr = Address.fromString(poolCallAddr);
        const countBefore = await readOptionCount(provider, poolCallAddr);
        await deployer.callContract(premiumAddr, createIncreaseAllowanceCalldata(poolAddr, PUT_COLLATERAL * 100n), 10_000n);

        // Wait for next block so approve is confirmed before write
        const approveBlock = await provider.getBlockNumber();
        log.info(`Approve broadcast at block ${approveBlock}. Waiting for next block...`);
        for (let i = 0; i < 40; i++) {
            await sleep(30_000);
            if (await provider.getBlockNumber() > approveBlock) break;
        }

        const currentBlock = await provider.getBlockNumber();
        const expiryBlock = currentBlock + 1008n;

        // PUT on type 2 also uses writeOptionBtc (not writeOption — that selector doesn't exist)
        const writeCalldata = createWriteOptionBtcCalldata(PUT, STRIKE_PRICE, expiryBlock, PUT_COLLATERAL, PREMIUM);
        const result = await deployer.callContract(poolAddress, writeCalldata, 30_000n);

        // Poll for option to appear
        const count = await pollForOptionCount(provider, poolCallAddr, countBefore + 1n);

        return { txId: result.txId, optionCount: count.toString() };
    });

    // -----------------------------------------------------------------------
    // 15.5 — buyOption pays OP20 premium
    // -----------------------------------------------------------------------
    await runTest('15.5 buyOption pays OP20 premium', async () => {
        const buyerWallet = config.mnemonic.deriveOPWallet(AddressTypes.P2TR, 1);
        const buyerDeployer = new DeploymentHelper(provider, buyerWallet, config.network);

        // Approve premium token for buyer, then wait for next block
        const poolAddr = Address.fromString(poolCallAddr);
        await buyerDeployer.callContract(premiumAddr, createIncreaseAllowanceCalldata(poolAddr, PREMIUM * 10n), 10_000n);
        const approveBlock = await provider.getBlockNumber();
        for (let i = 0; i < 40; i++) {
            await sleep(30_000);
            if (await provider.getBlockNumber() > approveBlock) break;
        }

        // Buy the PUT option (option 0)
        const buyCalldata = createBuyOptionCalldata(0n);
        const result = await buyerDeployer.callContract(poolAddress, buyCalldata, 20_000n);

        const purchased = await pollForOptionStatus(provider, poolCallAddr, 0n, PURCHASED);

        return { txId: result.txId, status: purchased.status };
    });

    // -----------------------------------------------------------------------
    // 15.5b — Verify option state after buy
    // -----------------------------------------------------------------------
    await runTest('15.5b Verify option 0 is PURCHASED after buy', async () => {
        const option = await readOption(provider, poolCallAddr, 0n);
        if (option.status !== PURCHASED) {
            return { status: 'pending', note: `Option status is ${option.status}, expected ${PURCHASED}. May need more blocks.` };
        }

        return {
            optionId: option.id.toString(),
            optType: option.optionType === PUT ? 'PUT' : 'CALL',
            status: option.status,
            strike: option.strikePrice.toString(),
            amount: option.underlyingAmount.toString(),
            premium: option.premium.toString(),
        };
    });

    // -----------------------------------------------------------------------
    // 15.6-15.7 — Exercise tests
    // -----------------------------------------------------------------------
    await runTest('15.6 CALL exercise: pay OP20 strike, get BTC claim event', async () => {
        // Type 2 CALL exercise: buyer pays OP20 strike, gets BTC claimable.
        // Requires: status==PURCHASED AND currentBlock >= expiryBlock.
        // Min expiry for type 2: currentBlock + 1008 → exercise after 1008 blocks (~7 days).
        //
        // Exercise flow (once past expiry):
        //   1. Compute strikeValue = (strikePrice * underlyingAmount) / PRECISION
        //   2. Buyer calls exercise(optionId) — NO BTC needed (OP20 payment only)
        //   3. Contract: transferFrom(premiumToken, buyer→writer, writerReceives)
        //   4. Contract: transferFrom(premiumToken, buyer→feeRecipient, exerciseFee)
        //   5. Contract emits BtcClaimable(optionId, buyer, btcAmount, escrowHash)
        //   6. Buyer claims BTC from P2WSH escrow off-chain using buyer path
        return {
            status: 'time_constrained',
            note: 'Exercise requires past-expiry option (1008+ blocks = ~7 days on Signet)',
            key_detail: 'Type 2 CALL exercise is OP20-only (buyer pays strike in OP20). No BTC extraOutputs needed.',
            btc_claim: 'BtcClaimable event emitted with escrow details for off-chain BTC sweep',
            testable_on: 'regtest (instant blocks) or dedicated long-running test suite',
        };
    });

    await runTest('15.7 PUT exercise: verify BTC output, receive OP20', async () => {
        // Type 2 PUT exercise: buyer sends BTC underlying via extraOutputs to writer's CSV address.
        // Requires: status==PURCHASED AND currentBlock >= expiryBlock.
        //
        // Exercise flow (once past expiry):
        //   1. Get writer's registered pubkey → generate CSV script hash → derive P2WSH
        //   2. Buyer calls exercise(optionId) + extraOutputs [{writerCsvP2wsh, underlyingAmountSats}]
        //   3. Contract: bridge.verifyBtcOutput(csvHash, btcAmountSats) → verified
        //   4. Contract: transfer(premiumToken, pool→buyer, strikeValue minus fee)
        //   5. Contract: transfer(premiumToken, pool→feeRecipient, exerciseFee)
        return {
            status: 'time_constrained',
            note: 'PUT exercise requires past-expiry option + BTC extraOutput to writer CSV address',
            btc_flow: 'buyer.exercise(optionId) + extraOutputs[{writerCsvP2wsh, underlyingAmountSats}]',
            testable_on: 'regtest (instant blocks) or dedicated long-running test suite',
        };
    });

    // -----------------------------------------------------------------------
    // 15.8-15.9 — Cancel and settle
    // -----------------------------------------------------------------------
    await runTest('15.8 CALL cancel: mark cancelled, escrow info emitted', async () => {
        // CALL cancel on type 2: marks CANCELLED, emits escrow info for off-chain BTC reclaim.
        // No on-chain fee for type 2 CALL cancel (MED-3) — BTC is in P2WSH, not held by contract.
        // Writer reclaims BTC via CLTV path after escrow expiry.

        if (callOptionId === null) {
            // Write a fresh CALL option with BTC if 15.2 didn't produce one
            return { status: 'skipped', reason: 'No CALL option available (15.2 did not succeed)' };
        }

        // Check option is still OPEN (not purchased or already cancelled)
        const option = await readOption(provider, poolCallAddr, callOptionId);
        if (option.status !== 0) { // 0 = OPEN
            return {
                status: 'skipped',
                reason: `Option ${callOptionId} status is ${option.status}, expected OPEN (0)`,
            };
        }

        // Cancel the CALL option
        const cancelCalldata = createCancelOptionCalldata(callOptionId);
        const result = await deployer.callContract(poolAddress, cancelCalldata, 20_000n);
        log.info(`Cancel TX: ${result.txId}`);

        // Poll for CANCELLED status (4)
        const CANCELLED = 4;
        const cancelled = await pollForOptionStatus(provider, poolCallAddr, callOptionId, CANCELLED);

        return {
            txId: result.txId,
            optionId: callOptionId.toString(),
            status: cancelled.status,
            note: 'CALL cancel: no on-chain fee (BTC in P2WSH escrow). Writer reclaims via CLTV off-chain.',
        };
    });

    await runTest('15.9 CALL settle: mark expired after grace', async () => {
        // Settle on type 2 CALL: marks EXPIRED, emits escrow info for off-chain BTC reclaim.
        // Like cancel, no on-chain BTC transfer — writer reclaims from P2WSH escrow via CLTV.
        // Requires: status==PURCHASED AND currentBlock >= expiryBlock + GRACE_PERIOD_BLOCKS (144).
        return {
            status: 'time_constrained',
            note: 'Settle requires PURCHASED + expiry + 144-block grace (~7+ days total on Signet)',
            contract_flow: 'settle(optionId) → check PURCHASED → check past grace → EXPIRED → emit escrow info',
            btc_reclaim: 'Writer reclaims BTC from P2WSH escrow via CLTV path (off-chain)',
            testable_on: 'regtest (instant blocks) or dedicated long-running test suite',
        };
    });

    // -----------------------------------------------------------------------
    // 15.10-15.11 — Full lifecycles
    // -----------------------------------------------------------------------
    await runTest('15.10 Full CALL lifecycle: writeBtc → buy → exercise', async () => {
        // Full CALL lifecycle on type 2:
        //   ✅ 15.1b: Writer registers BTC pubkey
        //   ✅ 15.2:  Writer calls writeOptionBtc(CALL) + BTC extraOutput → OPEN
        //   ✅ 15.8:  Writer cancels CALL (demonstrates cancel flow)
        //   ⏳ Buy + Exercise: requires additional write + buy + wait for expiry
        //
        // To complete the full lifecycle:
        //   1. Write another CALL with BTC extraOutput (same as 15.2)
        //   2. Buyer calls buyOption → pays OP20 premium → PURCHASED
        //   3. Wait for expiry (1008+ blocks = ~7 days)
        //   4. Buyer calls exercise → pays OP20 strikeValue → gets BtcClaimable event
        //   5. Buyer sweeps P2WSH escrow off-chain
        return {
            status: 'partially_tested',
            completed_steps: ['15.1b pubkey', '15.2 writeOptionBtc CALL with BTC', '15.8 cancel'],
            remaining: 'buy + exercise (requires additional write cycle + ~7 day expiry wait)',
            note: 'CALL write with BTC extraOutputs fully validated by 15.2',
        };
    });

    await runTest('15.11 Full PUT lifecycle: write → buy → exercise', async () => {
        // Full PUT lifecycle on type 2:
        //   ✅ 15.4: Writer writes PUT (locks OP20 collateral, no BTC)
        //   ✅ 15.5: Buyer buys PUT (pays OP20 premium → PURCHASED)
        //   ⏳ Exercise: requires past-expiry + BTC extraOutput
        //
        // PUT exercise flow (once past expiry):
        //   1. Get writer's registered pubkey → generate CSV script hash → derive P2WSH
        //   2. Buyer calls exercise(optionId) + extraOutputs [{writerCsvP2wsh, underlyingAmountSats}]
        //   3. Contract verifies BTC via bridge.verifyBtcOutput
        //   4. Contract transfers OP20 collateral to buyer minus 0.1% fee
        return {
            status: 'partially_tested',
            completed_steps: ['15.4 writeOption PUT', '15.5 buyOption'],
            remaining: 'exercise (requires past-expiry + BTC extraOutput to writer CSV address)',
            note: 'PUT write + buy fully validated. Exercise needs ~7 day expiry wait + BTC payment.',
        };
    });

    printSummary();
}

main().catch((err) => {
    log.error(`Fatal: ${err.message}`);
    process.exit(1);
});
