# Frontend ↔ Testnet Contract Integration Plan (Reference)

> Saved from planning session 2026-02-26. Execute AFTER contract method tests pass.

## Deployed Contracts (Testnet)

- FROG-U: `opt1sqzhdrmtdrjmk2m7gq5z98vn2afkr5ln2vyj76y9u`
- FROG-P: `opt1sqr582w38c6w37y43nnw08yk07ynq37lqng4wd0ue`
- Factory: `opt1sqz5dfcvs3sywhzatpvclx88ytp7xyj6rxq06feex`
- Pool: `opt1sqrd0yqesuam0ktrwqz97lszcuk2key94fvj8van3`

## Current Frontend State

- React 19 + Vite 7 + Tailwind 4 + Zustand 5
- 4 routes: Landing (done), About (done), Pools (placeholder), Portfolio (placeholder)
- `@btc-vision/walletconnect` installed but unused
- Custom `walletStore.ts` uses manual `window.opwallet` — should be replaced
- `src/services/` and `src/hooks/` are empty
- ABIs generated at `abis/OptionsPool.abi.ts`, `abis/OptionsFactory.abi.ts`

## Phase 1: Wallet + Config

### 1a. Replace walletStore with `@btc-vision/walletconnect`

- `main.tsx`: Wrap `<App>` with `<WalletConnectProvider theme="dark">`
- `Layout.tsx`: Use `useWalletConnect()` → `walletAddress`, `openConnectModal`, `disconnect`, `connecting`
- Delete `stores/walletStore.ts`

### 1b. Config updates

- `.env.testnet`: Add `VITE_POOL_ADDRESS`, `VITE_FROG_U_ADDRESS`, `VITE_FROG_P_ADDRESS`
- `config/index.ts`: Add pool + token addresses to `CONTRACT_ADDRESSES`

## Phase 2: Contract Service Layer

### Types (`src/types/contracts.ts`)
- `OptionType` const (CALL=0, PUT=1)
- `OptionStatus` const (OPEN=0, PURCHASED=1, EXERCISED=2, EXPIRED=3, CANCELLED=4)
- `OptionData` interface, `PoolInfo` interface

### ABI wrappers (`src/contracts/`)
- `poolAbi.ts`: Import ABI, define `IOptionsPoolContract extends BaseContractProperties`
- `factoryAbi.ts`: Import ABI, define `IOptionsFactoryContract extends BaseContractProperties`
- Pattern: `getContract<IOptionsPoolContract>(address, ABI, provider, network, sender)`

### React hooks (`src/hooks/`)
- `usePoolContract.ts`: Pool reads (fetchPoolInfo, fetchOption, fetchAllOptions) + writes (writeOption, buyOption, cancelOption, exercise, settle)
- `useTokenContract.ts`: OP20 reads (balanceOf, allowance) + writes (increaseAllowance)
- `usePool.ts`: Combines above, manages state, auto-fetches, handles allowance-then-call flows

### OPNet Frontend Rules
- `signer: null, mldsaSigner: null` in `sendTransaction()` — wallet handles signing
- `getContract()` from `opnet` package — never raw RPC or manual encoding
- Cache provider + contract instances (singleton per network/address)
- Poll refresh on block change

## Phase 3: Pools Page

Replace placeholder with:
1. Pool Info Card (tokens, option count, fees, config)
2. Options Table (all options, status badges, CALL green / PUT red)
3. Write Option Form (type, strike, expiry, amount, premium → collateral calc → submit)
4. Action Buttons per option (Cancel if writer+OPEN, Buy if not-writer+OPEN, Exercise if buyer+eligible, Settle if expired)

**User preference**: Global view (show all options, not wallet-filtered)

## Phase 4: Portfolio Page

Replace placeholder with:
1. My Written Options (filter writer == wallet)
2. My Purchased Options (filter buyer == wallet)
3. Balances Card (FROG-U + FROG-P for connected wallet)

## File Summary

| Action | File |
|--------|------|
| Modify | `frontend/src/main.tsx` |
| Modify | `frontend/src/components/Layout.tsx` |
| Delete | `frontend/src/stores/walletStore.ts` |
| Modify | `frontend/.env.testnet` |
| Modify | `frontend/src/config/index.ts` |
| Create | `frontend/src/types/contracts.ts` |
| Create | `frontend/src/contracts/poolAbi.ts` |
| Create | `frontend/src/contracts/factoryAbi.ts` |
| Create | `frontend/src/hooks/usePoolContract.ts` |
| Create | `frontend/src/hooks/useTokenContract.ts` |
| Create | `frontend/src/hooks/usePool.ts` |
| Modify | `frontend/src/pages/PoolsPage.tsx` |
| Modify | `frontend/src/pages/PortfolioPage.tsx` |
