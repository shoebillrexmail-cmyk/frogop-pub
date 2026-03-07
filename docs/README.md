# FroGop Documentation

## Structure

### [technical/](technical/) — Implemented Code Documentation
Documentation verified against actual source code. **Code is source of truth.**

- [Architecture](technical/architecture.md) — System overview (Factory + Pool + Frontend + Indexer)
- [OptionsFactory ABI](technical/contracts/options-factory.md) — Factory contract methods
- [OptionsPool ABI](technical/contracts/options-pool.md) — Pool contract methods (write, buy, exercise, settle, cancel, transfer, roll)
- [Flow State](technical/frontend/flow-state.md) — On-chain-first flow derivation architecture
- [User Flows](technical/frontend/user-flows.md) — 9 modal step-by-step interaction flows
- [Integration Testing](technical/testing/integration-guide.md) — Testnet integration test setup
- [Cloudflare Pages](technical/deployment/cloudflare-pages.md) — Frontend deployment
- [Indexer](technical/deployment/indexer.md) — CF Workers + D1 indexer deployment
- [OPNet Optimization](technical/opnet/optimization.md) — WASM binary optimization patterns
- [OPNet Complexity Guide](technical/opnet/complexity-guide.md) — OPNet constraints and patterns

### [product/](product/) — Business Logic & Usage
End-user product documentation.

- [User Guide](product/user-guide.md) — How to use FroGop (write, buy, exercise options)
- [Fee Model](product/fee-model.md) — Protocol fee structure

### [research/](research/) — Unimplemented Feature Specs
Design documents for features not yet in the codebase. Linked to backlog items.

- [Research Index](research/README.md) — All research docs with implementation status

### [planning/](planning/) — Roadmap & Phase Specs
Active project roadmap and phase specifications.

- [Sprintboard](planning/sprintboard.md) — Active backlog and in-progress items
- [Phase 1 Completed](planning/phase-1-completed.md) — Record of all Phase 1 deliverables
- [Roadmap](planning/roadmap.md) — Unified Phase 1-3 timeline
- [Phase 1 Spec](planning/phase-1-spec.md) — Phase 1 technical spec (completed, reference)
- [Phase 2 Spec](planning/phase-2-native.md) — Native BTC integration (upcoming)
- [Phase 3 Spec](planning/phase-3-amm.md) — AMM liquidity pools (future)

---

See also: [legacy/](../legacy/) for archived sprint history and completed planning documents.
