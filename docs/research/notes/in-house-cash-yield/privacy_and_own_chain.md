# Later-Phase Options for Mercury: Private Payments and an Own Chain/Appchain (landscape scan, as of Oct 21, 2026)

## Q1. Private payments on Solana: what exists, what it hides, and how mature it is

### Takeaway

As of October 2026, Solana has one native, issuer-controlled primitive and several third-party options. The native one is Token-2022 Confidential Transfers, re-enabled in June 2026 after a 2025 soundness bug. It hides amounts and balances, supports auditor keys, and is barely used. The third-party options are Arcium/Umbra (MPC, public since March 2026), Helius Rings (shielded pool, devnet beta as of September 2026), and MagicBlock Private Ephemeral Rollups (TEE). All of them are early, capped, or permissioned. None is a mature, high-volume private-payments rail yet.

### Cited Findings

**Token-2022 Confidential Transfers + ZK ElGamal Proof program**

- Timeline: confidential transfers reached mainnet in April 2025. On June 10, 2025, zkSecurity reported a flaw in a sigma OR-proof: a prover-supplied value was not hashed into the Fiat-Shamir transcript, so proofs could be forged. Token-2022 was redeployed without the confidential instructions, and a feature gate disabled the ZK ElGamal proof program on June 19, 2025 (epoch 805). No exploit was recorded. — [DEV Community analysis (Sept 2026)](https://dev.to/sulimanmukhtar/confidential-transfers-on-solana-whats-native-whats-helius-rings-and-whats-actually-on-mainnet-329p); tracking issue: [solana-program/token-2022 #657](https://github.com/solana-program/token-2022/issues/657)
- Audits before re-enablement: Qedit (from July 30, 2025), Code4rena (Aug 19 to Sep 15, 2025, $203,500 pool), Least Authority and zkSecurity (both complete by Nov 2025), and Trail of Bits (from Nov 12, 2025). The re-enable gate reached testnet/devnet by April 2026 and mainnet at slot 424,224,000 (epoch 982, early June 2026). The rebuilt Token-2022 followed about two weeks later. — [DEV Community](https://dev.to/sulimanmukhtar/confidential-transfers-on-solana-whats-native-whats-helius-rings-and-whats-actually-on-mainnet-329p); [Code4rena 2025-08 Solana Foundation repo](https://github.com/code-423n4/2025-08-solana-foundation); [zkSecurity audit report](https://reports.zksecurity.xyz/reports/anza-solana-token2022/); [Solana Compass](https://solanacompass.com/news/solana-activates-bn254-bls12-381-and-zk-elgamal-three-cryptographic-primitives-now-live). The epoch and slot figures come from blog analysis, not an official Solana Foundation announcement.
- Official docs now say "Confidential Balances depends on the ZK ElGamal Proof program, which is enabled on mainnet and devnet." A stock `solana-test-validator` does not enable it. — [Solana docs: Transfer Tokens](https://solana.com/docs/tokens/extensions/confidential-transfer/transfer-tokens)
- What it hides: balances and transfer amounts are encrypted. Sender and recipient token accounts, the mint, the fact that a confidential transfer happened, the plaintext amounts of deposits into and withdrawals out of the confidential balance, timing, and fees all stay public. — [DEV Community](https://dev.to/sulimanmukhtar/confidential-transfers-on-solana-whats-native-whats-helius-rings-and-whats-actually-on-mainnet-329p)
- Auditor key: the issuer can set an optional ElGamal auditor public key on the mint. Every transfer amount is then also encrypted to the auditor, which gives read access but no spend access. — [Solana docs](https://solana.com/docs/tokens/extensions/confidential-transfer/transfer-tokens); [DEV Community](https://dev.to/sulimanmukhtar/confidential-transfers-on-solana-whats-native-whats-helius-rings-and-whats-actually-on-mainnet-329p)
- Engineering cost:
  - Each transfer needs three proofs (equality, ciphertext validity, range). They are "too large for one transaction," so a transfer spans three transactions using context-state accounts. — [Solana docs](https://solana.com/docs/tokens/extensions/confidential-transfer/transfer-tokens)
  - Amounts are capped at 2^48 base units.
  - Pending credits are capped (default 65,536) until the owner applies them.
  - Accounts holding a non-zero confidential balance cannot be closed.
  - A mint must opt in at creation, so existing mints cannot add the feature later.
  - No wallet with native support was identified. — [DEV Community](https://dev.to/sulimanmukhtar/confidential-transfers-on-solana-whats-native-whats-helius-rings-and-whats-actually-on-mainnet-329p)
- Usage is very low. Over roughly four days in Sept 2026, the proof program showed four transactions from one wallet. — [DEV Community](https://dev.to/sulimanmukhtar/confidential-transfers-on-solana-whats-native-whats-helius-rings-and-whats-actually-on-mainnet-329p)
- PYUSD on Solana is a Token-2022 mint. Paxos holds a permanent-delegate authority that lets it freeze or seize funds. A QuickNode guide lists confidential transfers for PYUSD as "coming soon," and no source confirmed they are live. — [Solana PYUSD page](https://solana.com/id/pyusd); [QuickNode PYUSD guide](https://blog.quicknode.com/pyusd-solana-integration)

**Arcium (MPC encrypted compute) and Umbra**

- Arcium Mainnet Alpha went live Feb 2, 2026 in a permissioned setup with some centralized components. Umbra was the first app: shielded transfers and encrypted swaps, onboarding 100 users per week with a $500 deposit cap. — [The Block](https://www.theblock.co/post/387564/arcium-launches-privacy-preserving-mainnet-alpha-on-solana-as-umbra-debuts-shielded-finance-layer); [Arcium Substack](https://arcium.substack.com/p/arcium-mainnet-alpha-is-live)
- Umbra opened to the public on Mar 27, 2026, billed as "the first shielded pool on Solana."
  - Privacy: sender, recipient, and amount are shielded.
  - Compliance tooling: granular viewing keys (scoped by date range or by single transaction), Range risk screening (multi-hop, 99+ chains, blocks OFAC-sanctioned and blacklisted wallets before a transaction starts), and geo-blocking.
  - A developer SDK is available.
  - No usage numbers were published. — [Arcium Substack, Mar 27, 2026](https://arcium.substack.com/p/umbra-is-now-open-to-the-public-powered); [The Block](https://www.theblock.co/news/ecosystems/2026-03-27-umbra-opens-privacy-wallet-to-the-public-on-solana-powered-by-arciums-encrypted-execution-engine-394892)
- Confidential SPL (C-SPL) merges SPL Token, Token-2022 Confidential Transfers, and Arcium MPC into one standard. It was first slated for Q1 2026, and as of mid-2026 it was in "active development with early access" for selected teams. As of June 2026, the full decentralized mainnet and the $ARX TGE had not been dated. — [Arcium on X (C-SPL intro)](https://x.com/Arcium/status/1940055296912892388); [Messari: Arcium Mainnet Alpha](https://messari.io/report/arcium-mainnet-alpha-release); [Solana Compass: Arcium](https://solanacompass.com/projects/Arcium)

**Elusiv (precedent)**

- Elusiv was a Solana privacy protocol. Its closure was disclosed at the end of February 2024, and QuickNode's guide now points readers to Token-2022 confidential transfers instead. — [QuickNode Elusiv guide (legacy)](https://www.quicknode.com/guides/solana-development/legacy/privacy-with-elusiv)
- Elusiv raised a $3.5M seed in Nov 2022. The team carried its research into Arcium, a general-purpose confidential-compute network. — [Yellow.com Arcium profile (Thai)](https://yellow.com/th/asset/arx)

**Light Protocol / ZK Compression and Helius Rings**

- ZK Compression is live on Solana mainnet (the JS SDK v0.23.0 of March 2026 targets ZK Compression V2). Helius acquired Light Protocol on June 10, 2026 to build a ZK privacy layer for "private payments and private DeFi," including encrypted balances with auditability. — [The Block](https://www.theblock.co/news/deals/2026-06-10-solana-infrastructure-firm-helius-acquires-light-protocol-expand-onchain-privacy-403982); [Light Protocol releases](https://github.com/Lightprotocol/light-protocol/releases)
- Helius Rings was announced Aug 7, 2026 and released as Apache-2.0 source ("zolana," alpha).
  - Design: a shielded pool of encrypted notes in a shared Merkle tree. It works with SOL and any SPL or Token-2022 mint, with no issuer opt-in.
  - Status on Sept 9, 2026: devnet beta only, with no mainnet program accounts. The stated mainnet target was August 2026, with October as the outer bound. Three audits were in progress.
  - Proving runs on a Helius server, with encrypted server proving on AWS Nitro planned before mainnet.
  - The Default Ring hides asset and amount but not sender or recipient. Anonymous custom rings hide sender and recipient through a relayer but require delegated decryption, so the RPC provider can see balances.
  - Cost: about 220k compute units per transfer. Every transfer writes the same tree account, which caps throughput at roughly 54 transfers per block. — [DEV Community](https://dev.to/sulimanmukhtar/confidential-transfers-on-solana-whats-native-whats-helius-rings-and-whats-actually-on-mainnet-329p) (single detailed secondary source with on-chain checks; not confirmed by Helius here)

**MagicBlock Private Ephemeral Rollups (TEE)**

- Private Ephemeral Rollups (PERs) run an Ephemeral Rollup inside Intel TDX enclaves.
  - An on-chain Permission Program controls read access, and clients verify the enclave by remote attestation.
  - Compliance: IP geofencing of OFAC regions, plus continuous AML and sanctions screening that rejects failing transactions before execution.
  - The Feb 21, 2026 blog references only a devnet "Private Payments Demo" (confidential SPL transfers). — [MagicBlock blog](https://www.magicblock.xyz/blog/private-ephemeral-rollups)
- The docs list a mainnet TEE endpoint (`mainnet-tee.magicblock.app`). One secondary source claims a Private Payments API went live on mainnet in March 2026, unconfirmed by MagicBlock. — [MagicBlock docs quickstart](https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/how-to-guide/quickstart); [whales.market explainer](https://whales.market/blog/what-is-magicblock/)

### Inferences

- Native Confidential Transfers have the most regulator-friendly shape: the issuer controls the auditor key and only amounts are hidden. The catch is that the mint must opt in at creation. Mercury can only use them for a token it issues itself, such as a Mercury-issued or wrapped dollar token, or if a stablecoin issuer enables them on its mint. Background knowledge, not verified in this pass: Solana USDC uses the original SPL Token program rather than Token-2022.
- The trust models differ in kind:
  - Arcium is MPC with a permissioned node set today.
  - MagicBlock is a hardware TEE, so it rests on Intel's root of trust.
  - Rings depends on server-side proving and delegated decryption.
  - Only native Confidential Transfers and Aztec-style client-side proving avoid trusting an operator with plaintext.
- Soundness bugs have hit both Solana's ZK ElGamal program (2025) and Zcash Orchard (2026; see Q2). A small team should integrate an audited primitive, not write its own circuits or proof systems.
- The realistic near-term option for Mercury is integration: Umbra SDK, Rings once it reaches mainnet, or MagicBlock PERs. Building in-house would be a multi-year cryptography program with repeated audits; the Solana re-enablement took about a year and five audits.

### Gaps

- Whether Helius Rings reached mainnet between Sept 9 and Oct 21, 2026, and whether Arcium has shipped its decentralized mainnet, TGE, or general C-SPL availability since June 2026. No sources dated October 2026 were found.
- No official Solana Foundation post giving the exact re-enable date; the epoch and slot figures come from blog analysis.
- Why Elusiv shut down (no stated reason found in available sources).
- Whether any major stablecoin issuer (Circle, Paxos) has enabled confidential transfers on a live Solana mint.
- Usage or volume figures for Umbra and MagicBlock PERs.

## Q2. EVM and reference privacy systems, legal precedent, and what "compliant privacy" looks like

### Takeaway

Two compliance designs have converged. One is screened shielded pools: association sets or proof-of-innocence plus a public "ragequit" exit, as in Privacy Pools and Railgun. The other is view-key or auditor-key selective disclosure, as in Solana CT, Umbra, and Circle Arc's planned privacy. In the US, Tornado Cash's sanctions were judicially struck and delisted. The developer's §1960 conviction for conspiracy to operate an unlicensed money-transmitting business still stands pending a Rule 29 motion, with a retrial on the other counts set for April 2027. The EU AMLR will bar CASPs from anonymous accounts and privacy coins from July 1, 2027.

### Cited Findings

**Privacy Pools (0xbow)**

- Deployment: Ethereum only. The Entrypoint was deployed Mar 29, 2025. Snapshot: TVL about $9.25M, 7.97K total deposits, 5 active relayers in 30 days. — [L2BEAT Privacy: Privacy Pools](https://l2beat.com/privacy/projects/privacy-pools)
- Compliance model: 0xbow runs the single Association Set Provider (ASP). It screens each depositing address (approval usually takes hours) and posts the set's Merkle root on-chain, with the full list on IPFS. Every private withdrawal must prove membership in the latest set, so the ASP can revoke approval.
- Exit: unapproved or revoked deposits can always "ragequit," a public, permissionless withdrawal straight from the immutable pools. — [L2BEAT](https://l2beat.com/privacy/projects/privacy-pools)
- Admin risks: the Entrypoint is UUPS-upgradeable by a 2/4 multisig with no delay.
- Fees: a vetting fee of 0.5% on ETH, USDC, and BOLD.
- Incidents (Mar 11, 2026): the ASP revoked all fxUSD approvals for 13 days, and it posted a bad root that halted all private withdrawals for about 2 hours. L2BEAT says the protocol fails the "walkaway test." — [L2BEAT](https://l2beat.com/privacy/projects/privacy-pools)
- 0xbow raised $3.5M. The Ethereum Foundation is integrating Privacy Pools into its Kohaku wallet effort, and 0xbow offers "ASP-as-a-Service." The press release reported early volume of about $6M across 1,500+ users. — [National Law Review press release](https://natlawreview.com/press-releases/0xbow-closes-35m-round-compliant-crypto-privacy-technology-following)

**Railgun**

- Private Proofs of Innocence (PPOI) is a ZK check that shielded tokens do not originate from a list of known malicious addresses. It is paired with a 1-hour waiting period on newly shielded funds. — [Railgun docs: Assurance Suite](https://docs.railgun.org/wiki/assurance/railgun-assurance-suite); [Railgun on X](https://x.com/RAILGUN_Project/status/2042262108705022205)
- Cumulative shielded volume was reported at about $5.16B by June 2026 across Ethereum, Arbitrum, Polygon, and BNB. — [cryptoguide.business (secondary)](https://cryptoguide.business/en/guide/advanced/railgun-rail-defi-privacy-zk-protocol-2026), unverified against Railgun data. Risk review: [L2BEAT Privacy: Railgun](https://l2beat.com/privacy/projects/railgun)

**Aztec (private-by-default L2)**

- The Alpha Network went live on Ethereum mainnet in spring 2026 (one report says Mar 31, 2026). It uses client-side proving and settles to Ethereum. — [Aztec blog](https://aztec.network/blog/announcing-the-alpha-network); [KuCoin news](https://www.kucoin.com/news/flash/aztec-network-launches-alpha-mainnet-first-ethereum-l2-with-full-privacy-smart-contracts)
- Alpha V5 (July 21, 2026) proves a fully private transaction in about 2.5s on a laptop, with fees under $0.05. It "resolves the critical V4 issues." — [The Defiant](https://thedefiant.io/news/blockchains/aztec-launches-alpha-v5-on-mainnet-with-faster-private-proving); [The Block](https://www.theblock.co/news/ecosystems/2026-07-21-aztec-upgrades-v5-alpha-adding-private-execution-environment-decentralized-ethereum-l2-409065)
- The zk.money wallet relaunched on Sept 29, 2026 with a $2,500 per-transaction cap and a $50K daily deposit ceiling (secondary reporting; caps not confirmed against an Aztec primary source).

**Tornado Cash: sanctions and courts**

- Sanctions:
  - Nov 26, 2024: the Fifth Circuit held in _Van Loon v. Dep't of the Treasury_ that Tornado Cash's immutable smart contracts are not "property" blockable under IEEPA.
  - Mar 21, 2025: OFAC delisted Tornado Cash, saying it "exercised [its] discretion." It kept one founder on the SDN list.
  - The decision not to appeal leaves future designations possible. — [Steptoe](https://www.steptoe.com/en/news-publications/international-compliance-blog/treasury-department-delists-tornado-cash-following-the-fifth-circuits-decision.html)
- Roman Storm:
  - Aug 6, 2025: convicted of conspiracy to operate an unlicensed money-transmitting business (18 U.S.C. §1960, maximum 5 years). The jury hung on money-laundering conspiracy and IEEPA-sanctions conspiracy.
  - A Rule 29 acquittal motion was argued in April 2026 and was undecided as of Aug 26, 2026.
  - Retrial is set for April 26, 2027; DOJ had asked for October 2026.
  - April 2026: Acting AG Todd Blanche said DOJ no longer targets developers and called Storm's case a "lingering case."
  - Alexey Pertsev (Netherlands) received 64 months in May 2024 and is appealing. — [Crypto Valley Journal, Aug 26, 2026](https://cryptovalleyjournal.com/focus/legal-and-compliance/tornado-cash-roman-storm-trial-delayed-to-april-2027/); [CoinDesk, Mar 10, 2026](https://www.coindesk.com/business/2026/03/10/u-s-requests-october-retrial-for-tornado-cash-developer-roman-storm)

**Zcash (reference design)**

- Shielded share of supply is reported at 31.0% in Q1 2026 and 26.3% in Q2 2026. Trackers disagree on method. — [Blockworks Q1 2026](https://blockworks.com/api/investor-report/zcash-token-holder-report-q1-2026/pdf); [Blockworks Q2 2026](https://blockworks.com/api/investor-report/zcash-token-holder-report-q2-2026/pdf); [DefiLlama notes](https://defillama.com/pro/zcash-everything-you-will-ever-need-to-follow-g1297o)
- On May 29, 2026, developers found a soundness flaw in the Orchard pool that "could have allowed undetectable counterfeiting of ZEC." No loss was reported. An emergency patch shipped first. Then NU6.3 activated the formally verified Ironwood pool on July 28, 2026 and sealed Orchard; users migrate through a ZIP-318 turnstile, about 85% migrated by late August. — [Crypto Briefing, Aug 24, 2026](https://cryptobriefing.com/zcash-ironwood-migration-85-percent/); [MEXC news](https://www.mexc.com/news/1132047)

**Regulatory direction (EU)**

- The AMLR's main obligations apply from July 1, 2027. CASPs will be barred from maintaining anonymous accounts or handling privacy-preserving coins (Art. 79, per reporting), and the details are left to EBA/AMLA delegated acts. — [Cointelegraph](https://cointelegraph.com/news/eu-crypto-ban-anonymous-privacy-tokens-2027); [Reclaim The Net](https://reclaimthenet.org/eu-to-ban-privacy-coins-anonymous-crypto-accounts-by-2027)

**Payment-chain privacy roadmaps**

- Circle Arc lists "confidential transactions and balances with view keys for auditability" as "in development for network-wide release." There is no date, and the feature was not live at the Sept 16, 2026 launch. — [Circle press release](https://www.circle.com/pressroom/circle-launches-arc-mainnet-an-economic-operating-system-for-the-internet)

### Inferences

- "Compliant privacy" in 2026 usually stacks four things:
  1. Pre-transaction screening (Range in Umbra, the ASP in Privacy Pools, PPOI in Railgun, AML gating in MagicBlock).
  2. Selective disclosure: viewing keys scoped to a time range or transaction, or an issuer auditor key.
  3. Geo-blocking.
  4. A public exit path.
     These map directly onto obligations Mercury already has: KYC'd users, OFAC screening, and the ability to answer subpoenas.
- Mercury knows its users through KYC, so a model where Mercury holds view keys or the auditor key fits its posture. The privacy is _from the public chain_, not _from Mercury or regulators_. That is closer to Arc's and Solana CT's model than to Tornado's.
- The Storm §1960 conviction is the main US legal risk signal. Running a privacy service with transmitting or relaying functions, without money-transmitter analysis, is risky even after the sanctions were overturned. Legal review should come before any privacy launch.
- Shielded pools in production stay small. Privacy Pools holds about $9M TVL after 18 months. That suggests demand for screened privacy pools is modest, and that the user experience (waiting periods, revocations, exits) adds friction.

### Gaps

- No primary DOJ or court docket documents were fetched. Storm details come from reputable trade press.
- No current US guidance (FinCEN, OFAC, or Treasury under the GENIUS Act) specifically blessing view-key or association-set designs was found.
- No current Railgun figures from a primary source.

## Q3. Payment and fintech chain precedents: why they launched, timelines, outcomes

### Takeaway

In 2025 and 2026 the dominant players (Stripe/Paradigm, Circle, Robinhood, Coinbase, Tether-aligned groups) launched or announced their own chains. Their stated reasons are control over fees and gas (stablecoin-denominated gas), settlement finality and compliance (permissioned or known validators), product verticalization (Robinhood's stock tokens), and economics (Base's sequencer revenue). Each had large distribution or balance sheets, and the launches took 12 to 18+ months from announcement to mainnet. Chains built on incentive-driven liquidity, such as Plasma, lost most of their TVL.

### Cited Findings

**Tempo (Stripe + Paradigm)**

- Tempo is a payments-focused, EVM-compatible L1. It raised a $500M Series A at about a $5B valuation (Oct 2025, led by Thrive and Greenoaks). It is led by Matt Huang, and Dankrad Feist joined from the Ethereum Foundation. Early design partners included OpenAI, Shopify, Visa, Anthropic, and Deutsche Bank. — [The Block](https://www.theblock.co/post/375152/stripe-tempo-500-million-series-a-thrive)
- Public testnet came in Dec 2025, and mainnet launched Mar 18, 2026 alongside the Machine Payments Protocol for agent payments.
  - No native gas token: fees are paid in stablecoins.
  - Validators are a permissioned group of known companies (including Stripe, Visa, MoneyGram, Zodia Custody, and zerohash), with a stated roadmap to permissionless validation. — [Ledger Insights](https://www.ledgerinsights.com/stripe-paradigm-launch-tempo-blockchain-alongside-machine-payments-standard/); [Finextra](https://www.finextra.com/newsarticle/47462/stripe-backed-tempo-blockchain-goes-live-with-machine-payments-protocol)
- Secondary sources say Tempo settles Stripe payouts, MoneyGram, and Deel, and that there was no Tempo token as of Oct 12, 2026. — [Datawallet explainer](https://www.datawallet.com/crypto/tempo-explained) (unverified)

**Circle Arc**

- Public mainnet launched Sept 16, 2026 after a private mainnet.
  - Fees are paid in USDC, with sub-second deterministic finality.
  - Proof of Authority with a founding cohort that includes BlackRock, DTCC, Galaxy, ICE, Mastercard, MoneyGram, SBI, Standard Chartered, Sumitomo, Visa, and Worldpay. Circle is exploring a move to Proof of Stake in 2027.
  - Circle minted 10B ARC tokens at genesis but says the mint "is not a commitment to publicly launch ARC."
  - Testnet processed 700M+ transactions in under a year, and 100+ apps were live at launch. — [Circle press release](https://www.circle.com/pressroom/circle-launches-arc-mainnet-an-economic-operating-system-for-the-internet); [BusinessWire, Aug 5, 2026](https://www.businesswire.com/news/home/20260805327212/en/Circle-Announces-Founding-Validator-Cohort-and-Major-Integrations-for-Arc-Ahead-of-September-16-Mainnet-Launch)

**Robinhood Chain (Arbitrum stack L2)**

- Timeline: tokenized US equities launched for EU users in June 2025 on Arbitrum One. Robinhood Chain reached public testnet in Feb 2026 and public mainnet on July 1, 2026, roughly 12 months after the first stock tokens.
- Product and access:
  - The new Stock Tokens are available in 120+ countries via Robinhood Wallet, but not to US persons, Canada, the UK, Switzerland, or the UAE.
  - Robinhood covered gas for eligible users for the first 90 days.
  - Launch partners included Uniswap, Lighter, Morpho (Robinhood Earn), Chainlink, BitGo, and Alchemy. — [The Block, July 1, 2026](https://www.theblock.co/news/business/2026-07-01-robinhood-chain-goes-live-mainnet-alongside-24-7-tokenized-stocks-lighter-perps-planned-crypto-agentic-trading-406918)
- Stated rationale: bring "the best of traditional finance and DeFi together" on a chain "purpose-built for real-world assets." — [The Block](https://www.theblock.co/news/business/2026-07-01-robinhood-chain-goes-live-mainnet-alongside-24-7-tokenized-stocks-lighter-perps-planned-crypto-agentic-trading-406918)
- Architecture: Arbitrum Orbit/Nitro, Ethereum settlement, ETH gas. — [Dwellir explainer](https://www.dwellir.com/blog/what-is-robinhood-chain)
- One report puts about $1.02B in Robinhood Chain contracts by late September 2026; another cites about $146M in tokenized stocks before the gas promotion ended Sept 29. — [shattered.io (secondary)](https://shattered.io/arbitrum-135-percent-robinhood-chain-1-02b-2026/) (figures conflict)

**Coinbase Base (OP Stack L2)**

- Base was announced in Feb 2023, put a testnet up that same month, and launched mainnet in Aug 2023 with 100+ dapps. Jesse Pollak leads it. — [TechCrunch](https://techcrunch.com/2023/04/21/coinbases-layer-2-blockchain-base-plans-for-2023-mainnet-launch); [Fortune, Aug 7, 2023](https://fortune.com/crypto/2023/08/07/behind-the-scenes-of-coinbases-ambitious-new-base-blockchain-and-what-to-expect-from-on-chain-summer); [The Block](https://www.theblock.co/post/243899/tcopeland@theblock.co)
- Economics:
  - About $75.4M in on-chain revenue in 2025, roughly 62% of all L2 revenue ($120.7M); likely a partial-year figure. — [KuCoin/PANews summary](https://www.kucoin.com/news/flash/base-2025-performance-revenue-surges-30x-strengthens-l2-leadership)
  - Talos estimated Q4 2025 "other transaction revenue" (sequencer plus payments) at about $65M, and about $15M net after L1 data costs and the OP Collective share. — [Talos](https://www.talos.com/insights/state-of-the-network-350)

**Plasma (stablecoin L1, Tether/Bitfinex-aligned)**

- Mainnet beta and XPL launched Sept 25, 2025. The Plasma One neobank followed: zero-fee USDT transfers, Rain-issued cards, and ">10%" yield. The CEO framed the problem as "distribution." — [The Block](https://www.theblock.co/news/ecosystems/2025-09-22-plasma-stablecoin-neobank-371568); [The Defiant](https://thedefiant.io/news/infrastructure/plasma-launches-plasma-one-stablecoin-neobank)
- Decline:
  - Stablecoins on Plasma fell from about $6.35B (Oct 2025 peak) to about $1.28B. DeFi TVL was about $553.5M on Oct 19, 2026. — [DefiLlama: Plasma](https://defillama.com/chain/plasma)
  - About 65% of the stablecoins had been parked in lending for XPL rewards and left when the rewards lost value. XPL fell 85% in six weeks. — [Yahoo Finance](https://finance.yahoo.com/news/plasma-xpl-crypto-loses-85-150006785.html)

**Stable (USDT-gas L1, Bitfinex-backed)**

- StableChain mainnet launched Dec 8, 2025 with USDT as gas, a separate STABLE governance token, and a foundation. Pre-deposit figures were self-reported and conflict ($1.1B to $2.8B). The $28M seed was led by Bitfinex and Hack VC. — [The Block](https://www.theblock.co/post/381688/stable-launches-mainnet-native-token-foundation); [Stablecoin Insider](https://stablecoininsider.org/tether-bitfinex-stable-mainnet/)

**Eclipse (SVM L2 on Ethereum): a failure mode**

- After its July 2025 TGE, Eclipse cut 65% of staff (about 40 people) in Aug 2025, replaced its CEO, and pivoted from neutral infrastructure to building its own "breakout application." The new CEO said "scale is meaningless without users." The ES token was down 65% from launch. — [FinanceFeeds](https://financefeeds.com/eclipse-names-new-ceo-cuts-65-of-staff-in-shift-toward-consumer-apps/); [The Block via TradingView](https://ru.tradingview.com/news/the_block%3A931ca865e094b%3A0-eclipse-labs-cuts-65-of-staff-names-sydney-huang-as-new-ceo-in-post-tge-pivot)

### Inferences

- The successful launches share three things: (a) large existing flow to move onto the chain (Stripe payouts, $74B+ USDC, Robinhood's brokerage, Coinbase's exchange), (b) the ability to recruit known validators and partners, and (c) nine-figure funding or an incumbent balance sheet (Tempo's $500M raise).
- Eclipse's roughly 40 layoffs at 65% imply about 60 staff before the cuts. That is one data point for the size of a chain infrastructure team; it is derived, not reported.
- A pattern recurs: Robinhood, Plasma, and Eclipse each ended up verticalizing toward their own consumer app. The app with users drives value, not the chain. Mercury already has the app, so a chain would follow user scale rather than create it.
- Sequencer revenue is highly concentrated. Base takes about 62% of all L2 revenue, and its Q4 2025 net was about $15M. A small app's chain would earn little sequencing revenue unless it held large captive volume.
- Privacy is on every payment chain's roadmap (Arc's view keys) but shipped on none at launch. Privacy alone does not justify a chain.

### Gaps

- Team headcounts for Tempo, Arc, Robinhood Chain, Stable, and Plasma were not found.
- No verified post-launch volume figures for Tempo or Arc.
- Exact Base mainnet day (Aug 2023) not confirmed by the fetched sources.
- Coinbase's audited disclosure of Base revenue was not located.

## Q4. SVM appchains, rollups, and Solana-native extensions: options for a Solana app

### Takeaway

SVM-outside-Solana L2s have mostly stalled or contracted: Eclipse's pivot, Sonic's token down about 84% over a year, and no traction data for SOON. Solayer's InfiniSVM is a hardware-accelerated SVM network in mainnet alpha. The most practical "own execution environment" for a Solana app in 2026 is MagicBlock's Ephemeral Rollups or Private Ephemeral Rollups. They delegate Solana accounts temporarily and settle back to L1, so liquidity is not fragmented. Generic EVM rollups via RaaS are cheap to stand up (about $36K/yr operating cost plus data availability) but would move Mercury off Solana's liquidity.

### Cited Findings

- **Sonic SVM** is a gaming-focused SVM chain on the HyperGrid framework; its Mobius mainnet was billed as Solana's first SVM chain extension. The SONIC token was down 83.65% over one year in Messari's snapshot. — [Messari: Sonic SVM](https://messari.io/project/sonic-svm); [KuCoin Learn](https://www.kucoin.com/learn/crypto/what-is-sonic-svm-solana-s-gaming-focused-layer-2-scaling-solution)
- **Solayer InfiniSVM** launched mainnet alpha in Dec 2025, with self-reported claims of 330K+ TPS and about 400ms finality, and a $35M ecosystem fund in Jan 2026. sBridge (Aug 2025) connects it to Solana. — [The Block](https://www.theblock.co/post/386286/svm-powered-solayer-launches-35-million-ecosystem-fund-on-heels-alpha-mainnet-launch); [bex.co](https://bex.co/blog/2026/01/20/solayer-infinisvm-35m-ecosystem-fund-hardware-accelerated-blockchain)
- **SOON** lists live SVM rollup deployments on Ethereum and BNB Chain, with a one-week fraud-proof window. The 80K TPS figure comes from testing. No 2026 usage data was found. — [bex.co](https://bex.co/blog/2026/01/26/soon-svm-l2-solana-ethereum-rollup-firedancer); [iq.wiki](https://iq.wiki/wiki/soon-network)
- **Eclipse**: see Q3 (65% layoffs, pivot to apps, Aug 2025).
- **MagicBlock Ephemeral Rollups / Private Ephemeral Rollups**: Solana accounts are delegated to a fast ephemeral runtime (TEE-secured for PERs) and state is committed back to Solana. The system is "feeless," with sub-50ms execution claimed in the Sept 2025 TEE announcement. Access control lives in an on-chain Permission Program, and AML/geofencing gates sit at ingress. — [MagicBlock blog](https://www.magicblock.xyz/blog/private-ephemeral-rollups); [PR Newswire, Sept 2025](https://www.prnewswire.com/news-releases/magicblock-brings-institutional-grade-privacy-to-solana-in-industry-first-302543835.html)
- **Modular SVM**: Anza planned to separate the SVM runtime from the validator client so the SVM is easier to fork for appchains. The sources are older, and delivery was not confirmed. — [Squads blog](https://squads.xyz/blog/solana-svm-sealevel-virtual-machine); [Hyperlane: SVM expansion](https://medium.com/hyperlane/svm-expansion-the-landscape-beyond-solana-188757675fb6)
- **RaaS economics (EVM reference)**: Conduit self-reports about $36K/yr operating cost for a mainnet rollup plus DA. The rollup keeps 92.5% of sequencer revenue and Conduit takes 7.5%. Self-serve deploys cover OP Stack on Celestia DA and Arbitrum Orbit on Arbitrum One. Deployment takes about 30 minutes, versus 6 to 9 months to build one yourself. — [Conduit TCO blog](https://conduit.xyz/blog/rollup-total-cost-of-operations-tco); [Conduit permissionless deploys](https://www.conduit.xyz/blog/permissionless-mainnet-deployments); [Alchemy RaaS comparison](https://www.alchemy.com/overviews/compare-raas-providers.md)

### Inferences

- Mercury's stack depends on Solana-native liquidity and protocols: tokenized stocks, USDC, lending for stock-backed borrowing, and the relayer. An SVM L2 on Ethereum (Eclipse, SOON) or a separate L1 would fragment that liquidity and need bridges. Every SVM-L2 precedent found struggled with users and liquidity.
- An ephemeral or private rollup that settles to Solana (MagicBlock-style) is the low-commitment "own chain lite." It could give Mercury dedicated sequencing, gasless UX, and TEE privacy for internal transfers between Mercury users, and Mercury's assets stay on Solana L1.
- Launching a rollup is technically cheap via RaaS. The real costs are liquidity, bridging, security operations, and compliance. Robinhood's chain is effectively off-limits to US persons, which shows that a chain does not remove securities-law constraints on tokenized stocks.

### Gaps

- No 2026 usage, TVL, or user figures for Sonic, SOON, or InfiniSVM.
- No confirmation of whether Anza's SVM/validator separation shipped.
- No published MagicBlock pricing, mainnet PER volume, or SLA.
- No SVM-specific RaaS cost data.

## Q5. Prerequisites and what each phase would demand of a small team

### Takeaway

Private payments can start as a near-term integration, using the Umbra/Arcium SDK, Helius Rings once it is on mainnet, MagicBlock PERs, or native Confidential Transfers on a Mercury-issued token. Prerequisites are legal review (money transmission, OFAC), KYC-bound view keys, and screening. A fully in-house privacy stack is not realistic for a small team. An own chain only makes sense at Base, Robinhood, or Circle-like captive volume, with a reason the chain is needed (stablecoin gas, finality, sequencing revenue, compliance perimeter). The precedents launched with nine-figure resources and 12 to 18+ months of lead time.

### Cited Findings

- Re-enabling Solana's audited native privacy primitive took about 12 months (June 2025 to June 2026) and five audits, including a $203,500 Code4rena contest. — [DEV Community](https://dev.to/sulimanmukhtar/confidential-transfers-on-solana-whats-native-whats-helius-rings-and-whats-actually-on-mainnet-329p)
- Zcash, the longest-running shielded pool, still shipped a counterfeiting-class soundness bug in Orchard in 2026 and needed a network upgrade plus pool migration. — [Crypto Briefing](https://cryptobriefing.com/zcash-ironwood-migration-85-percent/)
- Early privacy launches all used caps:
  - Umbra: 100 users/week, $500 deposit cap. — [The Block](https://www.theblock.co/post/387564/arcium-launches-privacy-preserving-mainnet-alpha-on-solana-as-umbra-debuts-shielded-finance-layer)
  - Aztec zk.money: $2,500 per transaction (secondary report).
  - Privacy Pools: ASP vetting delay of hours. — [L2BEAT](https://l2beat.com/privacy/projects/privacy-pools)
- Chain precedents' resources and lead times:
  - Tempo: $500M Series A, about 5 months from raise to mainnet, plus earlier incubation. — [The Block](https://www.theblock.co/post/375152/stripe-tempo-500-million-series-a-thrive); [Finextra](https://www.finextra.com/newsarticle/47462/stripe-backed-tempo-blockchain-goes-live-with-machine-payments-protocol)
  - Robinhood: about 12 months from first stock tokens to chain mainnet. — [The Block](https://www.theblock.co/news/business/2026-07-01-robinhood-chain-goes-live-mainnet-alongside-24-7-tokenized-stocks-lighter-perps-planned-crypto-agentic-trading-406918)
  - Arc: a year-plus testnet and 11 institutional validators. — [Circle](https://www.circle.com/pressroom/circle-launches-arc-mainnet-an-economic-operating-system-for-the-internet)
  - Base: about 6 months from announcement to mainnet. — [TechCrunch](https://techcrunch.com/2023/04/21/coinbases-layer-2-blockchain-base-plans-for-2023-mainnet-launch)
- Liquidity attracted by incentives does not stay. Plasma's stablecoins fell about 79% from peak once XPL rewards lost value. — [DefiLlama](https://defillama.com/chain/plasma); [Yahoo Finance](https://finance.yahoo.com/news/plasma-xpl-crypto-loses-85-150006785.html)
- From July 2027 the EU AMLR bars CASPs from anonymous accounts and privacy coins, which matters if Mercury serves EU users. — [Cointelegraph](https://cointelegraph.com/news/eu-crypto-ban-anonymous-privacy-tokens-2027)

### Inferences

- **Private payments phase: suggested prerequisites**
  1. Clear user demand (for example, salary or P2P privacy requests).
  2. A legal memo on money transmission and §1960 exposure, given the Storm conviction, plus OFAC screening.
  3. A design where Mercury, or a regulated partner, holds view or auditor keys bound to KYC.
  4. Choosing a primitive with mainnet maturity and audits. As of Oct 2026, native Confidential Transfers (amount-only, issuer-controlled) and Umbra/Arcium (full shielding, permissioned alpha) are the live options. Rings and C-SPL should be watched.
     Team: 1 to 2 engineers to integrate an SDK, plus wallet UX for pending-balance apply and multi-transaction proofs, and compliance operations. Building circuits in-house would mean dedicated cryptographers and repeated audits.
- **Own chain phase: suggested prerequisites**
  1. Captive volume large enough that sequencing, fee, or MEV capture beats L1 fees. Base, the L2 revenue leader, nets on the order of $15M a quarter.
  2. Own asset issuance or a liquidity base that can live on the chain without heavy incentives (Robinhood's stock tokens, Circle's USDC).
  3. Partner validators or an RaaS/rollup vendor.
  4. A regulatory reason, such as a permissioned validator perimeter, compliance hooks at the protocol level, or stablecoin gas.
     For a Solana app, the staged path is an ephemeral or private rollup that settles to Solana first. A sovereign chain would come only after user scale reaches millions and Mercury has its own issued assets.
- Possible strategic link (background knowledge, not verified in this pass): Privy, Mercury's wallet provider, was acquired by Stripe in 2025, and Stripe incubated Tempo. A Stripe-ecosystem settlement path could therefore become relevant later.

### Gaps

- No public data on headcount or cost to build and run Tempo, Arc, Stable, or Plasma.
- No benchmark for the user scale at which an appchain broke even.
- No US-specific regulator statement on whether app-held view keys satisfy BSA/AML obligations for private on-chain transfers.
- Sources for some 2026 items are secondary (DEV Community, aggregators). They are flagged inline and should be rechecked against primary announcements before the roadmap is finalized.
