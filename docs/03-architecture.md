# 03 · Architecture

## Layout

```
mercury/
├── apps/
│   ├── mobile/          Expo + React Native. iOS only for now.
│   ├── web/             Vite + React. The build judges will open.
│   └── landing/         Next.js. Marketing site.
├── services/
│   ├── api/             Hono on Node. The only thing the apps talk to.
│   └── worker/          Scheduled work: recurring buys, order watching, price cache.
├── packages/
│   ├── core/            Domain logic, no I/O. Pricing, wrapper choice, cost basis, baskets.
│   ├── chain/           Solana adapters. Jupiter, Symmetry, Kamino, RPC, token registry.
│   ├── market/          Reference prices, market hours, multipliers.
│   ├── types/           Shared types and Zod schemas.
│   └── sdk/             Typed API client used by web and mobile.
├── tooling/             Shared tsconfig. Eslint and prettier are configured at the root.
└── docs/
```

Dependency direction is one way and enforced by lint rules:

```
apps ──► sdk ──► types
apps ──► market, chain ──► types
services ──► core ──► types
services ──► chain, market ──► types
```

`apps ──► market, chain` is the fallback edge, added in
[ADR 0011](adr/0011-server-preferred-prices.md): the web app reads Jupiter, Pyth and Kamino
directly when the API is unreachable, through the same adapters the server uses rather than a
second copy of them.

`core` never imports `chain` or `market`. It receives quotes and prices as plain data and
returns decisions. That is the whole reason the execution engine can be tested without a network.

## Stack, and why

| Layer         | Choice                                             | Reason                                                                                                                                                        |
| ------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo      | pnpm workspaces + Turborepo                        | Standard, fast, good caching. Node 24, pnpm 10                                                                                                                |
| Language      | TypeScript, strict, `noUncheckedIndexedAccess`     | One language across server, web and mobile                                                                                                                    |
| API           | Hono on Node                                       | Tiny, excellent type inference, and its RPC mode gives the SDK end-to-end types from the route definitions                                                    |
| Validation    | Zod                                                | One schema shared by server and client. Parse at the boundary, trust inside                                                                                   |
| Database      | Postgres + Drizzle                                 | SQL we can read, migrations we control, types generated from the schema                                                                                       |
| Chain access  | `@solana/kit`                                      | The current Solana client. Tree-shakeable, typed, no legacy `web3.js` baggage                                                                                 |
| Routing       | Jupiter Swap API and Trigger API                   | Best aggregate liquidity on Solana, and Trigger gives on-chain limit orders that keepers fill without our server                                              |
| Lending       | Kamino SDK                                         | Already accepts tokenized stocks with an off-hours price band                                                                                                 |
| Prices        | Chainlink xStocks Data Streams                     | Official oracle for these assets. Pyth reads ~17bp low on them. [ADR 0006](adr/0006-pricing.md)                                                               |
| Baskets       | Symmetry Protocol, `@symmetry-hq/baskets-sdk`      | Permissionless vaults that already mint a token per basket. We integrate rather than write one. [ADR 0005](adr/0005-basket-vaults.md)                         |
| Funding       | Privy universal deposit addresses and card onramps | Fixes the empty-wallet cold start without us operating a ramp. [ADR 0007](adr/0007-wallet-funding.md)                                                         |
| Wallets       | Privy embedded only                                | An email becomes a Solana wallet in seconds. Delegated actions let recurring plans run unattended. No external wallets in v1. [ADR 0003](adr/0003-custody.md) |
| Web app       | Vite + React + React Router                        | Fast, no server rendering needed. It is an app, not a document                                                                                                |
| Mobile app    | Expo + React Native, Expo Router                   | One codebase, over-the-air updates, and a build judges can install                                                                                            |
| Landing       | Next.js                                            | Server rendering and metadata matter for exactly one surface, and this is it                                                                                  |
| Styling       | Tailwind on web, NativeWind on mobile              | Same token names either side                                                                                                                                  |
| Data fetching | TanStack Query                                     | Same cache semantics on web and mobile                                                                                                                        |
| Tests         | Vitest                                             | `core` is where the tests live                                                                                                                                |

## Services

### `services/api`

The preferred surface the apps talk to — not the only one. The web app also reads Jupiter, Pyth
and Kamino directly as a fallback when the API is unreachable, on a transport failure only and
never on a 4xx. The fallback covers market data; positions, orders and activity have no keyless
equivalent, so the degraded state is _live prices, no portfolio_. See
[ADR 0011](adr/0011-server-preferred-prices.md). Responsibilities:

- Resolve instruments and wrappers, and serve discovery shelves
- Produce an execution decision for a proposed order and return it with its reasoning
- Build unsigned transactions and hand them back for the client to sign
- Record fills, positions, lots and activity
- Serve the portfolio, exposure and activity views
- Own baskets and recurring plans

It **never holds a private key**. For ordinary buys the client signs. For delegated actions the
user has granted, it asks Privy to sign inside a policy. See [ADR 0003](adr/0003-custody.md).

### `services/worker`

Everything on a clock:

| Job                | Cadence                              | Does                                                                                  |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------------------------- |
| `price-cache`      | 15s while market open, 60s otherwise | Reference prices, session state, per-token multipliers                                |
| `multiplier-watch` | 5 min                                | Detects multiplier changes and writes a dividend event per holder                     |
| `queued-orders`    | 60s                                  | Checks the status of Jupiter trigger orders and records fills                         |
| `recurring`        | hourly                               | Finds plans due, creates orders, notifies the user to approve or uses the session key |
| `position-sync`    | 5 min                                | Reconciles our view of balances against chain                                         |

## Request path for a buy

```
mobile/web
   │  POST /v1/orders  { ticker, usdAmount, side }
   ▼
api ── market ──► reference price + session state
    ├─ chain ──► quote from every wrapper via Jupiter
    └─ core  ──► decide()  ──► EXECUTE | OFFER_QUEUE | REFUSE
   │  decision returned with candidates and reasoning
   ▼
mobile/web shows the confirmation
   │  POST /v1/orders/:id/execute
   ▼
api ── chain ──► build unsigned swap transaction
   │  unsigned tx returned
   ▼
client signs (Privy or Phantom) and submits
   │  POST /v1/orders/:id/confirm { signature }
   ▼
api verifies on chain, writes the lot, updates the position
```

The client signing rather than the server is the hinge of the whole design. It keeps us out of
custody, and it means the worst failure we can have is a bad recommendation rather than a
drained wallet.

## Environments

| Name         | Chain                    | Purpose                                    |
| ------------ | ------------------------ | ------------------------------------------ |
| `local`      | devnet or a mainnet fork | Development. Quotes mocked from fixtures   |
| `staging`    | mainnet                  | Real routes, tiny amounts, our own wallets |
| `production` | mainnet                  | The submitted build                        |

Devnet has no tokenized stocks, so anything touching quotes runs against mainnet with capped
amounts. Budget real money for testing and keep it small.

## What we are not doing

- **No microservices.** One API, one worker. Split when there is a reason.
- **No GraphQL.** The client surface is small and known.
- **No server-held keys.** Privy's TEE holds them. See ADR 0003.
- **No shared React component library across web and mobile.** Primitives differ too much.
  Design tokens are shared; components are not.
