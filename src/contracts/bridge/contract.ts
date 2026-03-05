/**
 * NativeSwapBridge - Stateless utility contract for BTC integration
 *
 * Provides:
 * - getBtcPrice: Cross-contract query to NativeSwap for BTC/token prices
 * - generateCsvScriptHash: CSV timelock script builder (for BTC collateral)
 * - generateEscrowScriptHash: Dual-path escrow script (for BTC collateral with buyer claim)
 * - verifyBtcOutput: UTXO output verification in current transaction
 *
 * This contract is stateless except for the NativeSwap address and price cache.
 */

import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    Revert,
    StoredAddress,
    OP_NET,
    encodeSelector,
    BitcoinScript,
    BitcoinOpcodes,
} from '@btc-vision/btc-runtime/runtime';
import { sha256 } from '@btc-vision/btc-runtime/runtime/env/global';

// =============================================================================
// STORAGE POINTERS
// =============================================================================

const NATIVE_SWAP_POINTER: u16 = Blockchain.nextPointer;

/** Per-token price cache pointer (CRIT-4 fix) */
const PRICE_CACHE_POINTER: u16 = Blockchain.nextPointer;

/** Consumed-output registry pointer (CRIT-1 fix) */
const CONSUMED_OUTPUTS_POINTER: u16 = Blockchain.nextPointer;

/** Maximum staleness for cached price (6 blocks) */
const MAX_PRICE_STALENESS: u64 = 6;

/** Cache slot indices for per-token keyed storage */
const CACHE_SLOT_PRICE: u8 = 0;
const CACHE_SLOT_BLOCK: u8 = 1;

// =============================================================================
// CONTRACT
// =============================================================================

@final
export class NativeSwapBridge extends OP_NET {
    private _nativeSwap: StoredAddress;

    public constructor() {
        super();
        this._nativeSwap = new StoredAddress(NATIVE_SWAP_POINTER);
    }

    public override onDeployment(calldata: Calldata): void {
        super.onDeployment(calldata);

        const nativeSwapAddr = calldata.readAddress();
        if (nativeSwapAddr.equals(Address.zero())) {
            throw new Revert('NativeSwap address cannot be zero');
        }

        this._nativeSwap.value = nativeSwapAddr;
    }

    // -------------------------------------------------------------------------
    // getBtcPrice (CRIT-4: per-token cache, MED-4: removed @view)
    // -------------------------------------------------------------------------

    /**
     * Get the BTC price for a token via NativeSwap cross-contract call.
     * Returns satoshis per token (u256, 18-decimal precision).
     * Caches the result per-token for 6 blocks to avoid redundant cross-contract calls.
     *
     * NOTE: Not @view because it writes cache state.
     */
    @method({ name: 'token', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'price', type: ABIDataTypes.UINT256 })
    public getBtcPrice(calldata: Calldata): BytesWriter {
        const token = calldata.readAddress();
        const currentBlock = u256.fromU64(Blockchain.block.number);

        // Per-token cache check (CRIT-4 fix)
        const cachedBlockKey = this.priceCacheKey(token, CACHE_SLOT_BLOCK);
        const cachedBlockData = Blockchain.getStorageAt(cachedBlockKey);
        const cachedBlock = u256.fromUint8ArrayBE(cachedBlockData);

        if (
            !cachedBlock.isZero() &&
            u256.le(u256.sub(currentBlock, cachedBlock), u256.fromU64(MAX_PRICE_STALENESS))
        ) {
            const cachedPriceKey = this.priceCacheKey(token, CACHE_SLOT_PRICE);
            const price = u256.fromUint8ArrayBE(Blockchain.getStorageAt(cachedPriceKey));
            const writer = new BytesWriter(32);
            writer.writeU256(price);
            return writer;
        }

        // Query NativeSwap: getQuote(address token, uint256 satoshis)
        const queryCalldata = new BytesWriter(68);
        queryCalldata.writeSelector(encodeSelector('getQuote(address,uint256)'));
        queryCalldata.writeAddress(token);
        queryCalldata.writeU256(u256.fromU64(1_000_000_000_000_000_000));

        const result = Blockchain.call(this._nativeSwap.value, queryCalldata, false);
        if (!result.success) {
            throw new Revert('NativeSwap getQuote failed');
        }

        const price = result.data.readU256();
        if (price.isZero()) {
            throw new Revert('Zero price returned');
        }

        // Update per-token cache
        const priceKey = this.priceCacheKey(token, CACHE_SLOT_PRICE);
        Blockchain.setStorageAt(priceKey, price.toUint8Array(true));
        const blockKey = this.priceCacheKey(token, CACHE_SLOT_BLOCK);
        Blockchain.setStorageAt(blockKey, currentBlock.toUint8Array(true));

        const writer = new BytesWriter(32);
        writer.writeU256(price);
        return writer;
    }

    // -------------------------------------------------------------------------
    // VIEW: generateCsvScriptHash
    // -------------------------------------------------------------------------

    /**
     * Generate a CSV (CheckSequenceVerify) timelock script and return its SHA256 hash.
     * Script: <n> OP_CHECKSEQUENCEVERIFY OP_DROP <pubkey> OP_CHECKSIG
     *
     * Used for P2WSH address derivation for BTC collateral locking.
     */
    @view
    @method(
        { name: 'pubkey', type: ABIDataTypes.BYTES32 },
        { name: 'csvBlocks', type: ABIDataTypes.UINT64 },
    )
    @returns({ name: 'scriptHash', type: ABIDataTypes.BYTES32 })
    public generateCsvScriptHash(calldata: Calldata): BytesWriter {
        const pubkeyBytes = calldata.readBytes(33);
        const csvBlocks = calldata.readU64();

        if (csvBlocks == 0) {
            throw new Revert('CSV blocks must be > 0');
        }
        if (csvBlocks > 65535) {
            throw new Revert('CSV blocks exceeds 16-bit BIP-68 field');
        }

        // Build CSV script using runtime utility
        const script = BitcoinScript.csvTimelock(pubkeyBytes, i32(csvBlocks));

        // SHA256 hash for P2WSH
        const hash = sha256(script);

        const writer = new BytesWriter(32);
        writer.writeBytes(hash);
        return writer;
    }

    // -------------------------------------------------------------------------
    // VIEW: generateEscrowScriptHash
    // -------------------------------------------------------------------------

    /**
     * Generate a dual-path escrow script hash.
     * Script:
     *   OP_IF <buyerPub> OP_CHECKSIG
     *   OP_ELSE <cltvBlock> OP_CHECKLOCKTIMEVERIFY OP_DROP <writerPub> OP_CHECKSIG
     *   OP_ENDIF
     *
     * Buyer path: immediate spend (after exercise).
     * Writer path: reclaim after CLTV expiry (timelock refund).
     */
    @view
    @method(
        { name: 'buyerPubkey', type: ABIDataTypes.BYTES32 },
        { name: 'writerPubkey', type: ABIDataTypes.BYTES32 },
        { name: 'cltvBlock', type: ABIDataTypes.UINT64 },
    )
    @returns({ name: 'scriptHash', type: ABIDataTypes.BYTES32 })
    public generateEscrowScriptHash(calldata: Calldata): BytesWriter {
        const buyerPub = calldata.readBytes(33);
        const writerPub = calldata.readBytes(33);
        const cltvBlock = calldata.readU64();

        if (cltvBlock == 0) {
            throw new Revert('CLTV block must be > 0');
        }

        // LOW-6: Validate pubkey lengths
        if (buyerPub.length != 33) {
            throw new Revert('Buyer pubkey must be 33 bytes');
        }
        if (writerPub.length != 33) {
            throw new Revert('Writer pubkey must be 33 bytes');
        }

        // Build dual-path escrow script manually
        const cltvEncoded = this.encodeScriptNumber(i64(cltvBlock));
        const cltvLen = cltvEncoded.length;

        const buyerPubLen = buyerPub.length;
        const writerPubLen = writerPub.length;
        const scriptSize: i32 =
            1 +                          // OP_IF
            1 + buyerPubLen +            // push buyerPub
            1 +                          // OP_CHECKSIG
            1 +                          // OP_ELSE
            1 + cltvLen +               // push cltvBlock
            1 +                          // OP_CHECKLOCKTIMEVERIFY
            1 +                          // OP_DROP
            1 + writerPubLen +           // push writerPub
            1 +                          // OP_CHECKSIG
            1;                           // OP_ENDIF

        const w = new BytesWriter(scriptSize);

        w.writeU8(BitcoinOpcodes.OP_IF);
        w.writeU8(u8(buyerPubLen));
        w.writeBytes(buyerPub);
        w.writeU8(BitcoinOpcodes.OP_CHECKSIG);
        w.writeU8(BitcoinOpcodes.OP_ELSE);
        w.writeU8(u8(cltvLen));
        w.writeBytes(cltvEncoded);
        w.writeU8(BitcoinOpcodes.OP_CHECKLOCKTIMEVERIFY);
        w.writeU8(BitcoinOpcodes.OP_DROP);
        w.writeU8(u8(writerPubLen));
        w.writeBytes(writerPub);
        w.writeU8(BitcoinOpcodes.OP_CHECKSIG);
        w.writeU8(BitcoinOpcodes.OP_ENDIF);

        const script = w.getBuffer().subarray(0, <i32>w.getOffset());
        const hash = sha256(script);

        const writer = new BytesWriter(32);
        writer.writeBytes(hash);
        return writer;
    }

    // -------------------------------------------------------------------------
    // verifyBtcOutput (CRIT-1: consumed-output registry, MED-4: removed @view)
    // -------------------------------------------------------------------------

    /**
     * Verify that the current transaction contains a P2WSH output matching
     * the expected script hash and minimum amount.
     *
     * CRIT-1 fix: Marks consumed outputs to prevent double-spend within
     * the same transaction. Each (scriptHash, value) pair can only be
     * consumed once.
     *
     * NOTE: Not @view because it writes consumed-output state.
     */
    @method(
        { name: 'expectedHash', type: ABIDataTypes.BYTES32 },
        { name: 'expectedAmount', type: ABIDataTypes.UINT64 },
    )
    @returns({ name: 'verified', type: ABIDataTypes.BOOL })
    public verifyBtcOutput(calldata: Calldata): BytesWriter {
        const expectedHash = calldata.readBytes(32);
        const expectedAmount = calldata.readU64();

        const outputs = Blockchain.tx.outputs;
        let found: bool = false;

        for (let i: i32 = 0; i < outputs.length; i++) {
            const output = outputs[i];

            if (!output.hasScriptPubKey || output.scriptPublicKey === null) {
                continue;
            }

            const spk = output.scriptPublicKey!;

            // P2WSH format: OP_0 (0x00) + push 32 bytes (0x20) + <32-byte hash>
            if (spk.length != 34) {
                continue;
            }
            if (spk[0] != 0x00 || spk[1] != 0x20) {
                continue;
            }

            // Compare hash (bytes 2..34 of scriptPubKey)
            let hashMatch: bool = true;
            for (let j: i32 = 0; j < 32; j++) {
                if (spk[2 + j] != expectedHash[j]) {
                    hashMatch = false;
                    break;
                }
            }

            if (!hashMatch) {
                continue;
            }

            // Check value
            if (output.value < expectedAmount) {
                continue;
            }

            // CRIT-1: Check if this output is already consumed
            const consumedKey = this.consumedOutputKey(expectedHash, output.value);
            if (Blockchain.hasStorageAt(consumedKey)) {
                continue; // Already consumed, skip
            }

            // Mark as consumed
            const one = new Uint8Array(32);
            one[31] = 1;
            Blockchain.setStorageAt(consumedKey, one);
            found = true;
            break;
        }

        const writer = new BytesWriter(1);
        writer.writeBoolean(found);
        return writer;
    }

    // -------------------------------------------------------------------------
    // VIEW: getNativeSwap
    // -------------------------------------------------------------------------

    @view
    @method('nativeSwap')
    @returns({ name: 'address', type: ABIDataTypes.ADDRESS })
    public getNativeSwap(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeAddress(this._nativeSwap.value);
        return writer;
    }

    // -------------------------------------------------------------------------
    // INTERNAL HELPERS
    // -------------------------------------------------------------------------

    /** Per-token price cache key: sha256(PRICE_CACHE_POINTER || token || slot) */
    private priceCacheKey(token: Address, slot: u8): Uint8Array {
        const w = new BytesWriter(35);
        w.writeU16(PRICE_CACHE_POINTER);
        w.writeAddress(token);
        w.writeU8(slot);
        return sha256(w.getBuffer());
    }

    /** Consumed-output key: sha256(CONSUMED_OUTPUTS_POINTER || scriptHash || value) */
    private consumedOutputKey(scriptHash: Uint8Array, value: u64): Uint8Array {
        const w = new BytesWriter(42);
        w.writeU16(CONSUMED_OUTPUTS_POINTER);
        w.writeBytes(scriptHash);
        w.writeU64(value);
        return sha256(w.getBuffer());
    }

    /**
     * Encode an integer as a Bitcoin script number (little-endian with sign bit).
     * Used for CLTV/CSV block heights.
     */
    private encodeScriptNumber(value: i64): Uint8Array {
        if (value == 0) {
            return new Uint8Array(0);
        }

        const negative = value < 0;
        let absValue: u64 = negative ? u64(-value) : u64(value);

        const result: u8[] = [];
        while (absValue > 0) {
            result.push(u8(absValue & 0xff));
            absValue >>= 8;
        }

        if (result[result.length - 1] & 0x80) {
            result.push(negative ? 0x80 : 0x00);
        } else if (negative) {
            result[result.length - 1] |= 0x80;
        }

        const buf = new Uint8Array(result.length);
        for (let i = 0; i < result.length; i++) {
            buf[i] = result[i];
        }
        return buf;
    }
}
