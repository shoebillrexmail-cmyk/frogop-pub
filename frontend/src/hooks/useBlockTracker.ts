/**
 * useBlockTracker — provides the current block number.
 *
 * Primary: uses WebSocket block from useWebSocketProvider (real-time).
 * Fallback: polls provider.getBlockNumber() every 15s when WS is unavailable.
 */
import { useState, useEffect, useCallback } from 'react';
import type { AbstractRpcProvider } from 'opnet';

export interface UseBlockTrackerResult {
    currentBlock: bigint | null;
    refreshBlock: () => void;
}

export function useBlockTracker(
    provider: AbstractRpcProvider | null,
    wsBlock?: bigint | null,
    pollIntervalMs = 15_000,
): UseBlockTrackerResult {
    const [polledBlock, setPolledBlock] = useState<bigint | null>(null);
    const [tick, setTick] = useState(0);

    const refreshBlock = useCallback(() => setTick((t) => t + 1), []);

    // If WS provides a block, use it directly — no polling needed
    const hasWsBlock = wsBlock !== undefined && wsBlock !== null;

    useEffect(() => {
        // Skip polling when WS is providing blocks
        if (hasWsBlock || !provider) {
            return;
        }

        let cancelled = false;

        async function fetch() {
            try {
                const block = await provider!.getBlockNumber();
                if (!cancelled) setPolledBlock(BigInt(block));
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
    }, [provider, pollIntervalMs, tick, hasWsBlock]);

    const currentBlock = hasWsBlock ? wsBlock : polledBlock;

    return { currentBlock, refreshBlock };
}
