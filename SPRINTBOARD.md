# FroGop Sprintboard

## Backlog

### Infrastructure
- [ ] **Use WebSockets in integration tests** (`WebSocketRpcProvider` from `opnet`)
  - Replace polling `waitForBlock()` with `provider.subscribeBlocks()` event subscription
  - Eliminates ~5s polling intervals, responds instantly on new block
  - Also useful in frontend for real-time block/tx status updates
  - URL: `wss://testnet.opnet.org/ws` (testnet), `wss://regtest.opnet.org/ws` (regtest)
  - See: `tests/integration/config.ts` → `waitForBlock()` function

### Frontend
- [ ] **WebSocket real-time updates in frontend**
  - Subscribe to blocks for live block-height display
  - Subscribe to blocks to detect TX confirmations without polling

## In Progress

## Done
