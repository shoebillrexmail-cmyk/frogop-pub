import { useState } from 'react';
import { useWalletStore } from '../stores/walletStore';

type TabType = 'written' | 'purchased';

export function PortfolioPage() {
  const { connected } = useWalletStore();
  const [activeTab, setActiveTab] = useState<TabType>('written');

  const writtenOptions = [
    {
      id: '1',
      type: 'CALL',
      pool: 'MOTO/PILL',
      strike: '50',
      expiry: '864,000',
      amount: '100',
      premium: '200',
      status: 'OPEN',
    },
    {
      id: '2',
      type: 'PUT',
      pool: 'MOTO/PILL',
      strike: '40',
      expiry: '865,000',
      amount: '50',
      premium: '150',
      status: 'PURCHASED',
    },
  ];

  const purchasedOptions = [
    {
      id: '3',
      type: 'CALL',
      pool: 'MOTO/PILL',
      strike: '55',
      expiry: '864,500',
      amount: '200',
      premium: '300',
      status: 'PURCHASED',
    },
  ];

  if (!connected) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-bold text-terminal-text-primary mb-4">Portfolio</h1>
        <p className="text-terminal-text-secondary mb-8">
          Connect your wallet to view your options
        </p>
      </div>
    );
  }

  const options = activeTab === 'written' ? writtenOptions : purchasedOptions;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-terminal-text-primary mb-8">My Portfolio</h1>

      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setActiveTab('written')}
          className={`px-4 py-2 rounded-lg transition-colors font-mono ${
            activeTab === 'written'
              ? 'btn-primary'
              : 'btn-secondary'
          }`}
        >
          Written ({writtenOptions.length})
        </button>
        <button
          onClick={() => setActiveTab('purchased')}
          className={`px-4 py-2 rounded-lg transition-colors font-mono ${
            activeTab === 'purchased'
              ? 'btn-primary'
              : 'btn-secondary'
          }`}
        >
          Purchased ({purchasedOptions.length})
        </button>
      </div>

      <div className="grid gap-4">
        {options.length === 0 ? (
          <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-8 text-center">
            <p className="text-terminal-text-muted font-mono">
              No {activeTab} options found
            </p>
          </div>
        ) : (
          options.map((option) => (
            <div
              key={option.id}
              className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-6 flex items-center justify-between hover:border-terminal-border-hover transition-colors"
            >
              <div className="flex items-center gap-6">
                <span
                  className={`px-3 py-1 rounded text-sm font-mono font-medium ${
                    option.type === 'CALL' ? 'status-positive' : 'status-negative'
                  }`}
                >
                  {option.type}
                </span>
                <div>
                  <p className="text-terminal-text-primary font-medium">{option.pool}</p>
                  <p className="text-xs text-terminal-text-muted font-mono">Strike: {option.strike}</p>
                </div>
                <div className="text-sm">
                  <p className="text-terminal-text-muted font-mono text-xs">Amount</p>
                  <p className="text-terminal-text-primary font-mono">{option.amount}</p>
                </div>
                <div className="text-sm">
                  <p className="text-terminal-text-muted font-mono text-xs">Premium</p>
                  <p className="text-terminal-text-primary font-mono">{option.premium}</p>
                </div>
                <div className="text-sm">
                  <p className="text-terminal-text-muted font-mono text-xs">Expiry Block</p>
                  <p className="text-terminal-text-primary font-mono">{option.expiry}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span
                  className={`px-2 py-1 rounded text-xs font-mono ${
                    option.status === 'OPEN'
                      ? 'status-warning'
                      : option.status === 'PURCHASED'
                      ? 'status-positive'
                      : 'status-muted'
                  }`}
                >
                  {option.status}
                </span>
                {option.status === 'OPEN' && activeTab === 'written' && (
                  <button className="status-negative px-3 py-1 text-xs font-mono rounded hover:bg-red-500/30 transition-colors">
                    Cancel
                  </button>
                )}
                {option.status === 'PURCHASED' && activeTab === 'purchased' && (
                  <button className="status-positive px-3 py-1 text-xs font-mono rounded hover:bg-green-500/30 transition-colors">
                    Exercise
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
