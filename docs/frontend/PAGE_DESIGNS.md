# FroGop — Page Design Sketches

> ASCII layout references for the Pools and Portfolio pages.
> See `USER_FLOWS.md` for interaction flows.

---

## Pools Page

Single pool view (MOTO/PILL) with global options table and write panel.

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🐸 FROGOP              Pools  Portfolio  About      [opt1pf… ●]     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ MOTO / PILL Pool                        [Write Option  +]    │   │
│  │ ──────────────────────────────────────────────────────────   │   │
│  │ Options: 6  │  Buy fee: 1%  │  Exercise fee: 0.1%            │   │
│  │ Cancel fee: 1%  │  Grace period: 144 blocks (~24h)           │   │
│  │ Underlying: opt1sqzhd…  │  Premium: opt1sqr5…                │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Options                              Filter: [ALL ▼] [OPEN ▼]│   │
│  │ ──────────────────────────────────────────────────────────   │   │
│  │  #  │ Type  │ Strike   │ Expiry       │ Amount  │ Status      │   │
│  │ ─── │ ───── │ ──────── │ ──────────── │ ─────── │ ─────────── │   │
│  │  0  │ CALL  │ 50 PILL  │ 2340 (~1d)   │ 1 MOTO  │ [OPEN] Buy  │   │
│  │  1  │ PUT   │ 40 PILL  │ 2350 (~2d)   │ 2 MOTO  │ [OPEN] Buy  │   │
│  │  2  │ CALL  │ 50 PILL  │ 2310 (exp.)  │ 1 MOTO  │ EXPIRED  Settle│
│  │  3  │ CALL  │ 50 PILL  │ 2314 (exp.)  │ 1 MOTO  │ PURCHASED   │   │
│  │  4  │ PUT   │ 60 PILL  │ 2400 (~5d)   │ 3 MOTO  │ [OPEN] Buy  │   │
│  │  5  │ CALL  │ 50 PILL  │ 2423 (~3d)   │ 1 MOTO  │ CANCELLED   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  [Network: Testnet ●]   Block: 2336   opt1sqzw4f5r…                 │
└──────────────────────────────────────────────────────────────────────┘
```

### Write Option Panel (slides in from right)

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🐸 FROGOP              Pools  Portfolio  About      [opt1pf… ●]     │
├─────────────────────────────────────┬────────────────────────────────┤
│                                     │                                │
│  ┌──────────────────────────────┐   │  ┌──────────────────────────┐ │
│  │ MOTO / PILL Pool  [Write +]  │   │  │ Write Option       [✕]   │ │
│  └──────────────────────────────┘   │  │ ────────────────────────  │ │
│                                     │  │ Type  ○ CALL  ● PUT       │ │
│  ┌──────────────────────────────┐   │  │                           │ │
│  │ #   Type  Strike  Status     │   │  │ Amount   [ 1.0  ] MOTO   │ │
│  │ 0   CALL  50 PIL  OPEN  Buy  │   │  │ Strike   [50.0  ] PILL   │ │
│  │ 1   PUT   40 PIL  OPEN  Buy  │   │  │ Premium  [ 5.0  ] PILL   │ │
│  │ 2   CALL  50 PIL  EXPIRED    │   │  │ Expiry   [ 144  ] blocks │ │
│  │ ...                          │   │  │          (~24h from now) │ │
│  └──────────────────────────────┘   │  │                           │ │
│                                     │  │ ┌─────────────────────┐  │ │
│                                     │  │ │ Collateral: 1 MOTO  │  │ │
│                                     │  │ │ Your bal: 1000 ✓    │  │ │
│                                     │  │ │ Allowance: 0 ← req  │  │ │
│                                     │  │ └─────────────────────┘  │ │
│                                     │  │                           │ │
│                                     │  │  [Approve MOTO  →]       │ │
│                                     │  └──────────────────────────┘ │
│                                     │                                │
└─────────────────────────────────────┴────────────────────────────────┘
```

### Row Actions by Status

| Status    | Action shown                        | Who sees it         |
|-----------|-------------------------------------|---------------------|
| OPEN      | `[Buy ▶]`                           | Any wallet ≠ writer |
| OPEN      | `[Cancel]`                          | Writer only         |
| PURCHASED | `[Exercise ▶]` (grace active)       | Buyer only          |
| PURCHASED | `[Settle]` (grace expired)          | Anyone              |
| EXPIRED   | `[Settle]`                          | Anyone              |
| CANCELLED | — (no action)                       | —                   |
| EXERCISED | — (no action)                       | —                   |

### Status Badge Colors

| Status    | Badge style                     |
|-----------|---------------------------------|
| OPEN      | green border `#22c55e`          |
| PURCHASED | cyan border `#22d3ee`           |
| EXERCISED | orange `#F7931A` (success)      |
| EXPIRED   | muted gray (neutral)            |
| CANCELLED | red-muted `#f43f5e` dimmed      |

### Option Type Colors

| Type | Color                              |
|------|------------------------------------|
| CALL | green `#22c55e` (bullish)          |
| PUT  | red `#f43f5e` (bearish)            |

---

## Portfolio Page

Personal view — filtered to connected wallet's written and purchased options.

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🐸 FROGOP              Pools  Portfolio  About      [opt1pf… ●]     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────┐  ┌───────────────────────────────────┐ │
│  │ Balances                │  │ Pool: MOTO / PILL                 │ │
│  │ ─────────────────────── │  │ opt1sqzw4f5r…                     │ │
│  │ MOTO   1,000.0000       │  │ Block: 2336   Grace: 144 blk (~24h│ │
│  │ PILL     500.0000       │  └───────────────────────────────────┘ │
│  └─────────────────────────┘                                        │
│                                                                      │
│  ──────────────────────────────────────────────────────────────────  │
│  MY WRITTEN OPTIONS                                                  │
│  ──────────────────────────────────────────────────────────────────  │
│  ┌────┬──────┬──────────┬──────────────┬───────────┬─────────────┐  │
│  │ #  │ Type │ Strike   │ Expiry       │ Status    │ Action      │  │
│  ├────┼──────┼──────────┼──────────────┼───────────┼─────────────┤  │
│  │ 0  │ CALL │ 50 PILL  │ blk 2340 1d  │ OPEN      │ [Cancel]    │  │
│  │ 2  │ CALL │ 50 PILL  │ blk 2310 exp │ OPEN/exp  │ [Cancel 0%] │  │
│  │ 5  │ CALL │ 50 PILL  │ blk 2423 3d  │ CANCELLED │ —           │  │
│  └────┴──────┴──────────┴──────────────┴───────────┴─────────────┘  │
│                                                                      │
│  ──────────────────────────────────────────────────────────────────  │
│  MY PURCHASED OPTIONS                                                │
│  ──────────────────────────────────────────────────────────────────  │
│  ┌────┬──────┬──────────┬────────────────────────┬────────┬───────┐  │
│  │ #  │ Type │ Strike   │ Grace ends              │ Status │Action │  │
│  ├────┼──────┼──────────┼────────────────────────┼────────┼───────┤  │
│  │ 3  │ CALL │ 50 PILL  │ blk 2458  ⚡ 2h left    │ PURCH. │[Exer.]│  │
│  └────┴──────┴──────────┴────────────────────────┴────────┴───────┘  │
│                                                                      │
│  ⚡ Grace period active on option #3 — exercise before block 2458   │
│                                                                      │
│  [No purchased options if empty: "No open positions"]               │
└──────────────────────────────────────────────────────────────────────┘
```

### Portfolio Empty States

```
  My Written Options
  ──────────────────────────────────────────────────────────────
  ┌─────────────────────────────────────────────────────────────┐
  │  No written options yet.                                    │
  │  Go to Pools to write a CALL or PUT option.                 │
  │                      [Go to Pools →]                        │
  └─────────────────────────────────────────────────────────────┘

  My Purchased Options
  ──────────────────────────────────────────────────────────────
  ┌─────────────────────────────────────────────────────────────┐
  │  No purchased options.                                      │
  │  Browse open options on the Pools page to buy one.          │
  │                      [Go to Pools →]                        │
  └─────────────────────────────────────────────────────────────┘
```

### Disconnected State (Portfolio)

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🐸 FROGOP              Pools  Portfolio  About      [Connect ▶]     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │  Connect your OPWallet to view your positions.              │   │
│  │                                                              │   │
│  │                    [Connect Wallet  →]                       │   │
│  │                                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Shared UI Elements

### Network Badge (non-mainnet environments)

```
  [Network: Testnet ●]   — shown bottom-left on all pages when VITE_OPNET_NETWORK ≠ mainnet
```

### Pending TX Toast

```
  ┌──────────────────────────────────────────────────────────┐
  │  ⏳ Transaction broadcast                                 │
  │  Waiting for block confirmation (~10 min on testnet)     │
  │  txid: a3f2bc…                              [Explorer ↗] │
  └──────────────────────────────────────────────────────────┘
```

### Error Toast

```
  ┌──────────────────────────────────────────────────────────┐
  │  ❌ Transaction failed                                    │
  │  Insufficient PILL balance for this purchase.            │
  └──────────────────────────────────────────────────────────┘
```

### Grace Period Warning Banner

```
  ┌──────────────────────────────────────────────────────────┐
  │  ⚡ Option #3 — Grace period ends in ~2 hours            │
  │  Exercise before block 2458 or the option expires.       │
  └──────────────────────────────────────────────────────────┘
```

---

## Block Time Reference

All expiry and grace period values are stored as block numbers on-chain.
The UI converts using `blocksToTime()` (144 blocks ≈ 24 hours):

| Blocks | Approx. time |
|--------|-------------|
| 144    | ~24 hours   |
| 1,008  | ~1 week     |
| 4,320  | ~1 month    |
| 52,560 | ~1 year     |

Always show both: `blk 2484 (~24h)` so users understand the raw number and the human estimate.
