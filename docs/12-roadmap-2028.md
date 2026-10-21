# 12 · Roadmap to October 2028

Where Mercury is heading, what it owns and what it rents along the way, and whether it survives the
next twelve months. Written 21 October 2026 from three research reports (listed at the end).
[08 Roadmap](08-roadmap.md) is the hackathon plan and stays as written; this one picks up after it.

It assumes what the founders said on 21 October:

- **Team:** two to four engineers.
- **Runway:** under twelve months.
- **Stage:** private beta, with some real users and small balances.
- **Markets:** global outside the US, no focus yet. Backed's xStocks are blocked in the US, UK,
  Canada and Australia.
- **Licences:** not decided.

Every date after Phase 1 assumes funding arrives. Without it, Phase 1 is the plan.

## Where Mercury is heading

By October 2028 Mercury is **a money and investing account for people outside the US.** Their
dollars earn while they sit. Their stocks work as collateral. They spend from both by card or by
send, and their portfolio is not public to anyone reading the chain.

Underneath sits **Mercury's own account protocol on Solana**: one account per user, directed only
by that user's key. Earn, borrowing, spending, the card and baskets are all modules acting on that
one account, and a single health check runs across everything in it.

The direction in one line: **partner for everything now, own the account and the credit later,
and only rent what should stay rented.**

### What Mercury owns, by phase

| Layer                  | Today (Oct 2026)                   | Phase 1 (to Apr 2027)                                            | Phase 2 (to Oct 2027)                                                  | Phase 3 (to Oct 2028)                         |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| The account            | Privy wallet                       | Privy wallet, with policy-scoped signing                         | **Mercury Account**, opened when a user borrows or turns on the card   | Mercury Account for everyone                  |
| Cash                   | USDC                               | USDC, plus a distributed dollar (USDG or OUSD) for float income  | Same                                                                   | Mercury-branded dollar, if float justifies it |
| Earn                   | Kamino Earn vaults (PR #98)        | One Cash balance lent through a partner (Jupiter Lend or Kamino) | **Mercury earn share token**, allocating to our market and to partners | Same, larger share in our own market          |
| Borrowing              | Kamino xStocks market              | Kamino                                                           | **Mercury credit market** (SPYx, QQQx first)                           | More collateral; spend against stocks         |
| Card                   | None                               | Bridge card                                                      | Card buffer inside the Mercury Account                                 | Card credit mode                              |
| Swaps                  | Jupiter                            | Jupiter RFQ                                                      | Jupiter RFQ                                                            | Jupiter RFQ, plus our own netting             |
| Baskets                | Glider                             | Glider                                                           | Glider                                                                 | Baskets as sub-accounts                       |
| Privacy                | None                               | Protected submission                                             | Token configured for privacy at mint                                   | **Private balances and private sends**        |
| Stocks, oracles, chain | Backed, Chainlink and Pyth, Solana | Same                                                             | Same                                                                   | Same: these stay rented                       |

## Is the direction right?

**The product direction is right.** One self-custodial account where dollars earn, stocks work as
collateral and both can be spent is where the market is going. Plasma One, ether.fi Cash, Robinhood
Earn and Kraken's xStocks vaults all ship pieces of it. Mercury already does the parts most of them
get wrong: correct cost basis and P&L, borrowing that respects market hours, and an onboarding
that needs no wallet knowledge.

**"Build everything in-house" is the right destination and the wrong next twelve months.** The
research found the same thing three times:

- **It pays about the same.** Mercury's own lending market would pay depositors about 4.4–5.8%.
  Jupiter Lend paid 5.62% on 21 October.
- **It's capped by borrowing.** Kamino's entire xStocks market carries about $5.2M of debt.
- **The cheap revenue isn't in-house.** Partner programs already pay apps nearly all the reserve
  income on the dollars they bring in.

So the reason to build in-house is control and product, and both only matter once there are users
to protect and serve. Each in-house layer also adds a program holding user money: at least two
audits, a timelocked admin, a bug bounty, and an attack surface. On Solana, systems of exactly this
kind are the ones that lost the most (Drift about $285M in April 2026, Mango about $114M).

**Three corrections to how we were thinking about it:**

1. **The dollar is a revenue line before it is a protocol.** Idle in-app balances earn three to six
   times what a lending fee earns on the same money. Distributing an existing dollar captures most
   of that with no new token, no liquidity to build and no issuer to negotiate token controls with.
2. **Borrowing is the yield strategy.** Depositors can only earn what Mercury's borrowers pay. So
   "spend against your stocks" and a good margin-call experience are earn features.
3. **Privacy lives on a token Mercury controls.** USDC can't do confidential transfers, and issuers
   keep that switch on every other dollar checked on-chain. The earn share token is where Mercury
   can turn privacy on, so its configuration must be chosen before it is created.

**What to drop or defer:** our own chain (not before 2029, and only as a rollup that settles back to
Solana), becoming a dollar issuer (6–18+ months of licensing), minting dollars against stocks, and
private positions (no lending market on any chain keeps positions private in production).

## Can Mercury survive?

**Yes, if the next six months go to revenue, security and a raise rather than to protocol
building.** With two to four engineers and under twelve months of runway, the in-house protocol is
fundable but not buildable. Audits alone would take a large share of the runway before a single
user benefits.

### The survival maths

An illustrative burn of **$50k a month** for four people and infrastructure is an assumption, not a
figure from the founders. Covering it takes some mix of:

| Revenue line                                 | What $10k a month takes                                        | Notes                                                                    |
| -------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Trading fee, 0.5% (tiers planned)            | About $2M of monthly trading volume                            | Live today                                                               |
| Dollar float through a partner program       | About $3.6–5.5M of idle balances                               | 2.2–3.3% gross reserve yield, before the partner's fee; secondary source |
| Card interchange                             | About $1M of monthly spend at 1%, or $5M at the EEA's 0.2% cap | Bridge programs keep their interchange; non-EEA rates unverified         |
| Borrow fee, 0.25% of each new loan (planned) | About $4M of new loans a month                                 | Counsel first: does it make Mercury a lender?                            |
| Basket fee 0.5%, add-cash fee 0.3%           | Small at first                                                 | Waiting on Glider's payout terms                                         |

Break-even at $50k a month could be roughly $6M a month of trading plus $8–10M of idle balances.
That is a few thousand funded users with average balances of a few thousand dollars. It is a real
climb from a private beta, and it is why the plan below spends Phase 1 on distribution and revenue.

### What would kill it, and the answer to each

| Risk                                 | How it happens                                                                                                                                                                 | Answer                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Runway runs out**                  | Building protocols before the product earns or raises                                                                                                                          | Phase 1 builds no on-chain program of our own                                                                       |
| **A security incident**              | Silent signing with no policy ([ADR 0012](adr/0012-silent-signing.md)) once real money arrives. Infini lost $49.5M to admin rights it kept on its contracts                    | Policy-scoped signing ships before the public launch                                                                |
| **A partner fails or changes terms** | Kamino blocked Jupiter's program (Dec 2025). Card issuer Kulipa shut down (Jul 2026, 120,000 cards stopped). Hyperliquid's USDH was sunset (May 2026)                          | Abstract every partner behind our own interface; prefer pull-at-purchase cards, which left Kulipa users' funds safe |
| **Regulation**                       | "Global, no focus" means exposure everywhere: EU consumer credit rules from 20 Nov 2026, the EU's ban on obfuscated accounts from 10 Jul 2027, yield rules for branded dollars | Pick one or two launch markets; one legal memo covering earn, the borrow fee and card credit                        |
| **Competition**                      | Robinhood, Kraken, Bybit, Revolut, Phantom and Jupiter all sell tokenised stocks                                                                                               | Compete on being the simplest complete account for a beginner, not on stock access                                  |
| **xStock dependence**                | Backed changes terms, coverage or geoblocks                                                                                                                                    | Keep issuer-agnostic plumbing (the engine already compares wrappers) and watch Ondo's tokens                        |

## The roadmap

### Phase 1 · Survive and prove · November 2026 to April 2027

The current team. **No new on-chain programs.** Everything rides on partners.

1. **Close the security gap.** Replace silent signing with Privy signing scoped by policy before
   real balances arrive ([ADR 0003](adr/0003-custody.md), [ADR 0012](adr/0012-silent-signing.md)).
2. **Launch publicly in one or two markets.** A country check at sign-in, the restricted list, and
   a reason shown to blocked users ([revenue TODO](revenue-todo.md)).
3. **Turn on revenue.** Fee tiers, referrals, the basket fee, and the borrow fee once counsel
   agrees.
4. **Earn v1 on partner rails.**
   - Fix the top problems from the PR #98 review: switching vaults moving more than it says, held
     vaults vanishing, "earned so far".
   - Show one Cash balance earning a variable rate, chosen at sign-up and not pre-checked.
   - Put the withdrawal inside the spend's own transaction.
5. **Distribute a dollar for float income.** Join Paxos's Global Dollar Network (USDG) or Bridge's
   OUSD program, or negotiate USDC partner terms, while cash stays spendable at par. Then measure
   idle balances: that one number decides the dollar track.
6. **Card v1 with Bridge.** Bridge pulls from the user's USDC account at purchase. First confirm
   Bridge's non-US issuing for the chosen markets; it says EU and Asia-Pacific issuing is planned
   for 2026. If coverage is missing, Rain or Reap.
7. **Raise.** On traction, with this document as the protocol story.

**Gate to Phase 2:** funding secured (a team of six to eight), and measured demand for borrowing and
for holding balances. The founders should set the exact thresholds.

### Phase 2 · Own the account and the credit · May to October 2027

1. **Mercury Account v0.** One Mercury program owns a per-user account holding cash, xStocks, earn
   shares and one debt ledger.
   - Every instruction ends in the same health check.
   - Operators get narrow permissions: a capped amount, a fixed destination, an expiry.
   - A one-tap user lockdown.
   - A card buffer the card issuer pulls from, which can't be withdrawn instantly while card spend
     is waiting to settle.
   - Opened only when a user borrows or turns on the card. Everyone else keeps the Privy wallet.
2. **Mercury credit market.**
   - One isolated USDC market for SPYx and QQQx.
   - Prices that follow market hours, and no liquidations on closed-market prices.
   - Correct handling of the dividend multiplier.
   - A backstop liquidator and a reserve that takes losses first.
   - Then move existing borrowers off Kamino.
3. **Earn share token.** Mercury's own token for earn, allocating to the credit market and to
   capped partner venues. Its mint is created with confidential transfers and a compliance hook
   available, and an auditor key Mercury holds.
4. **Spend against your stocks.** The spend and card modules may draw on the credit line within
   limits. This is the product that grows borrowing, and borrowing is what funds earn.
5. **Security before launch:**
   - At least two audits per program on a frozen commit.
   - A bug bounty live from day one.
   - Admin through a Squads multisig with a 48–72 hour timelock.
   - A guardian that can only pause or lower limits.
   - Deposit caps raised slowly.

**Gate to Phase 3:** months without incidents as caps rise, and borrowing holding near its target
share of deposits.

### Phase 3 · Private, branded, wider · November 2027 to October 2028

1. **Private balances and sends between Mercury users.** Amounts are hidden on the earn share token.
   The rule is private from the public, never from Mercury or its auditors. Mercury publishes
   aggregate solvency figures, and users can check their own balance against them.
2. **Identity as an attestation.** "KYC'd, allowed country, not sanctioned" is recorded through the
   Solana Attestation Service, with no personal data on-chain.
3. **Private payments out of Mercury** through a screened partner pool such as Umbra, with caps.
   Possibly off for EU users after July 2027.
4. **A Mercury-branded dollar,** if idle balances justify it. Before the mint exists, write into the
   issuer contract who holds the auditor key and the compliance hook, and what happens if we leave.
5. **More collateral and card credit mode.** Following the loan-to-value ladders Kamino and Jupiter
   Lend publish, with a pause around earnings for the most volatile names.
6. **A stock-lending pilot:** yield on stocks, not cash. It lets others short, so check it against
   [ADR 0009](adr/0009-investing-not-trading.md) first.
7. **Baskets as sub-accounts** of the Mercury Account.
8. **Freeze the credit market's core** once it is stable. Kamino's lending code becomes GPL on
   17 November 2027, which opens a second option for this layer.

### After 2028, only if the numbers say so

- **Private positions,** once encrypted account state is in production somewhere. It isn't today.
- **Our own dollar licence,** once the issuer's cut costs more than licensing would.
- **Our own chain:** a rollup that settles back to Solana, once there is captive volume to move.

## Decisions that cannot be undone

| Decision                                    | Options                                                                              | Decide by                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Launch markets                              | One or two focused markets, or global                                                | Phase 1, before the public launch                                                     |
| Card issuer model                           | Bridge's pull at purchase, or a credit issuer (Rain, Reap)                           | Phase 1                                                                               |
| Dollar partner and exit terms               | USDG, OUSD, USDC terms                                                               | Phase 1                                                                               |
| Account container                           | Mercury-owned per-user account, or a smart wallet with positions held elsewhere      | Start of Phase 2                                                                      |
| How upgradeable the core stays              | Long timelock, or immutable after a period                                           | Before Phase 2 audits                                                                 |
| Token configuration of the earn share token | Confidential transfers, auditor key, compliance hook, pause                          | Before it is minted                                                                   |
| Confidential-transfer key derivation        | From Privy signatures (needs deterministic signing) or a dedicated key with recovery | Before Phase 3                                                                        |
| Licences                                    | Stay software, take one crypto-provider licence, or become regulated                 | Before Phase 2. Pooled custody, private positions and our own dollar all depend on it |

## Security rules for every phase

- Every instruction leaves through the health check.
- The owner can always withdraw anything not backing a loan, even while paused. Only the card
  buffer waits for settlement.
- Admin changes are timelocked, with hard ceilings on new collateral, loan-to-value limits and
  oracle changes. The guardian can only reduce risk.
- Signature checks and admin paths get the strictest review, and every deployment stays on the
  current version. Both 2026 card-program exploits (Gnosis Pay, Rain) were in those paths.
- Never value collateral from on-chain xStock trades.
- The relayer and every keeper or operator key carry no protocol privilege beyond their one job.
- Loss rules and incident messages are published before launch.

## Open questions

**For the founders**

- Which one or two launch markets? "Global, no focus" carries every jurisdiction's rules at once.
- What are the burn and runway, and when is the raise?
- Which licence path, given the table above?
- PR #98: keep its building blocks (the Kamino adapter, deposit records, relayer sponsorship) and
  drop the vault picker?

**For partners**

- Bridge: which non-US countries issue cards today, and will it pull from a token account owned by
  a program rather than a user wallet?
- Paxos and Bridge: dollar partner terms, and fees.
- Kamino: a referrer share on the xStocks market. It is 0% today.
- Glider: how the basket fee is paid out.
- Privy: are signatures deterministic, and can a policy pin the destination account of a custom
  program's instruction?

**For counsel**

- Earn as an opt-in wrapper paying a variable rate: what wording and consent each launch market
  needs.
- Does a 0.25% borrow fee make Mercury a lender?
- Is stock-backed card credit consumer credit under the EU rules from 20 November 2026?
- Rewards on a branded dollar, given the US related-party presumption and MiCA Article 50.

## Sources

- [In-house cash yield](research/2026-10-21-in-house-cash-yield.md): yield sources, vault and
  lending designs, spendable cash, security incidents.
- [Owning the dollar](research/2026-10-21-owning-the-dollar.md): issuance routes, earn and borrow
  on an owned dollar, market makers and liquidity, privacy.
- [Account protocol and privacy](research/2026-10-21-account-protocol-and-privacy.md): one account
  for earn, borrow, spend and card; card settlement; privacy across the account.
- The researchers' notes, with every source, are in [research/notes](research/notes).
