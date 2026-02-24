import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { getConfig, saveDeployedContracts, loadDeployedContracts, getLogger } from './config.js';
import { DeploymentHelper, getWasmPath } from './deployment.js';

const log = getLogger('01-deploy-tokens');

// Use pre-deployed tokens on regtest
const REGTEST_TOKENS = {
    MOTO: '0x0a6732489a31e6de07917a28ff7df311fc5f98f6e1664943ac1c3fe7893bdab5',
    PILL: '0xfb7df2f08d8042d4df0506c0d4cee3cfa5f2d7b02ef01ec76dd699551393a438',
};

async function main() {
    log.info('Starting token setup...');
    
    const config = getConfig();
    log.info(`Network: ${process.env.OPNET_NETWORK || 'regtest'}`);
    log.info(`RPC: ${config.rpcUrl}`);
    log.info(`Deployer: ${config.wallet.p2tr}`);
    
    const provider = new JSONRpcProvider({ url: config.rpcUrl, network: config.network });
    const deployer = new DeploymentHelper(
        provider,
        config.wallet,
        config.network
    );
    
    const balance = await deployer.checkBalance();
    log.info(`Balance: ${balance} satoshis (${Number(balance) / 100_000_000} BTC)`);
    
    if (balance === 0n) {
        log.error('No balance! Please fund your wallet first.');
        process.exit(1);
    }
    
    // Use pre-deployed tokens
    const frogUAddress = REGTEST_TOKENS.MOTO;  // Using MOTO as underlying
    const frogPAddress = REGTEST_TOKENS.PILL;  // Using PILL as premium
    
    log.info('Using pre-deployed regtest tokens:');
    log.info(`  FROG-U (MOTO): ${frogUAddress}`);
    log.info(`  FROG-P (PILL): ${frogPAddress}`);
    
    // Save to deployed contracts
    const contracts = {
        network: process.env.OPNET_NETWORK || 'regtest',
        rpcUrl: config.rpcUrl,
        deployer: config.wallet.p2tr.toString(),
        tokens: {
            frogU: frogUAddress,
            frogP: frogPAddress,
        },
        factory: '',
        poolTemplate: '',
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
