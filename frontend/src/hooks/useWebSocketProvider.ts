/**
 * useWebSocketProvider — manages a single WebSocketRpcProvider for the app.
 *
 * Connects on mount, subscribes to blocks, and exposes connection state +
 * current block number via React context. Pages call useWsBlock() to get
 * the latest block without needing to prop-drill.
 */
import { createContext, useContext, useState, useEffect } from 'react';
import {
    WebSocketRpcProvider,
    ConnectionState,
    WebSocketClientEvent,
} from 'opnet';
import type { BlockNotification } from 'opnet';
import { currentNetwork } from '../config/index.ts';

const WS_URLS: Record<string, string> = {
    regtest: 'wss://regtest.opnet.org/ws',
    testnet: 'wss://testnet.opnet.org/ws',
    mainnet: 'wss://mainnet.opnet.org/ws',
};

const wsUrl = import.meta.env.VITE_OPNET_WS_URL || WS_URLS[currentNetwork] || '';

// ---------------------------------------------------------------------------
// Context for sharing WS block info across the app
// ---------------------------------------------------------------------------
export interface WsBlockInfo {
    readonly blockNumber: bigint;
    readonly timestamp: bigint;
    readonly blockHash: string;
}

const WsBlockContext = createContext<WsBlockInfo | null>(null);

/** Read the latest WS block info from context. Returns null if WS is unavailable. */
export function useWsBlock(): WsBlockInfo | null {
    return useContext(WsBlockContext);
}

export { WsBlockContext };

// ---------------------------------------------------------------------------
// Hook — called once in Layout
// ---------------------------------------------------------------------------
export interface UseWebSocketProviderResult {
    wsProvider: WebSocketRpcProvider | null;
    connectionState: ConnectionState;
    connected: boolean;
    wsBlockInfo: WsBlockInfo | null;
}

export function useWebSocketProvider(): UseWebSocketProviderResult {
    const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
    const [wsBlockInfo, setWsBlockInfo] = useState<WsBlockInfo | null>(null);

    // Create provider once via lazy state initializer (avoids synchronous
    // setState inside useEffect, which the react-hooks/set-state-in-effect
    // rule forbids).
    const [wsProvider] = useState<WebSocketRpcProvider | null>(() => {
        if (!wsUrl) return null;
        return new WebSocketRpcProvider({
            url: wsUrl,
            network: currentNetwork as never,
            websocketConfig: {
                autoReconnect: true,
                maxReconnectAttempts: 20,
                reconnectBaseDelay: 2000,
                reconnectMaxDelay: 60000,
                pingInterval: 30000,
            },
        });
    });

    useEffect(() => {
        if (!wsProvider) return;
        // Local alias so TS narrows to non-null across callbacks
        const provider = wsProvider;

        function onConnected() {
            setConnectionState(ConnectionState.READY);
        }
        function onDisconnected() {
            setConnectionState(ConnectionState.DISCONNECTED);
        }
        function onError() {
            setConnectionState(provider.getState());
        }

        provider.on(WebSocketClientEvent.CONNECTED, onConnected);
        provider.on(WebSocketClientEvent.DISCONNECTED, onDisconnected);
        provider.on(WebSocketClientEvent.ERROR, onError);

        async function init() {
            try {
                setConnectionState(ConnectionState.CONNECTING);
                await provider.connect();

                await provider.subscribeBlocks((notification: BlockNotification) => {
                    setWsBlockInfo({
                        blockNumber: notification.blockNumber,
                        timestamp: notification.timestamp,
                        blockHash: notification.blockHash,
                    });
                });
            } catch (err) {
                console.warn('[ws] Connection failed:', err instanceof Error ? err.message : err);
                setConnectionState(ConnectionState.DISCONNECTED);
            }
        }

        void init();

        return () => {
            provider.off(WebSocketClientEvent.CONNECTED, onConnected);
            provider.off(WebSocketClientEvent.DISCONNECTED, onDisconnected);
            provider.off(WebSocketClientEvent.ERROR, onError);
            provider.disconnect();
        };
    }, [wsProvider]); // single instance for app lifetime

    const connected = connectionState === ConnectionState.READY;

    return {
        wsProvider,
        connectionState,
        connected,
        wsBlockInfo,
    };
}
