import {
    Wallet,
    Address,
    BinaryWriter,
    TransactionFactory,
} from '@btc-vision/transaction';
import type { Network } from '@btc-vision/bitcoin';
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

    constructor(provider: JSONRpcProvider, wallet: Wallet, network: Network) {
        this.provider = provider;
        this.wallet = wallet;
        this.network = network;
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

        return {
            contractAddress: deployment.contractAddress,
            fundingTxId: fundingTxId,
            revealTxId: revealTxId,
        };
    }

    async callContract(
        contractAddress: string,
        calldata: Uint8Array,
        gasLimit: bigint = 10_000n
    ): Promise<{ txId: string }> {
        log.info(`Calling contract at ${formatAddress(contractAddress)}...`);

        const utxos = await this.getUTXOs();

        if (utxos.length === 0) {
            throw new Error('No UTXOs available. Please fund your wallet.');
        }

        const challenge = await this.provider.getChallenge();
        const factory = new TransactionFactory();

        // Get contract's public key from getCode (returns Uint8Array)
        const code = await this.provider.getCode(contractAddress);
        const contractHexBytes = (code as any).contractPublicKey;
        const contractHex = '0x' + Buffer.from(contractHexBytes).toString('hex');
        log.info(`Contract hex: ${formatAddress(contractHex)}`);

        // Use TransactionFactory.signInteraction
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
            linkMLDSAPublicKeyToAddress: true,
            revealMLDSAPublicKey: true,
        });

        log.info(`Interaction TX signed`);

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
        }

        // Broadcast the interaction transaction
        const result = await this.provider.sendRawTransaction(
            signedTx.interactionTransaction,
            false
        );

        if (!result.success) {
            throw new Error(`Interaction transaction failed: ${result.error}`);
        }

        const txId = result.result || 'unknown';
        log.success(`Interaction TX broadcast: ${txId}`);

        return { txId };
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
    premiumToken: Address
): Uint8Array {
    const writer = new BinaryWriter();
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

export function getWasmPath(contractName: string): string {
    return path.join(process.cwd(), 'build', `${contractName}.wasm`);
}
