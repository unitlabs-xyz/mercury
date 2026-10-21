<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/mercury-wordmark-dark.svg">
    <img src="docs/brand/mercury-wordmark.svg" alt="Mercury" width="200">
  </picture>
</p>

<h3 align="center">Your wealth. Onchain.</h3>

<p align="center">The financial account built for the onchain world.</p>

<p align="center"><b>Now live in beta</b> at <a href="https://beta.trymercury.xyz">beta.trymercury.xyz</a></p>

<p align="center">
  Hold your money, invest in stocks and ETFs, build diversified portfolios,<br>
  spend with your card, and access your wealth — all from a single wallet.
</p>

<p align="center"><strong>Hold. Invest. Grow. Spend.</strong></p>

---

Mercury brings the simplicity of a modern financial account to the onchain world. Hold
stablecoins, invest in stocks, ETFs, and curated portfolios, and spend everyday with the Mercury
Card — while keeping your wealth in one place.

Built on Solana for Colosseum's Crypto World's Fair. Submissions close **12 October 2026**.

## Read the docs in this order

| Doc                                                | What it covers                                                  |
| -------------------------------------------------- | --------------------------------------------------------------- |
| [00 Overview](docs/00-overview.md)                 | What we are building and for whom, in one page                  |
| [01 Evidence](docs/01-evidence.md)                 | What we measured on-chain, and why it justifies the product     |
| [02 Product](docs/02-product.md)                   | Every feature, in scope and out                                 |
| [03 Architecture](docs/03-architecture.md)         | Monorepo layout, stack, and why each choice                     |
| [04 Execution engine](docs/04-execution-engine.md) | The core algorithm. Read this one properly                      |
| [05 Data model](docs/05-data-model.md)             | Entities, and the cost-basis rules that are easy to get wrong   |
| [06 API](docs/06-api.md)                           | Endpoint contract between apps and server                       |
| [07 Design](docs/07-design.md)                     | Screens, states, and the apps we are copying                    |
| [08 Roadmap](docs/08-roadmap.md)                   | What ships by 12 October, and what comes after                  |
| [09 Open questions](docs/09-open-questions.md)     | What is settled, and what is still open                         |
| [10 Baskets](docs/10-baskets.md)                   | The vault, and how a basket becomes one token                   |
| [11 References](docs/11-references.md)             | What to read and look at before writing code                    |
| [12 Roadmap to 2028](docs/12-roadmap-2028.md)      | Where Mercury is heading, and what it owns and rents on the way |

Decisions live in [`docs/adr`](docs/adr). The backend design and its implementation plans are in
[`docs/superpowers`](docs/superpowers).

## Layout

```
apps/
  mobile/     Expo + React Native. iOS only for now.
  web/        Vite + React. The build judges will open.
  landing/    Astro on bun. Marketing site. Outside the pnpm workspace.
services/
  api/        Hono on Node. The only thing the apps talk to, and where the clocked jobs run.
packages/
  core/       Domain logic with no I/O. Pricing, wrapper choice, cost basis, baskets.
  chain/      Solana adapters. Jupiter, Kamino, RPC, token registry.
  market/     Reference prices, market hours, multipliers.
  types/      Shared types and Zod schemas.
  view/       What web and mobile both compute: formatting, the feed, orders, borrowing.
  sdk/        Typed API client. Neither app imports it.
tooling/      Shared tsconfig. Eslint and prettier are configured at the root.
docs/brand/   The wordmark and the mark.
```

## Getting started

Needs Node 24 and pnpm 10.

```bash
pnpm install
pnpm check          # lint, format, typecheck and test every package
pnpm dev:api        # http://localhost:8787
pnpm dev:web        # http://localhost:5173
pnpm dev:landing    # http://localhost:3000
```

Each of those four runs as its own GitHub Actions workflow on every pull request, so
none of them needs running by hand to find out. `pnpm format` fixes formatting;
`pnpm lint:fix` fixes what lint can fix on its own.

The landing site is Astro on **bun**, with its own lockfile and its own
`node_modules`. It is excluded from the pnpm workspace so the two installers stay out
of each other's way, which also means `turbo build` skips it — `pnpm build:landing`
builds it. You need bun installed for that one app; everything else is pnpm as before.

`packages/core` runs with no keys, no database and no network — it performs no I/O at all, which
is the point of it. `pnpm --filter @mercury/core exec vitest run` is the fastest way to see the
execution engine work.

The API needs Postgres and a Privy app. There is **no fixture mode**: every dependency is the
real one or the server does not start.

```bash
docker run -d --name mercury-pg \
  -e POSTGRES_USER=mercury -e POSTGRES_PASSWORD=mercury -e POSTGRES_DB=mercury \
  -p 5432:5432 -v mercury-pg-data:/var/lib/postgresql/data postgres:16-alpine

cp services/api/.env.example services/api/.env   # then fill DATABASE_URL, SOLANA_RPC_URL, PRIVY_APP_ID
pnpm --filter @mercury/api exec drizzle-kit migrate
pnpm --filter @mercury/api dev                   # http://localhost:8787
pnpm --filter @mercury/web dev                   # http://localhost:5173
```

The API is the whole backend: the background jobs run inside it, so starting it
loads every stock from Jupiter on boot and then keeps positions and the activity
feed in step with the chain. There is nothing else to start.

### Buying something, for real

There is one mode and it sends. No dry run, no fixtures, no testnet — xStocks
and Kamino exist on mainnet only, so anything you press here spends real money.

1. Sign in with an email. Privy creates a real Solana wallet on first sign-in.
2. Copy the address from **Money → Receive** and send it USDC. Mainnet USDC
   (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`), not USDT and not devnet.
   The deposit shows up within two seconds; the feed row takes up to thirty.
3. Open any stock, type an amount, **Review order**, **Buy now**. Privy asks you
   to approve the signature.
4. Watch it land: the sheet reports the shares and the price it actually filled
   at, read back off the chain rather than from the quote.

The minimum order is $5. Expect a few dollars of USDC and a little SOL for fees.

Solana's public RPC will rate-limit this — `position-sync` alone polls it every
two seconds, and 429s were routine during testing. Put a Helius or Triton URL in
`SOLANA_RPC_URL` before spending much time in the app.

### Deploying the API

`services/api/Dockerfile` builds the server for Coolify. **The build context is
the repo root**, not `services/api` — the API imports five workspace packages
and every one exports raw `.ts`, so the image carries the workspace and runs it
through tsx. Nothing in this repo compiles.

In Coolify, on a Dockerfile application:

| Setting             | Value                      |
| ------------------- | -------------------------- |
| Build Pack          | `Dockerfile`               |
| Base Directory      | `/`                        |
| Dockerfile Location | `/services/api/Dockerfile` |
| Ports Exposes       | `8787`                     |
| Health Check Path   | `/health`                  |

Then set `DATABASE_URL`, `PRIVY_APP_ID` and `SOLANA_RPC_URL` as environment
variables. The server refuses to start without all three. Do not mount a `.env`
file — the image deliberately has none, and `.dockerignore` keeps the local one
out of the build context.

Migrations run when the API boots (`applyMigrations`, in
`services/api/src/db/migrate.ts`), before it answers anything, so a new image
brings the schema it needs. Two containers booting together take a Postgres
advisory lock and do not race, and a failed migration ends the process, which on
a rolling deploy leaves the previous container taking traffic. To apply them by
hand instead, against a database you are about to point the app at:

```bash
DATABASE_URL=<the deployed one> pnpm --filter @mercury/api exec drizzle-kit migrate
```

**Run one instance.** The background jobs live inside the API process, so a
second replica is a second writer polling the same wallets — `position-sync`
every two seconds, `wallet-events` every thirty. Scaling this out needs the
jobs pulled into their own process first.

To check the image locally before pushing:

```bash
docker build -f services/api/Dockerfile -t mercury-api .
docker run --rm -p 8787:8787 -e DATABASE_URL=... -e PRIVY_APP_ID=... -e SOLANA_RPC_URL=... mercury-api
```

### Deploying the web app

`apps/web/Dockerfile` builds the SPA and serves it with nginx. Same rule as the
API: **the build context is the repo root**, because the app imports the same
workspace packages.

| Setting             | Value                  |
| ------------------- | ---------------------- |
| Build Pack          | `Dockerfile`           |
| Base Directory      | `/`                    |
| Dockerfile Location | `/apps/web/Dockerfile` |
| Ports Exposes       | `80`                   |

**The `VITE_` variables are build-time, not runtime.** Vite substitutes them
into the bundle during `vite build`; setting them on a running container does
nothing. In Coolify each one must be ticked **Build Variable**:

- `VITE_API_URL` — e.g. `https://mercury-dev.thecircleco.xyz`
- `VITE_PRIVY_APP_ID`

The build refuses to run without either, on purpose. Both fail quietly
otherwise: unset, `VITE_API_URL` falls back to `http://localhost:8787` and
every visitor's browser calls their own machine, and `VITE_PRIVY_APP_ID`
throws on first render for a white screen. Neither shows up until someone
opens the site, so the Dockerfile stops the build instead.

Changing either one needs a rebuild, not a restart.

## State of the build

| Package           | State                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`   | **Done and tested.** Execution engine, cost basis, exposure, basket allocation                                                                                                                                                                                                                                                                      |
| `packages/types`  | Done. Zod wire schemas                                                                                                                                                                                                                                                                                                                              |
| `packages/chain`  | Registry, Solana reads, and Jupiter's keyless endpoints — which both price an order and build the transaction that fills it. Baskets run on Glider from `services/api/src/baskets`                                                                                                                                                                  |
| `packages/market` | **Done.** Sessions, prices, reference price, multipliers and the credit market, all lifted from the browser and runtime-agnostic                                                                                                                                                                                                                    |
| `packages/sdk`    | Typed client, every response parsed. Neither app imports it                                                                                                                                                                                                                                                                                         |
| `packages/view`   | **Done.** What web and mobile both compute: formatting, the activity feed, the order and borrow models, receipts. No DOM, by compiler                                                                                                                                                                                                               |
| `services/api`    | **Identity, read models and execution done**: Privy tokens verified against the app's JWKS; instruments, portfolio, exposure, money and activity answer from Postgres and chain; an order prices, builds, settles and writes its own lot. The clocked jobs run in-process, listed in `src/index.ts`. Trigger orders are the one piece still missing |
| `apps/web`        | Landing, card and credit pages, and the account screens. Sign-in creates a real Solana wallet, and the buy sheet places a real order                                                                                                                                                                                                                |
| `apps/landing`    | **Scaffolded on Astro.** Eight sections of the designed page, placeholder artwork, SEO and sitemap wired                                                                                                                                                                                                                                            |
| `apps/mobile`     | **In progress.** Sign-in, the four tabs, stock pages, buying and selling, send, borrow, baskets and adding cash, on the same API and `packages/view`. Needs a custom dev client for Privy                                                                                                                                                           |

## Ground rules

- **TypeScript everywhere, strict.** No `any` without a comment saying why.
- **`packages/core` performs no I/O.** It takes data in and returns decisions. That is what makes
  the execution engine testable.
- **The server never holds a private key.** Privy does. See [ADR 0003](docs/adr/0003-custody.md).
- **Investing, not trading.** No perps, no margin, no options, no order books. See
  [ADR 0009](docs/adr/0009-investing-not-trading.md).
- **Money is never a float.** Integers in the smallest unit, or decimal strings. See
  [05 Data model](docs/05-data-model.md).
- **Formatting is not a matter of opinion.** Prettier owns it, and CI checks it. Prose is
  exempt: `*.md` is formatted but never rewrapped.
- **Read it, do not type it.** Any number that exists on chain or behind a public API is read
  live and attributed. A figure written into source is a figure that goes quietly wrong.
