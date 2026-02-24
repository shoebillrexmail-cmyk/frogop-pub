import 'dotenv/config';
import {
    Mnemonic,
    MLDSASecurityLevel,
    Wallet,
    Address,
    AddressTypes,
} from '@btc-vision/transaction';
import { networks, Network } from '@btc-vision/bitcoin';
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
            network = networks.testnet;
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
    pool?: string;
    deployedAt: string;
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
