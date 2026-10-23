# Own the Vault First, Then the Loan Book

Mercury can pay users yield on cash through its own protocol without taking custody of their money. But only one yield source is truly Mercury's to own: interest paid by its own stock-backed borrowers. Today that source is far too small to carry a cash product alone. The design that fits copies Morpho's split between a small, hard-to-change lending core and a curated vault. Users hold a Mercury vault share token in their own Privy wallets. The vault splits deposits between an isolated Mercury USDC market for xStock borrowers and capped positions in deep external venues such as Jupiter Lend and Kamino. The closed loop pays about the same as external venues, not more. At 7–8% borrow rates, 70–80% utilization and a 10% fee, depositors earn about **4.4–5.8%** and Mercury about **$0.5–0.6M per $100M** of deposits. Jupiter Lend pays **5.62%** today, and the entire Kamino xStocks market has only **$5.2M** borrowed, which would fund about $6–6.5M of deposits. Cash stays spendable because a Solana transaction can carry a lending withdrawal and the user's spend together under one signature. Only automatic sweeps of incoming cash need a narrowly scoped delegate. The biggest risk is admin and oracle design, not exotic code. Drift lost about **$285M** in April 2026 after a 2-of-5 multisig with no timelock was used to list fake collateral and swap its oracle. xStocks add weekend price gaps, thin on-chain liquidity and a dividend multiplier built into the token. Private payments and an own chain belong to later phases; the projects that did them first had scale Mercury does not yet have. The roadmap that follows has four gated stages: external receipts, a Mercury vault, a closed-loop market, then expansion and freezing. External protocols end up as a capped liquidity buffer, not gone.

## Borrower interest is the only cash yield Mercury can own

### Lending rates have fallen toward T-bills, and other dollar yields are gated or unstable

A USDC lender earns the borrow rate times utilization, minus the protocol's cut. Jupiter Lend says "borrowers pay the full interest rate, lenders receive 90%, and 10% goes to the protocol treasury" ([Jupiter Lend FAQ](https://docs.jup.ag/user-docs/earn/lend/faq.md)). Kamino's cut varies by market from **0% to 35%** ([Blockworks](https://blockworks.com/analytics/kamino/kamino-financials)). Returns have fallen sharply. Kamino's long-running USDC reserve averaged **11.23% in 2024, 4.78% in 2025 and 3.77% so far in 2026** ([DefiLlama](https://defillama.com/yields/pool/d2141a59-c199-4be7-8d4b-c8223954836b)). Aave's Ethereum USDC pool went from 7.17% to 4.12% to 3.40% over the same years ([DefiLlama](https://defillama.com/yields/pool/aa70268e-4b52-42bf-a116-608b370f9501)). The 2024 figures came from bull-market leverage demand and are not a steady state. With the fed funds target at 3.50–3.75% after the June 2026 FOMC ([Advisor Perspectives](https://advisorperspectives.com/dshort/updates/2026/06/18/feds-interest-rate-decision-june-17-2026)), USDC lending now pays roughly T-bills plus 0–2 points. On October 21, 2026, Jupiter Lend's USDC Earn paid **5.62%** on $487.5M ([DefiLlama](https://defillama.com/yields/pool/d783c8df-e2ed-44b4-8317-161ccc1b5f06)). Mercury's borrowers use Kamino's xStocks market. There, suppliers earned **5.09% against a 6.25% borrow rate at 91% utilization**, on only $5.7M supplied ([DefiLlama](https://defillama.com/yields/pool/571311bf-7da7-4f3c-b181-43119070bffc)).

The set of external venues has also narrowed. Drift's TVL fell from $984M in October 2025 to about $1M after its exploit ([DefiLlama](https://defillama.com/protocol/drift-trade)). Kamino Lend shrank from $2.92B to $1.33B over the same year ([DefiLlama](https://defillama.com/protocol/kamino-lend)), while Jupiter Lend grew to $1.04B ([DefiLlama](https://defillama.com/protocol/jupiter-lend)). On Solana, "external protocols" now effectively means two counterparties. Aave's April 2026 episode shows what high utilization does to depositors. After the rsETH shock, Aave's Ethereum USDC reserve hit **99.87% utilization with under $3M available**. The governance post blamed users "seeking dollar liquidity from positions whose normal exit paths were blocked" ([Aave governance](https://governance.aave.com/t/arfc-improve-liquidity-buffer-for-usdc-on-aave-v3-ethereum-core-raise-slope-2-lower-optimal-utilization/24684)).

The other dollar yields either cannot reach Mercury's users or do not behave like cash.

**Tokenized T-bills** yield about 3.6–3.9%, but access is restricted:

- BlackRock's BUIDL is limited to qualified purchasers with whitelisted wallets ([eco.com](https://eco.com/support/en/articles/15254013-buidl-deep-dive-2026)).
- Circle's USYC is open "only to eligible non-US institutional investors" ([Circle](https://www.circle.com/blog/usyc-now-available-on-solana)).
- Ondo's USDY pays 3.71% on Solana but is limited to KYC'd non-US persons, with a reported 40-day transfer lock ([eco.com](https://eco.com/support/en/articles/15254015-usdy-deep-dive-2026-ondo-s-retail-yield-token); [DefiLlama](https://defillama.com/yields/pool/00b83068-9f87-4411-b5d7-5d2ff48c40c4)).

These suit a Mercury treasury sleeve, if Mercury qualifies, better than passing yield through to retail users.

**Issuer revenue sharing** pays the distributor, not the holder. Paxos's Global Dollar Network credits USDG rewards to partners' invoices on Solana and other chains. It excludes EU-incorporated organizations "under MiCA" ([Fordefi](https://docs.fordefi.com/user-guide/usdg-rewards.md)). One source says it shares "up to 100%" of reserve income; another says about 97% ([eco.com](https://eco.com/support/en/articles/11753007-what-is-global-dollar-usdg-complete-guide-to-the-yield-); [Datawallet](https://www.datawallet.com/crypto/usdg-explained)). That money can fund off-chain "rewards" on stablecoins that never leave the wallet. The self-custodial Base App does this, paying up to 3.35% on USDC ([App Store](https://apps.apple.com/app/id1278383455)). It also carries the most regulatory exposure (see below).

**Synthetic dollars** have lost their edge. Ethena's sUSDe averaged **17.47% in 2024 but 4.17% in 2026** ([DefiLlama](https://defillama.com/yields/pool/66985a81-9c51-46ca-9977-42b4fe7bc6df)). USDe traded at about $0.65 on Binance during the October 10, 2025 crash ([Dune](https://community.dune.com/blog/032)).

**JLP, HLP and SOL staking** are not dollar-stable at all. They matter only as borrowers: JLP loopers keep Kamino's JLP-market USDC at 99% utilization and a 10.24% borrow rate ([DefiLlama lendBorrow](https://yields.llama.fi/lendBorrow)).

| Yield source                                        | Yield, Oct 2026                  | Who can hold it                                  | Fit for spendable cash                            | Can Mercury own it?                                       |
| --------------------------------------------------- | -------------------------------- | ------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------- |
| External USDC lending (Jupiter Lend, Kamino)        | ~4.3–5.6%                        | Anyone                                           | Good, but withdrawals stall near full utilization | No; Mercury can only choose and cap allocations           |
| Lending to Mercury's own xStock borrowers           | Borrow × utilization × (1 − fee) | Anyone                                           | Good if utilization is capped                     | Yes                                                       |
| Tokenized T-bills (BUIDL, USYC, USDY, USTB)         | ~3.6–3.9%                        | Qualified, institutional or non-US KYC'd holders | Stable principal, but gated                       | Only as a treasury sleeve                                 |
| Issuer revenue share (USDG network)                 | Near T-bill, paid to the app     | The distributor                                  | No friction                                       | Only as an app-paid reward, with high regulatory exposure |
| Synthetic and strategy dollars (sUSDe, USDC+, USD*) | ~4–5.5%                          | Varies                                           | Poor: basis, depeg and stacked protocol risk      | No                                                        |
| JLP, HLP, SOL staking                               | Volatile or paid in SOL          | Anyone                                           | Not dollar-stable                                 | No; useful only as borrow demand                          |

### The closed loop matches external yields, and borrower demand caps its size

In a single-pool design, depositor yield = borrow rate × utilization × (1 − protocol fee). Applying the formula Jupiter Lend documents gives these outcomes:

| Borrow APR | Utilization | Depositor APR, 10% fee | Mercury revenue per $100M | Depositor APR, 20% fee | Mercury revenue per $100M |
| ---------- | ----------- | ---------------------- | ------------------------- | ---------------------- | ------------------------- |
| 7.0%       | 70%         | 4.41%                  | $0.49M                    | 3.92%                  | $0.98M                    |
| 7.0%       | 80%         | 5.04%                  | $0.56M                    | 4.48%                  | $1.12M                    |
| 8.0%       | 70%         | 5.04%                  | $0.56M                    | 4.48%                  | $1.12M                    |
| 8.0%       | 80%         | 5.76%                  | $0.64M                    | 5.12%                  | $1.28M                    |
| 8.0%       | 90%         | 6.48%                  | $0.72M                    | 5.76%                  | $1.44M                    |

Three conclusions follow.

**First, the loop pays about the same as external venues, not more.** These depositor rates sit on either side of Jupiter Lend's 5.62% today. They also assume borrowers pay 7–8%. That is above Kamino's 6.25% xStocks borrow rate and above Interactive Brokers' retail margin rate of benchmark + 1.5%, or 5.14% ([IBKR](https://interactivebrokers.ca/en/accounts/fees/pricing-margin-rates.php)). If Mercury matched Kamino's 6.25% and held utilization at 80%, depositors would get 4.50% after a 10% fee. The only reason borrowers would pay a premium is a captive, in-app borrowing experience.

**Second, Mercury cannot copy brokerage economics.** IBKR pays benchmark − 0.5% on cash (3.12%) and charges benchmark + 1.5% on margin. It keeps that ~2-point spread because it is a balance-sheet intermediary ([IBKR](https://interactivebrokers.ca/en/accounts/fees/pricing-interest-rates.php?p=i)). A non-custodial pool passes most of the spread to depositors. Mercury keeps only its reserve factor, **roughly 0.5–1.3% of deposits a year**. Keeping more would mean becoming the lender. That is the structure behind the SEC's $100M BlockFi settlement and $45M Nexo settlement ([SEC](https://www.sec.gov/news/press-release/2022-26); [The Block](https://www.theblock.co/post/203983/nexo-pays-45-million-to-settle-sec-and-state-charges-for-failing-to-register-lending-product)). A 10% vault fee on external allocations earning 5% brings in 0.5% of assets, about the same as the in-house protocol fee. So the case for an in-house market rests mainly on control, product and resilience, not revenue.

**Third, borrowers set the scale, not depositors.** The Kamino xStocks market holds about $23.3M of xStock collateral against roughly $5.2M of USDC debt ([Kamino API](https://api.kamino.finance/kamino-market/5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua/reserves/metrics?env=mainnet-beta)). Only about 9.9% of the roughly $845M of on-chain xStocks is in DeFi at all ([Coinpaprika](https://coinpaprika.com/education/tokenized-stocks-defi/)). Even if Mercury captured every dollar borrowed in that market, at 80–85% utilization it would fund only about $6–6.5M of deposits. A rough rule of thumb (an estimate, since part of that debt is backed by cbBTC): if Mercury's users borrow about a fifth of their xStock value, the closed loop can absorb deposits worth about a quarter of their stock holdings. Every deposit beyond that needs another home.

That makes the vault's external allocation permanent, not a temporary step. An illustrative mix:

- 15% of deposits supplied to the in-house market (7% borrow, 80% utilization, 10% fee)
- 80% in external lending at 5%, with a 10% vault fee
- a 5% idle buffer

Users would earn about **4.4%** and Mercury about **0.48% of deposits**. That beats T-bill tokens but trails the best single external venue on a good day. Another option is to keep 10% of deposits as idle USDC and put the rest of the unborrowed share in a 3.6% T-bill token. At 8% borrow, 70% utilization and a 10% fee, that lifts depositor yield from 5.04% to about 5.76%, but only if Mercury is allowed to hold such tokens.

The loop also concentrates risk inside one community. When stocks sell off, Mercury's borrowers move toward liquidation at the same moment its depositors want cash to buy the dip. That is the Aave April 2026 pattern on a small scale. A cash product therefore needs a lower kink (the utilization point where rates start rising steeply) than the 90–92% that Morpho and Aave target.

The legal frame shapes the product as much as the math does:

- **GENIUS Act** (signed July 18, 2025): bars stablecoin issuers from paying holders "any form of interest or yield... solely in connection with the holding, use, or retention" of a payment stablecoin ([Loeb & Loeb](https://www.loeb.com/en/insights/passle/2025/08/navigating-the-genius-acts-framework-for-digital-asset-regulation)).
- **OCC proposal** (February 2026): would extend that ban to affiliates and related parties ([JD Supra](https://www.jdsupra.com/legalnews/stablecoin-yield-saga-continues-occ-3886986/)).
- **CLARITY Act Senate compromise** (May 1, 2026): would ban payments "economically or functionally equivalent" to deposit interest but allow activity-based rewards, including for "providing liquidity in DeFi protocols" ([Baker McKenzie](https://blockchain.bakermckenzie.com/2026/05/05/the-clarity-acts-yield-compromise-what-the-senate-actually-agreed-to-and-why-it-matters/)). The bill cleared Senate Banking but stalled before the August recess. Its status since then is unconfirmed ([Crypto Briefing](https://cryptobriefing.com/clarity-act-stalls-stablecoin-yield-concerns/)).
- **MiCA Article 50** (EU): bars both e-money-token issuers and crypto-asset service providers from granting interest ([ESMA](https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mica/article-50-prohibition-granting-interest)).

Lending interest is a different legal category from issuer yield. The largest US platforms have settled on user-directed lending from the user's own wallet, through a third-party curator. Coinbase routes USDC into Morpho vaults curated by Steakhouse ([The Block](https://www.theblock.co/post/371281/coinbase-usdc-onchain-lending)). Robinhood Earn routes USDG into Morpho and Spark, and is described as "a DeFi lending position, not an FDIC-insured savings account" ([Raptor Group](https://www.raptorgroup.com/news/paxos-spark-powers-robinhoods-usdg-stablecoin-savings-product-launch/)). An in-house protocol removes that curator buffer. Mercury itself would set rates, collateral and allocation. That is exactly the kind of managerial role securities analysis looks at. This is an inference for counsel to test, not a settled answer.

Jurisdiction matters too. Jupiter's xStocks risk assessment notes that US persons are geo-blocked from xStocks ([Jupiter Lend](https://static-r2.jup.ag/lend/risk-research/xstocks-risk-report.pdf)). Mercury's borrower base is therefore mostly non-US. That makes non-US rules more relevant than US ones, and it brings products open to non-US retail, such as USDY, into play.

## Morpho's split of a frozen core and a curated vault fits Mercury

Morpho is the most useful design reference because it separates the part that must be correct forever from the part that must change often. Morpho Blue is "a simple, immutable, and governance-minimized base layer". Each market is defined by a fixed set of five things: loan token, collateral token, oracle, interest-rate model and liquidation LTV ([Morpho Blue](https://github.com/morpho-org/morpho-blue)). Every discretionary decision lives in a separate vault layer.

Vaults V2 has been live since late September 2025 ([vault-v2](https://github.com/morpho-org/vault-v2)):

- **Adapters:** vaults allocate through adapter contracts.
- **Caps:** exposure is capped by abstract risk "IDs" (a collateral, an oracle, a protocol), both in absolute terms and as a share of the vault.
- **Roles:** an owner, a curator, allocators, and **sentinels that can only reduce risk**.
- **Exit:** a permissionless `forceDeallocate` lets depositors exit in kind for a penalty of at most 2%.
- **Gates:** optional KYC gates, which Morpho itself warns can "weaken noncustodial guarantees".

Curator actions can be timelocked for up to three weeks. Cap decreases are exempt, so the emergency playbook is simply to set every cap to zero ([Morpho docs](https://docs.morpho.org/curate/tutorials-v2/emergency)).

Mapped onto Mercury, this becomes two programs:

1. **One minimal Solana market program** for USDC lending against a few xStocks.
2. **One thin vault program** that holds user cash and allocates between that market and external venues. A deep external venue acts as the vault's liquidity adapter.

Protocols across chains isolate risk in different ways:

- **Pooled cross-margin with risk flags:** Aave v3's isolation mode and eMode ([Aave](https://aave.com/docs/aave-v3/overview)) and marginfi's risk tiers ([marginfi-v2](https://github.com/mrgnlabs/marginfi-v2)).
- **Exactly one borrowable asset, so collateral is never lent out:** Compound III and Jupiter Lend's vaults ([Compound](https://docs.compound.xyz/liquidation/); [Jupiter Lend](https://developers.jup.ag/docs/lend/architecture)).
- **Fully isolated markets:** Morpho and Euler.
- **Shared liquidity with per-module caps:** Aave v4, launched March 30, 2026. An immutable Hub enforces per-Spoke caps, and an opt-in Reinvestment Module can sweep idle liquidity to external strategies ([Aave v4](https://github.com/aave/aave-v4/blob/main/docs/overview.md)).

Mercury has one loan asset and a handful of collaterals, so an isolated design with a single borrowable asset fits. It removes the need for an interest-rate model on xStocks. It prevents shorting and reuse of collateral. It also closes the path Drift's attacker used, where one new collateral market and one oracle change drained every asset in a shared pool ([BlockSec](https://blocksec.com/blog/drift-protocol-incident-multisig-governance-compromise-via-durable-nonce-exploitation)). Kamino's xStocks market is a partial counter-example. It accepts USDC as collateral to borrow xStocks ([Kamino on X](https://x.com/kamino/status/2047693104682299699)), which adds xStock borrow-side risk that Mercury does not need.

Share accounting is where vaults most often break. Solana has no ratified equivalent of ERC-4626, the EVM vault standard; Solana's own guide says the pattern is implemented "with custom programs" ([Solana](https://solana.com/developers/evm-to-svm/erc4626)). Each major lender mints its own SPL share token: Kamino's cTokens and kVault shares, Jupiter's jlTokens. That is the right model for Mercury. A transferable share token is what users hold in their wallets, and every later stage can reuse it.

The standard defenses are well established:

- **Internal tracking of assets.** Euler's vault kit prices shares from internally tracked cash and borrows plus a virtual deposit, so tokens sent directly to the vault cannot move the rate ([EVK](https://github.com/euler-xyz/euler-vault-kit/blob/master/docs/whitepaper.md)). Kamino's kVault tracks `token_available` internally ([kvault](https://github.com/Kamino-Finance/kvault/blob/master/programs/kvault/src/state/vault_state.rs)).
- **A seed deposit at creation.** klend seeds every new reserve with a minimum deposit when it is initialized ([klend](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/handlers/handler_seed_deposit_on_init_reserve.rs)).
- **Rounding against the user.** EIP-4626 requires rounding in the vault's favor in every direction ([EIP-4626](https://eips.ethereum.org/EIPS/eip-4626)).

Mercury's vault should use all of these: internal accounting, a seeded and burned first deposit, and a virtual offset.

The interest-rate curve and the exit tools decide whether "cash" really behaves like cash. Morpho's AdaptiveCurveIRM targets 90% utilization. Morpho justifies that high target because it "doesn't rehypothecate collateral" ([Morpho IRM](https://docs.morpho.org/learn/concepts/irm/)). klend uses an 11-point piecewise curve and a reserve setting that blocks new borrowing above a utilization limit ([klend](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/state/reserve.rs)).

Behind the curve, protocols stack several exit tools:

- idle buffers and liquidity adapters (Morpho V2)
- withdrawal limits that expand over time (Fluid, which underpins Jupiter Lend) ([Fluid docs](https://git.instadapp.io/Instadapp/fluid-contracts-public/src/branch/main/docs/docs.md))
- first-in, first-out withdrawal tickets (klend's `enqueue_to_withdraw`) ([klend](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/state/withdraw_ticket.rs))
- in-kind redemption

For a consumer cash product, Mercury should:

1. cap borrowing at around 85% utilization
2. keep a vault-level buffer plus a liquidity adapter to Jupiter Lend
3. make the curve steep above the kink, so borrowers repay when liquidity is short
4. keep a withdrawal queue as the last resort, so withdrawals slow down instead of failing

The trade-off is real: every point of liquidity buffer costs depositors yield. After April 2026, Aave proposed a steeper USDC curve with the kink lowered to 85–87%. The proposal met opposition and was dropped ([Aave governance](https://governance.aave.com/t/arfc-improve-liquidity-buffer-for-usdc-on-aave-v3-ethereum-core-raise-slope-2-lower-optimal-utilization/24684)).

Liquidation is the hardest part. The standard model assumes a keeper can seize collateral and sell it on-chain straight away, and xStocks break that assumption. On Solana, liquidators are permissionless bots that flash-borrow and swap through DEXs in one transaction ([Solscan](https://solscan.io/tx/29GBZCWDnxCFTEyBntxGYG56asBCkPQ2ReBShVdbug4BvfDWe1oQXkkMCic7DCKZYtqfzoPtPKSJtMkAuKVTLcC2)). But xStock order-book depth "has not been tested at scale under forced-selling conditions" ([Spotted Crypto](https://www.spotedcrypto.com/bybit-xstocks-collateral-loans-2026/)). Jupiter's own risk assessment says its main concern is a Monday-open gap with no chance to liquidate in between ([Jupiter Lend](https://static-r2.jup.ag/lend/risk-research/xstocks-risk-report.pdf)).

Designs worth borrowing:

- **Compound III's `absorb`:** the protocol takes over underwater positions and sells the collateral later ([Compound](https://docs.compound.xyz/liquidation/)).
- **Euler's Dutch-auction bonus and "cool-off period":** the cool-off blocks liquidation in the same block an account was last healthy. This defends against attacks that cherry-pick prices from pull-based oracles ([EVK](https://github.com/euler-xyz/euler-vault-kit/blob/master/docs/whitepaper.md)).
- **klend's auto-deleveraging grace period:** triggered by the market owner ([klend docs](https://www.mintlify.com/kamino-finance/klend/advanced/autodeleverage)).

Mercury also has advantages a permissionless protocol lacks. It can push margin calls to borrowers before liquidation. It can schedule pauses around earnings. And it might run a backstop liquidator that exits off-chain, if it has access to Backed or Kraken redemption rails; that access needs confirming.

Existing venues give a starting ladder of parameters:

| Collateral          | Kamino max LTV | Jupiter Lend LTV / liquidation threshold / penalty / borrow cap |
| ------------------- | -------------- | --------------------------------------------------------------- |
| SPYx                | 0.73           | 75% / 85% / 5% / $10M                                           |
| QQQx                | 0.70           | 75% / 85% / 5% / $10M                                           |
| NVDAx               | 0.55           | 65% / 75% / 7% / $10M                                           |
| TSLAx               | 0.55           | 65% / 75% / 7% / $10M                                           |
| MSTRx, HOODx, CRCLx | 0.30           | Not listed                                                      |

Kamino figures come from its live API ([Kamino API](https://api.kamino.finance/kamino-market/5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua/reserves/metrics?env=mainnet-beta)). Jupiter's come from its risk report. Jupiter also pauses its NVDAx and TSLAx markets from two days before to one day after earnings. It cuts caps if RFQ sell-side depth falls below $30M, and it cites NVDA's ~17% single-session drop in January 2025 ([Jupiter Lend](https://static-r2.jup.ag/lend/risk-research/xstocks-risk-report.pdf)). Launching with only SPYx and QQQx limits exposure to oracle, liquidity and corporate-action problems.

Oracle handling should change by market session. Chainlink is Kamino's official xStocks price provider, and its 24/5 US equities streams publish separate regular, extended and overnight feeds, plus a `marketStatus` field that integrators must "always" use ([Chainlink](https://docs.chain.link/data-streams/rwa-streams/24-5-us-equities-user-guide)). Chainlink's guide also notes:

- Status 5 covers weekends and holidays.
- The overnight feed comes from a single provider.
- Trading halts are not flagged.
- Prices typically jump 1–2% at session transitions, and can jump 10–20%.
- Integrators should avoid liquidations based on closed-market data.

Pyth recommends valuing collateral at price minus confidence and pausing when confidence widens ([Pyth](https://docs.pyth.network/price-feeds/best-practices)). Off-hours, Kamino accepts only prices within a band around the last close ([Kamino forum](https://gov.kamino.finance/t/kamino-is-integrating-xstocks-powered-by-the-chainlink-data-standard-to-enable-tokenized-equities-lending/792)). Its Scope aggregator cross-checks Chainlink against Pyth ([Kamino docs](https://kamino.com/docs/risk/asset-risk/oracle-pricing)).

The trap specific to xStocks is the dividend multiplier. Each xStock is a Token-2022 mint with a Scaled UI Amount multiplier. The multiplier changes for dividends and splits, while raw balances never move ([Solana](https://solana.com/docs/tokens/extensions/scaled-ui-amount)). Collateral value must therefore be computed from three inputs: the raw amount, the on-chain multiplier at the moment of valuation, and the per-share price. The exact convention needs confirming with Backed and Chainlink. Getting it wrong either liquidates healthy users or creates bad debt.

Licensing narrows the fork-or-build choice more than engineering does.

| Codebase                      | License (Oct 2026)                                                                                                                                                   | Can Mercury use it in production?                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Kamino klend                  | BUSL 1.1; converts to GPL-2.0-or-later on 2027-11-17, or four years after a version's release ([klend](https://github.com/Kamino-Finance/klend/blob/master/LICENSE)) | Not until it converts                                         |
| Kamino kvault and Scope       | BUSL 1.1 until 2029-05-20 and 2028-11-25 ([kvault](https://github.com/Kamino-Finance/kvault/blob/master/LICENSE))                                                    | No                                                            |
| Fluid (Jupiter Lend's base)   | BUSL 1.1, "educational purposes only" ([Fluid](https://github.com/Instadapp/fluid-contracts-public/blob/main/LICENSE))                                               | No; Jupiter Lend's program source is not public               |
| Euler Vault Kit               | BUSL 1.1 until 2029-04-24 ([EVK](https://github.com/euler-xyz/euler-vault-kit/blob/master/LICENSE))                                                                  | No                                                            |
| Aave v4                       | Custom license, test environments only ([Aave v4](https://github.com/aave/aave-v4/blob/main/LICENSE))                                                                | No                                                            |
| marginfi v2, Solend, Drift v2 | Apache-2.0 ([marginfi-v2](https://github.com/mrgnlabs/marginfi-v2); [Solend](https://github.com/solendprotocol/solana-program-library))                              | Yes                                                           |
| Morpho Blue and Vaults V2     | GPL-2.0-or-later and MIT ([Morpho Blue](https://github.com/morpho-org/morpho-blue))                                                                                  | Yes, as an EVM reference; porting the code needs legal review |

That leaves four real options:

1. **Fork marginfi v2.** It is Solana-native, actively maintained, and has a mature risk engine. But it is a cross-margin pool with more attack surface than Mercury needs.
2. **Fork Solend.** Simpler, but older, with weaker oracle handling.
3. **Build a minimal Morpho-style Anchor program.** This gives the smallest audit surface and is the easiest to freeze later. But all of it is new code.
4. **Curate a Mercury market or kVault on Kamino**, as Sentora does for Kraken's xStocks vaults ([Genfinity](https://genfinity.io/2026/09/14/kraken-xstocks-vaults-kamino-veda-sentora-tokenized-stock-yield/)). Kamino becomes infrastructure rather than a counterparty.

Mercury's needs are narrow enough that a minimal isolated program is the best end state, with a curated Kamino market as the bridge. klend's GPL conversion in November 2027 reopens the option of forking battle-tested Solana code for later stages. New code is not free, though. Loopscale was exploited two weeks after launch through its own collateral pricing ([The Block](https://www.theblock.co/post/352083/solana-defi-protocol-loopscale-hit-with-5-8-million-exploit-two-weeks-after-launch)).

## One signature can withdraw from yield and spend

Atomic withdraw-and-spend does not need a smart account. Every Mercury spend is already a user-signed transaction whose fees the relayer pays: a Jupiter-routed stock buy, a send, a loan repayment. A single Solana transaction can carry instructions for several programs. So the app can put a lending refresh and an exact-amount withdrawal in front of the swap, and the user still signs once.

The limits that bind are:

- 1.4M compute units per transaction ([Solana](https://solana.com/docs/core/fees/compute-budget))
- a 1,232-byte transaction size. The new v1 format raises this to 4,096 bytes but "does not support address lookup tables" ([Solana upgrades](https://solana.com/upgrades/larger-transaction-sizes))
- 64 loaded accounts
- a CPI (cross-program call) depth of 4, rising to 8 under SIMD-0268, which is still in development ([Solana](https://solana.com/fi/upgrades/cpi-nesting-depth))

Mercury should build these as top-level instructions in a v0 transaction with lookup tables, rather than having a Mercury program call into Jupiter. The chain Mercury → Jupiter → AMM → Token already hits the depth limit. When a route does not fit, a Jito bundle of up to five transactions runs all-or-nothing ([QuickNode](https://www.quicknode.com/guides/solana-development/transactions/jito-bundles)). No source measured the bytes or compute a withdraw-plus-swap actually uses, so Mercury should benchmark this first.

Owning the withdraw path also protects Mercury from a counterparty changing its mind. On November 27, 2025, Jupiter Lend launched a one-click tool that moved Kamino positions in one atomic transaction. On December 2, Kamino "updated its smart contracts to block Jupiter's program" ([Blockworks](https://blockworks.co/news/jup-lend-vs-kamino)). A spend-from-yield path built on someone else's protocol works only as long as that protocol allows it. An in-house vault puts the withdraw instruction under Mercury's control. The vault's own calls into external venues stay exposed, which is one more reason to cap them.

The deposit side is harder than the spend side. Many inflows can be swept "at the edges": stock-sale proceeds and loan payouts come from user-signed transactions, so the app can add a deposit instruction to them. Only outside inflows, such as on-ramps and P2P receipts, need either the user's next interaction or a delegated signer. There are two ways to get one.

**Privy signers with policies.** Privy says signers can act "within the scope of certain permissions" and never see the private key ([Privy](https://docs.privy.io/wallets/using-wallets/signers/overview)). Its Solana policies work like this ([Privy policies](https://docs.privy.io/controls/policies/overview)):

- They can restrict the program ID and the instruction name, decoded from an Anchor IDL.
- DENY rules take precedence, and "every instruction must evaluate to an ALLOW action for the transaction to be allowed."
- Enforcement happens off-chain, inside Privy's enclave.
- The docs do not say whether a policy can pin a custom-program instruction's destination account to the user's own position. If it cannot, a "deposit-only" signer could be pointed at a different vault. This must be verified before Mercury relies on it.

**On-chain smart accounts.** Swig roles can bind a key to a specific program, target account and field offsets, with token limits and expiring sessions ([Swig](https://build.onswig.com/protocol/concepts-and-permissions)). Squads' Smart Account Program enforces policies and spending limits in the same operation that executes the transaction, and is audited by OtterSec and Certora ([Squads](https://github.com/Squads-Protocol/smart-account-program)). The cost: users' cash must move from the Privy wallet into a smart-account address. There is also no first-party Privy-plus-Swig integration guide.

The cleanest "cash that earns" is a share-price token, where the balance itself is the yield position. Mercury cannot change USDC, because Circle controls the mint. The Token-2022 options for a Mercury-issued token each have limits:

- **InterestBearing** is "solely cosmetic" ([Neodyme](https://neodyme.io/de/blog/token-2022)).
- **ScaledUiAmount** can make a rising share price display as a steady $1-style balance, but users must trust Mercury's update authority ([Solana](https://solana.com/docs/tokens/extensions/scaled-ui-amount)).
- **Transfer hooks** cannot sweep funds, because they see the sender and owner only as read-only, non-signing accounts ([Solana](https://solana.com/developers/guides/token-extensions/transfer-hook)).
- **A permanent delegate** gives one key "unrestricted, permanent transfer and burn rights" over every holder's tokens ([Chainstack](https://chainstack.com/solana-token-2022-utility-extensions/)). That would gut the custody claim. FinCEN's 2019 guidance turns on "total independent control": a co-signer that "cannot unilaterally access or move" funds is not a money transmitter ([Covington](https://www.cov.com/-/media/files/corporate/publications/2019/10/fincen_issues_guidance_to_synthesize_regulatory_framework_for_virtual_currency.pdf)).

There is a related trade-off in how the token looks. Presenting the share token as a steady "$1 Mercury dollar" through ScaledUiAmount helps UX. But it pulls the product toward the deposit-equivalence language the CLARITY compromise targets. Showing it as a variable-value vault position is the more defensible framing.

That gives three custody options:

1. **The user's own Privy wallet holds the vault share token.** Simplest, and custody never moves.
2. **A Swig or Squads smart account.** On-chain enforcement of what the delegate can do, at the cost of an address migration.
3. **A per-user vault owned by a Mercury program.** This could enforce invariants such as "withdrawn USDC only goes to this swap". But it adds upgrade-authority risk and uses up CPI depth. A cheaper middle ground is a thin instruction that only checks balances before and after.

Mercury should start with option 1 plus a tightly scoped Privy delegate. It should move to option 2 when automatic sweeping of outside inflows becomes important.

Consumer precedents point the same way:

- **Plasma One** runs on Privy wallets and a Veda vault that lends into Aave. It advertises that "there is no separate savings account to move funds into or out of" ([Privy](https://privy.io/blog/building-a-stablecoin-native-neobank-from-the-ground-up-with-plasma-one); [Veda](https://www.veda.tech/blog/plasma-one-app-stablecoins-veda-vault)). An August 2026 snapshot showed about 3.2% base APY ([Portals](https://explorer.portals.fi/yield/plasma:0xd1074e0ae85610ddba0147e29ebe0d8e5873a000.md)), well below its launch pitch of over 10% ([Decrypt](https://decrypt.co/340659/plasma-to-launch-stablecoin-native-neobank-after-this-months-mainnet-beta)).
- **Jupiter's Earn on Recurring** (July 11, 2026) sends idle USDC in DCA orders to Jupiter Lend and withdraws it at each fill ([Solana Compass](https://solanacompass.com/news/jupiters-earn-on-recurring-puts-idle-usdc-in-dca-orders-to-work)).
- **ether.fi Cash** has a "Borrow Mode" that lets users spend by borrowing against assets that keep earning ([Bleap](https://www.bleap.finance/en-us/blog/etherfi-crypto-card-review-pros-cons-alternatives)). This matters most for Mercury: a "spend against your stocks" mode creates in-house borrow demand, the closed loop's binding constraint.
- **Infini** is the warning. Its earn vault lost about $49.5M through admin privileges left on the contract ([The Block](https://www.theblock.co/post/342911/stablecoin-neobank-infini-exploited-for-49-million-security-analysts)).

Consent should follow the brokerage standard. SEC Rule 15c3-3(j) requires disclosure, notice and affirmative consent for cash sweeps ([Morgan Lewis](https://www.morganlewis.com/pubs/im_lf_secissuesrelieffinancialresponsibilityrulereqs_28feb14)). In January 2025 the SEC settled $60M of cases against Wells Fargo and Merrill over advisory sweep programs that "only offered one option" ([SEC](https://www.sec.gov/newsroom/press-releases/2025-16)). Privy's own Earn docs say users "should explicitly direct the deposit action" ([Privy Earn](https://docs.privy.io/wallets/actions/earn/overview)). The defensible default is explicit opt-in, or a pre-checked onboarding step with a plain-language disclosure that:

- names the venues
- shows a variable rate
- says withdrawals can slow at high utilization, as Coinbase does with its "when liquidity is available" wording ([The Block](https://www.theblock.co/post/371281/coinbase-usdc-onchain-lending))
- avoids the words "interest" and "savings account"

## Admin keys and xStock prices sink lenders as often as code bugs

Drift's loss shows that self-custodial keys do not protect deposits once they sit in a program whose admin can reconfigure it instantly. On April 1, 2026, Drift lost about **$285.3M** ([BlockSec](https://blocksec.com/blog/drift-protocol-incident-multisig-governance-compromise-via-durable-nonce-exploitation)).

The setup took months:

- From fall 2025, attackers posed as a quant firm and met contributors in person.
- One contributor cloned a repo whose VS Code task ran automatically when the folder opened. Another installed a TestFlight "beta wallet".
- Before a council migration, admin actions carried 24–72 hour delays. The new 2-of-5 Security Council had zero timelock ([Range](https://range.org/blog/inside-the-drift-exploit-how-to-protect-your-protocol-and-multisigs-against-dprk-threat-actors)).
- Two signers were induced to pre-sign durable-nonce transactions. These are transactions that stay valid until used.

The drain itself took minutes. Two of those transactions landed four slots apart and transferred admin control. The attacker then:

- listed a fake collateral token, CVT, that it had wash-traded to build a price history
- pointed CVT at an oracle it controlled
- raised withdrawal limits 20x
- withdrew funds 31 times in about 12 minutes

Recovery claims opened six months later, with a first payout of about 1% of losses ([The Block](https://www.theblock.co/news/ecosystems/2026-10-02-drift-opens-exploit-recovery-claims-initial-payouts-just-over-1-user-losses-417581)).

Users keeping their keys did not save them, and Mercury's protocol would make Mercury the admin in that position. The leading Solana lenders show how much the setup varies:

| Protocol               | Squads multisig threshold                                                                                                            | Timelock |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Kamino (klend, kvault) | 5 of 10 ([Solscan](https://solscan.io/account/6hhBGCtmg7tPWUSgp3LG6X2rsmYWAc4tNsA6G4CnfQbM))                                         | 24 hours |
| Jupiter Lend           | 4 of 6 ([Solscan](https://solscan.io/account/J3mJ3wz6xkVUk3T8qHnuAYNxsRH3ixHsryYNZAU2vG8P))                                          | 12 hours |
| marginfi               | 7 of 15 ([Solscan](https://solscan.io/account/7FCPipJWVbPbdHymVt1gJYwKciakkJz5GahdQySemvHk))                                         | None     |
| Drift, at exploit      | 2 of 5 ([BlockSec](https://blocksec.com/blog/drift-protocol-incident-multisig-governance-compromise-via-durable-nonce-exploitation)) | None     |

Solana's failure pattern has shifted over time. In 2022, losses mostly came from programs trusting accounts the caller supplied:

- Wormhole minted about $320M of unbacked wETH because it never checked that a "sysvar" account was the real one ([Wormhole](https://wormholecrypto.medium.com/wormhole-incident-report-02-02-22-ad9b8f21eec6)).
- Cashio lost about $52M through a collateral chain that was validated only against itself ([CertiK](https://www.certik.com/blog/cashio-app-incident-analysis)).

Anchor's typed accounts have made those bugs rarer. Since 2025, losses have come from three other places:

- **Collateral pricing.** Loopscale lost about $5.8M weeks after launch ([Blockworks](https://blockworks.co/news/loopscale-loss-oracle-attack)).
- **New instructions breaking invariants.** marginfi's `transfer_to_new_account` put more than $160M at risk before its bug bounty caught it ([Asymmetric Research](https://blog.asymmetric.re/threat-contained-marginfi-flash-loan-vulnerability/)).
- **Governance**, as at Drift.

DefiTuna's $580K loss in July 2026 came from an unpublished lending-logic flaw. That is a reminder that audits cover one specific commit ([SigintZero](https://sigintzero.com/blog/defituna-580k-lending-exploit)). Mango's roughly $114M loss came from pushing a thinly traded token's oracle price up about 2,300% ([Solidus Labs](https://www.soliduslabs.com/post/mango-hack)). The attacker's conviction was later vacated, so legal recourse is no backstop ([TRM Labs](https://www.trmlabs.com/resources/blog/breaking-federal-judge-overturns-all-criminal-convictions-in-mango-markets-case-against-avraham-eisenberg)). For xStocks, the rule follows directly: never derive collateral value from on-chain xStock trades.

EVM incidents add two lessons about accounting.

**Never price shares from a balance anyone can top up.**

- Cream lost about $130M when tokens transferred directly into a vault inflated the share price it used as collateral value ([Immunefi](https://immunefi.com/blog/bug-fix-reviews/hack-analysis-cream-finance-oct-2021/)).
- Sonne lost about $20M to the same trick on an empty market, after anyone was able to execute its timelocked transactions ([Sonne](https://medium.com/@SonneFinance/post-mortem-sonne-finance-exploit-12f3daa82b06)).
- ResupplyFi's solvency check passed with a zero exchange rate ([Ackee](https://ackee.xyz/blog/resupply-hack-analysis/)).

On Solana the equivalent mistake is reading a vault's token-account balance directly, because anyone can send tokens to a PDA-owned account.

**Every new instruction can break solvency.** Euler lost about $197M through a `donateToReserves` function that skipped the health check and sat on-chain for eight months after an audited change ([Swivel](https://swivel.substack.com/p/post-mortem-euler-liquidation-vulnerability)). Every Mercury instruction that changes debt or collateral should end with a health check. Flash loans should wait until after launch.

Off-chain keys are a third front. Radiant lost about $50M after malware made three signers blind-sign an ownership transfer that their Safe interface displayed as legitimate ([Radiant](https://medium.com/@RadiantCapital/radiant-post-mortem-fecd6cd38081)). Resolv lost about $25M when an attacker took a cloud-held signing key and used it to mint 80M USR, because the contract had no mint cap ([CertiK](https://certik.com/blog/resolv-protocol-incident-analysis)). The rule for Mercury: its fee-paying relayer, and any keeper, oracle-pusher or rebalancer key, should have no protocol privilege beyond its narrow job. Each should be bounded on-chain per transaction and per epoch.

xStocks bring risks a USDC-only pool does not have. If an xStock mint carries a permanent delegate or freeze authority, the issuer could burn or freeze collateral inside Mercury's market while the debt remains ([Neodyme](https://neodyme.io/en/blog/token-2022)). The research did not check which Token-2022 extensions the xStock mints actually carry. Mercury should read them on-chain, allowlist them, and fail closed if they change. Holders have a contractual claim on a Jersey SPV, not direct share ownership. The custodian is Alpaca, and Lloyd's coverage is up to $175M in aggregate ([Jupiter Lend](https://static-r2.jup.ag/lend/risk-research/xstocks-risk-report.pdf)).

Curator risk is the class the closed loop avoids by design:

- Stream Finance's off-chain strategy lost $93M, with about $285M of lender exposure across curated vaults ([Decrypt](https://decrypt.co/347285/stream-finance-stablecoin-plunges-77-protocol-fund-manager-loses-93-million)).
- Vaults that priced xUSD with fixed or manually updated oracles never triggered liquidations ([Parsec](https://parsec.substack.com/p/parsec-weekly-138)).

A Mercury vault that lends only to its own over-collateralized borrowers avoids that class entirely. Any later "boost" adapter that routes into strategy vaults or synthetic dollars brings it back.

The practices that matter most combine code assurance with operational control.

**Before launch:**

- at least two independent audits on a frozen commit, plus a targeted review of the oracle and liquidation modules
- formal checks of solvency and share accounting
- invariant fuzzing with Trident ([QuickNode](https://www.quicknode.com/guides/solana-development/tooling/trident-fuzzing))
- verifiable builds
- a bug bounty live from day one

Kamino's 18 audits, four formal verifications and $1.5M Immunefi cap mark the high end ([Crypto Times](https://www.cryptotimes.io/2025/10/10/kamino-boosts-solana-defi-safety-with-fourth-verification/); [Immunefi](https://immunefi.com/bug-bounty/kamino/information/)).

**At and after launch:**

- **Guarded caps.** On-chain deposit caps and per-epoch outflow limits that only the timelock can raise. Drift's 20x limit increase shows that limits an admin can change instantly are worthless.
- **Upgrade authority.** A Squads multisig with a 48–72 hour timelock, as Radiant adopted, with separate roles for upgrades, risk parameters and new collateral listings.
- **A guardian.** It can pause or lower limits but never raise them, change oracles or move funds.
- **Signer hygiene.** Hardware keys on dedicated devices, independent decoding of every proposal, and alerts on any new durable-nonce account tied to a signer.
- **A loss waterfall.** A reserve funded by the take rate, then a Mercury first-loss tranche, then pro-rata losses for depositors. Aave's Umbrella, with a 100,000-unit first-loss offset per asset, is a working model ([Aave](https://aave.com/docs/aave-v3/umbrella)). Size it for gap-downs, not hacks: Sherlock's cover paid $3.3M against Euler's $197M ([CryptoDaily](https://cryptodaily.co.uk/2023/03/euler-finance-hack-postmortem-reveals-8-month-old-vulnerability)).

Retail users experience the app as the counterparty, whoever wrote the code. Gemini paused Earn withdrawals in November 2022 and paid a $37M NYDFS penalty ([Decrypt](https://decrypt.co/219610/gemini-return-1-billion-to-earn-customers-pay-37-million-fine-new-york)). It returned $2.18B only about 18 months after the pause ([NBC New York](https://nbcnewyork.com/news/business/money-report/crypto-exchange-gemini-returns-2-2-billion-to-users-after-pausing-withdrawals-18-months-ago/5457128)). Mercury should publish its loss rules before launch, warn users in-app when utilization is high, and pre-write its incident messages. DefiTuna's seven-hour disclosure gap is the pattern to avoid.

## Privacy and an own chain should follow scale

Private payments on Solana exist but are immature. Token-2022 Confidential Transfers were disabled on June 19, 2025, after a proof-forgery flaw. They were re-enabled around June 2026, after five audit efforts that included a $203,500 Code4rena contest ([DEV Community](https://dev.to/sulimanmukhtar/confidential-transfers-on-solana-whats-native-whats-helius-rings-and-whats-actually-on-mainnet-329p)). They hide amounts and balances but not who is transacting. They support an issuer auditor key, and they need three transactions per transfer ([Solana](https://solana.com/docs/tokens/extensions/confidential-transfer/transfer-tokens)). A mint must opt in when it is created. One September 2026 snapshot found only four proof-program transactions in about four days.

The third-party options are all early:

- **Umbra**, built on Arcium's multi-party computation, opened publicly on March 27, 2026. It shields sender, recipient and amount, with scoped viewing keys and Range sanctions screening ([Arcium](https://arcium.substack.com/p/umbra-is-now-open-to-the-public-powered)). It launched with $500 deposit caps ([The Block](https://www.theblock.co/post/387564/arcium-launches-privacy-preserving-mainnet-alpha-on-solana-as-umbra-debuts-shielded-finance-layer)).
- **Helius Rings** was in devnet beta in September 2026 ([DEV Community](https://dev.to/sulimanmukhtar/confidential-transfers-on-solana-whats-native-whats-helius-rings-and-whats-actually-on-mainnet-329p)).
- **MagicBlock's Private Ephemeral Rollups** run inside Intel TDX secure enclaves, with AML screening at entry ([MagicBlock](https://www.magicblock.xyz/blog/private-ephemeral-rollups)).

Demand for screened privacy looks modest. Privacy Pools held about $9.25M after 18 months on Ethereum ([L2BEAT](https://l2beat.com/privacy/projects/privacy-pools)). The legal signals are cautionary. Roman Storm's conviction for operating an unlicensed money-transmitting business still stands, with a retrial set for April 2027 ([Crypto Valley Journal](https://cryptovalleyjournal.com/focus/legal-and-compliance/tornado-cash-roman-storm-trial-delayed-to-april-2027/)). From July 1, 2027, the EU's AMLR bars service providers from holding anonymous accounts ([Cointelegraph](https://cointelegraph.com/news/eu-crypto-ban-anonymous-privacy-tokens-2027)).

The model that fits a KYC'd app is privacy from the public chain, not from Mercury or regulators. Mercury would hold the viewing or auditor keys and integrate an audited primitive rather than build its own. One decision cannot wait, however. If Mercury ever wants confidential transfers on its vault share token, that extension must be set when the mint is created. Its compatibility with other extensions, such as ScaledUiAmount, should be checked before the share mint launches.

An own chain is the furthest-off phase. The successful launches had large existing flows and nine-figure resources behind them:

- **Tempo:** raised $500M, then launched mainnet on March 18, 2026 with stablecoin gas and permissioned validators ([The Block](https://www.theblock.co/post/375152/stripe-tempo-500-million-series-a-thrive); [Ledger Insights](https://www.ledgerinsights.com/stripe-paradigm-launch-tempo-blockchain-alongside-machine-payments-standard/)).
- **Circle's Arc:** went live on September 16, 2026 with an institutional validator cohort ([Circle](https://www.circle.com/pressroom/circle-launches-arc-mainnet-an-economic-operating-system-for-the-internet)).
- **Robinhood Chain:** reached mainnet on July 1, 2026, about 12 months after Robinhood's first stock tokens, and still excludes US persons ([The Block](https://www.theblock.co/news/business/2026-07-01-robinhood-chain-goes-live-mainnet-alongside-24-7-tokenized-stocks-lighter-perps-planned-crypto-agentic-trading-406918)).

The failures share a pattern:

- **Plasma:** stablecoins fell from about $6.35B to $1.28B once rewards lost value ([DefiLlama](https://defillama.com/chain/plasma)).
- **Eclipse:** cut 65% of staff and pivoted to building its own app ([FinanceFeeds](https://financefeeds.com/eclipse-names-new-ceo-cuts-65-of-staff-in-shift-toward-consumer-apps/)).
- **Base:** even the top revenue earner netted only about $15M in Q4 2025 after costs ([Talos](https://www.talos.com/insights/state-of-the-network-350)).

Mercury's xStocks, USDC and lending liquidity all live on Solana, so its own chain would fragment that liquidity. Robinhood's example shows that a chain does not remove securities constraints. Infrastructure cost is not the obstacle: a managed rollup costs about $36K a year to run ([Conduit](https://conduit.xyz/blog/rollup-total-cost-of-operations-tco)). The real costs are liquidity, bridging and security operations. A MagicBlock-style ephemeral rollup that settles back to Solana is the lightweight version of an "own chain", and the only one that fits before Mercury has captive volume at scale.

## Four gated stages shrink external reliance to a liquidity buffer

| Stage                                | What Mercury builds                                                                                                                                                     | Yield source                             | What still depends on others                 | Gate to the next stage                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1. Spendable yield on external rails | Opt-in flow; users hold Jupiter Lend or Kamino receipt tokens in Privy wallets; withdraw-on-spend and sweep-at-the-edges transactions                                   | External lending                         | Yield, liquidity and composability           | Opt-in demand measured; transaction budgets benchmarked; legal memo on the yield product                   |
| 2. Mercury vault                     | Vault program with its own share mint, internal accounting, capped adapters, idle buffer and withdrawal queue; Squads timelock; deposit cap                             | External lending, allocated by Mercury   | The yield venues and their solvency          | Two audits on a frozen commit; bounty live; incident-free months as caps rise                              |
| 3. Closed-loop market                | Isolated USDC market for SPYx and QQQx; oracle state machine; backstop liquidator; reserve and first-loss tranche; migration path for Mercury's Kamino borrowers        | Mercury borrowers plus external lending  | Deposits that borrowers cannot absorb        | In-house utilization holding near target; liquidations tested through an earnings season and a weekend gap |
| 4. Expand and freeze                 | More collateral using Jupiter-style ladders; borrow-to-spend; caps raised by timelock; core market made immutable; optional T-bill or USDG buffer; privacy integrations | Increasingly in-house as borrowing grows | External venues as capped liquidity adapters | User scale and captive volume before any own-chain work                                                    |

**Why the vault comes before the market.** The vault is the simpler program: share accounting and allocation, with no oracles or liquidations. It creates the share token every later stage reuses. It takes Mercury's spend path out of reach of a counterparty's program restrictions. And its fee on external allocations earns about as much as an in-house protocol fee would. Stage 1 comes before even that because it needs no new Mercury program. It lets Mercury test the consent and spend UX, and whether demand is real, at minimal security cost.

**Why the market comes third.** It is the hard part: xStock oracles, closed-market behavior, the dividend multiplier and liquidation exits. Its size is set by borrower demand, so Mercury should build it only once it can move existing Kamino borrowers across. A Mercury-curated Kamino market is a sensible interim step to learn parameters on audited code. klend's GPL conversion in November 2027 widens the build options for Stage 3 or 4.

**Measuring progress.** The metric for "less reliance" is the share of vault assets in Mercury-controlled markets. Since closed-loop capacity is roughly in-house borrowing divided by target utilization, products that create borrowing are really yield products. Borrow-to-spend and good margin UX belong in that category.

**The end state keeps external venues.** Aave v4 itself sweeps idle Hub liquidity into external strategies through an opt-in module ([Aave v4](https://github.com/aave/aave-v4/blob/main/docs/overview.md)). Morpho V2 routes withdrawals through an external liquidity adapter ([vault-v2](https://github.com/morpho-org/vault-v2)). Mercury's mature design would do the same. External protocols shrink from yield source to capped liquidity sink, and the one Mercury program that holds collateral is frozen once it is stable.

## Conclusion

"In-house cash yield" is really an in-house credit business. Mercury's depositors cannot earn from Mercury's own protocol more than Mercury's borrowers pay into it. With today's xStock borrowing in the single-digit millions, the yield strategy is mainly a borrowing strategy. Borrow-to-spend, margin UX and moving borrowers off Kamino matter more to depositor returns than any vault feature. The closed loop also delivers about the same yield as external venues, not more. Mercury should therefore sell spendable, self-custodied cash rather than a top rate, and should justify the in-house market on control, resilience and product, not headline APY.

The second shift is in what "custody" means once Mercury runs the protocol. Users keeping their Privy keys is necessary, but Drift shows it is not sufficient. In practice, the guarantee that matters is that Mercury's own admin powers are timelocked, capped and split into roles. Security spending should weight governance, signer hygiene and xStock oracle logic at least as heavily as code audits. Several decisions are hard to reverse later and belong in Stage 2, while the vault is being designed:

- the share mint's Token-2022 extensions, including whether confidential transfers stay possible
- which programs will eventually be frozen
- the licensing path for the market code
- the published loss waterfall
