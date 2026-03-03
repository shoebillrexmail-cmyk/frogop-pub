/**
 * mint-test-tokens.ts — Mint test tokens for all pools on the current network.
 *
 * Usage:
 *   npx tsx scripts/mint-test-tokens.ts
 *   npx tsx scripts/mint-test-tokens.ts --pool-id moto-pill
 *
 * For each pool (or the specified pool):
 *   - Mints testConfig.mintAmount of underlying + premium to deployer (index 0)
 *   - Mints testConfig.mintAmount of underlying + premium to buyer (index 1)
 *
 * Requires:
 *   - OPNET_MNEMONIC in .env
 *   - OPNET_NETWORK (default: testnet)
 *   - Token addresses already set in pools.config.json
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Address, BinaryWriter, AddressTypes } from '@btc-vision/transaction';
import { JSONRpcProvider } from 'opnet';
import {
    getConfig,
    getLogger,
    formatAddress,
    computeSelectorU32,
} from '../tests/integration/config.js';
import { DeploymentHelper } from '../tests/integration/deployment.js';
import type { PoolsConfig, PoolConfig, NetworkId } from '../shared/pool-config.types.js';

const log = getLogger('mint-tokens');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadPoolsConfig(): PoolsConfig {
    const configPath = path.join(process.cwd(), 'pools.config.json');
    if (!fs.existsSync(configPath)) {
        throw new Error('pools.config.json not found. Run from the repo root.');
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as PoolsConfig;
}

function getNetworkId(): NetworkId {
    const env = process.env.OPNET_NETWORK || 'testnet';
    if (env === 'mainnet') return 'mainnet';
    return 'testnet';
}

const MINT_SELECTOR = computeSelectorU32('mint(address,uint256)');

function createMintCalldata(to: Address, amount: bigint): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(MINT_SELECTOR);
    writer.writeAddress(to);
    writer.writeU256(amount);
    return writer.getBuffer();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const poolsConfig = loadPoolsConfig();
    const networkId = getNetworkId();

    // Optional --pool-id filter
    const args = process.argv.slice(2);
    const poolIdIdx = args.indexOf('--pool-id');
    const filterPoolId = poolIdIdx !== -1 ? args[poolIdIdx + 1] : undefined;

    const pools: PoolConfig[] = filterPoolId
        ? poolsConfig.pools.filter((p) => p.id === filterPoolId)
        : poolsConfig.pools;

    if (pools.length === 0) {
        throw new Error(
            filterPoolId
                ? `Pool "${filterPoolId}" not found in pools.config.json.`
                : 'No pools configured in pools.config.json.',
        );
    }

    const config = getConfig();
    const provider = new JSONRpcProvider(
        process.env.OPNET_RPC_URL || `https://${networkId}.opnet.org`,
        config.network,
    );

    const deployer = new DeploymentHelper(provider, config.wallet, config.network);
    const balance = await deployer.checkBalance();
    log.info(`Deployer balance: ${balance} sats`);

    const mintAmountRaw = BigInt(poolsConfig.testConfig?.mintAmount ?? '1000000');

    // Derive wallets
    const deployerAddress = config.wallet.address;
    const buyerWallet = config.mnemonic.deriveOPWallet(AddressTypes.P2TR, 1);
    const buyerAddress = buyerWallet.address;

    for (const pool of pools) {
        log.info(`--- Minting for pool "${pool.id}" ---`);

        const underlyingAddr = pool.underlying.addresses[networkId];
        const premiumAddr = pool.premium.addresses[networkId];

        if (!underlyingAddr || !premiumAddr) {
            log.warn(`Skipping pool "${pool.id}" — token addresses not set for ${networkId}.`);
            continue;
        }

        const underlyingMint = mintAmountRaw * (10n ** BigInt(pool.underlying.decimals));
        const premiumMint = mintAmountRaw * (10n ** BigInt(pool.premium.decimals));

        // Mint underlying to deployer + buyer
        log.info(`Minting ${mintAmountRaw} ${pool.underlying.symbol} to deployer (${formatAddress(deployerAddress)})...`);
        await deployer.callContract(underlyingAddr, createMintCalldata(deployerAddress, underlyingMint), 25_000n);

        log.info(`Minting ${mintAmountRaw} ${pool.underlying.symbol} to buyer (${formatAddress(buyerAddress)})...`);
        await deployer.callContract(underlyingAddr, createMintCalldata(buyerAddress, underlyingMint), 25_000n);

        // Mint premium to deployer + buyer
        log.info(`Minting ${mintAmountRaw} ${pool.premium.symbol} to deployer (${formatAddress(deployerAddress)})...`);
        await deployer.callContract(premiumAddr, createMintCalldata(deployerAddress, premiumMint), 25_000n);

        log.info(`Minting ${mintAmountRaw} ${pool.premium.symbol} to buyer (${formatAddress(buyerAddress)})...`);
        await deployer.callContract(premiumAddr, createMintCalldata(buyerAddress, premiumMint), 25_000n);

        log.success(`Pool "${pool.id}" — all tokens minted.`);
    }

    log.success('Done!');
}

main().catch((err) => {
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
