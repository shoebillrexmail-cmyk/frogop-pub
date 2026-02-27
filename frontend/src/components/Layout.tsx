import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { formatAddress } from '../config';

export function Layout() {
  const location = useLocation();
  const { walletAddress, connecting, openConnectModal, disconnect } = useWalletConnect();
  const connected = !!walletAddress;
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { path: '/', label: 'Home' },
    { path: '/pools', label: 'Pools' },
    { path: '/portfolio', label: 'Portfolio' },
    { path: '/about', label: 'About' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-terminal-bg-primary font-sans">
      <header className="bg-terminal-bg-elevated border-b border-terminal-border-subtle">
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
                className={`text-sm font-medium transition-colors font-mono ${
                  location.pathname === link.path
                    ? 'text-accent'
                    : 'text-[#a0a0a0] hover:text-accent'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
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
                onClick={() => setMenuOpen(false)}
                className={`py-2 text-sm font-medium font-mono transition-colors ${
                  location.pathname === link.path
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

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-terminal-bg-elevated border-t border-terminal-border-subtle py-8">
        <div className="max-w-7xl mx-auto px-4">
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
                href="https://github.com/shoebillrexmail-cmyk/"
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
              <span className="flex items-center gap-1.5 font-mono">
                Built on <img src="/opnet_logo.svg" alt="OPNet" className="h-4 inline-block" />
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
