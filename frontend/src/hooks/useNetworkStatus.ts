/**
 * useNetworkStatus — consumer hook for NetworkStatusContext.
 *
 * Throws if used outside of NetworkStatusProvider.
 */
import { useContext } from 'react';
import { NetworkStatusContext } from '../contexts/networkStatusDefs.ts';
import type { NetworkStatusContextValue } from '../contexts/networkStatusDefs.ts';

export function useNetworkStatus(): NetworkStatusContextValue {
    const ctx = useContext(NetworkStatusContext);
    if (!ctx) {
        throw new Error('useNetworkStatus must be used within a NetworkStatusProvider');
    }
    return ctx;
}
