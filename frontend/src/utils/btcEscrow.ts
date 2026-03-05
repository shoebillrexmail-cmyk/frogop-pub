/**
 * btcEscrow — shared BTC escrow utilities for pool modals.
 *
 * Extracts P2WSH derivation and extraOutput construction from BuyOptionModal
 * so that WriteOptionPanel, ExerciseModal, and other modals can reuse the
 * same logic for BTC pool transactions.
 */
import { payments, networks, toBytes32 } from '@btc-vision/bitcoin';

/**
 * Derive a bech32 P2WSH address from a CSV script hash.
 *
 * The csvScriptHash is already SHA256 of the witness script — we wrap it
 * in a witness v0 program and encode with bech32 ('tb1q...' on testnet).
 *
 * @param csvScriptHash - 0x-prefixed or bare 64-char hex string (32 bytes)
 * @param network - bitcoin network (defaults to testnet for OPNet signet)
 */
export function deriveP2wshAddress(
    csvScriptHash: string,
    network = networks.testnet,
): string {
    const hashHex = csvScriptHash.startsWith('0x') ? csvScriptHash.slice(2) : csvScriptHash;
    const hash = toBytes32(new Uint8Array(Buffer.from(hashHex, 'hex')));
    const p2wsh = payments.p2wsh({ hash, network });
    return p2wsh.address!;
}

/**
 * Build an extraOutput entry for a BTC payment in a contract transaction.
 *
 * @param escrowAddress - bech32 P2WSH address (from deriveP2wshAddress)
 * @param amountSats - amount in satoshis (bigint)
 * @returns extraOutput object compatible with sendTransaction()
 */
export function buildBtcExtraOutput(
    escrowAddress: string,
    amountSats: bigint,
): { address: string; value: number } {
    return {
        address: escrowAddress,
        value: amountSats as unknown as number, // Satoshi branded bigint
    };
}
