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
    StoredU256,
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
const CACHED_PRICE_POINTER: u16 = Blockchain.nextPointer;
const CACHED_BLOCK_POINTER: u16 = Blockchain.nextPointer;
const CACHED_TOKEN_POINTER: u16 = Blockchain.nextPointer;

/** Maximum staleness for cached price (6 blocks) */
const MAX_PRICE_STALENESS: u64 = 6;

// =============================================================================
// CONTRACT
// =============================================================================

@final
export class NativeSwapBridge extends OP_NET {
    private _nativeSwap: StoredAddress;
    private _cachedPrice: StoredU256;
    private _cachedBlock: StoredU256;
    private _cachedToken: StoredAddress;

    public constructor() {
        super();
        this._nativeSwap = new StoredAddress(NATIVE_SWAP_POINTER);
        this._cachedPrice = new StoredU256(CACHED_PRICE_POINTER, new Uint8Array(32));
        this._cachedBlock = new StoredU256(CACHED_BLOCK_POINTER, new Uint8Array(32));
        this._cachedToken = new StoredAddress(CACHED_TOKEN_POINTER);
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
    // VIEW: getBtcPrice
    // -------------------------------------------------------------------------

    /**
     * Get the BTC price for a token via NativeSwap cross-contract call.
     * Returns satoshis per token (u256, 18-decimal precision).
     * Caches the result for 6 blocks to avoid redundant cross-contract calls.
     */
    @view
    @method({ name: 'token', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'price', type: ABIDataTypes.UINT256 })
    public getBtcPrice(calldata: Calldata): BytesWriter {
        const token = calldata.readAddress();
        const currentBlock = u256.fromU64(Blockchain.block.number);

        // Check cache: same token and within staleness window
        const cachedBlock = this._cachedBlock.value;
        const cachedToken = this._cachedToken.value;

        if (
            !cachedBlock.isZero() &&
            token.equals(cachedToken) &&
            u256.le(u256.sub(currentBlock, cachedBlock), u256.fromU64(MAX_PRICE_STALENESS))
        ) {
            const price = this._cachedPrice.value;
            const writer = new BytesWriter(32);
            writer.writeU256(price);
            return writer;
        }

        // Query NativeSwap: getQuote(address token, uint256 satoshis)
        // We query with 1e18 satoshis to get the rate at full precision
        const queryCalldata = new BytesWriter(68);
        queryCalldata.writeSelector(encodeSelector('getQuote(address,uint256)'));
        queryCalldata.writeAddress(token);
        queryCalldata.writeU256(u256.fromU64(1_000_000_000_000_000_000));

        const result = Blockchain.call(this._nativeSwap.value, queryCalldata, false);
        if (!result.success) {
            throw new Revert('NativeSwap getQuote failed');
        }

        // Parse response: u256 price via BytesReader
        const price = result.data.readU256();
        if (price.isZero()) {
            throw new Revert('Zero price returned');
        }

        // Update cache
        this._cachedPrice.value = price;
        this._cachedBlock.value = currentBlock;
        this._cachedToken.value = token;

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

        // Build dual-path escrow script manually
        // OP_IF <buyerPub> OP_CHECKSIG
        // OP_ELSE <cltvBlock> OP_CHECKLOCKTIMEVERIFY OP_DROP <writerPub> OP_CHECKSIG
        // OP_ENDIF

        // Encode CLTV block as script number (little-endian, up to 5 bytes)
        const cltvEncoded = this.encodeScriptNumber(i64(cltvBlock));
        const cltvLen = cltvEncoded.length;

        // Calculate script size
        const buyerPubLen = buyerPub.length;
        const writerPubLen = writerPub.length;
        const scriptSize: i32 =
            1 +                          // OP_IF
            1 + buyerPubLen +            // push buyerPub (1-byte len prefix for 33-byte key)
            1 +                          // OP_CHECKSIG
            1 +                          // OP_ELSE
            1 + cltvLen +               // push cltvBlock
            1 +                          // OP_CHECKLOCKTIMEVERIFY
            1 +                          // OP_DROP
            1 + writerPubLen +           // push writerPub
            1 +                          // OP_CHECKSIG
            1;                           // OP_ENDIF

        const w = new BytesWriter(scriptSize);

        // OP_IF
        w.writeU8(BitcoinOpcodes.OP_IF);

        // <buyerPub> (data push: length byte + data for <= 75 bytes)
        w.writeU8(u8(buyerPubLen));
        w.writeBytes(buyerPub);

        // OP_CHECKSIG
        w.writeU8(BitcoinOpcodes.OP_CHECKSIG);

        // OP_ELSE
        w.writeU8(BitcoinOpcodes.OP_ELSE);

        // <cltvBlock> (data push)
        w.writeU8(u8(cltvLen));
        w.writeBytes(cltvEncoded);

        // OP_CHECKLOCKTIMEVERIFY
        w.writeU8(BitcoinOpcodes.OP_CHECKLOCKTIMEVERIFY);

        // OP_DROP
        w.writeU8(BitcoinOpcodes.OP_DROP);

        // <writerPub> (data push)
        w.writeU8(u8(writerPubLen));
        w.writeBytes(writerPub);

        // OP_CHECKSIG
        w.writeU8(BitcoinOpcodes.OP_CHECKSIG);

        // OP_ENDIF
        w.writeU8(BitcoinOpcodes.OP_ENDIF);

        // SHA256 hash for P2WSH
        const script = w.getBuffer().subarray(0, <i32>w.getOffset());
        const hash = sha256(script);

        const writer = new BytesWriter(32);
        writer.writeBytes(hash);
        return writer;
    }

    // -------------------------------------------------------------------------
    // VIEW: verifyBtcOutput
    // -------------------------------------------------------------------------

    /**
     * Verify that the current transaction contains a P2WSH output matching
     * the expected script hash and minimum amount.
     *
     * Scans Blockchain.tx.outputs for:
     * - P2WSH format: OP_0 0x20 <32-byte-hash>
     * - Script hash matches expectedHash
     * - Value >= expectedAmount
     */
    @view
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

            // Skip outputs without scriptPubKey
            if (!output.hasScriptPubKey || output.scriptPublicKey === null) {
                continue;
            }

            const spk = output.scriptPublicKey!;

            // P2WSH format: OP_0 (0x00) + push 32 bytes (0x20) + <32-byte hash>
            // Total: 34 bytes
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
            if (output.value >= expectedAmount) {
                found = true;
                break;
            }
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

        // Determine number of bytes needed
        const result: u8[] = [];
        while (absValue > 0) {
            result.push(u8(absValue & 0xff));
            absValue >>= 8;
        }

        // If the most significant byte has the sign bit set, add an extra byte
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
