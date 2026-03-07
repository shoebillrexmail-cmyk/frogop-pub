/**
 * useNextBlockEstimate — live countdown to the next block.
 *
 * Uses the block timestamp from WsBlockContext and ticks every 1s
 * to compute elapsed time and estimated time to next block.
 */
import { useState, useEffect, useMemo } from 'react';
import { useWsBlock } from './useWebSocketProvider.ts';
import { EXPECTED_BLOCK_INTERVAL_S } from '../config/index.ts';

export interface UseNextBlockEstimateResult {
    /** Seconds elapsed since the last block. */
    secondsSinceLastBlock: number;
    /** Estimated seconds until next block (clamped to 0). */
    estimatedSecondsToNext: number;
    /** Progress toward next block (0-100). Clamped at 100 when overdue. */
    progressPercent: number;
    /** Timestamp (ms) of the last block, or null if no block received yet. */
    lastBlockTimestamp: number | null;
}

export function useNextBlockEstimate(): UseNextBlockEstimateResult {
    const wsBlockInfo = useWsBlock();
    const [now, setNow] = useState(() => Date.now());

    // Extract last block timestamp (bigint ms → number ms)
    const lastBlockTimestamp = useMemo(() => {
        if (!wsBlockInfo) return null;
        return Number(wsBlockInfo.timestamp);
    }, [wsBlockInfo]);

    // Tick every 1s for countdown
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    const secondsSinceLastBlock = lastBlockTimestamp !== null
        ? Math.max(0, Math.floor((now - lastBlockTimestamp) / 1000))
        : 0;

    const estimatedSecondsToNext = lastBlockTimestamp !== null
        ? Math.max(0, EXPECTED_BLOCK_INTERVAL_S - secondsSinceLastBlock)
        : 0;

    const progressPercent = lastBlockTimestamp !== null
        ? Math.min(100, Math.round((secondsSinceLastBlock / EXPECTED_BLOCK_INTERVAL_S) * 100))
        : 0;

    return {
        secondsSinceLastBlock,
        estimatedSecondsToNext,
        progressPercent,
        lastBlockTimestamp,
    };
}
