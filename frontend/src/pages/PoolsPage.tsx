export function PoolsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-16 text-center">
      <h1 className="text-3xl font-bold text-terminal-text-primary font-mono mb-4">
        Option Pools
      </h1>
      <p className="text-terminal-text-secondary mb-12 max-w-lg mx-auto">
        Browse pools, write options, and trade — coming soon.
      </p>

      <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16">
        <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-6">
          <p className="text-2xl font-bold neon-orange font-mono mb-1">Write</p>
          <p className="text-terminal-text-muted text-sm">Lock collateral and create a CALL or PUT option</p>
        </div>
        <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-6">
          <p className="text-2xl font-bold neon-orange font-mono mb-1">Buy</p>
          <p className="text-terminal-text-muted text-sm">Purchase open options and pay the premium</p>
        </div>
        <div className="bg-terminal-bg-elevated border border-terminal-border-subtle rounded-xl p-6">
          <p className="text-2xl font-bold neon-orange font-mono mb-1">Exercise</p>
          <p className="text-terminal-text-muted text-sm">Claim your payout within the grace period</p>
        </div>
      </div>

      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-terminal-bg-elevated border border-terminal-border-subtle text-terminal-text-muted font-mono text-sm">
        <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
        Trading interface in development
      </div>
    </div>
  );
}
