# 11 · References

Two kinds. What to read before writing code, and what to look at before drawing screens.

---

## Part 1 · Architecture references

### Rambu / Stocklana · read this one first

`github.com/PugarHuda/rambu` · live at `rambu-kappa.vercel.app` · TypeScript and Rust · pushed
19 September 2026

**A Colosseum submission in our exact substrate, built by somebody serious.** Not a competitor
for the same users: they are building infrastructure, being a fair-price oracle plus an LP audit
tool, where we are building a consumer account. But their findings change our code.

**What they found that we need to act on.**

> SPY went ex-dividend $1.889 on 18 September 2026. On 19 September the SPYx mint still carried
> June's multiplier, 1.005714. A naive `underlying × multiplier` oracle read **17.3 basis points
> low**. Chainlink read within **0.8 basis points**. The Jupiter DEX price read **20 basis points
> low**.

That 1.005714 is the exact multiplier in our own measurements in [01 Evidence](01-evidence.md),
taken the same day. We measured the number and missed what it meant.

The arithmetic: a gross dividend of $1.889 less 30% US withholding for non-US holders is $1.32,
which against a $764 share is 17.3 basis points. So the correction is
`fair = underlying × multiplier + pending_net_dividend`, and it applies for the window between
the ex-date and the issuer folding the dividend into the multiplier.

**Consequences for us.** Three, all now in [04 Execution engine](04-execution-engine.md):

1. A `CorpActionPending` status, which we did not have.
2. Confirmation that reading a raw DEX price as truth is wrong by roughly 20 basis points, which
   is a fifth of our premium tolerance.
3. [ADR 0006](adr/0006-pricing.md) is no longer a preference. Chainlink is the only source
   measured to be right during a dividend window.

**Other things worth stealing.**

- Their status enum is better than ours was: `Open`, `Closed`, `Halted`, `Stale`,
  `CorpActionPending`.
- Pyth publishes a `market_session_schedule` covering regular, pre-market, post-market and
  overnight, plus holidays and early closes. Better than deriving sessions ourselves.
- The multiplier is readable **on chain** from the Token-2022 `ScaledUiAmount` extension, and
  `Pausable` state tells us when the issuer halted a token. We had planned to poll an API.
- Their repository layout is worth copying: `keeper/` holds pure functions with a real test file
  per concern, and fixtures beside them.

**Their LP finding, for later.** Over thirty days the 10bp SPYx/USDC pool netted +$38.2k on
$65.3M of volume after subtracting what arbitrage takes. The 1bp pool lost money during regular
and pre-market hours and earned overnight and at the weekend. If we ever provide liquidity, read
their method before assuming an advertised APR is real.

### Symmetry baskets-ui

> No longer used: baskets moved to Glider ([ADR 0013](adr/0013-baskets-on-glider.md)).

`github.com/symmetry-protocol/baskets-ui` · Next.js, Tailwind, Redux · MIT

The reference implementation of the SDK we are integrating, and it is **forkable**. Use it as a
map of which calls exist and in what order.

**Caution.** Last pushed May 2024, on `@symmetry-hq/baskets-sdk@^0.0.16` and legacy
`@solana/web3.js@^1.90`. Two years stale and a major version behind our stack. Read it for the
call sequence, not for the code.

### Jupiter

`github.com/Jupiter-DevRel/typescript-examples` · `@jup-ag/api` on npm

**Endpoints now require an API key** in an `x-api-key` header, which is a task for week one and
not an afterthought. Two integration paths exist: Ultra, which delegates execution complexity to
Jupiter and is the cleanest, and the Router path, which is the one you need if a transaction
requires cross-program invocation or any modification after it comes back. Our basket deposit in
path B of [10 Baskets](10-baskets.md) modifies transactions, so check which path that forces
before committing.

### Privy fiat onramp demo

`github.com/privy-io/fiat-onramp-demo` · Next.js · pushed January 2026

The working reference for [ADR 0007](adr/0007-wallet-funding.md). Copy the flow, not the styling.

---

## Part 2 · Competitive reading

### Backpack · the closest thing to us that already exists

Sheets in [`refs/crypto/backpack.jpg`](refs/crypto).

Their own words: _"One portfolio. Unified capital."_ Their marketing lists trade, invest, earn,
hedge, crypto, margin, perps, yield, wallet, DeFi, stablecoins and fiat. Their portfolio
screenshot holds USDC and Solana alongside **MU** and **SPCX**, which are tokenized Micron and
SpaceX. Cash earns 3.35% with auto-lend on and stays usable as collateral. Portfolio margin lets
the whole book back a position while it keeps earning. Their explore tab filters by Crypto,
**Stocks** and Sites, across networks including Robinhood.

**So the claim that stocks and crypto in one portfolio is novel is not available to us.** They
shipped it.

**What they do not have**, from these screens: baskets, any comparison between issuers of the
same stock, exposure deduplication, or any awareness that the US market
is shut. And they are unmistakably a **trading** product. Perps, margin, advanced charts, order
types, subaccounts.

That sharpens our position rather than weakening it. M1's line becomes the right one: built for
investors, not traders. Our differentiators survive intact because none of them are about holding
stocks and crypto in one list.

### The rest

`refs/crypto/` also holds Phantom, Jupiter Mobile, Kraken, Bitget Wallet, eToro and Trading 212.
`refs/` holds the traditional side: M1, Robinhood, smallcase, and the rest from
[07 Design](07-design.md).

Worth knowing: **eToro and Trading 212** are the two apps our target user in Europe or Asia has
probably already tried and found closed to them or slow. **Kraken** ships tokenized stocks inside
a normal exchange interface, which is the boring version of this idea.
