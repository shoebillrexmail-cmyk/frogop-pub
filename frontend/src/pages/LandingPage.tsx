import { Link } from 'react-router-dom';

export function LandingPage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="border-b border-terminal-border-subtle">
        <div className="max-w-7xl mx-auto px-4 py-24 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-6 text-xs font-mono text-accent bg-accent/10 rounded-full border border-accent/30">
            Built on Bitcoin L1 via <img src="/opnet_logo.svg" alt="OPNet" className="h-3.5 inline-block" />
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-terminal-text-primary mb-6 leading-tight">
            Decentralized Options
            <br />
            <span className="neon-orange">on Bitcoin</span>
          </h1>
          <p className="text-xl text-terminal-text-secondary mb-8 max-w-2xl mx-auto">
            Write, trade, and exercise{' '}
            <span className="neon-green font-mono font-semibold">CALL</span> and{' '}
            <span className="neon-red font-mono font-semibold">PUT</span>{' '}
            options for any Bitcoin-native assets — trustlessly.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              to="/pools"
              className="btn-primary px-6 py-3 text-lg font-medium rounded-lg"
            >
              Launch App
            </Link>
            <Link
              to="/about"
              className="btn-secondary px-6 py-3 text-lg font-medium rounded-lg"
            >
              Read Docs
            </Link>
          </div>
        </div>
      </section>

      {/* What is FroGop */}
      <section className="border-b border-terminal-border-subtle">
        <div className="max-w-7xl mx-auto px-4 py-16">
          <h2 className="text-3xl font-bold text-terminal-text-primary text-center mb-4">
            What is FroGop?
          </h2>
          <p className="text-terminal-text-muted text-center mb-12 max-w-xl mx-auto text-sm font-mono">
            A peer-to-peer options protocol on Bitcoin L1
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="terminal-card rounded-xl p-6">
              <div className="text-2xl mb-3 font-mono neon-orange">01</div>
              <h3 className="text-lg font-semibold text-terminal-text-primary mb-2">
                No Oracle Dependency
              </h3>
              <p className="text-terminal-text-secondary text-sm leading-relaxed">
                Strike prices are token pair ratios. No external price feeds, no oracle manipulation risk.
              </p>
            </div>
            <div className="terminal-card rounded-xl p-6">
              <div className="text-2xl mb-3 font-mono neon-orange">02</div>
              <h3 className="text-lg font-semibold text-terminal-text-primary mb-2">
                Bitcoin-Native
              </h3>
              <p className="text-terminal-text-secondary text-sm leading-relaxed">
                Built on Bitcoin L1 using <img src="/opnet_logo.svg" alt="OPNet" className="h-3 inline-block mx-0.5" />. Works directly with OP20 tokens on Bitcoin.
              </p>
            </div>
            <div className="terminal-card rounded-xl p-6">
              <div className="text-2xl mb-3 font-mono neon-orange">03</div>
              <h3 className="text-lg font-semibold text-terminal-text-primary mb-2">
                Trustless Settlement
              </h3>
              <p className="text-terminal-text-secondary text-sm leading-relaxed">
                100% collateralized. Self-custodial. Your payout is guaranteed by tokens already locked in the contract.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How Options Work */}
      <section className="border-b border-terminal-border-subtle">
        <div className="max-w-7xl mx-auto px-4 py-16">
          <h2 className="text-3xl font-bold text-terminal-text-primary text-center mb-4">
            How Options Work
          </h2>
          <p className="text-terminal-text-muted text-center mb-12 max-w-xl mx-auto text-sm font-mono">
            Two types of options, one simple protocol
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {/* CALL Card */}
            <div className="glow-card-green rounded-xl p-8">
                <h3 className="text-xl font-semibold neon-green mb-2 font-mono">
                  CALL Option
                </h3>
                <p className="text-terminal-text-secondary mb-4 text-sm">
                  Right to BUY underlying at the strike price.
                </p>
                <ul className="space-y-2 text-terminal-text-secondary text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-status-positive mt-0.5 font-mono">›</span>
                    <span>Profit when underlying price exceeds strike price</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-status-positive mt-0.5 font-mono">›</span>
                    <span>Writer locks underlying tokens, receives premium</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-status-positive mt-0.5 font-mono">›</span>
                    <span>Buyer pays premium, can exercise when in-the-money</span>
                  </li>
                </ul>
            </div>

            {/* PUT Card */}
            <div className="glow-card-red rounded-xl p-8">
                <h3 className="text-xl font-semibold neon-red mb-2 font-mono">
                  PUT Option
                </h3>
                <p className="text-terminal-text-secondary mb-4 text-sm">
                  Right to SELL underlying at the strike price.
                </p>
                <ul className="space-y-2 text-terminal-text-secondary text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-status-negative mt-0.5 font-mono">›</span>
                    <span>Profit when underlying price falls below strike price</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-status-negative mt-0.5 font-mono">›</span>
                    <span>Writer locks strike value in premium tokens, receives premium</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-status-negative mt-0.5 font-mono">›</span>
                    <span>Buyer pays premium, can exercise when in-the-money</span>
                  </li>
                </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Why FroGop? */}
      <section className="border-b border-terminal-border-subtle">
        <div className="max-w-7xl mx-auto px-4 py-16">
          <h2 className="text-3xl font-bold text-terminal-text-primary text-center mb-4">
            Why FroGop?
          </h2>
          <p className="text-terminal-text-muted text-center mb-12 max-w-xl mx-auto text-sm font-mono">
            Benefits for writers and buyers
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="terminal-card rounded-xl p-6">
              <h3 className="text-lg font-semibold text-terminal-text-primary mb-4">
                Writers earn yield
              </h3>
              <p className="text-terminal-text-secondary text-sm leading-relaxed mb-4">
                Hold tokens and earn premiums by writing covered calls. Or write puts to buy tokens at your
                target price while getting paid to wait. You set the terms — strike, expiry, and premium.
              </p>
              <ul className="space-y-1.5 text-terminal-text-muted text-xs font-mono">
                <li>Cancel anytime — 1% fee before expiry, free after</li>
                <li>Premium goes to you immediately on purchase</li>
                <li>100% collateral returned if option expires unsold</li>
              </ul>
            </div>
            <div className="terminal-card rounded-xl p-6">
              <h3 className="text-lg font-semibold text-terminal-text-primary mb-4">
                Buyers control risk
              </h3>
              <p className="text-terminal-text-secondary text-sm leading-relaxed mb-4">
                Get leveraged exposure to token price moves with a known maximum loss — the premium.
                Or hedge existing positions with puts. Your payout is guaranteed by locked collateral.
              </p>
              <ul className="space-y-1.5 text-terminal-text-muted text-xs font-mono">
                <li>Max loss = premium paid (nothing more)</li>
                <li>144 blocks (~24h) grace period to exercise</li>
                <li>100% collateral already locked in contract</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Example Scenario */}
      <section className="border-b border-terminal-border-subtle">
        <div className="max-w-7xl mx-auto px-4 py-16">
          <h2 className="text-3xl font-bold text-terminal-text-primary text-center mb-4">
            See It in Action
          </h2>
          <p className="text-terminal-text-muted text-center mb-8 max-w-xl mx-auto text-sm font-mono">
            A covered call example with real numbers
          </p>
          <div className="max-w-2xl mx-auto terminal-card rounded-xl p-6">
            <div className="space-y-4 text-sm text-terminal-text-secondary">
              <div className="flex items-start gap-3">
                <span className="text-accent font-mono font-bold shrink-0">01</span>
                <p>
                  Alice holds <span className="font-mono text-terminal-text-primary">100 MOTO</span> and wants to earn yield.
                  She writes a <span className="neon-green font-mono">CALL</span> option: strike{' '}
                  <span className="font-mono text-accent">50 PILL/MOTO</span>, premium{' '}
                  <span className="font-mono text-accent">5 PILL/MOTO</span>, expiry in ~30 days.
                  Her 100 MOTO are locked as collateral.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-accent font-mono font-bold shrink-0">02</span>
                <p>
                  Bob thinks MOTO will rise. He buys Alice&apos;s option for{' '}
                  <span className="font-mono text-terminal-text-primary">505 PILL</span> (500 premium + 5 protocol fee).
                  Alice receives the full 500 PILL.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-accent font-mono font-bold shrink-0">03</span>
                <div>
                  <p className="mb-2">At expiry, two outcomes:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-terminal-bg-primary rounded-lg p-3">
                      <p className="text-xs font-mono text-status-positive mb-1">MOTO = 70 PILL</p>
                      <p className="text-xs">Bob exercises. Pays 5,000 PILL, gets 99.9 MOTO (0.1% exercise fee).</p>
                      <p className="text-xs mt-1">Bob profit: <span className="font-mono text-status-positive">~+1,488 PILL</span></p>
                    </div>
                    <div className="bg-terminal-bg-primary rounded-lg p-3">
                      <p className="text-xs font-mono text-status-negative mb-1">MOTO = 40 PILL</p>
                      <p className="text-xs">Bob lets it expire. Loses premium only.</p>
                      <p className="text-xs mt-1">Bob loss: <span className="font-mono text-status-negative">-500 PILL</span></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - Protocol Flow */}
      <section className="border-b border-terminal-border-subtle">
        <div className="max-w-7xl mx-auto px-4 py-16">
          <h2 className="text-3xl font-bold text-terminal-text-primary text-center mb-4">
            Protocol Flow
          </h2>
          <p className="text-terminal-text-muted text-center mb-12 max-w-xl mx-auto text-sm font-mono">
            Four steps from pool creation to settlement
          </p>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="terminal-card rounded-xl p-5 text-center">
              <div className="text-sm font-mono text-accent mb-2">01</div>
              <h4 className="text-sm font-semibold text-terminal-text-primary mb-1">Create Pool</h4>
              <p className="text-xs text-terminal-text-muted">
                Deploy a pool for any OP20 token pair
              </p>
            </div>
            <div className="terminal-card rounded-xl p-5 text-center">
              <div className="text-sm font-mono text-accent mb-2">02</div>
              <h4 className="text-sm font-semibold text-terminal-text-primary mb-1">Write Option</h4>
              <p className="text-xs text-terminal-text-muted">
                Lock 100% collateral, set strike and expiry
              </p>
            </div>
            <div className="terminal-card rounded-xl p-5 text-center">
              <div className="text-sm font-mono text-accent mb-2">03</div>
              <h4 className="text-sm font-semibold text-terminal-text-primary mb-1">Buy Option</h4>
              <p className="text-xs text-terminal-text-muted">
                Pay premium to writer, become the holder
              </p>
            </div>
            <div className="terminal-card rounded-xl p-5 text-center">
              <div className="text-sm font-mono text-accent mb-2">04</div>
              <h4 className="text-sm font-semibold text-terminal-text-primary mb-1">Exercise / Settle</h4>
              <p className="text-xs text-terminal-text-muted">
                Exercise within 144 blocks (~24h) or settle
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Fees at a Glance */}
      <section className="border-b border-terminal-border-subtle">
        <div className="max-w-7xl mx-auto px-4 py-16">
          <h2 className="text-3xl font-bold text-terminal-text-primary text-center mb-4">
            Fees
          </h2>
          <p className="text-terminal-text-muted text-center mb-8 max-w-xl mx-auto text-sm font-mono">
            Transparent and minimal
          </p>
          <div className="max-w-2xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="terminal-card rounded-xl p-4 text-center">
              <p className="text-xs text-terminal-text-muted mb-1 font-mono">Write</p>
              <p className="text-lg font-bold text-status-positive">Free</p>
            </div>
            <div className="terminal-card rounded-xl p-4 text-center">
              <p className="text-xs text-terminal-text-muted mb-1 font-mono">Buy</p>
              <p className="text-lg font-bold text-accent">1%</p>
              <p className="text-[10px] text-terminal-text-muted mt-0.5">of premium</p>
            </div>
            <div className="terminal-card rounded-xl p-4 text-center">
              <p className="text-xs text-terminal-text-muted mb-1 font-mono">Exercise</p>
              <p className="text-lg font-bold text-accent">0.1%</p>
              <p className="text-[10px] text-terminal-text-muted mt-0.5">of payout</p>
            </div>
            <div className="terminal-card rounded-xl p-4 text-center">
              <p className="text-xs text-terminal-text-muted mb-1 font-mono">Cancel</p>
              <p className="text-lg font-bold text-accent">1%</p>
              <p className="text-[10px] text-terminal-text-muted mt-0.5">before expiry only</p>
            </div>
          </div>
          <p className="text-center mt-4">
            <Link to="/about#fees" className="text-xs font-mono text-accent hover:underline">
              Full fee breakdown &rarr;
            </Link>
          </p>
        </div>
      </section>

      {/* Roadmap */}
      <section className="border-b border-terminal-border-subtle">
        <div className="max-w-7xl mx-auto px-4 py-16">
          <h2 className="text-3xl font-bold text-terminal-text-primary text-center mb-12">
            Roadmap
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {/* Phase 1 */}
            <div className="terminal-card rounded-xl p-6 !border-2 !border-accent" style={{ boxShadow: '0 0 25px #F7931A10' }}>
              <div className="flex items-center gap-2 mb-4">
                <span className="px-2 py-0.5 text-xs font-mono font-bold bg-accent text-terminal-bg-primary rounded">
                  PHASE 1
                </span>
                <span className="text-xs font-mono text-accent">IN PROGRESS</span>
              </div>
              <h3 className="text-lg font-semibold text-terminal-text-primary mb-2">
                MVP — Core Options
              </h3>
              <p className="text-xs text-terminal-text-muted mb-3">
                P2P options for any OP20 token pair. Write, buy, exercise, cancel.
              </p>
              <ul className="space-y-2 text-sm text-terminal-text-secondary font-mono">
                <li className="flex items-center gap-2">
                  <span className="text-status-positive">✓</span> P2P options with OP20 tokens
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-status-positive">✓</span> CALL and PUT options
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-status-positive">✓</span> Token-pair strikes (no oracle)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-status-positive">✓</span> 100% collateralization
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-status-positive">✓</span> Integration tests passing
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-status-warning">⟳</span> Frontend MVP
                </li>
              </ul>
            </div>

            {/* Phase 2 */}
            <div className="terminal-card rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="px-2 py-0.5 text-xs font-mono font-bold bg-terminal-text-muted text-terminal-bg-primary rounded">
                  PHASE 2
                </span>
                <span className="text-xs font-mono text-terminal-text-muted">PLANNED</span>
              </div>
              <h3 className="text-lg font-semibold text-terminal-text-primary mb-2">
                NativeSwap Integration
              </h3>
              <p className="text-xs text-terminal-text-muted mb-3">
                Pay premiums in native BTC. No need to acquire tokens first.
              </p>
              <ul className="space-y-2 text-sm text-terminal-text-secondary font-mono">
                <li className="flex items-center gap-2">
                  <span className="text-terminal-text-muted">○</span> BTC premiums
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-terminal-text-muted">○</span> BTC-denominated strikes
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-terminal-text-muted">○</span> On-chain price data
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-terminal-text-muted">○</span> Flash loan protection
                </li>
              </ul>
            </div>

            {/* Phase 3 */}
            <div className="terminal-card rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="px-2 py-0.5 text-xs font-mono font-bold bg-terminal-text-muted text-terminal-bg-primary rounded">
                  PHASE 3
                </span>
                <span className="text-xs font-mono text-terminal-text-muted">FUTURE</span>
              </div>
              <h3 className="text-lg font-semibold text-terminal-text-primary mb-2">
                AMM Liquidity Pools
              </h3>
              <p className="text-xs text-terminal-text-muted mb-3">
                Instant trading, LP rewards, automated pricing. No waiting for a counterparty.
              </p>
              <ul className="space-y-2 text-sm text-terminal-text-secondary font-mono">
                <li className="flex items-center gap-2">
                  <span className="text-terminal-text-muted">○</span> Instant option buying
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-terminal-text-muted">○</span> LP tokens & rewards
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-terminal-text-muted">○</span> Automated pricing
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-terminal-text-muted">○</span> Trading fees for LPs
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Risk Note */}
      <section className="border-b border-terminal-border-subtle">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-xs text-terminal-text-muted leading-relaxed">
              Options trading involves risk. Buyers can lose their entire premium. Writers face
              assignment risk if the option is exercised against them. Only trade with funds you
              can afford to lose. Read the{' '}
              <Link to="/about" className="text-accent hover:underline">full documentation</Link>{' '}
              before trading.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <img
            src="/frogop_512.png"
            alt="FroGop"
            className="w-24 h-24 mx-auto mb-6 opacity-80"
          />
          <h2 className="text-3xl font-bold text-terminal-text-primary mb-4">
            Ready to Trade Options?
          </h2>
          <p className="text-terminal-text-secondary mb-8 max-w-xl mx-auto">
            Connect your wallet and start trading trustless options on Bitcoin.
          </p>
          <Link
            to="/pools"
            className="btn-primary inline-block px-8 py-4 text-lg font-medium rounded-lg"
          >
            Explore Pools
          </Link>
        </div>
      </section>
    </div>
  );
}
