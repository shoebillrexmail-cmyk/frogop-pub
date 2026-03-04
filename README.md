# FroGop — Options Protocol on OPNet

A decentralized options protocol built on Bitcoin L1 using OPNet smart contracts. FroGop enables users to write, trade, and exercise CALL and PUT options for any Bitcoin-native token pair.

## Overview

FroGop is a trustless options protocol that allows:
- **Option Writers** — Create CALL or PUT options by locking collateral, earn premiums
- **Option Buyers** — Purchase options by paying premiums, hedge or speculate
- **Settlement** — Automatic settlement at expiry with a 144-block grace period (~1 day)

### Key Features

- **Native Bitcoin L1** — Uses OPNet's WASM-based smart contracts on Bitcoin (Tapscript-encoded calldata)
- **Trustless Settlement** — No intermediaries, automated via smart contracts
- **Protocol Fees** — Buy 1%, cancel 1%, exercise 0.1% — ceiling division, routed to dedicated fee recipient
- **Strategy Templates** — Covered Call, Protective Put, and Collar strategies with one-click setup
- **Batch Operations** — Batch settle and batch cancel (up to 5 per TX)
- **Option Rolling** — Roll expiring options into new terms atomically
- **Fair Value Pricing** — Black-Scholes based premium suggestions with adjustable volatility
- **Wallet-Free Browsing** — View pools, options, and prices without connecting a wallet

### Status

**Phase 1 complete** — contracts deployed on OPNet testnet, frontend live on Cloudflare Pages, indexer running on Cloudflare Workers.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FroGop Protocol                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐          ┌─────────────────────────┐  │
│  │ OptionsFactory  │          │     OptionsPool         │  │
│  │                 │ registry │ (MOTO/PILL pair)        │  │
│  │ - Pool registry │◄────────►│ - Write / Buy / Exercise│  │
│  │ - Enumeration   │          │ - Cancel / Settle       │  │
│  └─────────────────┘          │ - Transfer / Roll       │  │
│                               │ - Batch operations      │  │
│                               │ - Fee collection        │  │
│                               └─────────────────────────┘  │
│                                                             │
│  ┌─────────────────┐          ┌─────────────────────────┐  │
│  │    Frontend      │          │      Indexer            │  │
│  │ React 19 + Vite │◄────────►│ Cloudflare Workers + D1 │  │
│  │ Tailwind CSS    │  REST    │ Price candles, history   │  │
│  └─────────────────┘          └─────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
frogop/
├── src/contracts/          # Smart contracts (AssemblyScript)
│   ├── factory/            # OptionsFactory — pool registry & enumeration
│   └── pool/               # OptionsPool — full options lifecycle
├── frontend/               # React 19 + Vite + Tailwind SPA
│   ├── src/components/     # UI components (modals, tables, charts, strategies)
│   ├── src/pages/          # Landing, PoolList, PoolDetail, Portfolio, OptionDetail, Transactions, About
│   ├── src/hooks/          # Contract interaction hooks
│   ├── src/services/       # RPC service layer, ABI encoding
│   └── src/utils/          # Option math, Black-Scholes, strategy helpers
├── indexer/                # Cloudflare Workers price indexer
│   ├── src/poller/         # Block polling & event decoding
│   ├── src/api/            # REST API (candles, prices, history)
│   ├── src/decoder/        # OPNet event decoding
│   └── src/db/             # D1 schema & queries
├── tests/                  # Unit + integration tests
│   ├── runtime/            # Test runtime helpers
│   └── integration/        # Testnet integration suite (11 numbered test files)
├── docs/                   # Documentation (see docs/README.md for full index)
└── abis/                   # Generated ABI files (JSON, TypeScript, type defs)
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
git clone https://github.com/shoebillrexmail-cmyk/frogop-pub.git
cd frogop-pub
npm install
```

### Build Contracts

```bash
# Build both contracts
npm run build

# Build individually
npm run build:factory
npm run build:pool
```

Build outputs:
- `build/*.wasm` — Compiled WebAssembly bytecode (deployed to Bitcoin)
- `abis/*.abi.json` / `*.abi.ts` / `*.d.ts` — Contract interface definitions

### Run Everything (Dev Mode)

```bash
npm run dev       # Runs indexer (port 8787) + frontend (port 5173) concurrently
```

### Run Frontend Only

```bash
cd frontend
npm install
npm run dev
```

### Run Tests

```bash
# Contract unit tests
npm test

# Frontend tests
cd frontend && npm test

# Indexer tests
cd indexer && npm test

# Integration tests (testnet — requires OPNET_MNEMONIC in .env)
npm run test:integration
```

## Contracts

### OptionsFactory
- Pool registration and enumeration (`getPoolCount`, `getPoolByIndex`)
- Template management
- Owner controls

### OptionsPool
- **Write** — Lock collateral, create CALL or PUT option
- **Buy** — Purchase an open option by paying premium + fee
- **Exercise** — Exercise in-the-money option during grace period
- **Cancel** — Writer cancels unclaimed option (fee deducted)
- **Settle** — Settle expired, unexercised option (collateral returned)
- **Transfer** — Transfer option ownership to another address
- **Roll** — Roll expiring option into new terms without manual close/reopen
- **Batch** — Batch settle and batch cancel for multiple options
- **Fees** — Buy 1%, Cancel 1%, Exercise 0.1% — ceiling division, routed to dedicated fee recipient

## Frontend

The frontend is a React 19 SPA with 7 pages:
- **Landing** — Protocol overview and getting started
- **Pool List** (`/pools`) — Searchable grid of all discovered pools with fee summaries
- **Pool Detail** (`/pools/:address`) — Options chain, price charts, Buy/Write tabs, strategy templates
- **Portfolio** — Track your written/bought options, P&L chart, position breakdown
- **Option Detail** — Deep-dive into a single option with action buttons
- **Transactions** — Full paginated TX history with filters and CSV export
- **About** — Protocol information

Key features:
- **Strategy Templates** — One-click Covered Call (120% OTM), Protective Put (80-95% OTM), Collar
- **Fair Value** — Black-Scholes premium suggestions with adjustable volatility (20-200%)
- **Network Status Bar** — Live gas, mempool count, and block countdown in header
- **Flow Tracking** — Resume interrupted 2-step flows (approve + action) via FlowResumeCard
- **Wallet-Free Mode** — Browse pools and prices without connecting a wallet

Supports OPNet wallet connection via `@btc-vision/walletconnect`.

## Indexer

Cloudflare Workers-based price indexer:
- Polls OPNet blocks for swap events (NativeSwap)
- Computes MOTO/PILL price ratios
- Stores 1-minute candles in D1 (SQLite)
- REST API: `/api/candles`, `/api/latest-price`

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Contracts | AssemblyScript on OPNet WASM runtime |
| Frontend | React 19, Vite, Tailwind CSS, TypeScript |
| Indexer | Cloudflare Workers, D1 (SQLite) |
| Testing | Vitest (frontend + indexer), OPNet unit test framework (contracts) |
| Network | OPNet testnet (Signet fork) |

## Documentation

See [`docs/README.md`](docs/README.md) for the full documentation index:
- **[Technical](docs/technical/)** — Contract ABIs, frontend architecture, deployment, testing (verified against source)
- **[Product](docs/product/)** — User guide, fee model

## OPNet Resources

- [OPNet Documentation](https://docs.opnet.org)
- [OPNet GitHub](https://github.com/btc-vision)
- [@btc-vision/bitcoin](https://www.npmjs.com/package/@btc-vision/bitcoin) — Network definitions
- [opnet](https://www.npmjs.com/package/opnet) — RPC provider & contract interaction

## License

MIT License — see LICENSE file for details.

## Acknowledgments

- OPNet team for the WASM smart contract platform on Bitcoin
- Bitcoin community for the base layer infrastructure
