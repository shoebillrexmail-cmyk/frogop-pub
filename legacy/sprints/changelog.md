# Frontend Changelog

## Sprint 7: Transaction Flow Clarity

### 7.1 Step Progress Indicator
- New `StepIndicator.tsx` component for 2-step modals
- Integrated into BuyOptionModal, ExerciseModal, WriteOptionPanel
- Shows "Step 1: Approve" / "Step 2: Execute" with real-time status

### 7.2 Post-Transaction Receipt
- New `TransactionReceipt.tsx` replacing generic success messages
- Shows TX type badge, token movements, fees, explorer link, next-steps guidance
- Integrated into all 9 modal types

### 7.3 Retry and Error Recovery
- New `formatTxError.ts` utility mapping OPNet errors to human-readable messages
- "Retry" button in all modals' error states
- FlowResumeCard shows guidance text on Resume button

### 7.4 Status Change Notifications
- New `useStatusChangeDetector` hook detecting option status transitions
- New `NotificationBanner.tsx` with auto-dismiss
- New `useNotifications.ts` hook with browser Notification API
- Integrated into PoolsPage and PortfolioPage

## Sprint 8: Portfolio Dashboard

### 8.1 Portfolio Summary Dashboard
- New `PortfolioSummaryCard.tsx` with aggregate metrics
- Shows premiums earned/spent, net premium, estimated fees
- `PositionBreakdown` sub-component with visual bar chart

### 8.2 User-Centric Status Labels
- New `statusLabels.ts` utility with `getUserStatusLabel()`
- Writer sees "Listed for sale", "Sold to buyer"
- Buyer sees "You own this", "You exercised"
- Applied in PortfolioPage OptionsTable instances

### 8.3 Option Detail Page
- New `OptionDetailPage.tsx` at `/pools/:addr/options/:id`
- Full option card with Greeks (delta, theta), writer/buyer addresses
- Breadcrumb navigation, clickable option IDs in OptionsTable

## Sprint 9: Navigation & Discovery

### 9.1 Advanced Options Table Filtering
- Collapsible "Advanced Filters" panel with strike/premium ranges
- Expiry window filter (24h, 7d, 30d)
- CALL/PUT type toggle
- Sortable columns (ID, Strike, Premium, Expiry, Amount)
- Context-aware empty states

### 9.2 Persist Pool Selection
- Pool selection saved to sessionStorage per tab
- Restored on PoolsPage mount

### 9.3 Portfolio Missing Actions
- Roll and Transfer modals added to PortfolioPage
- Writers can Roll from Portfolio; Buyers can Transfer
- Transfer button in OptionsTable RowAction for buyers

### 9.4 Onboarding Walkthrough
- New `OnboardingOverlay.tsx` — 5-step CSS highlight tour
- Tracks completion in localStorage
- "Show Tutorial" link in footer for re-triggering

## Sprint 10: Data & Export

### 10.1 Price Data Freshness Indicator
- `lastUpdated` added to `usePriceRatio` return
- PoolInfoCard shows both price directions (1 MOTO = X PILL, 1 PILL = Y MOTO)
- Freshness badge with color thresholds (green/amber/red)

### 10.2 Transaction History Page
- New `TransactionHistoryPage.tsx` at `/transactions`
- Full TX table with status/type filters, pagination (25/page)
- CSV export
- Storage cap increased from 20 to 100 entries
- "View All" link in TransactionToast dropdown

### 10.3 Strategy Flow Unification
- Collar step checklist already in CollarModal (localStorage-persisted)
- Active strategy status banner on PortfolioPage
- Educational tooltips on QuickStrategies cards

## Sprint 11: Accessibility & Polish

### 11.1 Expiry Notifications
- New `useExpiryAlerts` hook for purchased options approaching grace deadline
- New `ExpiryAlertBanner.tsx` with urgent/warning tiers
- Browser notification on first detection
- Integrated into PortfolioPage

### 11.2 Accessibility Improvements
- `max-h-[90vh] overflow-y-auto` on all modal content containers (9 modals)
- `role="status"` and `aria-live="polite"` on TransactionToast
- `aria-hidden="true"` on decorative status dots
- `aria-label` on floating pill button
- Navigation History link added to Layout
- `data-testid` attributes on all nav links

### 11.3 Documentation
- Created `docs/frontend/USER_FLOWS.md` covering all 13+ flows
- Created `docs/frontend/CHANGELOG.md` (this file)
