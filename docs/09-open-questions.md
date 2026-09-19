# 09 · Open questions

## Settled

| Question | Answer |
| --- | --- |
| Custody | **Privy embedded wallets only.** Recurring uses delegated actions. [ADR 0003](adr/0003-custody.md) |
| Baskets | **Real tokens, on Symmetry Protocol.** Not our own vault. [ADR 0005](adr/0005-basket-vaults.md) |
| Funding an empty wallet | **Every path Privy already offers**, built by us: none. [ADR 0007](adr/0007-wallet-funding.md) |
| Judged surface | **Web is the submission.** iOS is back in scope and is the first cut |
| Team | **Four engineers.** Allocation in [08 Roadmap](08-roadmap.md) |
| Testing funds | **Funded wallets exist.** Mainnet from day one |
| Reference price | **Chainlink**, not Pyth. [ADR 0006](adr/0006-pricing.md) |
| Crypto-native, no fiat ramps we operate | [ADR 0001](adr/0001-crypto-native.md) |
| Solana, not Robinhood Chain | [ADR 0002](adr/0002-solana.md) |

---

## Open, and how each gets closed

### 1 · The Symmetry spike · closes 20 September, by testing

Three questions, answered by code rather than discussion, written into
[ADR 0005](adr/0005-basket-vaults.md) the same day.

1. **Are the xStocks mints in Symmetry's supported token list?** The only one that can stop us.
   If no, we write the minimal vault and the schedule tightens sharply.
2. **Do basket tokens route through Jupiter?** A `@jup-ag/symmetry-sdk` package exists, so
   possibly. If yes, investing becomes one swap instead of six swaps and a deposit, which is a
   large simplification and a better product.
3. **Can Chainlink be configured as the oracle per constituent?**

### 2 · Which three baskets ship · closes end of week 1

Candidates: Semiconductors, US Technology, S&P 500 exposure, AI, Dividend payers. Partly
empirical, because a basket is only shippable if every constituent routes at size. Needs deciding
early so copy and artwork can be made.

### 3 · Whether the iOS app actually ships · closes 2 October

It is in the plan because Symmetry returned a fortnight. It is also first on the cut list. The
honest checkpoint is the week 2 gate: if the web app is not carrying itself by 2 October, mobile
stops and that engineer moves to the web build.

### 4 · The name · closes whenever you like

Still `harbor`. Nothing depends on it. A rename touches the README, the landing page and the app
display name.

---

## Things I decided without asking

Recorded here so they are easy to reverse.

- **Card onramps are offered last in the funding screen**, after the universal deposit address
  and the plain receive option. They are the slowest and most expensive path.
- **The basket page names Symmetry.** We are not the custodian and should not imply we are.
- **Redemption without us gets verified before launch**, and the result is stated in the product.
- **`packages/core` never imports the Symmetry SDK.** It sits behind a four-method interface in
  `packages/chain`, which keeps writing our own vault a week of work rather than a rewrite.

---

## Added 19 September, after the reference sweep

### 5 · Positioning against Backpack · needs a decision, not a spike

Backpack already ships a unified portfolio holding tokenized stocks beside crypto, cash earning
3.35% that stays usable as collateral, and portfolio margin across assets. See
[11 References](11-references.md).

**So "stocks and crypto in one portfolio" is no longer an available claim.** What they do not
have is baskets, recurring investing, any comparison between issuers of the same stock, exposure
deduplication, or any awareness that the US market is shut. They are a trading product: perps,
margin, order types, subaccounts.

**Recommendation: lean harder into investing rather than trading.** No perps, no margin trading,
no candlesticks, no order book. The positioning line becomes closer to M1's: built for investors,
not traders. Everything in [00 Overview](00-overview.md) survives, but the emphasis moves from
"one portfolio" toward "the account that buys you the right share at the right price and then
leaves you alone".

Worth your explicit agreement, because it rules out features people will ask for.

### 6 · Infrastructure accounts, all needed in week 1

| Thing | Why | Who owns it |
| --- | --- | --- |
| Jupiter API key | Endpoints now require `x-api-key`. Not optional | ? |
| RPC provider | Helius is a Colosseum sponsor and likely has credits for entrants | ? |
| Privy app, with funding providers enabled | [ADR 0007](adr/0007-wallet-funding.md) is a dashboard setting | ? |
| Pyth Pro token | Needed for equity feeds and the session schedule | ? |
| Hosting | Vercel for web and landing. The API and worker need somewhere with a cron | ? |

These are half a day of admin that will otherwise block three engineers on day two.

### 7 · Brand direction before D starts drawing

Engineer D builds screens from week one. A name, a palette and a typeface would prevent a rework
in week three. Tokens are already specified in [07 Design](07-design.md) with placeholder values.

**Recommendation: pick a single accent colour and a typeface this week**, leave the name until
later, and keep the palette neutral enough that a name and logo drop in without a redesign.

### 8 · Which Jupiter path the basket deposit forces

Jupiter's Ultra path delegates execution and is cleanest, but transactions it returns cannot be
modified. Path B in [10 Baskets](10-baskets.md) composes a swap with a vault deposit, which may
require the Router path instead. Answered by the same spike as question 1.
