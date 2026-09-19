# Harbor

> Working name. See `docs/09-open-questions.md`.

An investment account that lives in a crypto wallet. You arrive holding stablecoins, buy
tokenized US equities, invest in baskets, set a recurring plan, and watch one portfolio.
Later you borrow against those holdings instead of selling them.

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
| [09 Open questions](docs/09-open-questions.md) | What is settled, and the five things still open |
| [10 Baskets](docs/10-baskets.md) | The vault, and how a basket becomes one token |

Architecture decision records live in [`docs/adr`](docs/adr).

## Layout

```
apps/
  mobile/     Expo + React Native. iOS only for now.
  web/        Vite + React. The build judges will open.
  landing/    Next.js. Marketing site.
programs/
  basket-vault/  Anchor. Holds constituents, mints the basket token.
services/
  api/        Hono on Node. The only thing the apps talk to.
  worker/     Scheduled work: recurring buys, order watching, price cache.
packages/
  core/       Domain logic with no I/O. Pricing, wrapper choice, cost basis, baskets.
  chain/      Solana adapters. Jupiter, Kamino, RPC, token registry.
  market/     Reference prices, market hours, multipliers.
  types/      Shared types and Zod schemas.
  sdk/        Typed API client used by web and mobile.
tooling/      Shared eslint, prettier and tsconfig.
```

## Getting started

Nothing is scaffolded yet. The layout above and the configs at the root encode the decisions
in [03 Architecture](docs/03-architecture.md); the applications come next.

```bash
pnpm install
pnpm dev
```

## Ground rules

- **TypeScript everywhere, strict.** No `any` without a comment saying why.
- **`packages/core` performs no I/O.** It takes data in and returns decisions. That is what makes
  the execution engine testable.
- **The server never holds a private key.** Privy does. See [ADR 0003](docs/adr/0003-custody.md).
- **Money is never a float.** Integers in the smallest unit, or decimal strings. See
  [05 Data model](docs/05-data-model.md).
