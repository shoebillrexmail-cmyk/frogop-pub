# FroGop Frontend

Decentralized Options on Bitcoin - Frontend Application

## Tech Stack

- **Framework**: React 18 + TypeScript
- **Build**: Vite
- **Styling**: Tailwind CSS
- **State**: React Context
- **Routing**: React Router

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start development server
npm run dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_OPNET_NETWORK` | Network (regtest/testnet/mainnet) | testnet |
| `VITE_FACTORY_ADDRESS` | OptionsFactory contract address | - |
| `VITE_POOL_TEMPLATE_ADDRESS` | OptionsPool template address | - |

## Project Structure

```
src/
├── components/     # Reusable UI components
├── pages/          # Page components
├── hooks/          # Custom React hooks
├── services/       # Contract interaction services
└── config/         # Configuration and utilities
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/pools` | Searchable pool listing |
| `/pools/:address` | Pool detail — options chain, write/buy tabs, strategies |
| `/pools/:addr/options/:id` | Single option detail |
| `/portfolio` | User's options |
| `/about` | About & roadmap |

## Build

```bash
npm run build
```

Output: `dist/`

## Related

- [Frontend Implementation Plan](../internal/frontend/FRONTEND_IMPLEMENTATION_PLAN.md)
- [Phase 1: MVP](../internal/roadmap/PHASE_1_MVP.md)
