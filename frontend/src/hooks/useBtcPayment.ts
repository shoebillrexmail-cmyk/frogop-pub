/**
 * useBtcPayment — Manages three-phase BTC payment flow for type 1 (OP20/BTC) pools.
 *
 * Flow: IDLE → RESERVING → AWAITING_BTC → EXECUTING → COMPLETE
 *
 * Phase 1: reserveOption() — creates a reservation, returns BTC amount + CSV script hash
 * Phase 2: User sends BTC to the P2WSH address derived from the CSV script hash
 * Phase 3: executeReservation() — verifies BTC UTXO on-chain and completes the purchase
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { payments, networks } from '@btc-vision/bitcoin';

export type BtcPaymentPhase =
    | 'IDLE'
    | 'RESERVING'
    | 'AWAITING_BTC'
    | 'EXECUTING'
    | 'COMPLETE'
    | 'ERROR';

export interface BtcReservationInfo {
    reservationId: bigint;
    btcAmount: bigint;
    csvScriptHash: string;
    /** bech32m P2WSH address for BTC payment (derived off-chain from csvScriptHash) */
    p2wshAddress: string;
    /** Block number at which the reservation expires */
    expiryBlock: bigint;
}

export interface UseBtcPaymentResult {
    phase: BtcPaymentPhase;
    reservation: BtcReservationInfo | null;
    error: string | null;
    /** Blocks remaining until reservation expires (null if no active reservation) */
    blocksRemaining: bigint | null;
    /** Start the reservation flow for a given option */
    startReservation: (optionId: bigint) => void;
    /** Confirm BTC payment was sent — triggers executeReservation */
    confirmPayment: () => void;
    /** Reset the flow to IDLE */
    reset: () => void;
}

/**
 * Derive a bech32 P2WSH address from a CSV script hash.
 * The csvScriptHash is already a SHA256 of the witness script — we wrap it in
 * a witness v0 program and encode with bech32 (not bech32m, which is for v1+).
 *
 * @param csvScriptHash - 0x-prefixed 64-char hex string (32 bytes)
 * @param network - bitcoin network (defaults to testnet for OPNet signet)
 */
function deriveP2wshAddress(
    csvScriptHash: string,
    network = networks.testnet, // OPNet testnet runs on signet — uses 'tb' bech32 HRP
): string {
    const hashHex = csvScriptHash.startsWith('0x') ? csvScriptHash.slice(2) : csvScriptHash;
    const hash = Buffer.from(hashHex, 'hex');
    const p2wsh = payments.p2wsh({ hash, network });
    return p2wsh.address!;
}

interface UseBtcPaymentOptions {
    /** Pool service instance for making contract calls */
    onReserve: (optionId: bigint) => Promise<{
        reservationId: bigint;
        btcAmount: bigint;
        csvScriptHash: string;
        expiryBlock: bigint;
    }>;
    /** Execute the reservation after BTC is sent */
    onExecute: (reservationId: bigint) => Promise<void>;
    /** Current block number for countdown calculation */
    currentBlock: bigint | null;
    /** Callback on successful completion */
    onSuccess?: () => void;
}

export function useBtcPayment({
    onReserve,
    onExecute,
    currentBlock,
    onSuccess,
}: UseBtcPaymentOptions): UseBtcPaymentResult {
    const [phase, setPhase] = useState<BtcPaymentPhase>('IDLE');
    const [reservation, setReservation] = useState<BtcReservationInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const blocksRemaining = reservation && currentBlock
        ? reservation.expiryBlock - currentBlock
        : null;

    // Auto-expire if blocks run out
    useEffect(() => {
        if (blocksRemaining !== null && blocksRemaining <= 0n && phase === 'AWAITING_BTC') {
            setPhase('ERROR');
            setError('Reservation expired. Please try again.');
        }
    }, [blocksRemaining, phase]);

    const startReservation = useCallback(async (optionId: bigint) => {
        setPhase('RESERVING');
        setError(null);
        try {
            const result = await onReserve(optionId);
            if (!mountedRef.current) return;
            const info: BtcReservationInfo = {
                reservationId: result.reservationId,
                btcAmount: result.btcAmount,
                csvScriptHash: result.csvScriptHash,
                p2wshAddress: deriveP2wshAddress(result.csvScriptHash),
                expiryBlock: result.expiryBlock,
            };
            setReservation(info);
            setPhase('AWAITING_BTC');
        } catch (err) {
            if (!mountedRef.current) return;
            setError(err instanceof Error ? err.message : 'Failed to create reservation');
            setPhase('ERROR');
        }
    }, [onReserve]);

    const confirmPayment = useCallback(async () => {
        if (!reservation) return;
        setPhase('EXECUTING');
        setError(null);
        try {
            await onExecute(reservation.reservationId);
            if (!mountedRef.current) return;
            setPhase('COMPLETE');
            onSuccess?.();
        } catch (err) {
            if (!mountedRef.current) return;
            setError(err instanceof Error ? err.message : 'Failed to verify BTC payment');
            setPhase('ERROR');
        }
    }, [reservation, onExecute, onSuccess]);

    const reset = useCallback(() => {
        setPhase('IDLE');
        setReservation(null);
        setError(null);
    }, []);

    return {
        phase,
        reservation,
        error,
        blocksRemaining,
        startReservation,
        confirmPayment,
        reset,
    };
}
