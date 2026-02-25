import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import { Address, BinaryWriter } from '@btc-vision/transaction';
import {
    getConfig,
    loadDeployedContracts,
    getLogger,
    formatAddress,
    FACTORY_SELECTORS,
    TOKEN_SELECTORS,
} from './config.js';
import type { CallResult, ICallRequestError, ContractData } from 'opnet';

const log = getLogger('04-option-operations');

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
    duration?: number;
    data?: Record<string, unknown> | undefined;
}

const results: TestResult[] = [];

async function runTest(
    name: string,
    testFn: () => Promise<Record<string, unknown> | void>,
): Promise<void> {
    log.info(`Running: ${name}...`);
    const start = Date.now();

    try {
        const data = await testFn();
        const duration = Date.now() - start;
        results.push({
            name,
            passed: true,
            duration,
            data: data as Record<string, unknown> | undefined,
        });
        log.success(`${name} (${duration}ms)`);
    } catch (error) {
        const duration = Date.now() - start;
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        results.push({ name, passed: false, error: errorMessage, duration });
        log.error(`${name} (${duration}ms): ${errorMessage}`);
    }
}

function isCallError(
    result: CallResult | ICallRequestError,
): result is ICallRequestError {
    return 'error' in result;
}

function isContractData(
    code: Uint8Array | ContractData,
): code is ContractData {
    return typeof code === 'object' && code !== null && 'bytecode' in code;
}

async function main() {
    log.info('=== FroGop Factory & Token Read Tests ===');
    log.info(`Network: ${process.env.OPNET_NETWORK || 'regtest'}`);

    const config = getConfig();
    const deployed = loadDeployedContracts();

    if (!deployed?.factory || !deployed?.poolTemplate) {
        log.error('Contracts not deployed. Run deployment scripts first.');
        process.exit(1);
    }

    log.info(`Using contracts:`);
    log.info(`  Factory: ${formatAddress(deployed.factory)}`);
    log.info(`  Pool Template: ${formatAddress(deployed.poolTemplate)}`);
    log.info(`  FROG-U (MOTO): ${formatAddress(deployed.tokens.frogU)}`);
    log.info(`  FROG-P (PILL): ${formatAddress(deployed.tokens.frogP)}`);

    const provider = new JSONRpcProvider({
        url: config.rpcUrl,
        network: config.network,
    });

    // ========================================
    // TEST 1: Read Factory State
    // ========================================
    await runTest('Factory: Read pool template', async () => {
        const result = await provider.call(
            deployed.factory,
            FACTORY_SELECTORS.getPoolTemplate,
        );

        if (isCallError(result)) {
            throw new Error(`Call error: ${result.error}`);
        }
        if (result.revert) {
            throw new Error(`Revert: ${result.revert}`);
        }

        const templateAddress = result.result.readAddress();
        log.info(`  Pool template: ${formatAddress(templateAddress)}`);

        return { poolTemplate: templateAddress.toString() };
    });

    // ========================================
    // TEST 2: Read Factory Pool Count
    // ========================================
    await runTest('Factory: Read pool count', async () => {
        const result = await provider.call(
            deployed.factory,
            FACTORY_SELECTORS.getPoolCount,
        );

        if (isCallError(result)) {
            throw new Error(`Call error: ${result.error}`);
        }
        if (result.revert) {
            throw new Error(`Revert: ${result.revert}`);
        }

        const poolCount = result.result.readU256();
        log.info(`  Pool count: ${poolCount}`);

        return { poolCount: poolCount.toString() };
    });

    // ========================================
    // TEST 3: Check Pool for Token Pair
    // ========================================
    await runTest('Factory: Query pool for MOTO/PILL', async () => {
        const underlying = Address.fromString(deployed.tokens.frogU);
        const premiumToken = Address.fromString(deployed.tokens.frogP);

        const writer = new BinaryWriter();
        writer.writeAddress(underlying);
        writer.writeAddress(premiumToken);
        const calldata = Buffer.from(writer.getBuffer()).toString('hex');

        const result = await provider.call(
            deployed.factory,
            FACTORY_SELECTORS.getPool + calldata,
        );

        if (isCallError(result)) {
            throw new Error(`Call error: ${result.error}`);
        }
        if (result.revert) {
            throw new Error(`Revert: ${result.revert}`);
        }

        const poolAddress = result.result.readAddress();
        log.info(`  Pool address: ${formatAddress(poolAddress)}`);

        return { poolAddress: poolAddress.toString() };
    });

    // ========================================
    // TEST 4: Read Token Info
    // ========================================
    await runTest('Token: Read MOTO (FROG-U) decimals', async () => {
        const decimalsResult = await provider.call(
            deployed.tokens.frogU,
            TOKEN_SELECTORS.decimals,
        );

        if (isCallError(decimalsResult)) {
            throw new Error(`Call error: ${decimalsResult.error}`);
        }
        if (decimalsResult.revert) {
            throw new Error(`Revert: ${decimalsResult.revert}`);
        }

        const decimals = decimalsResult.result.readU8();
        log.info(`  Decimals: ${decimals}`);

        return { decimals };
    });

    // ========================================
    // TEST 5: Read PILL Token Decimals
    // ========================================
    await runTest('Token: Read PILL (FROG-P) decimals', async () => {
        const decimalsResult = await provider.call(
            deployed.tokens.frogP,
            TOKEN_SELECTORS.decimals,
        );

        if (isCallError(decimalsResult)) {
            throw new Error(`Call error: ${decimalsResult.error}`);
        }
        if (decimalsResult.revert) {
            throw new Error(`Revert: ${decimalsResult.revert}`);
        }

        const decimals = decimalsResult.result.readU8();
        log.info(`  Decimals: ${decimals}`);

        return { decimals };
    });

    // ========================================
    // TEST 6: Read Pool Template Bytecode
    // ========================================
    await runTest('Pool Template: Verify bytecode exists', async () => {
        const code = await provider.getCode(deployed.poolTemplate);

        if (!code) {
            throw new Error('No code at pool template address');
        }

        const bytecode = isContractData(code) ? code.bytecode : code;

        if (!bytecode || bytecode.length === 0) {
            throw new Error('No bytecode at pool template address');
        }

        log.info(`  Bytecode length: ${bytecode.length} bytes`);

        return { bytecodeLength: bytecode.length };
    });

    // ========================================
    // Summary
    // ========================================
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

    log.info('\n=== Test Data ===');
    results.forEach((r) => {
        if (r.data) {
            log.info(`${r.name}: ${JSON.stringify(r.data)}`);
        }
    });

    log.info('\n=== Summary ===');
    log.info(`Success rate: ${((passed / total) * 100).toFixed(1)}%`);
    log.info(
        `Total time: ${results.reduce((sum, r) => sum + (r.duration || 0), 0)}ms`,
    );

    process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
    log.error('Integration tests failed:', error);
    process.exit(1);
});
