# FroGop Frontend User Flows

All user flows in the FroGop options platform frontend.

## Core Option Flows

### 1. Write Option (2-step)
**Component**: `WriteOptionPanel.tsx`
**Steps**: Approve MOTO collateral → Write option on-chain
**Resume**: FlowResumeCard supports re-opening the panel with saved form state

### 2. Buy Option (2-step)
**Component**: `BuyOptionModal.tsx`
**Steps**: Approve PILL premium → Buy option on-chain
**Resume**: FlowResumeCard targets the specific option ID

### 3. Exercise Option (2-step)
**Component**: `ExerciseModal.tsx`
**Steps**: Approve strike value in PILL → Exercise on-chain
**Available on**: PoolsPage and PortfolioPage (grace period active, buyer only)

### 4. Cancel Option (1-step)
**Component**: `CancelModal.tsx`
**Steps**: Cancel option → collateral returned (minus cancel fee)
**Available on**: PoolsPage and PortfolioPage (OPEN status, writer only)

### 5. Settle Option (1-step)
**Component**: `SettleModal.tsx`
**Steps**: Settle expired/unexercised option → collateral returned
**Available on**: PoolsPage and PortfolioPage (after grace period, any user)

### 6. Transfer Option (1-step)
**Component**: `TransferModal.tsx`
**Steps**: Enter recipient address → Transfer ownership on-chain
**Available on**: PortfolioPage (PURCHASED status, buyer only)

### 7. Roll Option (1-step)
**Component**: `RollModal.tsx`
**Steps**: Cancel + re-write with new expiry → extends position
**Available on**: PoolsPage and PortfolioPage (OPEN status, writer only)

### 8. Batch Cancel (1-step)
**Component**: `BatchCancelModal.tsx`
**Steps**: Select multiple OPEN options → Cancel all in one TX
**Available on**: PoolsPage (checkbox selection)

### 9. Batch Settle (1-step)
**Component**: `BatchSettleModal.tsx`
**Steps**: Select multiple expired options → Settle all in one TX
**Available on**: PoolsPage (checkbox selection)

## Strategy Flows

### 10. Covered Call
**Entry**: QuickStrategies card → pre-fills WriteOptionPanel
**Params**: CALL at 120% spot, 30-day expiry
**Goal**: Earn premium on MOTO holdings

### 11. Protective Put
**Entry**: QuickStrategies card → opens BuyOptionModal with best PUT
**Params**: PUT at 80-95% spot
**Goal**: Insure MOTO against price drops

### 12. Write Put
**Entry**: QuickStrategies card → pre-fills WriteOptionPanel
**Params**: PUT at 80% spot
**Goal**: Earn premium; willing to buy MOTO at lower price

### 13. Collar Strategy (2-leg)
**Component**: `CollarModal.tsx`
**Steps**: Write CALL (earn premium) → Buy PUT (spend premium)
**Persistence**: Progress tracked in localStorage per wallet
**Status**: Surfaced on PortfolioPage when in-progress

## Transaction Flow Management

### TransactionContext
- Persists up to 100 TXs per wallet in localStorage
- Supports parallel flows (up to 5 concurrent)
- Auto-syncs flow status when TXs confirm
- Resume via FlowResumeCard in TransactionToast

### FlowResumeCard
- Shows in TransactionToast dropdown for active 2-step flows
- "Resume" button re-opens the modal to complete step 2
- "Abandon" button removes the flow

### TransactionToast
- Fixed-position pill showing pending TX count
- Expandable dropdown with TX list and flow cards
- "View All Transactions" link to `/transactions`

## Navigation Flows

### Pool Discovery
- Factory-based pool enumeration on PoolsPage
- Pool selector when multiple pools exist
- Selection persisted in sessionStorage

### Option Detail
- Route: `/pools/:addr/options/:id`
- Clickable option IDs in OptionsTable
- Breadcrumb navigation back to Pools

### Transaction History
- Route: `/transactions`
- Full paginated TX table with filters
- CSV export

## User Experience Features

### Onboarding
- 5-step CSS highlight tour on first connected visit
- Tracked via localStorage
- Re-triggerable from footer "Show Tutorial" link

### Notifications
- Status change detection (option bought, exercised, etc.)
- In-app NotificationBanner + browser Notification API
- Expiry alerts for purchased options approaching grace deadline

### Advanced Filtering
- Collapsible filter panel in OptionsTable
- Strike range, premium range, expiry window, CALL/PUT toggle
- Sortable columns (ID, Strike, Premium, Expiry, Amount)

### Portfolio Dashboard
- PortfolioSummaryCard: premiums earned/spent, fees, position counts
- PositionBreakdown: visual bar of positions by type
- User-centric status labels (writer vs buyer perspective)
- Active strategy status (in-progress Collar)
