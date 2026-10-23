# Own the dollar, then build earn and borrow on it: mechanics, revenue, peg defenses, failure modes, and what transfers to tokenized-stock collateral (as of 21 Oct 2026)

Scope note: this file covers designs where the protocol issues its own dollar (CDP-minted, reserve-backed, synthetic, or hybrid) and builds savings and borrowing around it. Lending-pool designs (Morpho, Aave, Kamino, Jupiter Lend as pools), xStock oracle and liquidation risk in general, and closed-loop economics were covered in an earlier report and are only touched on where they bear on own-dollar designs. Figures are dated. Where only secondary sources exist, this is flagged.

---

## 1. Sky (MakerDAO): minting USDS/DAI against collateral, the Savings Rate, the PSM, Spark, and Solana

### Takeaway

Sky is now a hybrid. About $10B of USDS (June 2026) is backed by a mix of crypto vaults, a large USDC Peg Stability Module (about $4.1B of USDC), tokenized T-bill and credit allocations (more than $5.5B through "Sky Agents"), and Spark's lending and liquidity deployments. That book produced about $419M of annualized gross revenue, about 4.2% of supply. The Savings Rate (3.60% to 3.80% in Sep/Oct 2026) is set by governance below that gross yield. It is the largest expense line, and what is left goes to a $150M solvency reserve that is still being rebuilt and to SKY buybacks. On Solana, USDS exists via Wormhole NTT (since Nov 2024), but sUSDS and the Spark Liquidity Layer do not appear to be live there. Sky's Solana-focused Star (Keel) said in Feb 2026 that native integration was harder than expected and widened its mandate to EVM.

### Cited Findings

**Savings Rate (SSR) and sUSDS**

- SSR reportedly rose to 3.80% on 7 Oct 2026, up from 3.60%. Only one outlet reports this. — [Coinfomania](https://coinfomania.com/sky-savings-rate-rises-to-3-80-enhancing-susds-capital/)
- Sky's savings dashboard showed $4.47B in sUSDS at 3.60% on 27 Sep 2026. — [Upshift](https://www.upshift.finance/blog/what-is-usds)
- Daily snapshots from mid-Sep 2026 show about 4.39B USDS supplied in sUSDS at 3.60%. — [Aavescan](https://aavescan.com/rates/sky-susds)
- Secondary sources citing DefiLlama put the SSR at 8.75% in Feb 2025 and 4.75% in Sep 2025, and at about 3.6% since mid-2026. The SSR is set by governance and moves in discrete steps. Other secondary figures conflict (3.75% in May 2026, 3.00% in early June 2026). — [Eco deep dive](https://eco.com/support/en/articles/15254003-sky-savings-rate-deep-dive-2026-ssr-susds-usds-mechanics); [Earnpark](https://earnpark.com/en/posts/susds-review-2026-what-the-sky-savings-rate-actually-pays/); conflicting: [DataWallet](https://www.datawallet.com/crypto/usds-explained)
- sUSDS has no lock-up and no withdrawal queue. — [Upshift](https://www.upshift.finance/blog/what-is-usds)
- sUSDS accrued $17.49M of yield in June 2026. Cumulative payouts were more than $250M through sUSDS since inception, plus $190M through the legacy DSR (as of 29 Jun 2026). — [Sky Frontier Foundation June 2026 update](https://insights.skyeco.com/insights/sky-ecosystem-june-financial-operational-update)
- On 6 Mar 2026, Sky Frontier Foundation announced that developers building with Privy (Stripe) can offer sUSDS, then "yielding 4% APY", to an ecosystem it described as 2,000+ apps and 110M wallets. Developer economics (fees or rev-share) were not found. — [Morningstar/PR Newswire](https://www.morningstar.com/news/pr-newswire/20260306to03146/sky-savings-rate-now-available-to-all-developers-building-on-privy-a-stripe-company); [AI Journal](https://aijourn.com/?p=500013)

**Supply, revenue, reserves (June 2026 update, Sky Frontier Foundation; it says it is not official protocol documentation; Q2 figures unaudited)**

- USDS supply was $10.04B at end-June 2026, down from $11.14B in May and up 96.9% year on year. — [Sky June 2026 update](https://insights.skyeco.com/insights/sky-ecosystem-june-financial-operational-update)
- Gross Protocol Revenue ran at $419.08M annualized (last three settlement cycles). Q1 2026 was $123.79M and Q2 2026 $107.35M, for $231.66M in H1. Full-year 2025 was $338M. — [Sky June 2026 update](https://insights.skyeco.com/insights/sky-ecosystem-june-financial-operational-update); [Bitget news](https://www.bitget.com/news/detail/12560605500162)
- Q2 2026 Net Protocol Revenue was $40.09M, a 37.3% net margin. Total expense base was $21.2M in June 2026, "primarily Savings Rate obligations". — [Sky June 2026 update](https://insights.skyeco.com/insights/sky-ecosystem-june-financial-operational-update)
- Sky Reserves (the old Surplus Buffer) stood at $82.5M at end-June 2026, 55% of a $150M target, with $33.7M accumulated since March 2026. A March 2026 vote redirected surplus from buybacks toward building this reserve, and governance raised the target to $150M in May 2026. — [Sky June 2026 update](https://insights.skyeco.com/insights/sky-ecosystem-june-financial-operational-update); [DefiLlama Sky revenue dashboard](https://defillama.com/pro/sky-revenue-streams-ohie4i)
- Buybacks have totalled more than $120M since the Feb 2025 launch. In the trailing 30 days, 18.6M SKY were bought for 1.14M USDS. — [Sky June 2026 update](https://insights.skyeco.com/insights/sky-ecosystem-june-financial-operational-update)
- Total Protocol Collateral was $12.32B at Q2 2026 quarter-end. Sky Agents had deployed more than $5.5B, including Janus Henderson $1.24B, BlackRock BUIDL $713M, Anchorage $260M, PayPal $236M, Securitize $102M and Galaxy $27M. Grove TVL was $2.66B+. — [Sky June 2026 update](https://insights.skyeco.com/insights/sky-ecosystem-june-financial-operational-update)

**Revenue composition (older, Oct 2024, Block Analitica)**

- Estimated annual stability fees were $300.51M: Spark $101.27M, Cash RWA $75.16M, Core vaults $74.16M, Stablecoins $45.69M, Legacy RWA $4.23M. Liquidation fees were only $3.9M a year, deliberately low to encourage self-management. PSM fees were about $47K a year, since the PSM fee is "typically 0%". — [Block Analitica](https://blockanalitica.substack.com/p/exploring-the-sky-ecosystem-skys-3bd)
- At that time savings cost about $122.16M a year (DSR 5.5%, SSR 6.5%). Savings utilization was 38.02% of DAI+USDS supply. Workforce cost was $60.66M on a trailing-12-month basis. — [Block Analitica](https://blockanalitica.substack.com/p/exploring-the-sky-ecosystem-skys-3bd)

**Vaults, stability fees, debt ceilings, liquidations**

- Stability fees are set per vault type by executive vote. In Mar 2025, ETH-A went from 7.75% to 6.00% and WBTC-A from 12.75% to 11.00%. In Dec 2024, ETH-A had been 12.75%. No 2026 per-vault fee figures were found. — [Sky executive vote, 20 Mar 2025](https://vote.makerdao.com/executive/template-executive-vote-eth-and-wsteth-oracle-migration-rate-changes-smart-burn-engine-parameter-update-bug-bounty-payout-aligned-delegate-compensation-atlas-core-development-payments-integration-boost-top-up-spark-proxy-spell-march-20-2025)
- Liquidations 2.0 (MIP45, 2021; now superseded by MIP102c2-SP1) replaced English auctions "where bids start low" with Dutch auctions. Each auction starts at the OSM price plus `buf` and decays on a pluggable curve. It settles instantly with no bid lock-up, and the whole lot is available at one price. Flash lending of collateral lets keepers buy with no upfront capital. An auction is reset (`redo`) after `tail` seconds or when the price falls below `cusp`. Keeper incentives are a flat `tip` plus `chip` (a % of debt). Global `Hole` and per-ilk `hole` caps limit DAI in active auctions, so liquidations are partial when a cap binds. A four-stage circuit breaker can be tripped via `ClipperMom` without the governance delay. — [MIP45](https://mips-ipfs.makerdao.com/MIP45/mip45.md)

**Peg Stability Module**

- The LitePSM swaps DAI/USDS and USDC at fixed ratios. In June 2026, BA Labs proposed doubling the LITE-PSM-USDC-A pre-minted buffer and DC-IAM gap from 400M to 800M, with USDC reserves reported at about 4.13B. — [cryptonews.net](https://cryptonews.net/news/defi/33005573/); [finanzen.ch](https://script.finanzen.ch/nachrichten/aktien/sky-governance-proposal-seeks-to-double-usdc-psm-buffer-to-$800-million-15743156)
- In Dec 2024, about $756M of PSM USDC was reported to be managed through an externally owned account, which critics flagged as a custody risk. — [Cointelegraph](https://cointelegraph.com/news/sky-lite-psm-eoa-security-usdc-reserves)

**Spark (SparkLend, Spark Savings, Spark Liquidity Layer)**

- The Spark Liquidity Layer (SLL) mints, bridges and deploys USDS, sUSDS and USDC to DeFi and RWA venues. It bridges USDS/sUSDS over SkyLink and USDC over Circle CCTP, and can deploy only what Sky governance approves. — [Spark docs](https://docs.spark.fi/user-guides/spark-liquidity-layer); [Messari](https://messari.io/report/understanding-spark-a-comprehensive-overview)
- At its Nov 2024 launch, Solana was listed as a "future expansion" chain. No live SLL deployment on Solana was found. — [Crypto Reporter press release](https://www.crypto-reporter.com/press-releases/spark-enables-sky-stablecoins-usds-and-susds-to-go-multichain-natively-82675/)
- End-May 2026 figures: Spark Savings TVL $6.4B, SparkLend $3.6B, SLL deployments $2.6B. These come from secondary reports. — [Pluang](https://pluang.com/en/news-feed/spark-tutup-mei-dengan-tvl-savings-6-4-miliar-dan-sparklend-3-6-miliar)
- Spark Q2 2026 revenue reportedly fell 5.8% QoQ ($6.97M to $6.57M) as Liquidity Layer net yields compressed, offset by growth in distribution rewards. These figures look small relative to Spark's size, so they are likely a net or Spark-retained measure; not verified. — [Blockworks Spark Q2 2026 holder report](https://blockworks.com/api/investor-report/spark-token-holder-report-q2-2026/pdf)
- In June 2026, Spark seeded $150M into a Uniswap v4 stablecoin FX layer and coordinated capital behind Robinhood's USDG Earn. — [Sky June 2026 update](https://insights.skyeco.com/insights/sky-ecosystem-june-financial-operational-update)

**Sky on Solana**

- USDS launched on Solana in Nov 2024 via Wormhole NTT, which issues no wrapped token. Kamino incentives at launch were 200K USDS a week for USDC/USDS LPs and 100K USDS a week for USDS suppliers. SkyLink support for sUSDS was deferred pending governance. — [Wormhole](https://wormhole.com/blog/sky-formerly-maker-expands-usds-to-solana-with-wormhole-ntt); [crypto.news](https://crypto.news/skys-usds-goes-multichain-with-solana-launch/); [DeFi Planet](https://defi-planet.com/2024/11/sky-launches-usds-stablecoin-on-solana-offers-500k-in-rewards-to-early-adopters/)
- Keel launched on 29 Sep 2025 as Sky's Solana-focused "Star", with a roadmap to deploy up to $2.5B of USDS reserves into Solana DeFi and RWAs. It opened a $500M "Tokenization Regatta" for Solana RWAs on 16 Dec 2025. — [CoinDesk](https://www.coindesk.com/business/2025/09/29/keel-debuts-as-sky-s-solana-focused-star-with-a-usd2-5b-roadmap-to-boost-rwas-and-defi); [Chainwire](https://chainwire.org/2025/12/16/keel-opens-the-tokenization-regatta-injecting-500m-into-real-world-assets-on-solana/)
- On 23 Feb 2026, Keel said that integrating Sky's allocation system natively with Solana's execution environment "has proven more demanding than initially anticipated". It expanded to multichain (EVM) deployment, while USDS liquidity and integrations on Solana (Kamino, Jupiter, Raydium, Drift, Save) continue. It disclosed no deployed amount. — [Keel Substack](https://keelfi.substack.com/p/keel-in-2026-expanding-the-mandate)

### Inferences

- Implied spread: $419M gross on about $10B USDS is about 4.2% gross yield on liabilities. The SSR paid to roughly $4.4B of sUSDS (44% of supply) is 3.6 to 3.8%, which costs about $160M to $170M a year. The roughly 56% of USDS not in savings costs Sky nothing, and that is where most of the margin comes from. A savings rate is therefore cheapest when savings utilization is low, and a Mercury design where every user dollar sits in "earn" would remove this free float.
- Sky's three revenue engines map onto Mercury options. (a) Reserve yield from T-bills or tokenized funds held by the PSM or Sky Agents maps to a reserve-backed Mercury dollar. (b) Stability fees on vaults map to a CDP against xStocks. (c) Spread on deploying the dollar into other lending venues (SparkLend, SLL) maps to Mercury lending its own dollar via Kamino or Jupiter Lend pools.
- Liquidations 2.0's design choices respond directly to Black Thursday (see section 6). Dutch auctions with instant settlement and flash-loanable lots, per-ilk `hole` caps, and an instant circuit breaker are the minimum template for any CDP liquidation engine. For equities, the circuit breaker and `hole` caps matter most around market opens.
- Keel's statement is the most direct evidence that Sky's EVM allocation machinery (ALM/allocation system) does not port to Solana easily. A Mercury-branded dollar on Solana should not assume Sky or Spark infrastructure will deploy liquidity natively there in the near term.

### Gaps

- Current (2026) per-vault stability fees, debt ceilings, Lockstake parameters and liquidation penalties were not found. info.sky.money or the latest executive spells would have them.
- No 2026 breakdown of Sky revenue by source (RWA vs vault fees vs Spark vs PSM) was found. The Block Analitica breakdown is from Oct 2024.
- Whether sUSDS is bridged to Solana via SkyLink as of Oct 2026 was not confirmed, and no source shows it live.
- Privy-integrated sUSDS is EVM-based per the available coverage. Solana support and app rev-share terms are unknown.

---

## 2. Ethena, Frax, Liquity v2, crvUSD, Aave GHO: how each mints and how each funds savings

### Takeaway

There are four distinct models. (1) Synthetic or reserve: Ethena's USDe earns basis, funding, lending and RWA yield, which passes to sUSDe. Its reserve fund now receives 0% of ongoing revenue. Ethena also sells a white-label "stablecoin-as-a-service", which is how Jupiter got JupUSD. (2) Custodian-reserve: frxUSD is minted 1:1 by governance-capped "enshrined custodians" holding BUIDL, USTB or WTGXX, and sfrxUSD rotates among T-bills, carry and DeFi strategies. (3) Pure CDP with savings funded by borrower interest: Liquity v2 sends 75% of user-set interest to Stability Pool depositors, who also take liquidation collateral. crvUSD sends a share of LLAMMA interest to scrvUSD. (4) Hybrid CDP plus PSM: GHO is minted by facilitators with separate bucket caps, including Aave borrowing and a GSM swapping USDC/USDT. sGHO's fixed 4.50% rate is funded by CDP interest plus backing yield plus GSM fees. In all CDPs the peg is defended by borrow-rate policy plus a hard arbitrage path, either redemptions (Liquity) or PSM/PegKeepers (GHO, crvUSD).

### Cited Findings

**Ethena (USDe, sUSDe, USDtb, white-label)**

- Ethena lists four revenue sources: funding and basis spread from delta-neutral trades (crypto and increasingly non-crypto, such as tokenized commodities), lending revenue from overcollateralized stablecoin loans, RWA yield from short-duration government debt and liquid credit, and liquid-stablecoin rewards. Negative-revenue periods are designed to be borne by the Reserve Fund. — [Ethena docs: Protocol Revenue](https://docs.ethena.fi/backing-assets/protocol-revenue.md)
- The Reserve Fund was built from revenue in high-revenue periods. The governance-set share of ongoing revenue sent to it is currently 0%, with 100% going to incentive rewards, promotional distributions and distribution incentives. The fund absorbs negative revenue and backing shortfalls. — [Ethena docs: Reserve Fund](https://docs.ethena.fi/protocol-overview/reserve-fund.md)
- On 12 Oct 2026, backing was $4.83B against $4.76B of USDe supply (101.43%). The reserve fund was $62.57M, about 1.3% of supply. On 28 Sep 2026, sUSDe paid about 4.76% APY (30-day average 4.79%), and about 25% of USDe was staked as sUSDe. These are secondary reports of Foundation data. — [ad-hoc-news](https://www.ad-hoc-news.de/boerse/news/marktberichte/usde-supply-closes-at-4-94-billion-usd-what-it-means-for-the-ethena-usde-price/70358853); [Baltex review, Oct 2026](https://baltex.io/blog/ecosystem/ethena-review); [Ethena governance update Jan/Feb 2026](https://gov.ethenafoundation.com/t/ethena-s-january-and-february-2026-governance-update/753)
- USDe market cap was about $14.7B on 9 Oct 2025 and about $6.4B two months later, with about $8.3B of net outflows (10x Research). About $2B was redeemed in 24 hours after 10 Oct 2025, and the founder said minting and redemption "functioned normally". — [Cointelegraph via TradingView](https://www.tradingview.com/news/cointelegraph:4bc2a9faa094b:0-ethena-s-usde-loses-8-3b-since-october-crash-amid-loss-of-confidence/)
- Ethena White-label: the partner handles product design and distribution, and Ethena handles issuance, backing, custody and reserve management. Partner coins can be backed by USDe or USDtb, with USDtb issued by Anchorage Digital Bank under GENIUS and backed by fiat and BlackRock BUIDL. Launched partners: jupUSD and MegaETH USDm (USDtb+USDC), and suiUSDe (USDe+USDC). The revenue split is undisclosed, including for ether.fi's planned coin. — [Ethena docs: White-label](https://docs.ethena.fi/overview/ethena-whitelabel); [Crypto Briefing](https://cryptobriefing.com/ether-fi-ethena-branded-stablecoin/)

**Frax (frxUSD, sfrxUSD)**

- frxUSD is minted and redeemed through governance-approved "enshrined custodians". Each mints 1 frxUSD per $1 of provable reserves and has a custodian cap. BUIDL was approved as a backing token: KYC'd BUIDL holders send BUIDL to a custodian contract and receive frxUSD. Redemption is on demand for any custodian asset, but a specific asset is not guaranteed. — [The Block](https://www.theblock.co/post/332947/blackrocks-buidl-token-approved-as-backing-token-for-frax-usd-stablecoin); [Aave governance frxUSD ARFC](https://governance.aave.com/t/arfc-onboard-frxusd-to-aave-v3-core-instance-on-ethereum/23513/9)
- Collateralization was 102.38% in Dec 2025. A 19 Aug 2026 snapshot showed reserves of WTGXX about $67.1M, USTB about $27.7M and BUIDL about $15.8M, and noted that no independent attestation is published. DefiLlama shows on-chain market cap of about $130M, which is lower than expected and unverified. — [Aave governance](https://governance.aave.com/t/arfc-onboard-frxusd-to-aave-v3-core-instance-on-ethereum/23513/9); [DIA](https://www.diadata.org/map/global-stablecoins/stablecoin/frxusd/); [DefiLlama](https://defillama.com/rwa/asset/frxUSD)
- sfrxUSD is a non-rebasing ERC-4626 vault. Its "Benchmark Yield Strategy" rotates among carry trades, DeFi AMOs and short-dated T-bill/IORB exposure. It paid about 4.09% APY on Ethereum in Aug 2026, with a 1-year net return of 4.8%, no lock-up and no fees. — [Portals](https://explorer.portals.fi/yield/ethereum:0xcf62f905562626cfcdd2261162a51fd02fc9c5b6.md); [Trading Strategy](https://tradingstrategy.ai/vaults/staked-frax-usd)

**Liquity v2 (BOLD)**

- BOLD is backed only by WETH, wstETH and rETH, and its contracts are immutable. Each borrow market sends 75% of its interest to its Stability Pool (SP), paid in BOLD. SP depositors also absorb liquidations, buying collateral at about a 5% discount. Separately, Protocol Incentivized Liquidity (PIL) rewards DEX liquidity. SP yield can exceed the average borrow rate when less than 75% of BOLD is deposited. — [Liquity docs](https://docs.liquity.org/v2-faq/bold-and-earn)
- Borrowers set their own rate, from a 0.5% minimum. Redemptions hit the lowest-rate troves first, which pushes borrowers to raise rates when BOLD trades below $1. Above $1, borrowers lower rates. Sources disagree on the maximum rate. — [Portals blog](https://blog.portals.fi/what-is-liquity-v2-the-bold-stablecoin-and-user-set-interest-rates-explained/); [Liquity docs](https://docs.liquity.org/v2-faq/bold-and-earn)

**crvUSD (LLAMMA, PegKeepers, scrvUSD)**

- LLAMMA spreads collateral across price bands and converts it gradually to crvUSD as price falls, and back as it recovers ("soft liquidation"). This replaces a single liquidation threshold. scrvUSD is a Yearn V3 vault that earns a share of borrower interest. — [Curve docs overview](https://docs.curve.finance/crvUSD/overview); [Spark glossary](https://www.spark.money/glossary/crvusd-stablecoin)
- PegKeepers mint crvUSD into stable pools when it trades above $1 and withdraw it when below. The borrow-rate formula falls as PegKeeper debt rises as a share of total debt (DebtFraction), and rises when price is below peg. A 2024 proposal sought to raise the USDC and USDT PegKeeper ceilings from 25M to 50M each. — [Curve PegKeepers docs](https://docs.curve.finance/crvUSD/pegkeepers/overview); [Curve monetary policy](https://docs.curve.finance/developer/crvusd/monetary-policy/); [Curve governance](https://gov.curve.finance/t/increase-usdc-and-usdt-pegkeeper-debt-ceiling-to-50m-crvusd-each/10546)
- A third party shows a 30-day average yield of about 1.7% across crvUSD vaults including scrvUSD, which is low relative to T-bills. — [Trading Strategy](https://tradingstrategy.ai/vaults/stablecoins/crvusd)

**Aave GHO (facilitators, GSM, sGHO)**

- GHO is minted by governance-approved facilitators, each with its own `bucketCapacity`. These are the Aave v3 market (borrowers mint against collateral, limited by the cap rather than supplier liquidity), FlashMinter, and GSMs. GSMs swap GHO 1:1 with USDC/USDT, each with fee strategies paid to the treasury, an exposure cap, an oracle-based auto-freezer and a last-resort liquidation path. — [Aave GHO docs](https://aave.com/docs/primitives/gho)
- GHO Stewards (since Apr 2024, a 3-of-4 multisig of ACI, Chaos Labs, TokenLogic and karpatkey) can move the borrow rate by up to 500 bps per two days, capped at 25% APR, if the 30-day price leaves $0.995 to $1.005. They can also adjust caps and GSM parameters within bounds. — [Aave GHO docs](https://aave.com/docs/primitives/gho)
- Aug 2026 Steward update: GHO issuance was about 69% debt and 31% GSM-swapped stablecoins. The Ethereum Core borrow rate went from 3.75% to 4.25% and the Aave Savings Rate (sGHO) from 4.25% to 4.50%, on 158.6M GHO in sGHO, adding about $397K a year of cost. The stated rule is that savings cost must sit below CDP interest plus backing yield plus GSM fees. The USDT GSM fell from 53.2M to 40.8M in two weeks and the USDC GSM was "effectively empty". GSM mint is free and redeem costs 10 bps. GHO traded at $0.9997, and the discount peaked at 26 bps. DAO GHO revenue went from about $2.2M to $3.0M a year. Rationale: GHO was the cheapest stablecoin to borrow on Aave, so minted GHO got sold, which drained the GSM. — [Aave governance, 27 Aug 2026](https://governance.aave.com/t/gho-stewards-august-2026-gho-borrow-rate-and-aave-savings-rate-update/25534)
- Aave announced the 4.50% ASR with "no lockup period, fund rehypothecation, or fees". sGHO was upgraded in May 2026 to a fixed-rate design (4.25% then). — [Aave on X](https://x.com/aave/status/2094808316316655968); [The Crypto Times](https://www.cryptotimes.io/2026/05/19/aave-upgrades-savings-gho-to-sgho-with-fixed-4-25-yield/)
- A secondary review says stkGHO (Umbrella) covers GHO-market bad debt with a 20-day cooldown, while sGHO is instant-withdraw. — [Stablecoin Insider](https://stablecoininsider.org/sgho-review/)

### Inferences

- Funding a savings rate takes one of three sources: reserve yield (Ethena, Frax, Sky PSM/RWA), borrower interest (Liquity, crvUSD, GHO Aave facilitator), or trading/basis spread (Ethena, sfrxUSD carry). Only the first is close to "risk-free" and it caps the sustainable rate at about T-bill yield minus costs. The second requires a borrow rate above the savings rate and a ratio of borrowers to savers large enough to cover it.
- GHO's Aug 2026 episode is the key cautionary pattern for a CDP dollar. If the minted dollar is cheaper to borrow than USDC, borrowers mint and sell it, the PSM drains, and the issuer must raise rates to market. A Mercury CDP dollar's stability fee cannot be a subsidy below Kamino/Jupiter USDC borrow rates unless the PSM is very deep.
- Liquity's model (SP depositors earn interest plus liquidation collateral) transfers poorly to equities. SP depositors would receive xStocks at a discount, which requires them to accept equity exposure. Keepers would have to sell during off-hours with thin liquidity.
- Facilitator "buckets" with separate ceilings (GHO) are the cleanest precedent for one dollar with several issuance channels under hard, independently adjustable caps.

### Gaps

- Exact scrvUSD share of crvUSD interest (fee splitter) and current crvUSD supply were not found.
- BOLD supply, Stability Pool yields in 2026, and Liquity v2's maximum rate were not verified.
- No source gave how Ethena splits JupUSD/USDtb reserve income between Ethena and white-label partners.
- f(x) Protocol (fxUSD) was not researched in this pass.

---

## 3. Solana-native precedents: JupUSD/JUICED/Jupiter Lend, Hylo, Solayer sUSD, Perena USD*, Reflect USDC+, USDS on Solana, Hubble USDH, UXD, and what happened to Solana CDP stablecoins

### Takeaway

The closest Solana analog to "Mercury owns a dollar" is JupUSD (Jan 2026), an Ethena white-label, reserve-backed dollar (about 90% USDtb, 10% USDC). Savings run through JUICED, a Jupiter Lend Earn vault that combines borrow interest with reserve T-bill yield. Borrowing is pool-based: JupUSD is lent from depositors, not minted against collateral. It shows the limits of an ecosystem-owned dollar. Supply was only 45.1M by end-Q3 2026 (from 51.5M), the planned $500M JLP conversion did not happen, and the leveraged JUICED loop was wound down with a $24.3M reserve drawdown. Solana's CDP stablecoins (Hubble USDH, Parrot PAI, Ratio USDr) and UXD all shrank to irrelevance or shut down between 2022 and 2024. Causes were small scale, fee-only revenue with no yield to pay holders, thin USDC exit liquidity, Mango-exploit contagion, key compromise, and team exits. Surviving Solana "own-dollar" designs are yield wrappers on USDC/T-bills (Solayer sUSD, Reflect USDC+, Perena USD*) or leveraged-split designs (Hylo). Hylo's hyUSD held its peg through a 69% SOL drawdown, but its junior token lost about 99% via 28x dilution.

### Cited Findings

**JupUSD, JUICED, Jupiter Lend**

- JupUSD launched on 5 Jan 2026 as an Ethena white-label coin, with Ethena running day-to-day reserve operations. It is backed initially about 90% USDtb (BUIDL-backed) and 10% USDC, held at Anchorage. Onboarded institutions and market makers mint 24/7 against USDC. Redemption is available "when the on-chain USDC buffer is sufficient". About $500M of USDC in the Jupiter Perps LP was to be swapped into JupUSD. — [The Block](https://www.theblock.co/news/markets/2026-01-05-jupiter-rolls-out-native-jupusd-stablecoin-backed-90-by-blackrock-and-ethenas-usdtb-384366); conflicting figure ($750M) in [CryptoNewsZ](https://www.cryptonewsz.com/jupiter-exchange-regulated-jupusd-stablecoin/)
- JupUSD itself does not yield. JUICED is the Jupiter Lend Earn vault share for JupUSD, and its exchange rate rises monotonically. Yield comes from (1) borrow interest on JupUSD lent in Jupiter Lend and (2) T-bill yield from reserves backing minted JupUSD, distributed through Jupiter's rewards distributor. Reserve yield is spread over all JUICED supply, so if JUICED supply exceeds minted JupUSD, per-unit yield falls. An "Automated Debt Ceiling" raises the withdrawal allowance each block. The pass-through percentage is not stated. — [Jupiter developer docs: JUICED](https://developers.jup.ag/docs/jupusd/juiced); [Jupiter docs](https://docs.jup.ag/user-docs/earn/jupusd)
- JUICED yield was about 4.5% APY passively in Mar 2026, with "JUICED loops" advertised at 12 to 15%. Jupiter retired the JUICED Loop leveraged strategy in late Sep 2026, with a fee magnifier for positions left open. — [Coinpedia](https://coinpedia.org/price-analysis/jup-price-jumps-8-as-juiced-launch-sparks-fresh-momentum/); [Solana Compass](https://solanacompass.com/news/jupiter-to-sunset-juiced-loop-in-late-september-fee-magnifier-awaits-open-positions)
- Q3 2026: JupUSD circulation was 45.1M at quarter-end, down 12% from 51.5M. The JLP pool held $18.7M JupUSD against $127M USDC, so the $500M conversion "has not happened". The JupUSD reserve in Lend shrank from $71.6M to $55.0M. The JUICED reserve lost $24.3M as the leveraged product was wound down. Jupiter Lend deposits were $2.30B and loans $931M at 30 Sep. Lend's 10% cut of interest was $1.08M, half of it reportedly to Fluid. — [Pine Analytics Q3 2026](https://pineanalytics.substack.com/p/jupiter-quarterly-report-q3-2026)

**Hylo (hyUSD / xSOL)**

- hyUSD is a senior $1 claim and xSOL a levered junior claim (about 3x, no liquidation, no funding) on one staked-SOL pool. Staking yield (about 7 to 8%) pays for it. V1 defended the peg by converting Stability Pool hyUSD into new xSOL. From Oct 2025 to Jun 2026, SOL fell about 69% and xSOL about 99%, while hyUSD held its peg. xSOL supply rose about 28x (8.4M to 235M), about 43% of it from Stability Pool conversions. V2 (separate SOL/BTC pools plus a USDC reserve, an Earn Pool issuing eHYUSD, healthy CR band of about 136 to 167%, dynamic fees) removes the conversion channel. In V2's worst case, Earn Pool depositors bear losses via hyUSD burns. — [DefiLlama Research, 30 Jul 2026](https://defillama.com/research/spotlight/hylo-xsol-no-liquidation-no-funding-but-what-are-the-real-costs); [Solana Compass on eHYUSD (13 Jul 2026)](https://solanacompass.com/news/hylo-launches-ehyusd-a-delta-neutral-stablecoin-that-earns-yield-from-every-leveraged-token)

**Yield-wrapper dollars on Solana**

- Solayer sUSD is T-bill-backed and rebasing, on Solana, Base and Solayer Chain. The issuer site advertises "9.5% yield backed by U.S. Treasury Bills". That is well above T-bill rates, so it is presumably incentive-boosted, but unverified. 2025 coverage cited about 4 to 5%. — [Solayer](https://solayer.org/product/susd); [Crypto Briefing](https://cryptobriefing.com/solana-stablecoin-launch-susd/)
- Perena USD* is an appreciating LP token of a "Seed Pool" of USDC, USDT and PYUSD, with additional yield positions. One secondary review cites about 15% APY, unverified. — [Coinmonks/Medium](https://medium.com/coinmonks/i-tested-solanas-decentralized-stablecoins-hyusd-vs-usde-vs-usd-vs-susd-9c107879731a); [Zerion](https://zerion.io/blog/solana-stablecoins-the-complete-guide/)
- Reflect USDC+: depositing USDC mints USDC+, which is deployed across Solana money markets (sources variously list Kamino, Jupiter Lend, Drift and MarginFi) and backed by an on-chain insurance liquidity pool. There is no lock-up and no redemption fee. Reflect raised $3.75M in 2025. A Blockworks "risk framework" piece was commissioned by Reflect. — [Blockworks](https://blockworks.co/news/reflect-stablecoin-infra-raise); [Blockworks Insights (sponsored)](https://blockworks.com/insights/reflect-solana-lending-risk-framework)

**Historical Solana CDP and synthetic dollars**

- Hubble (USDH) let users mint USDH against SOL, BTC and ETH at a 150%+ collateral ratio, with a one-time 0.5% mint fee paid to HBB stakers. It was the leading crypto-backed Solana stablecoin in late 2022. The same team built Kamino, originally as an LP optimizer whose LP tokens could back USDH loans. By Aug 2024, USDH was worth $2.7M against a $3.8B Solana stablecoin market. — [CoinMarketCap](https://coinmarketcap.com/fi/currencies/hubble-protocol/); [Step Data](https://stepdata.substack.com/p/step-data-insights-solana-stablecoins); [The Block 2022](https://www.theblock.co/news/markets/2022-09-08-hubble-protocol-raises-5-million-in-a-strategic-round-led-by-multicoin-capital-168543); [DL News](https://www.dlnews.com/articles/defi/solana-stablecoin-uxd-protocol-with-75m-usd-tvl-shuts-down/)
- UXD (a delta-neutral perps-hedged dollar, later shifted toward USDC/T-bills) lost $19.9M in the Oct 2022 Mango Markets exploit, which it later recovered. In Aug 2024 its DAO voted on a sunset, citing lack of liquidity and no product-market fit: the model is "not exciting enough for DeFi users and does not offer enough advantage over centralised stablecoins". It had $7.5M of deposits. The wind-down could take up to two years because of illiquid insurance-fund assets, with two engineers retained and $7.5M of UXP burned. — [DL News](https://www.dlnews.com/articles/defi/solana-stablecoin-uxd-protocol-with-75m-usd-tvl-shuts-down/); [The Block](https://www.theblock.co/news/markets/2024-08-19-solana-based-uxd-protocols-dao-is-voting-on-whether-to-sunset-its-stablecoin-311950); [Binance Square (UXD pivot to USDC/T-bills)](https://www.binance.com/en/square/post/1242098)
- Parrot (PAI, a vault-minted CDP): the team "rage-quit" with about $47.5M, leaving investors to share about $27M in the reserve pool. — [DL News (UXD article)](https://www.dlnews.com/articles/defi/solana-stablecoin-uxd-protocol-with-75m-usd-tvl-shuts-down/); [DL News (Parrot)](https://dlnews.com/articles/defi/parrot-protocol-team-rage-quits-and-wait-for-big-payday/)
- Ratio Finance (USDr) is listed as deprecated with $0 TVL. A hack on 3 Dec 2022 is attributed to a compromised private key. — [DefiLlama](https://defillama.com/protocol/ratio-finance)
- A non-Solana parallel: Hyperliquid's branded USDH (Native Markets, launched Sep 2025) stalled at about $100M supply and is being sunset in favor of USDC, with about $10M of Hyper Foundation migration grants. — [KuCoin News](https://www.kucoin.com/news/flash/hyper-foundation-allocates-10m-to-support-usdh-stablecoin-exit)

### Inferences

- Pattern across Solana's dead dollars: none offered holders yield competitive with USDC-in-Kamino. Revenue was a one-time mint fee (Hubble) or thin basis (UXD), and exits to USDC were shallow. Once a dollar has no reason to be held beyond borrowing, supply equals CDP debt, and debt shrinks with leverage demand.
- JupUSD and Hyperliquid USDH show that even a dominant venue cannot easily force adoption of its own dollar: LP and market-maker inventory stayed in USDC. For Mercury, the value of owning the dollar comes mainly from capturing reserve float on balances already held in-app (closed loop), not from external DeFi adoption. External liquidity should be treated as a bonus.
- JUICED's design (one vault that blends pool borrow interest with reserve T-bill yield) is directly copyable for a "Mercury Earn". The noted dilution risk (yield spread over all vault shares) means the savings rate falls if the earn vault is larger than the minted float.
- Hylo shows that a "no liquidation" CDP moves losses rather than removing them. For tokenized stocks, the analogous loss bearer would be either Mercury's reserve or earn depositors.

### Gaps

- No formal Hubble USDH sunset notice was found. Status after 2024 is unclear (Hubble/Kamino channels would confirm).
- Parrot rage-quit vote outcome and date were not confirmed.
- JupUSD revenue split between Jupiter, Ethena and holders, JupUSD mint/redeem fees, and JUICED pass-through % were not disclosed.
- Current Reflect USDC+, Perena USD* and Solayer sUSD TVL and real (ex-incentive) yields were not verified.

---

## 4. Minting a dollar against tokenized stocks: who does it, parameters, off-hours and corporate actions, CDP vs pool, and how a reserve dollar and a CDP module can coexist

### Takeaway

As of Oct 2026, almost all tokenized-stock credit is pool lending of USDC, not minting. Examples are Kamino and Jupiter Lend xStocks markets, Aave V4's Equities Hub on Base (25 Sep 2026; 7 Coinbase stocks, USDC-only, collateral factors 65 to 79%, about $21M borrow cap), and Venus bStocks. Only two cases of a dollar minted against stocks were found. Falcon Finance accepts xStocks to mint USDf (Oct 2025), a synthetic dollar that briefly depegged in Jul 2025 over collateral-quality concerns. Frankencoin (ZCHF, a franc) holds about $4.2M of Ondo SPYon in oracle-free CDP positions. Aave has said GHO will become borrowable against Coinbase stocks. That would be the first major "protocol-owned dollar minted against equities" via a pool-like facilitator, but it is not live. The established off-hours technique is a 24/5 oracle that holds the last price on weekends (Aave), or a price band around the last close (Kamino). Corporate actions pause the reserve until the multiplier updates. Usage is tiny: only about 2.6% of tokenized stock supply is used in lending, against 24x more in perps open interest.

### Cited Findings

**Live tokenized-stock credit markets**

- Aave V4 Equities Hub (Base, 25 Sep 2026) accepts AAPLc, AMZNc, GOOGLc, METAc, MSFTc, NVDAc and TSLAc (Coinbase Onchain SPV; shares at Alpaca) as collateral for USDC only. It is for non-US users (Reg S). Equity-for-equity loans and borrowing the equity tokens are disabled. Launch caps were about $29M collateral, $32M USDC supply and $21M USDC borrow, with collateral factors of 65 to 79% (LlamaRisk). GHO is planned as a future borrowable asset. — [Aave blog](https://aave.com/blog/coinbase-tokenized-stocks); [The Block](https://www.theblock.co/news/defi/2026-09-25-aave-v4-on-base-adds-coinbase-tokenized-stocks-as-collateral-for-usdc-loans-416372)
- Aave's off-hours and corporate-action handling: Chainlink 24/5 feeds publish Sunday 20:00 ET to Friday 20:00 ET. On weekends and holidays the feed holds the last price, so "health factors can decline only through interest accrual". On a split, the reserve pauses until the new token multiplier is applied. Dividends are reinvested into more shares per token. — [Aave blog](https://aave.com/blog/coinbase-tokenized-stocks)
- Kamino's xStocks market accepts off-hours Chainlink prices only within a band around the last market close. Kraken's xStocks Vaults (14 Sep 2026) deposit SPYx, QQQx and NVDAx on Kamino, borrow stablecoins and redeploy them, at about 2% est. APY. — [RedStone, Sep 2026](https://www.redstone.finance/research/tokenized-stocks-2026)
- Kamino xStocks max LTVs were reported at 35 to 50% in 2025 (SPYx/QQQx highest). A third party lists liquidation LTVs of 40 to 75%, and Kamino's STRCx market (May 2026) uses 67% max LTV and 80% liquidation. These figures conflict and are secondary. — [Lendly](https://lendly.finance/); [The Crypto Times](https://www.cryptotimes.io/2026/05/28/kamino-brings-strategys-bitcoin-linked-strcx-to-defi/); [OnchainTimes](https://www.onchaintimes.com/stocks-arriving-on-chain/)
- Venus listed bStocks (TSLAB, NVDAB, SPCXB) with collateral factors of 60%, 60% and 50%, and borrowing paused at launch. — [CryptoRank](https://cryptorank.io/news/feed/e0a55-tokenized-stocks-defi-collateral-venus)
- Aave Horizon (Aug 2025) is a permissioned Aave v3.3 instance. Allowlisted users post tokenized T-bill and credit funds (USTB, USCC, JAAA, JTRSY, USYC) and borrow from permissionless USDC, RLUSD and GHO pools. It uses Chainlink NAVLink and LlamaRisk as risk manager. It shows GHO already being lent (not minted by a dedicated facilitator) against RWAs. — [Aave Horizon launch](https://aave.com/blog/horizon-launch); [Aave Horizon docs](https://aave.com/docs/aave-v3/horizon); [Sentora](https://sentora.com/research/articles/aave-horizon-launch-bridging-the-28b-rwa-to-defi-gap)

**Minting a dollar against stocks**

- In Oct 2025, Falcon Finance began accepting xStocks (TSLAx, NVDAx, MSTRx, SPYx, CRCLx) as collateral to mint USDf, plus an SPYx vault with about 3% APR rewards. Chainlink tracks prices and corporate actions. Falcon's framework sets ratios on volatility and drawdowns, liquidity of the stock and the wrapper, and the oracle-versus-trading-hours mismatch. Large caps sit in a "mid-range" category. No per-stock haircut is published. — [HackerNoon/press](https://hackernoon.com/falcon-finance-and-backed-pioneer-onchain-yield-from-tokenized-stocks); [DefiLlama interview with Falcon's CRO](https://defillama.com/research/interview/falcon-finance-chief-rwa-officer-unlocking-liquidity-tokenised-stocks)
- USDf fell to $0.9783 on 8 Jul 2025. On-chain liquidity was about $5.51M, critics alleged illiquid altcoin reserves (MOVE), and LlamaRisk flagged unilateral team control of reserves and missing disclosures. The issuer claimed 116% overcollateralization. — [Cointelegraph](https://cointelegraph.com/news/falcon-usd-stablecoin-depegs-liquidity-collateral-concerns)
- Frankencoin (ZCHF CDP) holds about $4.2M of SPYon, Ondo's largest lending use (Sep 2026). — [RedStone](https://www.redstone.finance/research/tokenized-stocks-2026)
- Frankencoin needs no oracle. Anyone can propose a position, subject to a veto period, or clone an accepted one. Anyone can "challenge" an undercollateralized position, which starts a two-phase auction. Liquidations take days rather than minutes. Fees and liquidation proceeds flow to the equity reserve. — [Frankencoin docs](https://docs.frankencoin.com/positions); [Frankencoin docs overview](https://docs.frankencoin.com/)
- Historical stock CDPs: Mirror (Terra) minted mAssets against UST at 150% minimum and died with Terra in 2022. Synthetix used a 500% target ratio and retired stock synths in 2021. — [RedStone](https://www.redstone.finance/research/tokenized-stocks-2026); [Coin Bureau](https://coinbureau.com/review/mirror-protocol-mir)

**Market structure, off-hours and corporate-action risk**

- About 42% of tokenized stock supply is DeFi-collateral-eligible, but only about 2.6% is used in lending. On 28 Sep 2026: xStocks on Kamino and Jupiter Lend $43.8M, Superstate shares in Kamino's "Opening Bell" $25.4M, bStocks on Lista $7.7M. Across SPYx, NVDAx and TSLAx, lending holds about $24.5M against about $577M of trade.xyz perp OI. — [RedStone](https://www.redstone.finance/research/tokenized-stocks-2026)
- US equities trade about 32.5 of 168 weekly hours. xStocks mint and redeem only on US business days, while Ondo has offered 24/7 mint/redeem on six tickers since 25 Jun 2026. A pre-IPO perp oracle misread a 5-for-1 split as a 45% crash and liquidated about 400 traders. RWA redemption windows run from days to months, and DEX depth is too thin for forced sales. — [RedStone](https://www.redstone.finance/research/tokenized-stocks-2026)
- xStocks are tracker certificates issued by Backed Assets (JE) Ltd. Holders get economic exposure, not shareholder rights. Primary minting has a $100K minimum. — [Allium](https://www.allium.so/blog/xstocks-tokenized-stocks-you-dont-legally-own/)

**Hybrid coexistence precedents (reserve-backed dollar plus CDP module)**

- GHO: one token, several facilitators, each with its own `bucketCapacity`. The CDP (Aave borrowing), the GSM (USDC/USDT 1:1, with exposure cap and freezer) and FlashMinter coexist. In Aug 2026 the mix was about 69% debt and 31% GSM. — [Aave GHO docs](https://aave.com/docs/primitives/gho); [Aave governance Aug 2026](https://governance.aave.com/t/gho-stewards-august-2026-gho-borrow-rate-and-aave-savings-rate-update/25534)
- Sky: per-ilk debt ceilings (and `hole` liquidation caps) for vaults sit alongside a LitePSM with about 4.13B USDC and a buffer and DC-IAM gap (400M, proposed 800M), plus RWA allocations. — [MIP45](https://mips-ipfs.makerdao.com/MIP45/mip45.md); [cryptonews.net](https://cryptonews.net/news/defi/33005573/)
- crvUSD: CDP minting via LLAMMA alongside PegKeepers with separate per-pool debt ceilings (25M to 50M proposed). — [Curve governance](https://gov.curve.finance/t/increase-usdc-and-usdt-pegkeeper-debt-ceiling-to-50m-crvusd-each/10546)
- frxUSD: separate custodian caps per reserve asset. — [Aave governance frxUSD](https://governance.aave.com/t/arfc-onboard-frxusd-to-aave-v3-core-instance-on-ethereum/23513/9)

### Inferences

- **CDP vs pool for xStock collateral (Mercury framing).**
  - _In favor of a CDP:_ capacity is set by a debt ceiling rather than depositor supply. The stability fee is a policy lever. Interest accrues to the issuer, or to its savers via a savings rate. And for closed-loop users, minted dollars that stay in-app never need USDC.
  - _Against a CDP:_ (a) minted dollars that users want as USDC must exit through a PSM. GHO's Aug 2026 GSM drain shows the PSM must be sized to the CDP book and the fee kept at or above market USDC borrow rates. (b) Bad debt from a gap on a Monday open hits the dollar's own backing (the Sky Reserves analog), not third-party lenders. (c) Liquidators must buy xStocks with the Mercury dollar during US hours.
  - _Pool alternative:_ lending a reserve-backed Mercury dollar from depositors puts losses on depositors and caps capacity by deposits. This is JupUSD's model in Jupiter Lend.
  - _Evidence:_ every major venue (Aave, Kamino, Venus) chose pools of USDC for equities, and the only CDP precedents (Falcon, Frankencoin) are small or have had peg stress. Together these suggest a cautious design: reserve-backed dollar first, with an xStock CDP facilitator under a small, separate bucket cap.
- Off-hours handling precedents compose into a rule set:
  - hold the last close on weekends and holidays (Aave);
  - accept off-hours prices only inside a band (Kamino);
  - pause the market on corporate actions until the multiplier updates (Aave);
  - use conservative collateral factors (35 to 79% across venues);
  - use `hole`-style caps on simultaneous liquidations around the Monday open (Sky).
- The Token-2022 dividend multiplier on xStocks means the oracle must price the per-token claim (share price × multiplier). The Ventuals split error shows what happens when a corporate action is misread.
- A PSM-hybrid could also take tokenized T-bill reserves (USDtb, BUIDL, USTB) on the reserve side, as JupUSD and frxUSD do. That keeps a fiat-reserve "core" whose yield funds savings, with the xStock CDP adding fee income under its own ceiling.

### Gaps

- No Sky/Spark/Grove vault that mints USDS against tokenized equities was found, and no Ondo-, Backed-, Kraken- or Robinhood-run CDP minting a dollar against stocks.
- Falcon's xStock haircuts and current USDf collateral share in xStocks were not found. A "111.1% backing ratio (31 Jul 2026)" figure appeared only in a search summary and was not verified.
- Frankencoin SPYon position parameters (liquidation price, limit, fee) were not retrieved.
- Kamino's exact price-band width and current xStocks LTVs were not verified from primary sources (on-chain reserve config needed).
- The reported SEC "Innovation Exemption" (17 Sep 2026) appeared only in a low-quality GitHub source and was not used.

---

## 5. Economics: revenue splits between savers, protocol and reserves; savings rate vs T-bills and borrow rates; revenue at given supplies

### Takeaway

Savings rates in Sep/Oct 2026 cluster at 3.6 to 4.8%: SSR 3.60 to 3.80%, sfrxUSD about 4.1%, sGHO 4.50%, sUSDe about 4.8%, JUICED about 4.5% (Mar 2026). That is roughly at or slightly below short T-bills (about 3.85% mid-2026, with policy rates reported at 3.75 to 4.00% after a reported Sep 2026 hike). It is below or equal to own-dollar borrow rates (GHO Core 4.25 to 4.50%; Aave USDC slope targets 4.00 to 4.50%). Protocols keep margin through float (non-saving holders earn 0%), borrow-rate spread, and PSM or redemption fees. Sky ran a 37% net margin in Q2 2026, about $40M a quarter on about $10B. GHO's DAO revenue is only about $3M a year after paying about $7M a year to sGHO. Ethena now sends 0% to its reserve fund. Reserves are thin relative to supply: Sky $82.5M on about $10B (0.8%), Ethena $62.6M on $4.76B (1.3%).

### Cited Findings

- Sky: about $419M annualized gross revenue on about $10.04B USDS (June 2026); Q2 net margin 37.3%; Sky Reserves $82.5M against a $150M target; surplus redirected from buybacks to reserves from Mar 2026. — [Sky June 2026 update](https://insights.skyeco.com/insights/sky-ecosystem-june-financial-operational-update); [DefiLlama dashboard](https://defillama.com/pro/sky-revenue-streams-ohie4i)
- Sky in Oct 2024: savings cost about $122M against about $300M in stability fees, with 38% savings utilization. — [Block Analitica](https://blockanalitica.substack.com/p/exploring-the-sky-ecosystem-skys-3bd)
- GHO, Aug 2026: sGHO 158.6M at 4.50%. The +25 bps ASR change costs $397K a year, while the rate changes add $871K of market revenue. DAO GHO revenue is about $3.0M a year. GSM redemption fees run about $0.8M annualized. Rule: savings cost must be below CDP interest plus backing yield plus GSM fees. — [Aave governance](https://governance.aave.com/t/gho-stewards-august-2026-gho-borrow-rate-and-aave-savings-rate-update/25534)
- Liquity v2: 75% of borrower interest goes to the Stability Pool, and the remainder funds incentivized DEX liquidity (PIL) as directed by governance. — [Liquity docs](https://docs.liquity.org/v2-faq/bold-and-earn)
- Ethena: 0% of ongoing revenue to the reserve fund, with 100% to rewards and distribution incentives. The reserve fund was $62.57M on 12 Oct 2026. — [Ethena docs: Reserve Fund](https://docs.ethena.fi/protocol-overview/reserve-fund.md); [ad-hoc-news](https://www.ad-hoc-news.de/boerse/news/marktberichte/usde-supply-closes-at-4-94-billion-usd-what-it-means-for-the-ethena-usde-price/70358853)
- Jupiter Lend takes 10% of interest ($1.08M in Q3 2026 on about $931M of loans), with about half going to Fluid. — [Pine Analytics](https://pineanalytics.substack.com/p/jupiter-quarterly-report-q3-2026)
- Rate context:
  - A mid-2026 secondary source put the 3-month T-bill at about 3.85%, the effective fed funds rate at 3.63% and IORB at 3.65%. — [Audible podcast description](https://www.audible.co.jp/pd/B0H9R9WBN8) (weak source)
  - The FOMC range was 3.50 to 3.75% through Jul 2026. Several sources report a 25 bp hike to 3.75 to 4.00% on 16 Sep 2026, but sources conflict. — [Advisor Perspectives](https://www.advisorperspectives.com/dshort/updates/2026/06/17/feds-interest-rate-decision-june-17-2026); [Crypto Briefing](https://cryptobriefing.com/fomc-meeting-expected-to-result-in-first-rate-hike-since-2023-bloomberg/)
- Savings rates:
  - SSR 3.60% (27 Sep 2026), reportedly 3.80% from 7 Oct 2026. — [Upshift](https://www.upshift.finance/blog/what-is-usds); [Coinfomania](https://coinfomania.com/sky-savings-rate-rises-to-3-80-enhancing-susds-capital/)
  - sGHO 4.50% APR. — [Aave on X](https://x.com/aave/status/2094808316316655968)
  - sUSDe about 4.76% (28 Sep 2026). — [ad-hoc-news](https://www.ad-hoc-news.de/boerse/news/marktberichte/usde-supply-closes-at-4-94-billion-usd-what-it-means-for-the-ethena-usde-price/70358853)
  - sfrxUSD about 4.09% (Aug 2026). — [Portals](https://explorer.portals.fi/yield/ethereum:0xcf62f905562626cfcdd2261162a51fd02fc9c5b6.md)
  - crvUSD vaults about 1.7%. — [Trading Strategy](https://tradingstrategy.ai/vaults/stablecoins/crvusd)

### Inferences

- **Revenue at given supply, reserve-backed (assumption: reserves earn about 3.6 to 3.9%).** A $50M Mercury dollar earns about $1.8M to $1.95M a year gross. At $250M it earns about $9M to $9.75M, and at $1B about $36M to $39M, before issuer or white-label fees. If 50% of supply sits in an earn product paying T-bills minus 50 bps, savings cost is about 1.6 to 1.7% of total supply, leaving about 2% of supply ($1M per $50M) before ops, custody and issuer fees. This mirrors Sky's float economics.
- **Revenue at given supply, CDP leg (assumption: stability fee at or above market USDC borrow, about 4.5 to 6%).** A $25M xStock-backed book earns about $1.1M to $1.5M a year. Bad-debt provisioning for equity gap risk must come out of this. Sky's liquidation fees (about $3.9M a year on billions of debt) show penalties are not a reliable revenue line.
- Savers get the most when the protocol earns borrow spread on top of reserve yield (JUICED combines both). The savings rate can be above T-bills only if lending utilization is high or incentives subsidize it. Solayer's advertised 9.5% and Perena's about 15% are likely incentive- or risk-laden.
- Reserve sizing: precedents sit at 0.8 to 1.3% of supply, which is small relative to equity gap risk. For a CDP leg against xStocks, a reserve sized to stress loss on the CDP book (not on total supply) would be more prudent.

### Gaps

- No primary 2026 data on the Sky per-source revenue split, Ethena's partner (JupUSD) fee terms, or Privy/Sky developer rev-share.
- Current official T-bill yields (Treasury daily curve) and the Sep 2026 FOMC outcome were not verified from primary sources.

---

## 6. Failure modes and lessons: Black Thursday 2020, USDC/SVB spillover 2023, UST/Terra, Solana dollar wind-downs, Ethena's Oct 2025 Binance depeg, GHO's early depeg, and more

### Takeaway

CDP dollars fail at the liquidation engine (Black Thursday: zero-bid auctions in congestion), at the reserve leg (DAI inherited USDC's SVB depeg via the PSM), through mispriced borrow rates (GHO 2023 and Aug 2026), or by having no reason to be held (Solana CDPs, UXD, JupUSD's stalled adoption, Hyperliquid USDH). Reflexive designs fail by run dynamics (UST: 19.5% Anchor subsidy, $50B wiped out in three days). Ethena's Oct 2025 event was a venue-oracle failure: USDe hit $0.65 only on Binance, which priced it off its own order book while on-chain redemptions worked. It was still followed by about $8.3B of outflows. Defenses that worked: instant-settlement Dutch auctions, emergency PSM caps and fees, borrow-rate hikes plus a PSM, redemption at NAV, and on-chain oracles that ignore a single venue.

### Cited Findings

- **Black Thursday (12 to 13 Mar 2020).**
  - About a 50% ETH crash, slow oracles and gas congestion led to 1,461 to 1,462 auctions cleared at about zero DAI. One bidder won about 62,843 ETH. — [Glassnode](https://insights.glassnode.com/what-really-happened-to-makerdao)
  - Loss estimates differ: $8.325M (Whiterabbit/lawsuit) vs 6.65M DAI undercollateralization (MakerDAO post-mortem). MKR debt auctions raised more than 5M DAI, and Paradigm took 68%. Post-mortem fixes included an instant auction/liquidation halt and USDC as an auction asset. — [Cointelegraph post-mortem](https://cointelegraph.com/news/maker-debt-crisis-post-mortem-recommends-new-safeguards); [Cointelegraph magazine](https://cointelegraph.com/magazine/makerdao-takes-new-measures-to-prevent-another-black-swan-collapse)
  - Liquidations 2.0 later replaced the auctions with Dutch auctions. — [MIP45](https://mips-ipfs.makerdao.com/MIP45/mip45.md)
- **USDC/SVB spillover (Mar 2023).**
  - Circle disclosed $3.3B at SVB, and USDC fell to about $0.86 to $0.88. PSMs were "drained rapidly", and the depeg spread to DAI (about $0.85 low on 11 Mar), whose supply rose from 5.1B to 6.3B between 10 and 13 Mar. — [Federal Reserve FEDS Note, Dec 2025](https://www.federalreserve.gov/econres/notes/feds-notes/in-the-shadow-of-bank-run-lessons-from-the-silicon-valley-bank-failure-and-its-impact-on-stablecoins-20251217.html); [The Block](https://www.theblock.co/post/219638/makerdao-looks-to-limit-volatility-after-usdc-troubles-pushed-some-users-to-dai)
  - Maker's emergency response cut the daily USDC PSM mint limit from 950M to 250M DAI and raised the swap fee from 0% to 1%. — [FXStreet](https://www.fxstreet.com/cryptocurrencies/news/maker-deploys-emergency-dai-parameter-change-proposal-following-svb-collapse-202303131526)
- **UST/Terra (May 2022).**
  - Anchor's 19.5% yield drove issuance, with subsidies reaching $6M a day by Apr 2022. A Curve liquidity pull (about 6% of UST market cap) took UST to $0.985 on 8 May, and about 20% of Anchor deposits left in two days. — [Harvard Law Forum / NBER](https://corpgov.law.harvard.edu/2023/05/22/anatomy-of-a-run-the-terra-luna-crash/); [Richmond Fed](https://www.richmondfed.org/publications/research/economic_brief/2022/eb_22-24)
  - The run was driven by sustainability fears, not a single manipulator, and wiped out about $50B in three days. — [NBER w31160](https://www.nber.org/papers/w31160)
- **Ethena / Binance (10 to 11 Oct 2025).**
  - USDe hit about $0.65 on Binance only. Binance referenced its own order book and had deposit/withdrawal frictions, while Aave's oracle held about 1:1, avoiding DeFi liquidations. Binance paid about $283M in compensation and reportedly added redemption price to its index. — [CoinDesk](https://www.coindesk.com/markets/2025/10/13/no-ethena-s-usde-didn-t-de-peg); [The Block](https://www.theblock.co/post/374295/binance-pays-283-million-in-compensation-following-fridays-depegs-covering-user-losses); [CCN](https://www.ccn.com/education/crypto/ethena-usde-depeg-binance-crash-explained/); [CryptoJob (secondary)](https://cryptojob.org/blog/usde-depeg-binance-index-engineering)
  - About $2B was redeemed in 24 hours, and supply fell from about $14.7B to about $6.4B within two months. — [Cointelegraph via TradingView](https://www.tradingview.com/news/cointelegraph:4bc2a9faa094b:0-ethena-s-usde-loses-8-3b-since-october-crash-amid-loss-of-confidence/)
- **GHO early depeg (2023).**
  - GHO launched without a PSM. Rate hikes went 1.5% to 2.5% (Aug 2023, price about $0.975), then 3%, then 4.72% proposed (to match sDAI), then 5.22% (Nov 2023, price about $0.965). The GSM and Stewards came later (Stewards Apr 2024). — [Aave ARFC Aug 2023](https://governance.aave.com/t/arfc-increase-gho-borrow-rate/14612); [Aave ARFC Oct 2023](https://governance.aave.com/t/arfc-gho-increase-borrow-rate/15271); [Aave ARFC 5.22%](https://governance.aave.com/t/arfc-increase-gho-borrow-rate-to-5-22-on-aave-v3/15632); [Curve newsletter](https://curve.substack.com/p/november-20-2023-repeg-season); [Aave GHO docs](https://aave.com/docs/primitives/gho)
  - Recurrence in Aug 2026: below-market GHO rates drained the GSM (USDC GSM empty, USDT GSM down about 25%) until rates were raised. — [Aave governance](https://governance.aave.com/t/gho-stewards-august-2026-gho-borrow-rate-and-aave-savings-rate-update/25534)
- **Solana wind-downs.**
  - UXD: no product-market fit, Mango exploit exposure, and a two-year sunset. Hubble USDH fell to $2.7M. Parrot's team exited with $47.5M. Ratio suffered a key compromise. — [DL News](https://www.dlnews.com/articles/defi/solana-stablecoin-uxd-protocol-with-75m-usd-tvl-shuts-down/); [DefiLlama Ratio](https://defillama.com/protocol/ratio-finance)
  - Hylo xSOL was down about 99% with 28x dilution, while hyUSD held. — [DefiLlama Research](https://defillama.com/research/spotlight/hylo-xsol-no-liquidation-no-funding-but-what-are-the-real-costs)
  - JUICED reserve lost $24.3M on wind-down (Q3 2026). — [Pine Analytics](https://pineanalytics.substack.com/p/jupiter-quarterly-report-q3-2026)
- **Synthetic dollar on equity collateral.** Falcon USDf fell to $0.9783 (Jul 2025) on collateral-quality and transparency concerns. — [Cointelegraph](https://cointelegraph.com/news/falcon-usd-stablecoin-depegs-liquidity-collateral-concerns)

### Inferences

- **Lessons for a Mercury dollar on Solana with xStock CDP borrowing.**
  1. The reserve leg is the main peg risk. Choose reserves (USDtb/BUIDL/USDC) and custody so that a custodian-bank failure cannot propagate, as SVB did to DAI. Have pre-set emergency PSM mint caps and fees.
  2. Price the CDP stability fee at or above Kamino/Jupiter USDC borrow rates, and give a steward-style role bounded authority to move it fast (GHO: 500 bps per two days, 25% cap).
  3. Build the liquidation engine for the Monday open: Dutch auctions with instant settlement and flash-loanable lots, per-asset liquidation caps, a circuit breaker, and an oracle that holds the last close plus a band, with corporate-action pauses.
  4. Use on-chain or redemption-NAV pricing for the dollar itself in any Mercury lending market, never a single CEX book (the Binance/USDe lesson).
  5. Do not fund the savings rate with subsidies (Anchor) or leverage loops (JUICED Loop). Keep it at or below reserve yield plus realized borrow spread.
  6. Plan an orderly wind-down path: redemption at NAV and illiquid-asset handling (UXD, Hyperliquid USDH).

### Gaps

- No formal Ethena or Binance post-mortem document was found. The duration of the Binance depeg is reported inconsistently (minutes to about 90 minutes).
- Exact DAI low in Mar 2023 differs across sources (about $0.85 to $0.89).
- No incident was found of a CDP liquidating tokenized stocks through a weekend gap. Equity-collateral CDP stress is untested at scale.
