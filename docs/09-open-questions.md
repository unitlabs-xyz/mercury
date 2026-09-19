# 09 · Open questions

## Settled on 19 September

| Question | Answer |
| --- | --- |
| Custody | **Privy embedded wallets only.** No Phantom, no wallet-connect. Recurring uses Privy delegated actions. [ADR 0003](adr/0003-custody.md) |
| Baskets | **Real tokens, not a tracked set.** Build or integrate decided by a day-one spike. [ADR 0005](adr/0005-basket-vaults.md) |
| Judged surface | **Web is the submission.** iOS follows the hackathon, as a product commitment rather than a hackathon deliverable |
| Team | **Four engineers.** Allocation in [08 Roadmap](08-roadmap.md) |
| Testing funds | **Funded wallets exist.** Mainnet from day one |
| Reference price | **Chainlink**, not Pyth. [ADR 0006](adr/0006-pricing.md) |
| Crypto-native, no fiat ramps | [ADR 0001](adr/0001-crypto-native.md) |
| Solana, not Robinhood Chain | [ADR 0002](adr/0002-solana.md) |

---

## Still open

### 1 · A new wallet is empty, and we have no on-ramp

Choosing Privy-only created this. Someone signs in with an email, gets a Solana wallet, and it
holds nothing. We have no fiat ramp by design. So the first-run experience currently ends at
*"send USDC to this address"*, which means leaving for an exchange and coming back. That is the
largest funnel drop in the product and it did not exist when an external wallet was an option.

Three ways out:

| Option | Cost | Problem |
| --- | --- | --- |
| Receive screen only | Nothing | Most people never come back |
| **Privy's built-in funding**, which covers transfer from an existing wallet and card purchase through their partners | Configuration | A card purchase is a fiat ramp, operated by Privy's partner rather than by us |
| Pre-fund demo accounts for judges | A day | Fine for judging, useless as a product |

**Recommendation: enable Privy's funding flow, and do all three.** The card path is consistent
with [ADR 0001](adr/0001-crypto-native.md) on exactly the reasoning we already applied to the
card in version two: the partner is the ramp and carries the identity burden, not us. For the
hackathon we also pre-fund a demo account so a judge is never blocked.

**This needs your yes**, because it is a partial reversal of a decision you made deliberately.

### 2 · Symmetry or our own vault

Resolved by a one-day spike on 20 September, not by discussion. The question the spike answers is
whether Symmetry supports the specific xStocks mints. Integrating saves roughly a fortnight and
scores on composability; building gives full control of a program that holds user funds.

Whoever runs it writes the answer into [ADR 0005](adr/0005-basket-vaults.md) the same day.

### 3 · Which three baskets ship

Candidates: Semiconductors, US Technology, S&P 500 exposure, AI, Dividend payers. Constrained by
what is actually routable at size on Jupiter, so the answer is partly empirical. Needs deciding
in week one so the copy and the artwork can be made.

### 4 · Do we publish the vault cap

While the program is young there is a hard cap on vault size, a few thousand dollars. Showing it
in the app is honest and slightly embarrassing. Hiding it is neither.

**Recommendation: show it.** *"This basket is capped at $5,000 while the contract is new."* An
audience that has watched a hundred protocols get drained reads that as competence.

### 5 · The name

Still `harbor`. Nothing depends on it. A rename touches the README, the landing page and the app
display name.
