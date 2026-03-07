import {
    Wallet,
    Address,
    BinaryWriter,
    TransactionFactory,
} from '@btc-vision/transaction';
import { payments, toBytes32, type Network, type PsbtOutputExtended } from '@btc-vision/bitcoin';
import type { JSONRpcProvider } from 'opnet';
import * as fs from 'fs';
import * as path from 'path';
import { getLogger, formatAddress, POOL_SELECTORS, FACTORY_SELECTORS, TOKEN_SELECTORS } from './config.js';

const log = getLogger('Deploy');

export interface DeploymentResult {
    contractAddress: string;
    fundingTxId: string;
    revealTxId: string;
}

export class DeploymentHelper {
    private provider: JSONRpcProvider;
    private wallet: Wallet;
    private network: Network;
    /** Whether this wallet's MLDSA key is already linked on-chain. */
    private mldsaKeyLinked: boolean;

    /**
     * @param mldsaKeyAlreadyLinked - Set false for wallets that have never sent an
     *   interaction TX (the first call will reveal/link the key; subsequent calls skip it).
     *   Defaults to false — always re-reveals MLDSA key on the first interaction of each
     *   test run, handling epoch-boundary expiry and testnet node restarts.
     */
    constructor(provider: JSONRpcProvider, wallet: Wallet, network: Network, mldsaKeyAlreadyLinked = false) {
        this.provider = provider;
        this.wallet = wallet;
        this.network = network;
        this.mldsaKeyLinked = mldsaKeyAlreadyLinked;
    }

    async checkBalance(): Promise<bigint> {
        const balance = await this.provider.getBalance(this.wallet.p2tr);
        return balance;
    }

    async getUTXOs() {
        const utxos = await this.provider.utxoManager.getUTXOs({
            address: this.wallet.p2tr,
        });
        return utxos;
    }

    async deployContract(
        wasmPath: string,
        calldata?: Uint8Array,
        gasLimit: bigint = 10_000n
    ): Promise<DeploymentResult> {
        log.info(`Deploying contract from ${wasmPath}...`);

        if (!fs.existsSync(wasmPath)) {
            throw new Error(`WASM file not found: ${wasmPath}`);
        }

        const bytecode = fs.readFileSync(wasmPath);
        const utxos = await this.getUTXOs();

        if (utxos.length === 0) {
            throw new Error('No UTXOs available. Please fund your wallet.');
        }

        const challenge = await this.provider.getChallenge();
        const factory = new TransactionFactory();

        const deployment = await factory.signDeployment({
            signer: this.wallet.keypair,
            mldsaSigner: this.wallet.mldsaKeypair,
            network: this.network,
            utxos: utxos,
            from: this.wallet.p2tr,
            feeRate: 15,
            priorityFee: 0n,
            gasSatFee: gasLimit,
            bytecode: bytecode,
            calldata: calldata ? Buffer.from(calldata) : undefined,
            challenge: challenge as any,
            linkMLDSAPublicKeyToAddress: true,
            revealMLDSAPublicKey: true,
        });

        log.info(`Contract address: ${formatAddress(deployment.contractAddress)}`);

        // Broadcast funding transaction (first in array)
        const fundingResult = await this.provider.sendRawTransaction(
            deployment.transaction[0],
            false
        );
        if (!fundingResult.success) {
            throw new Error(`Funding transaction failed: ${fundingResult.error}`);
        }
        const fundingTxId = fundingResult.result || 'unknown';
        log.success(`Funding TX broadcast: ${fundingTxId}`);

        // Track UTXO spending so subsequent calls don't reuse spent inputs
        this.provider.utxoManager.spentUTXO(this.wallet.p2tr, deployment.inputUtxos, deployment.utxos);

        // Broadcast reveal transaction (second in array)
        const revealResult = await this.provider.sendRawTransaction(
            deployment.transaction[1],
            false
        );
        if (!revealResult.success) {
            throw new Error(`Reveal transaction failed: ${revealResult.error}`);
        }
        const revealTxId = revealResult.result || 'unknown';
        log.success(`Reveal TX broadcast: ${revealTxId}`);

        // Deployment always reveals MLDSA key — mark as linked for subsequent callContract calls
        this.mldsaKeyLinked = true;

        return {
            contractAddress: deployment.contractAddress,
            fundingTxId: fundingTxId,
            revealTxId: revealTxId,
        };
    }

    async callContract(
        contractAddress: string,
        calldata: Uint8Array,
        gasLimit: bigint = 10_000n,
        extraOutputs?: PsbtOutputExtended[],
    ): Promise<{ txId: string }> {
        log.info(`Calling contract at ${formatAddress(contractAddress)}...`);

        // Use getPublicKeyInfo for the contract's tweaked public key (documented approach)
        const publicKeyInfo = await this.provider.getPublicKeyInfo(contractAddress, true);
        const contractHex = publicKeyInfo.toString();
        log.info(`Contract hex: ${formatAddress(contractHex)}`);

        const factory = new TransactionFactory();
        const needsMLDSA = !this.mldsaKeyLinked;

        // Two-attempt strategy for "Could not decode transaction" resilience:
        //   Attempt 1: use the default MLDSA strategy (reveal if key not linked)
        //   Attempt 2: flip the MLDSA strategy (handles epoch-boundary expiry / node restarts)
        // If attempt 1's funding TX was already broadcast, attempt 2 uses the change UTXO.
        for (let attempt = 1; attempt <= 2; attempt++) {
            const utxos = await this.getUTXOs();
            if (utxos.length === 0) {
                throw new Error('No UTXOs available. Please fund your wallet.');
            }

            const challenge = await this.provider.getChallenge();
            const useMLDSA = attempt === 1 ? needsMLDSA : !needsMLDSA;

            const signedTx = await factory.signInteraction({
                signer: this.wallet.keypair,
                mldsaSigner: this.wallet.mldsaKeypair,
                from: this.wallet.p2tr,
                to: contractAddress,
                contract: contractHex,
                calldata: calldata,
                utxos: utxos,
                feeRate: 15,
                priorityFee: 0n,
                gasSatFee: gasLimit,
                network: this.network,
                challenge: challenge as any,
                ...(useMLDSA ? { linkMLDSAPublicKeyToAddress: true, revealMLDSAPublicKey: true } : {}),
                ...(extraOutputs?.length ? { optionalOutputs: extraOutputs } : {}),
            });

            log.info(`Interaction TX signed (attempt ${attempt}, mldsaReveal=${useMLDSA})`);

            // Broadcast the funding transaction first (if exists)
            if (signedTx.fundingTransaction) {
                const fundingResult = await this.provider.sendRawTransaction(
                    signedTx.fundingTransaction,
                    false
                );

                if (!fundingResult.success) {
                    throw new Error(`Funding transaction failed: ${fundingResult.error}`);
                }
                log.success(`Funding TX broadcast: ${fundingResult.result}`);

                // Track UTXO spending so subsequent calls don't reuse spent inputs
                this.provider.utxoManager.spentUTXO(
                    this.wallet.p2tr,
                    signedTx.fundingInputUtxos,
                    signedTx.nextUTXOs,
                );

                // Brief pause to allow the funding TX to propagate to the OPNet node's
                // Bitcoin backend before submitting the interaction TX that spends its output.
                await new Promise(r => setTimeout(r, 3000));
            }

            // Broadcast the interaction transaction
            const result = await this.provider.sendRawTransaction(
                signedTx.interactionTransaction,
                false
            );

            if (!result.success) {
                log.error(`Interaction TX response: ${JSON.stringify(result)}`);
                const errMsg = result.result || result.error || 'Unknown error';

                // On decode errors, retry with the opposite MLDSA strategy once.
                // This handles: key expired at epoch boundary, node restart lost state, etc.
                if (attempt === 1 && errMsg.toLowerCase().includes('decode')) {
                    log.warn(`Decode error on attempt 1. Retrying with mldsaReveal=${!useMLDSA}...`);
                    // Wait 5s before retry to let network state settle
                    await new Promise(r => setTimeout(r, 5000));
                    continue;
                }
                throw new Error(`Interaction transaction failed: ${errMsg}`);
            }

            const txId = result.result || 'unknown';
            log.success(`Interaction TX broadcast: ${txId}`);

            // Key is confirmed linked (either was already linked or just revealed).
            this.mldsaKeyLinked = true;
            return { txId };
        }

        throw new Error('All interaction attempts exhausted');
    }

    async sendBTC(to: string, amount: bigint): Promise<{ txId: string }> {
        log.info(`Sending ${amount} sats to ${formatAddress(to)}...`);

        const utxos = await this.getUTXOs();
        if (utxos.length === 0) {
            throw new Error('No UTXOs available. Please fund your wallet.');
        }

        const factory = new TransactionFactory();
        const result = await factory.createBTCTransfer({
            signer: this.wallet.keypair,
            mldsaSigner: this.wallet.mldsaKeypair,
            network: this.network,
            utxos: utxos,
            from: this.wallet.p2tr,
            to: to,
            amount: amount,
            feeRate: 15,
            priorityFee: 0n,
            gasSatFee: 0n,
        });

        const txResult = await this.provider.sendRawTransaction(result.tx, false);
        if (!txResult.success) {
            throw new Error(`BTC transfer failed: ${txResult.error}`);
        }

        // Track UTXO spending so subsequent calls don't reuse spent inputs
        this.provider.utxoManager.spentUTXO(this.wallet.p2tr, result.inputUtxos, result.nextUTXOs);

        const txId = txResult.result || 'unknown';
        log.success(`BTC transfer TX: ${txId}`);
        return { txId };
    }

    getProvider(): JSONRpcProvider {
        return this.provider;
    }
}

export function createTokenCalldata(
    name: string,
    symbol: string,
    decimals: number,
    maxSupply: bigint
): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeStringWithLength(name);
    writer.writeStringWithLength(symbol);
    writer.writeU8(decimals);
    writer.writeU256(maxSupply);
    return writer.getBuffer();
}

export function createPoolCalldata(
    underlying: Address,
    premiumToken: Address,
    feeRecipient: Address,
    gracePeriod: bigint = 144n,
): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeAddress(underlying);
    writer.writeAddress(premiumToken);
    writer.writeAddress(feeRecipient);
    writer.writeU64(gracePeriod);
    return writer.getBuffer();
}

/**
 * Deployment calldata for BTC pool types (type 1 and type 2).
 * These contracts read a 4th address (bridge) after the base 3.
 */
export function createBtcPoolCalldata(
    underlying: Address,
    premiumToken: Address,
    feeRecipient: Address,
    bridge: Address,
    gracePeriod: bigint = 144n,
): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeAddress(underlying);
    writer.writeAddress(premiumToken);
    writer.writeAddress(feeRecipient);
    writer.writeU64(gracePeriod);
    writer.writeAddress(bridge);
    return writer.getBuffer();
}

export function createRegisterPoolCalldata(
    pool: Address,
    underlying: Address,
    premiumToken: Address
): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(FACTORY_SELECTORS.registerPool);
    writer.writeAddress(pool);
    writer.writeAddress(underlying);
    writer.writeAddress(premiumToken);
    return writer.getBuffer();
}

export function createSetPoolTemplateCalldata(template: Address): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(FACTORY_SELECTORS.setPoolTemplate);
    writer.writeAddress(template);
    return writer.getBuffer();
}

export function createCreatePoolCalldata(
    underlying: Address,
    premiumToken: Address,
    underlyingDecimals: number,
    premiumDecimals: number
): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(FACTORY_SELECTORS.createPool);
    writer.writeAddress(underlying);
    writer.writeAddress(premiumToken);
    writer.writeU8(underlyingDecimals);
    writer.writeU8(premiumDecimals);
    return writer.getBuffer();
}

export function createWriteOptionCalldata(
    optionType: number,      // 0 = CALL, 1 = PUT
    strikePrice: bigint,
    expiryBlock: bigint,
    underlyingAmount: bigint,
    premium: bigint
): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(POOL_SELECTORS.writeOption);
    writer.writeU8(optionType);
    writer.writeU256(strikePrice);
    writer.writeU64(expiryBlock);
    writer.writeU256(underlyingAmount);
    writer.writeU256(premium);
    return writer.getBuffer();
}

export function createBuyOptionCalldata(optionId: bigint): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(POOL_SELECTORS.buyOption);
    writer.writeU256(optionId);
    return writer.getBuffer();
}

export function createExerciseCalldata(optionId: bigint): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(POOL_SELECTORS.exercise);
    writer.writeU256(optionId);
    return writer.getBuffer();
}

export function createCancelOptionCalldata(optionId: bigint): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(POOL_SELECTORS.cancelOption);
    writer.writeU256(optionId);
    return writer.getBuffer();
}

export function createSettleCalldata(optionId: bigint): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(POOL_SELECTORS.settle);
    writer.writeU256(optionId);
    return writer.getBuffer();
}

export function createIncreaseAllowanceCalldata(
    spender: Address,
    amount: bigint
): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(TOKEN_SELECTORS.increaseAllowance);
    writer.writeAddress(spender);
    writer.writeU256(amount);
    return writer.getBuffer();
}

export function createApproveCalldata(
    spender: Address,
    amount: bigint
): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(TOKEN_SELECTORS.approve);
    writer.writeAddress(spender);
    writer.writeU256(amount);
    return writer.getBuffer();
}

export function createTransferCalldata(
    to: Address,
    amount: bigint
): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(TOKEN_SELECTORS.transfer);
    writer.writeAddress(to);
    writer.writeU256(amount);
    return writer.getBuffer();
}

export function createTransferOptionCalldata(optionId: bigint, to: Address): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(POOL_SELECTORS.transferOption);
    writer.writeU256(optionId);
    writer.writeAddress(to);
    return writer.getBuffer();
}

export function createUpdateFeeRecipientCalldata(newRecipient: Address): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(POOL_SELECTORS.updateFeeRecipient);
    writer.writeAddress(newRecipient);
    return writer.getBuffer();
}

export function createBatchCancelCalldata(optionIds: bigint[]): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(POOL_SELECTORS.batchCancel);
    writer.writeU256(BigInt(optionIds.length));
    for (let i = 0; i < 5; i++) {
        writer.writeU256(i < optionIds.length ? optionIds[i]! : 0n);
    }
    return writer.getBuffer();
}

export function createBatchSettleCalldata(optionIds: bigint[]): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(POOL_SELECTORS.batchSettle);
    writer.writeU256(BigInt(optionIds.length));
    for (let i = 0; i < 5; i++) {
        writer.writeU256(i < optionIds.length ? optionIds[i]! : 0n);
    }
    return writer.getBuffer();
}

export function createRollOptionCalldata(
    optionId: bigint,
    newStrikePrice: bigint,
    newExpiryBlock: bigint,
    newPremium: bigint
): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(POOL_SELECTORS.rollOption);
    writer.writeU256(optionId);
    writer.writeU256(newStrikePrice);
    writer.writeU64(newExpiryBlock);
    writer.writeU256(newPremium);
    return writer.getBuffer();
}

export function createRegisterBtcPubkeyCalldata(pubkey: Uint8Array): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeU32(POOL_SELECTORS.registerBtcPubkey);
    writer.writeBytes(pubkey);
    return writer.getBuffer();
}

export function getWasmPath(contractName: string): string {
    return path.join(process.cwd(), 'build', `${contractName}.wasm`);
}

// ---------------------------------------------------------------------------
// BTC pool test helpers
// ---------------------------------------------------------------------------

/**
 * Derive a bech32 P2WSH address from a 32-byte script hash (SHA256 of witness script).
 * Used to construct extraOutputs for BTC pool transactions.
 */
export function deriveP2wshAddress(scriptHashHex: string, network: Network): string {
    const hex = scriptHashHex.startsWith('0x') ? scriptHashHex.slice(2) : scriptHashHex;
    const hash = toBytes32(new Uint8Array(Buffer.from(hex, 'hex')));
    const p2wsh = payments.p2wsh({ hash, network });
    if (!p2wsh.address) throw new Error('P2WSH derivation failed');
    return p2wsh.address;
}

/**
 * Build a PsbtOutputExtended for BTC payment to a P2WSH address.
 * Used with DeploymentHelper.callContract's extraOutputs parameter.
 */
export function buildBtcExtraOutput(address: string, amountSats: bigint): PsbtOutputExtended {
    return { address, value: Number(amountSats) } as unknown as PsbtOutputExtended;
}

/**
 * Construct the writer's 33-byte compressed pubkey from a Wallet.
 * Matches the pubkey registered via registerBtcPubkey.
 */
export function getWriterCompressedPubkey(wallet: Wallet): Uint8Array {
    const pubkey = new Uint8Array(33);
    pubkey[0] = 0x02;
    const walletPubHex = Buffer.from(wallet.keypair.publicKey).toString('hex');
    const xOnly = walletPubHex.length === 66 ? walletPubHex.slice(2) : walletPubHex;
    for (let i = 0; i < 32 && i * 2 < xOnly.length; i++) {
        pubkey[1 + i] = parseInt(xOnly.slice(i * 2, i * 2 + 2), 16);
    }
    return pubkey;
}
