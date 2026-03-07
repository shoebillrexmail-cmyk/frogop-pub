/**
 * useTransactionPoller — checks getTransactionReceipt() for pending TXs.
 *
 * Primary: triggers on new blocks (via currentBlock from WS) — instant detection.
 * Fallback: polls every 15s when no block signal is available.
 *
 * - Processes up to 5 TXs per cycle to avoid rate limiting.
 * - TXs in 'broadcast' for >2 hours are marked 'failed' (likely dropped).
 * - Confirmed TXs older than 24 hours are pruned from state.
 */
import { useEffect, useRef } from 'react';
import { useTransactionContext } from './useTransactionContext.ts';
import type { AbstractRpcProvider } from 'opnet';

const FALLBACK_POLL_MS = 15_000;
const MAX_TXS_PER_CYCLE = 5;
const BROADCAST_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const CONFIRMED_PRUNE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function useTransactionPoller(
    provider: AbstractRpcProvider | null,
    currentBlock?: bigint | null,
): void {
    const { transactions, updateTransaction } = useTransactionContext();
    const txRef = useRef(transactions);
    txRef.current = transactions;
    const pollingRef = useRef(false);

    // Core poll function — shared between WS-triggered and fallback
    const pollRef = useRef(async () => {});
    pollRef.current = async () => {
        if (!provider || pollingRef.current) return;
        pollingRef.current = true;

        try {
            const pending = txRef.current.filter(
                (tx) => tx.status === 'broadcast' || tx.status === 'pending',
            );
            if (pending.length === 0) return;

            const batch = pending.slice(0, MAX_TXS_PER_CYCLE);
            const now = Date.now();

            for (const tx of batch) {
                const age = now - new Date(tx.createdAt).getTime();
                if (age > BROADCAST_TIMEOUT_MS) {
                    updateTransaction(tx.txId, { status: 'failed' });
                    continue;
                }

                try {
                    const receipt = await provider.getTransactionReceipt(tx.txId);
                    if (receipt) {
                        updateTransaction(tx.txId, {
                            status: 'confirmed',
                            confirmedAt: new Date().toISOString(),
                            confirmedBlock: null,
                        });
                    }
                } catch {
                    // Receipt not found yet — stay pending
                }
            }

            // Prune old confirmed TXs
            for (const tx of txRef.current) {
                if (tx.status === 'confirmed' && tx.confirmedAt) {
                    const confirmAge = now - new Date(tx.confirmedAt).getTime();
                    if (confirmAge > CONFIRMED_PRUNE_MS) {
                        updateTransaction(tx.txId, { status: 'failed' });
                    }
                }
            }
        } finally {
            pollingRef.current = false;
        }
    };

    // Trigger on new blocks from WebSocket
    useEffect(() => {
        if (currentBlock !== undefined && currentBlock !== null) {
            void pollRef.current();
        }
    }, [currentBlock]);

    // Fallback: poll every 15s when no WS block signal
    useEffect(() => {
        if (!provider) return;
        // If WS is feeding blocks, skip fallback polling
        if (currentBlock !== undefined && currentBlock !== null) return;

        const timer = setInterval(() => void pollRef.current(), FALLBACK_POLL_MS);
        void pollRef.current();

        return () => clearInterval(timer);
    }, [provider, currentBlock]);
}
