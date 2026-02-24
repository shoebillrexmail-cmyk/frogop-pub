import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { getConfig, saveDeployedContracts, loadDeployedContracts, getLogger } from './config.js';
import { DeploymentHelper, getWasmPath } from './deployment.js';

const log = getLogger('02-deploy-factory');

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    log.info('Starting factory and pool deployment...');
    
    const config = getConfig();
    log.info(`Network: ${process.env.OPNET_NETWORK || 'regtest'}`);
    log.info(`RPC: ${config.rpcUrl}`);
    log.info(`Deployer: ${config.wallet.p2tr}`);
    
    const deployed = loadDeployedContracts();
    
    if (!deployed?.tokens?.frogU || !deployed?.tokens?.frogP) {
        log.error('Tokens not deployed! Run 01-deploy-tokens.ts first.');
        process.exit(1);
    }
    
    log.info(`Using tokens:`);
    log.info(`  FROG-U: ${deployed.tokens.frogU}`);
    log.info(`  FROG-P: ${deployed.tokens.frogP}`);
    
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
    
    let factoryAddress: string;
    let poolTemplateAddress: string;
    
    if (deployed?.factory && deployed?.poolTemplate) {
        log.info('Factory and pool template already deployed, skipping...');
        log.info(`Factory: ${deployed.factory}`);
        log.info(`Pool Template: ${deployed.poolTemplate}`);
        factoryAddress = deployed.factory;
        poolTemplateAddress = deployed.poolTemplate;
    } else if (deployed?.factory && !deployed?.poolTemplate) {
        // Factory deployed but not pool - continue with pool
        factoryAddress = deployed.factory;
        log.info(`Factory already deployed: ${factoryAddress}`);
        
        log.info('Waiting for UTXOs to confirm...');
        await sleep(5000);
        
        log.info('Deploying OptionsPool Template...');
        const poolResult = await deployer.deployContract(
            getWasmPath('OptionsPool'),
            undefined,
            30_000n
        );
        poolTemplateAddress = poolResult.contractAddress;
        log.success(`OptionsPool Template deployed at: ${poolTemplateAddress}`);
        
        deployed.poolTemplate = poolTemplateAddress;
        deployed.deployedAt = new Date().toISOString();
        
        saveDeployedContracts(deployed);
    } else {
        log.info('Deploying OptionsFactory...');
        const factoryResult = await deployer.deployContract(
            getWasmPath('OptionsFactory'),
            undefined,
            25_000n
        );
        factoryAddress = factoryResult.contractAddress;
        log.success(`OptionsFactory deployed at: ${factoryAddress}`);
        
        // Save factory first
        deployed.factory = factoryAddress;
        saveDeployedContracts(deployed);
        
        log.info('Waiting for UTXOs to confirm (10 seconds)...');
        await sleep(10000);
        
        // Refresh UTXOs by getting new balance
        const newBalance = await deployer.checkBalance();
        log.info(`New balance: ${newBalance} satoshis`);
        
        log.info('Deploying OptionsPool Template...');
        const poolResult = await deployer.deployContract(
            getWasmPath('OptionsPool'),
            undefined,
            30_000n
        );
        poolTemplateAddress = poolResult.contractAddress;
        log.success(`OptionsPool Template deployed at: ${poolTemplateAddress}`);
        
        deployed.poolTemplate = poolTemplateAddress;
        deployed.deployedAt = new Date().toISOString();
        
        saveDeployedContracts(deployed);
    }
    
    log.success('Factory deployment complete!');
    log.info(`Factory: ${factoryAddress}`);
    log.info(`Pool Template: ${poolTemplateAddress}`);
    
    return { factory: factoryAddress, poolTemplate: poolTemplateAddress };
}

main().catch((error) => {
    log.error('Deployment failed:', error);
    process.exit(1);
});
