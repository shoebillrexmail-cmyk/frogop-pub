import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { Address, BinaryWriter } from '@btc-vision/transaction';
import {
    getConfig,
    saveDeployedContracts,
    loadDeployedContracts,
    getLogger,
    // formatAddress,
    sleep,
    waitForBlock,
    computeSelectorU32,
} from './config.js';
import { DeploymentHelper, getWasmPath } from './deployment.js';

const log = getLogger('01-deploy-tokens');

// Pre-deployed tokens on regtest (skip deployment)
const REGTEST_TOKENS = {
    MOTO: '0x0a6732489a31e6de07917a28ff7df311fc5f98f6e1664943ac1c3fe7893bdab5',
    PILL: '0xfb7df2f08d8042d4df0506c0d4cee3cfa5f2d7b02ef01ec76dd699551393a438',
};

const MINT_SELECTOR = computeSelectorU32('mint(address,uint256)');

function createMintCalldata(to: Address, amount: bigint): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(MINT_SELECTOR);
    writer.writeAddress(to);
    writer.writeU256(amount);
    return writer.getBuffer();
}

async function deployAndMintToken(
    deployer: DeploymentHelper,
    provider: JSONRpcProvider,
    label: string,
    mintTo: Address,
    mintAmount: bigint,
): Promise<string> {
    log.info(`Deploying ${label} token...`);
    const result = await deployer.deployContract(
        getWasmPath('MyToken'),
        undefined, // Token uses hardcoded params in onDeployment
        25_000n,
    );
    log.success(`${label} deployed at: ${result.contractAddress}`);

    // Wait for deployment to be mined
    log.info(`Waiting for ${label} deployment to be mined...`);
    const startBlock = await provider.getBlockNumber();
    await waitForBlock(provider, startBlock, 1, 300); // up to 25 min

    // Mint tokens to deployer
    log.info(`Minting ${mintAmount.toString()} ${label} to deployer...`);
    const mintCalldata = createMintCalldata(mintTo, mintAmount);
    const mintResult = await deployer.callContract(
        result.contractAddress,
        mintCalldata,
        25_000n,
    );
    log.success(`${label} mint TX: ${mintResult.txId}`);

    return result.contractAddress;
}

async function main() {
    log.info('Starting token setup...');

    const config = getConfig();
    const networkEnv = process.env.OPNET_NETWORK || 'regtest';
    log.info(`Network: ${networkEnv}`);
    log.info(`RPC: ${config.rpcUrl}`);
    log.info(`Deployer: ${config.wallet.p2tr}`);

    const provider = new JSONRpcProvider({ url: config.rpcUrl, network: config.network });
    const deployer = new DeploymentHelper(provider, config.wallet, config.network);

    const balance = await deployer.checkBalance();
    log.info(`Balance: ${balance} satoshis (${Number(balance) / 100_000_000} BTC)`);

    if (balance === 0n) {
        log.error('No balance! Please fund your wallet first.');
        process.exit(1);
    }

    // Check for existing deployment
    const existing = loadDeployedContracts();
    if (existing?.tokens?.frogU && existing?.tokens?.frogP && existing?.network === networkEnv) {
        log.info('Tokens already deployed for this network, skipping...');
        log.info(`  FROG-U: ${existing.tokens.frogU}`);
        log.info(`  FROG-P: ${existing.tokens.frogP}`);
        return { frogU: existing.tokens.frogU, frogP: existing.tokens.frogP };
    }

    let frogUAddress: string;
    let frogPAddress: string;

    if (networkEnv === 'regtest') {
        // Use pre-deployed tokens on regtest
        frogUAddress = REGTEST_TOKENS.MOTO;
        frogPAddress = REGTEST_TOKENS.PILL;
        log.info('Using pre-deployed regtest tokens:');
        log.info(`  FROG-U (MOTO): ${frogUAddress}`);
        log.info(`  FROG-P (PILL): ${frogPAddress}`);
    } else {
        // Deploy fresh tokens on testnet/mainnet
        // Use wallet.address (MLDSA hash) — this matches what balanceOf queries use
        const walletAddress = config.wallet.address;
        const mintAmount = 1_000_000n * (10n ** 18n); // 1M tokens each

        frogUAddress = await deployAndMintToken(
            deployer, provider, 'FROG-U', walletAddress, mintAmount,
        );

        // Wait for UTXO availability between deployments
        log.info('Waiting 15s for UTXOs to settle...');
        await sleep(15000);

        frogPAddress = await deployAndMintToken(
            deployer, provider, 'FROG-P', walletAddress, mintAmount,
        );
    }

    // Save to deployed contracts
    const contracts = {
        network: networkEnv,
        rpcUrl: config.rpcUrl,
        deployer: config.wallet.p2tr.toString(),
        tokens: {
            frogU: frogUAddress,
            frogP: frogPAddress,
        },
        factory: '',
        poolTemplate: '',
        pool: undefined as string | undefined,
        deployedAt: new Date().toISOString(),
    };

    saveDeployedContracts(contracts);

    log.success('Token setup complete!');
    log.info(`FROG-U: ${frogUAddress}`);
    log.info(`FROG-P: ${frogPAddress}`);

    return { frogU: frogUAddress, frogP: frogPAddress };
}

main().catch((error) => {
    log.error('Deployment failed:', error);
    process.exit(1);
});
