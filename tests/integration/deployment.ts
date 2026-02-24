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
import { getLogger, formatAddress } from './config.js';

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

export function getWasmPath(contractName: string): string {
    return path.join(process.cwd(), 'build', `${contractName}.wasm`);
}
