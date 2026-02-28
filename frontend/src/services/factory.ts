/**
 * FactoryService — read-only access to the OptionsFactory registry contract.
 *
 * Mirrors the PoolService pattern: resolves bech32 → hex, caches the hex
 * address, and uses provider.call() for all view methods.
 */
import type { AbstractRpcProvider } from 'opnet';
import { Address, BinaryWriter } from '@btc-vision/transaction';
import type { PoolEntry } from './types.ts';
import { FACTORY_VIEW_SELECTORS } from './selectors.ts';

function isCallError(result: unknown): result is { error: unknown } {
    return typeof result === 'object' && result !== null && 'error' in result;
}

async function resolveContractHex(
    provider: AbstractRpcProvider,
    address: string,
): Promise<string> {
    if (address.startsWith('0x')) return address;
    const info = await provider.getPublicKeyInfo(address, true);
    return info.toString();
}

function buildCalldata(selector: string, ...u256Params: bigint[]): string {
    if (u256Params.length === 0) return selector;
    const w = new BinaryWriter();
    for (const p of u256Params) {
        w.writeU256(p);
    }
    const paramHex = Buffer.from(w.getBuffer()).toString('hex');
    return selector + paramHex;
}

function buildAddressCalldata(selector: string, addr1Hex: string, addr2Hex: string): string {
    const w = new BinaryWriter();
    w.writeAddress(Address.fromString(addr1Hex));
    w.writeAddress(Address.fromString(addr2Hex));
    const paramHex = Buffer.from(w.getBuffer()).toString('hex');
    return selector + paramHex;
}

const ZERO_HEX = '0x' + '0'.repeat(64);

export class FactoryService {
    private provider: AbstractRpcProvider;
    private rawAddress: string;
    private hexAddress: string | null = null;

    constructor(provider: AbstractRpcProvider, factoryAddress: string) {
        this.provider = provider;
        this.rawAddress = factoryAddress;
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
            throw new Error(`Factory call error: ${String(result.error)}`);
        }
        if (result.revert) {
            throw new Error(`Factory reverted: ${result.revert}`);
        }
        return result.result;
    }

    /** Total number of pools registered in the factory */
    async getPoolCount(): Promise<bigint> {
        const reader = await this.callView(FACTORY_VIEW_SELECTORS.getPoolCount);
        return reader.readU256();
    }

    /** Fetch a single pool entry by index (0-based) */
    async getPoolByIndex(index: bigint): Promise<PoolEntry> {
        const calldata = buildCalldata(FACTORY_VIEW_SELECTORS.getPoolByIndex, index);
        const reader = await this.callView(calldata);
        const address = reader.readAddress().toString();
        const underlying = reader.readAddress().toString();
        const premiumToken = reader.readAddress().toString();
        return { address, underlying, premiumToken };
    }

    /** Fetch all registered pools (iterates sequentially) */
    async getAllPools(): Promise<PoolEntry[]> {
        const count = await this.getPoolCount();
        const pools: PoolEntry[] = [];
        for (let i = 0n; i < count; i++) {
            pools.push(await this.getPoolByIndex(i));
        }
        return pools;
    }

    /**
     * Look up the pool address for a specific token pair.
     * Returns the hex address, or null if no pool exists (zero address).
     */
    async getPool(underlyingHex: string, premiumTokenHex: string): Promise<string | null> {
        const calldata = buildAddressCalldata(
            FACTORY_VIEW_SELECTORS.getPool,
            underlyingHex,
            premiumTokenHex,
        );
        const reader = await this.callView(calldata);
        const addr = reader.readAddress().toString();
        if (addr === ZERO_HEX) return null;
        return addr;
    }
}
