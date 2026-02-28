/**
 * useBlockTracker — polls provider.getBlockNumber() every 15s.
 */
import { useState, useEffect, useCallback } from 'react';
import type { AbstractRpcProvider } from 'opnet';

export interface UseBlockTrackerResult {
    currentBlock: bigint | null;
    refreshBlock: () => void;
}

export function useBlockTracker(
    provider: AbstractRpcProvider | null,
    pollIntervalMs = 15_000,
): UseBlockTrackerResult {
    const [currentBlock, setCurrentBlock] = useState<bigint | null>(null);
    const [tick, setTick] = useState(0);

    const refreshBlock = useCallback(() => setTick((t) => t + 1), []);

    useEffect(() => {
        if (!provider) {
            setCurrentBlock(null);
            return;
        }

        let cancelled = false;

        async function fetch() {
            try {
                const block = await provider!.getBlockNumber();
                if (!cancelled) setCurrentBlock(BigInt(block));
            } catch {
                // silent — keep last known value
            }
        }

        fetch();
        const id = setInterval(fetch, pollIntervalMs);

        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [provider, pollIntervalMs, tick]);

    return { currentBlock, refreshBlock };
}
