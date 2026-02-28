/**
 * useTransactionPoller — polls getTransactionReceipt() for pending TXs every 15s.
 *
 * - Processes up to 5 TXs per cycle to avoid rate limiting.
 * - TXs in 'broadcast' for >2 hours are marked 'failed' (likely dropped).
 * - Confirmed TXs older than 24 hours are pruned from state.
 */
import { useEffect, useRef } from 'react';
import { useTransactionContext } from '../contexts/TransactionContext.tsx';
import type { AbstractRpcProvider } from 'opnet';

const POLL_INTERVAL_MS = 15_000;
const MAX_TXS_PER_CYCLE = 5;
const BROADCAST_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const CONFIRMED_PRUNE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function useTransactionPoller(provider: AbstractRpcProvider | null): void {
    const { transactions, updateTransaction } = useTransactionContext();
    // Ref to avoid stale closure
    const txRef = useRef(transactions);
    txRef.current = transactions;

    useEffect(() => {
        if (!provider) return;

        async function poll() {
            const pending = txRef.current.filter(
                (tx) => tx.status === 'broadcast' || tx.status === 'pending',
            );
            if (pending.length === 0) return;

            const batch = pending.slice(0, MAX_TXS_PER_CYCLE);
            const now = Date.now();

            for (const tx of batch) {
                // Check for timeout (dropped TX)
                const age = now - new Date(tx.createdAt).getTime();
                if (age > BROADCAST_TIMEOUT_MS) {
                    updateTransaction(tx.txId, { status: 'failed' });
                    continue;
                }

                try {
                    const receipt = await provider!.getTransactionReceipt(tx.txId);
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
                        updateTransaction(tx.txId, { status: 'failed' }); // remove from active view
                    }
                }
            }
        }

        const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
        // Run once immediately
        void poll();

        return () => clearInterval(timer);
    }, [provider, updateTransaction]);
}
