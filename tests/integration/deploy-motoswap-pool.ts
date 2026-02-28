/**
 * deploy-motoswap-pool.ts — Deploys a new OptionsPool using real MotoSwap
 * testnet MOTO and PILL tokens instead of custom frogU/frogP.
 *
 * Usage:
 *   npx tsx tests/integration/deploy-motoswap-pool.ts
 *
 * Prerequisites:
 *   - .env file with OPNET_MNEMONIC and OPNET_NETWORK=testnet
 *   - Wallet must have testnet BTC for deployment fees
 *   - build/OptionsPool.wasm must exist (run `npm run build:pool` first)
 *
 * After deployment, update:
 *   - frontend/.env.testnet  → VITE_POOL_ADDRESS
 *   - indexer/wrangler.toml  → POOL_ADDRESSES
 */
import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { Address, AddressTypes } from '@btc-vision/transaction';
import {
    getConfig,
    loadDeployedContracts,
    saveDeployedContracts,
    getLogger,
    formatAddress,
    waitForBlock,
} from './config.js';
import { DeploymentHelper, createPoolCalldata, getWasmPath } from './deployment.js';
import * as fs from 'fs';

const log = getLogger('deploy-motoswap-pool');

// ---------------------------------------------------------------------------
// Real MotoSwap testnet token addresses (from OPNet testnet announcement)
// ---------------------------------------------------------------------------

// MOTO (Motoswap) — underlying token, 18 decimals
const MOTO_HEX = '0xfd4473840751d58d9f8b73bdd57d6c5260453d5518bd7cd02d0a4cf3df9bf4dd';

// PILL (Orange Pill) — premium token, 18 decimals
const PILL_HEX = '0xb09fc29c112af8293539477e23d8df1d3126639642767d707277131352040cbb';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    log.info('=== Deploy OptionsPool with Real MotoSwap Tokens ===');
    log.info(`Network: ${process.env.OPNET_NETWORK || 'regtest'}`);

    const config = getConfig();

    if (process.env.OPNET_NETWORK !== 'testnet') {
        log.error('This script is for testnet only. Set OPNET_NETWORK=testnet in .env');
        process.exit(1);
    }

    const provider = new JSONRpcProvider({
        url: config.rpcUrl,
        network: config.network,
    });

    const deployer = new DeploymentHelper(provider, config.wallet, config.network);
    const currentBlock = await provider.getBlockNumber();
    log.info(`Current block: ${currentBlock}`);
    log.info(`Wallet: ${config.wallet.p2tr}`);

    // Check balance
    const balance = await deployer.checkBalance();
    log.info(`Wallet balance: ${balance} sats`);
    if (balance < 50_000n) {
        log.error('Insufficient balance. Need at least 50,000 sats for deployment.');
        process.exit(1);
    }

    // -------------------------------------------------------------------------
    // Token addresses (already in hex — verified on-chain)
    // -------------------------------------------------------------------------

    log.info(`  MOTO hex: ${formatAddress(MOTO_HEX)}`);
    log.info(`  PILL hex: ${formatAddress(PILL_HEX)}`);

    const motoAddress = Address.fromString(MOTO_HEX);
    const pillAddress = Address.fromString(PILL_HEX);

    // -------------------------------------------------------------------------
    // Fee recipient — deployer wallet (index 0) or dedicated (index 2)
    // -------------------------------------------------------------------------

    const feeRecipientWallet = config.mnemonic.deriveOPWallet(AddressTypes.P2TR, 2);
    const feeRecipientAddress = feeRecipientWallet.address;
    log.info(`Fee recipient (index 2): ${formatAddress(feeRecipientAddress.toString())}`);

    // -------------------------------------------------------------------------
    // Check if OptionsPool WASM exists
    // -------------------------------------------------------------------------

    const wasmPath = getWasmPath('OptionsPool');
    if (!fs.existsSync(wasmPath)) {
        log.error(`WASM not found at: ${wasmPath}`);
        log.error('Run `npm run build:pool` first.');
        process.exit(1);
    }

    // -------------------------------------------------------------------------
    // Deploy OptionsPool
    // -------------------------------------------------------------------------

    log.info('Building pool calldata...');
    const calldata = createPoolCalldata(motoAddress, pillAddress, feeRecipientAddress);

    log.info('Deploying OptionsPool...');
    const result = await deployer.deployContract(wasmPath, calldata, 50_000n);

    const poolAddress = result.contractAddress;
    log.success(`Pool deployed at: ${poolAddress}`);
    log.info(`  Funding TX: ${result.fundingTxId}`);
    log.info(`  Reveal TX:  ${result.revealTxId}`);

    // -------------------------------------------------------------------------
    // Save to deployed-contracts.json
    // -------------------------------------------------------------------------

    const deployed = loadDeployedContracts() || {
        network: 'testnet',
        rpcUrl: config.rpcUrl,
        deployer: config.wallet.p2tr,
        tokens: { frogU: '', frogP: '' },
        factory: '',
        poolTemplate: '',
        deployedAt: new Date().toISOString(),
    };

    // Update with MotoSwap addresses
    deployed.tokens.frogU = MOTO_HEX;
    deployed.tokens.frogP = PILL_HEX;
    deployed.pool = poolAddress;
    deployed.deployedAt = new Date().toISOString();
    saveDeployedContracts(deployed);

    // -------------------------------------------------------------------------
    // Print update instructions
    // -------------------------------------------------------------------------

    log.info('\n=== Next Steps ===');
    log.info('1. Update frontend/.env.testnet:');
    log.info(`   VITE_POOL_ADDRESS=${poolAddress}`);
    log.info('2. Update indexer/wrangler.toml:');
    log.info(`   POOL_ADDRESSES = "${poolAddress}"`);
    log.info('3. Commit, push develop, merge to master');
    log.info('4. Cloudflare will auto-deploy frontend');
    log.info('5. Run `cd indexer && npx wrangler deploy` for indexer');

    // -------------------------------------------------------------------------
    // Wait for confirmation (optional — non-fatal timeout)
    // -------------------------------------------------------------------------

    log.info('\nWaiting for block confirmation...');
    try {
        await waitForBlock(provider, currentBlock, 3);
        log.success('Pool TX confirmed!');

        // Verify deployment
        const poolPubKey = await provider.getPublicKeyInfo(poolAddress, true);
        log.success(`Pool public key: ${formatAddress(poolPubKey.toString())}`);
    } catch {
        log.warn('Block confirmation timed out. Pool TX was broadcast but not yet confirmed.');
        log.warn('Re-run query methods test after blocks advance to verify.');
    }
}

main().catch((error) => {
    log.error('Deployment failed:', error);
    process.exit(1);
});
