# FrogOp - Options Protocol on OPNet

Bitcoin-native options protocol built on OPNet (Bitcoin Layer 1 smart contracts).
test
## Overview

FrogOp enables trustless options trading with two integration modes:

| Mode | Premium Asset | Collateral | Use Case |
|------|---------------|------------|----------|
| **NativeSwap** | Native BTC | OP20 tokens | BTC holders, hedgers |
| **AMM Pool** | OP20 tokens | OP20 tokens | Token speculators, LPs |

## Features

- **Call Options**: Right to buy underlying at strike price
- **Put Options**: Right to sell underlying at strike price
- **Token-Pair Strikes**: Strike expressed as `premiumToken / underlyingToken` (no oracle needed)
- **Permissionless Pools**: Anyone can create new option markets
- **Block-Height Expiry**: Uses block number, not manipulable timestamps

## Quick Links

- [Architecture](./ARCHITECTURE.md)
- [Mode Comparison](./modes/mode-comparison.md)
- [Security Model](./security/THREAT_MODEL.md)

## Integration Modes

- [Mode 1: NativeSwap (BTC)](./modes/mode-1-nativeswap.md) - BTC premiums via NativeSwap
- [Mode 2: AMM Pool](./modes/mode-2-amm.md) - OP20 liquidity pools

## Contracts

- [OptionsFactory](./contracts/OptionsFactory.md) - Permissionless pool creation
- [OptionsPool](./contracts/OptionsPool.md) - Individual option market
- [NativeSwapBridge](./contracts/NativeSwapBridge.md) - BTC verification (Phase 2)
- [AMMPool](./contracts/AMMPool.md) - Liquidity pools (Phase 3)

## Roadmap

| Phase | Features | Status |
|-------|----------|--------|
| [Phase 1: MVP](../internal/roadmap/PHASE_1_MVP.md) | Core options (Calls + Puts, OP20-only) | Planning |
| [Phase 2: Native](../internal/roadmap/PHASE_2_NATIVE.md) | NativeSwap BTC integration | Future |
| [Phase 3: AMM](../internal/roadmap/PHASE_3_AMM.md) | Liquidity pools, LP rewards | Future |

## Technology Stack

- **Smart Contracts**: AssemblyScript → WASM
- **Runtime**: OPNet btc-runtime
- **Network**: Bitcoin L1 (regtest → mainnet)
- **Frontend**: React + Vite + @btc-vision/opwallet

## Getting Started

```bash
# Clone repository
git clone https://github.com/your-org/frogop.git
cd frogop

# Install dependencies (contracts)
npm install

# Build contracts
npm run build

# Run tests
npm test
```

## Security

See [Threat Model](./security/THREAT_MODEL.md) and [Audit Checklist](../internal/security/AUDIT_CHECKLIST.md).

## License

MIT
