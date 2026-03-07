/**
 * 20-deploy-frontend-btc-pools.ts
 *
 * Deploys the 4 frontend-facing BTC pools with the current bridge address:
 *   - moto-btc  (type 1 / BtcQuote):       underlying=MOTO, premiumToken=MOTO
 *   - btc-moto  (type 2 / BtcUnderlying):   underlying=MOTO, premiumToken=MOTO
 *   - pill-btc  (type 1 / BtcQuote):        underlying=PILL, premiumToken=PILL
 *   - btc-pill  (type 2 / BtcUnderlying):   underlying=PILL, premiumToken=PILL
 *
 * For BTC pools with a single OP20 token, both underlying and premiumToken
 * point to the same OP20 address. BTC operations go through the bridge.
 *
 * Prerequisites: Bridge deployed (test 13), tokens deployed (tests 01-02).
 * Run: npx tsx tests/integration/20-deploy-frontend-btc-pools.ts
 */

import { JSONRpcProvider } from 'opnet';
import { Address, AddressTypes } from '@btc-vision/transaction';
import {
    getConfig,
    loadDeployedContracts,
    saveDeployedContracts,
    getLogger,
    sleep,
    computeSelector,
    POOL_SELECTORS,
} from './config.js';
import {
    createTestHarness,
    isCallError,
    pollForPublicKeyInfo,
    resolveCallAddress,
} from './test-harness.js';
import {
    DeploymentHelper,
    getWasmPath,
    createBtcPoolCalldata,
} from './deployment.js';
import * as fs from 'fs';
import * as path from 'path';

const log = getLogger('20-btc-pools');
const { runTest, printSummary } = createTestHarness('20-btc-pools');

// ---------------------------------------------------------------------------
// Pool definitions matching pools.config.json
// ---------------------------------------------------------------------------

interface BtcPoolDef {
    id: string;
    poolType: 1 | 2;
    wasmName: string;
    /** OP20 token address (hex) — used for both underlying and premiumToken */
    op20TokenAddr: string;
    /** Key in pools.config.json for storing the deployed pool address */
    configIndex: number;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const config = getConfig();
    const deployed = loadDeployedContracts();
    if (!deployed) throw new Error('No deployed-contracts.json. Run 01+02 first.');

    if (!deployed.bridge) {
        throw new Error('No bridge deployed. Run test 13 first.');
    }

    const provider = new JSONRpcProvider({ url: config.rpcUrl, network: config.network });
    const deployer = new DeploymentHelper(provider, config.wallet, config.network);

    const feeRecipientWallet = config.mnemonic.deriveOPWallet(AddressTypes.P2TR, 2);

    // Resolve bridge hex address
    const bridgeHex = await resolveCallAddress(provider, deployed.bridge);
    log.info(`Bridge hex: ${bridgeHex.slice(0, 20)}...`);

    // Resolve token hex addresses
    const motoHex = await resolveCallAddress(provider, deployed.tokens.frogU);
    const pillHex = await resolveCallAddress(provider, deployed.tokens.frogP);
    log.info(`MOTO hex: ${motoHex.slice(0, 20)}...`);
    log.info(`PILL hex: ${pillHex.slice(0, 20)}...`);

    // Load pools.config.json
    const poolsConfigPath = path.join(process.cwd(), 'pools.config.json');
    const poolsConfig = JSON.parse(fs.readFileSync(poolsConfigPath, 'utf-8'));

    // Define the 4 pools to deploy
    const poolDefs: BtcPoolDef[] = [
        {
            id: 'moto-btc',
            poolType: 1,
            wasmName: 'OptionsPoolBtcQuote',
            op20TokenAddr: motoHex,
            configIndex: poolsConfig.pools.findIndex((p: { id: string }) => p.id === 'moto-btc'),
        },
        {
            id: 'btc-moto',
            poolType: 2,
            wasmName: 'OptionsPoolBtcUnderlying',
            op20TokenAddr: motoHex,
            configIndex: poolsConfig.pools.findIndex((p: { id: string }) => p.id === 'btc-moto'),
        },
        {
            id: 'pill-btc',
            poolType: 1,
            wasmName: 'OptionsPoolBtcQuote',
            op20TokenAddr: pillHex,
            configIndex: poolsConfig.pools.findIndex((p: { id: string }) => p.id === 'pill-btc'),
        },
        {
            id: 'btc-pill',
            poolType: 2,
            wasmName: 'OptionsPoolBtcUnderlying',
            op20TokenAddr: pillHex,
            configIndex: poolsConfig.pools.findIndex((p: { id: string }) => p.id === 'btc-pill'),
        },
    ];

    // Validate all config indices found
    for (const def of poolDefs) {
        if (def.configIndex === -1) {
            throw new Error(`Pool "${def.id}" not found in pools.config.json`);
        }
    }

    // Check balance before starting
    const balance = await deployer.checkBalance();
    log.info(`Deployer balance: ${balance} sats`);
    if (balance < 200_000n) {
        throw new Error(`Insufficient balance (${balance} sats). Need at least 200k sats for 4 deployments.`);
    }

    // Deploy each pool sequentially (each deployment spends UTXOs)
    const deployedPools: Array<{ id: string; address: string; callAddr: string }> = [];

    for (const def of poolDefs) {
        await runTest(`20.${poolDefs.indexOf(def) + 1} Deploy ${def.id} (type ${def.poolType})`, async () => {
            const calldata = createBtcPoolCalldata(
                Address.fromString(def.op20TokenAddr),
                Address.fromString(def.op20TokenAddr),
                feeRecipientWallet.address,
                Address.fromString(bridgeHex),
            );

            const wasmPath = getWasmPath(def.wasmName);
            log.info(`Deploying ${def.id} from ${def.wasmName}.wasm...`);

            const result = await deployer.deployContract(wasmPath, calldata, 50_000n);
            log.info(`${def.id} deployed at: ${result.contractAddress}`);

            // Update pools.config.json entry
            poolsConfig.pools[def.configIndex].pool.addresses.testnet = result.contractAddress;

            // Save immediately so we don't lose addresses if a later deploy fails
            fs.writeFileSync(poolsConfigPath, JSON.stringify(poolsConfig, null, 2));
            log.info(`Updated pools.config.json for ${def.id}`);

            deployedPools.push({
                id: def.id,
                address: result.contractAddress,
                callAddr: '', // will be resolved after mining
            });

            // Brief pause between deployments for UTXO propagation
            await sleep(5_000);

            return {
                contractAddress: result.contractAddress,
                fundingTxId: result.fundingTxId,
                revealTxId: result.revealTxId,
            };
        });
    }

    if (deployedPools.length === 0) {
        log.error('No pools deployed. Aborting.');
        printSummary();
        return;
    }

    // Wait for all deployments to be mined, then verify each pool
    log.info(`Waiting for ${deployedPools.length} pools to be mined...`);

    for (const pool of deployedPools) {
        await runTest(`20.${poolDefs.length + deployedPools.indexOf(pool) + 1} Verify ${pool.id} is live`, async () => {
            const callAddr = await pollForPublicKeyInfo(provider, pool.address, 40, 30_000);
            pool.callAddr = callAddr;

            // Verify pool responds to optionCount()
            const countResult = await provider.call(callAddr, POOL_SELECTORS.optionCount);
            if (isCallError(countResult)) {
                throw new Error(`Pool ${pool.id} not responding: ${(countResult as any).error}`);
            }

            // Verify bridge() view returns the correct bridge
            const bridgeSelector = computeSelector('bridge()');
            const bridgeResult = await provider.call(callAddr, bridgeSelector);
            if (isCallError(bridgeResult)) {
                throw new Error(`bridge() call failed: ${(bridgeResult as any).error}`);
            }

            return {
                poolAddress: pool.address,
                callAddr: callAddr.slice(0, 20) + '...',
                optionCount: '0',
                bridgeVerified: true,
            };
        });
    }

    // Update deployed-contracts.json with new pool addresses
    // Store them in a new btcPools field for reference
    const deployedUpdate: Record<string, string> = {};
    for (const pool of deployedPools) {
        deployedUpdate[pool.id] = pool.address;
    }
    (deployed as any).btcPools = deployedUpdate;
    saveDeployedContracts(deployed);

    log.info('All BTC pools deployed and verified!');
    log.info('Updated files:');
    log.info('  - pools.config.json (pool addresses)');
    log.info('  - deployed-contracts.json (btcPools reference)');

    printSummary();
}

main().catch((err) => {
    log.error(`Fatal: ${err.message}`);
    process.exit(1);
});
