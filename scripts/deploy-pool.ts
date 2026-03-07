/**
 * deploy-pool.ts — Deploy pools from pools.config.json.
 *
 * Usage:
 *   npx tsx scripts/deploy-pool.ts --pool-id moto-pill
 *   npx tsx scripts/deploy-pool.ts --deploy-all [--no-wait]
 *
 * Pool types:
 *   0 = OP20/OP20  → OptionsPool.wasm
 *   1 = OP20/BTC   → OptionsPoolBtcQuote.wasm (needs bridge)
 *   2 = BTC/OP20   → OptionsPoolBtcUnderlying.wasm (needs bridge)
 *
 * Steps for each pool:
 *   1. Deploy OP20 tokens (skip if addresses set or token is BTC)
 *   2. Mint test supply to deployer (skip BTC — native asset)
 *   3. Deploy pool WASM (type-dependent)
 *   4. Register pool in factory
 *   5. Write deployed addresses back to pools.config.json
 *
 * Flags:
 *   --deploy-all  Deploy all pools whose pool.addresses[network] is empty
 *   --no-wait     Skip waitForBlock between deployments (chain UTXOs in-memory)
 *   --pool-id <id>  Deploy a single pool by ID
 *
 * Requires:
 *   - OPNET_MNEMONIC in .env
 *   - OPNET_NETWORK (default: testnet)
 *   - WASM build artifacts in build/
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
    createBtcPoolCalldata,
    createRegisterPoolCalldata,
    getWasmPath,
} from '../tests/integration/deployment.js';
import type { PoolsConfig, PoolConfig, NetworkId, PoolType } from '../shared/pool-config.types.js';

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

interface ParsedArgs {
    readonly poolId: string | null;
    readonly deployAll: boolean;
    readonly noWait: boolean;
}

function parseArgs(): ParsedArgs {
    const args = process.argv.slice(2);
    const deployAll = args.includes('--deploy-all');
    const noWait = args.includes('--no-wait');

    const idx = args.indexOf('--pool-id');
    const poolId = idx !== -1 ? (args[idx + 1] ?? null) : null;

    if (!deployAll && !poolId) {
        throw new Error(
            'Usage:\n' +
            '  npx tsx scripts/deploy-pool.ts --pool-id <id>\n' +
            '  npx tsx scripts/deploy-pool.ts --deploy-all [--no-wait]'
        );
    }
    return { poolId, deployAll, noWait };
}

/** Returns true if the token symbol represents BTC (native asset, no contract). */
function isBtcToken(symbol: string): boolean {
    return symbol.toUpperCase() === 'BTC';
}

const MINT_SELECTOR = computeSelectorU32('mint(address,uint256)');

function createMintCalldata(to: Address, amount: bigint): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(MINT_SELECTOR);
    writer.writeAddress(to);
    writer.writeU256(amount);
    return writer.getBuffer();
}

/** Select the correct WASM file based on pool type. */
function getPoolWasmPath(poolType: PoolType, wasmPaths: PoolsConfig['testConfig'] extends { wasmPaths: infer W } ? W : never): string {
    switch (poolType) {
        case 0: return getWasmPath(path.basename(wasmPaths.pool, '.wasm'));
        case 1: return getWasmPath(path.basename(wasmPaths.poolBtcQuote, '.wasm'));
        case 2: return getWasmPath(path.basename(wasmPaths.poolBtcUnderlying, '.wasm'));
        default: throw new Error(`Unknown pool type: ${poolType}`);
    }
}

/** Resolve a bech32 or 0x address to hex, using getPublicKeyInfo for bech32 contracts. */
async function resolveToHex(provider: JSONRpcProvider, addr: string): Promise<string> {
    if (addr.startsWith('0x')) return addr;
    const info = await provider.getPublicKeyInfo(addr, true);
    if (!info) {
        throw new Error(
            `getPublicKeyInfo returned undefined for ${formatAddress(addr)}. ` +
            `Contract may not be mined yet — wait for a block and retry.`
        );
    }
    return info.toString();
}

// ---------------------------------------------------------------------------
// Deploy a single pool
// ---------------------------------------------------------------------------

async function deployPool(
    poolCfg: PoolConfig,
    poolsConfig: PoolsConfig,
    deployer: DeploymentHelper,
    provider: JSONRpcProvider,
    networkId: NetworkId,
    noWait: boolean,
): Promise<void> {
    const poolType: PoolType = poolCfg.poolType ?? 0;
    log.info(`\n${'='.repeat(60)}`);
    log.info(`Deploying pool "${poolCfg.id}" (type ${poolType}) on ${networkId}`);
    log.info(`${'='.repeat(60)}`);

    const config = getConfig();
    const wasmPaths = poolsConfig.testConfig?.wasmPaths ?? {
        token: 'build/MyToken.wasm',
        pool: 'build/OptionsPool.wasm',
        poolBtcQuote: 'build/OptionsPoolBtcQuote.wasm',
        poolBtcUnderlying: 'build/OptionsPoolBtcUnderlying.wasm',
        bridge: 'build/NativeSwapBridge.wasm',
    };
    const mintAmountRaw = BigInt(poolsConfig.testConfig?.mintAmount ?? '1000000');

    // -------------------------------------------------------------------
    // Step 1: Deploy tokens if addresses are empty (skip BTC)
    // -------------------------------------------------------------------

    let underlyingAddr = poolCfg.underlying.addresses[networkId];
    let premiumAddr = poolCfg.premium.addresses[networkId];

    if (!underlyingAddr && !isBtcToken(poolCfg.underlying.symbol)) {
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

        if (!noWait) {
            const block = await provider.getBlockNumber();
            await waitForBlock(provider, block, 1);
        }
    } else if (isBtcToken(poolCfg.underlying.symbol)) {
        log.info(`${poolCfg.underlying.symbol} is native BTC — no contract to deploy`);
    } else {
        log.info(`${poolCfg.underlying.symbol} already deployed: ${formatAddress(underlyingAddr)}`);
    }

    if (!premiumAddr && !isBtcToken(poolCfg.premium.symbol)) {
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

        if (!noWait) {
            const block = await provider.getBlockNumber();
            await waitForBlock(provider, block, 1);
        }
    } else if (isBtcToken(poolCfg.premium.symbol)) {
        log.info(`${poolCfg.premium.symbol} is native BTC — no contract to deploy`);
    } else {
        log.info(`${poolCfg.premium.symbol} already deployed: ${formatAddress(premiumAddr)}`);
    }

    // -------------------------------------------------------------------
    // Step 2: Mint test supply (skip BTC tokens — native asset)
    // -------------------------------------------------------------------

    const walletAddress = config.wallet.address;
    const buyerWallet = config.mnemonic.deriveOPWallet(AddressTypes.P2TR, 1);

    if (!isBtcToken(poolCfg.underlying.symbol) && underlyingAddr) {
        const mintAmount = mintAmountRaw * (10n ** BigInt(poolCfg.underlying.decimals));
        log.info(`Minting ${mintAmountRaw} ${poolCfg.underlying.symbol} to deployer...`);
        await deployer.callContract(underlyingAddr, createMintCalldata(walletAddress, mintAmount), 25_000n);
        log.info(`Minting ${mintAmountRaw} ${poolCfg.underlying.symbol} to buyer (index 1)...`);
        await deployer.callContract(underlyingAddr, createMintCalldata(buyerWallet.address, mintAmount), 25_000n);
    }

    if (!isBtcToken(poolCfg.premium.symbol) && premiumAddr) {
        const mintAmount = mintAmountRaw * (10n ** BigInt(poolCfg.premium.decimals));
        log.info(`Minting ${mintAmountRaw} ${poolCfg.premium.symbol} to deployer...`);
        await deployer.callContract(premiumAddr, createMintCalldata(walletAddress, mintAmount), 25_000n);
        log.info(`Minting ${mintAmountRaw} ${poolCfg.premium.symbol} to buyer (index 1)...`);
        await deployer.callContract(premiumAddr, createMintCalldata(buyerWallet.address, mintAmount), 25_000n);
    }

    // -------------------------------------------------------------------
    // Step 3: Deploy pool contract
    // -------------------------------------------------------------------

    let poolAddr = poolCfg.pool.addresses[networkId];

    if (!poolAddr) {
        log.info(`Deploying pool (type ${poolType})...`);

        const feeRecipientWallet = config.mnemonic.deriveOPWallet(AddressTypes.P2TR, 2);

        // Resolve token hex addresses for pool constructor.
        // BTC tokens have no contract address — use a zero address placeholder.
        const ZERO_ADDR = '0x' + '00'.repeat(32);
        const underlyingHex = underlyingAddr
            ? await resolveToHex(provider, underlyingAddr)
            : ZERO_ADDR;
        const premiumHex = premiumAddr
            ? await resolveToHex(provider, premiumAddr)
            : ZERO_ADDR;

        const gracePeriod = BigInt(poolCfg.gracePeriod ?? 144);

        let poolCalldata: Uint8Array;
        if (poolType === 1 || poolType === 2) {
            // BTC pool types need bridge address
            const bridgeAddr = poolCfg.bridge?.addresses[networkId];
            if (!bridgeAddr) {
                throw new Error(
                    `Pool "${poolCfg.id}" is type ${poolType} but has no bridge address for ${networkId}`
                );
            }
            const bridgeHex = await resolveToHex(provider, bridgeAddr);
            poolCalldata = createBtcPoolCalldata(
                Address.fromString(underlyingHex),
                Address.fromString(premiumHex),
                feeRecipientWallet.address,
                Address.fromString(bridgeHex),
                gracePeriod,
            );
        } else {
            poolCalldata = createPoolCalldata(
                Address.fromString(underlyingHex),
                Address.fromString(premiumHex),
                feeRecipientWallet.address,
                gracePeriod,
            );
        }

        const wasmPath = getPoolWasmPath(poolType, wasmPaths);
        const result = await deployer.deployContract(wasmPath, poolCalldata, 50_000n);
        poolAddr = result.contractAddress;
        poolCfg.pool.addresses[networkId] = poolAddr;
        savePoolsConfig(poolsConfig);
        log.success(`Pool deployed at ${formatAddress(poolAddr)}`);

        if (!noWait) {
            const block = await provider.getBlockNumber();
            await waitForBlock(provider, block, 1);
        }
    } else {
        log.info(`Pool already deployed: ${formatAddress(poolAddr)}`);
    }

    // -------------------------------------------------------------------
    // Step 4: Register pool in factory
    // -------------------------------------------------------------------

    const factoryAddr = poolsConfig.factory.addresses[networkId];
    if (!factoryAddr) {
        log.warn('No factory address configured — skipping registration.');
    } else {
        log.info('Registering pool in factory...');

        try {
            const poolHex = await resolveToHex(provider, poolAddr);
            const regUnderlyingHex = underlyingAddr
                ? await resolveToHex(provider, underlyingAddr)
                : '0x' + '00'.repeat(32);
            const regPremiumHex = premiumAddr
                ? await resolveToHex(provider, premiumAddr)
                : '0x' + '00'.repeat(32);

            const registerCalldata = createRegisterPoolCalldata(
                Address.fromString(poolHex),
                Address.fromString(regUnderlyingHex),
                Address.fromString(regPremiumHex),
            );

            await deployer.callContract(factoryAddr, registerCalldata, 50_000n);
            log.success('Pool registered in factory');
        } catch (err) {
            log.warn(`Factory registration failed (contract may not be mined yet): ${(err as Error).message}`);
            log.warn('Re-run without --no-wait after block confirms to register in factory.');
        }
    }

    // -------------------------------------------------------------------
    // Done
    // -------------------------------------------------------------------

    log.success(`Pool "${poolCfg.id}" deployment complete!`);
    log.info(`  Type:       ${poolType}`);
    log.info(`  Underlying: ${poolCfg.underlying.symbol} @ ${underlyingAddr ? formatAddress(underlyingAddr) : 'BTC (native)'}`);
    log.info(`  Premium:    ${poolCfg.premium.symbol} @ ${premiumAddr ? formatAddress(premiumAddr) : 'BTC (native)'}`);
    log.info(`  Pool:       ${formatAddress(poolAddr)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const { poolId, deployAll, noWait } = parseArgs();
    const poolsConfig = loadPoolsConfig();
    const networkId = getNetworkId();

    // Determine which pools to deploy
    let poolsToDeploy: PoolConfig[];
    if (deployAll) {
        poolsToDeploy = poolsConfig.pools.filter(
            (p) => !p.pool.addresses[networkId]
        );
        if (poolsToDeploy.length === 0) {
            log.success('All pools already deployed. Nothing to do.');
            return;
        }
        log.info(`Found ${poolsToDeploy.length} pool(s) to deploy: ${poolsToDeploy.map((p) => p.id).join(', ')}`);
    } else {
        const poolCfg = poolsConfig.pools.find((p) => p.id === poolId);
        if (!poolCfg) {
            const ids = poolsConfig.pools.map((p) => p.id).join(', ');
            throw new Error(`Pool "${poolId}" not found in pools.config.json. Available: ${ids}`);
        }
        poolsToDeploy = [poolCfg];
    }

    const config = getConfig();
    const provider = new JSONRpcProvider({
        url: process.env.OPNET_RPC_URL || `https://${networkId}.opnet.org`,
        network: config.network,
    });

    const deployer = new DeploymentHelper(provider, config.wallet, config.network);
    const balance = await deployer.checkBalance();
    log.info(`Deployer balance: ${balance} sats`);

    if (balance < 100_000n) {
        throw new Error('Insufficient balance. Fund your deployer wallet first.');
    }

    for (const poolCfg of poolsToDeploy) {
        await deployPool(poolCfg, poolsConfig, deployer, provider, networkId, noWait);
    }

    log.success('\nAll deployments complete!');

    // Print summary of all pool addresses
    log.info('\nPool addresses for indexer (POOL_ADDRESSES):');
    const allAddrs = poolsConfig.pools
        .map((p) => p.pool.addresses[networkId])
        .filter(Boolean);
    log.info(allAddrs.join(' '));
}

main().catch((err) => {
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
