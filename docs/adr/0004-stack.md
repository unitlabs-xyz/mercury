# ADR 0004 · Monorepo and stack

**Status:** accepted · 19 September 2026

## Decision
pnpm workspaces with Turborepo. TypeScript everywhere, strict, with `noUncheckedIndexedAccess`.
Hono on Node for the API. Postgres with Drizzle. Zod for schemas shared between server and
client. `@solana/kit` for chain access. Jupiter for routing and trigger orders. Vite and React
for web, Expo and React Native for iOS, Next.js for the landing page. Tailwind and NativeWind
over one set of design tokens. TanStack Query on both clients. Vitest for tests.

## Reasons
One language across three clients and a server means the execution engine is written once.
Hono's RPC mode gives the SDK end-to-end types from the route definitions, so the client cannot
drift from the server. Zod at the boundary means everything inside is trusted and typed. Next.js
appears exactly once, on the only surface where server rendering and metadata matter.

## Consequences
`packages/core` performs no I/O, which is what lets the execution engine be tested as a table of
fixtures. Web and mobile share `sdk` and `types` but not components, because the primitives
differ too much for a shared component library to pay for itself.

## Rejected
GraphQL, because the client surface is small and known. Microservices, because there are two
deployables and no reason for more. A shared React component library across web and native.
NestJS, too much ceremony for one API.
