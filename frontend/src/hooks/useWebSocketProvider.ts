/**
 * useWebSocketProvider — manages a single WebSocketRpcProvider for the app.
 *
 * Connects on mount, subscribes to blocks, and exposes connection state +
 * current block number via React context. Pages call useWsBlock() to get
 * the latest block without needing to prop-drill.
 */
import { createContext, useContext, useState, useEffect, useRef } from 'react';
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
// Context for sharing WS block across the app
// ---------------------------------------------------------------------------
const WsBlockContext = createContext<bigint | null>(null);

/** Read the latest WS block number from context. Returns null if WS is unavailable. */
export function useWsBlock(): bigint | null {
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
    currentBlock: bigint | null;
    latestBlockHash: string | null;
}

export function useWebSocketProvider(): UseWebSocketProviderResult {
    const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
    const [currentBlock, setCurrentBlock] = useState<bigint | null>(null);
    const [latestBlockHash, setLatestBlockHash] = useState<string | null>(null);
    const providerRef = useRef<WebSocketRpcProvider | null>(null);

    useEffect(() => {
        if (!wsUrl) return;

        const provider = new WebSocketRpcProvider({
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

        providerRef.current = provider;

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
                    setCurrentBlock(notification.blockNumber);
                    setLatestBlockHash(notification.blockHash);
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
            providerRef.current = null;
        };
    }, []); // single instance for app lifetime

    const connected = connectionState === ConnectionState.READY;

    return {
        wsProvider: providerRef.current,
        connectionState,
        connected,
        currentBlock,
        latestBlockHash,
    };
}
