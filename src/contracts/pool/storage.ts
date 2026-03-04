import { u256 } from '@btc-vision/as-bignum/assembly';
import { Address, Blockchain, BytesWriter } from '@btc-vision/btc-runtime/runtime';
import { sha256 } from '@btc-vision/btc-runtime/runtime/env/global';
import { CALL, OPEN } from './constants';

// =============================================================================
// OPTION DATA TRANSFER OBJECT
// =============================================================================

export class Option {
    id: u256 = u256.Zero;
    writer: Address = Address.zero();
    buyer: Address = Address.zero();
    strikePrice: u256 = u256.Zero;
    underlyingAmount: u256 = u256.Zero;
    premium: u256 = u256.Zero;
    expiryBlock: u64 = 0;
    createdBlock: u64 = 0;
    optionType: u8 = CALL;
    status: u8 = OPEN;
}

// =============================================================================
// OPTION STORAGE (SHA256-keyed, unlimited capacity)
// =============================================================================

/**
 * Optimized Option Storage
 *
 * Uses SHA256-based storage keys for UNLIMITED options.
 * Storage pattern: StorageKey = SHA256(basePointer || optionId || slot)
 *
 * Storage Layout (7 slots per option):
 *   0: writer (Address)
 *   1: buyer (Address)
 *   2: strikePrice (u256)
 *   3: underlyingAmount (u256)
 *   4: premium (u256)
 *   5: expiryBlock (u64) | createdBlock (u64) - packed
 *   6: optionType (u8) | status (u8) - packed
 */
export class OptionStorage {
    private basePointer: u16;

    constructor(pointer: u16) {
        this.basePointer = pointer;
    }

    private getKey(optionId: u256, slot: u8): Uint8Array {
        const writer = new BytesWriter(35);
        writer.writeU16(this.basePointer);
        writer.writeU256(optionId);
        writer.writeU8(slot);
        return sha256(writer.getBuffer());
    }

    setWriter(optionId: u256, writer: Address): void {
        Blockchain.setStorageAt(this.getKey(optionId, 0), writer);
    }

    getWriter(optionId: u256): Address {
        return Address.fromUint8Array(Blockchain.getStorageAt(this.getKey(optionId, 0)));
    }

    setBuyer(optionId: u256, buyer: Address): void {
        Blockchain.setStorageAt(this.getKey(optionId, 1), buyer);
    }

    getBuyer(optionId: u256): Address {
        return Address.fromUint8Array(Blockchain.getStorageAt(this.getKey(optionId, 1)));
    }

    setStrikePrice(optionId: u256, price: u256): void {
        Blockchain.setStorageAt(this.getKey(optionId, 2), price.toUint8Array(true));
    }

    getStrikePrice(optionId: u256): u256 {
        return u256.fromUint8ArrayBE(Blockchain.getStorageAt(this.getKey(optionId, 2)));
    }

    setUnderlyingAmount(optionId: u256, amount: u256): void {
        Blockchain.setStorageAt(this.getKey(optionId, 3), amount.toUint8Array(true));
    }

    getUnderlyingAmount(optionId: u256): u256 {
        return u256.fromUint8ArrayBE(Blockchain.getStorageAt(this.getKey(optionId, 3)));
    }

    setPremium(optionId: u256, premium: u256): void {
        Blockchain.setStorageAt(this.getKey(optionId, 4), premium.toUint8Array(true));
    }

    getPremium(optionId: u256): u256 {
        return u256.fromUint8ArrayBE(Blockchain.getStorageAt(this.getKey(optionId, 4)));
    }

    private packBlocks(expiryBlock: u64, createdBlock: u64): Uint8Array {
        const data = new Uint8Array(32);
        for (let i = 0; i < 8; i++) {
            data[16 + i] = u8((expiryBlock >> u64(56 - i * 8)) & 0xFF);
            data[24 + i] = u8((createdBlock >> u64(56 - i * 8)) & 0xFF);
        }
        return data;
    }

    setExpiryAndCreatedBlock(optionId: u256, expiryBlock: u64, createdBlock: u64): void {
        Blockchain.setStorageAt(this.getKey(optionId, 5), this.packBlocks(expiryBlock, createdBlock));
    }

    getExpiryBlock(optionId: u256): u64 {
        const data = Blockchain.getStorageAt(this.getKey(optionId, 5));
        let result: u64 = 0;
        for (let i = 0; i < 8; i++) {
            result = (result << 8) | u64(data[16 + i]);
        }
        return result;
    }

    getCreatedBlock(optionId: u256): u64 {
        const data = Blockchain.getStorageAt(this.getKey(optionId, 5));
        let result: u64 = 0;
        for (let i = 0; i < 8; i++) {
            result = (result << 8) | u64(data[24 + i]);
        }
        return result;
    }

    setExpiryBlock(optionId: u256, blockNum: u64): void {
        const createdBlock = this.getCreatedBlock(optionId);
        Blockchain.setStorageAt(this.getKey(optionId, 5), this.packBlocks(blockNum, createdBlock));
    }

    setCreatedBlock(optionId: u256, blockNum: u64): void {
        const expiryBlock = this.getExpiryBlock(optionId);
        Blockchain.setStorageAt(this.getKey(optionId, 5), this.packBlocks(expiryBlock, blockNum));
    }

    private packTypeAndStatus(optionType: u8, status: u8): Uint8Array {
        const data = new Uint8Array(32);
        data[30] = optionType;
        data[31] = status;
        return data;
    }

    setOptionType(optionId: u256, optionType: u8): void {
        const status = this.getStatus(optionId);
        Blockchain.setStorageAt(this.getKey(optionId, 6), this.packTypeAndStatus(optionType, status));
    }

    getOptionType(optionId: u256): u8 {
        return Blockchain.getStorageAt(this.getKey(optionId, 6))[30];
    }

    setStatus(optionId: u256, status: u8): void {
        const optionType = this.getOptionType(optionId);
        Blockchain.setStorageAt(this.getKey(optionId, 6), this.packTypeAndStatus(optionType, status));
    }

    getStatus(optionId: u256): u8 {
        return Blockchain.getStorageAt(this.getKey(optionId, 6))[31];
    }

    exists(optionId: u256): boolean {
        return Blockchain.hasStorageAt(this.getKey(optionId, 0));
    }

    get(optionId: u256): Option {
        const option = new Option();
        option.id = optionId;
        option.writer = this.getWriter(optionId);
        option.buyer = this.getBuyer(optionId);
        option.strikePrice = this.getStrikePrice(optionId);
        option.underlyingAmount = this.getUnderlyingAmount(optionId);
        option.premium = this.getPremium(optionId);
        option.expiryBlock = this.getExpiryBlock(optionId);
        option.createdBlock = this.getCreatedBlock(optionId);
        option.optionType = this.getOptionType(optionId);
        option.status = this.getStatus(optionId);
        return option;
    }

    set(optionId: u256, option: Option): void {
        this.setWriter(optionId, option.writer);
        this.setBuyer(optionId, option.buyer);
        this.setStrikePrice(optionId, option.strikePrice);
        this.setUnderlyingAmount(optionId, option.underlyingAmount);
        this.setPremium(optionId, option.premium);
        this.setExpiryAndCreatedBlock(optionId, option.expiryBlock, option.createdBlock);
        Blockchain.setStorageAt(this.getKey(optionId, 6), this.packTypeAndStatus(option.optionType, option.status));
    }
}
