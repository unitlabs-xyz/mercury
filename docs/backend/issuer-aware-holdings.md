# Issuer-aware holdings, borrowing and selling

**Status:** proposed, for backend review
**Owner (frontend):** web dashboard
**Touches:** `services/api` (portfolio, lending, pricing/orders), `packages/types`, `packages/core/src/execution`

## Why

Each stock trades as two tokens through Jupiter: **xStocks** (issuer `backed`, e.g. `SPYx`) and **Ondo** (issuer `ondo`, e.g. `SPYon`). On a buy we route to whichever is cheaper per real share, and the app presents the result as "you own SPY".

The two tokens are not equivalent:

- **Only xStocks can back a loan.** Every Kamino stock reserve is an xStocks mint. No Ondo token is one.
- **Basket strategies (Glider) buy Ondo tokens only.** They sit in the user's Glider smart account, not the primary wallet.

So a user whose buy happened to route to Ondo sees "Borrow against SPY" everywhere, but cannot actually borrow against those shares. The API currently has no way of saying which part of a position is which. The frontend has shipped a stopgap (below). This doc is what the API needs so the frontend can stop inferring.

## What is wrong today

| #   | Where                                                                | What happens                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `routes/portfolio.ts:127`, `portfolio/queries.ts:13-52`              | `wrapperCount` is the number of tokens **listed** for the ticker, not the number **held**. Any ticker listed by both issuers reports 2. The web showed "2 issuers" and the "sell the rest in a second order" warning to people holding one token. |
| 2   | `packages/types/src/portfolio.ts:4-15`                               | `Holding` has no per-issuer split. `shares` and `valueUsd` add xStocks and Ondo together.                                                                                                                                                         |
| 3   | `lending/kamino.ts:110-155`                                          | Lendability is decided by `/x$/.test(symbol)` on the reserve symbol, and deposits are found by `${ticker}x`. It works only because every stock reserve is xStocks today. It should key on **mint**.                                               |
| 4   | `GET /v1/portfolio/exposure/:ticker` (`routes/portfolio.ts:174-232`) | This is the only per-issuer read. It reads wallet balances only, so pledged tokens are missing from it, and it has no `lendable` flag. Until now only mobile called it.                                                                           |
| 5   | `packages/core/src/execution/decide.ts:108-114`                      | On a sell, candidates are ranked by `pricePerShare` alone. A wrapper capped at a small balance can win and fill far less than asked.                                                                                                              |
| 6   | `CreateOrderRequest` (`packages/types/src/orders.ts:87-93`)          | There is no way to ask for a specific issuer. A buyer who wants a lendable position cannot get one when Ondo is cheaper, and a seller cannot choose which token to sell.                                                                          |
| 7   | `GET /v1/money` (`routes/money.ts:72-75`) vs `GET /v1/borrow`        | `borrowingPower.availableUsd` is `borrowableNowUsd` (pledged only). `/v1/borrow` `borrowableUsd` / `spendableUsd` also include xStocks sitting in the wallet. The two screens can disagree.                                                       |

## Changes requested

Priorities: **P0** = needed to remove the frontend stopgap, **P1** = makes the flows fair, **P2** = cleanup.

### P0. Per-issuer parts on every holding

Extend `Holding` in `packages/types/src/portfolio.ts`:

```ts
export const HoldingPart = z.object({
  issuer: Issuer, // "backed" | "ondo"
  mint: Mint,
  symbol: z.string(), // "SPYx", "SPYon"
  shares: Usd, // wallet + pledged, at this token's multiplier
  pledgedShares: Usd, // in Kamino; always 0 for a non-lendable token
  valueUsd: Usd,
  lendable: z.boolean(), // this mint is an active Kamino reserve with LTV > 0
});

export const Holding = z.object({
  // ...existing fields...
  parts: z.array(HoldingPart), // held tokens only, shares > 0, largest first
  lendableShares: Usd, // Σ parts where lendable
  lendableValueUsd: Usd,
  /** @deprecated Use parts.length. Until removed it must mean tokens held, not tokens listed. */
  wrapperCount: z.number().int().positive(),
});
```

- `shares` / `valueUsd` on the holding stay the sum. The UI still presents one stock.
- **Fix `wrapperCount` now, even before `parts` ships**: count wrappers with a non-zero balance (wallet + pledged).
- Pledged tokens belong to the xStocks part (`withPledged` already folds them into `shares`, `lending/pledged.ts:30-45`).
- Also add `pledged` per wrapper to `GET /v1/portfolio/exposure/:ticker`, plus a `lendable` flag. Or retire that endpoint once `parts` exists.

### P0. Lendability by mint, and on the instrument

- In `lending/kamino.ts`, build the collateral set from reserve **liquidity mints**, not from the symbol regex. A token is lendable when its mint is an active reserve with `ltv > 0` and deposit cap room.
- Add to `Wrapper` (`packages/types/src/market.ts:4-18`), as served by `/v1/instruments[/:ticker]`:

  ```ts
  lendable: z.boolean(),
  ltv: Ratio.nullable(),        // Kamino max LTV for this mint, null when not lendable
  ```

  The frontend can then answer "can this token back a loan?" before anyone holds it, for example on the order review.

- `BorrowRow` / `CollateralTerms` already have `mint`. Expose `mint` on the `/v1/borrow` rows so the client can join on it rather than on the ticker.
- If Kamino ever lists an Ondo reserve, this should light up with no code change.

### P0. The user chooses the issuer, on buy and on sell (product decision, made)

The review modal now lists every viable token for the amount and lets the user pick. The best price is pre-selected. There is **no automatic tie-break**: the user decides.

- **Buy:** the review shows each token's price per share, shares received, and whether it is borrowable.
- **Sell:** when the user holds both tokens, the review shows each token's held shares, proceeds, and whether it is borrowable. The user picks which one to sell.

What the frontend already sends:

- `POST /v1/orders` carries `issuer: "backed" | "ondo"`: the token the user reviewed, picked or best.

**Done (2026-10-07):** items 1 and the execute pin below are implemented in `services/api/src/pricing.ts` (`PriceRequest.issuer`), `services/api/src/app.ts` (`/v1/orders` honours `issuer`; `/execute` re-prices only the reviewed issuer, picked or best) and `packages/types/src/orders.ts`. `/v1/quote` deliberately ignores `issuer` so the review can list every token. Tests: `services/api/src/pricing.test.ts`. Behaviour change to review: `/execute` no longer switches to a different issuer that became cheaper after the review.

What the backend still needs to do:

1. Add `issuer?: Issuer` to `CreateOrderRequest` (and to `POST /v1/quote` for symmetry).
   - When set, only that issuer's wrapper is a candidate, both at order creation and when `/execute` re-prices.
   - Store it on the order so the re-pick in `app.ts` (~:323-353) cannot switch issuers.
   - Refuse with a clear reason if that wrapper can't fill.
2. Keep returning **every** viable candidate in `decision.candidates`, with `filledShares` and `pricePerShare`. The picker is built from them, so a sell must include every wrapper the user holds.
3. Add `lendable: boolean` to each candidate, so the frontend can stop inferring it from the issuer.
4. **Sell ranking:** rank by total proceeds for the requested amount, not price per share (`decide.ts:108-114`). A wrapper capped at a small balance must not be pre-selected as "best".
5. **"Sell all"** (`max: true`) with `issuer` set sells that whole wrapper. Without `issuer`, keep today's behaviour.
6. The network fee can differ by mint (account creation is per mint). Return `fee` per candidate if it differs. The frontend currently shows one fee for all options.

### P1. One definition of "can borrow"

Make `GET /v1/money` `borrowingPower.availableUsd` match `/v1/borrow`, or rename it so it is obvious which is which:

- **"Borrowable now"**: pledged collateral only.
- **"Borrowable"**: pledged plus lendable tokens in the wallet.

Both must count **lendable tokens only**. They already do, through the xStocks mint, but please keep that true when the per-mint change lands.

### P2. Baskets

- Glider basket assets are Ondo tokens in a smart account. They are **never** collateral and must never appear in `/v1/borrow`, borrowing power or spendable figures. This is true today; please add a test so it stays true.
- An in-kind exit lands Ondo tokens in the user's deposit account. When reconcile picks them up, write the lot with `source: "basket"` (the enum value exists but nothing writes it). Those shares then show up under the Ondo part with `lendable: false`.
- **Product decision (made):** each basket is **one row in Holdings**. Its stocks are not merged into the individual stock rows, and the stock page's position stays direct holdings only. Opening the row goes to the basket page, which already shows each asset's value and 1D move.
- **Needed for that row:**
  - **Include basket value in `GET /v1/portfolio`'s `totalValueUsd`**, plus a `baskets: [{slug, name, valueUsd, costBasisUsd, changeUsd24h, changePct24h}]` array.
  - **Basket cost basis:** the sum of confirmed deposits minus withdrawals, so the Return column can show a figure instead of "—".
  - **Basket 24h move:** the value-weighted move of its assets, for the Today column.
- **Frontend stopgap to remove in the same release:** `useModel(..., basketsUsd)` in `apps/web/src/app/portfolio/model.ts` adds `/v1/basket-portfolios` values to net worth on the client. Once the server includes them, delete that parameter, or net worth will **double-count**.

## Frontend stopgap (already shipped; remove once P0 lands)

`apps/web/src/app/stock/heldAs.ts`:

- Builds the per-issuer split from `GET /v1/portfolio/exposure/:ticker` and adds `pledgedShares` back into the xStocks part.
- Treats `issuer === "backed"` on a ticker that `/v1/borrow` lists as lendable. **This is the hard-coded rule that P0 replaces.**

It is used by:

| Surface                       | Shows                                                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stock page, Your position     | "Held as" list: xStocks / Ondo, value, shares, "Can back a loan" / "Can't back a loan"                                                                                     |
| Stock page, Borrow against it | Ondo-only holders get "held as Ondo tokens, which Kamino doesn't accept". Mixed holders see that the figure covers the xStocks shares only.                                |
| Order review, buy             | "Buy as" picker: xStocks / Ondo, each with price, shares and Borrowable / Not borrowable (ⓘ). Best price pre-selected. Sends `issuer` when changed.                        |
| Order review, sell            | "Sell from" picker over the held tokens, each with held shares, proceeds and borrowable status                                                                             |
| Portfolio holdings            | The provider under each name: "xStocks", "Ondo" or "xStocks + Ondo" (from the exposure read). Baskets appear as one row each. The wrong "N issuers" chip is gone (see #1). |
| Borrow modal                  | Shares labelled "on xStocks"                                                                                                                                               |
| Portfolio borrowing figures   | A row's borrowable value now uses the `/v1/borrow` row (xStocks only), not the whole holding                                                                               |
| Basket page, About            | "Held as: Ondo tokens", "Borrowing: Not available"                                                                                                                         |

When `Holding.parts` and `Wrapper.lendable` ship:

- Delete the exposure call and the `LENDABLE` set in `heldAs.ts`.
- Read `parts` / `lendable` directly.

The UI does not change.

## Acceptance checks

1. A user holding only `SPYon` sees:
   - `wrapperCount: 1` and `parts: [{issuer:"ondo", lendable:false}]`
   - `lendableValueUsd: "0"`
   - no SPY borrowing power
2. A user holding `SPYx` + `SPYon` with some `SPYx` pledged sees:
   - two parts, with `pledgedShares` on the xStocks part only
   - `shares` = sum of both parts
3. `/v1/instruments/SPY` reports `lendable: true` on the `SPYx` wrapper and `false` on `SPYon`.
4. A quote with `issuer: "backed"` returns only xStocks candidates. Without it, each candidate carries `lendable`.
5. A sell of $100 where the user holds $5 of the better-priced token and $200 of the other fills from the $200 token.
6. `/v1/money` and `/v1/borrow` agree on borrowable figures for the same account (or are labelled as different measures).
7. No basket smart-account asset ever contributes to `/v1/borrow`.
8. `POST /v1/orders` with `issuer: "backed"`, when Ondo is cheaper, fills xStocks. `/execute` does not switch it back.
9. A user holding a Glider basket sees its value in `totalValueUsd` exactly once, and as one entry in `baskets`.
