import { useState } from 'react';
import { Link } from 'react-router-dom';

function FaqItem({ question, answer }: { question: string; answer: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="terminal-card rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-terminal-bg-secondary transition-colors"
      >
        <span className="text-terminal-text-primary font-medium text-sm">{question}</span>
        <span className="text-accent font-mono shrink-0">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-terminal-text-secondary leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
}

export function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold text-terminal-text-primary mb-2">About FroGop</h1>
      <div className="neon-divider-orange mb-8" />

      {/* What is FroGop? */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-terminal-text-primary mb-4">What is FroGop?</h2>
        <p className="text-terminal-text-secondary leading-relaxed mb-4">
          FroGop is a decentralized options protocol built directly on Bitcoin. It lets anyone
          write, buy, and exercise <span className="neon-green font-mono font-medium">CALL</span> and{' '}
          <span className="neon-red font-mono font-medium">PUT</span> options for any Bitcoin-native
          token — without middlemen, without oracles, and without giving up custody of your assets.
        </p>
        <p className="text-terminal-text-secondary leading-relaxed mb-4">
          Instead of relying on external price feeds that can be manipulated, FroGop expresses strike
          prices as simple token pair ratios (e.g., <span className="font-mono text-accent">50 PILL per 1 MOTO</span>).
          Writers and buyers agree on the terms directly. The smart contract enforces everything —
          collateral is locked, premiums are transferred, and settlement happens automatically.
        </p>
        <p className="text-terminal-text-secondary leading-relaxed">
          All collateral is 100% locked in the smart contract at all times. There is no counterparty risk.
          If you buy an option and it&apos;s profitable at expiry, your payout is guaranteed — the tokens
          are already sitting in the contract waiting for you.
        </p>
      </section>

      {/* What is OPNet? */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-terminal-text-primary mb-4">What is OPNet?</h2>
        <p className="text-terminal-text-secondary leading-relaxed mb-4">
          <a href="https://opnet.org" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">OPNet</a> is
          a smart contract platform that runs directly on Bitcoin Layer 1. Unlike sidechains or rollups,
          OPNet transactions are real Bitcoin transactions — your assets never leave the Bitcoin blockchain.
        </p>
        <p className="text-terminal-text-secondary leading-relaxed">
          OPNet uses a token standard called <span className="font-mono text-accent">OP20</span> (similar
          to ERC-20 on Ethereum). Any OP20 token can be used with FroGop — you can create an options pool
          for any token pair. FroGop uses quantum-resistant ML-DSA signatures for all operations,
          matching OPNet&apos;s security standards.
        </p>
      </section>

      {/* How Options Work — Detailed */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-terminal-text-primary mb-6">How Options Work</h2>

        <p className="text-terminal-text-secondary leading-relaxed mb-6">
          An option is a contract that gives the buyer the <em>right</em> (but not the obligation) to buy or
          sell a token at a pre-agreed price. The seller (called the &ldquo;writer&rdquo;) earns a fee (called the
          &ldquo;premium&rdquo;) in exchange for taking on that obligation.
        </p>

        {/* Option Types */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="glow-card-green rounded-xl p-6">
            <h3 className="text-lg font-semibold neon-green mb-2 font-mono">CALL Option</h3>
            <p className="text-terminal-text-secondary text-sm mb-3">
              The right to <strong>buy</strong> the underlying token at the strike price.
            </p>
            <ul className="space-y-1.5 text-terminal-text-secondary text-sm">
              <li className="flex items-start gap-2">
                <span className="text-status-positive mt-0.5 font-mono">›</span>
                <span>Profitable when the token&apos;s value rises above the strike price</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-status-positive mt-0.5 font-mono">›</span>
                <span>Writer locks the underlying tokens as collateral</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-status-positive mt-0.5 font-mono">›</span>
                <span>Buyer&apos;s max loss = the premium paid</span>
              </li>
            </ul>
          </div>
          <div className="glow-card-red rounded-xl p-6">
            <h3 className="text-lg font-semibold neon-red mb-2 font-mono">PUT Option</h3>
            <p className="text-terminal-text-secondary text-sm mb-3">
              The right to <strong>sell</strong> the underlying token at the strike price.
            </p>
            <ul className="space-y-1.5 text-terminal-text-secondary text-sm">
              <li className="flex items-start gap-2">
                <span className="text-status-negative mt-0.5 font-mono">›</span>
                <span>Profitable when the token&apos;s value falls below the strike price</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-status-negative mt-0.5 font-mono">›</span>
                <span>Writer locks the strike value (in premium tokens) as collateral</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-status-negative mt-0.5 font-mono">›</span>
                <span>Buyer&apos;s max loss = the premium paid</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Option Lifecycle */}
        <h3 className="text-lg font-semibold text-terminal-text-primary mb-4">Option Lifecycle</h3>
        <div className="space-y-4 mb-8">
          <div className="terminal-card rounded-xl p-5 flex items-start gap-4">
            <span className="text-lg font-mono text-accent font-bold shrink-0">01</span>
            <div>
              <h4 className="text-terminal-text-primary font-medium mb-1">Browse Pools</h4>
              <p className="text-sm text-terminal-text-muted">
                Pools are deployed by the protocol admin for OP20 token pairs. Each pool defines
                an underlying token (e.g., MOTO) and a premium token (e.g., PILL). All trading
                within pools is fully permissionless.
              </p>
            </div>
          </div>
          <div className="terminal-card rounded-xl p-5 flex items-start gap-4">
            <span className="text-lg font-mono text-accent font-bold shrink-0">02</span>
            <div>
              <h4 className="text-terminal-text-primary font-medium mb-1">Write an Option</h4>
              <p className="text-sm text-terminal-text-muted">
                The writer chooses the option type (CALL or PUT), strike price, expiry, amount, and
                premium. They lock 100% collateral in the contract — for CALLs, the underlying tokens;
                for PUTs, the equivalent strike value in premium tokens. The option is now listed and
                available for any buyer to purchase.
              </p>
            </div>
          </div>
          <div className="terminal-card rounded-xl p-5 flex items-start gap-4">
            <span className="text-lg font-mono text-accent font-bold shrink-0">03</span>
            <div>
              <h4 className="text-terminal-text-primary font-medium mb-1">Buy an Option</h4>
              <p className="text-sm text-terminal-text-muted">
                A buyer pays the premium (transferred directly to the writer) plus a 1% protocol fee,
                and becomes the option holder. They now have the right to exercise at expiry.
                If nobody buys, the writer can cancel the option and reclaim their collateral
                (a 1% cancellation fee applies before expiry; free after expiry).
              </p>
            </div>
          </div>
          <div className="terminal-card rounded-xl p-5 flex items-start gap-4">
            <span className="text-lg font-mono text-accent font-bold shrink-0">04</span>
            <div>
              <h4 className="text-terminal-text-primary font-medium mb-1">Exercise or Settle</h4>
              <p className="text-sm text-terminal-text-muted">
                Once the option reaches its expiry block, the buyer has a grace period of 144 blocks
                (~24 hours) to exercise if the option is in-the-money. For CALLs, the buyer pays the
                strike value and receives the underlying. For PUTs, the buyer sends the underlying and
                receives the strike value. If the buyer doesn&apos;t exercise within the grace period,
                anyone can settle the contract — the writer gets their collateral back and keeps the premium.
              </p>
            </div>
          </div>
        </div>

        {/* Concrete Example: CALL */}
        <h3 className="text-lg font-semibold text-terminal-text-primary mb-4">Example: CALL Option</h3>
        <div className="terminal-card rounded-xl p-6 mb-6">
          <p className="text-sm text-terminal-text-secondary mb-3">
            <strong className="text-terminal-text-primary">Setup:</strong> Alice writes a CALL option
            on <span className="font-mono text-accent">100 MOTO</span> with a strike price
            of <span className="font-mono text-accent">50 PILL per MOTO</span> and
            a premium of <span className="font-mono text-accent">5 PILL per MOTO</span>.
          </p>
          <ul className="space-y-1 text-sm text-terminal-text-muted mb-4">
            <li>Alice locks: <span className="font-mono text-terminal-text-secondary">100 MOTO</span> (collateral)</li>
            <li>Bob buys the option and pays: <span className="font-mono text-terminal-text-secondary">505 PILL</span> (500 premium + 5 protocol fee) — Alice receives the full 500</li>
          </ul>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-terminal-bg-primary rounded-lg p-4">
              <p className="text-xs font-mono text-status-positive mb-2">IF MOTO RISES TO 70 PILL (ITM)</p>
              <p className="text-sm text-terminal-text-secondary">
                Bob exercises: pays <span className="font-mono">5,000 PILL</span> (strike) and
                receives <span className="font-mono">99.9 MOTO</span> (0.1% exercise fee deducted, worth ~6,993 PILL).
              </p>
              <p className="text-sm text-terminal-text-secondary mt-1">
                Bob&apos;s profit: <span className="font-mono text-status-positive">~1,488 PILL</span> (6,993 - 5,000 - 505 total cost)
              </p>
              <p className="text-sm text-terminal-text-secondary mt-1">
                Alice&apos;s outcome: <span className="font-mono">5,500 PILL</span> (5,000 strike + 500 premium)
              </p>
            </div>
            <div className="bg-terminal-bg-primary rounded-lg p-4">
              <p className="text-xs font-mono text-status-negative mb-2">IF MOTO STAYS AT 40 PILL (OTM)</p>
              <p className="text-sm text-terminal-text-secondary">
                Bob doesn&apos;t exercise (would lose money). Option expires.
              </p>
              <p className="text-sm text-terminal-text-secondary mt-1">
                Bob&apos;s loss: <span className="font-mono text-status-negative">505 PILL</span> (premium + fee)
              </p>
              <p className="text-sm text-terminal-text-secondary mt-1">
                Alice keeps: <span className="font-mono text-status-positive">100 MOTO + 500 PILL</span> (collateral + premium)
              </p>
            </div>
          </div>
        </div>

        {/* Concrete Example: PUT */}
        <h3 className="text-lg font-semibold text-terminal-text-primary mb-4">Example: PUT Option</h3>
        <div className="terminal-card rounded-xl p-6 mb-6">
          <p className="text-sm text-terminal-text-secondary mb-3">
            <strong className="text-terminal-text-primary">Setup:</strong> Charlie writes a PUT option
            on <span className="font-mono text-accent">100 MOTO</span> with a strike price
            of <span className="font-mono text-accent">40 PILL per MOTO</span> and
            a premium of <span className="font-mono text-accent">3 PILL per MOTO</span>.
          </p>
          <ul className="space-y-1 text-sm text-terminal-text-muted mb-4">
            <li>Charlie locks: <span className="font-mono text-terminal-text-secondary">4,000 PILL</span> (strike value = 40 &times; 100)</li>
            <li>Dana buys the option and pays: <span className="font-mono text-terminal-text-secondary">303 PILL</span> (300 premium + 3 protocol fee) — Charlie receives the full 300</li>
          </ul>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-terminal-bg-primary rounded-lg p-4">
              <p className="text-xs font-mono text-status-positive mb-2">IF MOTO DROPS TO 25 PILL (ITM)</p>
              <p className="text-sm text-terminal-text-secondary">
                Dana exercises: sends <span className="font-mono">100 MOTO</span> (worth 2,500 PILL)
                and receives <span className="font-mono">4,000 PILL</span>.
              </p>
              <p className="text-sm text-terminal-text-secondary mt-1">
                Dana&apos;s profit: <span className="font-mono text-status-positive">1,197 PILL</span> (4,000 - 2,500 - 303 total cost)
              </p>
              <p className="text-sm text-terminal-text-secondary mt-1">
                Charlie&apos;s outcome: <span className="font-mono">100 MOTO + 300 PILL</span> (acquired MOTO at effective 37 PILL each)
              </p>
            </div>
            <div className="bg-terminal-bg-primary rounded-lg p-4">
              <p className="text-xs font-mono text-status-negative mb-2">IF MOTO STAYS AT 50 PILL (OTM)</p>
              <p className="text-sm text-terminal-text-secondary">
                Dana doesn&apos;t exercise. Option expires.
              </p>
              <p className="text-sm text-terminal-text-secondary mt-1">
                Dana&apos;s loss: <span className="font-mono text-status-negative">303 PILL</span> (premium + fee)
              </p>
              <p className="text-sm text-terminal-text-secondary mt-1">
                Charlie keeps: <span className="font-mono text-status-positive">4,000 PILL + 300 PILL</span> (collateral + premium)
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Use FroGop? */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-terminal-text-primary mb-4">Why Use FroGop?</h2>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="terminal-card rounded-xl p-6">
            <h3 className="text-lg font-semibold text-terminal-text-primary mb-3">For Writers (Sellers)</h3>
            <ul className="space-y-2 text-sm text-terminal-text-secondary">
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5 font-mono">›</span>
                <span><strong>Earn yield</strong> — Write covered calls on tokens you already hold and collect premiums</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5 font-mono">›</span>
                <span><strong>Buy at your price</strong> — Write puts at your target entry price and get paid while waiting</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5 font-mono">›</span>
                <span><strong>Set your own terms</strong> — You choose the strike, expiry, and premium</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5 font-mono">›</span>
                <span><strong>Cancel anytime</strong> — Reclaim collateral if no buyer appears (1% fee before expiry, free after)</span>
              </li>
            </ul>
          </div>
          <div className="terminal-card rounded-xl p-6">
            <h3 className="text-lg font-semibold text-terminal-text-primary mb-3">For Buyers (Holders)</h3>
            <ul className="space-y-2 text-sm text-terminal-text-secondary">
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5 font-mono">›</span>
                <span><strong>Limited downside</strong> — Your maximum loss is the premium you paid, nothing more</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5 font-mono">›</span>
                <span><strong>Leverage</strong> — Control more tokens with less capital via call options</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5 font-mono">›</span>
                <span><strong>Hedge risk</strong> — Buy puts to protect existing positions from price drops</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-0.5 font-mono">›</span>
                <span><strong>Guaranteed payout</strong> — 100% collateral is already locked in the contract</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Fees & Costs */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-terminal-text-primary mb-4">Fees & Costs</h2>

        <div className="terminal-card rounded-xl p-6 mb-4">
          <h3 className="text-base font-semibold text-terminal-text-primary mb-3 font-mono">Phase 1 (Current)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-terminal-text-muted border-b border-terminal-border-subtle">
                  <th className="pb-2 pr-4">Fee</th>
                  <th className="pb-2 pr-4">Amount</th>
                  <th className="pb-2">When</th>
                </tr>
              </thead>
              <tbody className="text-terminal-text-secondary">
                <tr className="border-b border-terminal-border-subtle/50">
                  <td className="py-2 pr-4 font-medium text-terminal-text-primary">Cancellation fee</td>
                  <td className="py-2 pr-4 font-mono text-accent">1%</td>
                  <td className="py-2">Deducted from collateral when a writer cancels an unpurchased option <em>before</em> expiry</td>
                </tr>
                <tr className="border-b border-terminal-border-subtle/50">
                  <td className="py-2 pr-4 font-medium text-terminal-text-primary">Expired reclaim</td>
                  <td className="py-2 pr-4 font-mono text-status-positive">Free</td>
                  <td className="py-2">If your option expires without a buyer, you get 100% of your collateral back — no fee</td>
                </tr>
                <tr className="border-b border-terminal-border-subtle/50">
                  <td className="py-2 pr-4 font-medium text-terminal-text-primary">Writing an option</td>
                  <td className="py-2 pr-4 font-mono text-status-positive">Free</td>
                  <td className="py-2">No protocol fee to create an option</td>
                </tr>
                <tr className="border-b border-terminal-border-subtle/50">
                  <td className="py-2 pr-4 font-medium text-terminal-text-primary">Buy fee</td>
                  <td className="py-2 pr-4 font-mono text-accent">1%</td>
                  <td className="py-2">1% of the premium, charged to the buyer on top of the premium. The writer receives their full premium — no reduction</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium text-terminal-text-primary">Exercise fee</td>
                  <td className="py-2 pr-4 font-mono text-accent">0.1%</td>
                  <td className="py-2">0.1% of the underlying payout, deducted from what the buyer receives. Goes to the protocol fee recipient</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="terminal-card rounded-xl p-6">
          <h3 className="text-base font-semibold text-terminal-text-primary mb-3 font-mono">Phase 3 (Planned — AMM Pools)</h3>
          <p className="text-sm text-terminal-text-muted mb-3">
            When AMM liquidity pools are introduced, additional fees will apply to fund liquidity providers:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-terminal-text-muted border-b border-terminal-border-subtle">
                  <th className="pb-2 pr-4">Fee</th>
                  <th className="pb-2 pr-4">Amount</th>
                  <th className="pb-2">Recipient</th>
                </tr>
              </thead>
              <tbody className="text-terminal-text-secondary">
                <tr className="border-b border-terminal-border-subtle/50">
                  <td className="py-2 pr-4">Trading fee</td>
                  <td className="py-2 pr-4 font-mono">0.3%</td>
                  <td className="py-2">Liquidity providers</td>
                </tr>
                <tr className="border-b border-terminal-border-subtle/50">
                  <td className="py-2 pr-4">Premium cut</td>
                  <td className="py-2 pr-4 font-mono">2–3%</td>
                  <td className="py-2">LPs + protocol</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Exercise fee</td>
                  <td className="py-2 pr-4 font-mono">0.1%</td>
                  <td className="py-2">Redirected from protocol fee recipient to liquidity providers</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-terminal-text-muted mt-3">
          Note: All transactions on Bitcoin also incur standard Bitcoin network fees (gas). These are
          not controlled by FroGop.
        </p>
      </section>

      {/* Safety & Security */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-terminal-text-primary mb-4">Safety & Security</h2>
        <ul className="space-y-4 text-terminal-text-secondary">
          <li className="flex items-start gap-3">
            <span className="text-accent mt-1 font-mono">›</span>
            <div>
              <span className="text-terminal-text-primary font-medium">100% Collateralized</span>
              <p className="text-sm text-terminal-text-muted">
                Every option is fully backed by locked collateral. When you buy an option, the tokens
                to pay you out are already sitting in the contract. There is zero counterparty risk —
                your payout is always guaranteed.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-accent mt-1 font-mono">›</span>
            <div>
              <span className="text-terminal-text-primary font-medium">No Oracle, No Manipulation</span>
              <p className="text-sm text-terminal-text-muted">
                FroGop does not use external price feeds. Strike prices are token pair ratios that
                writers and buyers agree on directly. There is no oracle to hack or manipulate —
                the protocol is immune to oracle attacks.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-accent mt-1 font-mono">›</span>
            <div>
              <span className="text-terminal-text-primary font-medium">Tamper-Proof Timing</span>
              <p className="text-sm text-terminal-text-muted">
                All option expiries use Bitcoin block height — not timestamps. Block heights cannot
                be manipulated by miners, unlike timestamps which can be shifted. This ensures your
                option expires exactly when expected.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-accent mt-1 font-mono">›</span>
            <div>
              <span className="text-terminal-text-primary font-medium">Self-Custodial</span>
              <p className="text-sm text-terminal-text-muted">
                You control your tokens at all times. Collateral is locked in the smart contract (not
                held by any company or third party), and only the contract&apos;s rules can release it.
                No admin can freeze or seize your funds.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-accent mt-1 font-mono">›</span>
            <div>
              <span className="text-terminal-text-primary font-medium">Protected Against Exploits</span>
              <p className="text-sm text-terminal-text-muted">
                The smart contracts are built with industry-standard protections against common attacks
                (reentrancy, overflow, unauthorized access). All arithmetic is overflow-safe, and
                state is updated before any token transfers to prevent exploitation.
              </p>
            </div>
          </li>
        </ul>
      </section>

      {/* Risk Disclosure */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-terminal-text-primary mb-4">Risks</h2>
        <div className="terminal-card rounded-xl p-6 !border-status-warning/30">
          <p className="text-sm text-terminal-text-secondary leading-relaxed mb-4">
            Options trading involves risk. Please understand the following before using FroGop:
          </p>
          <ul className="space-y-2 text-sm text-terminal-text-secondary">
            <li className="flex items-start gap-2">
              <span className="text-status-warning mt-0.5 font-mono">!</span>
              <span><strong className="text-terminal-text-primary">Buyers</strong> can lose their entire premium if the option expires out-of-the-money. Your maximum loss is the premium you paid.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-status-warning mt-0.5 font-mono">!</span>
              <span><strong className="text-terminal-text-primary">Writers</strong> face assignment risk — if the option is exercised, you must fulfill the contract at the strike price, even if market conditions have moved against you.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-status-warning mt-0.5 font-mono">!</span>
              <span><strong className="text-terminal-text-primary">Smart contract risk</strong> — While the contracts have been tested and hardened, no software is bug-free. Use at your own risk.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-status-warning mt-0.5 font-mono">!</span>
              <span><strong className="text-terminal-text-primary">Liquidity risk</strong> — In Phase 1, options are peer-to-peer. If no buyer appears for your option, you&apos;ll need to wait for expiry or cancel (1% fee before expiry).</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Key Parameters */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-terminal-text-primary mb-4">Key Parameters</h2>
        <div className="terminal-card rounded-xl p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-terminal-text-muted border-b border-terminal-border-subtle">
                  <th className="pb-2 pr-4">Parameter</th>
                  <th className="pb-2 pr-4">Value</th>
                  <th className="pb-2">Description</th>
                </tr>
              </thead>
              <tbody className="text-terminal-text-secondary">
                <tr className="border-b border-terminal-border-subtle/50">
                  <td className="py-2 pr-4 font-medium text-terminal-text-primary">Collateral</td>
                  <td className="py-2 pr-4 font-mono text-accent">100%</td>
                  <td className="py-2">Fully collateralized — CALLs lock underlying, PUTs lock strike value</td>
                </tr>
                <tr className="border-b border-terminal-border-subtle/50">
                  <td className="py-2 pr-4 font-medium text-terminal-text-primary">Cancellation fee</td>
                  <td className="py-2 pr-4 font-mono text-accent">1%</td>
                  <td className="py-2">Of collateral, only before expiry. Free after expiry</td>
                </tr>
                <tr className="border-b border-terminal-border-subtle/50">
                  <td className="py-2 pr-4 font-medium text-terminal-text-primary">Grace period</td>
                  <td className="py-2 pr-4 font-mono text-accent">144 blocks</td>
                  <td className="py-2">~24 hours after expiry to exercise ITM options</td>
                </tr>
                <tr className="border-b border-terminal-border-subtle/50">
                  <td className="py-2 pr-4 font-medium text-terminal-text-primary">Max duration</td>
                  <td className="py-2 pr-4 font-mono text-accent">52,560 blocks</td>
                  <td className="py-2">~1 year maximum option lifetime</td>
                </tr>
                <tr className="border-b border-terminal-border-subtle/50">
                  <td className="py-2 pr-4 font-medium text-terminal-text-primary">Strike format</td>
                  <td className="py-2 pr-4 font-mono text-accent">Token ratio</td>
                  <td className="py-2">E.g., &ldquo;50 PILL per MOTO&rdquo; — no external oracle</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium text-terminal-text-primary">Premium</td>
                  <td className="py-2 pr-4 font-mono text-accent">Writer-set</td>
                  <td className="py-2">Writers set the premium freely; buyers choose which to accept</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-terminal-text-primary mb-6">Frequently Asked Questions</h2>
        <div className="space-y-2">
          <FaqItem
            question="What happens if I write an option and nobody buys it?"
            answer="Your collateral stays locked until you cancel the option or it expires. If you cancel before expiry, a 1% cancellation fee is deducted from your collateral. If the option expires without a buyer, you can reclaim your full collateral for free — no fee."
          />
          <FaqItem
            question="What's the maximum I can lose as a buyer?"
            answer="The premium you paid to the writer. That's it. Even if the option expires completely worthless, you can never lose more than the premium. Your tokens are not at risk beyond that amount."
          />
          <FaqItem
            question="When can I exercise my option?"
            answer={<>After the option reaches its expiry block, you have a grace period of <span className="font-mono text-accent">144 blocks (~24 hours)</span> to exercise. You can only exercise during this window. If you miss it, the option settles automatically and the writer gets their collateral back.</>}
          />
          <FaqItem
            question="What happens if I don't exercise in time?"
            answer="The option expires. The writer gets their locked collateral back, and they keep the premium you paid. Anyone can trigger the settlement after the grace period ends."
          />
          <FaqItem
            question="Can I sell my option to someone else?"
            answer="Not in Phase 1. Options are non-transferable — only the original buyer can exercise. Secondary market trading is being considered for future phases."
          />
          <FaqItem
            question="What tokens can I use?"
            answer="Any OP20 token on OPNet. New pools are deployed by the protocol admin. All trading is permissionless — for example, you can write, buy, and exercise options on MOTO/PILL, ODYS/MOTO, or any other deployed pool."
          />
          <FaqItem
            question="Do I need a price oracle?"
            answer="No. Strike prices are expressed as token pair ratios (e.g., '50 PILL per 1 MOTO'). Writers and buyers agree on the price directly. No external oracle is involved, which means no oracle manipulation risk."
          />
          <FaqItem
            question="Is my collateral safe?"
            answer="Yes. Collateral is locked in the smart contract — not held by any person or company. It can only be released according to the contract's rules: to the buyer upon exercise, or back to the writer upon cancellation/expiry. The contract is protected against reentrancy attacks and uses safe arithmetic."
          />
          <FaqItem
            question="What wallet do I need?"
            answer={<>You need the <a href="https://opwallet.org" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">OPWallet</a> browser extension. It's the wallet for interacting with OPNet smart contracts on Bitcoin.</>}
          />
          <FaqItem
            question="What are the fees?"
            answer={<>There are three protocol fees: a <span className="font-mono text-accent">1% buy fee</span> on the premium (charged to the buyer on top of the premium — the writer gets their full amount); a <span className="font-mono text-accent">1% cancellation fee</span> on collateral when a writer cancels an unpurchased option before expiry; and a <span className="font-mono text-accent">0.1% exercise fee</span> deducted from the underlying payout when a buyer exercises. Writing is free. Expired unsold options can be reclaimed at no cost. Standard Bitcoin network fees (gas) apply to all transactions.</>}
          />
          <FaqItem
            question="What network is FroGop on?"
            answer="Bitcoin Layer 1 via OPNet. FroGop is not on a sidechain, not on a rollup, and not on Ethereum. Your assets stay on the Bitcoin blockchain at all times."
          />
          <FaqItem
            question="How long can an option last?"
            answer={<>Up to <span className="font-mono text-accent">52,560 blocks (~1 year)</span> from creation. The minimum is 1 block, though practical options will typically range from days to months.</>}
          />
          <FaqItem
            question="What's a grace period?"
            answer={<>After an option reaches its expiry block, the buyer has <span className="font-mono text-accent">144 blocks (~24 hours)</span> to decide whether to exercise. This prevents situations where the buyer misses exercise by a single block. After the grace period, the option is permanently expired.</>}
          />
          <FaqItem
            question="How is collateral different for CALLs vs PUTs?"
            answer={<>For <span className="neon-green font-mono">CALL</span> options, the writer locks the <em>underlying tokens</em> (e.g., 100 MOTO). For <span className="neon-red font-mono">PUT</span> options, the writer locks the <em>strike value in premium tokens</em> (e.g., if strike is 40 PILL per MOTO and amount is 100 MOTO, the writer locks 4,000 PILL). In both cases, collateral is 100%.</>}
          />
        </div>
      </section>

      {/* Glossary */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-terminal-text-primary mb-4">Glossary</h2>
        <div className="terminal-card rounded-xl p-6">
          <dl className="space-y-3 text-sm">
            <div className="flex flex-col sm:flex-row sm:gap-4">
              <dt className="font-medium text-terminal-text-primary font-mono shrink-0 sm:w-40">Strike Price</dt>
              <dd className="text-terminal-text-secondary">The pre-agreed price ratio at which the option can be exercised. Expressed as premium tokens per underlying token (e.g., 50 PILL per MOTO).</dd>
            </div>
            <div className="border-t border-terminal-border-subtle/30" />
            <div className="flex flex-col sm:flex-row sm:gap-4">
              <dt className="font-medium text-terminal-text-primary font-mono shrink-0 sm:w-40">Premium</dt>
              <dd className="text-terminal-text-secondary">The fee the buyer pays to the writer for the right to exercise. Paid upfront when purchasing the option. Set by the writer.</dd>
            </div>
            <div className="border-t border-terminal-border-subtle/30" />
            <div className="flex flex-col sm:flex-row sm:gap-4">
              <dt className="font-medium text-terminal-text-primary font-mono shrink-0 sm:w-40">Collateral</dt>
              <dd className="text-terminal-text-secondary">Tokens locked by the writer to guarantee the payout. 100% of the potential payout is locked at all times.</dd>
            </div>
            <div className="border-t border-terminal-border-subtle/30" />
            <div className="flex flex-col sm:flex-row sm:gap-4">
              <dt className="font-medium text-terminal-text-primary font-mono shrink-0 sm:w-40">Underlying</dt>
              <dd className="text-terminal-text-secondary">The token the option is written on. For a MOTO/PILL pool, MOTO is the underlying.</dd>
            </div>
            <div className="border-t border-terminal-border-subtle/30" />
            <div className="flex flex-col sm:flex-row sm:gap-4">
              <dt className="font-medium text-terminal-text-primary font-mono shrink-0 sm:w-40">Writer</dt>
              <dd className="text-terminal-text-secondary">The user who creates (writes) the option and locks collateral. Earns the premium.</dd>
            </div>
            <div className="border-t border-terminal-border-subtle/30" />
            <div className="flex flex-col sm:flex-row sm:gap-4">
              <dt className="font-medium text-terminal-text-primary font-mono shrink-0 sm:w-40">Buyer</dt>
              <dd className="text-terminal-text-secondary">The user who purchases the option by paying the premium. Has the right (not obligation) to exercise.</dd>
            </div>
            <div className="border-t border-terminal-border-subtle/30" />
            <div className="flex flex-col sm:flex-row sm:gap-4">
              <dt className="font-medium text-terminal-text-primary font-mono shrink-0 sm:w-40">In-the-Money</dt>
              <dd className="text-terminal-text-secondary">An option that would be profitable to exercise. Calls are ITM when price &gt; strike; puts are ITM when price &lt; strike.</dd>
            </div>
            <div className="border-t border-terminal-border-subtle/30" />
            <div className="flex flex-col sm:flex-row sm:gap-4">
              <dt className="font-medium text-terminal-text-primary font-mono shrink-0 sm:w-40">Out-of-the-Money</dt>
              <dd className="text-terminal-text-secondary">An option that would not be profitable to exercise. The buyer lets it expire and loses the premium.</dd>
            </div>
            <div className="border-t border-terminal-border-subtle/30" />
            <div className="flex flex-col sm:flex-row sm:gap-4">
              <dt className="font-medium text-terminal-text-primary font-mono shrink-0 sm:w-40">Expiry</dt>
              <dd className="text-terminal-text-secondary">The Bitcoin block height at which the option can be exercised. After expiry + grace period, the option settles automatically.</dd>
            </div>
            <div className="border-t border-terminal-border-subtle/30" />
            <div className="flex flex-col sm:flex-row sm:gap-4">
              <dt className="font-medium text-terminal-text-primary font-mono shrink-0 sm:w-40">Grace Period</dt>
              <dd className="text-terminal-text-secondary">144 blocks (~24 hours) after expiry during which the buyer can exercise. After this window, the option is permanently expired.</dd>
            </div>
            <div className="border-t border-terminal-border-subtle/30" />
            <div className="flex flex-col sm:flex-row sm:gap-4">
              <dt className="font-medium text-terminal-text-primary font-mono shrink-0 sm:w-40">Settlement</dt>
              <dd className="text-terminal-text-secondary">The process of closing an expired option. Returns collateral to the writer if the buyer didn&apos;t exercise.</dd>
            </div>
            <div className="border-t border-terminal-border-subtle/30" />
            <div className="flex flex-col sm:flex-row sm:gap-4">
              <dt className="font-medium text-terminal-text-primary font-mono shrink-0 sm:w-40">Exercise</dt>
              <dd className="text-terminal-text-secondary">The act of using your option right. For calls: pay strike, receive underlying. For puts: send underlying, receive strike value.</dd>
            </div>
            <div className="border-t border-terminal-border-subtle/30" />
            <div className="flex flex-col sm:flex-row sm:gap-4">
              <dt className="font-medium text-terminal-text-primary font-mono shrink-0 sm:w-40">Pool</dt>
              <dd className="text-terminal-text-secondary">A smart contract instance for a specific token pair (e.g., MOTO/PILL). All options for that pair are managed within one pool.</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Roadmap */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-terminal-text-primary mb-6">Roadmap</h2>

        <div className="space-y-6">
          {/* Phase 1 */}
          <div className="terminal-card rounded-xl p-6 !border-2 !border-accent" style={{ boxShadow: '0 0 25px #F7931A10' }}>
            <div className="flex items-center gap-3 mb-4">
              <span className="px-2 py-1 text-xs font-mono font-bold bg-accent text-terminal-bg-primary rounded">
                PHASE 1
              </span>
              <span className="text-sm font-mono text-accent">MVP — In Progress</span>
            </div>
            <h3 className="text-xl font-semibold text-terminal-text-primary mb-3">
              Core Options Protocol
            </h3>
            <p className="text-sm text-terminal-text-muted mb-3">
              Peer-to-peer options trading with OP20 tokens. You can write, buy, exercise, and cancel
              options for any token pair. All settlement is trustless and fully collateralized.
            </p>
            <ul className="text-sm text-terminal-text-secondary space-y-1 font-mono">
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
            <div className="flex items-center gap-3 mb-4">
              <span className="px-2 py-1 text-xs font-mono font-bold bg-terminal-text-muted text-terminal-bg-primary rounded">
                PHASE 2
              </span>
              <span className="text-sm font-mono text-terminal-text-muted">Planned</span>
            </div>
            <h3 className="text-xl font-semibold text-terminal-text-primary mb-3">
              NativeSwap Integration
            </h3>
            <p className="text-sm text-terminal-text-muted mb-3">
              Pay option premiums in native BTC instead of tokens. This opens up options trading to
              anyone holding Bitcoin — no need to acquire specific tokens first. Uses NativeSwap for
              on-chain BTC/token price data.
            </p>
            <ul className="text-sm text-terminal-text-secondary space-y-1 font-mono">
              <li className="flex items-center gap-2">
                <span className="text-terminal-text-muted">○</span> BTC premiums — pay for options with native Bitcoin
              </li>
              <li className="flex items-center gap-2">
                <span className="text-terminal-text-muted">○</span> BTC-denominated strikes — price options in satoshis
              </li>
              <li className="flex items-center gap-2">
                <span className="text-terminal-text-muted">○</span> On-chain price data via NativeSwap
              </li>
              <li className="flex items-center gap-2">
                <span className="text-terminal-text-muted">○</span> CSV timelocks — BTC payments secured against flash loans
              </li>
            </ul>
          </div>

          {/* Phase 3 */}
          <div className="terminal-card rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="px-2 py-1 text-xs font-mono font-bold bg-terminal-text-muted text-terminal-bg-primary rounded">
                PHASE 3
              </span>
              <span className="text-sm font-mono text-terminal-text-muted">Future</span>
            </div>
            <h3 className="text-xl font-semibold text-terminal-text-primary mb-3">
              AMM Liquidity Pools
            </h3>
            <p className="text-sm text-terminal-text-muted mb-3">
              Automated market maker pools so you can trade options instantly without waiting for a
              counterparty. Deposit tokens as a liquidity provider to earn trading fees and premium
              income. Options are priced automatically based on pool utilization.
            </p>
            <ul className="text-sm text-terminal-text-secondary space-y-1 font-mono">
              <li className="flex items-center gap-2">
                <span className="text-terminal-text-muted">○</span> Instant option buying — no waiting for a writer
              </li>
              <li className="flex items-center gap-2">
                <span className="text-terminal-text-muted">○</span> LP tokens — earn fees by providing liquidity
              </li>
              <li className="flex items-center gap-2">
                <span className="text-terminal-text-muted">○</span> Automated pricing based on pool utilization
              </li>
              <li className="flex items-center gap-2">
                <span className="text-terminal-text-muted">○</span> Covered call & cash-secured put pool strategies
              </li>
              <li className="flex items-center gap-2">
                <span className="text-terminal-text-muted">○</span> Trading fees (0.3%) + premium cut (2-3%) for LPs
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Technical Architecture */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-terminal-text-primary mb-4">Technical Architecture</h2>
        <div className="terminal-card rounded-xl p-6">
          <div className="grid md:grid-cols-2 gap-6 text-sm">
            <div>
              <h4 className="text-terminal-text-primary font-medium mb-2 font-mono">Contracts</h4>
              <ul className="space-y-1 text-terminal-text-muted">
                <li><span className="text-accent font-mono">OptionsFactory</span> — Permissionless pool deployment and registry</li>
                <li><span className="text-accent font-mono">OptionsPool</span> — Full option lifecycle (write, buy, exercise, cancel, settle)</li>
              </ul>
            </div>
            <div>
              <h4 className="text-terminal-text-primary font-medium mb-2 font-mono">Stack</h4>
              <ul className="space-y-1 text-terminal-text-muted">
                <li><span className="text-terminal-text-secondary">Platform:</span> OPNet (Bitcoin L1 smart contracts)</li>
                <li><span className="text-terminal-text-secondary">Tokens:</span> OP20 standard (Bitcoin-native)</li>
                <li><span className="text-terminal-text-secondary">Signatures:</span> ML-DSA (quantum-resistant)</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Links */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-terminal-text-primary mb-4">Links</h2>
        <div className="flex gap-4">
          <a
            href="https://github.com/shoebillrexmail-cmyk/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary px-4 py-2 rounded-lg inline-block"
          >
            GitHub
          </a>
          <Link
            to="/pools"
            className="btn-primary px-4 py-2 rounded-lg inline-block"
          >
            Launch App
          </Link>
        </div>
      </section>
    </div>
  );
}
