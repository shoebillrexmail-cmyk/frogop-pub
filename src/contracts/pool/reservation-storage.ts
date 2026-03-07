/**
 * ReservationStorage - SHA256-keyed storage for two-phase BTC commit reservations.
 *
 * Storage Layout (5 slots per reservation):
 *   0: optionId (u256)
 *   1: buyer (Address)
 *   2: btcAmount (u256, satoshis)
 *   3: csvScriptHash (bytes32)
 *   4: expiryBlock (u64) | status (u8) - packed
 *
 * Status: 0=PENDING, 1=EXECUTED, 2=EXPIRED
 */

import { u256 } from '@btc-vision/as-bignum/assembly';
import { Address, Blockchain, BytesWriter } from '@btc-vision/btc-runtime/runtime';
import { sha256 } from '@btc-vision/btc-runtime/runtime/env/global';

export const RESERVATION_PENDING: u8 = 0;
export const RESERVATION_EXECUTED: u8 = 1;
export const RESERVATION_EXPIRED: u8 = 2;

export class Reservation {
    id: u256 = u256.Zero;
    optionId: u256 = u256.Zero;
    buyer: Address = Address.zero();
    btcAmount: u256 = u256.Zero;
    csvScriptHash: Uint8Array = new Uint8Array(32);
    expiryBlock: u64 = 0;
    status: u8 = RESERVATION_PENDING;
}

export class ReservationStorage {
    private basePointer: u16;

    constructor(pointer: u16) {
        this.basePointer = pointer;
    }

    private getKey(reservationId: u256, slot: u8): Uint8Array {
        const writer = new BytesWriter(35);
        writer.writeU16(this.basePointer);
        writer.writeU256(reservationId);
        writer.writeU8(slot);
        return sha256(writer.getBuffer());
    }

    // Slot 0: optionId
    setOptionId(id: u256, optionId: u256): void {
        Blockchain.setStorageAt(this.getKey(id, 0), optionId.toUint8Array(true));
    }

    getOptionId(id: u256): u256 {
        return u256.fromUint8ArrayBE(Blockchain.getStorageAt(this.getKey(id, 0)));
    }

    // Slot 1: buyer
    setBuyer(id: u256, buyer: Address): void {
        Blockchain.setStorageAt(this.getKey(id, 1), buyer);
    }

    getBuyer(id: u256): Address {
        return Address.fromUint8Array(Blockchain.getStorageAt(this.getKey(id, 1)));
    }

    // Slot 2: btcAmount
    setBtcAmount(id: u256, amount: u256): void {
        Blockchain.setStorageAt(this.getKey(id, 2), amount.toUint8Array(true));
    }

    getBtcAmount(id: u256): u256 {
        return u256.fromUint8ArrayBE(Blockchain.getStorageAt(this.getKey(id, 2)));
    }

    // Slot 3: csvScriptHash (32 bytes)
    setCsvScriptHash(id: u256, hash: Uint8Array): void {
        Blockchain.setStorageAt(this.getKey(id, 3), hash);
    }

    getCsvScriptHash(id: u256): Uint8Array {
        return Blockchain.getStorageAt(this.getKey(id, 3));
    }

    // Slot 4: expiryBlock (u64) + status (u8) packed
    private packExpiryAndStatus(expiryBlock: u64, status: u8): Uint8Array {
        const data = new Uint8Array(32);
        // Write expiryBlock in bytes 16..23 (big-endian u64)
        for (let i = 0; i < 8; i++) {
            data[16 + i] = u8((expiryBlock >> u64(56 - i * 8)) & 0xFF);
        }
        // Status in byte 31
        data[31] = status;
        return data;
    }

    setExpiryAndStatus(id: u256, expiryBlock: u64, status: u8): void {
        Blockchain.setStorageAt(this.getKey(id, 4), this.packExpiryAndStatus(expiryBlock, status));
    }

    getExpiryBlock(id: u256): u64 {
        const data = Blockchain.getStorageAt(this.getKey(id, 4));
        let result: u64 = 0;
        for (let i = 0; i < 8; i++) {
            result = (result << 8) | u64(data[16 + i]);
        }
        return result;
    }

    getStatus(id: u256): u8 {
        return Blockchain.getStorageAt(this.getKey(id, 4))[31];
    }

    setStatus(id: u256, status: u8): void {
        const expiryBlock = this.getExpiryBlock(id);
        Blockchain.setStorageAt(this.getKey(id, 4), this.packExpiryAndStatus(expiryBlock, status));
    }

    exists(id: u256): boolean {
        return Blockchain.hasStorageAt(this.getKey(id, 0));
    }

    get(id: u256): Reservation {
        const r = new Reservation();
        r.id = id;
        r.optionId = this.getOptionId(id);
        r.buyer = this.getBuyer(id);
        r.btcAmount = this.getBtcAmount(id);
        r.csvScriptHash = this.getCsvScriptHash(id);
        r.expiryBlock = this.getExpiryBlock(id);
        r.status = this.getStatus(id);
        return r;
    }

    set(id: u256, r: Reservation): void {
        this.setOptionId(id, r.optionId);
        this.setBuyer(id, r.buyer);
        this.setBtcAmount(id, r.btcAmount);
        this.setCsvScriptHash(id, r.csvScriptHash);
        this.setExpiryAndStatus(id, r.expiryBlock, r.status);
    }

    /** Clear a reservation (zero out all slots) */
    clear(id: u256): void {
        const zero = new Uint8Array(32);
        Blockchain.setStorageAt(this.getKey(id, 0), zero);
        Blockchain.setStorageAt(this.getKey(id, 1), zero);
        Blockchain.setStorageAt(this.getKey(id, 2), zero);
        Blockchain.setStorageAt(this.getKey(id, 3), zero);
        Blockchain.setStorageAt(this.getKey(id, 4), zero);
    }
}
