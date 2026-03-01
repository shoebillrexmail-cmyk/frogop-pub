# Phase 1: Economic Model & Incentives

## Core Question

**Why would anyone use this protocol?**

This document analyzes the financial incentives for all participants and ensures the model is economically sound.

---

## 1. The Fundamental Problem with On-Chain Pricing

### Why NOT Black-Scholes On-Chain?

| Issue | Problem |
|-------|---------|
| **Oracle Dependency** | Requires trusted price feed - manipulation risk |
| **Volatility Input** | Where does implied volatility come from? |
| **Gas Cost** | Complex math is expensive on-chain |
| **Market Reality** | Formula may not match what buyers will pay |

### The Solution: Market Price Discovery

```
Traditional Options Exchange:
┌─────────────────────────────────────────────────────┐
│  Market Makers → Set Bid/Ask → Traders Execute     │
│  (Institutions)    (Oracles)     (Users)            │
└─────────────────────────────────────────────────────┘

FrogOp Phase 1 (P2P):
┌─────────────────────────────────────────────────────┐
│  Writer → Sets Premium → Buyer → Accepts or Not    │
│  (Any user)  (Their price)  (Any user)              │
└─────────────────────────────────────────────────────┘

The market discovers the fair price through:
├── Writers competing (lower premiums attract buyers)
├── Buyers shopping (compare options before buying)
└── Off-chain price signals (MotoSwap, etc.)
```

---

## 2. Participant Incentives

### Writer (Option Seller)

**Why write options?**

#### 2.1 Covered Call Writer

**Scenario**: Alice holds 1000 MOTO, believes price will stay flat or rise slowly.

```
Alice's Position:
├── Holds: 1000 MOTO (long)
├── Belief: Price won't moon, might stay flat
└── Goal: Earn yield on idle MOTO

Alice writes Call @ strike 60, premium 5:
├── Locks: 1000 MOTO as collateral
├── Receives: 5000 PILL premium (if buyer purchases)
│
├── If MOTO < 60 at expiry (OTM):
│   ├── Keeps: 1000 MOTO
│   ├── Keeps: 5000 PILL premium
│   └── Profit: +5000 PILL (pure income)
│
└── If MOTO >= 60 at expiry (ITM):
    ├── Sells: 1000 MOTO at 60 PILL each
    ├── Receives: 60,000 PILL (strike payment)
    ├── Keeps: 5000 PILL premium
    └── Total: 65,000 PILL

    Opportunity cost: If MOTO was 80, she could have sold for 80,000 PILL
    Net: She "lost" potential upside beyond strike, but earned guaranteed premium
```

**Incentive**: Earn yield on existing holdings, with capped upside but protected downside.

#### 2.2 Cash-Secured Put Writer

**Scenario**: Bob has 50,000 PILL, wants to buy MOTO at lower price.

```
Bob's Position:
├── Holds: 50,000 PILL
├── Belief: MOTO is overpriced, wants to buy at 40 PILL
└── Goal: Either buy at 40 OR earn premium while waiting

Bob writes Put @ strike 40, premium 3, amount 1000:
├── Locks: 40,000 PILL as collateral (40 × 1000)
├── Receives: 3000 PILL premium (if buyer purchases)
│
├── If MOTO > 40 at expiry (OTM):
│   ├── Keeps: 40,000 PILL collateral
│   ├── Keeps: 3000 PILL premium
│   └── Profit: +3000 PILL (pure income)
│   └── Can write more puts at same/lower strike
│
└── If MOTO <= 40 at expiry (ITM):
    ├── Buys: 1000 MOTO at 40 PILL each
    ├── Pays: 40,000 PILL (strike value)
    ├── Keeps: 3000 PILL premium
    └── Net: 1000 MOTO for 37,000 PILL effective (37 PILL/MOTO)
```

**Incentive**: Buy at target price OR get paid while waiting.

### Buyer (Option Holder)

**Why buy options?**

#### 2.3 Call Buyer (Speculation)

**Scenario**: Charlie thinks MOTO will moon.

```
Charlie's Position:
├── Has: Some PILL
├── Belief: MOTO will rise significantly
└── Goal: Profit from price increase with limited risk

Charlie buys Call @ strike 50, premium 5, amount 100:
├── Pays: 500 PILL premium
├── No collateral required
│
├── If MOTO <= 50 at expiry (OTM):
│   └── Loss: 500 PILL (maximum loss = premium)
│
└── If MOTO = 70 at expiry (ITM):
    ├── Exercises: Pays 5000 PILL, receives 100 MOTO
    ├── Sells MOTO: 100 × 70 = 7000 PILL
    ├── Net: 7000 - 5000 - 500 = 1500 PILL profit
    └── ROI: 1500 / 500 = 300% on premium
```

**Incentive**: Leverage - control more assets with less capital, capped downside.

#### 2.4 Put Buyer (Hedging)

**Scenario**: Diana holds 1000 MOTO, fears price drop.

```
Diana's Position:
├── Holds: 1000 MOTO (long)
├── Belief: Price might crash soon
└── Goal: Protect against downside

Diana buys Put @ strike 45, premium 2, amount 1000:
├── Pays: 2000 PILL premium
│
├── If MOTO >= 45 at expiry (OTM):
│   ├── Still has: 1000 MOTO
│   ├── Loss: 2000 PILL (insurance premium)
│   └── Interpretation: "Insurance that wasn't needed"
│
└── If MOTO = 30 at expiry (ITM):
    ├── Exercises: Sells 1000 MOTO at 45 PILL each
    ├── Receives: 45,000 PILL
    ├── Without hedge: Would have 30,000 PILL value
    ├── With hedge: Has 45,000 - 2000 = 43,000 PILL
    └── Protection: Saved 13,000 PILL in losses
```

**Incentive**: Insurance against adverse price moves.

---

## 3. Hedging Use Cases

### 3.1 Hedge Existing Long Position

```
User holds: 1000 MOTO bought at 50 PILL
Fear: Price might drop
Action: Buy Put @ strike 45, premium 2

┌─────────────────────────────────────────────────────────────────────┐
│                    HEDGE PROTECTION                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Price at Expiry   │  Without Hedge    │  With Hedge              │
│   ──────────────────┼───────────────────┼─────────────────────────│
│   60 PILL           │  +10,000 profit   │  +8,000 profit           │
│   50 PILL           │  0 (break-even)   │  -2,000 loss             │
│   40 PILL           │  -10,000 loss     │  -7,000 loss             │
│   30 PILL           │  -20,000 loss     │  -7,000 loss (capped!)   │
│   20 PILL           │  -30,000 loss     │  -7,000 loss (capped!)   │
│                                                                     │
│   Maximum loss with hedge: 7,000 PILL                              │
│   Maximum loss without hedge: Unlimited                            │
│   Cost of protection: 2,000 PILL premium                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Hedge Against Price Increase (Short Squeeze Protection)

```
User is short: 1000 MOTO (borrowed, needs to repay)
Fear: Price might spike
Action: Buy Call @ strike 55, premium 4

┌─────────────────────────────────────────────────────────────────────┐
│                    SHORT HEDGE                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Price at Expiry   │  Short P/L        │  With Call Hedge         │
│   ──────────────────┼───────────────────┼─────────────────────────│
│   40 PILL           │  +10,000 profit   │  +6,000 profit           │
│   50 PILL           │  0                │  -4,000 loss             │
│   60 PILL           │  -10,000 loss     │  -4,000 loss (capped)    │
│   70 PILL           │  -20,000 loss     │  -4,000 loss (capped)    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Payout Guarantees

### 4.1 100% Collateralization = Always Solvent

```
┌─────────────────────────────────────────────────────────────────────┐
│                    COLLATERAL FLOW                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Call Option:                                                      │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  writeOption()                                               │  │
│   │  ├── Writer transfers 100 MOTO to contract                  │  │
│   │  └── Contract holds 100 MOTO (collateral locked)            │  │
│   │                                                              │  │
│   │  exercise()                                                  │  │
│   │  ├── Buyer pays 5000 PILL strike value to writer            │  │
│   │  └── Contract transfers 100 MOTO to buyer                   │  │
│   │      ↑ ALWAYS POSSIBLE (100 MOTO is locked)                 │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   Put Option:                                                       │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  writeOption()                                               │  │
│   │  ├── Writer transfers 5000 PILL to contract                 │  │
│   │  └── Contract holds 5000 PILL (collateral locked)           │  │
│   │                                                              │  │
│   │  exercise()                                                  │  │
│   │  ├── Buyer transfers 100 MOTO to writer                     │  │
│   │  └── Contract transfers 5000 PILL to buyer                  │  │
│   │      ↑ ALWAYS POSSIBLE (5000 PILL is locked)                │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   KEY INSIGHT: Collateral is locked BEFORE option is sold.         │
│   Exercise payout is GUARANTEED by locked collateral.              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 No Counterparty Risk

| Traditional Options | FrogOp Phase 1 |
|--------------------|----------------|
| Writer might default | Collateral locked in contract |
| Exchange might fail | P2P on Bitcoin L1 |
| Settlement risk | Atomic settlement |
| Credit risk | Zero (overcollateralized) |

---

## 5. Market Making Incentive

### 5.1 Who Creates Options?

**Anyone can be a "market maker":**

1. **Yield Seekers**: Hold MOTO, want to earn PILL premiums
2. **Target Buyers**: Want to buy MOTO at specific price
3. **Arbitrageurs**: Spot mispriced options, profit from spread
4. **Hedgers**: Offset one position with opposite option

### 5.2 Competition Drives Fair Pricing

```
If MOTO trades at 50 PILL on MotoSwap:

Writer A: Call @ strike 50, premium 10  (expensive)
Writer B: Call @ strike 50, premium 8   (better)
Writer C: Call @ strike 50, premium 5   (best - gets bought first)

Result: Premiums converge to "fair" market price through competition
```

### 5.3 Frontend Can Show "Fair" Premium

```typescript
// Frontend shows suggested premium (NOT enforced by contract)
async function showFairPremium(pool, strike, expiry, amount) {
    const spotPrice = await getMotoSwapPrice(pool);
    const suggestedPremium = blackScholesSuggestion(spotPrice, strike, expiry);
    
    // Show as reference, user decides
    return {
        suggestedPremium,
        minPremium: suggestedPremium * 0.8,  // Conservative
        maxPremium: suggestedPremium * 1.2,  // Aggressive
    };
}

// Writer sees:
// "Fair premium for this option: ~5 PILL per MOTO"
// "Options in market: 4-8 PILL range"
// Writer sets premium based on their risk tolerance
```

---

## 6. Self-Hedging

### Can a user hedge their OWN position?

**Yes! Here's how:**

#### Scenario: Alice has 500 MOTO, fears drop

```
Step 1: Alice writes Call to earn premium
├── Writes Call @ strike 60, premium 4, amount 200
├── Locks: 200 MOTO
├── Earns: 800 PILL premium (when buyer purchases)
└── Remaining unhedged: 300 MOTO

Step 2: Alice buys Put to protect remaining position
├── Buys Put @ strike 45, premium 2, amount 300
├── Pays: 600 PILL premium
├── Net premium cost: 800 - 600 = +200 PILL (net positive!)
└── Protection: 300 MOTO hedged at 45 strike

Result:
├── 200 MOTO: Earning yield (capped at 60)
├── 300 MOTO: Protected (floor at 45)
└── Net premium: +200 PILL earned
```

### The "Synthetic" Position

A sophisticated user can create synthetic positions:

```
Synthetic Long MOTO:
├── Buy Call @ strike 50
└── Sell Put @ strike 50

Result: Behaves like owning MOTO
├── If price > 50: Exercise call, profit
├── If price < 50: Put exercised against you, buy MOTO
└── Premiums may cancel out or net positive
```

---

## 7. Why This Works Without On-Chain Pricing

### The Key Insight

```
┌─────────────────────────────────────────────────────────────────────┐
│           ON-CHAIN PRICING vs MARKET DISCOVERY                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Traditional DEX Options:                                         │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  Contract: "Fair price is X based on formula + oracle"      │  │
│   │  User: Must accept or leave                                 │  │
│   │  Risk: Oracle manipulation, formula inaccuracy              │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   FrogOp Phase 1:                                                   │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  Writer: "I'll sell this option for X premium"              │  │
│   │  Buyer: "I'll buy it at X" or "I'll find a cheaper one"     │  │
│   │  Frontend: "Similar options are Y-Z premium"                │  │
│   │  Risk: Illiquidity (mitigated by competition)               │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│   Market Discovery Advantages:                                     │
│   ├── No oracle dependency                                         │
│   ├── No manipulation vector                                       │
│   ├── Competition drives fair prices                               │
│   └── Users express actual risk preferences                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. Phase 1 vs Phase 3 (AMM) Comparison

| Feature | Phase 1 (P2P) | Phase 3 (AMM) |
|---------|---------------|---------------|
| Pricing | Writer sets | Formula-based |
| Liquidity | Matched counterparty | Always available |
| Capital Efficiency | 100% per option | Shared pool |
| Complexity | Low | High |
| Oracle | Not needed | Pool reserves |
| Slippage | None (fixed price) | Varies with size |

---

## 9. Summary: Economic Model Validity

### Does this work? YES.

1. **Payouts Guaranteed**: 100% collateral locked upfront
2. **Writer Incentive**: Earn premium income, yield on holdings
3. **Buyer Incentive**: Hedge risk, speculate with limited downside
4. **Fair Pricing**: Market competition, no oracle manipulation
5. **Self-Hedging**: Users can hedge their own positions
6. **No Counterparty Risk**: Contract enforces settlement

### Potential Issues & Mitigations

| Issue | Mitigation |
|-------|------------|
| Low liquidity (no buyers) | Writer can cancel, frontend aggregates options |
| Premium too high/low | Competition, off-chain price signals |
| No active markets | Bootstrap with incentives, integrate with existing DeFi |

---

## Next Steps

1. Confirm this economic model makes sense
2. Refine Phase 1 spec based on feedback
3. Begin implementation planning
