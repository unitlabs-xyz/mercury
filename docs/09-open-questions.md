# 09 · Open questions

Decisions that change what gets built, not what gets polished. Each has a recommendation so work
can start on the assumption and be corrected cheaply.

---

## 1 · Custody, and therefore whether recurring investing can exist

**The question.** Does the user hold their own keys through Phantom and sign every action, or do
we create an embedded wallet through Privy that can hold a delegated session key?

This is the largest fork in the road.

| | Phantom only | Privy embedded |
| --- | --- | --- |
| Onboarding | Needs a wallet already, and funds in it | Email or social, wallet made in seconds |
| Recurring investing | Impossible unattended. The user must approve every run | Works, inside a scoped session key |
| Baskets | Six approvals, or one batched transaction | One approval |
| Regulatory exposure | Lowest | Still non-custodial, but we are closer to the money |
| Who judges will be | Crypto-native, already have Phantom | Everyone else |

**Recommendation: both, with Privy as the default.** Privy for people arriving without a wallet,
Phantom for people who have one. Recurring investing is offered only to Privy users in version
one, with a session key scoped to a token allowlist, a per-run cap and an expiry. Everything else
works identically on either.

**Recorded provisionally in [ADR 0003](adr/0003-custody.md). Needs your yes.**

---

## 2 · Is a basket a real token, or a tracked set of positions?

**The question.** When someone invests $500 in the Semiconductors basket, do they end up holding
six token balances that we group in the UI, or one basket token backed by those six?

| | Tracked set | Real token |
| --- | --- | --- |
| Build cost | Days | Weeks. A vault contract, minting, redemption, pricing |
| Works by 12 October | Yes | Unlikely |
| Sendable and giftable | No | Yes |
| Usable as one collateral position | No | Yes |
| Is it the differentiator we claim | Not really | Yes |

**Recommendation: tracked set for the hackathon, real token as the headline of version 1.1.**
Say so plainly in the submission rather than implying otherwise. The claim in
[00 Overview](00-overview.md) about baskets being sendable becomes a roadmap statement, not a
present-tense one, until it ships.

This is the one recommendation I am least comfortable with, because it weakens a differentiator.
If you would rather cut a different feature and build the real token, that is a defensible call.

---

## 3 · Which surface do judges evaluate?

**The question.** You asked for iOS. Colosseum judges will open a link.

**Recommendation: web is the submission, iOS is the product.** Both ship. The web build is what
the deployed link points at and what a judge tries in ninety seconds with no install. The demo
video is shot on the iOS app because it looks better and it is the real product. If the schedule
slips, the iOS app is the first thing cut and the video is shot on the web build in a phone
frame.

---

## 4 · Who is building this, and how many of you?

Scope in [08 Roadmap](08-roadmap.md) assumes two or three engineers working most days for three
weeks. One engineer means cutting to: web only, no baskets, no recurring, buy and sell and
exposure only. That is still a coherent submission and I would rather plan it now than discover
it on 6 October.

---

## 5 · Budget for mainnet testing

Devnet has no tokenized stocks, so every quote, fill and trigger order in development is real
money. Small, but real. A few hundred dollars covers it. Confirm there is a funded wallet and who
owns it.

---

## 6 · Does the auto-invest-from-gains feature belong in this build?

The idea designed for the other hackathon, where a rule skims a slice of a profitable position
into an index basket, fits Solana better than the chain it was drawn for. It is one screen and a
rule engine on top of the execution work already scoped.

**Recommendation: not before 12 October.** It is the best acquisition hook we have and it
deserves to launch when there is a product to acquire people into. Version 1.1.

---

## 7 · The name

You said later. The repository is `harbor` and nothing depends on it. `packages/*` and
`services/*` are named by function, so a rename touches the README, the landing page and the app
display name only.

---

## Settled, for the record

| Decision | Where |
| --- | --- |
| Crypto-native, no fiat ramps in version one | [ADR 0001](adr/0001-crypto-native.md) |
| Solana rather than Robinhood Chain | [ADR 0002](adr/0002-solana.md) |
| Monorepo, pnpm and Turborepo, TypeScript throughout | [ADR 0004](adr/0004-stack.md) |
| The server never signs | [ADR 0003](adr/0003-custody.md) |
| Queued orders use Jupiter triggers, not our own keeper | [04](04-execution-engine.md) |
