/**
 * deploy-pool.ts — Deploy a pool from pools.config.json.
 *
 * Usage:
 *   npx tsx scripts/deploy-pool.ts --pool-id moto-pill
 *
 * Steps for the specified pool:
 *   1. Deploy OP20 tokens (if addresses are empty for current network)
 *   2. Mint test supply to deployer wallet
 *   3. Deploy OptionsPool WASM
 *   4. Register pool in factory
 *   5. Write deployed addresses back to pools.config.json
 *
 * Requires:
 *   - OPNET_MNEMONIC in .env
 *   - OPNET_NETWORK (default: testnet)
 *   - WASM build artifacts in build/ (run `npm run build` first)
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
    waitForBlock,
    computeSelectorU32,
} from '../tests/integration/config.js';
import {
    DeploymentHelper,
    createTokenCalldata,
    createPoolCalldata,
    createRegisterPoolCalldata,
    getWasmPath,
} from '../tests/integration/deployment.js';
import type { PoolsConfig, PoolConfig, NetworkId } from '../shared/pool-config.types.js';

const log = getLogger('deploy-pool');

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

function savePoolsConfig(config: PoolsConfig): void {
    const configPath = path.join(process.cwd(), 'pools.config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    log.success('pools.config.json updated');
}

function getNetworkId(): NetworkId {
    const env = process.env.OPNET_NETWORK || 'testnet';
    if (env === 'mainnet') return 'mainnet';
    return 'testnet';
}

function parseArgs(): { poolId: string } {
    const args = process.argv.slice(2);
    const idx = args.indexOf('--pool-id');
    if (idx === -1 || !args[idx + 1]) {
        throw new Error('Usage: npx tsx scripts/deploy-pool.ts --pool-id <id>');
    }
    return { poolId: args[idx + 1]! };
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
    const { poolId } = parseArgs();
    const poolsConfig = loadPoolsConfig();
    const networkId = getNetworkId();

    const poolCfg = poolsConfig.pools.find((p) => p.id === poolId);
    if (!poolCfg) {
        const ids = poolsConfig.pools.map((p) => p.id).join(', ');
        throw new Error(`Pool "${poolId}" not found in pools.config.json. Available: ${ids}`);
    }

    log.info(`Deploying pool "${poolId}" on ${networkId}`);

    const config = getConfig();
    const provider = new JSONRpcProvider(
        process.env.OPNET_RPC_URL || `https://${networkId}.opnet.org`,
        config.network,
    );

    const deployer = new DeploymentHelper(provider, config.wallet, config.network);
    const balance = await deployer.checkBalance();
    log.info(`Deployer balance: ${balance} sats`);

    if (balance < 100_000n) {
        throw new Error('Insufficient balance. Fund your deployer wallet first.');
    }

    const wasmPaths = poolsConfig.testConfig?.wasmPaths ?? {
        token: 'build/MyToken.wasm',
        pool: 'build/OptionsPool.wasm',
    };
    const mintAmountRaw = BigInt(poolsConfig.testConfig?.mintAmount ?? '1000000');
    const mintAmount = mintAmountRaw * (10n ** BigInt(poolCfg.underlying.decimals));

    // -----------------------------------------------------------------------
    // Step 1: Deploy tokens if addresses are empty
    // -----------------------------------------------------------------------

    let underlyingAddr = poolCfg.underlying.addresses[networkId];
    let premiumAddr = poolCfg.premium.addresses[networkId];

    if (!underlyingAddr) {
        log.info(`Deploying ${poolCfg.underlying.symbol} token...`);
        const calldata = createTokenCalldata(
            poolCfg.underlying.name,
            poolCfg.underlying.symbol,
            poolCfg.underlying.decimals,
            mintAmountRaw,
        );
        const result = await deployer.deployContract(
            getWasmPath(path.basename(wasmPaths.token, '.wasm')),
            calldata,
            25_000n,
        );
        underlyingAddr = result.contractAddress;
        poolCfg.underlying.addresses[networkId] = underlyingAddr;
        savePoolsConfig(poolsConfig);
        log.success(`${poolCfg.underlying.symbol} deployed at ${formatAddress(underlyingAddr)}`);

        // Wait for confirmation before minting
        const block = await provider.getBlockNumber();
        await waitForBlock(provider, block, 1);
    } else {
        log.info(`${poolCfg.underlying.symbol} already deployed: ${formatAddress(underlyingAddr)}`);
    }

    if (!premiumAddr) {
        log.info(`Deploying ${poolCfg.premium.symbol} token...`);
        const calldata = createTokenCalldata(
            poolCfg.premium.name,
            poolCfg.premium.symbol,
            poolCfg.premium.decimals,
            mintAmountRaw,
        );
        const result = await deployer.deployContract(
            getWasmPath(path.basename(wasmPaths.token, '.wasm')),
            calldata,
            25_000n,
        );
        premiumAddr = result.contractAddress;
        poolCfg.premium.addresses[networkId] = premiumAddr;
        savePoolsConfig(poolsConfig);
        log.success(`${poolCfg.premium.symbol} deployed at ${formatAddress(premiumAddr)}`);

        const block = await provider.getBlockNumber();
        await waitForBlock(provider, block, 1);
    } else {
        log.info(`${poolCfg.premium.symbol} already deployed: ${formatAddress(premiumAddr)}`);
    }

    // -----------------------------------------------------------------------
    // Step 2: Mint test supply to deployer
    // -----------------------------------------------------------------------

    log.info(`Minting ${mintAmountRaw} ${poolCfg.underlying.symbol} to deployer...`);
    const walletAddress = config.wallet.address;
    await deployer.callContract(underlyingAddr, createMintCalldata(walletAddress, mintAmount), 25_000n);

    log.info(`Minting ${mintAmountRaw} ${poolCfg.premium.symbol} to deployer...`);
    await deployer.callContract(premiumAddr, createMintCalldata(walletAddress, mintAmount), 25_000n);

    // Also mint to buyer wallet (index 1)
    const buyerWallet = config.mnemonic.deriveOPWallet(AddressTypes.P2TR, 1);
    log.info(`Minting to buyer wallet (index 1)...`);
    await deployer.callContract(underlyingAddr, createMintCalldata(buyerWallet.address, mintAmount), 25_000n);
    await deployer.callContract(premiumAddr, createMintCalldata(buyerWallet.address, mintAmount), 25_000n);

    // -----------------------------------------------------------------------
    // Step 3: Deploy OptionsPool
    // -----------------------------------------------------------------------

    let poolAddr = poolCfg.pool.addresses[networkId];

    if (!poolAddr) {
        log.info('Deploying OptionsPool...');

        // Resolve token hex addresses for the pool constructor
        const underlyingHex = underlyingAddr.startsWith('0x')
            ? underlyingAddr
            : (await provider.getPublicKeyInfo(underlyingAddr, true)).toString();
        const premiumHex = premiumAddr.startsWith('0x')
            ? premiumAddr
            : (await provider.getPublicKeyInfo(premiumAddr, true)).toString();

        // Fee recipient = deployer wallet (index 0) or dedicated (index 2)
        const feeRecipientWallet = config.mnemonic.deriveOPWallet(AddressTypes.P2TR, 2);

        const poolCalldata = createPoolCalldata(
            Address.fromString(underlyingHex),
            Address.fromString(premiumHex),
            feeRecipientWallet.address,
        );

        const result = await deployer.deployContract(
            getWasmPath(path.basename(wasmPaths.pool, '.wasm')),
            poolCalldata,
            50_000n,
        );
        poolAddr = result.contractAddress;
        poolCfg.pool.addresses[networkId] = poolAddr;
        savePoolsConfig(poolsConfig);
        log.success(`OptionsPool deployed at ${formatAddress(poolAddr)}`);

        const block = await provider.getBlockNumber();
        await waitForBlock(provider, block, 1);
    } else {
        log.info(`OptionsPool already deployed: ${formatAddress(poolAddr)}`);
    }

    // -----------------------------------------------------------------------
    // Step 4: Register pool in factory
    // -----------------------------------------------------------------------

    const factoryAddr = poolsConfig.factory.addresses[networkId];
    if (!factoryAddr) {
        log.warn('No factory address configured — skipping registration.');
    } else {
        log.info('Registering pool in factory...');

        const poolHex = poolAddr.startsWith('0x')
            ? poolAddr
            : (await provider.getPublicKeyInfo(poolAddr, true)).toString();
        const underlyingHex = underlyingAddr.startsWith('0x')
            ? underlyingAddr
            : (await provider.getPublicKeyInfo(underlyingAddr, true)).toString();
        const premiumHex = premiumAddr.startsWith('0x')
            ? premiumAddr
            : (await provider.getPublicKeyInfo(premiumAddr, true)).toString();

        const registerCalldata = createRegisterPoolCalldata(
            Address.fromString(poolHex),
            Address.fromString(underlyingHex),
            Address.fromString(premiumHex),
        );

        try {
            await deployer.callContract(factoryAddr, registerCalldata, 50_000n);
            log.success('Pool registered in factory');
        } catch (err) {
            // May fail if already registered or not owner — non-fatal
            log.warn(`Factory registration failed (may be already registered): ${(err as Error).message}`);
        }
    }

    // -----------------------------------------------------------------------
    // Done
    // -----------------------------------------------------------------------

    log.success(`Pool "${poolId}" deployment complete!`);
    log.info(`  Underlying: ${poolCfg.underlying.symbol} @ ${formatAddress(underlyingAddr)}`);
    log.info(`  Premium:    ${poolCfg.premium.symbol} @ ${formatAddress(premiumAddr)}`);
    log.info(`  Pool:       ${formatAddress(poolAddr)}`);
}

main().catch((err) => {
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
