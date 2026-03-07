/**
 * btc-test-helpers.ts
 *
 * Shared helpers for BTC pool integration tests (14, 15, 16).
 * Bridge view queries, reservation reading, and BTC-specific constants.
 */

import { JSONRpcProvider } from 'opnet';
import { BinaryWriter } from '@btc-vision/transaction';
import { BRIDGE_SELECTORS } from './config.js';
import { isCallError } from './test-harness.js';

// ---------------------------------------------------------------------------
// Constants (must match src/contracts/pool/constants.ts)
// ---------------------------------------------------------------------------

export const GRACE_PERIOD_BLOCKS = 144n;
export const RESERVATION_EXPIRY_BLOCKS = 144n;

// ---------------------------------------------------------------------------
// Bridge view queries
// ---------------------------------------------------------------------------

/**
 * Query bridge generateCsvScriptHash(bytes32,uint64) view.
 * Returns the 32-byte SHA256 hash as 0x-prefixed hex string.
 *
 * @param pubkey - 33-byte compressed pubkey
 * @param csvBlocks - CSV timelock blocks (typically 6)
 */
export async function queryBridgeCsvScriptHash(
    provider: JSONRpcProvider,
    bridgeHex: string,
    pubkey: Uint8Array,
    csvBlocks: bigint,
): Promise<string> {
    const w = new BinaryWriter();
    w.writeBytes(pubkey);
    w.writeU64(csvBlocks);
    const cd = Buffer.from(w.getBuffer()).toString('hex');
    const result = await provider.call(bridgeHex, BRIDGE_SELECTORS.generateCsvScriptHash + cd);
    if (isCallError(result)) throw new Error(`csvScriptHash call error: ${result.error}`);
    if ('revert' in result && result.revert) throw new Error('csvScriptHash revert');
    const hashBigInt = result.result.readU256();
    return '0x' + hashBigInt.toString(16).padStart(64, '0');
}

/**
 * Query bridge generateEscrowScriptHash(bytes32,bytes32,uint64) view.
 * Returns the 32-byte SHA256 hash as 0x-prefixed hex string.
 *
 * @param buyerPub - 33-byte compressed pubkey (or placeholder 0x02+zeros)
 * @param writerPub - 33-byte compressed pubkey
 * @param cltvBlock - CLTV expiry block (expiryBlock + GRACE_PERIOD_BLOCKS)
 */
export async function queryBridgeEscrowScriptHash(
    provider: JSONRpcProvider,
    bridgeHex: string,
    buyerPub: Uint8Array,
    writerPub: Uint8Array,
    cltvBlock: bigint,
): Promise<string> {
    const w = new BinaryWriter();
    w.writeBytes(buyerPub);
    w.writeBytes(writerPub);
    w.writeU64(cltvBlock);
    const cd = Buffer.from(w.getBuffer()).toString('hex');
    const result = await provider.call(bridgeHex, BRIDGE_SELECTORS.generateEscrowScriptHash + cd);
    if (isCallError(result)) throw new Error(`escrowScriptHash call error: ${result.error}`);
    if ('revert' in result && result.revert) throw new Error('escrowScriptHash revert');
    const hashBigInt = result.result.readU256();
    return '0x' + hashBigInt.toString(16).padStart(64, '0');
}

// ---------------------------------------------------------------------------
// Reservation reader (type 1 pools)
// ---------------------------------------------------------------------------

/**
 * Read a reservation's BTC amount from a type 1 pool.
 * Reads the first 4 fields: id, optionId, buyer (skip), btcAmount.
 * Avoids reading bytes32 csvScriptHash which may have format issues.
 */
export async function readReservationBtcAmount(
    provider: JSONRpcProvider,
    poolCallAddr: string,
    reservationId: bigint,
    getReservationSelector: string,
): Promise<{ id: bigint; optionId: bigint; btcAmount: bigint }> {
    const w = new BinaryWriter();
    w.writeU256(reservationId);
    const cd = Buffer.from(w.getBuffer()).toString('hex');
    const result = await provider.call(poolCallAddr, getReservationSelector + cd);
    if (isCallError(result)) throw new Error(`getReservation call error: ${result.error}`);
    if ('revert' in result && result.revert) throw new Error('getReservation revert');
    const reader = result.result;
    const id = reader.readU256();
    const optionId = reader.readU256();
    reader.readAddress(); // buyer — skip
    const btcAmount = reader.readU256();
    return { id, optionId, btcAmount };
}

// ---------------------------------------------------------------------------
// Placeholder pubkey for escrow scripts
// ---------------------------------------------------------------------------

/**
 * Create the placeholder buyer pubkey used by type 2 writeOptionBtc(CALL).
 * The contract uses this when no real buyer exists yet: 0x02 + 32 zero bytes.
 */
export function placeholderBuyerPubkey(): Uint8Array {
    const pub = new Uint8Array(33);
    pub[0] = 0x02;
    return pub;
}
