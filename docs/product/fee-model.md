# FroGop Fee Model

## Overview

FroGop charges protocol fees on three operations. Fees are deducted at the point of execution and routed to a dedicated fee recipient address configured per pool.

## Fee Schedule

| Operation | Fee (BPS) | Percentage | Deducted From | Token |
|-----------|-----------|------------|---------------|-------|
| **Buy** | 100 | 1.0% | Premium payment | PILL (premium token) |
| **Exercise** | 10 | 0.1% | Settlement amount | MOTO (underlying) or PILL (strike value) |
| **Cancel** | 100 | 1.0% | Returned collateral | MOTO (CALL) or PILL (PUT) |

## Calculation

All fees use **ceiling division** to ensure the protocol never rounds down to zero:

```
fee = (amount * feeBPS + 9999) / 10000
```

- BPS = basis points (1 BPS = 0.01%)
- SafeMath enforced — no overflow possible
- Minimum fee: 1 unit (ceiling division prevents zero-fee transactions)

## Exercise Fee Detail

Exercise fees depend on option type:

- **CALL**: Fee on `underlyingAmount` (MOTO transferred to buyer)
- **PUT**: Fee on `strikeValue = (strikePrice * underlyingAmount) / PRECISION` (PILL transferred to buyer)

Where `PRECISION = 10^18` (18-decimal fixed-point encoding).

## Fee Recipient

- Each pool has a `feeRecipient` address set at deployment
- Updatable via `updateFeeRecipient()` (owner only)
- Fees accumulate as direct token transfers — no claim mechanism needed

## Source of Truth

- Contract: `src/contracts/pool/contract.ts` lines 93-99
- Constants: `CANCEL_FEE_BPS = 100`, `BUY_FEE_BPS = 100`, `EXERCISE_FEE_BPS = 10`
