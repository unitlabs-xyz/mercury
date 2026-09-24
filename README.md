<p align="center">
  <img src="docs/brand/mercury-wordmark.svg" alt="Mercury" width="200">
</p>

<h3 align="center">Your wealth. Onchain.</h3>

<p align="center">The financial account built for the onchain world.</p>

<p align="center">
  Hold your money, invest in stocks and ETFs, build diversified portfolios,<br>
  spend with your card, and access your wealth — all from a single wallet.
</p>

<p align="center"><strong>Hold. Invest. Grow. Spend.</strong></p>

---

Mercury brings the simplicity of a modern financial account to the onchain world. Hold
stablecoins, invest in stocks, ETFs, and curated portfolios, automate your investments, and spend
everyday with the Mercury Card — while keeping your wealth in one place.

Built on Solana for Colosseum's Crypto World's Fair. Submissions close **12 October 2026**.

## Read the docs in this order

| Doc | What it covers |
| --- | --- |
| [00 Overview](docs/00-overview.md) | What we are building and for whom, in one page |
| [01 Evidence](docs/01-evidence.md) | What we measured on-chain, and why it justifies the product |
| [02 Product](docs/02-product.md) | Every feature, in scope and out |
| [03 Architecture](docs/03-architecture.md) | Monorepo layout, stack, and why each choice |
| [04 Execution engine](docs/04-execution-engine.md) | The core algorithm. Read this one properly |
| [05 Data model](docs/05-data-model.md) | Entities, and the cost-basis rules that are easy to get wrong |
| [06 API](docs/06-api.md) | Endpoint contract between apps and server |
| [07 Design](docs/07-design.md) | Screens, states, and the apps we are copying |
| [08 Roadmap](docs/08-roadmap.md) | What ships by 12 October, and what comes after |
| [09 Open questions](docs/09-open-questions.md) | What is settled, and what is still open |
| [10 Baskets](docs/10-baskets.md) | The vault, and how a basket becomes one token |
| [11 References](docs/11-references.md) | What to read and look at before writing code |

Decisions live in [`docs/adr`](docs/adr). The backend design and its implementation plans are in
[`docs/superpowers`](docs/superpowers).

## Layout

```
apps/
  mobile/     Expo + React Native. iOS only for now.
  web/        Vite + React. The build judges will open.
  landing/    Next.js. Marketing site.
services/
  api/        Hono on Node. The only thing the apps talk to.
  worker/     Scheduled work: recurring buys, order watching, price cache.
packages/
  core/       Domain logic with no I/O. Pricing, wrapper choice, cost basis, baskets.
  chain/      Solana adapters. Jupiter, Symmetry, Kamino, RPC, token registry.
  market/     Reference prices, market hours, multipliers.
  types/      Shared types and Zod schemas.
  sdk/        Typed API client used by web and mobile.
tooling/      Shared eslint, prettier and tsconfig.
docs/brand/   The wordmark and the mark.
```

## Getting started

Needs Node 24 and pnpm 10.

```bash
pnpm install
pnpm check          # typecheck and test every package
```

`packages/core` runs with no keys, no database and no network — it performs no I/O at all, which
is the point of it. `pnpm --filter @mercury/core exec vitest run` is the fastest way to see the
execution engine work.

The API needs Postgres and a Privy app. There is **no fixture mode**: every dependency is the
real one or the server does not start.

```bash
docker run -d --name mercury-pg \
  -e POSTGRES_USER=mercury -e POSTGRES_PASSWORD=mercury -e POSTGRES_DB=mercury \
  -p 5432:5432 -v mercury-pg-data:/var/lib/postgresql/data postgres:16-alpine

cp services/api/.env.example services/api/.env   # then fill PRIVY_APP_ID
pnpm --filter @mercury/api exec drizzle-kit migrate
pnpm --filter @mercury/api dev                   # http://localhost:8787
pnpm --filter @mercury/web dev                   # http://localhost:5173
```

## State of the build

| Package | State |
| --- | --- |
| `packages/core` | **Done and tested.** 35 tests. Execution engine, cost basis, exposure, basket allocation |
| `packages/types` | Done. Zod wire schemas |
| `packages/chain` | Ports done, Jupiter Ultra written. Symmetry awaits the spike |
| `packages/market` | Ports only. The browser holds working implementations that move here next |
| `packages/sdk` | Done. Typed client, every response parsed |
| `services/api` | **Identity done**: Privy tokens verified against the app's JWKS, users and wallets in Postgres. Market routes answer 503 until the ports land |
| `services/worker` | Job plan only. Runner is still to come |
| `apps/web` | Landing, card and credit pages, and the account screens. Sign-in creates a real Solana wallet |
| `apps/landing` | Scaffolded |
| `apps/mobile` | Not started, on purpose |

## Ground rules

- **TypeScript everywhere, strict.** No `any` without a comment saying why.
- **`packages/core` performs no I/O.** It takes data in and returns decisions. That is what makes
  the execution engine testable.
- **The server never holds a private key.** Privy does. See [ADR 0003](docs/adr/0003-custody.md).
- **Investing, not trading.** No perps, no margin, no options, no order books. See
  [ADR 0009](docs/adr/0009-investing-not-trading.md).
- **Money is never a float.** Integers in the smallest unit, or decimal strings. See
  [05 Data model](docs/05-data-model.md).
- **Read it, do not type it.** Any number that exists on chain or behind a public API is read
  live and attributed. A figure written into source is a figure that goes quietly wrong.
