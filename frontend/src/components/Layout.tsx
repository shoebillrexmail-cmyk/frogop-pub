import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { formatAddress } from '../config';
import { ErrorBoundary } from './ErrorBoundary';
import { NetworkMismatchBanner } from './NetworkMismatchBanner';
import { TransactionToast } from './TransactionToast';
import { TransactionDetailModal } from './TransactionDetailModal';
import { NetworkStatusBar } from './NetworkStatusBar';
import { useTransactionPoller } from '../hooks/useTransactionPoller';
import { useTransactionContext } from '../hooks/useTransactionContext';
import { useWebSocketProvider, WsBlockContext } from '../hooks/useWebSocketProvider';
import { useFallbackProvider } from '../hooks/useFallbackProvider';
import { NetworkStatusProvider } from '../contexts/NetworkStatusContext';

export function Layout() {
  const location = useLocation();
  const { walletAddress, connecting, openConnectModal, disconnect, provider } = useWalletConnect();
  const connected = !!walletAddress;
  const [menuOpen, setMenuOpen] = useState(false);
  const { reopenRequest, clearReopenRequest } = useTransactionContext();

  // Read-only RPC provider (wallet when connected, fallback JSONRpc otherwise)
  const readProvider = useFallbackProvider();

  // WebSocket provider for real-time block subscriptions
  const { connected: wsConnected, wsBlockInfo } = useWebSocketProvider();

  // TX receipt checks — triggered by WS block events, falls back to 15s polling
  useTransactionPoller(provider ?? null, wsBlockInfo?.blockNumber);

  const navLinks = [
    { path: '/', label: 'Home', testId: 'nav-home' },
    { path: '/trade', label: 'Trade', testId: 'nav-trade' },
    { path: '/chain', label: 'Chain', testId: 'nav-chain' },
    { path: '/portfolio', label: 'Portfolio', testId: 'nav-portfolio' },
    { path: '/transactions', label: 'History', testId: 'nav-history' },
    { path: '/about', label: 'About', testId: 'nav-about' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-terminal-bg-primary font-sans">
      <header className="bg-terminal-bg-elevated border-b border-terminal-border-subtle relative">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="/frogop_512.png" alt="FroGop" className="h-20 w-20" />
            <span className="text-xl font-bold neon-orange font-mono">FroGop</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                data-testid={link.testId}
                className={`text-sm font-medium transition-colors font-mono ${
                  (link.path === '/' ? location.pathname === '/' : location.pathname.startsWith(link.path))
                    ? 'text-accent'
                    : 'text-[#a0a0a0] hover:text-accent'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {/* Transaction pill — inline, left of wallet */}
            <TransactionToast />

            {/* Wallet button */}
            {connected && walletAddress ? (
              <div className="flex items-center gap-2">
                <span className="hidden sm:block text-sm text-terminal-text-muted font-mono">
                  {formatAddress(walletAddress)}
                </span>
                <button
                  onClick={disconnect}
                  className="btn-secondary px-3 py-1.5 text-sm rounded-lg"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={openConnectModal}
                disabled={connecting}
                className="btn-primary px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50"
              >
                {connecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}

            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="md:hidden flex flex-col justify-center items-center w-9 h-9 gap-1.5 border border-[#444] rounded-lg"
              aria-label="Toggle menu"
            >
              <span className={`block w-5 h-0.5 bg-[#e5e5e5] transition-transform duration-200 ${menuOpen ? 'translate-y-2 rotate-45' : ''}`} />
              <span className={`block w-5 h-0.5 bg-[#e5e5e5] transition-opacity duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`block w-5 h-0.5 bg-[#e5e5e5] transition-transform duration-200 ${menuOpen ? '-translate-y-2 -rotate-45' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <nav className="md:hidden border-t border-terminal-border-subtle px-4 py-3 flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                data-testid={`mobile-${link.testId}`}
                onClick={() => setMenuOpen(false)}
                className={`py-2 text-sm font-medium font-mono transition-colors ${
                  (link.path === '/' ? location.pathname === '/' : location.pathname.startsWith(link.path))
                    ? 'text-accent'
                    : 'text-[#a0a0a0] hover:text-accent'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <NetworkMismatchBanner />

      <NetworkStatusProvider provider={readProvider} wsConnected={wsConnected}>
        <main className="flex-1">
          <WsBlockContext.Provider value={wsBlockInfo}>
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </WsBlockContext.Provider>
        </main>
        {reopenRequest && (
          <TransactionDetailModal tx={reopenRequest.tx} onClose={clearReopenRequest} />
        )}

        <footer className="bg-terminal-bg-elevated border-t border-terminal-border-subtle">
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <img src="/frogop_512.png" alt="FroGop" className="h-12 w-12" />
                <span className="text-sm text-terminal-text-muted font-mono">
                  FroGop — Decentralized Options on Bitcoin
                </span>
              </div>
              <div className="flex items-center gap-6 text-sm text-terminal-text-muted">
                <Link to="/about" className="hover:text-terminal-text-primary transition-colors">
                  About
                </Link>
                <a
                  href="https://github.com/shoebillrexmail-cmyk/frogop-pub"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-terminal-text-primary transition-colors"
                >
                  GitHub
                </a>
                <a
                  href="https://x.com/frogop_opnet"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-terminal-text-primary transition-colors"
                >
                  X / Twitter
                </a>
                <button
                  onClick={() => {
                    try { localStorage.removeItem('frogop_onboarding_complete'); } catch { /* noop */ }
                    window.location.href = '/trade';
                  }}
                  className="hover:text-terminal-text-primary transition-colors"
                  data-testid="show-tutorial"
                >
                  Show Tutorial
                </button>
                <span className="flex items-center gap-1.5 font-mono">
                  Built on <img src="/opnet_logo.svg" alt="OPNet" className="h-4 inline-block" />
                </span>
              </div>
            </div>
          </div>
          <div className="border-t border-terminal-border-subtle">
            <div className="max-w-7xl mx-auto">
              <NetworkStatusBar />
            </div>
          </div>
        </footer>
      </NetworkStatusProvider>
    </div>
  );
}
