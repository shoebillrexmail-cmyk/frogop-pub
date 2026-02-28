/**
 * PoolService unit tests — use a mock provider (no real network calls).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PoolService } from '../pool.ts';
import type { AbstractRpcProvider } from 'opnet';

// ---------------------------------------------------------------------------
// Binary encoding helpers for building fake on-chain responses
// ---------------------------------------------------------------------------

function writeU256(arr: Uint8Array, offset: number, value: bigint): number {
    const hex = value.toString(16).padStart(64, '0');
    for (let i = 0; i < 32; i++) {
        arr[offset + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return offset + 32;
}

function writeU64(arr: Uint8Array, offset: number, value: bigint): number {
    const hex = value.toString(16).padStart(16, '0');
    for (let i = 0; i < 8; i++) {
        arr[offset + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return offset + 8;
}

function writeU8(arr: Uint8Array, offset: number, value: number): number {
    arr[offset] = value;
    return offset + 1;
}

function writeAddress(arr: Uint8Array, offset: number, hex: string): number {
    const padded = hex.replace('0x', '').padStart(64, '0');
    for (let i = 0; i < 32; i++) {
        arr[offset + i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
    }
    return offset + 32;
}

/** Encode one option record (202 bytes) matching the contract binary layout */
function encodeOption(opt: {
    id: bigint;
    writer: string;
    buyer: string;
    optionType: number;
    strikePrice: bigint;
    underlyingAmount: bigint;
    premium: bigint;
    expiryBlock: bigint;
    status: number;
}): Uint8Array {
    const buf = new Uint8Array(202);
    let off = 0;
    off = writeU256(buf, off, opt.id);
    off = writeAddress(buf, off, opt.writer);
    off = writeAddress(buf, off, opt.buyer);
    off = writeU8(buf, off, opt.optionType);
    off = writeU256(buf, off, opt.strikePrice);
    off = writeU256(buf, off, opt.underlyingAmount);
    off = writeU256(buf, off, opt.premium);
    off = writeU64(buf, off, opt.expiryBlock);
    off = writeU8(buf, off, opt.status);
    return buf.slice(0, off);
}

/** Build getOptionsBatch response: [u256 count][option]... */
function buildBatchResponse(options: Parameters<typeof encodeOption>[0][]): Uint8Array {
    const countBytes = new Uint8Array(32);
    writeU256(countBytes, 0, BigInt(options.length));
    const encoded = options.map(encodeOption);
    const total = 32 + encoded.reduce((s, b) => s + b.length, 0);
    const buf = new Uint8Array(total);
    buf.set(countBytes, 0);
    let off = 32;
    for (const e of encoded) {
        buf.set(e, off);
        off += e.length;
    }
    return buf;
}

// ---------------------------------------------------------------------------
// Minimal BinaryReader implementation for test responses
// ---------------------------------------------------------------------------

class FakeBinaryReader {
    private data: Uint8Array;
    private offset = 0;

    constructor(data: Uint8Array) {
        this.data = data;
    }

    readU256(): bigint {
        let result = 0n;
        for (let i = 0; i < 32; i++) {
            result = (result << 8n) | BigInt(this.data[this.offset + i]);
        }
        this.offset += 32;
        return result;
    }

    readU64(): bigint {
        let result = 0n;
        for (let i = 0; i < 8; i++) {
            result = (result << 8n) | BigInt(this.data[this.offset + i]);
        }
        this.offset += 8;
        return result;
    }

    readU8(): number {
        return this.data[this.offset++];
    }

    readAddress(): { toString(): string } {
        const hex = '0x' + Array.from(this.data.slice(this.offset, this.offset + 32))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        this.offset += 32;
        return { toString: () => hex };
    }

    // Properties expected by pool.ts callView checks
    get revert(): undefined { return undefined; }
    get result(): this { return this; }
}

// ---------------------------------------------------------------------------
// Selector constants (must match selectors.ts: '0x' + 8 hex chars = 10 chars)
// ---------------------------------------------------------------------------

import { ABICoder } from '@btc-vision/transaction';
const _abi = new ABICoder();
const S = (sig: string) => '0x' + _abi.encodeSelector(sig);

const SEL_OPTION_COUNT  = S('optionCount()');
const SEL_GET_OPTION    = S('getOption(uint256)');
const SEL_GET_BATCH     = S('getOptionsBatch(uint256,uint256)');
const SEL_UNDERLYING    = S('underlying()');
const SEL_PREMIUM_TOKEN = S('premiumToken()');
const SEL_CANCEL_FEE    = S('cancelFeeBps()');
const SEL_BUY_FEE       = S('buyFeeBps()');
const SEL_EXERCISE_FEE  = S('exerciseFeeBps()');
const SEL_GRACE         = S('gracePeriodBlocks()');

// Selector length = 10 chars ("0x" + 8 hex)
const SEL_LEN = SEL_OPTION_COUNT.length; // 10

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const WRITER_HEX = '0xdeadbeef00000000000000000000000000000000000000000000000000000001';
const ZERO_HEX   = '0x0000000000000000000000000000000000000000000000000000000000000000';
const POOL_HEX   = '0xaabbccdd00000000000000000000000000000000000000000000000000000001';
const UNDERLYING_ADDR = '0xaaaa000000000000000000000000000000000000000000000000000000000001';
const PREMIUM_ADDR    = '0xbbbb000000000000000000000000000000000000000000000000000000000002';

function makeOption(id: bigint, status = 0) {
    return {
        id,
        writer: WRITER_HEX,
        buyer: status > 0 ? WRITER_HEX : ZERO_HEX,
        optionType: 0,
        strikePrice: 50n,
        underlyingAmount: 10n ** 18n,
        premium: 5n * 10n ** 17n,
        expiryBlock: 900000n,
        status,
    };
}

function makeAddressBytes(hex: string): Uint8Array {
    const b = new Uint8Array(32);
    writeAddress(b, 0, hex);
    return b;
}

function makeU256Bytes(value: bigint): Uint8Array {
    const b = new Uint8Array(32);
    writeU256(b, 0, value);
    return b;
}

function makeU64Bytes(value: bigint): Uint8Array {
    const b = new Uint8Array(8);
    writeU64(b, 0, value);
    return b;
}

// ---------------------------------------------------------------------------
// Mock provider
// ---------------------------------------------------------------------------

function makeMockProvider(calls: Map<string, Uint8Array>): AbstractRpcProvider {
    return {
        getPublicKeyInfo: vi.fn().mockResolvedValue({ toString: () => POOL_HEX }),
        call: vi.fn().mockImplementation((_to: string, data: string) => {
            // Key = selector portion only (first SEL_LEN chars)
            const key = data.slice(0, SEL_LEN);
            const bytes = calls.get(key);
            if (!bytes) return Promise.reject(new Error(`Unexpected call: ${key}`));
            return Promise.resolve(new FakeBinaryReader(bytes));
        }),
    } as unknown as AbstractRpcProvider;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PoolService', () => {
    let callMap: Map<string, Uint8Array>;
    let provider: AbstractRpcProvider;
    let service: PoolService;

    beforeEach(() => {
        callMap = new Map([
            [SEL_OPTION_COUNT,  makeU256Bytes(3n)],
            [SEL_UNDERLYING,    makeAddressBytes(UNDERLYING_ADDR)],
            [SEL_PREMIUM_TOKEN, makeAddressBytes(PREMIUM_ADDR)],
            [SEL_CANCEL_FEE,    makeU64Bytes(100n)],
            [SEL_BUY_FEE,       makeU64Bytes(100n)],
            [SEL_EXERCISE_FEE,  makeU64Bytes(10n)],
            [SEL_GRACE,         makeU64Bytes(144n)],
        ]);
        provider = makeMockProvider(callMap);
        service = new PoolService(provider, 'opt1pftest000000000000000000000000');
    });

    it('resolves bech32 address to hex via getPublicKeyInfo', async () => {
        await service.getOptionCount();
        expect(provider.getPublicKeyInfo).toHaveBeenCalledWith(
            'opt1pftest000000000000000000000000',
            true,
        );
    });

    it('skips getPublicKeyInfo for 0x-prefixed addresses', async () => {
        const hexService = new PoolService(provider, POOL_HEX);
        await hexService.getOptionCount();
        expect(provider.getPublicKeyInfo).not.toHaveBeenCalled();
    });

    it('getOptionCount returns correct bigint', async () => {
        expect(await service.getOptionCount()).toBe(3n);
    });

    it('getOption decodes all fields correctly', async () => {
        const opt = makeOption(0n, 1);
        callMap.set(SEL_GET_OPTION, encodeOption(opt));
        const result = await service.getOption(0n);
        expect(result.id).toBe(0n);
        expect(result.optionType).toBe(0);
        expect(result.status).toBe(1);
        expect(result.strikePrice).toBe(50n);
        expect(result.underlyingAmount).toBe(10n ** 18n);
        expect(result.premium).toBe(5n * 10n ** 17n);
        expect(result.expiryBlock).toBe(900000n);
    });

    it('getOptionsBatch returns decoded options', async () => {
        const opts = [makeOption(0n), makeOption(1n, 1), makeOption(2n, 2)];
        callMap.set(SEL_GET_BATCH, buildBatchResponse(opts));
        const result = await service.getOptionsBatch(0n, 9n);
        expect(result).toHaveLength(3);
        expect(result[0].id).toBe(0n);
        expect(result[1].status).toBe(1);
        expect(result[2].status).toBe(2);
    });

    it('getAllOptions paginates through all options', async () => {
        const opts = [makeOption(0n), makeOption(1n), makeOption(2n)];
        const emptyBatch = new Uint8Array(32); // count=0

        let batchCall = 0;
        (provider.call as ReturnType<typeof vi.fn>).mockImplementation(
            (_to: string, data: string) => {
                const key = data.slice(0, SEL_LEN);
                if (key === SEL_GET_BATCH) {
                    const bytes = batchCall === 0 ? buildBatchResponse(opts) : emptyBatch;
                    batchCall++;
                    return Promise.resolve(new FakeBinaryReader(bytes));
                }
                const bytes = callMap.get(key);
                if (!bytes) return Promise.reject(new Error(`Unexpected: ${key}`));
                return Promise.resolve(new FakeBinaryReader(bytes));
            }
        );

        const all = await service.getAllOptions();
        expect(all).toHaveLength(3);
    });

    it('getPoolInfo returns correct fee bps and token addresses', async () => {
        const info = await service.getPoolInfo();
        expect(info.underlying).toBe(UNDERLYING_ADDR);
        expect(info.premiumToken).toBe(PREMIUM_ADDR);
        expect(info.cancelFeeBps).toBe(100n);
        expect(info.buyFeeBps).toBe(100n);
        expect(info.exerciseFeeBps).toBe(10n);
        expect(info.gracePeriodBlocks).toBe(144n);
        expect(info.optionCount).toBe(3n);
    });

    it('throws on contract call error', async () => {
        (provider.call as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ error: 'network error' });
        await expect(service.getOptionCount()).rejects.toThrow('Contract call error');
    });

    it('throws on contract revert', async () => {
        (provider.call as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            revert: 'Option not found',
            result: new FakeBinaryReader(new Uint8Array(0)),
        });
        await expect(service.getOption(999n)).rejects.toThrow('Contract reverted');
    });
});
