import 'dotenv/config';
import { getConfig, loadDeployedContracts, getLogger, formatAddress } from './config.js';

const log = getLogger('03-option-lifecycle');

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
    duration?: number;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    log.info(`Running: ${name}...`);
    const start = Date.now();
    
    try {
        await testFn();
        const duration = Date.now() - start;
        results.push({ name, passed: true, duration });
        log.success(`✓ ${name} (${duration}ms)`);
    } catch (error) {
        const duration = Date.now() - start;
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({ name, passed: false, error: errorMessage, duration });
        log.error(`✗ ${name} (${duration}ms): ${errorMessage}`);
    }
}

async function main() {
    log.info('=== FroGop Integration Tests ===');
    log.info(`Network: ${process.env.OPNET_NETWORK || 'regtest'}`);
    
    const config = getConfig();
    const deployed = loadDeployedContracts();
    
    if (!deployed) {
        log.error('No deployed contracts found. Run deployment scripts first.');
        process.exit(1);
    }
    
    log.info(`Using contracts:`);
    log.info(`  Factory: ${formatAddress(deployed.factory)}`);
    log.info(`  Pool Template: ${formatAddress(deployed.poolTemplate)}`);
    log.info(`  FROG-U (MOTO): ${formatAddress(deployed.tokens.frogU)}`);
    log.info(`  FROG-P (PILL): ${formatAddress(deployed.tokens.frogP)}`);
    
    await runTest('Connect to provider', async () => {
        const { JSONRpcProvider } = await import('opnet');
        const provider = new JSONRpcProvider({ url: config.rpcUrl, network: config.network });
        const blockNumber = await provider.getBlockNumber();
        if (typeof blockNumber !== 'bigint' || blockNumber < 0n) {
            throw new Error(`Invalid block number: ${blockNumber}`);
        }
        log.info(`  Current block: ${blockNumber}`);
    });
    
    await runTest('Check wallet balance', async () => {
        const { JSONRpcProvider } = await import('opnet');
        const provider = new JSONRpcProvider({ url: config.rpcUrl, network: config.network });
        const balance = await provider.getBalance(config.wallet.p2tr);
        log.info(`  Balance: ${balance} satoshis`);
        if (balance === 0n) {
            throw new Error('Wallet has no balance. Please fund it first.');
        }
    });
    
    await runTest('Verify deployed tokens', async () => {
        const { JSONRpcProvider } = await import('opnet');
        const provider = new JSONRpcProvider({ url: config.rpcUrl, network: config.network });
        
        for (const [name, address] of Object.entries(deployed.tokens)) {
            const code = await provider.getCode(address as string);
            if (!code) {
                throw new Error(`No code at ${name} address: ${address}`);
            }
            log.info(`  ${name}: ${formatAddress(address as string)}`);
        }
    });
    
    await runTest('Verify factory contract', async () => {
        const { JSONRpcProvider } = await import('opnet');
        const provider = new JSONRpcProvider({ url: config.rpcUrl, network: config.network });
        const code = await provider.getCode(deployed.factory);
        if (!code) {
            throw new Error(`No code at factory address: ${deployed.factory}`);
        }
        log.info(`  Factory: ${formatAddress(deployed.factory)}`);
    });
    
    await runTest('Verify pool template contract', async () => {
        const { JSONRpcProvider } = await import('opnet');
        const provider = new JSONRpcProvider({ url: config.rpcUrl, network: config.network });
        const code = await provider.getCode(deployed.poolTemplate);
        if (!code) {
            throw new Error(`No code at pool template address: ${deployed.poolTemplate}`);
        }
        log.info(`  Pool Template: ${formatAddress(deployed.poolTemplate)}`);
    });
    
    log.info('\n=== Test Results ===');
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const total = results.length;
    
    log.info(`Total: ${total}`);
    log.success(`Passed: ${passed}`);
    if (failed > 0) {
        log.error(`Failed: ${failed}`);
        results
            .filter((r) => !r.passed)
            .forEach((r) => {
                log.error(`  - ${r.name}: ${r.error}`);
            });
    }
    
    log.info('\n=== Summary ===');
    log.info(`Success rate: ${((passed / total) * 100).toFixed(1)}%`);
    log.info(`Total time: ${results.reduce((sum, r) => sum + (r.duration || 0), 0)}ms`);
    
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
    log.error('Integration tests failed:', error);
    process.exit(1);
});
