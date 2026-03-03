# FroGop Sprintboard

> For completed Phase 1 work, see [phase-1-completed.md](phase-1-completed.md).

## Backlog

### Contracts
- [ ] **Update ABI documentation** — options-factory.md and options-pool.md have 23 discrepancies vs source code (see AUDIT notes)

### Frontend
- [ ] **On-chain TX history** — Replace localStorage-only TX tracking with RPC/indexer queries for persistent data
- [ ] **UX flow redesign** — Parallel TX support, modal persistence, per-TX status in pill ([research](../research/ux-flow-redesign.md))

### Indexer
- [ ] **Historical yield analytics** — Time-series snapshots in D1 for yield trends, TVL, volume metrics

### CI/CD
- [ ] **Create Cloudflare Pages project for frontend**
  - Run `wrangler pages project create frogop-frontend` once from CLI
  - Set environment variables in Pages dashboard

### Pre-Launch
- [ ] **Security audit** — Complete [audit checklist](../research/audit-checklist.md)
- [ ] **Mainnet migration** — Follow [migration checklist](../research/mainnet-migration.md)

## In Progress

(none)
