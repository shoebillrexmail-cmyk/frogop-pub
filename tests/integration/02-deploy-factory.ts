import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { Address } from '@btc-vision/transaction';
import { getConfig, saveDeployedContracts, loadDeployedContracts, getLogger, formatAddress, sleep, waitForBlock } from './config.js';
import { DeploymentHelper, getWasmPath, createPoolCalldata, createSetPoolTemplateCalldata } from './deployment.js';
import { FACTORY_SELECTORS } from './config.js';

const log = getLogger('02-deploy-factory');

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
        
        // Deploy Pool template with dummy addresses (will be overwritten when cloned by Factory)
        const dummyUnderlying = Address.fromString('0x0000000000000000000000000000000000000000000000000000000000000000');
        const dummyPremium = Address.fromString('0x0000000000000000000000000000000000000000000000000000000000000001');
        const dummyFeeRecipient = Address.fromString('0x0000000000000000000000000000000000000000000000000000000000000002');
        const poolCalldata = createPoolCalldata(dummyUnderlying, dummyPremium, dummyFeeRecipient);
        
        log.info('Deploying OptionsPool Template (with dummy calldata for template initialization)...');
        const poolResult = await deployer.deployContract(
            getWasmPath('OptionsPool'),
            poolCalldata,
            50_000n  // Increased gas for larger contract
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
        
        // Deploy Pool template with dummy addresses (will be overwritten when cloned by Factory)
        const dummyUnderlying = Address.fromString('0x0000000000000000000000000000000000000000000000000000000000000000');
        const dummyPremium = Address.fromString('0x0000000000000000000000000000000000000000000000000000000000000001');
        const dummyFeeRecipient = Address.fromString('0x0000000000000000000000000000000000000000000000000000000000000002');
        const poolCalldata = createPoolCalldata(dummyUnderlying, dummyPremium, dummyFeeRecipient);
        
        log.info('Deploying OptionsPool Template (with dummy calldata for template initialization)...');
        const poolResult = await deployer.deployContract(
            getWasmPath('OptionsPool'),
            poolCalldata,
            50_000n  // Increased gas for larger contract
        );
        poolTemplateAddress = poolResult.contractAddress;
        log.success(`OptionsPool Template deployed at: ${poolTemplateAddress}`);
        
        deployed.poolTemplate = poolTemplateAddress;
        deployed.deployedAt = new Date().toISOString();
        
        saveDeployedContracts(deployed);
    }
    
    // Now set the pool template on the factory
    log.info('Setting pool template on factory...');
    
    // Check if template is already set
    const templateResult = await provider.call(
        factoryAddress,
        FACTORY_SELECTORS.getPoolTemplate
    );
    
    let needsSetTemplate = true;
    if (!('error' in templateResult) && !templateResult.revert) {
        const currentTemplate = templateResult.result.readAddress();
        if (currentTemplate.toString() === poolTemplateAddress) {
            log.info('Pool template already set on factory');
            needsSetTemplate = false;
        }
    }
    
    if (needsSetTemplate) {
        // Wait for pool template to be mined (poll until getPublicKeyInfo succeeds)
        log.info('Waiting for pool template to be mined...');
        const startBlock = await provider.getBlockNumber();
        await waitForBlock(provider, startBlock, 1, 300); // up to 25 min

        // Refresh deployer's UTXO cache
        const newBalance = await deployer.checkBalance();
        log.info(`Balance: ${newBalance} satoshis`);

        // Get the public key for the pool template address (converts opr1... to 0x... format)
        let templatePubKeyInfo = await provider.getPublicKeyInfo(poolTemplateAddress, true);
        if (!templatePubKeyInfo) {
            log.warn('Pool template not yet visible. Waiting one more block...');
            const cur = await provider.getBlockNumber();
            await waitForBlock(provider, cur, 1, 300);
            templatePubKeyInfo = await provider.getPublicKeyInfo(poolTemplateAddress, true);
            if (!templatePubKeyInfo) {
                throw new Error('Pool template contract not found on-chain after 2 blocks. Re-run this script.');
            }
        }
        const templateAddress = templatePubKeyInfo;

        const setTemplateCalldata = createSetPoolTemplateCalldata(templateAddress);

        log.info(`Calling setPoolTemplate(${formatAddress(templateAddress)})...`);
        const result = await deployer.callContract(
            factoryAddress,
            setTemplateCalldata,
            50_000n  // Increased gas limit
        );
        log.success(`Pool template set! TX: ${result.txId}`);
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
