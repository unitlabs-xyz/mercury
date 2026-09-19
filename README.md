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
| [11 References](docs/11-references.md) | What to read before coding, and who already built near us |

Architecture decision records live in [`docs/adr`](docs/adr).

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
```

## Getting started

Needs Node 24 and pnpm 10. No API keys, no database, no network.

```bash
pnpm install
pnpm check          # typecheck and test every package
pnpm dev:api        # http://localhost:8787
pnpm dev:web        # http://localhost:5173
```

**The API runs in fixture mode by default**, serving the real measurements from
19 September 2026 with no keys and no network. That is deliberate: the web app can be
built before any integration lands, against a server that behaves correctly.

```bash
curl -s localhost:8787/v1/orders -H 'content-type: application/json' \
  -d '{"ticker":"NVDA","side":"buy","amount":"1000"}' | jq .decision.best
```

returns `NVDAx` at $222.33 a share, with Ondo's wrapper refused at 85% price impact.
`HARBOR_MODE=live` switches to Jupiter and the rest; see `services/api/.env.example`.

## State of the build

| Package | State |
| --- | --- |
| `packages/core` | **Done and tested.** 35 tests. The execution engine, cost basis, exposure, basket allocation |
| `packages/types` | Done. Zod wire schemas |
| `packages/chain` | Ports done, Jupiter Ultra written, fixtures done. Symmetry awaits the spike |
| `packages/market` | Ports and fixtures done. Chainlink, Pyth and Token-2022 reads are week 1 |
| `packages/sdk` | Done. Typed client, every response parsed |
| `services/api` | Routes for market, instruments, orders and basket preview. Postgres is week 2 |
| `services/worker` | Job plan and the multiplier watcher. Runner is week 2 |
| `apps/web` | Scaffolded with the stock page, the screen the product is built around |
| `apps/landing` | Scaffolded |
| `apps/mobile` | Not started, on purpose. Week 2 |

## Ground rules

- **TypeScript everywhere, strict.** No `any` without a comment saying why.
- **`packages/core` performs no I/O.** It takes data in and returns decisions. That is what makes
  the execution engine testable.
- **The server never holds a private key.** Privy does. See [ADR 0003](docs/adr/0003-custody.md).
- **Investing, not trading.** No perps, no margin, no options, no order books. See
  [ADR 0009](docs/adr/0009-investing-not-trading.md).
- **Money is never a float.** Integers in the smallest unit, or decimal strings. See
  [05 Data model](docs/05-data-model.md).
