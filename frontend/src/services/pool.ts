/**
 * PoolService — read-only access to an OptionsPool contract.
 *
 * All methods are view calls (provider.call) and require no wallet/signing.
 * Write methods (writeOption, buyOption, exercise, cancelOption, settle)
 * are handled by Story 6.18–6.21 hooks.
 */
import type { AbstractRpcProvider } from 'opnet';
import { BinaryWriter } from '@btc-vision/transaction';
import type { OptionData, PoolInfo } from './types.ts';
import { POOL_VIEW_SELECTORS } from './selectors.ts';

/** Max batch size enforced by the contract (OPNet 2048-byte receipt limit) */
const MAX_BATCH_SIZE = 9n;

function isCallError(result: unknown): result is { error: unknown } {
    return typeof result === 'object' && result !== null && 'error' in result;
}

/**
 * Resolve a bech32 contract address (opt1... / opr1...) to its hex pubkey.
 * If the address is already 0x-prefixed hex, it is returned as-is.
 */
async function resolveContractHex(
    provider: AbstractRpcProvider,
    address: string,
): Promise<string> {
    if (address.startsWith('0x')) return address;
    const info = await provider.getPublicKeyInfo(address, true);
    return info.toString();
}

/** Build a hex calldata buffer: selector + big-endian u256 params */
function buildCalldata(selector: string, ...u256Params: bigint[]): string {
    if (u256Params.length === 0) return selector;

    const w = new BinaryWriter();
    for (const p of u256Params) {
        w.writeU256(p);
    }
    const paramHex = Buffer.from(w.getBuffer()).toString('hex');
    // selector is already '0x...' — strip the prefix for concatenation
    return selector + paramHex;
}

/** Decode a single option record from the binary reader */
function decodeOptionRecord(reader: { readU256(): bigint; readAddress(): { toString(): string }; readU8(): number; readU64(): bigint }): OptionData {
    return {
        id: reader.readU256(),
        writer: reader.readAddress().toString(),
        buyer: reader.readAddress().toString(),
        optionType: reader.readU8(),
        strikePrice: reader.readU256(),
        underlyingAmount: reader.readU256(),
        premium: reader.readU256(),
        expiryBlock: reader.readU64(),
        status: reader.readU8(),
    };
}

export class PoolService {
    private provider: AbstractRpcProvider;
    /** bech32 or hex address as provided by caller */
    private rawAddress: string;
    /** Resolved hex address, cached after first use */
    private hexAddress: string | null = null;

    constructor(provider: AbstractRpcProvider, poolAddress: string) {
        this.provider = provider;
        this.rawAddress = poolAddress;
    }

    private async getHexAddress(): Promise<string> {
        if (!this.hexAddress) {
            this.hexAddress = await resolveContractHex(this.provider, this.rawAddress);
        }
        return this.hexAddress;
    }

    private async callView(calldata: string) {
        const addr = await this.getHexAddress();
        const result = await this.provider.call(addr, calldata);
        if (isCallError(result)) {
            throw new Error(`Contract call error: ${String(result.error)}`);
        }
        if (result.revert) {
            throw new Error(`Contract reverted: ${result.revert}`);
        }
        return result.result;
    }

    /** Total number of options ever created in this pool */
    async getOptionCount(): Promise<bigint> {
        const reader = await this.callView(POOL_VIEW_SELECTORS.optionCount);
        return reader.readU256();
    }

    /** Fetch a single option by ID */
    async getOption(optionId: bigint): Promise<OptionData> {
        const calldata = buildCalldata(POOL_VIEW_SELECTORS.getOption, optionId);
        const reader = await this.callView(calldata);
        return decodeOptionRecord(reader);
    }

    /**
     * Fetch up to MAX_BATCH_SIZE (9) options starting from startId.
     * Paginates automatically; pass startId=0n to start from the beginning.
     */
    async getOptionsBatch(startId: bigint, count: bigint = MAX_BATCH_SIZE): Promise<OptionData[]> {
        const actualCount = count > MAX_BATCH_SIZE ? MAX_BATCH_SIZE : count;
        const calldata = buildCalldata(POOL_VIEW_SELECTORS.getOptionsBatch, startId, actualCount);
        const reader = await this.callView(calldata);

        const returned = reader.readU256();
        const options: OptionData[] = [];
        for (let i = 0n; i < returned; i++) {
            options.push(decodeOptionRecord(reader));
        }
        return options;
    }

    /**
     * Fetch ALL options in the pool, paginated in batches of MAX_BATCH_SIZE.
     * Stops when a batch returns 0 results or we reach the total count.
     */
    async getAllOptions(): Promise<OptionData[]> {
        const total = await this.getOptionCount();
        if (total === 0n) return [];

        const all: OptionData[] = [];
        let startId = 0n;

        while (startId < total) {
            const batch = await this.getOptionsBatch(startId, MAX_BATCH_SIZE);
            if (batch.length === 0) break;
            all.push(...batch);
            startId += BigInt(batch.length);
        }

        return all;
    }

    /** Fetch pool configuration (token addresses, fee bps, constants) */
    async getPoolInfo(): Promise<PoolInfo> {
        const [
            underlyingReader,
            premiumReader,
            countReader,
            cancelFeeReader,
            buyFeeReader,
            exerciseFeeReader,
            graceReader,
        ] = await Promise.all([
            this.callView(POOL_VIEW_SELECTORS.underlying),
            this.callView(POOL_VIEW_SELECTORS.premiumToken),
            this.callView(POOL_VIEW_SELECTORS.optionCount),
            this.callView(POOL_VIEW_SELECTORS.cancelFeeBps),
            this.callView(POOL_VIEW_SELECTORS.buyFeeBps),
            this.callView(POOL_VIEW_SELECTORS.exerciseFeeBps),
            this.callView(POOL_VIEW_SELECTORS.gracePeriodBlocks),
        ]);

        return {
            underlying: underlyingReader.readAddress().toString(),
            premiumToken: premiumReader.readAddress().toString(),
            optionCount: countReader.readU256(),
            cancelFeeBps: cancelFeeReader.readU64(),
            buyFeeBps: buyFeeReader.readU64(),
            exerciseFeeBps: exerciseFeeReader.readU64(),
            gracePeriodBlocks: graceReader.readU64(),
        };
    }
}
