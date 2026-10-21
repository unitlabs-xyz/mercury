# Owning the Mercury dollar: routes to an app-branded USD stablecoin on Solana (as of 21 Oct 2026)

Note on method: on-chain facts (token program, Token-2022 extensions, supply) come from direct `getAccountInfo` calls to Solana mainnet RPC (api.mainnet-beta.solana.com, jsonParsed), run on 2026-10-21 at about 06:00 UTC. Each is cited with a Solscan link to the mint so it can be re-checked. Several web sources below are aggregators or vendor blogs; they are labelled "secondary" where it matters.

## 1. White-label and issuance-as-a-service providers (who issues, reserves, yield share, fees, mint/redeem, Solana and Token-2022)

### Takeaway

On Solana, a branded dollar can be launched today through five live routes: Bridge Open Issuance (CASH, OUSD), Paxos (USDG/GDN, PYUSD template), Anchorage Digital Bank (USDPT), Ethena Whitelabel (JupUSD), and Coinbase Custom Stablecoins (USDF, backed by USDC). M0 (KAST USDK, wM) and Agora (AUSD) are also on Solana but have smaller Solana footprints, and MetaMask's mUSD is still EVM-only. No provider publishes its fee schedule, minimums or standard reserve-income split. The regulated-issuer coins on Solana (CASH, USDG, PYUSD, AUSD, USDPT) are all Token-2022 mints with permanent delegate, confidential-transfer and transfer-hook extensions initialised. The issuer holds those authorities, not the brand.

### Cited Findings

**Bridge (Stripe), Open Issuance**

- Patrick Collison announced Open Issuance on 30 Sep 2025, offering "customizable smart contracts", issuance on any chain, reserve management, and "full control over mint and burn fees" — [Patrick Collison on X](https://x.com/patrickc/status/1973037097712791918); [Fortune, 1 Oct 2025](https://fortune.com/crypto/2025/10/01/stripe-crypto-stablecoins-open-issuance-bridge-blockchain-tempo/)
- Reserve partners named include BlackRock and Fidelity — [Ledger Insights](https://www.ledgerinsights.com/stripes-bridge-partners-with-blackrock-fidelity-for-stablecoin-issuance-platform/)
- Legal issuer: OUSD (and Bridge-issued coins generally) is "currently issued by Bridge Building Inc." (NMLS 2450917, operating under US state licences). Bridge National Trust Bank is "in organization", "does not currently issue OUSD", and is not operational. Its OCC conditional approval "does not authorize" it to issue under GENIUS. EEA services run through Bridge Building S.A. (Luxembourg), which the CSSF authorises as both a CASP (N00000012) and an EMI (W00000024) — [Bridge blog, 30 Sep 2026](https://bridge.xyz/blog/ousd-is-live-issued-by-bridge)
- The OCC conditionally approved Bridge National Trust Bank on 12 Feb 2026, and Bridge announced it on 17 Feb 2026. Final approval timing is undisclosed — [Fintech Futures](https://www.fintechfutures.com/blockchain-crypto-digital-assets/bridge-secures-conditional-occ-approval-for-national-trust-bank-charter); [Cointelegraph](https://cointelegraph.com/news/bridge-stripe-occ-approval-national-trust-bank)
- Mechanics (secondary guide dated 13 Sep 2026): onboarding goes through sales and is "not a Dashboard checkbox". Custom setup takes "as little as one day" if no new chain is needed. The brand chooses chains, name, ticker, logo, reserve mix, and open versus closed loop. Bridge mints 1:1 on deposit through its Orchestration rails, and "you do not self-mint", because Bridge operates mint and burn — [Stablecoin Insider](https://stablecoininsider.org/how-to-issue-a-branded-stablecoin-with-bridge-open-issuance/)
- Reserve economics (same secondary guide, 13 Sep 2026):
  - Treasury sleeve earns EFFR minus 20 bps and takes about 1 business day to liquidate.
  - Off-chain USD earns EFFR minus 200 bps. On-chain stablecoins held as reserves earn 0%, and cash generally earns nothing.
  - Bridge suggests starting with about 20% cash.
  - Illustrative effective yield at $100M: about 2.2% with a 50/50 cash/treasury split, about 3.3% with 10/90.
  - "Bridge shares the majority of treasury rewards with the issuer, minus issuance fees." Payouts arrive by the 5th business day of the following month, in tokens or fiat.
  - The reserve mix can be set through `POST /v0/issuance/reserves/liquidity_allocation`.
  - Source: [Stablecoin Insider](https://stablecoininsider.org/how-to-issue-a-branded-stablecoin-with-bridge-open-issuance/)
- Chains supported per that guide: Tempo, Base, Solana, Ethereum, Aptos, Sui, Polygon, Stellar, Arbitrum, Optimism, Linea, Monad, HyperEVM. Multi-chain deployments share one ticker and one reserve pool, with separate contracts — [Stablecoin Insider](https://stablecoininsider.org/how-to-issue-a-branded-stablecoin-with-bridge-open-issuance/)
- No official Bridge fee schedule is public. Pricing goes through sales@bridge.xyz. Integrator benchmarks of about 10 bps on orchestration are secondary estimates — [Stablecoin Insider review](https://stablecoininsider.org/bridge-review-2026-the-stablecoin-infrastructure-platform-powering-the-next-generation-of-digital-finance/); [Dollar Machines](https://dollarmachines.substack.com/p/stripe-paid-11b-for-bridge-here-is)
- OUSD: Bridge charges no mint or redeem fees and imposes no liquidity restrictions on minting or redeeming. Businesses joining Open Standard "can earn rewards on OUSD balances held at Bridge" by providing "qualifying services". No rate is published — [Bridge blog, 30 Sep 2026](https://bridge.xyz/blog/ousd-is-live-issued-by-bridge)
- On-chain, CASH on Solana is Token-2022 (`TokenzQd…`), with:
  - mintCloseAuthority and permanentDelegate
  - defaultAccountState = initialized (accounts are not frozen by default)
  - confidentialTransferMint configured (autoApproveNewAccounts=false, no auditor key)
  - transferHook extension present but with programId = null (no hook program set)
  - metadataPointer and tokenMetadata
  - Supply 127,840,836 at query time.
  - Source: [Solscan: CASH mint](https://solscan.io/token/CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH) (RPC query 2026-10-21)

**M0 (protocol plus app-branded "extensions")**

- Supply side: $M is minted by governance-permissioned "Minters", meaning financial institutions or other issuers that comply with local regulation. They post collateral, currently short-dated T-bill exposure, which validators verify. Minters pay a governance-set Minter Rate. Governance-approved "Earners" receive the Earner Rate, and any excess goes to a Distribution Vault/ZERO holders. Governance is the Two-Token (POWER/ZERO) system — [M0 FAQ](https://m0.org/faq); [Steakhouse M0 overview](https://steakhouse.financial/projects/m-0-overview); [M0 docs, M token](https://docs.m0.org/protocol/m-token)
- Under M0, the regulated issuer is not M0 itself. A secondary comparison says "the chosen issuer holds the licence". For mUSD the issuing partner is Bridge — [Upshift, 7 Oct 2026](https://www.upshift.finance/blog/stablecoin-issuance-platforms); [MetaMask support](https://support.metamask.io/manage-crypto/tokens/musd/)
- Extensions are branded tokens backed 1:1 by $M. Extension types include:
  - Treasury: 100% of yield to one address, non-rebasing.
  - User Yield: yield shared with holders, minus a fee.
  - Institutional: whitelists and custom fees.
  - Extensions must be governance-approved as Earners to accrue yield. A SwapFacility converts between extensions 1:1 with "no slippage or trading fees".
  - Source: [M0 docs, Extensions](https://docs.m0.org/protocol/extensions)
- Brand choices: permissionless or whitelisted holding; yield to treasury, split with distributors, or passed to holders through rebasing or claims; reward tiers; and a compliance module (Predicate on EVM) — [M0 docs, Stablecoin features](https://docs.m0.org/build/stablecoin-features)
- On Solana:
  - $M is a Token-2022 mint that is frozen by default (DefaultAccountState), and only approved earners are thawed, through a Merkle proof of the governance list.
  - The extension program offers NoYield (admin claims yield), ScaledUi (Token-2022 scaled-UI rebasing, with an optional `set_fee`) and Crank (an earn authority distributes yield; used by wM).
  - Wrapping is restricted to `wrap_authorities`.
  - Bridging uses M0 Portal (customised Wormhole NTT), with Ethereum as hub and Solana as spoke.
  - Sources: [M0 docs, Solana](https://docs.m0.org/protocol/solana); [GitHub solana-m-extensions](https://github.com/m0-foundation/solana-m-extensions)
- wM on Solana is Token-2022 with metadataPointer, transferHook (programId null), confidentialTransferMint and tokenMetadata. Supply was 2,360,905 — [Solscan: wM](https://solscan.io/token/mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp) (RPC 2026-10-21)
- The M0 dashboard showed about 34.03M mUSD and 36.26M wM circulating, about $17.3M of total rewards distributed across M0 stablecoins, and about $1.31M of that to MetaMask (undated snapshot, via search) — [M0 dashboard](https://dashboard.m0.org/)
- KAST was named the first M0 builder on Solana in Apr 2025, with two variants: savings (USDKy) and payments (USDK) — [Blockworks](https://blockworks.com/news/stablecoin-infrastructure-platform-solana); [KAST press release](https://www.kast.xyz/en/newsroom/press-releases/kast-strengthens-its-banking-alternative-platform-with-its-own-stablecoins)

**Paxos (USDG / Global Dollar Network; PYUSD as white-label precedent)**

- USDG is issued by Paxos Digital Singapore Pte. Ltd., an MAS-supervised Major Payments Institution, and by Paxos Issuance Europe, which is FIN-FSA supervised and MiCA-compliant. Partners "receive up to 100% of the returns generated by assets backing USDG held on your platform". They earn for minting (growing supply), holding (balances) and accepting (inbound deposits and payments). No rate, minimum or formula is published — [Global Dollar Network](https://globaldollar.com/)
- A December 2025 GDN statement is reported to say more than 90% of earnings were distributed to partners (secondary). One secondary source flags the risk that GDN can change reward parameters or partner share by contract — [Datawallet](https://www.datawallet.com/crypto/usdg-explained); [Eco](https://eco.com/support/en/articles/11753007-what-is-usdg-paxos-global-dollar-stablecoin-explained)
- GDN has more than 150 partners, including Robinhood, Kraken, Mastercard and OKX. USDG supply was about $3.17B on 5 Oct 2026 per CoinGecko (secondary summary) — [Yahoo/PR on GDN growth](https://finance.yahoo.com/news/global-dollar-network-grows-more-140500173.html)
- USDG reached Solana in Feb 2025, with institutional access through Anchorage and Kraken — [Global Dollar newsroom](https://globaldollar.com/newsroom/global-dollar-usdg-stablecoin-now-available-on-solana-blockchain)
- USDG on Solana is Token-2022 with:
  - mintCloseAuthority and permanentDelegate
  - transferFeeConfig at 0 bps
  - confidentialTransferMint and confidentialTransferFeeConfig
  - transferHook (programId null), metadataPointer and tokenMetadata
  - Freeze authority and permanent delegate share one address, also used on PYUSD.
  - Supply 645,230,982.
  - Source: [Solscan: USDG](https://solscan.io/token/2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH) (RPC 2026-10-21)
- PYUSD on Solana uses the same extension template (permanentDelegate, 0-bps transfer fee, confidential transfer and CT fee configs, null transfer hook, metadata). Supply was 681,979,054 — [Solscan: PYUSD](https://solscan.io/token/2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo) (RPC 2026-10-21)
- The OCC conditionally approved Paxos Trust Company's conversion to a national trust bank on 12 Dec 2025. Paxos says the conversion completed, but independent reporting (Aug–Oct 2026) says it is still awaiting final charter or opening. Conditions: capital in place within 12 months and opening within 18 months — [Paxos newsroom](https://www.paxos.com/newsroom/occ-approves-paxos-application-to-convert-to-occ-trust-paxos-to-complete-conversion-imminently-to-become-a-federally-regulated-blockchain-infrastructure-provider); [The Industry Spread](https://theindustryspread.com/occ-five-crypto-trust-charters-two-opened/)

**Agora (AUSD)**

- AUSD is issued by Agora Bermuda Limited (BMA Class F licence). VanEck manages reserves, State Street custodies them, and Grant Thornton audits and attests. Reserves are short-term Treasuries, overnight repo and other liquid assets. There is "no basis point fee on redemptions". Partners "share in the economics" but no split is published. Agora offers a white-label route ("Launch your own branded stablecoin on AUSD") — [Agora white-label page](https://www.agora.finance/product/white-label)
- Agora's national trust bank received preliminary conditional OCC approval on 18 Sep 2026 (secondary) — [Upshift](https://www.upshift.finance/blog/stablecoin-issuance-platforms)
- AUSD on Solana is Token-2022 with:
  - mintCloseAuthority and permanentDelegate
  - transferFeeConfig at 0 bps (max fee 1,000,000 base units)
  - confidentialTransferMint and confidentialTransferFeeConfig
  - transferHook (programId null), metadata
  - Solana supply was only 3,288,181.
  - Source: [Solscan: AUSD](https://solscan.io/token/AUSD1jCcCyPLybk1YnvPWsHQSrZ46dxwoMniN4N2UEB9) (RPC 2026-10-21)
- AUSD runs on about 13 networks, raised a $50M Series A led by Paradigm (2025), and added LayerZero AUSD0 (Nov 2025) — [Fintech Futures](https://www.fintechfutures.com/venture-capital-funding/agora-raises-50m-series-a-debuts-white-label-stablecoin-product); [BC Technology](https://www.bctechnology.com/news/2025/11/3/Agora-Partners-with-LayerZero-to-Make-AUSD-Stablecoin-Compatible-with-All-Blockchains.cfm)

**Anchorage Digital Bank (federally chartered issuer for brands)**

- Anchorage issues USAT (Tether's US coin), USDPT (Western Union) and USDGO. Terms are set per deal and not published (secondary) — [Upshift](https://www.upshift.finance/blog/stablecoin-issuance-platforms)
- Western Union USDPT launched on Solana on 4 May 2026. Anchorage Digital Bank N.A. handles mint, redeem and reserves, and Fireblocks provides wallets — [Decrypt](https://decrypt.co/366677/western-union-usdpt-stablecoin-solana-anchorage-digital); [CoinDesk, 5 May 2026](https://www.coindesk.com/business/2026/05/05/western-union-s-solana-based-stablecoin-could-reshape-its-payment-model-analyst-says)
- USDPT on Solana is Token-2022 with:
  - permanentDelegate and transferFeeConfig at 0 bps
  - confidentialTransferMint and CT fee config
  - transferHook (programId null), mintCloseAuthority
  - pausableConfig (paused=false), defaultAccountState=initialized, metadata
  - Supply 18,676,592.
  - Source: [Solscan: USDPT](https://solscan.io/token/HVWf8JmLoHs99Lw8Psf3fyqAtA4crWxCPkrmSdNjhNH3) (RPC 2026-10-21)
- Anchorage became the US issuer of Ethena's USDtb, with a transition dated 27 Oct 2025 (secondary) — [CoinDesk, 24 Jul 2025](https://www.coindesk.com/business/2025/07/24/ethena-taps-anchorage-to-issue-usd1-5b-usdtb-stablecoin-in-u-s-under-genius-act)

**Ethena Whitelabel (stablecoin-as-a-service)**

- Partners design and distribute the coin. Ethena runs issuance, backing operations, custody, reserve management and integrations. Backing can be USDe, USDtb (issued by Anchorage Digital Bank, backed by fiat and BlackRock BUIDL) or "other approved stablecoins", and the mix can be adjusted dynamically. Partners "capture the economics", with no terms published.
- Live programmes: jupUSD (Solana), USDm (MegaETH), suiUSDe (Sui).
- Source: [Ethena docs, Whitelabel](https://docs.ethena.fi/overview/ethena-whitelabel)
- ether.fi USD was announced on 6 Oct 2026, with Ethena running reserves, mint/redeem and compliance — [Unchained](https://unchainedcrypto.com/ether-fi-is-launching-its-own-stablecoin-with-ethena-running-the-reserves/)

**Coinbase Custom Stablecoins (USDC-backed white-label)**

- Coinbase introduced the product in Dec 2025. Flipcash's USDF went live on Solana on 20 May 2026, "fully backed by USDC". Coinbase handles issuance, backing, settlement and onramps. Tokens are redeemable 1:1 with USDC. Flipcash cited "USDC rewards that scale with circulating supply" and Coinbase Onramp — [Coinbase blog](https://www.coinbase.com/blog/coinbase-powers-usdf-flipcashs-custom-stablecoin); [Cryptonomist, 20 May 2026](https://en.cryptonomist.ch/2026/05/20/coinbase-custom-stablecoin-usdf-flipcash/)

**Brale**

- Brale positions itself as issuer of record for client-branded coins, claims more than 100 programmes and over $10B of cumulative mint/burn (self-reported), and offers a reserve revenue share. Its own blog table leaves Solana support blank — [Brale blog](https://brale.xyz/blog/stablecoin-token-standards-on-leading-blockchains); [Upshift](https://www.upshift.finance/blog/stablecoin-issuance-platforms)
- RWA.xyz lists Brale-issued SBC as Token-2022, about 2.01M supply, redeemable 1:1 — [RWA.xyz SBC](https://app.rwa.xyz/assets/SBC)

**Sky, Frax and Circle**

- Sky: USDS on Solana is a classic SPL mint (`Tokenkeg…`) with supply 4,670,312 — [Solscan: USDS](https://solscan.io/token/USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA) (RPC 2026-10-21). One secondary source says sUSDS is Ethereum-only as of Apr 2026 — [Eco, sUSDS](https://eco.com/support/en/articles/14798655-susds-explained-sky-s-savings-rate-token)
- Sky's Solana "Star", Keel, launched in Sep 2025 with a roadmap of up to $2.5B in USDS deployment into Solana DeFi (Kamino, Jupiter, Raydium) — [Ventureburn](https://ventureburn.com/keel-debuts-solana-defi-rwa-roadmap/)
- Frax: its USDH bid offered native issuance against frxUSD, with interest available for buybacks, rebates or holder rewards and no percentage committed. No Solana white-label product was found — [DL News, 8 Sep 2025](https://www.dlnews.com/articles/defi/paxos-frax-agora-and-native-markets-compete-to-build-usdh-stablecoin/)
- Circle: no white-label programme found. Circle disclosed on 16 Oct 2026 that about $819M of about $1.4B H1-2026 revenue (about 59%) went to distribution partners and transaction costs. It counts more than 150 partners, with Coinbase the largest, and keeps about 7 cents of net profit per revenue dollar — [Crypto Briefing](https://cryptobriefing.com/circle-pays-819-million-usdc-partners/); [Unchained](https://unchainedcrypto.com/circle-says-59-cents-of-each-revenue-dollar-went-to-usdc-partners-and-transaction-costs/)
- USDC on Solana is classic SPL with mint and freeze authority only — [Solscan: USDC](https://solscan.io/token/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v) (RPC 2026-10-21)
- None of the eight major issuance platforms publishes fees, minimums or a standard reserve split. Only Bridge publishes a launch timeline — [Upshift, 7 Oct 2026](https://www.upshift.finance/blog/stablecoin-issuance-platforms)

### Inferences

- Token-2022 control: in every Token-2022 issuer-run mint inspected (CASH, USDG, PYUSD, AUSD, USDPT), confidential transfers are already initialised, but with `autoApproveNewAccounts=false` and no auditor key. The CT authority, which is the issuer's key, must therefore approve each account before it can use confidential balances. A Mercury dollar issued by Bridge, Paxos, Anchorage or Agora could likely ship with CT enabled. Mercury would probably not control the CT, permanent-delegate, freeze or hook authorities unless contractually negotiated, and no provider documents that option.
- Transfer hooks: the `transferHook` extension is present but unset (programId null) on all these mints. Hooks can probably be added later by whoever holds the hook authority without migrating the mint. This is a lever for Mercury-controlled logic such as geofencing, only if the issuer delegates it.
- JupUSD (via Ethena) is the outlier. It chose a classic SPL mint, which suggests DeFi composability won over Token-2022 features for that brand.
- Rough economics: Bridge's quoted reserve rates imply about 3.3% gross on a 10/90 cash/treasury mix, against about 2.2% on 50/50. Mercury therefore earns roughly $33k a year per $1M of float, before Bridge's undisclosed issuance fee. The cash buffer needed for instant redemptions is the main drag on yield. This is a back-of-envelope figure from a secondary source's rates, not a quote.
- Fit for Mercury's non-US user base: USDG has MAS and MiCA issuers. Bridge has a CSSF EMI. Agora is Bermuda-based. Anchorage, and Bridge for US issuance, are US-regulated, which brings GENIUS yield rules into play at the issuer level (see section 3).

### Gaps

- Actual Bridge issuance fee, Paxos/GDN partner split and minimums, Agora/Anchorage/Ethena/Brale/Coinbase revenue splits: none are published. All require sales conversations.
- Whether a brand can hold or co-hold Token-2022 authorities (CT auditor key, transfer hook program, permanent delegate) under any provider. This is not documented anywhere I found.
- Whether Bridge Open Issuance coins sold to EU users are issued from Bridge Building S.A. (Lux EMI) as MiCA EMTs, or only from the US entity. Not stated.
- No 2026 primary data on M0's earner rate, minter rate or protocol fee on Solana.
- Brale's issuing licences and live Solana programmes beyond SBC could not be verified from primary sources.
- mUSD on Solana: MetaMask's support page lists Ethereum, Linea and Monad only, so mUSD appears EVM-only as of Oct 2026. Not confirmed with M0.

## 2. Precedents and outcomes (supply, how users get rewards, distribution deals, failures)

### Takeaway

Owning the coin has not, by itself, produced scale. Wallet- and app-branded dollars on Solana sit in the tens of millions (JupUSD about $43M, mUSD about $34M across chains, USDPT about $19M), with Phantom CASH the exception at about $128M after a year. The coins that did scale (USDG, PYUSD, USD1) came with exchange and payments distribution. Hyperliquid's USDH, the most contested issuer award, stalled near $100M against about $5B of USDC on the same venue, and was sunset in May 2026 with its brand assets sold to Coinbase.

### Cited Findings

- **Phantom CASH (Bridge):**
  - Launched about 30 Sep 2025 on Solana as the first Open Issuance coin. Bridge handles issuance and reserves, and Phantom handles adoption — [Crypto.news](https://crypto.news/phantom-launches-new-stablecoin-cash-on-solana/); [Yahoo Finance](https://finance.yahoo.com/news/phantom-wallet-launches-cash-adds-183013741.html)
  - 127.84M in circulation on 21 Oct 2026. Reserves were $117.96M (92.3%) in Treasuries/MMFs and $9.88M (7.7%) cash, stated as 100.49% collateralised. Line items do not fully reconcile with the stated total. Chains: Solana and HyperEVM — [Bridge reserves: CASH](https://reserves.bridge.xyz/cash)
  - CASH is open-loop with multiple distribution partners, "each earn[ing] on the reserves for supply they originate". Phantom uses per-partner mint data for monthly reward distribution (search-snippet attribution; not independently confirmed) — [Stripe customer story: Phantom](https://stripe.com/es-us/customers/phantom-spotlight)
  - Phantom has pointed users to Kamino for yield, where DeFiLlama lists CASH lending markets at about 3–7.6% — [DeFiLlama CASH](https://defillama.com/rwa/asset/cash-phantom)
- **MetaMask mUSD (Bridge + M0):**
  - Supply about 34M (M0 dashboard; CoinMarketCap showed about 15.8M at a different time) — [M0 dashboard](https://dashboard.m0.org/); [CoinMarketCap](https://coinmarketcap.com/currencies/metamask-usd/)
  - User rewards come through:
    - a Money Account paying "daily APY" (powered by MetaMask and Monad), in eligible regions only;
    - 1% or 3% mUSD cashback on the MetaMask Card;
    - Aave lending, which returns amUSD.
    - No Solana support is listed.
    - Source: [MetaMask support](https://support.metamask.io/manage-crypto/tokens/musd/)
  - A secondary source says the up-to-4% Money Account APY comes from Morpho vaults rather than reserves — [Spotedcrypto](https://www.spotedcrypto.com/metamask-money-account-musd-morpho-yield-2026/)
- **Jupiter JupUSD (Ethena) and JUICED:**
  - Announced Oct 2025, live around Jan 2026. Reserves were about 90% USDtb and 10% USDC, held in an Anchorage Porto wallet — [Blockworks](https://blockworks.com/news/jupiter-jupusd-stablecoin); [Jupiter docs](https://developers.jup.ag/docs/jupusd/juiced)
  - About $51M on 12 Jun 2026 (secondary). On-chain supply was 42,919,163 on 21 Oct 2026, on a classic SPL mint — [Stabledash](https://stabledash.com/news/2026-01-05-jupiter-launches-jupusd-stablecoin-on-solana-backed-by-blackrocks-buidl-fund-via-ethena-labs); [Solscan: JupUSD](https://solscan.io/token/JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD)
  - JupUSD itself does not bear yield. JUICED is a Jupiter Lend Earn vault-share token. Its yield combines JupUSD borrow interest with reserve T-bill yield routed "through Jupiter's rewards distributor". Per-unit T-bill yield dilutes if JUICED supply exceeds minted JupUSD. Withdrawals are instant under normal conditions but governed by an automated debt ceiling — [Jupiter docs, JUICED](https://developers.jup.ag/docs/jupusd/juiced)
  - JUICED supply on-chain was 45,431,630. The mint reports 6 decimals, whereas the docs say 9 — [Solscan: JUICED](https://solscan.io/token/7GxATsNMnaC88vdwd2t3mwrFuQwwGvmYPrUQ4D6FotXk)
- **Hyperliquid USDH (Sep 2025 contest):**
  - Contest opened 5 Sep 2025. Bidders: Paxos, Sky, Frax, Agora, Curve, OpenEden, BitGo, Ethena (Ethena withdrew and endorsed Native Markets). Validators chose Native Markets on 14 Sep 2025 — [Cointelegraph](https://cointelegraph.com/news/hyperliquid-stablecoin-goes-live-after-fierce-bidding-issuance-rights); [The Block](https://www.theblock.co/post/370570/native-markets-team-wins-hyperliquid-usdh-stablecoin-bid-eyes-test-phase-within-days)
  - Bid terms:
    - Paxos: 95% of reserve interest to HYPE buybacks; a revised bid added PayPal/Venmo and $20M of incentives.
    - Ethena: USDtb backing, 95% of revenue.
    - Agora: 100% of net reserve revenue.
    - Native Markets: 50% to buybacks and 50% to growth, with BlackRock off-chain and Superstate on-chain via Bridge.
    - Sources: [DL News, 8 Sep 2025](https://www.dlnews.com/articles/defi/paxos-frax-agora-and-native-markets-compete-to-build-usdh-stablecoin/); [Cointelegraph](https://cointelegraph.com/news/hyperliquid-usdh-bidding-ethena-enters-contender)
  - Launch minting was capped at $800 per user — [Cointelegraph](https://cointelegraph.com/news/hyperliquid-stablecoin-goes-live-after-fierce-bidding-issuance-rights)
  - About $83M by Feb 2026, and the cap was raised to $500M in Mar 2026 — [4pillars](https://research.4pillars.io/en/data/content/usdh-hit-83m-in-5-months-deployed-by-native-markets-the-fastest-growing-nati)
  - On 14 May 2026, Coinbase became Hyperliquid's official USDC treasury deployer and agreed to buy the USDH brand assets. USDH is being sunset with feeless redemption to USDC or fiat. Supply had stalled around $100M against about $5B of USDC on Hyperliquid — [The Block](https://www.theblock.co/post/401233/coinbase-hyperliquid-official-deployer-usdc); [Unchained](https://unchainedcrypto.com/coinbase-becomes-hyperliquids-official-usdc-treasury-deployer-as-usdh-sunsets/)
- **USDG partners:**
  - Kraken pays USDG "rewards" (not interest): up to 5% a year as of Oct 2025, with a Kraken+ boost at $4.99/month. The current Kraken page shows 2% APY. Rates are "determined and paid out by Kraken in its sole discretion" — [GDN newsroom: Kraken](https://globaldollar.com/newsroom/kraken-usdg); [Kraken blog](https://blog.kraken.com/news/earn-usdg-rewards); [Kraken USDG page](https://www.kraken.com/features/auto-earn/usdg)
  - Robinhood: a Steakhouse USDG vault behind Robinhood Earn was reported at about $417M by 31 Aug (secondary, unverified) — [Web3wagmi](https://blog.web3wagmi.com/usdg-guide)
- **World Liberty USD1:**
  - Issued by BitGo Trust Company. WLFI filed for its own national trust charter in H1 2026 — [Upshift](https://www.upshift.finance/blog/what-is-usd1); [WLFI on X](https://x.com/worldlibertyfi/status/2078143097087603161)
  - Total supply fell about 9%, from $4.43B (6 Oct) to about $4.02B (19 Oct 2026). Solana supply held flat near $1.4B — [CoinReporter, Oct 2026](https://www.coinreporter.io/2026/10/world-liberty-financials-usd1-stablecoin-sheds-over-400-million-in-market-cap-amid-redemptions/)
  - On-chain Solana supply was 1,398,206,810 on a classic SPL mint — [Solscan: USD1](https://solscan.io/token/USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB)
- **PayPal PYUSD (Paxos white-label):** Solana supply was 681,979,054 on 21 Oct 2026 (Token-2022) — [Solscan: PYUSD](https://solscan.io/token/2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo)
- **Open USD (OUSD), Bridge:**
  - Launched 30 Sep 2026 on Base, Ethereum, Solana and Tempo by Open Standard (founded by Coinbase, Mastercard, Shopify, Stripe and Visa; more than 200 partners). "Almost all" reserve yield goes to distributors pro rata to the OUSD they put into circulation, with partners also eligible for equity. Reserves sit at BlackRock, BNY and Lead Bank, with monthly attestations — [Yahoo Finance, 30 Sep 2026](https://finance.yahoo.com/markets/crypto/articles/stripes-bridge-launches-ousd-stablecoin-174557737.html); [Bridge blog](https://bridge.xyz/blog/ousd-is-live-issued-by-bridge)
  - Early Solana supply was about 18.0M across 47 wallets (secondary) — [Solana Compass](https://solanacompass.com/news/open-standards-ousd-stablecoin-goes-live-on-solana-with-free-11-minting-for-businesses)
- **Western Union USDPT (Anchorage):** Solana supply 18.68M (21 Oct 2026). A Stablecard wallet and card reportedly launched in 37 markets on 4 Aug 2026 (secondary) — [Solscan: USDPT](https://solscan.io/token/HVWf8JmLoHs99Lw8Psf3fyqAtA4crWxCPkrmSdNjhNH3); [Eco](https://eco.com/support/en/articles/15351453-what-is-usdpt-western-union-s-solana-native-stablecoin-explained)
- **Impersonation noise:** Jupiter's token search for "OUSD" and "USDF" returns many unverified pump.fun tokens with the same tickers, some with large reported market caps. Jupiter API queried 2026-10-21 — [Jupiter token API](https://lite-api.jup.ag/tokens/v2/search?query=USDF)

### Inferences

- Distribution beats ownership. USDH lost to incumbent USDC on its own venue despite the best economics on offer. CASH, the best-performing wallet coin, still sits at about 1–2% of USDG or PYUSD Solana supply. Mercury's float, not the brand, will set the revenue.
- The open-loop "distributor earns on what it originates" model (CASH, OUSD, GDN) means a Mercury dollar could earn on supply Mercury mints even after it leaves Mercury's app. Holding someone else's coin (for example, USDG) earns only on balances Mercury can show it custodies or circulates, per GDN's mint/hold/accept categories.
- Every surveyed brand that shares yield with users does it through a separate wrapper or venue (JUICED, Aave amUSD, MetaMask Money Account, Kamino) or through discretionary platform "rewards" (Kraken). None makes the base token itself pay holders.

### Gaps

- Phantom's actual user-facing reward (if any) on plain CASH balances: no official rate found.
- Current mUSD Solana status and current OUSD Solana supply: no primary figure found.
- PYUSD's current rewards programme and its non-US eligibility were not found.
- USD1's reward or points programmes, and the claim that the issuer change "is being argued in court", could not be verified.

## 3. How brands pass yield to users without paying "interest"; legal treatment for non-US and EU users; brand licensing

### Takeaway

The observed toolkit has three parts. First, the issuer shares reserve income with the brand as a B2B partner payment. Second, the brand funds discretionary "rewards", loyalty, cashback or activity incentives. Third, users opt into a separate savings or lending wrapper. In the US, the OCC (Mar 2026) and Fed (Sep 2026) GENIUS proposals allow issuer–white-label profit sharing. Both, however, presume a violation when a related third party (expressly including the white-label brand) pays yield to holders of that brand's coin. In the EU, MiCA Article 50 bars interest-equivalent benefits from both issuers and CASPs. EU supervisors' Sept 2026 review responses push to keep or widen that ban.

### Cited Findings

- **OCC GENIUS NPRM** (Federal Register 2 Mar 2026; comments closed 1 May 2026):
  - Proposed §15.10(c)(4) restates the §4(a)(11) ban.
  - It adds a rebuttable presumption of violation where the issuer has an arrangement with an affiliate or "related third party" to pay interest or yield. Related third parties include exchanges or wallets offering yield "as a service", and any person "on whose behalf" or under whose brand the issuer issues (white-label or co-brand partners).
  - Profit-sharing with a non-affiliate white-label partner is not itself prohibited. Commentary says those profits "likely cannot be passed on" to holders.
  - Independent merchant discounts are permitted.
  - The ban applies to OCC-registered foreign issuers too.
  - Source: [Ashurst Perkins Coie, 4 Mar 2026](https://www.ashurstperkinscoie.com/en/insights/stablecoin-interest-yield-and-rewards-occ-proposes-sweeping-regulations-under-the-genius-act/)
- **Federal Reserve GENIUS NPRM** (approved 24 Sep 2026, published 29 Sep 2026; comments close 30 Nov 2026):
  - Mirrors the OCC presumption, scoped to holders of the related third party's white-labelled coin.
  - States the ban "is not intended to prevent" profit-sharing with a non-affiliate white-label partner.
  - Asks (Q45) whether issuers should be limited to a single brand, citing reserve-uncertainty and cross-brand run risk.
  - Asks about de minimis exceptions and safe harbours (Q36–38) and the treatment of distributor-paid rewards.
  - Sources: [Federal Register 2026-19860](https://www.federalregister.gov/documents/2026/09/29/2026-19860/implementing-the-federal-reserve-boards-responsibilities-under-the-genius-act); [J. Ross analysis](https://jcsross.substack.com/p/the-federal-reserves-genius-act-proposal)
- Treasury published a GENIUS NPRM on payment stablecoin issuance, offer and sale on 18 Aug 2026 — [Federal Register 2026-16796](https://www.federalregister.gov/documents/2026/08/18/2026-16796/genius-act-regulations-on-payment-stablecoin-issuance-offer-and-sale)
- GENIUS takes effect on the earlier of 18 Jan 2027 or 120 days after final rules. No final OCC rule existed as of Oct 2026 — [Upshift](https://www.upshift.finance/blog/stablecoin-issuance-platforms)
- From the effective date, foreign-issuer coins that do not meet the Act are restricted for US-facing service providers — [J. Ross analysis](https://jcsross.substack.com/p/the-federal-reserves-genius-act-proposal)
- Commentary on OUSD notes that its rewards model "lives in the gap between 'yield' and 'rewards'" and that banks are lobbying to close it — [Dollar Machines](https://dollarmachines.substack.com/p/stripe-paid-11b-for-bridge-here-is)
- **MiCA Article 48:**
  - Only credit institutions or EMIs that have notified and published a white paper may offer an EMT to the public.
  - Other persons may offer an EMT, or seek its admission to trading, with the issuer's written consent, and must then comply with Articles 50 and 53.
  - Issuers must notify the competent authority at least 40 working days before offering.
  - Source: [MiCA Art. 48 text](https://satoshishrine.com/celex/32023R1114/ART_48/20260823-32c6d21e)
- **MiCA Article 50 and the 2026 review:**
  - The Commission's 2026 review consultation describes the ban as covering interest and any interest-equivalent remuneration on EMTs (Art. 50) and ARTs (Art. 40) — [EC MiCA review consultation](https://finance.ec.europa.eu/document/download/62be7015-f066-4fac-b74e-71bacdbcc9f5_en?filename=2026-mica-review-targeted-consultation-document_en.pdf)
  - The EBA (Sep 2026) wants the ban kept and flags EMT lending as an arbitrage risk — [EBA response](https://www.eba.europa.eu/sites/default/files/2026-09/12cb4f01-0d51-46bf-a561-165ac486698f/EBA%20response%20to%20EC%20targeted%20consultation%20on%20MiCA%20review.pdf)
  - The ESCB wants the ban extended to crypto lending, borrowing and staking that replicate interest — [MiCA Crypto Alliance summary](https://www.micacryptoalliance.com/news/europes-central-banks-tell-brussels-to-widen-the-stablecoin-interest-ban-and-close-the-defi-gap)
  - ESMA's response of 30 Sep 2026 focuses on lending and staking rules and on CASPs servicing unauthorised stablecoins — [ESMA response](https://www.esma.europa.eu/sites/default/files/2026-09/ESMA75-113276571-1721_Response_to_the_EC_consultation_MiCA_regulation_review.pdf)
- **Structures in market:**
  - Partner-level reserve payouts: GDN "up to 100%" for mint, hold and accept ([GDN](https://globaldollar.com/)); OUSD "almost all" to distributors by circulation ([Yahoo Finance](https://finance.yahoo.com/markets/crypto/articles/stripes-bridge-launches-ousd-stablecoin-174557737.html)); Coinbase USDF "USDC rewards that scale with circulating supply" ([Coinbase blog](https://www.coinbase.com/blog/coinbase-powers-usdf-flipcashs-custom-stablecoin)).
  - Platform-discretion "rewards": Kraken USDG rewards at "sole discretion", with a subscription boost — [Kraken blog](https://blog.kraken.com/news/earn-usdg-rewards)
  - Spend cashback in the token: MetaMask Card 1%/3% in mUSD — [MetaMask support](https://support.metamask.io/manage-crypto/tokens/musd/)
  - Opt-in savings or lending wrappers: JUICED vault share ([Jupiter docs](https://developers.jup.ag/docs/jupusd/juiced)); MetaMask Money Account and Aave amUSD in eligible regions ([MetaMask support](https://support.metamask.io/manage-crypto/tokens/musd/)).
- **Kraken disclosure:** Kraken's USDG reward page does not state jurisdictional eligibility. It notes the coin's MAS and MiCA issuers, which describes the issuer, not who may receive rewards — [GDN newsroom: Kraken](https://globaldollar.com/newsroom/kraken-usdg)

### Inferences

- If Mercury's dollar is issued by a US entity (Bridge Building Inc., Anchorage, Paxos Trust), the OCC/Fed proposals would make Mercury a "related third party". Any Mercury-paid holder yield on that coin would be presumptively attributable to the issuer, wherever the holders live, because the rule targets the issuer's arrangements. Neither proposal reviewed carves out non-US holders. A non-US issuer entity (Paxos Digital Singapore, Agora Bermuda, Bridge Building S.A.) may matter for structuring, which counsel would need to assess.
- For EU users, Mercury offering a branded EMT appears to need the EU issuer's written consent and Art. 50 compliance. Whether a self-custodial app (Privy embedded wallets) is a CASP depends on the services it provides. No source reviewed addresses this for a white-label brand.
- The market-standard pattern for non-US consumer apps is: B2B reserve share to the app, then the app pays a discretionary, revocable "reward" or loyalty incentive, or offers an opt-in wrapper. That pattern is exactly what both US proposals and the EU review are scrutinising.

### Gaps

- No law-firm memo found that specifically analyses a white-label brand's liability or licensing (MSB, VASP or CASP) for paying rewards on its own branded coin to non-US users.
- Treasury's Aug 2026 NPRM content (foreign-issuer comparability, offer and sale to US persons) could not be fetched; the Federal Register redirected.
- No ESMA or EBA Q&A was found on whether wallet-provider or brand "rewards" on EMTs are an Art. 50 interest-equivalent when the brand is not a CASP.
- CLARITY Act activity-based reward carve-out status: excluded by the brief, as the earlier report covered it.

## 4. Operational realities: attestation, depeg and redemption risk, bank partner risk, launch liquidity, switching issuers

### Takeaway

The main risks of a branded dollar sit with the issuer and the brand–issuer contract, not the code: reserve bank concentration (SVB 2023), issuer key and ops errors (Paxos's $300T mint), regulator action against the issuer (BUSD 2023), and the brand being wound down (USDH 2026). Switching issuers has worked only where the token contract stayed put and the issuer was replaced underneath it (USDtb to Anchorage). Otherwise it means a redemption-and-swap migration into another coin.

### Cited Findings

- **SVB, Mar 2023:** Circle disclosed late on 10 Mar 2023 that about $3.3B of about $40B (about 8%) of USDC reserves sat at SVB. USDC traded at about $0.86–0.87. Binance and Coinbase paused conversions. The peg returned after regulators' announcement at 6:15 pm ET on 12 Mar 2023 — [Federal Reserve FEDS Note, 17 Dec 2025](https://www.federalreserve.gov/econres/notes/feds-notes/in-the-shadow-of-bank-run-lessons-from-the-silicon-valley-bank-failure-and-its-impact-on-stablecoins-20251217.html); [CNBC](https://www.cnbc.com/amp/2023/03/11/stablecoin-usdc-breaks-dollar-peg-after-firm-reveals-it-has-3point3-billion-in-svb-exposure.html)
- **BUSD:** NYDFS ordered Paxos to stop minting BUSD effective 21 Feb 2023, citing unresolved issues with Paxos's oversight of Binance. Paxos ended the Binance relationship and kept redemptions open through at least Feb 2024 — [NYDFS notice](https://www.dfs.ny.gov/consumers/alerts/paxos_and_binance); [Blockworks](https://blockworks.com/news/paxos-to-cease-minting-new-busd-and-end-relationship-with-binance)
- **Paxos mint error:** on 15 Oct 2025 Paxos accidentally minted $300T of PYUSD on Ethereum and burned it within about 30 minutes. Aave temporarily froze PYUSD markets — [The Block](https://www.theblock.co/post/374870/paxos-mistakenly-mints-300-trillion)
- **USDH wind-down** (May 2026): markets stayed operational during migration, with feeless redemption to USDC or fiat. Coinbase bought only the brand assets. Hyperion unwound $29M of related deals by June 2026 — [The Block](https://www.theblock.co/post/401233/coinbase-hyperliquid-official-deployer-usdc); [Santelog/Hyperion release](https://www.santelog.com/actualites-sante-nasdaq/hyperion-defi-reiterates-guidance-sunset-usdh-and-felix-markets)
- **Issuer swap without a new token:** USDtb's US issuance moved to Anchorage Digital Bank (transition reported 27 Oct 2025) — [CoinDesk](https://www.coindesk.com/business/2025/07/24/ethena-taps-anchorage-to-issue-usd1-5b-usdtb-stablecoin-in-u-s-under-genius-act)
- **Backing flexibility:** Ethena Whitelabel lets partners change backing composition dynamically, mixing USDe, USDtb and USDC — [Ethena docs](https://docs.ethena.fi/overview/ethena-whitelabel)
- **Launch liquidity and redemption buffers:** Bridge suggests about 20% cash, and its Treasuries take about 1 business day to free — [Stablecoin Insider](https://stablecoininsider.org/how-to-issue-a-branded-stablecoin-with-bridge-open-issuance/). USDH launched with an $800 per-user mint/redeem cap and a USDC pair doing nearly $2M of early volume — [Cointelegraph](https://cointelegraph.com/news/hyperliquid-stablecoin-goes-live-after-fierce-bidding-issuance-rights)
- **Attestation:**
  - OUSD promises monthly attestations — [Yahoo Finance](https://finance.yahoo.com/markets/crypto/articles/stripes-bridge-launches-ousd-stablecoin-174557737.html)
  - CASH has a live reserve page (updated 21 Oct 2026) with no attestor named — [Bridge reserves](https://reserves.bridge.xyz/cash)
  - AUSD uses Grant Thornton — [Agora](https://www.agora.finance/product/white-label)
- **Synthetic-backing stress:**
  - USDe traded below $0.66 on Binance on 10 Oct 2025. Ethena disputed calling this a depeg. Binance paid about $283M in compensation — [The Block](https://theblock.co/post/374295/binance-pays-283-million-in-compensation-following-fridays-depegs-covering-user-losses)
  - USDe supply fell from about $14.7B (9 Oct 2025) to about $6.3B roughly two months later — [Forklog](https://forklog.com/en/news/usde-capitalisation-by-ethena-plummets-by-8-3-billion-since-october)
- **M0 on Solana dependencies:** $M index updates and transfers depend on the Ethereum hub and a Wormhole NTT-based Portal, and holder yield on Crank-model extensions depends on an off-chain "yield-bot" crank — [M0 docs, Solana](https://docs.m0.org/protocol/solana); [GitHub solana-m](https://github.com/m0-platform/solana-m)

### Inferences

- On Bridge, Paxos, Anchorage and Agora mints, the issuer holds the mint, freeze, permanent-delegate and close authorities on-chain. A Mercury dollar could not be moved to a new issuer without that issuer's cooperation. Without cooperation, Mercury would need a new mint plus a swap or redemption window, as in USDH to USDC and BUSD to other coins. An M0 extension, or an Ethena-style wrapper over swappable backing, gives more backing portability, because the brand's token contract sits above the backing asset.
- Token-2022 coins (CASH, USDG, PYUSD, AUSD, USDPT) have thinner DeFi and CEX support than classic SPL USDC or USD1 on Solana. JupUSD's choice of classic SPL is consistent with that. Mercury would need its own liquidity (DEX pools or CEX listings) for users to exit without redeeming through the issuer. No source quantified this cost.
- Ticker-squatting is common: there are many fake OUSD and USDF tokens. Mercury's app and integrations would need to hard-pin the canonical mint.

### Gaps

- Contractual exit terms (notice periods, mint-authority handover, reserve wind-down) for any provider: none were published.
- Bank concentration for Bridge reserves beyond named partners (Lead Bank, BNY, BlackRock) was not found.
- No data was found on the initial liquidity seeded by any wallet brand at launch, for example how much Phantom or MetaMask seeded into DEX pools.

## 5. Fully in-house alternatives: becoming the issuer, or crypto-collateralised designs

### Takeaway

Becoming a regulated issuer means a 6–18+ month licensing path, meaningful capital, and banking, custody and attestation operations. Even Paxos, Bridge and Agora, which already issue, are still waiting on final OCC trust charters in Oct 2026. Crypto-collateralised and synthetic designs (Sky USDS, Ethena USDe) avoid the licence but carry governance-set or market-dependent yields, and in 2025 they suffered depegs and collapses (USDe on Binance, Elixir deUSD and Stream xUSD). That record largely explains why consumer apps chose white-label.

### Cited Findings

- **OCC trust charters:**
  - Conditional approvals: Paxos (12 Dec 2025), Bridge (12 Feb 2026), Agora (18 Sep 2026). Conditions are capital within 12 months and opening within 18 months.
  - Only BitGo and Circle had opened as live banks per one Oct 2026 report (secondary).
  - Paxos's earlier 2021 preliminary approval lapsed on 31 Mar 2023.
  - Sources: [The Industry Spread](https://theindustryspread.com/occ-five-crypto-trust-charters-two-opened/); [Fintech Futures](https://www.fintechfutures.com/blockchain-crypto-digital-assets/bridge-secures-conditional-occ-approval-for-national-trust-bank-charter); [Upshift](https://www.upshift.finance/blog/stablecoin-issuance-platforms)
- **EU:** MiCA EMT rules have applied since 30 Jun 2024. Only EMIs or credit institutions may issue. EMI minimum capital is €350k, and a typical authorisation takes 6–12 months (secondary) — [Global Law Experts](https://globallawexperts.com/stablecoin-issuer-licence-2/); [Citium](https://www.citiumtech.com/insights/mica-stablecoins-issuers)
- **Hong Kong:** the Stablecoins Ordinance took effect 1 Aug 2025. Minimum paid-up capital is HK$25M. The first licences reportedly went to Anchorpoint Financial and HSBC on 10 Apr 2026, two of 36 applicants (secondary) — [Stablecoin Laws](https://stablecoinlaws.org/2026/02/02/hkma-stablecoin-licensing-2026-timeline-requirements-reserves-redemption-rules); [Stablecoin Insider](https://stablecoininsider.org/stablecoin-law/)
- **US:** GENIUS was signed on 18 Jul 2025 (P.L. 119-27). A state route exists for smaller issuers. One secondary source says a 360-day transition applies after crossing $10B, which I did not verify against the statute — [Stablecoin Insider](https://stablecoininsider.org/stablecoin-law/)
- **Sky USDS:**
  - No licensed issuing company. The Sky Savings Rate is set by SKY governance and fell from 8.75% (early 2025) to about 3.60–3.80% in Oct 2026 — [Datawallet](https://www.datawallet.com/crypto/usds-explained); [Coinfomania](https://coinfomania.com/sky-savings-rate-rises-to-3-80-enhancing-susds-capital/)
  - USDS on Solana is a classic SPL mint of only about 4.67M — [Solscan: USDS](https://solscan.io/token/USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA)
- **Ethena USDe:** Binance dislocation on 10 Oct 2025 and supply roughly halved by Dec 2025 (above) — [Forklog](https://forklog.com/en/news/usde-capitalisation-by-ethena-plummets-by-8-3-billion-since-october)
- **Elixir deUSD and Stream xUSD:** Stream halted withdrawals on 4 Nov 2025 after a $93M external fund-manager loss, with at least $285M owed to lenders, $68M+ of it to Elixir. xUSD fell to about $0.10–0.26. Elixir sunset deUSD, which traded near $0.015 after 80% of holders redeemed — [The Block](https://www.theblock.co/post/377961/elixir-sunsets-deusd-synthetic-stablecoin-following-stream-finance-unwinding-aims-full-redemptions); [Forklog](https://forklog.com/en/collateral-damage-from-stream-finance-hack-estimated-at-285-million/)
- **Speed of white-label:** Bridge's custom setup takes "as little as one day" when no new chain is needed — [Stablecoin Insider](https://stablecoininsider.org/how-to-issue-a-branded-stablecoin-with-bridge-open-issuance/)
- **Ethena's offer:** templated launches with issuance, custody and reserve operations included — [Ethena docs](https://docs.ethena.fi/overview/ethena-whitelabel)

### Inferences

- For Mercury, an in-house regulated issuer would mean a non-US licence (EU EMI, Bermuda, HK, Singapore), a reserve bank and custodian stack, and attestation, which would take most of a year or more. A white-label coin can launch in days to weeks. The yield difference is one provider's fee, which is undisclosed but implied to be a minority share.
- A crypto-collateralised "Mercury dollar" would leave Mercury users holding governance or market risk in place of T-bill risk, at a time when most legitimate Solana stablecoin supply is reserve-backed. It also would not get regulated-issuer status in MiCA markets.

### Gaps

- Liquity v2 "friendly forks" (BOLD-style), crvUSD supply, and their Solana availability were not researched for lack of time. No Solana-native CDP stablecoin of material size was identified.
- No primary-source total cost (legal, capital, ops) for standing up a regulated issuer in the EU, Bermuda or Singapore was found.
- GENIUS state-route thresholds and the 360-day federal transition were not verified against the statute text.
