# Mode Comparison

## Overview

FrogOp supports two integration modes for different use cases and asset types.

| Feature | Mode 1: NativeSwap | Mode 2: AMM Pool |
|---------|-------------------|------------------|
| **Premium Asset** | Native BTC | Any OP20 token |
| **Collateral** | OP20 tokens | OP20 tokens |
| **Strike Unit** | BTC (via oracle) | Token pair ratio |
| **Liquidity** | P2P matching | Pool-based |
| **Capital Efficiency** | 100% collateralized | Shared liquidity |
| **Complexity** | Higher | Lower |
| **External Dependency** | NativeSwap oracle | None |

---

## Mode 1: NativeSwap (BTC Integration)

### When to Use

- ✅ BTC holders want to hedge OP20 positions
- ✅ Options on BTC-denominated prices
- ✅ Users prefer native BTC, not wrapped tokens
- ✅ Familiar USD/BTC-style strike prices

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    NATIVESWAP MODE                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Writer                           Buyer                    │
│   (locks OP20)                     (pays BTC)              │
│       │                                │                    │
│       ▼                                ▼                    │
│   ┌────────────┐                ┌────────────┐             │
│   │  Collateral│                │ BTC Premium│             │
│   │   (MOTO)   │                │  (native)  │             │
│   └─────┬──────┘                └─────┬──────┘             │
│         │                             │                     │
│         │      ┌──────────┐          │                     │
│         └─────►│ Contract │◄─────────┘                     │
│                │  (escrow)│                                │
│                └────┬─────┘                                │
│                     │                                       │
│                     ▼                                       │
│              ┌────────────┐                                │
│              │NativeSwap  │                                │
│              │  Oracle    │                                │
│              │(BTC price) │                                │
│              └────────────┘                                │
│                                                             │
│   Settlement:                                                │
│   - ITM: Buyer gets collateral, Writer keeps BTC           │
│   - OTM: Writer keeps collateral + BTC                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Purpose |
|-----------|---------|
| **Two-Phase Commit** | Reserve → Execute pattern |
| **CSV Timelocks** | 6+ block delay on writer BTC |
| **UTXO Verification** | Contract checks `Blockchain.tx.outputs` |
| **Virtual BTC Reserve** | Track BTC amounts in contract state |
| **Price Oracle** | NativeSwap provides BTC/OP20 rate |

### Pros & Cons

| Pros | Cons |
|------|------|
| Native BTC (no wrapping) | Higher complexity |
| BTC-denominated strikes | Requires CSV timelocks |
| Familiar pricing model | Two transactions per trade |
| Access to BTC liquidity | NativeSwap dependency |

---

## Mode 2: AMM Pool (OP20 Liquidity)

### When to Use

- ✅ OP20 token holders (MOTO, PILL, ODYS, etc.)
- ✅ Want to provide liquidity and earn fees
- ✅ Prefer simpler UX (single transaction)
- ✅ No BTC exposure needed

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                      AMM MODE                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────────────────────────────────────────┐  │
│   │              LIQUIDITY POOL                          │  │
│   │                                                     │  │
│   │   Underlying Reserve      Premium Reserve           │  │
│   │   (MOTO)                  (PILL)                    │  │
│   │                                                     │  │
│   │   10,000 MOTO             500,000 PILL              │  │
│   │                                                     │  │
│   │   ─────────────────────────────────────────────     │  │
│   │         Constant Product: x * y = k                 │  │
│   └─────────────────────────────────────────────────────┘  │
│                          │                                  │
│         ┌────────────────┼────────────────┐               │
│         ▼                ▼                ▼                │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐           │
│   │  Writer  │    │  Buyer   │    │    LP    │           │
│   │          │    │          │    │          │           │
│   │ Deposit  │    │   Pay    │    │ Deposit  │           │
│   │ MOTO     │    │ PILL     │    │ both     │           │
│   │          │    │ premium  │    │ assets   │           │
│   └──────────┘    └──────────┘    └──────────┘           │
│                                                             │
│   Strike: "50 PILL per MOTO"                               │
│   No oracle needed - pool reserves determine price         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Purpose |
|-----------|---------|
| **Pool Reserves** | Underlying + Premium token balances |
| **Constant Product** | `x * y = k` for pricing |
| **LP Tokens** | Represent pool share |
| **Fees** | 2-3% on each trade |
| **Permissionless Factory** | Anyone creates pools |

### Pros & Cons

| Pros | Cons |
|------|------|
| Simpler implementation | No native BTC |
| Single transaction trades | Impermanent loss for LPs |
| No external dependencies | Lower liquidity initially |
| Earn LP fees | Token-pair strikes only |
| Permissionless creation | 100% collateralization |

---

## Decision Matrix

| Your Priority | Recommended Mode |
|---------------|-----------------|
| Native BTC exposure | Mode 1: NativeSwap |
| Simpler UX | Mode 2: AMM |
| Earn passive income | Mode 2: AMM (as LP) |
| BTC-denominated pricing | Mode 1: NativeSwap |
| Lower gas/fees | Mode 2: AMM |
| No external dependencies | Mode 2: AMM |
| Maximum liquidity | Both (eventually) |

---

## Implementation Order

```
Phase 1: Core Options (P2P, OP20-only)
    │
    ▼
Phase 2: NativeSwap Integration (BTC premiums)
    │
    ▼
Phase 3: AMM Pools (Liquidity provision)
```

**Rationale:**
1. Phase 1 establishes core option mechanics
2. Phase 2 adds BTC for broader appeal
3. Phase 3 adds liquidity pools for capital efficiency

---

## Hybrid Future

Eventually, both modes can coexist:

```
┌─────────────────────────────────────────────────────────────┐
│                    UNIFIED OPTIONS                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────┐        ┌─────────────────┐          │
│   │  BTC-Backed     │        │  OP20 Pools     │          │
│   │  Options        │        │  (AMM)          │          │
│   │  (NativeSwap)   │        │                 │          │
│   └────────┬────────┘        └────────┬────────┘          │
│            │                          │                    │
│            └──────────┬───────────────┘                    │
│                       ▼                                    │
│            ┌─────────────────┐                            │
│            │  Unified API    │                            │
│            │  / Aggregator   │                            │
│            └─────────────────┘                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Next Steps

- [Mode 1: NativeSwap Details](./mode-1-nativeswap.md)
- [Mode 2: AMM Details](./mode-2-amm.md)
- [Phase 1 MVP Roadmap](../../internal/roadmap/PHASE_1_MVP.md)
