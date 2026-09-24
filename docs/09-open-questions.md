# 09 · Open questions

## Settled

| Question | Answer |
| --- | --- |
| Custody | **Privy embedded wallets only.** Recurring uses delegated actions. [ADR 0003](adr/0003-custody.md) |
| Baskets | **Real tokens, on Symmetry Protocol.** [ADR 0005](adr/0005-basket-vaults.md) |
| Funding an empty wallet | **Every path Privy already offers.** We build none. [ADR 0007](adr/0007-wallet-funding.md) |
| Positioning | **Investing, not trading.** No perps, no margin, no options, no order books. [ADR 0009](adr/0009-investing-not-trading.md) |
| Jupiter integration | **Ultra everywhere.** No Router path. [ADR 0008](adr/0008-jupiter-ultra.md) |
| Reference price | **Chainlink**, with the dividend-window correction. [ADR 0006](adr/0006-pricing.md) |
| Judged surface | **Web is the submission.** iOS is in scope and is the first cut |
| Team | **Four engineers.** Allocation in [08 Roadmap](08-roadmap.md) |
| Infrastructure accounts | **Provided.** Jupiter key, RPC, Privy app, Pyth token, hosting |
| Brand and design | **Designed before the screens are built.** Tokens in [07 Design](07-design.md) take the real values once they exist |
| Crypto-native, no ramps we operate | [ADR 0001](adr/0001-crypto-native.md) |
| Solana, not Robinhood Chain | [ADR 0002](adr/0002-solana.md) |
| Monorepo and stack | [ADR 0004](adr/0004-stack.md) |

---

## Open · two, and both close by testing

### 1 · The Symmetry spike · closes 20 September

Two questions now that [ADR 0008](adr/0008-jupiter-ultra.md) has removed the third.

1. **Are the xStocks mints in Symmetry's supported token list?** Call `getTokenListData()`. The
   only question that can stop us. If no, we write the minimal vault and the schedule tightens.
2. **Do basket tokens route through Jupiter?** If yes, investing in a basket is one swap rather
   than six plus a deposit, which is a much better product.

Whoever runs it writes the answer into the ADR the same day.

### 2 · Which three baskets ship · one decided, two decided by a routing sweep

**Basket one is locked: Core US, 70% SPYx and 30% QQQx.** Both measured at 0.00% and 0.11% price
impact on 19 September, the two deepest tokenized equities on Solana. It is the basket most users
should buy, it will never fail a leg, and it makes the mechanism reliable in the demo. Simple is
the point.

**Baskets two and three are chosen by measurement, in week one.** Engineer B runs a routing sweep
across every candidate constituent at $1,000 and $10,000 and applies one rule:

> A constituent ships only if price impact is under 1% at $1,000 and under 2% at $10,000.

| Candidate basket | Constituents to test | Verified so far |
| --- | --- | --- |
| Big Tech | AAPL, MSFT, GOOGL, AMZN, META, NVDA | AAPL 0.27%, NVDA 0.02% |
| AI and Semiconductors | NVDA, AVGO, AMD, TSM, ASML, MU | NVDA 0.02% |

If a basket cannot assemble at least four qualifying constituents, it is dropped and we ship two
baskets rather than three. Nobody should negotiate with the measurement.

---

## Decided without asking

Recorded so they are easy to reverse.

- **Jupiter Ultra, not Router.** Reasoning in [ADR 0008](adr/0008-jupiter-ultra.md). The short
  version: composition was never possible anyway, and Jupiter handling transaction landing is
  worth more than composability we do not need.
- **Basket investment is not atomic**, and the partial state is benign. If the swaps land and the
  deposit does not, the user holds the constituents, which is what they paid for. The app offers
  to finish the deposit.
- **Borrowed funds cannot buy stocks inside the app**, enforced in code. That is the line between
  a Lombard loan and margin, per [ADR 0009](adr/0009-investing-not-trading.md).
- **Card onramps are offered last** in the funding screen, after the universal deposit address.
- **The basket page names Symmetry.** We are not the custodian and will not imply we are.
- **Redemption without us is verified before launch**, and stated in the product.
- **`packages/core` never imports the Symmetry SDK**, keeping our own vault a week of work later
  rather than a rewrite.
- **The name stays `mercury`** until you want otherwise. Nothing depends on it.
