# FroGop Frontend Implementation Plan

## Overview

This document outlines the implementation plan for the FroGop frontend application - a decentralized options protocol interface built on Bitcoin L1 using OPNet.

**Related Documents:**
- [Phase 1: MVP](../roadmap/PHASE_1_MVP.md) - Current phase
- [Phase 2: NativeSwap Integration](../roadmap/PHASE_2_NATIVE.md) - Planned
- [Phase 3: AMM Liquidity Pools](../roadmap/PHASE_3_AMM.md) - Future

---

## 1. Project Structure

### Directory Separation

```
frogop/
├── contracts/                    # Smart contracts (current location)
│   ├── src/
│   ├── tests/
│   ├── build/
│   └── package.json
│
├── frontend/                     # Frontend application (NEW - separate)
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── README.md
│
├── docs/                         # Shared documentation
└── README.md                     # Root readme
```

### Why Separate Location?

| Aspect | Contracts | Frontend |
|--------|-----------|----------|
| Language | AssemblyScript | TypeScript/React |
| Build System | asc (AssemblyScript) | Vite |
| Dependencies | @btc-vision/btc-runtime | React, opnet, opwallet |
| Deployment | OPNet WASM | IPFS/Static hosting |
| Testing | Unit tests (mock) | Integration tests (real) |

---

## 2. Technology Stack

### Core Technologies

| Category | Technology | Rationale |
|----------|------------|-----------|
| **Framework** | React 18+ | Component-based, ecosystem |
| **Build Tool** | Vite | Fast, modern, ESM-native |
| **Language** | TypeScript | Type safety, IDE support |
| **Styling** | Tailwind CSS | Utility-first, rapid development |
| **State** | Zustand | Lightweight, simple |
| **Routing** | React Router | Standard routing solution |

### Web3 Integration

| Library | Purpose |
|---------|---------|
| `@btc-vision/opwallet` | Wallet connection (OPWallet, Unisat) |
| `@btc-vision/transaction` | Transaction building/signing |
| `opnet` | OPNet provider, contract interaction |
| `@btc-vision/bitcoin` | Bitcoin network utilities |

---

## 3. Feature Requirements

### 3.1 Core Functionality (MVP)

Based on current smart contract capabilities:

| Feature | Contract Method | Priority |
|---------|-----------------|----------|
| Connect Wallet | N/A (wallet connection) | P0 |
| List All Pools | `factory.getPoolCount()` + `factory.getPoolByIndex(i)` | P0 |
| Pool Discovery | `factory.getPoolCount()` + `getPoolByIndex()` | P0 |
| View Options in Pool | `pool.getOptionsBatch(startId, count)` — client-side filter by status | P0 |
| Single Option Detail | `pool.getOption(id)` | P0 |
| Write Option | `pool.writeOption()` | P0 |
| Buy Option | `pool.buyOption()` | P0 |
| View Portfolio | `pool.getOptionsBatch()` per pool — filter client-side by `writer/buyer == me` | P0 |
| Cancel Option | `pool.cancelOption()` | P1 |
| Exercise Option | `pool.exercise()` | P0 |
| Settle Option | `pool.settle()` | P1 |

> **Note:** `getOptionsByWriter()` and `getOptionsByBuyer()` do not exist on-chain. Phase 1 uses client-side filtering via `getOptionsBatch()`. Per-address on-chain indices are Phase 2.

### 3.2 User Flows

#### Flow 1: Write Option
```
1. Connect wallet
2. Select/Create pool
3. Choose option type (CALL/PUT)
4. Enter parameters:
   - Strike price (token ratio)
   - Expiry (block height)
   - Underlying amount
   - Premium
5. Approve token spending
6. Submit transaction
7. Confirm transaction
```

#### Flow 2: Buy Option
```
1. Connect wallet
2. Browse available options
3. Select option
4. Review details
5. Approve premium token
6. Submit purchase
7. Confirm transaction
```

#### Flow 3: Exercise Option
```
1. Connect wallet
2. View purchased options
3. Select ITM option
4. Verify expiry passed
5. Approve strike token (if CALL)
6. Submit exercise
7. Receive underlying
```

---

## 4. Application Architecture

### 4.1 Page Structure

```
/                           # Landing page (what is FroGop?)
/pools                      # Pool browser
/pools/:poolAddress         # Pool detail (options list)
/write                      # Write new option
/portfolio                  # User's options
/portfolio/written          # Options user wrote
/portfolio/purchased        # Options user bought
/about                      # About/roadmap
/docs                       # Documentation
```

### 4.2 Component Hierarchy

```
App
├── Layout
│   ├── Header
│   │   ├── Logo
│   │   ├── Navigation
│   │   └── WalletConnect
│   └── Footer
│
├── Pages
│   ├── LandingPage
│   │   ├── HeroSection
│   │   ├── WhatIsFroGop
│   │   ├── HowItWorks
│   │   ├── Features
│   │   └── Roadmap
│   │
│   ├── PoolsPage
│   │   ├── PoolList
│   │   ├── PoolSelector  (factory-driven pool discovery)
│   │   └── PoolFilters
│   │
│   ├── PoolDetailPage
│   │   ├── PoolInfo
│   │   ├── OptionsList
│   │   ├── OptionFilters
│   │   └── WriteOptionButton
│   │
│   ├── WriteOptionPage
│   │   ├── PoolSelector
│   │   ├── OptionTypeSelector
│   │   ├── ParameterInputs
│   │   ├── PreviewSection
│   │   └── SubmitButton
│   │
│   ├── PortfolioPage
│   │   ├── TabNav (Written/Purchased)
│   │   ├── OptionCard
│   │   ├── ExerciseModal
│   │   ├── CancelModal
│   │   └── SettleModal
│   │
│   └── AboutPage
│       ├── WhatIsFroGop
│       ├── Roadmap
│       ├── Team
│       └── Links
│
└── Modals
    ├── WalletModal
    ├── TransactionModal
    ├── ConfirmModal
    └── ErrorModal
```

### 4.3 State Management

```typescript
// stores/walletStore.ts
interface WalletState {
  connected: boolean;
  address: string | null;
  balance: bigint;
  connect: () => Promise<void>;
  disconnect: () => void;
}

// stores/poolStore.ts
interface PoolState {
  pools: Pool[];
  selectedPool: Pool | null;
  loading: boolean;
  fetchPools: () => Promise<void>;
  // Pool creation is admin-only — not exposed in frontend
}

// stores/optionStore.ts
interface OptionState {
  options: Option[];
  userOptions: { written: Option[]; purchased: Option[] };
  loading: boolean;
  fetchOptions: (poolAddress: string) => Promise<void>;
  writeOption: (params: WriteOptionParams) => Promise<void>;
  buyOption: (optionId: bigint) => Promise<void>;
  exerciseOption: (optionId: bigint) => Promise<void>;
}
```

---

## 5. Landing Page Content

### 5.1 Hero Section

```
Title: "Decentralized Options on Bitcoin"
Subtitle: "Write, trade, and exercise CALL and PUT options for any 
          Bitcoin-native assets - trustlessly on Bitcoin L1"

CTA Buttons:
- "Launch App" → /pools
- "Read Docs" → /docs
```

### 5.2 What is FroGop?

```
FroGop is a decentralized options protocol built on Bitcoin L1 using OPNet.

Key Features:
- No oracle dependency - strike prices are token pair ratios
- Trustless settlement - automated via smart contracts
- Bitcoin-native - works with OP20 tokens on Bitcoin
- Permissionless trading - anyone can write, buy, and exercise options

How it's different:
- Not on Ethereum/L2 - built directly on Bitcoin
- No price feeds - uses on-chain token ratios
- Self-custodial - you control your assets
- Transparent - all logic on-chain
```

### 5.3 How Options Work

```
CALL Option:
- Right to BUY underlying at strike price
- Profit when underlying price > strike price
- Writer: locks underlying, receives premium
- Buyer: pays premium, can exercise ITM

PUT Option:
- Right to SELL underlying at strike price
- Profit when underlying price < strike price
- Writer: locks strike token, receives premium
- Buyer: pays premium, can exercise ITM
```

### 5.4 Roadmap Section

```
Phase 1: MVP - Core Options (Current)
- Peer-to-peer options trading with OP20 tokens
- CALL and PUT options
- Token-pair strikes (e.g., PILL per MOTO)
- 100% collateralization
- Block-height expiry
- Admin pool deployment + factory registry
- Full option lifecycle (write, buy, exercise, cancel, settle)

Phase 2: NativeSwap Integration (Planned)
- BTC premiums (buyers pay BTC to writers)
- BTC-denominated strikes
- NativeSwap price oracle integration
- CSV timelocks on BTC outputs
- Two-phase commit (reserve → execute)
- UTXO verification

Phase 3: AMM Liquidity Pools (Future)
- Automated market maker functionality
- LP token management
- Pool-based option pricing
- Covered call pools
- Cash-secured put pools
- Trading fees and LP rewards
```

---

## 6. Technical Implementation Details

### 6.1 Wallet Connection

```typescript
// hooks/useWallet.ts
import { OPWallet } from '@btc-vision/opwallet';

export function useWallet() {
  const connect = async () => {
    const wallet = new OPWallet();
    await wallet.connect();
    // Returns: { address, publicKey, balance }
  };
  
  return { connect };
}
```

### 6.2 Contract Interaction

```typescript
// services/poolService.ts
import { JSONRpcProvider } from 'opnet';
import { OptionsPoolABI } from '@frogop/contracts';

export class PoolService {
  private provider: JSONRpcProvider;
  
  async getOption(poolAddress: string, optionId: bigint) {
    const pool = this.provider.getContract(poolAddress, OptionsPoolABI);
    return await pool.getOption(optionId);
  }
  
  async writeOption(poolAddress: string, params: WriteOptionParams) {
    // 1. Approve token spending
    // 2. Build transaction
    // 3. Sign and broadcast
  }
}
```

### 6.3 Block Height Utilities

```typescript
// utils/blocks.ts
export const BLOCK_CONSTANTS = {
  BLOCKS_PER_DAY: 144,
  BLOCKS_PER_WEEK: 1008,
  BLOCKS_PER_MONTH: 4320,
};

export function blocksToDays(blocks: bigint): number {
  return Number(blocks) / BLOCK_CONSTANTS.BLOCKS_PER_DAY;
}

export function getExpiryLabel(expiryBlock: bigint, currentBlock: bigint): string {
  const remaining = expiryBlock - currentBlock;
  if (remaining <= 0n) return 'Expired';
  if (remaining < 144n) return `${remaining} blocks (~1 day)`;
  // ... more formatting
}
```

---

## 7. Design Guidelines

### 7.1 Color Palette

```css
/* Bitcoin-inspired colors */
--btc-orange: #F7931A;
--btc-dark: #0D0D0D;
--primary: #4F46E5;      /* Indigo - trust */
--secondary: #10B981;    /* Emerald - success */
--warning: #F59E0B;      /* Amber - caution */
--danger: #EF4444;       /* Red - danger */
```

### 7.2 Typography

```
Headings: Inter (sans-serif, bold)
Body: Inter (sans-serif, regular)
Monospace: JetBrains Mono (addresses, hashes)
```

### 7.3 Key UI Components

| Component | Purpose |
|-----------|---------|
| `OptionCard` | Display option details |
| `PoolCard` | Display pool info |
| `TransactionButton` | Loading/disabled states |
| `AddressDisplay` | Truncated address with copy |
| `BlockHeightDisplay` | Show block + time estimate |
| `TokenAmountInput` | Amount + token selector |
| `StatusBadge` | OPEN/PURCHASED/EXERCISED/etc. |

---

## 8. Development Phases

### Phase A: Setup (2 days)
- [ ] Create `frontend/` directory
- [ ] Initialize Vite + React + TypeScript
- [ ] Configure Tailwind CSS
- [ ] Set up routing
- [ ] Configure environment variables
- [ ] Set up wallet connection

### Phase B: Core Pages (3 days)
- [ ] Landing page structure
- [ ] Pool browser page
- [ ] Pool detail page
- [ ] Write option page
- [ ] Portfolio page

### Phase C: Contract Integration (4 days)
- [ ] Pool service implementation
- [ ] Option service implementation
- [ ] Token approval flows
- [ ] Transaction handling
- [ ] Error handling

### Phase D: Polish (2 days)
- [ ] Loading states
- [ ] Error messages
- [ ] Success confirmations
- [ ] Mobile responsiveness
- [ ] Documentation

### Phase E: Testing (2 days)
- [ ] Component tests
- [ ] Integration tests
- [ ] E2E tests on testnet

---

## 9. Environment Configuration

### Required Environment Variables

```env
# frontend/.env
VITE_OPNET_NETWORK=testnet
VITE_OPNET_RPC_URL=https://testnet.opnet.org
VITE_FACTORY_ADDRESS=0x...
VITE_POOL_TEMPLATE_ADDRESS=0x...
```

### Network Configuration

```typescript
// config/networks.ts
export const NETWORKS = {
  regtest: {
    rpc: 'https://regtest.opnet.org',
    explorer: 'https://mempool.opnet.org',
  },
  testnet: {
    rpc: 'https://testnet.opnet.org',
    explorer: 'https://mempool.opnet.org',
  },
  mainnet: {
    rpc: 'https://mainnet.opnet.org',
    explorer: 'https://mempool.opnet.org',
  },
};
```

---

## 10. Deployment

### Build Process

```bash
cd frontend
npm run build
# Output: frontend/dist/
```

### Hosting: Cloudflare Workers (Static Assets)

FroGop frontend is deployed via **Cloudflare Workers with static assets** — free tier, global CDN, auto-deploy on push to `master`.

See [`docs/deployment/CLOUDFLARE_PAGES.md`](../../docs/deployment/CLOUDFLARE_PAGES.md) for the full setup guide.

```
Push to master
  → Cloudflare builds: cd frontend && npm install --legacy-peer-deps && npm run build
  → wrangler deploys frontend/dist/ → Cloudflare edge (global CDN)
  → SPA routing via not_found_handling = "single-page-application" in wrangler.toml
```

**Environment variables** are set in the Cloudflare dashboard (Settings → Environment Variables) and baked into the JS bundle at build time:

| Variable | Value |
|---|---|
| `VITE_OPNET_NETWORK` | `testnet` |
| `VITE_OPNET_RPC_URL` | `https://testnet.opnet.org` |
| `VITE_FACTORY_ADDRESS` | *(set after contract deployment)* |
| `VITE_POOL_TEMPLATE_ADDRESS` | *(set after contract deployment)* |

### Local Development

```bash
cd frontend
npm install
npm run dev
# Available at http://localhost:5173
```

---

## 11. Success Criteria

### MVP Complete When:

- [ ] Users can connect OPWallet
- [ ] Users can view all pools (via getPoolCount + getPoolByIndex)
- [ ] Users can create new pools
- [ ] Users can write options
- [ ] Users can buy options
- [ ] Users can view their portfolio (via getOptionsBatch + client filter)
- [ ] Users can exercise options
- [ ] All transactions confirm successfully
- [ ] Mobile responsive
- [ ] Deployed to Cloudflare Workers on testnet

---

## 12. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Wallet incompatibility | Test multiple wallets (OPWallet, Unisat) |
| Transaction failures | Clear error messages, retry logic |
| Network congestion | Fee estimation, user warnings |
| Contract changes | ABI versioning, upgrade path |
| Mobile issues | Responsive design, touch-friendly |

---

## Next Steps

1. **Review and approve** this implementation plan
2. **Set up** `frontend/` directory structure
3. **Initialize** Vite project with dependencies
4. **Begin** Phase A (Setup)
5. **Iterate** through phases B-E

---

*Document Version: 1.0*
*Last Updated: 2026-02-24*
*Status: Planning Complete - Ready for Implementation*
