import 'dotenv/config';
import {
    Mnemonic,
    MLDSASecurityLevel,
    Wallet,
    Address,
    AddressTypes,
} from '@btc-vision/transaction';
import { networks, Network } from '@btc-vision/bitcoin';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface IntegrationConfig {
    network: Network;
    rpcUrl: string;
    wallet: Wallet;
    mnemonic: Mnemonic;
}

let _config: IntegrationConfig | null = null;

export function getConfig(): IntegrationConfig {
    if (_config) return _config;

    const mnemonicPhrase = process.env.OPNET_MNEMONIC;
    if (!mnemonicPhrase) {
        throw new Error(
            'OPNET_MNEMONIC not found in .env file. Copy .env.example to .env and add your mnemonic.'
        );
    }

    const networkEnv = process.env.OPNET_NETWORK || 'regtest';
    const rpcUrl = process.env.OPNET_RPC_URL || `https://${networkEnv}.opnet.org`;

    let network: Network;
    switch (networkEnv) {
        case 'mainnet':
            network = networks.bitcoin;
            break;
        case 'testnet':
            network = networks.opnetTestnet;
            break;
        case 'regtest':
        default:
            network = networks.regtest;
            break;
    }

    const mnemonic = new Mnemonic(
        mnemonicPhrase,
        '',
        network,
        MLDSASecurityLevel.LEVEL2
    );

    // Use OPWallet derivation (matches OPWallet/Unisat wallets)
    const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR);

    _config = {
        network,
        rpcUrl,
        wallet,
        mnemonic,
    };

    return _config;
}

export function getLogger(prefix: string) {
    return {
        info: (msg: string, ...args: unknown[]) =>
            console.log(`[${prefix}] ℹ️ ${msg}`, ...args),
        success: (msg: string, ...args: unknown[]) =>
            console.log(`[${prefix}] ✅ ${msg}`, ...args),
        error: (msg: string, ...args: unknown[]) =>
            console.error(`[${prefix}] ❌ ${msg}`, ...args),
        warn: (msg: string, ...args: unknown[]) =>
            console.warn(`[${prefix}] ⚠️ ${msg}`, ...args),
    };
}

export function formatAddress(addr: Address | string): string {
    const str = addr.toString();
    return `${str.slice(0, 10)}...${str.slice(-8)}`;
}

export function formatBigInt(value: bigint, decimals: number = 18): string {
    const divisor = BigInt(10 ** decimals);
    const whole = value / divisor;
    const fraction = value % divisor;
    const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 4);
    return `${whole}.${fractionStr}`;
}

export const TEST_TOKENS = {
    FROG_U: {
        name: 'Frogop Underlying',
        symbol: 'FROG-U',
        decimals: 18,
        maxSupply: 1_000_000n,
    },
    FROG_P: {
        name: 'Frogop Premium',
        symbol: 'FROG-P',
        decimals: 18,
        maxSupply: 1_000_000n,
    },
};

export interface PoolDeployment {
    id: string;
    underlying: string;
    premium: string;
    pool: string;
}

export interface DeployedContracts {
    network: string;
    rpcUrl: string;
    deployer: string;
    tokens: {
        frogU: string;
        frogP: string;
    };
    factory: string;
    poolTemplate: string;
    /** Legacy single-pool field (backward compat). */
    pool?: string;
    /** Multi-pool array (preferred). */
    pools?: PoolDeployment[];
    /** NativeSwapBridge address (phase 2). */
    bridge?: string;
    /** SpreadRouter address (phase 2). */
    router?: string;
    /** BTC quote pool address (phase 2). */
    btcQuotePool?: string;
    /** BTC underlying pool address (phase 2). */
    btcUnderlyingPool?: string;
    deployedAt: string;
}

/**
 * Resolve pool address from deployed contracts.
 *
 * Checks `--pool-id <id>` CLI arg against `deployed.pools[]`, falls back to
 * `deployed.pool` for backward compatibility with single-pool setups.
 */
export function resolvePoolAddress(deployed: DeployedContracts): { poolAddress: string; underlying: string; premium: string } {
    const args = process.argv.slice(2);
    const poolIdIdx = args.indexOf('--pool-id');
    const poolId = poolIdIdx !== -1 ? args[poolIdIdx + 1] : undefined;

    if (poolId && deployed.pools) {
        const match = deployed.pools.find((p) => p.id === poolId);
        if (match) {
            return { poolAddress: match.pool, underlying: match.underlying, premium: match.premium };
        }
        throw new Error(`Pool "${poolId}" not found in deployed-contracts.json pools array.`);
    }

    // Multi-pool: default to first pool
    if (deployed.pools && deployed.pools.length > 0) {
        const first = deployed.pools[0]!;
        return { poolAddress: first.pool, underlying: first.underlying, premium: first.premium };
    }

    // Legacy single-pool
    if (deployed.pool) {
        return { poolAddress: deployed.pool, underlying: deployed.tokens.frogU, premium: deployed.tokens.frogP };
    }

    throw new Error('No pool address found in deployed-contracts.json. Deploy a pool first.');
}

export function saveDeployedContracts(contracts: DeployedContracts): void {
    const outputPath = path.join(process.cwd(), 'tests', 'integration', 'deployed-contracts.json');
    fs.writeFileSync(outputPath, JSON.stringify(contracts, null, 2));
    console.log(`📝 Deployed contracts saved to ${outputPath}`);
}

export function loadDeployedContracts(): DeployedContracts | null {
    const outputPath = path.join(process.cwd(), 'tests', 'integration', 'deployed-contracts.json');
    if (!fs.existsSync(outputPath)) {
        return null;
    }
    const content = fs.readFileSync(outputPath, 'utf-8');
    return JSON.parse(content) as DeployedContracts;
}

/**
 * Compute OPNet method selector (first 4 bytes of SHA256).
 * Matches btc-runtime's encodeSelector().
 */
export function computeSelector(signature: string): string {
    const hash = createHash('sha256').update(signature).digest();
    return '0x' + hash.subarray(0, 4).toString('hex');
}

/**
 * Compute selector as a 4-byte number (for calldata builders).
 */
export function computeSelectorU32(signature: string): number {
    const hash = createHash('sha256').update(signature).digest();
    return hash.readUInt32BE(0);
}


export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitForBlock(
    provider: { getBlockNumber(): Promise<bigint> },
    startBlock: bigint,
    blocks: number = 3,
    maxAttempts: number = 144
): Promise<bigint> {
    const log = getLogger('waitForBlock');
    const targetBlock = startBlock + BigInt(blocks);
    log.info(`Waiting for block ${targetBlock} (current: ${startBlock})...`);
    let attempts = 0;

    while (attempts < maxAttempts) {
        const currentBlock = await provider.getBlockNumber();
        if (currentBlock >= targetBlock) {
            log.info(`Reached block ${currentBlock}`);
            return currentBlock;
        }
        await sleep(5000);
        attempts++;
    }

    throw new Error(`Timeout waiting for block ${targetBlock}`);
}

/** Common OPNet OP20 token method selectors */
export const TOKEN_SELECTORS = {
    balanceOf: computeSelector('balanceOf(address)'),
    decimals: computeSelector('decimals()'),
    totalSupply: computeSelector('totalSupply()'),
    allowance: computeSelector('allowance(address,address)'),
    increaseAllowance: computeSelectorU32('increaseAllowance(address,uint256)'),
    transfer: computeSelectorU32('transfer(address,uint256)'),
    transferFrom: computeSelectorU32('transferFrom(address,address,uint256)'),
    approve: computeSelectorU32('approve(address,uint256)'),
};

/** OptionsPool method selectors */
export const POOL_SELECTORS = {
    underlying: computeSelector('underlying()'),
    premiumToken: computeSelector('premiumToken()'),
    optionCount: computeSelector('optionCount()'),
    getOptionsBatch: computeSelector('getOptionsBatch(uint256,uint256)'),
    feeRecipient: computeSelector('feeRecipient()'),
    buyFeeBps: computeSelector('buyFeeBps()'),
    exerciseFeeBps: computeSelector('exerciseFeeBps()'),
    gracePeriodBlocks: computeSelector('gracePeriodBlocks()'),
    maxExpiryBlocks: computeSelector('maxExpiryBlocks()'),
    cancelFeeBps: computeSelector('cancelFeeBps()'),
    calculateCollateral: computeSelector('calculateCollateral(uint8,uint256,uint256)'),
    getOption: computeSelector('getOption(uint256)'),
    writeOption: computeSelectorU32('writeOption(uint8,uint256,uint64,uint256,uint256)'),
    cancelOption: computeSelectorU32('cancelOption(uint256)'),
    buyOption: computeSelectorU32('buyOption(uint256)'),
    exercise: computeSelectorU32('exercise(uint256)'),
    settle: computeSelectorU32('settle(uint256)'),
    updateFeeRecipient: computeSelectorU32('updateFeeRecipient(address)'),
    transferOption: computeSelectorU32('transferOption(uint256,address)'),
    transferOptionView: computeSelector('transferOption(uint256,address)'),
    batchCancel: computeSelectorU32('batchCancel(uint256,uint256,uint256,uint256,uint256,uint256)'),
    batchSettle: computeSelectorU32('batchSettle(uint256,uint256,uint256,uint256,uint256,uint256)'),
    batchCancelView: computeSelector('batchCancel(uint256,uint256,uint256,uint256,uint256,uint256)'),
    batchSettleView: computeSelector('batchSettle(uint256,uint256,uint256,uint256,uint256,uint256)'),
    rollOption: computeSelectorU32('rollOption(uint256,uint256,uint64,uint256)'),
    rollOptionView: computeSelector('rollOption(uint256,uint256,uint64,uint256)'),
    registerBtcPubkey: computeSelectorU32('registerBtcPubkey(bytes32)'),
};

/** NativeSwapBridge method selectors */
export const BRIDGE_SELECTORS = {
    getBtcPrice: computeSelector('getBtcPrice(address)'),
    generateCsvScriptHash: computeSelector('generateCsvScriptHash(bytes32,uint64)'),
    generateEscrowScriptHash: computeSelector('generateEscrowScriptHash(bytes32,bytes32,uint64)'),
    verifyBtcOutput: computeSelector('verifyBtcOutput(bytes32,uint64)'),
    nativeSwap: computeSelector('nativeSwap()'),
    bridge: computeSelector('bridge()'),
};

/** OptionsFactory method selectors */
export const FACTORY_SELECTORS = {
    getOwner: computeSelector('getOwner()'),
    getPoolTemplate: computeSelector('getPoolTemplate()'),
    getPoolCount: computeSelector('getPoolCount()'),
    getPool: computeSelector('getPool(address,address)'),
    getPoolByIndex: computeSelector('getPoolByIndex(uint256)'),
    getTreasury: computeSelector('getTreasury()'),
    setPoolTemplate: computeSelectorU32('setPoolTemplate(address)'),
    createPool: computeSelectorU32('createPool(address,address,uint8,uint8)'),
    registerPool: computeSelectorU32('registerPool(address,address,address)'),
};
