/**
 * test-harness.ts
 *
 * Shared test infrastructure for integration tests 06a-10.
 * Extracts the duplicated harness (TestResult, runTest, skipTest, isCallError),
 * option-reading helpers, polling loops, and pool-state sidecar I/O.
 */

import * as fs from 'fs';
import * as path from 'path';
import { JSONRpcProvider } from 'opnet';
import type { CallResult, ICallRequestError } from 'opnet';
import { Address, BinaryWriter } from '@btc-vision/transaction';
import {
    getConfig,
    loadDeployedContracts,
    getLogger,
    resolvePoolAddress,
    POOL_SELECTORS,
    TOKEN_SELECTORS,
} from './config.js';
import { DeploymentHelper } from './deployment.js';

// Re-export config types that test files need
export type { IntegrationConfig, DeployedContracts } from './config.js';
export { getConfig, loadDeployedContracts, getLogger, resolvePoolAddress } from './config.js';
export { POOL_SELECTORS, TOKEN_SELECTORS } from './config.js';

// =========================================================================
// Types
// =========================================================================

export interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
    duration?: number;
    data?: Record<string, unknown>;
    skipped?: boolean;
}

export interface TestHarness {
    readonly results: readonly TestResult[];
    runTest: (name: string, testFn: () => Promise<Record<string, unknown> | void>) => Promise<void>;
    skipTest: (name: string, reason: string) => void;
    printSummary: () => void;
}

// =========================================================================
// Test runner factory
// =========================================================================

export function createTestHarness(logPrefix: string): TestHarness {
    const log = getLogger(logPrefix);
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
            results.push({ name, passed: true, duration, data: data as Record<string, unknown> | undefined });
            log.success(`${name} (${duration}ms)`);
        } catch (error) {
            const duration = Date.now() - start;
            const msg = error instanceof Error ? error.message : String(error);
            results.push({ name, passed: false, error: msg, duration });
            log.error(`${name} (${duration}ms): ${msg}`);
        }
    }

    function skipTest(name: string, reason: string): void {
        log.warn(`SKIP: ${name} - ${reason}`);
        results.push({ name, passed: true, skipped: true, data: { skipped: reason } });
    }

    function printSummary(): void {
        log.info('\n=== Test Results ===');
        const passed = results.filter((r) => r.passed && !r.skipped).length;
        const skipped = results.filter((r) => r.skipped).length;
        const failed = results.filter((r) => !r.passed).length;
        const total = results.length;

        log.info(`Total: ${total}`);
        log.success(`Passed: ${passed}`);
        if (skipped > 0) log.warn(`Skipped: ${skipped}`);
        if (failed > 0) {
            log.error(`Failed: ${failed}`);
            results
                .filter((r) => !r.passed)
                .forEach((r) => log.error(`  - ${r.name}: ${r.error}`));
        }

        log.info('\n=== Test Data ===');
        results.forEach((r) => {
            if (r.data && !r.skipped) {
                log.info(`${r.name}: ${JSON.stringify(r.data)}`);
            }
        });

        const runCount = total - skipped;
        log.info('\n=== Summary ===');
        log.info(`Success rate: ${runCount > 0 ? ((passed / runCount) * 100).toFixed(1) : 0}%`);
        log.info(`Total time: ${results.reduce((sum, r) => sum + (r.duration || 0), 0)}ms`);

        process.exit(failed > 0 ? 1 : 0);
    }

    return { results, runTest, skipTest, printSummary };
}

// =========================================================================
// Type guard
// =========================================================================

export function isCallError(result: CallResult | ICallRequestError): result is ICallRequestError {
    return 'error' in result;
}

// =========================================================================
// Calldata / option-reading helpers
// =========================================================================

export function buildBalanceOfCalldata(ownerHex: string): string {
    const w = new BinaryWriter();
    w.writeAddress(Address.fromString(ownerHex));
    return Buffer.from(w.getBuffer()).toString('hex');
}

/**
 * Full option reader — returns all 9 fields from getOption(uint256).
 * Throws on call error or revert.
 */
export async function readOption(
    provider: JSONRpcProvider,
    poolCallAddr: string,
    optionId: bigint,
): Promise<{
    id: bigint;
    writer: Address;
    buyer: Address;
    optionType: number;
    strikePrice: bigint;
    underlyingAmount: bigint;
    premium: bigint;
    expiryBlock: bigint;
    status: number;
}> {
    const w = new BinaryWriter();
    w.writeU256(optionId);
    const cd = Buffer.from(w.getBuffer() as Uint8Array).toString('hex');
    const result = await provider.call(poolCallAddr, POOL_SELECTORS.getOption + cd);
    if (isCallError(result)) throw new Error(`Call error: ${result.error}`);
    if (result.revert) throw new Error(`Revert: ${result.revert}`);
    const reader = result.result;
    return {
        id: reader.readU256(),
        writer: reader.readAddress(),
        buyer: reader.readAddress(),
        optionType: reader.readU8(),
        strikePrice: reader.readU256(),
        underlyingAmount: reader.readU256(),
        premium: reader.readU256(),
        expiryBlock: reader.readU64(),
        status: reader.readU8(),
    };
}

/**
 * Read option status — returns null on error/revert (non-throwing).
 */
export async function readOptionStatus(
    provider: JSONRpcProvider,
    poolCallAddr: string,
    optionId: bigint,
): Promise<{
    id: bigint; writer: string; buyer: string; optType: number;
    strikePrice: bigint; underlyingAmount: bigint; premium: bigint;
    expiryBlock: bigint; status: number;
} | null> {
    const w = new BinaryWriter();
    w.writeU256(optionId);
    const cd = Buffer.from(w.getBuffer()).toString('hex');
    const result = await provider.call(poolCallAddr, POOL_SELECTORS.getOption + cd);
    if (isCallError(result) || result.revert) return null;
    const reader = result.result;
    return {
        id: reader.readU256(),
        writer: reader.readAddress().toString(),
        buyer: reader.readAddress().toString(),
        optType: reader.readU8(),
        strikePrice: reader.readU256(),
        underlyingAmount: reader.readU256(),
        premium: reader.readU256(),
        expiryBlock: reader.readU64(),
        status: reader.readU8(),
    };
}

/**
 * Read optionCount() view.
 */
export async function readOptionCount(
    provider: JSONRpcProvider,
    poolCallAddr: string,
): Promise<bigint> {
    const result = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
    if (isCallError(result)) throw new Error(`Count call error: ${result.error}`);
    return result.result.readU256();
}

/**
 * Read balanceOf via provider.call.
 */
export async function readTokenBalance(
    provider: JSONRpcProvider,
    tokenAddr: string,
    ownerHex: string,
): Promise<bigint> {
    const cd = buildBalanceOfCalldata(ownerHex);
    const result = await provider.call(tokenAddr, TOKEN_SELECTORS.balanceOf + cd);
    if (isCallError(result)) throw new Error(`Call error: ${result.error}`);
    if (result.revert) throw new Error(`Revert: ${Buffer.from(result.revert, 'base64').toString()}`);
    return result.result.readU256();
}

// =========================================================================
// Polling helpers
// =========================================================================

/**
 * Poll optionCount until it reaches `expected`. Returns the count.
 */
export async function pollForOptionCount(
    provider: JSONRpcProvider,
    poolCallAddr: string,
    expected: bigint,
    maxAttempts = 24,
    intervalMs = 30_000,
): Promise<bigint> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const result = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
        if (isCallError(result) || result.revert) throw new Error('optionCount call error');
        const count = result.result.readU256();
        if (count >= expected) return count;

        if (attempt < maxAttempts - 1) {
            await new Promise((r) => setTimeout(r, intervalMs));
        }
    }
    throw new Error(`Option count did not reach ${expected} after ${maxAttempts} attempts`);
}

/**
 * Poll option status until it matches `targetStatus`. Returns the option data.
 */
export async function pollForOptionStatus(
    provider: JSONRpcProvider,
    poolCallAddr: string,
    optionId: bigint,
    targetStatus: number,
    maxAttempts = 24,
    intervalMs = 30_000,
): Promise<NonNullable<Awaited<ReturnType<typeof readOptionStatus>>>> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const opt = await readOptionStatus(provider, poolCallAddr, optionId);
        if (!opt) throw new Error('Failed to read option');
        if (opt.status === targetStatus) return opt;

        if (attempt < maxAttempts - 1) {
            await new Promise((r) => setTimeout(r, intervalMs));
        }
    }
    throw new Error(`Option ${optionId} did not reach status ${targetStatus} after ${maxAttempts} attempts`);
}

// =========================================================================
// Address resolution helpers
// =========================================================================

/**
 * Poll getPublicKeyInfo until it returns a valid result.
 * Newly deployed contracts aren't visible until mined (~10 min on signet).
 */
export async function pollForPublicKeyInfo(
    provider: JSONRpcProvider,
    address: string,
    maxAttempts = 40,
    intervalMs = 30_000,
): Promise<string> {
    const log = getLogger('poll-pubkey');
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const pk = await provider.getPublicKeyInfo(address, true);
            if (pk) return pk.toString();
        } catch {
            // Not yet visible
        }
        if (attempt < maxAttempts - 1) {
            log.info(`Waiting for ${address.slice(0, 20)}... to be mined (attempt ${attempt + 1}/${maxAttempts})`);
            await new Promise((r) => setTimeout(r, intervalMs));
        }
    }
    throw new Error(`getPublicKeyInfo(${address}) did not resolve after ${maxAttempts} attempts`);
}

/**
 * Resolve a token/contract address to its hex call address.
 * If the address is already hex (0x...), returns it directly.
 * If bech32, calls getPublicKeyInfo to resolve.
 */
export async function resolveCallAddress(
    provider: JSONRpcProvider,
    address: string,
): Promise<string> {
    if (address.startsWith('0x')) return address;
    const pk = await provider.getPublicKeyInfo(address, true);
    if (!pk) throw new Error(`Could not resolve call address for ${address}`);
    return pk.toString();
}

// =========================================================================
// Shared test context initializer
// =========================================================================

export interface TestContext {
    config: ReturnType<typeof getConfig>;
    deployed: NonNullable<ReturnType<typeof loadDeployedContracts>>;
    provider: JSONRpcProvider;
    deployer: DeploymentHelper;
    walletHex: string;
    poolAddress: string;
    poolCallAddr: string;
}

/**
 * Common initialization for test files that need provider + pool address.
 */
export async function initTestContext(): Promise<TestContext> {
    const config = getConfig();
    const deployed = loadDeployedContracts();

    if (!deployed?.factory || !deployed?.poolTemplate) {
        throw new Error('Contracts not deployed. Run 01 and 02 first.');
    }

    const provider = new JSONRpcProvider({
        url: config.rpcUrl,
        network: config.network,
    });
    const deployer = new DeploymentHelper(provider, config.wallet, config.network);
    const walletHex = config.wallet.address.toString();

    const { poolAddress } = resolvePoolAddress(deployed);

    let poolCallAddr: string;
    try {
        const pk = await provider.getPublicKeyInfo(poolAddress, true);
        poolCallAddr = pk.toString();
    } catch {
        throw new Error(`Pool not yet mined (${poolAddress}). Re-run after blocks advance.`);
    }

    return { config, deployed, provider, deployer, walletHex, poolAddress, poolCallAddr };
}

// =========================================================================
// Pool-state sidecar I/O
// =========================================================================

export interface PoolState {
    poolCallAddr: string;
    poolFeeRecipientHex: string;
    initialOptionCount: string;
    updatedAt: string;
}

const POOL_STATE_PATH = path.join(process.cwd(), 'tests', 'integration', 'pool-state.json');

export function loadPoolState(): PoolState {
    if (!fs.existsSync(POOL_STATE_PATH)) {
        throw new Error('pool-state.json not found. Run 06a-pool-state.ts first.');
    }
    return JSON.parse(fs.readFileSync(POOL_STATE_PATH, 'utf-8')) as PoolState;
}

export function savePoolState(state: PoolState): void {
    fs.writeFileSync(POOL_STATE_PATH, JSON.stringify(state, null, 2));
}
