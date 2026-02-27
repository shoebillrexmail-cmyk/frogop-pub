import { useWalletConnect } from '@btc-vision/walletconnect';

export function PortfolioPage() {
  const { walletAddress, openConnectModal } = useWalletConnect();

  if (!walletAddress) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-bold text-terminal-text-primary font-mono mb-4">
          Portfolio
        </h1>
        <p className="text-terminal-text-secondary mb-8 max-w-lg mx-auto">
          Connect your wallet to view your written and purchased options.
        </p>
        <button
          onClick={openConnectModal}
          className="btn-primary px-6 py-3 text-sm font-medium rounded-lg"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-16 text-center">
      <h1 className="text-3xl font-bold text-terminal-text-primary font-mono mb-4">
        Portfolio
      </h1>
      <p className="text-terminal-text-secondary mb-12 max-w-lg mx-auto">
        Track your written and purchased options in one place — coming soon.
      </p>

      <div className="max-w-xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6 mb-16">
        <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-6">
          <p className="text-2xl font-bold neon-orange font-mono mb-1">Written</p>
          <p className="text-terminal-text-muted text-sm">View options you've written, cancel before expiry, or let them settle</p>
        </div>
        <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-6">
          <p className="text-2xl font-bold neon-orange font-mono mb-1">Purchased</p>
          <p className="text-terminal-text-muted text-sm">Track options you've bought and exercise within the 144-block grace period</p>
        </div>
      </div>

      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-terminal-bg-elevated border border-terminal-border-subtle text-terminal-text-muted font-mono text-sm">
        <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
        Portfolio tracking in development
      </div>
    </div>
  );
}
