# Phase 1 — Completed Work

> Condensed record of all Phase 1 deliverables. For active work, see [sprintboard.md](sprintboard.md).

## Scope Delivered

- Call + Put options with 100% collateralization
- Token-pair strikes (PILL per MOTO), no oracle
- Block-height expiry with 144-block grace period
- Full lifecycle: write, buy, exercise, cancel, settle, transfer, roll
- Batch operations: batchCancel, batchSettle
- Protocol fees: buy 1%, exercise 0.1%, cancel 1% (ceiling division, dedicated feeRecipient)
- Pool enumeration: getPoolCount, getPoolByIndex, registerPool
- Batch fetch: getOptionsBatch (max 9 per call, 2048-byte OPNet limit)
- Frontend MVP (React 19 + Vite + Tailwind), 6 pages, 9 modal flows, 3 strategy templates
- Indexer (CF Workers + D1), block polling, event decoding, REST API, OHLCV candles
- Testnet deployment (Signet fork), all integration tests passing

## Sprint History

| Sprint | Focus | Key Deliverables |
|--------|-------|-----------------|
| **1** | Setup & Factory | Project scaffolding, OptionsFactory (createPool, getPool, registry) |
| **2** | Write & Cancel | writeOption(), cancelOption(), OptionStorage, 1% cancel fee |
| **3** | Buy & Exercise | buyOption(), exercise() call/put, settle(), grace period |
| **4** | Security & Testing | Reentrancy guards, SafeMath, access control, view methods |
| **4.5** | Gas Optimization | Removed SHA256 from storage, field packing (9→7 slots), ReentrancyGuard |
| **5** | Fees & Queries | Protocol revenue model, getPoolCount fix, getPoolByIndex, getOptionsBatch, registerPool |
| **5+** | Frontend & Infra | Wallet connect, all modal flows, price charts, WS real-time, TX tracking, CI/CD |

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Phase 2 priority | NativeSwap (BTC) | Wider market appeal |
| AMM pool type | Covered Call + Cash-Secured Put | Conservative, capital efficient |
| Strike denomination | Token pair (no oracle) | Simpler, no external dependency |
| Pool creation | Admin deploy + factory registry | OPNet runtime lacks deployContractFromExisting |
| Storage pattern | Direct pointer arithmetic | SHA256 per-option was too expensive |
| Expiry mechanism | Block height | medianTimestamp is manipulable |

## Deployment Artifacts

| Component | Status | Location |
|-----------|--------|----------|
| OptionsFactory WASM | Deployed (testnet) | Factory address in .env |
| OptionsPool WASM | Deployed (testnet) | `opt1sqqled6uxmlx0zrlqnz6x2eq500vprj2ssuaefveq` |
| Frontend | Live | Cloudflare Pages (auto-deploy on push to master) |
| Indexer | Live | `api.frogop.net` (CF Workers + D1, 5-min cron) |
| CI/CD | Active | 4 GitHub Actions: contracts, frontend, indexer, sync-public |

## Excluded from Phase 1

Deferred to future phases — see research docs:
- BTC premiums / BTC strikes (Phase 2 — [native-swap-bridge](../research/native-swap-bridge.md))
- CSV timelocks (Phase 2 — [csv-timelocks](../research/csv-timelocks.md))
- AMM liquidity pools / LP tokens (Phase 3 — [amm-pool](../research/amm-pool.md))
- Per-address on-chain option index (Phase 2)
- Partial collateral / leverage
