# The iOS app

**Status:** accepted · 30 September 2026

## What this is

A second client, at parity with the web app on the flows the product's argument
rests on, installed on a judge's phone through TestFlight by 12 October.

Not a port. `apps/web/src` is 103 files and 15,522 lines of DOM, Tailwind and
React Router, none of which crosses. What crosses is the logic underneath it.

## The schedule is Apple's, not ours

TestFlight puts App Review between the build and the judge — one to three days
for a first submission. Submitting on the 11th therefore means **the build
freezes on 8 October**, and the Apple Developer account has to exist before
anything can be signed at all, which is a further 24 to 48 hours.

Eight days of building, and the first of them is the one that decides whether
the rest are worth having.

## Step zero · does Privy sign on a device

`@privy-io/expo` is a different package from the web's `@privy-io/react-auth`.
Native modules, so no Expo Go and a custom dev client; a different signing API;
no prior art anywhere in this repository.

**The spike answers one question: does an embedded Solana wallet sign a
transaction our API built, such that `POST /v1/transactions/send` accepts it?**

If the answer is no, "second client" becomes read-only and every screen built
before finding out was built on a false assumption. Symmetry is twelve days
overdue for exactly this shape of unknown, and Baskets still dead-ends because
of it. This one runs first.

## 1 · `packages/view`

A new package holding what both apps already need and only one of them has.

| Moves unchanged | `model.ts`, `format.ts`, `activity-data.ts`, `activity-map.ts`, `decision.ts`, and `DotChart`'s axis and bucketing maths |
| Moves with a port | `watchlist.ts`, which calls `localStorage` today. It takes a `Storage` interface; web passes `localStorage`, mobile passes `expo-secure-store` |
| Stays per-app | the fetch wrapper. `import.meta.env` is Vite's; mobile reads `EXPO_PUBLIC_API_URL`. Both wrap the same `@mercury/sdk` |

About 500 lines. The point is not saving them twice — it is that net worth,
weights, event kinds and axis bounds are computed once. Two clients disagreeing
about what an account is worth is the same defect as a chart disagreeing with
the headline above it, which is what `valuePortfolio` exists to prevent.

The package is pure, so vitest covers both apps from one place.

## 2 · The mobile stack

`expo-router` for navigation, already declared. **NativeWind**, so the token
names match `tokens.css` exactly — [03 Architecture](../../03-architecture.md)
chose that and it holds. React Query against `@mercury/sdk` with the same query
keys as web. `react-native-svg` for the charts.

## 3 · Four tabs

Portfolio, Invest, Money, Activity. Baskets is absent because Symmetry blocks
it, which is convenient: the design brief asked for four tabs and the web's five
nav items never fit a phone.

The spine is **Login → Portfolio → Invest → Stock detail with the issuer
comparison → Buy sheet**. [08 Roadmap](../../08-roadmap.md) says never to cut
the issuer comparison; it is the argument the product rests on and it is the
screen a judge should see.

Money and Activity ship if the days hold. They are the first things to go.

## 4 · Order of work

|          |                                                            |
| -------- | ---------------------------------------------------------- |
| Day 1    | Deps installed, `packages/view` wired, **the Privy spike** |
| Days 2–3 | Auth, tab shell, Portfolio                                 |
| Days 4–5 | Invest, Stock detail, issuer comparison                    |
| Day 6    | Buy sheet, end to end on a device                          |
| Day 7    | Money and Activity if they hold; EAS build                 |
| 8 Oct    | Submitted to App Review. Frozen                            |

## 5 · Testing

`packages/view` carries the web's existing tests across and is where new ones
go. No React Native component tests: they are slow to write, brittle against
layout, and by the time they would be worth writing the logic worth testing has
already moved into the shared package.

The spike is verified on a device, by hand, once — that is what a spike is.

## What this does not include

- **Baskets**, blocked by Symmetry on both clients.
- **The loan flows.** Borrowing is live on web and it is not the argument; a
  judge who sees the issuer comparison has seen the product.
- **Android.** `app.json` is iOS-only and stays that way.
