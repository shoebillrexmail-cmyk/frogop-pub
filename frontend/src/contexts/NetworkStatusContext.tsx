/**
 * NetworkStatusProvider — aggregates gas, mempool, and block timing data.
 *
 * Composes useGasParameters, useMempoolInfo, and useNextBlockEstimate
 * into a single context for app-wide consumption.
 */
import { useMemo, type ReactNode } from 'react';
import type { AbstractRpcProvider } from 'opnet';
import { NetworkStatusContext } from './networkStatusDefs.ts';
import type { NetworkStatusContextValue } from './networkStatusDefs.ts';
import { useGasParameters } from '../hooks/useGasParameters.ts';
import { useMempoolInfo } from '../hooks/useMempoolInfo.ts';
import { useNextBlockEstimate } from '../hooks/useNextBlockEstimate.ts';
import { useWsBlock } from '../hooks/useWebSocketProvider.ts';

interface NetworkStatusProviderProps {
    children: ReactNode;
    provider: AbstractRpcProvider | null;
    wsConnected: boolean;
}

export function NetworkStatusProvider({ children, provider, wsConnected }: NetworkStatusProviderProps) {
    const wsBlockInfo = useWsBlock();
    const { gasParams } = useGasParameters(provider);
    const { mempoolInfo } = useMempoolInfo(provider);
    const { secondsSinceLastBlock, estimatedSecondsToNext, progressPercent, lastBlockTimestamp } =
        useNextBlockEstimate();

    const btcFees = useMemo(() => {
        if (!gasParams?.bitcoin?.recommended) return null;
        const { low, medium, high } = gasParams.bitcoin.recommended;
        return { low, medium, high };
    }, [gasParams]);

    const value = useMemo<NetworkStatusContextValue>(() => ({
        gasParams,
        btcFees,
        mempoolInfo,
        secondsSinceLastBlock,
        estimatedSecondsToNext,
        progressPercent,
        lastBlockTimestamp,
        wsConnected,
        blockNumber: wsBlockInfo?.blockNumber ?? null,
    }), [
        gasParams, btcFees, mempoolInfo,
        secondsSinceLastBlock, estimatedSecondsToNext, progressPercent, lastBlockTimestamp,
        wsConnected, wsBlockInfo,
    ]);

    return (
        <NetworkStatusContext.Provider value={value}>
            {children}
        </NetworkStatusContext.Provider>
    );
}
