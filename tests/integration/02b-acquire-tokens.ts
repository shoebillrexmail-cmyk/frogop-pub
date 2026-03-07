import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import {
    getContract,
    NativeSwapAbi,
    JSONRpcProvider,
    TransactionOutputFlags,
} from 'opnet';
import type {
    INativeSwapContract,
    LiquidityReservedEvent,
    TransactionParameters,
} from 'opnet';
import { Address, BinaryWriter } from '@btc-vision/transaction';
import {
    getConfig,
    loadDeployedContracts,
    getLogger,
    // formatAddress,
    formatBigInt,
    waitForBlock,
    sleep,
    computeSelector,
    TOKEN_SELECTORS,
} from './config.js';

const log = getLogger('02b-acquire-tokens');

const NATIVE_SWAP_ADDRESS =
    '0xb056ba05448cf4a5468b3e1190b0928443981a93c3aff568467f101e94302422';

const SWAP_AMOUNT_SATS = 50_000n;
const MIN_TOKEN_BALANCE = 10n ** 18n;
const RESERVATION_FEE = 5_000n;
const FEES_ADDRESS =
    'bcrt1qup339pnfsgz7rwu5qvw7e3pgdjmpda9zlwlg8ua70v3p8xl3tnqsjm472h';

// State file for tracking pending reservations across runs
const STATE_FILE = path.join(
    process.cwd(),
    'tests',
    'integration',
    'swap-state.json',
);

interface SwapState {
    [tokenName: string]: {
        reserveTxId: string;
        tokenAddress: string;
        recipients: { address: string; amount: string }[];
        createdAt: string;
    };
}

function loadSwapState(): SwapState {
    if (fs.existsSync(STATE_FILE)) {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
    return {};
}

function saveSwapState(state: SwapState): void {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function clearTokenState(state: SwapState, tokenName: string): void {
    delete state[tokenName];
    saveSwapState(state);
}

async function getTokenBalance(
    provider: JSONRpcProvider,
    tokenAddress: string,
    ownerHex: string,
): Promise<bigint> {
    const w = new BinaryWriter();
    w.writeAddress(Address.fromString(ownerHex));
    const calldata = Buffer.from(w.getBuffer()).toString('hex');

    const result = await provider.call(
        tokenAddress,
        TOKEN_SELECTORS.balanceOf + calldata,
    );

    if ('error' in result) return 0n;
    if ((result as any).revert) return 0n;
    return result.result.readU256();
}

/**
 * Execute the swap phase for a pending reservation.
 * Returns true if swap succeeded, false if it should be retried or skipped.
 */
async function executeSwap(
    nativeSwap: INativeSwapContract,
    provider: JSONRpcProvider,
    config: ReturnType<typeof import('./config.js').getConfig>,
    tokenAddress: string,
    recipients: { address: string; amount: bigint }[],
): Promise<string> {
    const token = Address.fromString(tokenAddress);

    const totalBtc = recipients.reduce((sum, r) => sum + r.amount, 0n);
    log.info(`Executing swap: sending ${totalBtc} sats to ${recipients.length} LPs`);

    for (const r of recipients) {
        log.info(`  LP: ${r.address} -> ${r.amount} sats`);
    }

    // Set LP payment outputs BEFORE swap simulation
    const transactionOutputs = recipients.map((r, i) => ({
        to: r.address,
        value: r.amount,
        index: i + 1,
        flags: TransactionOutputFlags.hasTo,
        scriptPubKey: undefined,
    }));

    nativeSwap.setTransactionDetails({
        inputs: [],
        outputs: transactionOutputs,
    });

    const swap = await nativeSwap.swap(token);

    if (swap.revert) {
        const revertMsg = Buffer.from(swap.revert, 'base64').toString();
        throw new Error(`Swap simulation reverted: ${revertMsg}`);
    }

    log.info('Swap simulation succeeded. Sending transaction...');

    const swapBlock = await provider.getBlockNumber();

    const extraOutputs = recipients.map((r) => ({
        address: r.address,
        value: r.amount,
    }));

    const swapTxParams: TransactionParameters = {
        signer: config.wallet.keypair,
        mldsaSigner: config.wallet.mldsaKeypair,
        refundTo: config.wallet.p2tr,
        priorityFee: 0n,
        feeRate: 15,
        maximumAllowedSatToSpend: totalBtc + 100_000n,
        network: config.network,
        extraOutputs: extraOutputs as any,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey: true,
    };

    const swapTx = await swap.sendTransaction(swapTxParams);
    log.success(`Swap TX broadcast: ${swapTx.transactionId}`);

    // Wait for swap to be mined
    try {
        await waitForBlock(provider, swapBlock, 3, 120);
    } catch {
        log.warn('Block advancement slow after swap. Waiting 30s...');
        await sleep(30_000);
    }

    return swapTx.transactionId;
}

async function acquireToken(
    name: string,
    tokenAddress: string,
    nativeSwap: INativeSwapContract,
    provider: JSONRpcProvider,
    config: ReturnType<typeof import('./config.js').getConfig>,
    walletHex: string,
    swapState: SwapState,
): Promise<{ balanceBefore: bigint; balanceAfter: bigint; method: string }> {
    log.info(`\n--- Acquiring ${name} via NativeSwap ---`);

    const token = Address.fromString(tokenAddress);

    // Check current balance
    const balanceBefore = await getTokenBalance(provider, tokenAddress, walletHex);
    log.info(`Current ${name} balance: ${formatBigInt(balanceBefore)} (raw: ${balanceBefore})`);

    if (balanceBefore >= MIN_TOKEN_BALANCE) {
        log.info(`Already have sufficient ${name}. Skipping.`);
        clearTokenState(swapState, name);
        return { balanceBefore, balanceAfter: balanceBefore, method: 'skipped' };
    }

    // Check for pending reservation (resume from previous run)
    const pending = swapState[name];
    if (pending) {
        log.info(`Found pending reservation for ${name}: TX ${pending.reserveTxId.slice(0, 16)}...`);

        // Try to complete the swap
        try {
            const recipients = pending.recipients.map((r) => ({
                address: r.address,
                amount: BigInt(r.amount),
            }));

            await executeSwap(nativeSwap, provider, config, tokenAddress, recipients);
            clearTokenState(swapState, name);

            const balanceAfter = await getTokenBalance(provider, tokenAddress, walletHex);
            return { balanceBefore, balanceAfter, method: 'nativeswap-resumed' };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log.warn(`Swap for pending reservation failed: ${msg}`);
            log.warn('Clearing state and attempting fresh reservation...');
            clearTokenState(swapState, name);

            // If swap failed, the reservation might have expired.
            // Wait a bit, then fall through to new reservation.
            await sleep(5_000);
        }
    }

    // Get quote
    const quoteSelector = computeSelector('getQuote(address,uint64)');
    const quoteWriter = new BinaryWriter();
    quoteWriter.writeAddress(token);
    quoteWriter.writeU64(SWAP_AMOUNT_SATS);
    const quoteCalldata = Buffer.from(quoteWriter.getBuffer()).toString('hex');

    const quoteResult = await provider.call(
        NATIVE_SWAP_ADDRESS,
        quoteSelector + quoteCalldata,
    );

    if ('error' in quoteResult || (quoteResult as any).revert) {
        throw new Error(`getQuote failed for ${name}`);
    }

    const tokensOut = quoteResult.result.readU256();
    log.info(`Quote: ${SWAP_AMOUNT_SATS} sats -> ${formatBigInt(tokensOut)} ${name}`);

    if (tokensOut === 0n) {
        throw new Error(`No ${name} liquidity on NativeSwap`);
    }

    const minTokensOut = tokensOut / 2n;

    // Set fee output BEFORE reserve simulation
    nativeSwap.setTransactionDetails({
        inputs: [],
        outputs: [
            {
                to: FEES_ADDRESS,
                value: RESERVATION_FEE,
                index: 1,
                flags: TransactionOutputFlags.hasTo,
                scriptPubKey: undefined,
            },
        ],
    });

    // Reserve
    log.info(`Reserving: max ${SWAP_AMOUNT_SATS} sats, min ${formatBigInt(minTokensOut)} ${name}`);

    const reservation = await nativeSwap.reserve(
        token,
        SWAP_AMOUNT_SATS,
        minTokensOut,
        0,
    );

    if (reservation.revert) {
        const revertMsg = Buffer.from(reservation.revert, 'base64').toString();
        throw new Error(`Reserve reverted: ${revertMsg}`);
    }

    log.info('Reserve simulation succeeded. Sending transaction...');

    const currentBlock = await provider.getBlockNumber();

    const reserveTx = await reservation.sendTransaction({
        signer: config.wallet.keypair,
        mldsaSigner: config.wallet.mldsaKeypair,
        refundTo: config.wallet.p2tr,
        priorityFee: 0n,
        feeRate: 15,
        maximumAllowedSatToSpend: SWAP_AMOUNT_SATS + 100_000n,
        network: config.network,
        extraOutputs: [
            { address: FEES_ADDRESS, value: RESERVATION_FEE },
        ] as any,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey: true,
    });

    const reserveTxId = reserveTx.transactionId;
    log.success(`Reserve TX broadcast: ${reserveTxId}`);

    // Wait for reserve TX to mine
    log.info('Waiting for reserve TX to be mined...');
    try {
        await waitForBlock(provider, currentBlock, 3, 120);
    } catch {
        log.warn('Block advancement slow. Trying to fetch receipt...');
    }

    // Get receipt with retries
    let receipt;
    for (let attempt = 0; attempt < 10; attempt++) {
        try {
            receipt = await provider.getTransactionReceipt(reserveTxId);
            break;
        } catch {
            if (attempt < 9) {
                log.warn(`Receipt not available (attempt ${attempt + 1}/10). Waiting 15s...`);
                await sleep(15_000);
            }
        }
    }

    if (!receipt) {
        throw new Error(`Reserve TX ${reserveTxId} not mined. Re-run later.`);
    }

    // Decode events
    const events = nativeSwap.decodeEvents(receipt.events);
    const liquidityReserved = events.filter((e) => e.type === 'LiquidityReserved');

    if (liquidityReserved.length === 0) {
        log.info(`Events found: ${events.map((e) => e.type).join(', ') || 'none'}`);
        throw new Error('No LiquidityReserved events in reserve TX');
    }

    const recipients = liquidityReserved.map((e) => {
        const props = e.properties as LiquidityReservedEvent;
        return {
            address: props.depositAddress,
            amount: props.satoshisAmount,
        };
    });

    log.info(`Found ${recipients.length} LP reservations`);

    // Save state BEFORE swap (in case it fails or times out)
    swapState[name] = {
        reserveTxId,
        tokenAddress,
        recipients: recipients.map((r) => ({
            address: r.address,
            amount: r.amount.toString(),
        })),
        createdAt: new Date().toISOString(),
    };
    saveSwapState(swapState);

    // Execute swap
    await executeSwap(nativeSwap, provider, config, tokenAddress, recipients);
    clearTokenState(swapState, name);

    const balanceAfter = await getTokenBalance(provider, tokenAddress, walletHex);
    return { balanceBefore, balanceAfter, method: 'nativeswap' };
}

async function main() {
    log.info('=== Token Acquisition via NativeSwap ===');
    log.info(`Network: ${process.env.OPNET_NETWORK || 'regtest'}`);

    const config = getConfig();
    const deployed = loadDeployedContracts();

    if (!deployed?.tokens?.frogU || !deployed?.tokens?.frogP) {
        log.error('Tokens not configured. Run 01-deploy-tokens.ts first.');
        process.exit(1);
    }

    const provider = new JSONRpcProvider({
        url: config.rpcUrl,
        network: config.network,
    });

    const walletAddress = config.wallet.p2tr;
    log.info(`Wallet: ${walletAddress}`);

    const balance = await provider.getBalance(walletAddress);
    log.info(`BTC Balance: ${balance} satoshis (${Number(balance) / 1e8} BTC)`);

    const senderAddr = config.wallet.address;
    // Use wallet.address (MLDSA address hash) for balanceOf queries, NOT getPublicKeyInfo
    const walletHex = senderAddr.toString();

    const nativeSwap = getContract<INativeSwapContract>(
        NATIVE_SWAP_ADDRESS,
        NativeSwapAbi,
        provider,
        config.network,
        senderAddr,
    );

    const swapState = loadSwapState();
    const tokens = [
        { name: 'MOTO', address: deployed.tokens.frogU },
        { name: 'PILL', address: deployed.tokens.frogP },
    ];

    let allSuccess = true;

    for (const token of tokens) {
        const { name, address } = token;
        try {
            const result = await acquireToken(
                name,
                address,
                nativeSwap,
                provider,
                config,
                walletHex,
                swapState,
            );

            const gained = result.balanceAfter - result.balanceBefore;
            log.success(
                `${name}: ${formatBigInt(result.balanceAfter)} (gained ${formatBigInt(gained)}) [${result.method}]`,
            );
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            log.error(`${name} acquisition failed: ${msg}`);
            allSuccess = false;
        }

        // Wait between tokens for UTXO refresh
        if (token !== tokens[tokens.length - 1]) {
            log.info('\nWaiting 30s for UTXO refresh...');
            await sleep(30_000);
        }
    }

    if (!allSuccess) {
        log.warn('Some tokens failed. Re-run to resume pending swaps.');
        process.exit(1);
    }

    // Clean up state file on full success
    if (fs.existsSync(STATE_FILE)) {
        fs.unlinkSync(STATE_FILE);
    }

    log.success('All token acquisitions complete!');
}

main().catch((error) => {
    log.error('Token acquisition failed:', error);
    process.exit(1);
});
