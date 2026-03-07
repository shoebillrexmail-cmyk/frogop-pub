# FroGop User Guide

## What is FroGop?

FroGop is a decentralized options protocol on Bitcoin L1 (OPNet). It lets you write, buy, and exercise options on OP20 tokens directly on-chain.

**Tokens:**
- **MOTO** (frogU) — Underlying asset
- **PILL** (frogP) — Premium / strike payment token

## Getting Started

1. **Connect wallet** — Click "Connect Wallet" in the header. FroGop uses OPNet WalletConnect.
2. **Browse pools** — The Pools page shows available option pools with stats (total options, open interest).
3. **No wallet needed to browse** — Pool data and option chains are readable without connecting.

## Core Operations

### Writing an Option (Selling)

You lock collateral and set terms. You earn premium when someone buys.

1. Navigate to a pool on the **Pools** page
2. Click **Write** tab
3. Choose **CALL** or **PUT**
4. Set: underlying amount, strike price, premium, expiry (in blocks)
5. **Approve** token spending (one-time per token, step 1 of 2)
6. **Confirm** the write transaction (step 2 of 2)

**Collateral:**
- CALL: Lock `underlyingAmount` of MOTO
- PUT: Lock `strikeValue` of PILL (= strikePrice * amount / 10^18)

### Buying an Option

You pay premium to acquire the right to exercise.

1. Browse the options chain on a pool page
2. Click **Buy** on an open option
3. **Approve** PILL spending (if needed, step 1 of 2)
4. **Confirm** the buy (step 2 of 2)
5. 1% fee deducted from premium

### Exercising an Option

Exercise before expiry to claim the underlying/strike tokens.

1. Go to **Portfolio** page
2. Find your purchased option
3. Click **Exercise**
4. **Approve** token transfer (step 1 of 2)
5. **Confirm** exercise (step 2 of 2)
6. 0.1% fee on settlement amount

**CALL exercise:** You send strikeValue PILL, receive underlyingAmount MOTO
**PUT exercise:** You send underlyingAmount MOTO, receive strikeValue PILL

### Cancelling an Option

Writers can cancel unsold options to reclaim collateral.

1. Go to **Portfolio** page
2. Find your written (unsold) option
3. Click **Cancel**
4. Collateral returned minus 1% fee

### Settling an Expired Option

After expiry + 144-block grace period, anyone can settle to return collateral to the writer.

1. Find an expired option
2. Click **Settle**
3. Collateral returned to original writer

### Transferring an Option

Buyers can transfer their option to another address.

1. Find your purchased option in Portfolio
2. Click **Transfer**
3. Enter recipient address
4. Confirm transaction

### Rolling an Option

Atomically cancel an existing position and create a new one with different terms.

1. Find your written option in Portfolio
2. Click **Roll**
3. Set new terms (strike, premium, expiry)
4. 1% cancel fee on old position; new collateral locked

## Strategy Templates

FroGop includes pre-built strategy templates:

- **Covered Call** — Write a CALL while holding the underlying
- **Protective Put** — Buy a PUT to hedge a long position
- **Collar** — Combine a covered call + protective put

Access via the **Quick Strategies** panel on the Pools page.

## Grace Period

Every option pool has a **grace period** — a configurable window of time after an option expires during which the buyer can still exercise.

- **Default:** 144 blocks (~1 day)
- **Range:** 6 blocks (~1 hour) to 4,320 blocks (~30 days)
- **Set at deployment:** Each pool's grace period is fixed when the pool contract is deployed

### How it works

1. **Option expires** at its `expiryBlock`
2. **Grace period begins** — the buyer has `gracePeriodBlocks` additional blocks to exercise
3. **Grace period ends** at `expiryBlock + gracePeriodBlocks` — the option can no longer be exercised
4. **Settle available** — after the grace period, the writer (or anyone) can call settle to return collateral

### Where to see it

- **Pool cards** on the Pools page show the grace period duration
- **Pool header** on the pool detail page shows blocks + human-readable time
- **Options table** shows per-option grace warnings (amber for >1 day, red for <1 day)
- **Portfolio page** shows expiry alert banners for purchased options nearing grace end

### Tips

- Exercise well before the grace period ends — Bitcoin L1 transactions take ~10 minutes to confirm
- The grace period countdown is based on block height, not wall-clock time
- If you miss the grace period, the writer can settle and reclaim the collateral

## Important Notes

- **Block times:** OPNet runs on Signet (~10 min blocks). Transactions take time to confirm.
- **Parallel transactions:** You can submit multiple transactions simultaneously — no nonce serialization.
- **Flow tracking:** The transaction pill in the header shows pending and confirmed transactions.
- **All values use 18-decimal encoding:** "50 PILL" = 50 * 10^18 on-chain.
