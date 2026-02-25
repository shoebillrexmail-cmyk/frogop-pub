import { useState } from 'react';
import { useWalletStore } from '../stores/walletStore';

export function PoolsPage() {
  const { connected } = useWalletStore();
  const [searchTerm, setSearchTerm] = useState('');

  // Mock data - will be replaced with real data from contract
  const pools = [
    {
      address: 'opr1sqztwf...',
      underlying: 'MOTO',
      premiumToken: 'PILL',
      optionCount: 12,
      tvl: '1,234,567',
    },
    {
      address: 'opr1sqpct4...',
      underlying: 'ODYS',
      premiumToken: 'MOTO',
      optionCount: 5,
      tvl: '567,890',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-terminal-text-primary font-mono">
            Option Pools
          </h1>
          <p className="text-terminal-text-secondary mt-2">
            Browse and trade options in available pools
          </p>
        </div>
        <button className="btn-primary px-4 py-2 rounded-lg">
          + Create Pool
        </button>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search pools by token..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input-terminal w-full px-4 py-3 rounded-lg font-mono text-sm"
        />
      </div>

      <div className="bg-terminal-bg-elevated border border-terminal-border-default rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-terminal-border-default">
              <th className="text-left px-6 py-4 text-terminal-text-muted font-medium font-mono text-xs uppercase tracking-wider">Pool</th>
              <th className="text-left px-6 py-4 text-terminal-text-muted font-medium font-mono text-xs uppercase tracking-wider">Underlying</th>
              <th className="text-left px-6 py-4 text-terminal-text-muted font-medium font-mono text-xs uppercase tracking-wider">Premium Token</th>
              <th className="text-right px-6 py-4 text-terminal-text-muted font-medium font-mono text-xs uppercase tracking-wider">Options</th>
              <th className="text-right px-6 py-4 text-terminal-text-muted font-medium font-mono text-xs uppercase tracking-wider">TVL</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody>
            {pools.map((pool, index) => (
              <tr
                key={index}
                className="border-b border-terminal-border-subtle hover:bg-terminal-bg-accent transition-colors"
              >
                <td className="px-6 py-4 font-mono text-sm text-terminal-text-secondary">
                  {pool.address}
                </td>
                <td className="px-6 py-4 font-medium text-terminal-text-primary">
                  {pool.underlying}
                </td>
                <td className="px-6 py-4 font-medium text-terminal-text-primary">
                  {pool.premiumToken}
                </td>
                <td className="px-6 py-4 text-right text-terminal-text-secondary font-mono">
                  {pool.optionCount}
                </td>
                <td className="px-6 py-4 text-right text-terminal-text-secondary font-mono">
                  {pool.tvl}
                </td>
                <td className="px-6 py-4">
                  <button className="btn-secondary px-3 py-1.5 text-xs rounded">
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!connected && (
        <div className="mt-8 text-center p-8 bg-terminal-bg-elevated border border-terminal-border-default rounded-xl">
          <p className="text-terminal-text-muted font-mono text-sm">
            Connect your wallet to see available options and trade
          </p>
        </div>
      )}
    </div>
  );
}
