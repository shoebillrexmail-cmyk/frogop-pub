import 'dotenv/config';
import { JSONRpcProvider } from 'opnet';
import type { CallResult, ICallRequestError } from 'opnet';
import { Address, AddressTypes, BinaryWriter } from '@btc-vision/transaction';
import {
    getConfig,
    loadDeployedContracts,
    getLogger,
    formatAddress,
    formatBigInt,
    waitForBlock,
    POOL_SELECTORS,
    TOKEN_SELECTORS,
} from './config.js';
import {
    DeploymentHelper,
    createWriteOptionCalldata,
    createCancelOptionCalldata,
    createIncreaseAllowanceCalldata,
} from './deployment.js';

const log = getLogger('11-put-lifecycle');

// =========================================================================
// Test harness
// =========================================================================

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
    duration?: number;
    data?: Record<string, unknown>;
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
        results.push({ name, passed: true, duration, data: data as Record<string, unknown> | undefined });
        log.success(`${name} (${duration}ms)`);
    } catch (error) {
        const duration = Date.now() - start;
        const msg = error instanceof Error ? error.message : String(error);
        results.push({ name, passed: false, error: msg, duration });
        log.error(`${name} (${duration}ms): ${msg}`);
    }
}

function isCallError(result: CallResult | ICallRequestError): result is ICallRequestError {
    return 'error' in result;
}

// =========================================================================
// Helpers
// =========================================================================

function buildBalanceOfCalldata(addressHex: string): string {
    const addr = Address.fromString(addressHex);
    const w = new BinaryWriter();
    w.writeAddress(addr);
    return Buffer.from(w.getBuffer() as Uint8Array).toString('hex');
}

async function readOptionStatus(
    provider: JSONRpcProvider,
    poolCallAddr: string,
    optionId: bigint,
): Promise<{ optType: number; strikePrice: bigint; underlyingAmount: bigint; premium: bigint; status: number } | null> {
    const w = new BinaryWriter();
    w.writeU256(optionId);
    const cd = Buffer.from(w.getBuffer() as Uint8Array).toString('hex');
    const result = await provider.call(poolCallAddr, POOL_SELECTORS.getOption + cd);
    if (isCallError(result) || result.revert) return null;
    const reader = result.result;
    reader.readU256(); // id
    reader.readAddress(); // writer
    reader.readAddress(); // buyer
    const optType = reader.readU8();
    const strikePrice = reader.readU256();
    const underlyingAmount = reader.readU256();
    const premium = reader.readU256();
    reader.readU64(); // expiry
    const status = reader.readU8();
    return { optType, strikePrice, underlyingAmount, premium, status };
}

// =========================================================================
// Main
// =========================================================================

async function main() {
    log.info('=== FroGop PUT Lifecycle Tests ===');

    const config = getConfig();
    const deployed = loadDeployedContracts();

    if (!deployed?.pool) {
        log.error('Pool not deployed. Run 06-full-lifecycle first.');
        process.exit(1);
    }

    const provider = new JSONRpcProvider({
        url: config.rpcUrl,
        network: config.network,
    });

    const writerWallet = config.wallet;
    const deployer = new DeploymentHelper(provider, writerWallet, config.network);
    const walletHex = writerWallet.address.toString();

    const poolAddress = deployed.pool;
    const poolCallAddr = poolAddress.startsWith('0x')
        ? poolAddress
        : (await provider.getPublicKeyInfo(poolAddress, true)).toString();

    let currentBlock = await provider.getBlockNumber();
    log.info(`Current block: ${currentBlock}`);
    log.info(`Pool: ${formatAddress(poolAddress)}`);
    log.info(`Pool hex: ${poolCallAddr.substring(0, 14)}...`);

    // PUT constants (18-decimal)
    const PUT_STRIKE = 50n * 10n ** 18n;     // 50 PILL per MOTO
    const PUT_AMOUNT = 1n * 10n ** 18n;      // 1 MOTO
    const PUT_PREMIUM = 3n * 10n ** 18n;     // 3 PILL
    const PUT_COLLATERAL = PUT_STRIKE * PUT_AMOUNT / (10n ** 18n); // = 50e18

    log.info(`PUT collateral: ${formatBigInt(PUT_COLLATERAL)} PILL`);

    // Read fee recipient
    const feeResult = await provider.call(poolCallAddr, POOL_SELECTORS.feeRecipient);
    let poolFeeRecipientHex: string | null = null;
    if (!isCallError(feeResult) && !feeResult.revert) {
        poolFeeRecipientHex = feeResult.result.readAddress().toString();
        log.info(`Fee recipient: ${formatAddress(poolFeeRecipientHex)}`);
    }

    // Check PILL balance
    const pillBalCd = buildBalanceOfCalldata(walletHex);
    const pillBal = await provider.call(deployed.tokens.frogP, TOKEN_SELECTORS.balanceOf + pillBalCd);
    if (!isCallError(pillBal) && !pillBal.revert) {
        const balance = pillBal.result.readU256();
        log.info(`Writer PILL balance: ${formatBigInt(balance)}`);
        if (balance < PUT_COLLATERAL) {
            log.error(`Insufficient PILL for PUT collateral: have ${formatBigInt(balance)}, need ${formatBigInt(PUT_COLLATERAL)}`);
            process.exit(1);
        }
    }

    // Record balances before PUT write
    let prePutPoolPill = 0n;
    let prePutFeePill = 0n;
    {
        const poolCd = buildBalanceOfCalldata(poolCallAddr);
        const pr = await provider.call(deployed.tokens.frogP, TOKEN_SELECTORS.balanceOf + poolCd);
        if (!isCallError(pr) && !pr.revert) prePutPoolPill = pr.result.readU256();

        if (poolFeeRecipientHex) {
            const feeCd = buildBalanceOfCalldata(poolFeeRecipientHex);
            const fr = await provider.call(deployed.tokens.frogP, TOKEN_SELECTORS.balanceOf + feeCd);
            if (!isCallError(fr) && !fr.revert) prePutFeePill = fr.result.readU256();
        }
    }

    log.info(`Pool PILL before: ${formatBigInt(prePutPoolPill)}`);
    log.info(`Fee recipient PILL before: ${formatBigInt(prePutFeePill)}`);

    // Read option count before
    let prePutOptionCount = 0n;
    {
        const r = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
        if (!isCallError(r) && !r.revert) prePutOptionCount = r.result.readU256();
    }
    log.info(`Option count before: ${prePutOptionCount}`);

    let putOptionId: bigint | null = null;

    // =====================================================================
    // TEST 1: Approve PILL for pool
    // =====================================================================

    await runTest('PUT: Approve PILL collateral for pool', async () => {
        const poolAddr = Address.fromString(poolCallAddr);
        const calldata = createIncreaseAllowanceCalldata(poolAddr, PUT_COLLATERAL);
        currentBlock = await provider.getBlockNumber();
        const result = await deployer.callContract(deployed.tokens.frogP, calldata, 50_000n);
        log.info(`  Approve TX: ${result.txId}`);
        try {
            currentBlock = await waitForBlock(provider, currentBlock, 3);
        } catch {
            log.warn('  Block timeout - TX broadcast OK');
        }
        return { txId: result.txId };
    });

    // =====================================================================
    // TEST 2: Write PUT option
    // =====================================================================

    await runTest('PUT: Write PUT option', async () => {
        currentBlock = await provider.getBlockNumber();
        const expiryBlock = currentBlock + 1000n;
        const calldata = createWriteOptionCalldata(1, PUT_STRIKE, expiryBlock, PUT_AMOUNT, PUT_PREMIUM);
        const result = await deployer.callContract(poolAddress, calldata, 200_000n);
        log.info(`  Write PUT TX: ${result.txId}`);
        return { txId: result.txId };
    });

    // =====================================================================
    // TEST 3: Verify PUT option exists
    // =====================================================================

    await runTest('PUT: Verify PUT option exists', async () => {
        const expectedCount = prePutOptionCount + 1n;
        for (let attempt = 0; attempt < 24; attempt++) {
            const r = await provider.call(poolCallAddr, POOL_SELECTORS.optionCount);
            if (!isCallError(r) && !r.revert) {
                const count = r.result.readU256();
                if (count >= expectedCount) {
                    putOptionId = prePutOptionCount;
                    log.info(`  Option count: ${count}, PUT option ID: ${putOptionId}`);
                    return { optionCount: count.toString(), optionId: putOptionId.toString() };
                }
            }
            if (attempt < 23) {
                log.info(`  Waiting for PUT option... (${attempt + 1}/24)`);
                await new Promise((r) => setTimeout(r, 30_000));
            }
        }
        throw new Error('PUT option not confirmed after 24 attempts');
    });

    // =====================================================================
    // TEST 4: Read PUT option state
    // =====================================================================

    await runTest('PUT: Read PUT option state', async () => {
        if (putOptionId === null) throw new Error('No PUT option ID');
        const opt = await readOptionStatus(provider, poolCallAddr, putOptionId);
        if (!opt) throw new Error('Failed to read PUT option');

        log.info(`  optType: ${opt.optType} (1=PUT)`);
        log.info(`  strikePrice: ${opt.strikePrice}`);
        log.info(`  underlyingAmount: ${opt.underlyingAmount}`);
        log.info(`  premium: ${opt.premium}`);
        log.info(`  status: ${opt.status} (0=OPEN)`);

        if (opt.optType !== 1) throw new Error(`Expected PUT (1), got ${opt.optType}`);
        if (opt.status !== 0) throw new Error(`Expected OPEN (0), got ${opt.status}`);
        if (opt.strikePrice !== PUT_STRIKE) throw new Error(`Strike mismatch: ${opt.strikePrice} vs ${PUT_STRIKE}`);

        return { optionType: 'PUT', strikePrice: opt.strikePrice.toString(), status: opt.status };
    });

    // =====================================================================
    // TEST 5: Verify PILL locked in pool
    // =====================================================================

    await runTest('PUT: Verify PILL locked in pool', async () => {
        const poolCd = buildBalanceOfCalldata(poolCallAddr);
        const pr = await provider.call(deployed.tokens.frogP, TOKEN_SELECTORS.balanceOf + poolCd);
        if (isCallError(pr) || pr.revert) throw new Error('Failed to read pool PILL balance');

        const postPoolPill = pr.result.readU256();
        const pillIncrease = postPoolPill - prePutPoolPill;
        log.info(`  Pool PILL before: ${formatBigInt(prePutPoolPill)}`);
        log.info(`  Pool PILL after:  ${formatBigInt(postPoolPill)}`);
        log.info(`  PILL increase:    ${formatBigInt(pillIncrease)}`);
        log.info(`  Expected:         ${formatBigInt(PUT_COLLATERAL)}`);

        if (pillIncrease < PUT_COLLATERAL) {
            throw new Error(`Pool PILL increase ${pillIncrease} less than expected ${PUT_COLLATERAL}`);
        }
        return { collateralLocked: formatBigInt(pillIncrease) };
    });

    // =====================================================================
    // TEST 6: Cancel PUT option
    // =====================================================================

    await runTest('PUT: Cancel PUT option', async () => {
        if (putOptionId === null) throw new Error('No PUT option ID');
        const calldata = createCancelOptionCalldata(putOptionId);
        currentBlock = await provider.getBlockNumber();
        const result = await deployer.callContract(poolAddress, calldata, 200_000n);
        log.info(`  Cancel PUT TX: ${result.txId}`);

        try {
            currentBlock = await waitForBlock(provider, currentBlock, 3);
        } catch {
            log.warn('  Block timeout');
        }

        // Poll for CANCELLED (4)
        for (let attempt = 0; attempt < 12; attempt++) {
            const opt = await readOptionStatus(provider, poolCallAddr, putOptionId!);
            if (opt && opt.status === 4) {
                log.info(`  PUT option cancelled (status=4)`);
                return { txId: result.txId, status: 'CANCELLED' };
            }
            if (attempt < 11) {
                log.info(`  Waiting for cancel confirmation... (${attempt + 1}/12)`);
                await new Promise((r) => setTimeout(r, 30_000));
            }
        }
        throw new Error('PUT cancel not confirmed');
    });

    // =====================================================================
    // TEST 7: Verify fee recipient received cancel fee in PILL
    // =====================================================================

    await runTest('PUT: Verify cancel fee in PILL', async () => {
        if (!poolFeeRecipientHex) throw new Error('No fee recipient');
        const feeCd = buildBalanceOfCalldata(poolFeeRecipientHex);
        const fr = await provider.call(deployed.tokens.frogP, TOKEN_SELECTORS.balanceOf + feeCd);
        if (isCallError(fr) || fr.revert) throw new Error('Failed to read fee recipient PILL');

        const postFeePill = fr.result.readU256();
        const feeReceived = postFeePill - prePutFeePill;
        const expectedFee = (PUT_COLLATERAL * 100n + 9999n) / 10000n; // ceiling(1%)

        log.info(`  Fee recipient PILL before: ${formatBigInt(prePutFeePill)}`);
        log.info(`  Fee recipient PILL after:  ${formatBigInt(postFeePill)}`);
        log.info(`  Fee received: ${formatBigInt(feeReceived)}`);
        log.info(`  Expected fee: ${formatBigInt(expectedFee)}`);

        if (feeReceived < expectedFee) {
            throw new Error(`Fee ${feeReceived} less than expected ${expectedFee}`);
        }
        return { feeReceived: formatBigInt(feeReceived), expected: formatBigInt(expectedFee) };
    });

    // =====================================================================
    // Summary
    // =====================================================================

    log.info('\n=== PUT Lifecycle Test Results ===');
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    for (const r of results) {
        const icon = r.passed ? 'PASS' : 'FAIL';
        const duration = r.duration ? ` (${r.duration}ms)` : '';
        const extra = r.error ? ` — ${r.error}` : '';
        log.info(`  [${icon}] ${r.name}${duration}${extra}`);
    }

    log.info(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
    log.error(`Fatal: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
