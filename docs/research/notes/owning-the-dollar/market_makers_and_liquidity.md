# Market makers and liquidity for a Mercury dollar and xStocks on Solana (as of 2026-10-21)

Notes on method:

- The live depth figures below come from my own queries to Jupiter's public APIs on **2026-10-21 between 05:58 and 06:10 UTC**. That is a Wednesday at about 02:00 ET, during the US overnight session: the regular session is closed, but Chainlink's 24/5 equity feeds are live.
- Sources used: the Jupiter token search API ([Jupiter Tokens API](https://lite-api.jup.ag/tokens/v2/search?query=USDG)), the Metis quote endpoint ([Jupiter Quote API](https://lite-api.jup.ag/swap/v1/quote)) and the Ultra order endpoint ([Jupiter Ultra API](https://lite-api.jup.ag/ultra/v1/order)). The Ultra endpoint compares Metis, JupiterZ RFQ, OKX and others.
- I requested quotes without a taker wallet, so they are **indicative**. A real fill can differ, especially for RFQ.
- Ultra applied `feeBps=10` on xStocks pairs and `feeBps=0` on stable/stable pairs. The Ultra outAmounts appear to be net of that fee: the gap between Metis and Ultra is about 8–10 bps on small xStock trades.
- "Liquidity" in the token API is Jupiter's own estimate of USD pool liquidity. It excludes RFQ.

## 1. Bootstrapping and sustaining liquidity for a new stablecoin on Solana

### Takeaway

On Solana in 2026, a new dollar's depth against USDC comes mostly from professional market makers, not from incentivised passive pools. They quote on Manifest (a CLOB), on prop AMMs and on JupiterZ RFQ, backed by permissioned 1:1 mint/redeem. The coins with large market caps but no committed makers (USD1, USDe, JupUSD) run out of depth at $1–5M. Paid incentives (PYUSD's roughly $500k/week in 2024) bought TVL that left when the incentives stopped.

### Cited Findings

**Mint/redeem access for authorised participants (the main peg tool)**

- JupUSD is Jupiter's Solana-native dollar, built with Ethena and launched in January 2026.
  - Reserves target 90% USDtb (backed by BlackRock BUIDL) and 10% USDC, held with Anchorage Digital, Coinbase Custody and an on-chain mint/redeem buffer. The mix is rebalanced daily. — [Jupiter docs: JupUSD FAQ](https://docs.jup.ag/user-docs/earn/jupusd/faq)
  - Direct mint and redeem is limited to "registered benefactors (KYC'd/KYB'd market makers and institutional partners)". Retail buys on DEXs. — [Jupiter docs: JupUSD](https://docs.jup.ag/user-docs/earn/jupusd/index)
  - The peg is held by authorised-MM arbitrage (buy below $1 and redeem at par; mint above $1 and sell) plus "an automated peg bot" that uses the mint/redeem program. — [Jupiter docs: JupUSD](https://docs.jup.ag/user-docs/earn/jupusd/index)
  - Mint and redeem cost a flat **0.04%**. Swaps pay only venue fees. — [Jupiter docs: JupUSD](https://docs.jup.ag/user-docs/earn/jupusd/index)
  - JupUSD pays holders no yield. Yield goes through a separate wrapper (JUICED), which earns T-bill yield plus Jupiter Lend interest. — [Jupiter docs: JupUSD](https://docs.jup.ag/user-docs/earn/jupusd/index)
- USDG (Paxos / Global Dollar Network) launched on Solana on 2025-02-25. Paxos Digital Singapore issues it; Anchorage and Kraken were the first institutional access points. — [Global Dollar press release](https://globaldollar.com/newsroom/global-dollar-usdg-stablecoin-now-available-on-solana-blockchain)
  - Network partners reportedly receive "up to the full returns" on reserves backing USDG held on their platforms, plus revenue tied to minting and acceptance. This report is secondary and should be verified against GDN terms. — [eco.com summary](https://eco.com/support/en/articles/11753007-what-is-global-dollar-usdg); [Global Dollar newsroom](https://globaldollar.com/newsroom/global-dollar-network-grows-to-more-than-100-partners-and-usdg-stablecoin-crosses-1-billion-in-market-cap)
  - Alpaca joined GDN to offer USDG on Solana in October 2025. — [BusinessWire](https://www.businesswire.com/news/home/20251029084657/en/Alpaca-Joins-Global-Dollar-Network-Bringing-USDG-to-Customers-on-Solana)

**Paid incentives and what they bought (PYUSD case)**

- Paxos hired Trident Digital to run PYUSD incentive campaigns across Solana DeFi. Blockworks reported about **$500,000 per week** in PYUSD incentives in 2024 but could not confirm who paid. Kamino's PYUSD reserve peaked at about **$350M earning ~18%**, and caps and yields were then cut over time. I relied on search summaries of these Blockworks articles because the pages returned 403. — [Blockworks: Kamino PYUSD incentives](https://blockworks.com/news/kamino-seeing-benefits-from-liquidity-incentives-on-pyusd); [Blockworks Lightspeed: PYUSD outflows as incentives wane](https://www.blockworks.com/news/lightspeed-newsletter-pyusd-outflows-solana)
- Orca's PYUSD/USDC CLMM pool was the main pool during the 2024 push. — [Deribit Insights](https://insights.deribit.com/industry/vol-commentary-pyusd-on-solana/)
- PYUSD now sustains itself through lending and curated-vault demand rather than LP farming:
  - Kamino, September 2026: Ethena PYUSD Prime vault $217.5M (−13.4% MoM), Sentora PYUSD vault $131.6M (+20.6%). — [Kamino Risk Insights Sep 2026](https://gov.kamino.finance/t/kamino-lend-monthly-risk-insights-september-2026/893)
  - Jupiter Lend's PYUSD reserve went from $50.1M on 2026-09-30 to $252M two weeks later, with 96% borrowed. — [Pine Analytics Jupiter Q3 2026](https://pineanalytics.substack.com/p/jupiter-quarterly-report-q3-2026)

**Protocol-owned and captive liquidity (JupUSD case)**

- Jupiter planned to convert USDC in the JLP perps pool into JupUSD, reported variously as about $750M ([The Block](https://www.theblock.co/post/384366/jupiter-rolls-out-native-jupusd-stablecoin-backed-90-by-blackrock-and-ethenas-usdtb)) or about $500M ([Pine Analytics](https://pineanalytics.substack.com/p/jupiter-quarterly-report-q3-2026)).
  - By 2026-09-30 it had not happened. JLP held $18.7M of JupUSD against $127M of USDC, JupUSD supply fell 12% in Q3 to 45.1M, and JupUSD in the Lend reserve fell from $71.6M to $55.0M. — [Pine Analytics](https://pineanalytics.substack.com/p/jupiter-quarterly-report-q3-2026)
  - JupUSD became a JLP custody asset on 2026-06-30, after a RedStone feed went live in late June. — [Solana Compass](https://solanacompass.com/news/jupusd-joins-jlp-as-a-custody-asset-expanding-jupiters-stablecoin-into-its-perps-pool)
- Jupiter Lend v2 (launched 2026-08-10) added "Smart Collateral / Smart Debt" correlated-pair pools. They act as lending-owned stableswap liquidity and traded $294M in August and $589M in September, "nearly all USDT/USDC". — [Pine Analytics](https://pineanalytics.substack.com/p/jupiter-quarterly-report-q3-2026). These pools appear in Jupiter routes as "JupLend AMM" (my quotes, below).

**Stable-swap and hub designs**

- Perena's Numéraire uses a hub-and-spoke design. A "Seed Pool" of USDC/USDT/PYUSD, represented by the LP token USD*, lends depth to "Growth Pools" for newer stablecoins. Liquidity concentrates in the 0.99–1.01 band. Volume is self-reported at over $2.1B. These are secondary listings; I found no official current TVL. — [Solana Compass: Perena](https://solanacompass.com/projects/perena); [Alchemy dapp listing](https://www.alchemy.com/dapps/perena)

**Prop AMMs now dominate the short tail (SOL-USD and stable-stable)**

- Blockworks Research says prop AMMs are run by a single market maker with no external LPs and update their oracle price through optimised transactions. HumidiFi gets more than 95% of its volume from aggregators, and Tessera, GoonFi and SolFi look similar. Blockworks expects prop AMMs to own SOL-stable and stable-stable pairs. This comes from a search summary; the page now 404s. — [Blockworks Research: Solana DEX winners, all about order flow](https://app.blockworksresearch.com/unlocked/solana-dex-winners-all-about-order-flow)
- Prop-AMM share is shifting fast. BisonFi has more than 35% of daily prop-AMM volume, HumidiFi fell from over 68% to about 26.5% in a month, and Tessera holds 7–12%. — [Stepdata (Dune-based)](https://stepdata.substack.com/p/prop-amms-on-solana-bisonfi-ends)
- Solana Compass estimates prop AMMs carry over 60% of Solana DEX volume. — [Solana Compass / Lightspeed](https://solanacompass.com/learn/Lightspeed/solanas-next-big-catalyst-in-2026-lightspeed-weekly-roundup)

**Jupiter routing and fees for stable pairs**

- Ultra's "Juno" engine aggregates Solana AMMs, DFlow, Hashflow, OKX and Jupiter's own Metis and JupiterZ (RFQ) routers, and "sidelines low-quality liquidity sources over time". — [Jupiter docs: Ultra](https://docs.jup.ag/user-docs/trade/spot/ultra-mode)
- Ultra fees run 0–0.5% by pair; stable pairs sit at the low end. — [Jupiter docs: Fees](https://docs.jup.ag/user-docs/trade/spot/fees). I observed `feeBps=0` on every stable→USDC order ([Jupiter Ultra API](https://lite-api.jup.ag/ultra/v1/order)).

**Live depth snapshot, stablecoins vs USDC (2026-10-21 ~06:05 UTC)**

Supply, liquidity and holders come from the [Jupiter Tokens API](https://lite-api.jup.ag/tokens/v2/search?query=USDG). Execution figures are received USDC versus par; for "Buy" they are tokens received versus par.

| Token (Solana) | Mkt cap | Jupiter "liquidity" | Holders | Sell $1M → USDC   | Sell $5M → USDC                           | Venues used                                                  |
| -------------- | ------- | ------------------- | ------- | ----------------- | ----------------------------------------- | ------------------------------------------------------------ |
| USDT           | $3.83B  | $28.6M              | 2.31M   | −0.104% (Metis)   | −0.124% (JupiterZ RFQ)                    | RFQ, Manifest, SolFi V2, Raydium CLMM                        |
| PYUSD          | $682M   | $28.6M              | 58.4k   | +0.012%           | −0.007%                                   | Manifest + Orca Whirlpool                                    |
| USDG           | $645M   | $34.3M              | 24.2k   | −0.008%           | −0.059% (−0.162% at $10M)                 | Manifest + Orca Whirlpool                                    |
| USD1           | $1.40B  | $23.7M              | 37.0k   | −0.131%           | −29.3% (−5.2% at $3M)                     | Manifest, Raydium CLMM, BisonFi, then OKX                    |
| JupUSD         | $42.9M  | $19.5M              | 13.4k   | −0.050%           | −0.118% via OKX (Metis alone quoted −33%) | Manifest, Raydium CLMM, Whirlpool, Meteora DLMM, JupLend AMM |
| USDe           | $388M   | $8.0M               | 10.2k   | −0.075%           | −65.7% (−45.9% at $3M)                    | Manifest + Whirlpool                                         |
| USDS (Sky)     | $4.7M   | $1.2M               | 11.4k   | −40%              | n/a                                       | Manifest, Raydium CLMM                                       |
| FDUSD          | $8.5M   | $17k                | 7.8k    | no route at $100k | no route                                  | none                                                         |

### Inferences

- The two "regulated, MM-supported" dollars hold within 6 bps of par at $5M. USDG and PYUSD both route almost entirely through Manifest (an on-chain order book where makers quote) plus Orca CLMM. That fits makers with mint/redeem access keeping tight quotes.
- USD1 has the largest market cap of the newer coins but is thinner beyond about $1M. Market cap is a poor proxy for depth; committed makers plus redemption access are what count.
- The JupUSD gap between Metis (−33% at $5M) and Ultra via OKX (−0.12%) shows that routing coverage also matters. If Mercury quotes only through Metis, it will misprice large redemptions of its own dollar.
- For a Mercury dollar, a workable bootstrap stack modelled on JupUSD and USDG looks like this:
  - Permissioned 1:1 mint/redeem for two to four KYB'd makers, with a fee at or below the 0.04% JupUSD charges and same-day or 24/7 settlement.
  - A capped on-chain redemption buffer, which works like a PSM.
  - Seeded stable pools: Orca or Meteora DLMM, or a spoke on Perena's hub.
  - JupiterZ RFQ and Manifest quoting by those makers.
  - Lending-market listings (Kamino and Jupiter Lend), so holders have a use and makers have inventory financing.
- The 2024 PYUSD episode suggests that raw APR incentives rent TVL rather than build depth.
- No Solana PSM exists in the Maker sense among the coins I checked. The nearest equivalents are the issuer mint/redeem programs (the JupUSD program, Paxos mint/redeem through partners).

### Gaps

- I found no reliable total cost for the PYUSD incentive programme; only the $500k/week figure, which Blockworks could not attribute.
- I found no figures for USDG, USD1 or USDe incentive spend on Solana.
- Pool TVL by venue (Orca, Meteora, Raydium) for each stablecoin is not broken out. Jupiter's "liquidity" field aggregates across venues.
- I do not know who the makers quoting PYUSD/USDG on Manifest are.
- Depth was measured once, on a weekday. Weekend and stress-day depth was not measured.
- FDUSD on Solana appears practically dead (about $17k liquidity), and I found no write-up explaining it.

## 2. What market makers want (programs, rebates, loans, RFQ access, hedging, legal terms)

### Takeaway

Market makers want flow worth quoting, cheap and reliable mint/redeem or creation, a venue to hedge on, and low-friction API/RFQ access with clear SLAs. Rebates are small: Hyperliquid's top tier is −0.3 bp, and the Solana Foundation's Frontier pays 0.1–0.5 bp. The token-loan-plus-call deals typical of new tokens make no sense for a $1 stablecoin. For xStocks, makers hedge with the underlying shares, futures and ATS venues, and mint or redeem in-specie through Backed's xPort.

### Cited Findings

**Rebates and maker programs**

- Hyperliquid maker rebates are tiered by 14-day weighted maker-volume share:
  - more than 0.5% of volume earns −0.001%;
  - more than 1.5% earns −0.002%;
  - more than 3.0% earns −0.003%.
  - Rebates are paid per trade. I found no formal "designated market maker" program. — [Hyperliquid docs: Fees](https://hyperliquid.gitbook.io/Hyperliquid-docs/trading/fees)
- The Solana Foundation's "Frontier Traders" programme was reported on 2026-09-15:
  - It pays cross-venue maker rebates of 0.001–0.005% across 16 founding venues, which handle more than 90% of Solana spot and perp volume.
  - Entry requires at least $10M of 30-day volume; top tiers need $5B+ per month.
  - Members also get priority RPC and account management.
  - It is described as a Foundation-subsidised way for smaller DEXs to offer maker incentives. — [Crypto Briefing](https://cryptobriefing.com/solana-frontier-trader-rewards-program/)
- Drift ran a 2022 maker rebate of up to 5 bps against a 10 bps taker fee, and later used points for MMs and LPs. — [Drift Notion](https://driftprotocol.notion.site/Market-Maker-Variable-Rebate-Program-5d8e8b06b234464cb2f987171badeea4); [CoinGecko](https://coingecko.com/learn/earn-drift-points-potential-drift-protocol-airdrop)
- Drift was drained of about $280–286M on 2026-04-01 through a compromised admin key, attributed to DPRK social engineering, so its current programme status is unclear. It is reportedly rebuilding as "Velocity DEX" (secondary source). — [Forklog](https://forklog.com/en/news/drift-protocol-on-solana-loses-280m); [Solana Compass: Drift](https://solanacompass.com/projects/Drift)
- Kraken xStocks spot fees are a 2 bps maker rebate and a 10 bps taker fee (CoinPaprika citing Kraken). — [CoinPaprika](https://coinpaprika.com/education/tokenized-stocks-liquidity-on-chain/)

**RFQ access: JupiterZ maker requirements**

- Makers must fill 95% of quotes within a 1-hour window or be switched off. Webhooks must answer within 250 ms or the auction proceeds without them. The total transaction expiry is 55 s, and the frontend re-quotes every 3 s. — [Jupiter dev docs: RFQ integration](https://developers.jup.ag/docs/swap/routing/rfq-integration) (via search summary; the integration page says requirements are "subject to change")
- Onboarding steps:
  1. Implement the webhook schema.
  2. Pass offline acceptance tests and live integration tests on "Edge" (pre-production).
  3. Register with Jupiter.
  - V1 (webhook, settled through the Order Engine program) runs alongside V2, which streams orderbooks over gRPC into Metis. — [Jupiter dev docs](https://developers.jup.ag/docs/swap/routing/rfq-integration)
- On JupiterZ fills the maker pays the network and priority fees but not ATA rent. The trade is gasless for the user and has no minimum size. — [Jupiter docs: Ultra](https://docs.jup.ag/user-docs/trade/spot/ultra-mode)

**Token loans and call options: structure and controversy**

- Flowdesk (2024-10-29) compares two models:
  - **Loan/call:** the issuer lends tokens, and the MM is paid through a call option and gamma trading, so the MM carries the capital risk.
  - **Retainer:** the issuer pays a monthly fee and carries the capital risk.
  - Suggested KPIs are spread and depth together (a 30 bps spread with $100k of depth beats 5 bps with a few hundred dollars), uptime above 95%, and real-time reporting.
  - Red flags include guaranteed prices and no AML/KYB. — [Flowdesk](https://flowdesk.co/updates/blogs/67215e228e4bf46d9bd3f247)
- Typical loan/call terms are 1–5% of supply for 12–24 months with tranched strikes. Search summary; it is unclear which of the listed guides this comes from. — [Tokenomist glossary](https://tokenomist.ai/learn/glossary-term/loan-and-call-option-market-making)
- One disclosed retainer is GSR–Stake DAO: $100k setup, $20k per month and a $1M BTC/ETH loan. This comes from a search summary of MM guides and was not checked against the Stake DAO forum. — [Veda guide](https://veda.ng/134)
- Jupiter publishes its own JUP market-maker deals, all on 2-year terms:
  - Kbit: 6M tokens with 2M of calls;
  - Wintermute: 15M with 5M of calls;
  - DWF: 20M with 20M of calls, plus 10M tokens given to DWF for listing arrangements.
  - Jupiter states it made no OTC or discounted sales. — [Jupiter docs: Transparency](https://docs.jup.ag/user-docs/more/jup-token/transparency)
- Movement (MOVE) is the reference controversy:
  - A maker linked to Web3Port sold about 66M MOVE (~$38M, 2.64% of circulating supply) on Binance listing day, and Binance banned the account.
  - The intermediary Rentech reportedly sat on both sides of the deal.
  - An internal memo said the deal loaned roughly half of the public float to one counterparty.
  - An earlier draft let the MM sell above a $5B FDV and split profits 50/50.
  - Movement announced a $38M buyback and suspended co-founder Rushi Manche. — [Decrypt](https://decrypt.co/317524/movement-labs-suspends-co-founder-amid-market-maker-controversy); [Blockworks](https://blockworks.com/news/movement-rushi-manche-suspension-market-maker-web3port); [Rekt](https://rekt.news/all-the-wrong-moves)

**Tokenized-stock makers: creation/redemption, hedging, nights and weekends**

- Backed's xPort (launched November 2025 with Alpaca) lets onboarded clients such as funds and market makers mint xStocks using off-chain shares as collateral. This "in-specie" route removes fiat steps. — [FF News](https://ffnews.com/news/backed-launches-xport-to-bring-trillions-in-equities-onchain)
- KYC'd primary clients mint and redeem at NAV, subject to minimums. — [DefiLlama: xStocks](https://defillama.com/rwa/platform/xstocks)
- One analysis says Backed targets redemption within T+3 business days (secondary). — [Web3 Thought Drops](https://web3thoughtdrops.substack.com/p/backed-finance-comprehensive-analysis)
- Kraken's xStocks FAQ on off-hours trading:
  - Market makers price from ATS platforms, index futures and internal models to approximate fair value.
  - Spreads are wider off-hours.
  - The mismatch at Monday open has historically been under 1%.
  - Ten xStocks trade 24/7 on Kraken Pro; the rest trade 24/5. — [Kraken support: xStocks FAQ](https://support.kraken.com/articles/xstocks-faq)
- Kraken off-hours references: pre- and after-hours prices come from Nasdaq/NYSE extended hours, and overnight prices from Blue Ocean ATS. — [Kraken support: market hours](https://support.kraken.com/gb/articles/market-hours-explained)
- Solana Compass argues that makers cannot run deep books without hedging, and that most xStock volume still happens on CEXs, with $20–60M per day in SPL xStocks. — [Solana Compass / Lightspeed](https://solanacompass.com/learn/Lightspeed/solanas-next-big-catalyst-in-2026-lightspeed-weekly-roundup)
- Hyperliquid HIP-3's trade.xyz equity-index perp uses an oracle built from CME Micro E-mini Nasdaq-100 futures, converted to an implied cash index via cost of carry. That gives makers a hedge while cash markets are shut. — [Blockworks Research: Weekends are for trading](https://blockworks-research.beehiiv.com/p/weekends-are-for-trading)
  - HIP-3 open interest set a record above $4B on a Saturday. — [Cryptopolitan](https://cryptopolitan.beehiiv.com/p/the-weekend-trade-just-crossed-4-billion)
  - trade.xyz holds about 90% of HIP-3 OI. — [OneKey](https://onekey.so/blog/ecosystem/tradexyz-has-taken-over-the-tradfi-perps-lane-superior-pricing-liquidity-and-network-effects-are-driving-a-winner-takes-all-market-20260515105124/)
- Ondo's RFQ primary market quotes spreads of up to 5 bps with a 30-second firm-quote window and pauses when the underlying market is closed (CoinPaprika citing FalconX). — [CoinPaprika](https://coinpaprika.com/education/tokenized-stocks-liquidity-on-chain/)
- Ondo turned on 24/7 mint/redeem for SPYon, QQQon, NVDAon, TSLAon, GOOGLon and CRCLon. Other Ondo tokens stay 24/5 with JIT/RFQ liquidity, so liquidity "may be significantly lower outside traditional U.S. market hours". — [Jupiter docs: Tokenized stocks](https://docs.jup.ag/user-docs/trade/spot/tokenized-stocks)
- An IMF study (via CryptoSlate) found that more than half of tokenized US-stock trading volume across 11 venues happens outside the regular session, and that market quality is weaker in those hours. — [CryptoSlate](https://cryptoslate.com/imf-finds-over-half-of-tokenized-us-stock-trading-happens-after-wall-street-closes/)

### Inferences

- For a Mercury dollar, a maker package would offer:
  - par mint/redeem with near-zero fees and fast, ideally 24/7, settlement;
  - an inventory or credit line in the Mercury dollar, or a USDC-to-Mercury-dollar swap facility;
  - guaranteed routing of Mercury's user flow to them through RFQ;
  - possibly small fixed retainers per quoted pair.
- Token loans with calls should be avoided: a $1 asset has no upside to option, and the MOVE case shows the reputational risk.
- Contracts should set measurable KPIs: two-sided depth at ±5/±10 bps, uptime, weekend obligations and quote-fill rates (JupiterZ uses 95%). Public disclosure of terms, as Jupiter does for JUP, reduces controversy.
- For xStocks, Mercury cannot easily attract makers by itself, because hedging needs a broker or prime and xPort/Backed onboarding. It is better to plug into the makers already quoting xStocks through JupiterZ and other Solana venues than to recruit new ones.

### Gaps

- I found no public list of the JupiterZ makers quoting xStocks or stablecoins.
- Backed/Kraken's MM agreements and any xStocks maker incentive or rebate terms are not public.
- I found no formal DMM programme with obligations and rebates on Hyperliquid or a Solana DEX, and no dYdX or Binance-style DMM programme pages; I did not reach a primary source for these.
- Frontier's per-tier rates and venue list were not available.

## 3. Internalisation, in-app RFQ, order flow and MEV

### Takeaway

On Solana, RFQ already beats AMMs for size. JupiterZ quoted xStocks flat to $10M and won most Ultra quotes of $50k and above. An app can capture much of this by sending users through Ultra or by running its own maker auction, and it can net opposing user orders internally. Selling flow to makers (PFOF) is banned for EU investment firms under MiFIR Art. 39a and carries Robinhood-style reputational risk. Fee-on-routing, as with Phantom's 0.85%, is the common, accepted on-chain analogue.

### Cited Findings

- JupiterZ volume:
  - Ultra V3 launch material (October 2025) put JupiterZ at about $100M per day of "zero-slippage" volume. — [The Block press release](https://www.theblock.co/press-releases/375289/jupiter-launches-ultra-v3-the-ultimate-trading-engine-for-solana)
  - Jupiter RFQ handled $3.99B in Q3 2026, up 24% QoQ. — [Pine Analytics](https://pineanalytics.substack.com/p/jupiter-quarterly-report-q3-2026)
- RFQ volume can be inflated. Pine flags two one-day artefacts filled by MMs: "$2.42B of round-trip trades on July 11 and $2.27B of self-dealing in a new token on August 24". — [Pine Analytics](https://pineanalytics.substack.com/p/jupiter-quarterly-report-q3-2026)
- MEV: a study dated 2026-09-23 (Category Labs, ETH Zurich, Flashbots, University of Lisbon) found Ultra users were sandwiched at 0.7× the rate chance predicts, against 11–19× for Solana trading bots. — [Pine Analytics](https://pineanalytics.substack.com/p/jupiter-quarterly-report-q3-2026)
- CoW Protocol batches orders and auctions settlement rights to solvers. Each directed pair clears at one uniform price per batch, which makes ordering irrelevant to MEV bots, and the winning solver is the one that maximises trader surplus. — [CoW docs: batch auctions](https://docs.cow.fi/overview/batch-auctions)
  - A TUM thesis found that true coincidences of wants are "negligible" on CoW; the MEV protection comes mostly from batching. — [TUM thesis](https://www.cs.cit.tum.de/fileadmin/w00cfj/sebis/thesis/230915_Lladrovci_Thesis.pdf)
- 1inch Fusion orders are Dutch-auction limit orders filled by vetted "resolvers" (professional MMs) who pay gas, and large orders can be split across resolvers. On Solana the intent is posted on-chain, and fills may be partial or may not happen. — [1inch help: Fusion](https://help.1inch.com/en/articles/9842591-what-is-1inch-fusion-and-how-does-it-work); [1inch help: Solana Fusion](https://help.1inch.com/en/articles/11892029-solana-fusion-on-1inch-how-it-works)
- DFlow pitched an on-chain, auction-based PFOF marketplace:
  - Wallets auction retail flow, and the winning MM gets the exclusive right to fill.
  - MMs must define best price against aggregated CEX+DEX public prices.
  - It raised $5.5M in 2023 (Framework lead; Coinbase, Circle and Wintermute Ventures).
  - DFlow is now one of Ultra's third-party liquidity sources. — [CoinDesk via Yahoo](https://malaysia.news.yahoo.com/defi-protocol-dflow-raises-5-130725669.html); [Jupiter docs: Ultra](https://docs.jup.ag/user-docs/trade/spot/ultra-mode)
- EU MiFIR Article 39a bars investment firms from receiving payment from third parties for routing client orders to a venue. It was added by Regulation (EU) 2024/791, in force since 2024-03-28. Crypto-asset services mostly fall under MiCA, so whether the ban applies to crypto is unclear. — [ESMA interactive rulebook: MiFIR Art. 39a](https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mifir/article-39a-prohibition-receiving-payment); [MFSA letter](https://www.mfsa.mt/wp-content/uploads/2024/12/Dear-CEO-Letter-Revision-of-Conduct-of-Business-Rulebook-Primarily-to-Implement-the-Prohibition-on-Investment-Firms.pdf)
- Phantom charges a flat 0.85% on in-wallet swaps routed through Jupiter. I found no disclosure of any payment from Jupiter (secondary sources). — [Plisio](https://plisio.net/de/defi/phantom-wallet-for-solana); [Finder](https://www.finder.com.au/cryptocurrency/wallets/phantom-wallet-review)
- Jupiter's own fees: Ultra charges 0–0.5% by pair, Jupiter Mobile charges 0.1–0.2%, and Manual Mode charges no Jupiter commission. — [Jupiter docs: Fees](https://docs.jup.ag/user-docs/trade/spot/fees); [Jupiter docs: Manual mode](https://docs.jup.ag/user-docs/trade/spot/manual-mode)
- My measurements on 2026-10-21 show JupiterZ winning most Ultra xStock quotes of $50k and above (see section 5), and taking a $5M USDT→USDC sale at −12.4 bps versus par. — [Jupiter Ultra API](https://lite-api.jup.ag/ultra/v1/order)

### Inferences

- Mercury has three realistic options, from least to most intermediated:
  - **(a)** Keep routing through Ultra, which already runs a maker auction (JupiterZ against Metis against OKX/DFlow/Hashflow), and charge a disclosed app fee.
  - **(b)** Run a Mercury RFQ (a "Mercury Z") in which whitelisted makers compete for user orders in the Mercury dollar and xStocks. The best quote wins, and the Ultra or Metis quote serves as a best-execution floor.
  - **(c)** Internalise by netting opposing user buys and sells off-chain and settling only the net on-chain.
- Option (c) gives the best prices and the least MEV for matched flow, because nothing hits a public pool. But it makes Mercury a counterparty or matching venue, which brings broker or MTF-like duties. With tokenized securities it likely triggers securities rules in the EU (MiFID/MiCA) and elsewhere.
- Option (b) is safer if makers pay nothing to Mercury and Mercury's fee is a disclosed user fee. Taking rebates from makers for routing users' flow would resemble PFOF, which EU investment firms are banned from receiving.
- RFQ quotes are firm only within short windows and allow maker discretion (JupiterZ enforces a 95% fill rate). Mercury should monitor quote-to-fill and slippage per maker.
- The Pine artefacts show that RFQ volume is easy to inflate. Maker rewards should therefore be keyed to user-facing price improvement, not raw volume.

### Gaps

- JupiterZ's quote competition rules, last-look tolerance and fee split were not on the overview page. They sit in subpages I did not retrieve.
- I found no documented case of a Solana consumer app running its own internal matching engine for tokenized stocks.
- The application date and crypto scope of the EU PFOF ban were not confirmed in my sources.
- I found nothing on PFOF-like arrangements between Solana wallets and prop AMMs or makers beyond DFlow's 2023 pitch.

## 4. User-provided liquidity products: how returns are generated, risks, marketing, incidents

### Takeaway

Retail "earn" products that fund liquidity fall into three groups:

- **Counterparty vaults (JLP, HLP):** returns are trader losses plus fees, so depositors are short trader PnL and long the inventory.
- **Insurance or backstop funds (Drift IF):** depositors earn fees but face tail losses.
- **Automated CLMM vaults (Kamino, Meteora):** fees minus impermanent loss/LVR.

The incidents (JELLY, POPCAT, the 2026 Drift drain) show that thin assets, governance discretion and admin keys, rather than the strategy itself, cause the large losses. Prop AMMs are also squeezing passive LPs out of the major pairs.

### Cited Findings

**HLP (Hyperliquid)**

- HLP is a community-owned protocol vault. It runs market-making strategies, performs liquidations, supplies USDC to Earn and takes a share of trading fees, and depositors share its PnL. There is a 4-day lock-up from the last deposit. — [Hyperliquid docs: Protocol vaults](https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/vaults/protocol-vaults)
- JELLY (2025-03-26):
  - A trader's large short on JELLY was passed to HLP via liquidation while the token was pumped on DEXs. HLP's unrealised loss reached about $12M; estimates run $10–20M.
  - Validators delisted the market and settled at $0.0095 instead of about $0.05, flipping HLP to a roughly $700k profit. The Hyper Foundation made non-flagged users whole.
  - Critics focused on validator discretion. — [The Block](https://www.theblock.co/post/348314/hyperliquid-delists-jellyjelly-memecoin-amid-whale-manipulation-fiasco); [FXStreet](https://www.fxstreet.com/cryptocurrencies/news/hyperliquid-escapes-liquidity-crisis-following-jellyjelly-short-squeeze-delists-token-202503262225); [The Defiant](https://thedefiant.io/news/defi/hyperliquid-token-tanks-as-another-vault-attack-sparks-controversy)
- Two weeks earlier, an ETH whale's leveraged exit cost HLP about $4M. — [The Block](https://www.theblock.co/post/348314)
- POPCAT (2025-11-12):
  - The attacker withdrew about $3M from OKX into 19 wallets, built roughly $20M of buy walls at $0.21 and a $20–30M long, then pulled the walls. The long liquidated within seconds and the price fell about 30%.
  - HLP absorbed about $4.9M of bad debt, and HLP deposits and withdrawals were paused. — [The Defiant](https://thedefiant.io/news/defi/large-popcat-trades-result-in-usd5-million-loss-for-hyperliquid-vault); [Cointelegraph](https://cointelegraph.com/news/hyperliquid-hlp-popcat-attack-3m-wipeout); [The Block](https://www.theblock.co/post/378606/hyperliquid-pauses-deposits-withdrawals-popcat-trading-scheme-speculation)

**JLP (Jupiter Perps)**

- Q3 2026:
  - JLP assets went from $701M to $809M, and the token price from $3.51 to $4.85 (+38%) while SOL rose 59%.
  - Net redemptions were about $109M, and OI ended near $106M.
  - Trader fees were $22.5M, of which Jupiter's share was $5.6M. Realised trader losses (pool income) were $12M, against $23M in Q2. — [Pine Analytics](https://pineanalytics.substack.com/p/jupiter-quarterly-report-q3-2026)
- JLP holds SOL, ETH, BTC, USDC, USDT and JupUSD. — [Solana Compass](https://solanacompass.com/news/jupusd-joins-jlp-as-a-custody-asset-expanding-jupiters-stablecoin-into-its-perps-pool)
- Jupiter offers JLP-DN, a vault that hedges JLP's SOL/ETH/wBTC and trader-PnL exposure to target USDC-denominated yield. — [Jupiter docs: delta-neutral](https://docs.jup.ag/user-docs/trade/perps-and-jlp/delta-neutral.md)
- In the 2025-02-02 crash, total trader PnL was −$57M over 24h; Jupiter said JLP was "relatively stable". In the week of 2025-02-24, traders' net realised PnL fell $36.0M because of their long bias. — [Jupiter discuss: crash analysis](https://discuss.jup.ag/t/market-crash-analysis-feb-2-2025/34769); [Jupiter discuss: weekly risk report](https://discuss.jup.ag/t/weekly-risk-report-february-24-2025/35537)
- On 2026-02-05/06, JLP fell 10% from $3.83 to $3.43 and $6.47M of JLP collateral was liquidated on Kamino (secondary, via DefiLlama). — [DefiLlama JLP](https://defillama.com/token/jlp)

**Drift insurance fund and the April 2026 drain**

- On 2026-04-01, about $280–286M was taken across lending, trading and vault deposits through a compromised admin key and pre-signed transactions (suspected DPRK).
  - Drift said the insurance fund "was and remains unaffected" because the platform paused before losses flowed through bankruptcy processes.
  - Reports of Tether's rescue support conflict: $127.5M against up to $150M. — [CoinCentral](https://coincentral.com/drift-protocol-says-insurance-fund-deposits-remain-safe-after-280m-exploit/); [FinanceFeeds](https://financefeeds.com/tether-backs-drift-protocol-with-127-5m-plan-following-280m-exploit/); [Forklog](https://forklog.com/en/news/drift-protocol-on-solana-loses-280m)
- Range's post-mortem says a wash-traded history made a fake collateral token look legitimate, and recommends checking collateral depth and trading history, not just spot price. I took this from the sibling "Mercury in house cash yield" notes and did not re-fetch it. — [Range](https://range.org/blog/inside-the-drift-exploit-how-to-protect-your-protocol-and-multisigs-against-dprk-threat-actors)

**Automated CLMM vaults and LP economics**

- Kamino liquidity vaults deploy into Orca Whirlpools and Raydium CLMM pools, set and rebalance ranges automatically, auto-compound fees and rewards, and issue fungible kTokens. The usual risks are impermanent loss and leverage-stacking. All sources here are secondary, and the APY claims (10–30%) are third-party. — [CoinCodex review](https://coincodex.com/review/18701/kamino-review-maximum-capital-efficiency-with-automated-concentrated-liquidity-vaults); [Jito docs](https://www.jito.network/docs/jitosol/get-started/using-jitosol-flow/raydium/)
- Meteora DLMM uses dynamic fees that rise with volatility to compensate LPs (vendor guide). — [MadeOnSol](https://madeonsol.com/blog/solana-concentrated-liquidity-guide)
- LVR theory: LP loss to arbitrageurs scales with price variance times marginal liquidity. — [Milionis et al., arXiv 2208.06046](https://arxiv.org/pdf/2208.06046v2). A vendor rule of thumb is σ²/8 of pool value, roughly 5–7% per year on ETH-USDC-like pairs. — [eco.com](https://eco.com/support/en/articles/12151735-impermanent-loss-explained-and-lvr-the-pro-version)
- Raydium defines IL as LP value versus holding, realised on withdrawal. — [Raydium docs](https://docs.raydium.io/algorithms/impermanent-loss.md)
- Retail-facing incentives for xStocks liquidity:
  - xStocks' xPoints gives its "Highest Tier" to providing liquidity to xStocks DEX pools, above lending and holding. — [Jupiter docs: xStocks](https://docs.jup.ag/user-docs/earn/lend/borrow/xstocks)
  - Kraken launched xStocks vaults (Kamino/Veda/Sentora) in September 2026, with a 3-day withdrawal because the lending position must unwind. This comes from the sibling notes and was not re-fetched. — [Genfinity](https://genfinity.io/2026/09/14/kraken-xstocks-vaults-kamino-veda-sentora-tokenized-stock-yield/)
- Jupiter Lend v2 correlated-pair pools let lenders' assets also act as swap liquidity, mostly USDT/USDC ($589M of September volume). — [Pine Analytics](https://pineanalytics.substack.com/p/jupiter-quarterly-report-q3-2026)

### Inferences

- For Mercury, the safest user-LP product is a Mercury-dollar/USDC stableswap or a lending deposit:
  - IL is near zero while both coins hold par.
  - Returns come from swap fees plus any reserve-yield share.
  - The main risks are depeg and contract/admin-key risk, which the Drift drain shows is the largest real-world loss vector.
- An xStock/Mercury-dollar CLMM vault (Kamino-style) would expose retail to equity-gap IL, especially over weekends and at the Monday open. Prop AMMs and RFQ makers would also adversely select it whenever the oracle-led makers update faster than the pool.
- A JLP/HLP-style counterparty vault (users as the house against traders) is the highest-risk design and invites manipulation on thin markets. It should be avoided, or restricted to deep assets with OI caps.
- Marketing should show net-of-IL returns and a stress history, because JLP/HLP-style headline APRs hide trader-PnL and inventory beta.

### Gaps

- I found no empirical study of retail LP outcomes (net of LVR) on Orca, Raydium or Meteora.
- HLP and JLP historical APRs were not retrieved from primary sources.
- Kamino vault fee rates were not confirmed from Kamino docs.
- I found no data on how Kamino or Meteora xStock LP vaults performed through a weekend gap.

## 5. xStocks liquidity on Solana specifically (depth, providers, spreads, lending caps)

### Takeaway

On-chain pool depth for the top xStocks is small, about $0.5–4M of Jupiter-estimated pool liquidity per ticker. Metis price impact reaches 0.3–2% at $100k on AMMs. RFQ market makers through JupiterZ provide most of the real depth: indicative quotes at about 15–17 bps (including Jupiter's 10 bps fee) stayed flat up to $10M for SPYx, TSLAx and NVDAx at 02:00 ET on a weekday. Jupiter Lend sizes xStock borrow caps ($10M each) against that RFQ depth, which it puts at over $100M sell-side, and will cut caps if sell-side depth falls below $30M.

### Cited Findings

**Live snapshot (2026-10-21 05:59–06:10 UTC, about 02:00 ET Wednesday, overnight session)**

Token data from the [Jupiter Tokens API](https://lite-api.jup.ag/tokens/v2/search?query=TSLAx). Costs are relative to the $100 Metis price ([Jupiter Quote API](https://lite-api.jup.ag/swap/v1/quote); [Jupiter Ultra API](https://lite-api.jup.ag/ultra/v1/order)). Ultra figures include the 10 bps Ultra fee.

| Ticker | Solana mkt cap | Pool liquidity (Jupiter est.) | Holders | Buy $100k: Metis (AMMs) | Buy $250k: Metis        | Buy $250k: Ultra winner | Sell $1M/$5M/$10M: Ultra (JupiterZ) | $1k round trip (Metis) |
| ------ | -------------- | ----------------------------- | ------- | ----------------------- | ----------------------- | ----------------------- | ----------------------------------- | ---------------------- |
| SPYx   | $73.8M         | $4.19M                        | 80.7k   | 0.26%                   | 0.60%                   | JupiterZ 0.16%          | −0.17% / −0.17% / −0.17%            | 0.03%                  |
| QQQx   | $61.0M         | $1.84M                        | 37.8k   | 0.89%                   | 2.08%                   | JupiterZ 0.06%          | not tested                          | 0.22%                  |
| NVDAx  | $70.9M         | $3.49M                        | 181.4k  | 0.35%                   | 0.85%                   | JupiterZ 0.09%          | −0.15% / −0.15% / −0.15%            | 0.02%                  |
| TSLAx  | $87.1M         | $1.89M                        | 58.6k   | 0.77%                   | 2.14%                   | JupiterZ 0.13%          | −0.17% / −0.17% / −0.17%            | 0.09%                  |
| CRCLx  | $70.2M         | $2.07M                        | 19.3k   | 0.48%                   | 0.97%                   | OKX 0.43%               | −0.79% / −0.79% / −0.79%            | 0.21%                  |
| AAPLx  | $52.1M         | $0.55M                        | 41.2k   | 1.86%                   | 51.1% (pools exhausted) | JupiterZ 0.13%          | not tested                          | 0.24%                  |

- Venues seen in AMM routes:
  - CLMMs and order books: Raydium CLMM, Orca Whirlpool, Meteora DLMM, Manifest, Byreal, PancakeSwap;
  - prop AMMs: Hadron, Obsidian, GoonFi V2, Kipseli, TesseraV, BisonFi, ZeroFi, Riptide, AlphaQ.
  - So prop AMMs now quote xStocks as well as SOL and stables. — [Jupiter Quote API](https://lite-api.jup.ag/swap/v1/quote)

**Volume and venue share**

- Raydium routes 90%+ of Solana tokenized-stock DEX volume. Its Q3 2026 tokenized-stock volume was about $2.3B through Sep 18 (+40% QoQ). xStocks-issued volume on Solana passed $6B. — [Solana Compass](https://solanacompass.com/news/raydium-routes-90-of-solanas-tokenized-stock-dex-volume-with-5b-processed-as-september-sets-onchain-ath); [Solana Compass](https://solanacompass.com/news/xstocks-crosses-6-billion-in-solana-tokenized-stock-volume-as-raydium-q3-tops-23b)
- Raydium had a $160M single-day record on 2026-09-23 and $1.3B over the following 23 days, according to CoinPaprika citing an xStocks update. — [CoinPaprika](https://coinpaprika.com/education/tokenized-stocks-liquidity-on-chain/)
- xStocks volume routed through Jupiter was $55M in July, $61M in August and $218M in September 2026. — [Pine Analytics](https://pineanalytics.substack.com/p/jupiter-quarterly-report-q3-2026)
- Solana held 58.5% of xStocks' $858.1M of issued assets (xStocks disclosure via CoinPaprika). This conflicts with an October 2026 report of about $260M AUM. — [CoinPaprika](https://coinpaprika.com/education/tokenized-stocks-liquidity-on-chain/); [Solana Compass](https://solanacompass.com/learn/Lightspeed/solanas-next-big-catalyst-in-2026-lightspeed-weekly-roundup)
- On 2026-02-09 xStocks said that unnamed "trading desks" would deploy liquidity into the SPYx, QQQx, NVDAx, TSLAx and CRCLx pools, "more than tripling" liquidity, and pledged weekend depth. The announcement gave no figures and named no providers. — [xStocks news](https://xstocks.fi/us/news/upgrading-xstocks-markets-with-deeper-onchain-liquidity)
- An earlier report put Raydium CLMM pools at about $3M in CRCLx. — [Crypto Briefing](https://cryptobriefing.com/tokenized-circle-stock-defi-deposits/)
- No venue publishes depth bands for tokenized equities. — [CoinPaprika](https://coinpaprika.com/education/tokenized-stocks-liquidity-on-chain/)

**Off-hours behaviour**

- Jupiter's UI shows "RFQ" in place of a liquidity figure for RFQ-supplied stocks, and warns that quotes "may be less favorable" outside US hours. — [Jupiter docs: Discover](https://docs.jup.ag/user-docs/trade/spot/discover)
- Kraken: off-hours spreads are wider, the Monday mismatch has been under 1%, and makers use ATS venues, futures and internal models. — [Kraken support](https://support.kraken.com/articles/xstocks-faq)

**Lending caps sized against depth: Jupiter Lend's xStocks risk report (2026-04-15)**

- Liquidity is "entirely via RFQ", with "> $100M sell-side per asset at any time" and "effectively zero slippage". The caveat is that RFQ makers "may widen spreads significantly or temporarily withdraw quotes" in halts or stress. — [Jupiter Lend xStocks risk report](https://static-r2.jup.ag/lend/risk-research/xstocks-risk-report.pdf)
- Parameters:

  | Asset | LTV | Liquidation threshold | Penalty | Borrow cap |
  | ----- | --- | --------------------- | ------- | ---------- |
  | SPYx  | 75% | 85%                   | 5%      | $10M       |
  | QQQx  | 75% | 85%                   | 5%      | $10M       |
  | NVDAx | 65% | 75%                   | 7%      | $10M       |
  | TSLAx | 65% | 75%                   | 7%      | $10M       |

- Conditions:
  - NVDAx and TSLAx are paused from 2 days before to 1 day after earnings.
  - **"Quarterly review of RFQ market maker depth. If available sell-side liquidity falls below $30M for any asset, borrow cap should be reduced correspondingly."**
  - The $10M caps are described as within Lloyd's $175M aggregate cover. — [Jupiter Lend xStocks risk report](https://static-r2.jup.ag/lend/risk-research/xstocks-risk-report.pdf)
- Jupiter Lend's general limits:
  - Borrow ceilings expand by up to 25% (50% for some vaults) per 6 hours, from a base limit to a max. — [Jupiter docs: Liquidity layer](https://docs.jup.ag/user-docs/earn/lend/liquidity-layer-and-risk-management)
  - In the Bitwise x Ethena market, each vault's hard debt ceiling is "set at listing based on the available liquidatable liquidity in a single session". — [Jupiter docs: Markets](https://docs.jup.ag/user-docs/earn/lend/markets)
- Jupiter Lend's xStock vaults:
  - Priced off Chainlink Data Streams, which update 24/5 and freeze on weekends and holidays.
  - Pause for about 5 minutes at session transitions and for 24 hours before corporate actions; repay and add-collateral are blocked during pauses.
  - Block actions if the oracle is more than 10 minutes stale.
  - Jupiter warns of bad-debt risk from "low on-chain liquidity for the xStock". — [Jupiter docs: xStocks](https://docs.jup.ag/user-docs/earn/lend/borrow/xstocks)
- Q3 2026 Jupiter Lend liquidations totalled only $74k, against $16.1M in Q2. — [Pine Analytics](https://pineanalytics.substack.com/p/jupiter-quarterly-report-q3-2026)
- Kamino, September 2026:
  - xStocks market: $28.0M supply, $5.3M debt, 19% utilisation.
  - New Sentora xStocks market: $8.9M supply, $1.2M debt.
  - Kamino's cap methodology for xStocks against depth is not disclosed. — [Kamino Risk Insights Sep 2026](https://gov.kamino.finance/t/kamino-lend-monthly-risk-insights-september-2026/893)
- Kamino held 82.6% of Solana tokenized-stock lending as of August 2026, out of about $53M of collateral network-wide in late July (secondary). — [KuCoin flash](https://www.kucoin.com/news/flash/kamino-lend-controls-82-6-of-tokenized-stock-lending-on-solana)

### Inferences

- A Mercury user buying an xStock with $1k–$10k gets about 3–10 bps of AMM impact today. For $50k and above, RFQ is decisively better: about 10–15 bps including fees, against 0.3–2%.
- The "$100M+ RFQ" claim is consistent with my test of indicative quotes flat to $10M. But it is a maker promise, not on-chain collateral, and a real fill could not be tested without a taker.
- CRCLx is the clear exception. Its RFQ quotes are about 4–5× wider at $1M+ (−0.79% against −0.15–0.17%), so makers price single-name hedging costs and borrow availability differently by ticker.
- If Mercury lends against xStocks or prices its dollar's xStock pairs, it should copy the Jupiter rule:
  - size per-asset caps to a fraction (roughly one-third) of measured sell-side RFQ depth;
  - re-measure on a schedule, including weekends;
  - cut caps automatically when depth falls.
  - It should also run its own live quote probes like the ones above, rather than rely on issuer claims.
- A Mercury-dollar/xStock market would naturally be quoted by the same RFQ makers. Getting them to quote the Mercury dollar directly, rather than only USDC, needs either their willingness to hold Mercury-dollar inventory (par redemption makes this cheap) or Mercury converting to USDC internally.

### Gaps

- I did not measure depth on a weekend or US holiday, nor during the regular session. All measurements were taken at about 02:00 ET on a Wednesday.
- I did not test actual RFQ fill reliability or last-look rejection rates.
- I could not identify the makers behind the JupiterZ xStock quotes, the prop AMMs quoting xStocks, or the "trading desks" xStocks named in February.
- Kamino's cap-sizing method for xStocks is not public.
- I found no Kaiko, Galaxy or Blockworks report with tokenized-stock depth bands; CoinPaprika says such disclosure is rare.
- The xStocks AUM figures conflict ($260M against $858M issued), probably because of different definitions and dates.
