/**
 * Network status types and context definition.
 *
 * Separated from the provider component for React Fast Refresh compliance.
 */
import { createContext } from 'react';
import type { BlockGasParameters, MempoolInfo } from 'opnet';

export interface NetworkStatusContextValue {
    /** Full gas parameters from the provider. */
    readonly gasParams: BlockGasParameters | null;
    /** BTC fee estimates (sat/vB). */
    readonly btcFees: { low: number; medium: number; high: number } | null;
    /** Mempool statistics. */
    readonly mempoolInfo: MempoolInfo | null;
    /** Seconds elapsed since the last block. */
    readonly secondsSinceLastBlock: number;
    /** Estimated seconds until next block. */
    readonly estimatedSecondsToNext: number;
    /** Progress toward next block (0-100). */
    readonly progressPercent: number;
    /** Timestamp (ms) of the last block. */
    readonly lastBlockTimestamp: number | null;
    /** Whether the WebSocket connection is active. */
    readonly wsConnected: boolean;
    /** Current block number. */
    readonly blockNumber: bigint | null;
}

export const NetworkStatusContext = createContext<NetworkStatusContextValue | null>(null);
