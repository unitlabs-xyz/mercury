# Security failures of lending protocols, yield vaults and yield-bearing dollars, and the engineering practices that prevent them (input for Mercury's USDC vault and xStock lending pool on Solana)

Research date: 2026-10-21. Coverage runs to October 2026. "[unverified]" marks a figure or claim that comes from one secondary source or that sources dispute. Loss figures are USD at the time of the incident unless stated otherwise.

---

## 1. Solana incidents: root cause and loss (Wormhole, Cashio, Mango, Crema, Nirvana, Solend, Loopscale, 2025–2026 lending/vault exploits)

### Takeaway

Two kinds of failure account for most Solana losses. The first is account validation that trusts caller-supplied accounts: Wormhole's spoofed sysvar, Cashio's unanchored collateral chain and Crema's fake tick account. The second is pricing illiquid collateral: Mango, Nirvana, Loopscale and Drift's fake CVT. The largest Solana DeFi loss of 2026 was Drift's roughly $285M on 2026-04-01. It was not a code bug. Admin powers were taken through a 2-of-5 Squads multisig with no timelock, using durable-nonce pre-signed transactions obtained by social engineering. Admin-key and governance design is therefore as important as program code.

### Cited Findings

**Incident catalogue (Solana)**

| Date                                 | Protocol                                   | Loss                                                               | Root cause (one line)                                                                                                                                                                 | Source                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2022-02-02                           | Wormhole (bridge)                          | 120,000 wETH minted without backing (~$320M)                       | `verify_signatures` never checked that the account passed as the Instructions sysvar really was the sysvar, so forged Guardian signatures passed                                      | [Wormhole incident report](https://wormholecrypto.medium.com/wormhole-incident-report-02-02-22-ad9b8f21eec6); [The Block](https://www.theblock.co/post/148085/wormhole-announces-10-million-bug-bounty-payout)                                                                                                                                                                          |
| 2022-03-23                           | Cashio (stablecoin)                        | ~$52–52.8M (other sources ~$48M [unverified])                      | Incomplete collateral validation: the `saber_swap.arrow` mint field was never checked, so a fake chain of accounts validated only against each other; 2B CASH minted                  | [CertiK](https://www.certik.com/blog/cashio-app-incident-analysis); [Halborn](https://halborn.com/explained-the-cashio-hack-march-2022/); [rekt](https://rekt.news/cashio-rekt/)                                                                                                                                                                                                        |
| 2022-06-19/20                        | Solend (lending, governance)               | No direct loss                                                     | SLND1 gave the team emergency power to take over a whale's account; one address cast 88% of votes; reversed by SLND2                                                                  | [The Block](https://www.theblock.co/news/defi/2022-06-20-new-solend-vote-invalidates-governance-decision-to-take-over-whale-account-153011); [Decrypt](https://decrypt.co/103330/solana-lending-dao-overturns-vote-to-take-over-at-risk-whale-wallet)                                                                                                                                   |
| 2022-07-02                           | Crema Finance (CLMM)                       | ~$8.8M (early OtterSec estimate ~$6M)                              | Fake tick account got past the owner check because the attacker wrote the pool's real tick address into it; Solend flash loans used to claim inflated fees                            | [CertiK](https://www.certik.com/blog/crema-finance-exploit); [Ackee](https://ackee.xyz/blog/2022-solana-hacks-explained-crema-finance/)                                                                                                                                                                                                                                                 |
| 2022-07-28                           | Nirvana Finance (ANA/NIRV)                 | ~$3.5M                                                             | $10M USDC Solend flash loan; the protocol's own pricing pushed ANA from $8 to $24 through the "Buy 3" path, then drained the treasury; NIRV depegged                                  | [The Block](https://www.theblock.co/post/159975/solana-stablecoin-nirvana-sinks-90-amid-3-5-million-flash-loan-exploit); [CertiK](https://www.certik.com/blog/nirvana-finance-incident-analysis)                                                                                                                                                                                        |
| 2022-08-29                           | OptiFi (options DEX)                       | $661K permanently locked                                           | The deployer meant to close an aborted upgrade buffer and closed the main program instead; PDAs and vaults became unreachable                                                         | [The Block](https://www.theblock.co/post/166445/optifi-locks-up-661000-by-accidentally-shutting-itself-down); [Decrypt](https://decrypt.co/108585/solana-defi-exchange-optifi-bricks-itself-loses-661k)                                                                                                                                                                                 |
| 2022-10-11                           | Mango Markets (margin/lending)             | ~$114–116M                                                         | Thin MNGO spot and perp liquidity let the oracle price be pushed from ~$0.038 to $0.91; the attacker borrowed against the inflated collateral; $67M returned to the DAO               | [Cointelegraph](https://cointelegraph.com/magazine/how-low-liquidity-led-to-mango-markets-losing-over-116-million); [Solidus Labs](https://www.soliduslabs.com/post/mango-hack); [The Block](https://www.theblock.co/post/176445/hacker-steals-over-100-million-from-mango-markets)                                                                                                     |
| 2024-12-02                           | @solana/web3.js (supply chain)             | ~$160K                                                             | Phished npm maintainer account published 1.95.6/1.95.7, which exfiltrated private keys                                                                                                | [Decrypt](https://decrypt.co/294742/solana-web3-js-library-compromised-in-targeted-supply-chain-attack); [The Hacker News](https://thehackernews.com/2024/12/researchers-uncover-backdoor-in-solanas.html)                                                                                                                                                                              |
| 2025-04-16 to 18                     | Token-2022 ZK ElGamal Proof program (core) | $0 (zero-day, patched)                                             | Fiat-Shamir transcript left out algebraic components, so forged proofs would have allowed unlimited minting or theft for confidential-transfer mints                                  | [Solana post-mortem](https://solana.com/news/post-mortem-may-2-2025); [The Block](https://www.theblock.co/post/353055/solana-validators-patch-zero-day-bug-that-could-have-led-to-unlimited-minting-of-certain-tokens)                                                                                                                                                                  |
| 2025-04-26                           | Loopscale (lending)                        | ~$5.8M (5.7M USDC + 1,200 SOL), ~12% of TVL                        | Loopscale's own pricing of RateX PT collateral was manipulated, so under-collateralised loans drained the USDC and SOL Genesis Vaults; funds returned for a 10% bounty                | [Blockworks](https://blockworks.co/news/loopscale-loss-oracle-attack); [Halborn](https://www.halborn.com/blog/post/explained-the-loopscale-hack-april-2025); [rekt](https://rekt.news/loopscale-rekt)                                                                                                                                                                                   |
| 2025 (disclosure date not confirmed) | marginfi (lending)                         | $0 (bug bounty); >$160M at risk                                    | A new instruction, `transfer_to_new_account`, could move liabilities to a new account mid-flash-loan and so skip the repayment check                                                  | [Asymmetric Research](https://blog.asymmetric.re/threat-contained-marginfi-flash-loan-vulnerability/); [Blockworks](https://blockworks.co/news/marginfi-flash-loan-bug)                                                                                                                                                                                                                 |
| 2026-04-01                           | Drift Protocol (perps/lending)             | ~$285.3M ($285,279,417.69 per BlockSec; other sources $280M–$295M) | Admin takeover through 2-of-5 Squads Security Council with zero timelock, using durable-nonce pre-signed transactions; fake CVT collateral, attacker oracle, withdrawal limits raised | [BlockSec](https://blocksec.com/blog/drift-protocol-incident-multisig-governance-compromise-via-durable-nonce-exploitation); [Range](https://range.org/blog/inside-the-drift-exploit-how-to-protect-your-protocol-and-multisigs-against-dprk-threat-actors); [Bloomberg](https://www.bloomberg.com/news/articles/2026-04-01/solana-based-defi-project-drift-hit-by-285-million-exploit) |
| 2026-07-16                           | DefiTuna (CLMM + lending)                  | ~$580K from USDC lending pool (self-reported)                      | Root cause not published; classified as a lending-logic flaw; pool left with a matching deficit                                                                                       | [SigintZero](https://sigintzero.com/blog/defituna-580k-lending-exploit); [Crypto Times](https://www.cryptotimes.io/2026/07/17/solana-protocol-defituna-hit-by-580k-exploit-usdc-pool-left-short/)                                                                                                                                                                                       |
| 2026-07                              | Allbridge Core (bridge)                    | ~$1.65M                                                            | Flash-loan price manipulation, using $1.12M USDC borrowed from Kamino [secondary]                                                                                                     | [Crypto Times](https://www.cryptotimes.io/2026/07/20/allbridge-core-hit-by-1-65m-solana-flash-loan-exploit-its-second-since-2023/)                                                                                                                                                                                                                                                      |

**Detail per incident**

- **Wormhole (2022-02-02):** The deprecated `load_current_index` and `load_instruction_at` functions did not check the sysvar address. Solana toolchain 1.9.4 replaced them with checked variants. A commit moving to 1.9.4 was pushed publicly on 2022-01-13 but had not been deployed, and it incidentally fixed the bug. The attacker bridged 93,750 of the forged wETH back to Ethereum. Jump Crypto put 120,000 ETH back the next day. — [Wormhole incident report](https://wormholecrypto.medium.com/wormhole-incident-report-02-02-22-ad9b8f21eec6)
- **Wormhole follow-up:** In May 2022 Wormhole paid satya0x a $10M bounty for a separate Ethereum core-bridge bug. At the time it was the largest bounty on record (previous record: $2M from Polygon). — [The Block](https://www.theblock.co/post/148085/wormhole-announces-10-million-bug-bounty-payout)
- **Cashio (2022-03-23):** The protocol had no root of trust for its account chain. A similar gap in `depositor_source` let the attacker register a fake bank. Collateral was sold for $27.2M. Cashio was unaudited. — [CertiK](https://www.certik.com/blog/cashio-app-incident-analysis); [Halborn](https://halborn.com/explained-the-cashio-hack-march-2022/)
- **Crema (2022-07-02):** Crema first offered an $800K bounty. The attacker kept 45,455 SOL (~$1.5–1.6M) and returned the rest. The code is closed source, so public analysis is limited. — [Ackee](https://ackee.xyz/blog/2022-solana-hacks-explained-crema-finance/); [FXEmpire](https://fxempire.com/news/article/crema-hacker-returns-8-million-after-accepting-1-6-million-bounty-1056775)
- **Nirvana (2022-07-28):** Closed source, and only an automated audit before the exploit. ANA fell ~85–89%. A $300K whitehat bounty was offered. — [Ackee](https://ackee.xyz/blog/2022-solana-hacks-explained-nirvana/); [The Block](https://www.theblock.co/post/159975/solana-stablecoin-nirvana-sinks-90-amid-3-5-million-flash-loan-exploit)
- **Mango (2022-10-11), legal outcome:** Eisenberg was convicted in April 2024. Judge Subramanian (SDNY) vacated the fraud and manipulation convictions on 2025-05-23 (Rule 29). The court reasoned that "Mango Markets was permissionless and automatic" and had no explicit rules against the trade. It also found venue improper. — [TRM Labs](https://www.trmlabs.com/resources/blog/breaking-federal-judge-overturns-all-criminal-convictions-in-mango-markets-case-against-avraham-eisenberg); [The Block](https://www.theblock.co/post/355666/u-s-judge-overturns-fraud-convictions-of-mango-markets-exploiter-eisenberg-determining-improper-venue)
- **Solend (June 2022):** One whale's position held most of the SOL deposits (~95% in the proposal's framing). The team wanted an OTC unwind to avoid on-chain liquidation causing bad debt. SLND2 invalidated SLND1 with 99.8% "yes" and lengthened voting from 6 hours to 1 day. Critics called account takeover "a terrible precedent". — [The Block](https://www.theblock.co/news/defi/2022-06-20-new-solend-vote-invalidates-governance-decision-to-take-over-whale-account-153011); [Decrypt](https://decrypt.co/103330/solana-lending-dao-overturns-vote-to-take-over-at-risk-whale-wallet)
- **OptiFi (2022-08-29):** About 95% of the locked funds belonged to a team member. Users were refunded manually using Pyth settlement prices. The program ID could not be redeployed. OptiFi asked Solana for two-step confirmation on destructive CLI commands and adopted "peer-surveillance" for deployments. — [The Block](https://www.theblock.co/post/166445/optifi-locks-up-661000-by-accidentally-shutting-itself-down); [Decrypt](https://decrypt.co/108585/solana-defi-exchange-optifi-bricks-itself-loses-661k)
- **Loopscale (2025-04-26):** The protocol had launched only weeks earlier. RateX said its own protocol had no flaw and that the issue was Loopscale's pricing of PT tokens. Loopscale halted markets, re-enabled repayments the next day, and recovered funds through a negotiated 10% bounty. Users suffered no losses. — [Blockworks](https://blockworks.co/news/loopscale-loss-oracle-attack); [Halborn](https://www.halborn.com/blog/post/explained-the-loopscale-hack-april-2025)
- **ZK ElGamal (April 2025):** Reported 2025-04-16. Validators were contacted privately from 04-17 and a supermajority had patched by about 20:00 UTC on 04-18. A second, similar issue required another patch. There was no known exploit. Paxos said confidential transfers were not live on its stablecoins. — [Solana post-mortem](https://solana.com/news/post-mortem-may-2-2025); [The Block](https://www.theblock.co/post/353055/solana-validators-patch-zero-day-bug-that-could-have-led-to-unlimited-minting-of-certain-tokens)
- **marginfi (2025):** Found by Felix Wilhelm (Asymmetric Research) through the bug bounty. The patch blocks account transfers during flash loans and stops disabled accounts from being used for repayment. — [Asymmetric](https://blog.asymmetric.re/threat-contained-marginfi-flash-loan-vulnerability/); [Blockworks](https://blockworks.co/news/marginfi-flash-loan-bug)
- **Drift (2026-04-01), timeline:**
  - 03-11: the attacker funded from Tornado Cash, deployed CVT with 750M units, then seeded Raydium liquidity and wash-traded to build a price history near $1.
  - 03-23: four durable nonce accounts were created, two tied to council members and two attacker-controlled.
  - 03-27: a council migration invalidated the earlier signatures.
  - 03-30: a new nonce account appeared, tied to an updated member.
  - 04-01: two pre-signed transactions landed four slots apart. The first created and approved an admin-transfer proposal. The second ran `AdvanceNonceAccount`, then `proposalApprove`, then `vaultTransactionExecute`, which called `UpdateAdmin`.
  - The attacker then listed CVT, switched to an oracle it controlled, relaxed withdrawal limits and circuit breakers, and made 31 withdrawals over ~12 minutes (USDC, JLP, SOL, cbBTC, USDT and others).
  - [BlockSec](https://blocksec.com/blog/drift-protocol-incident-multisig-governance-compromise-via-durable-nonce-exploitation)
- **Drift, social engineering:**
  - From fall 2025 the attackers posed as a quant firm. They met contributors at conferences, deposited more than $1M into Drift's Ecosystem Vault and shared repos and apps.
  - One contributor cloned a repo whose VS Code `tasks.json` used `runOn: folderOpen`. Another installed a TestFlight "beta wallet".
  - Before the migration, admin actions typically had a 24–72h delay. The new 2-of-5 council had zero timelock.
  - Withdrawal limits were raised 20x.
  - [Range](https://range.org/blog/inside-the-drift-exploit-how-to-protect-your-protocol-and-multisigs-against-dprk-threat-actors)
- **Drift, attribution:** Attribution to DPRK (TRM Labs) is reported in secondary sources [unverified primary]. — [BlockSec](https://blocksec.com/blog/drift-protocol-incident-multisig-governance-compromise-via-durable-nonce-exploitation)
- **Drift, recovery:**
  - Claims for the DFX token (1 DFX per USDT of verified loss) opened 2026-10-01.
  - First payout was ~0.0104 USDT per DFX (~1% of losses), from a ~$3.1M pool. Up to $147.5M in partner commitments has not yet reached the pool.
  - About $9.2M of stolen funds is frozen, pending a law-enforcement order.
  - The claim window closes 2028-01-01.
  - [The Block](https://www.theblock.co/news/ecosystems/2026-10-02-drift-opens-exploit-recovery-claims-initial-payouts-just-over-1-user-losses-417581)
- **Drift, insurance fund:** Drift says the Insurance Fund "was and remains unaffected". Unstaking carries a 13-day cooldown. — [CoinCentral](https://coincentral.com/drift-protocol-says-insurance-fund-deposits-remain-safe-after-280m-exploit/)
- **DefiTuna (2026-07-16):**
  - DefiTuna disclosed about 7 hours after the attack. No transaction-level analysis has been published.
  - Sec3's March 2025 audit (commit `7ced6e0`) had flagged issues that were fixed before launch:
    - `repay_debt` used `saturating_sub`, so a repayment could exceed the actual debt.
    - `liquidate_position_orca` accepted mints not bound to the pool, which could feed wrong decimals into the oracle price check.
  - Whether the drained code matched the audited commit is unknown.
  - [SigintZero](https://sigintzero.com/blog/defituna-580k-lending-exploit)

### Inferences

- Account-validation bugs (Wormhole, Cashio, Crema) were the main loss pattern in 2022. Anchor's typed accounts and constraints, plus audit maturity, made them rarer afterwards. Losses since 2025 have come from collateral pricing (Loopscale), new instructions breaking cross-instruction invariants (marginfi), and privileged-access and governance attacks (Drift). Mercury's threat model should weight admin and oracle paths at least as heavily as instruction-level bugs.
- Drift shows that a "non-custodial" program is effectively custodial when one admin key, here a 2-of-5 multisig with no timelock, can list collateral, swap oracles and raise withdrawal limits. Users keeping custody of their Privy wallets does not protect deposits once they sit in a program the admin can reconfigure instantly.
- Mango, Nirvana, Loopscale and Drift's CVT all hinge on letting a thinly traded or self-referential price set borrowing power. For xStocks, Mercury must not derive collateral value from on-chain DEX trades in xStocks.
- Recovering funds through a negotiated bounty worked for Crema and Loopscale. It did not work for state-linked attackers (Drift; Radiant in section 2), and the Mango ruling suggests exploiting a permissionless market may not even be prosecutable. Legal recourse is not a backstop.

### Gaps

- No official Drift post-mortem was found, and Drift had said one would follow. Details rely on BlockSec and Range.
- I found no primary marginfi disclosure date or bounty amount.
- The DefiTuna root cause is unpublished.
- Some sources tie the Nirvana and Crema attacker to Shakeeb Ahmed, later prosecuted by the DOJ. My searches did not confirm this.
- I could not confirm reports of a second ZK ElGamal bug in mid-2025 that led to the program being disabled.
- Exact Cashio loss: sources vary between ~$48M and $52.8M.

---

## 2. EVM lending and vault incidents, and curator, strategy and yield-bearing-dollar failures (Euler, Compound, Cream, Hundred, ERC-4626 inflation, Radiant, Stream xUSD, Elixir deUSD, Resolv, others)

### Takeaway

Two groups of EVM failures matter for Mercury's design.

- **Accounting and pricing primitives:** donations that inflate exchange rates (Cream, Hundred, Sonne, ResupplyFi), missing health checks on new paths (Euler), and single-venue oracles (Compound 2020, Binance USDe 2025).
- **Off-chain trust:** multisig signer compromise (Radiant), privileged mint keys with no on-chain cap (Resolv), and curators lending into opaque off-chain strategies (Stream xUSD, then deUSD, then Morpho/Euler curated vaults).

The late-2025 curator crisis showed that isolated markets limit contagion only as far as the curator's choices allow, and that fixed or manual oracles on synthetic dollars prevent liquidations.

### Cited Findings

**Incident catalogue (EVM and cross-chain)**

| Date          | Protocol                           | Loss                                                      | Root cause                                                                                                                                                                                       | Source                                                                                                                                                                                                                                                                                                                                 |
| ------------- | ---------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2020-11-26    | Compound                           | ~$89M liquidated ($88.4M on-chain per The Block)          | DAI briefly hit $1.30 on Coinbase Pro, the oracle's source venue, triggering mass liquidations                                                                                                   | [The Block](https://www.theblock.co/post/85850/dai-compound-dydx-liquidations-defi); [Decrypt](https://decrypt.co/49657/oracle-exploit-sees-100-million-liquidated-on-compound)                                                                                                                                                        |
| 2021-10-27    | Cream Finance v1                   | ~$130M (some say $136M)                                   | Transferring y-tokens directly into the yUSD vault inflated `pricePerShare`, which Cream used as its collateral price                                                                            | [Immunefi](https://immunefi.com/blog/bug-fix-reviews/hack-analysis-cream-finance-oct-2021/); [SlowMist](https://slowmist.medium.com/cream-hacked-analysis-us-130-million-hacked-95c9410320ca)                                                                                                                                          |
| 2023-03-13    | Euler Finance                      | ~$197M                                                    | `donateToReserves` (added in eIP-14) had no health check; self-liquidation with a large discount was profitable; on-chain for ~8 months                                                          | [Swivel post-mortem](https://swivel.substack.com/p/post-mortem-euler-liquidation-vulnerability); [rekt](https://rekt.news/euler-rekt); [Zellic](https://www.zellic.io/blog/euler-finance-exploit-analysis)                                                                                                                             |
| 2023-04       | Hundred Finance (Compound v2 fork) | ~$7.4–7.5M                                                | Exchange rate of an empty market inflated by donation, plus rounding in redeem                                                                                                                   | [Sonne post-mortem](https://medium.com/@SonneFinance/post-mortem-sonne-finance-exploit-12f3daa82b06); [Verichains](https://blog.verichains.io/p/compound-v2-forked-vulnerability)                                                                                                                                                      |
| 2024-05-14/15 | Sonne Finance (Compound v2 fork)   | ~$20M ($6.5M saved)                                       | Same empty-market donation bug; timelocked market-add and c-factor transactions could be executed by anyone, so the attacker executed them                                                       | [Sonne post-mortem](https://medium.com/@SonneFinance/post-mortem-sonne-finance-exploit-12f3daa82b06); [CertiK](https://www.certik.com/blog/sonne-finance-incident-analysis); [The Block](https://www.theblock.co/news/ecosystems/2024-05-15-lending-protocol-sonne-finance-faces-20-million-exploit-pauses-markets-on-optimism-294508) |
| 2024-10-16    | Radiant Capital                    | ~$50M                                                     | Malware on 3 developers' devices; Safe UI showed legitimate data while malicious `transferOwnership` was signed (Ledger blind signing); thresholds 3/11 (Arbitrum, BSC) and 3/9 (Ethereum, Base) | [Radiant post-mortem](https://medium.com/@RadiantCapital/radiant-post-mortem-fecd6cd38081)                                                                                                                                                                                                                                             |
| 2025-01       | Usual USD0++                       | Several hundred $M of DeFi positions at risk [unverified] | Redemption parameters of a yield-bearing token changed without prior discussion; depeg                                                                                                           | [Leviathan News](https://leviathannews.substack.com/p/collateral-damage-usd0-depeg-leaves)                                                                                                                                                                                                                                             |
| 2025-06-26    | ResupplyFi                         | ~$9.56–9.8M                                               | Collateral priced from ERC-4626 `convertToAssets()` of a near-empty vault; a donation inflated the price, so `1e36/price` floored to 0 and the solvency check passed with zero exchange rate     | [Ackee](https://ackee.xyz/blog/resupply-hack-analysis/); [SolidityScan](https://blog.solidityscan.com/resupplyfi-hack-analysis-d4e3baaa294a/); [rekt](https://rekt.news/resupplyfi-rekt)                                                                                                                                               |
| 2025-10-10    | Binance (USDe, wBETH, BNSOL)       | $283M compensated                                         | Binance's collateral index priced USDe from its own order book; USDe printed <$0.66 on Binance only                                                                                              | [The Block](https://www.theblock.co/post/374295/binance-pays-283-million-in-compensation-following-fridays-depegs-covering-user-losses); [Decrypt](https://decrypt.co/344026/binance-reimburses-283m-after-market-crash-and-asset-depegging-issues)                                                                                    |
| 2025-11-04    | Stream Finance xUSD                | $93M fund-manager loss; ~$285M lender exposure            | Off-chain, rehypothecated strategy run by an external manager; withdrawals frozen; xUSD fell ~77%                                                                                                | [Decrypt](https://decrypt.co/347285/stream-finance-stablecoin-plunges-77-protocol-fund-manager-loses-93-million); [The Defiant](https://thedefiant.io/news/defi/contagion-fears-loom-as-stream-finance-discloses-usd93-million-loss)                                                                                                   |
| 2025-11       | Elixir deUSD                       | deUSD to ~$0.015; ~65% of backing exposed                 | $68M lent to Stream, which also held ~90% of deUSD supply; sunset                                                                                                                                | [The Block](https://www.theblock.co/post/377961/elixir-sunsets-deusd-synthetic-stablecoin-following-stream-finance-unwinding-aims-full-redemptions)                                                                                                                                                                                    |
| 2025-11       | Stables Labs USDX                  | Low ~$0.30–0.39 [unverified cause]                        | Hedged-position liquidations reportedly tied to the Balancer exploit; stale portfolio disclosures                                                                                                | [ForkLog](https://forklog.com/en/usdx-stablecoin-loses-its-dollar-peg-drops-to-0-30/)                                                                                                                                                                                                                                                  |
| 2026-03-22    | Resolv USR                         | 80M USR minted; ~$23.8–26.8M extracted                    | SERVICE_ROLE signing key (in AWS KMS) compromised; contract had no maximum mint cap and no oracle or amount check                                                                                | [CertiK](https://certik.com/blog/resolv-protocol-incident-analysis); [The Block](https://www.theblock.co/post/394582/resolvs-usr-stablecoin-depegs-after-attacker-mints-80-million-unbacked-tokens-extracts-roughly-25-million); [rekt](https://rekt.news/resolv-labs-rekt)                                                            |
| 2026-06-20    | Morpho vault "AlphaUSDC Delta V2"  | ~$18M [single original report]                            | Concentrated in one msY (Main St Finance) market; msY fell ~85%; 100% utilisation blocked withdrawals; curator had stopped its collateral verification service                                   | [KuCoin News](https://www.kucoin.com/news/flash/morpho-blue-vault-loses-18m-as-msy-token-collapses-85)                                                                                                                                                                                                                                 |

**Detail: accounting and oracle primitives**

- **Euler:** The attacker used two contracts: a violator that took on bad debt through `donateToReserves`, and a liquidator. Omniscia, one of Euler's auditors, called it "bad debt created by omission". A Sherlock coverage claim paid $3.3M. — [Swivel](https://swivel.substack.com/p/post-mortem-euler-liquidation-vulnerability); [CryptoDaily](https://cryptodaily.co.uk/2023/03/euler-finance-hack-postmortem-reveals-8-month-old-vulnerability)
- **Sonne's mitigation for the empty-market bug:** Create a market at 0% collateral factor, add collateral and burn it, and only then raise the c-factor. In the exploit, the attacker valued 2 wei of soVELO at 35,471,603 VELO, and the redeem amount rounded down from 1.999994 to 1. — [Sonne post-mortem](https://medium.com/@SonneFinance/post-mortem-sonne-finance-exploit-12f3daa82b06); [CertiK](https://www.certik.com/blog/sonne-finance-incident-analysis)
- **ERC-4626 inflation attack (generic):** The attacker front-runs the first deposit and donates to round the victim's shares down. Only u+1 assets are needed to attack a deposit of u. OpenZeppelin's defence is a decimals offset plus virtual shares and assets in the exchange rate. With offset 0, the attacker's loss is already at least the victim's deposit. Larger offsets make the attack orders of magnitude unprofitable. — [OpenZeppelin ERC-4626 docs](https://docs.openzeppelin.com/contracts/5.x/erc4626)
- **ResupplyFi:** No `require(_exchangeRate > 0)` check. The market had just been deployed. Sources disagree on the affected market (cvcrvUSD per Ackee and SolidityScan, wstUSR per Veridise and rekt). — [Ackee](https://ackee.xyz/blog/resupply-hack-analysis/); [Veridise](https://veridise.com/blog/audit-insights/resupplyfi-hack-audit-habit/)
- **Binance:** After the depeg, Binance added redemption prices to the index weights and a soft floor for USDe. Ethena said deeper venues showed no abnormal deviation. — [The Block](https://www.theblock.co/post/374295/binance-pays-283-million-in-compensation-following-fridays-depegs-covering-user-losses); [21Shares](https://www.21shares.com/research/why-did-ethenas-stablecoin-remain-stable-onchain-but-depegged-on-binance)

**Detail: key and signer compromise**

- **Radiant, exploit:** Malicious contracts were deployed on 2024-10-02, two weeks before the drain. On BSC, ownership of LendingPoolAddressesProvider was transferred after an automated pause, bypassing it. Tenderly simulations looked normal. Safe showed errors that prompted re-signing. — [Radiant post-mortem](https://medium.com/@RadiantCapital/radiant-post-mortem-fecd6cd38081)
- **Radiant, remediation:** fresh cold wallets, 4/7 thresholds, 72-hour minimum timelock on upgrades and ownership transfers, separated roles with no "super" role, and decoding calldata independently instead of blind signing. — [Radiant post-mortem](https://medium.com/@RadiantCapital/radiant-post-mortem-fecd6cd38081)
- **Radiant, attribution:** Mandiant attributed the attack to UNC4736 (AppleJeus/Citrine Sleet, DPRK nexus). Initial access was a Telegram message impersonating a contractor that delivered the INLETDRIFT macOS backdoor [secondary]. — [OneKey summary](https://onekey.so/blog/ecosystem/one-pdf-50m-gone-the-radiant-capital-hack-explained); [Crowdfund Insider](https://www.crowdfundinsider.com/2025/01/234959-radiant-capital-shares-update-after-sophisticated-cyberattack-leading-to-50m-in-losses/)
- **Resolv, mint path:**
  - Mint approvals relied on an off-chain service holding a privileged key. CertiK describes two `completeSwap()` calls: ~50M USR, then ~30M USR about 2 hours later.
  - The attacker deposited only ~100–200K USDC.
  - USR traded at ~$0.025 on Curve within 17 minutes.
  - [CertiK](https://certik.com/blog/resolv-protocol-incident-analysis); [Unchained](https://unchainedcrypto.com/a-compromised-aws-key-just-cost-this-defi-protocol-25-million/)
- **Resolv, key compromise:** Rekt, citing the official post-mortem, says the key was reached through a contractor's GitHub credential obtained after a compromise at a third-party project. — [rekt](https://rekt.news/resolv-labs-rekt)
- **Resolv, disputed figures:** Burn figures conflict ($9M vs 36.73M USR burned through a later contract upgrade), and Resolv's claim that collateral "remains intact" is disputed. — [The Block](https://www.theblock.co/post/394582/resolvs-usr-stablecoin-depegs-after-attacker-mints-80-million-unbacked-tokens-extracts-roughly-25-million)

**Detail: curator, strategy and rehypothecation (Stream, Elixir, Morpho, Euler)**

- **Stream, creditor exposure:** Yields and More estimated ~$285M of debt exposure across Euler, Silo, Morpho and Gearbox. The largest curator creditors were TelosC (~$123.6–124M), Elixir ($68M), MEV Capital (~$25–34M), Varlamore and Re7. — [Decrypt](https://decrypt.co/347285/stream-finance-stablecoin-plunges-77-protocol-fund-manager-loses-93-million); [Parsec](https://parsec.substack.com/p/parsec-weekly-138); [ForkLog](https://forklog.com/en/news/collateral-damage-from-stream-finance-hack-estimated-at-285-million)
- **Stream, oracle failure:** Several vaults priced xUSD with fixed or manually updated oracles. Combined with slow triggers and thin liquidity, this stopped liquidations from firing. — [Parsec](https://parsec.substack.com/p/parsec-weekly-138)
- **Stream, bad debt:** A frozen oracle price contributed to ~$650K of USDC bad debt, mainly for MEV Capital depositors [single secondary source]. — [Blockmedia](https://www.blockmedia.co.kr/research-english/1007567)
- **Stream, TVL impact:** Euler and Morpho each reportedly lost $400–600M of TVL on the day. — [The Defiant](https://thedefiant.io/news/defi/contagion-fears-loom-as-stream-finance-discloses-usd93-million-loss)
- **Stream, communication:** Users noticed the depeg before the team said anything publicly. — [Parsec](https://parsec.substack.com/p/parsec-weekly-138)
- **Curated-vault losses:**
  - MEV Capital USDC vaults (holding sdeUSD and xUSD) imposed haircuts of 3.5% on Ethereum and 12% on Arbitrum.
  - Re7 disclosed $14.65M in an isolated xUSD/USDT0 cluster on Plasma plus $12.75M of bad collateral across Euler and Morpho.
  - Silo reported $15.4M of exposure.
  - Morpho's CEO said only 1 of ~320 Morpho vaults had limited xUSD exposure and argued "lending infrastructure must remain separate from risk management".
  - Morpho and Euler both moved to add third-party risk scores.
  - [aggregator: MEXC News](https://www.mexc.com/news/has-defi-learned-anything-from-yield-vault-collapse/171234) [secondary, verify against Morpho/Euler primary posts]
- **Elixir:** Processed redemptions for 80% of deUSD holders and snapshotted the rest for 1:1 USDC claims. It disabled withdrawals partly to "remove any risk of Stream liquidating deUSD before repaying their loan". Stream made up 99%+ of Elixir's lending positions. — [The Block](https://www.theblock.co/post/377961/elixir-sunsets-deusd-synthetic-stablecoin-following-stream-finance-unwinding-aims-full-redemptions); [Cointelegraph](https://cointelegraph.com/news/elixir-sunsets-stablecoin-amid-stream-finance-saga)
- **Elixir, aftermath:** Curve's forum said deUSD mint and redemption are disabled permanently and deUSD and sdeUSD are worth zero on secondary markets. — [Curve governance](https://gov.curve.finance/t/kill-gauges-on-all-elixir-markets-deusd-sdeusd/10925)
- **Morpho bad-debt handling depends on vault version:** V1.0 vaults realise bad debt immediately and share it pro rata across lenders. V1.1 vaults do not automatically realise it on existing depositors. — [Morpho docs](https://docs.morpho.org/morpho/concepts/advanced-concepts/bad-debt)
- **Curator discretion:** Curators decide which markets a vault lends into and set the caps, and front ends often route deposits without making the curator prominent. — [Allium](https://allium.so/blog/morpho-who-controls-your-deposit/)

### Inferences

- **Donation-proof accounting is mandatory.** The common thread in Cream, Hundred, Sonne and ResupplyFi is reading an exchange rate or price from a balance anyone can top up. On Solana the analogue is computing share price from the vault token account's live balance, since anyone can transfer USDC or xStocks into a PDA-owned ATA. Mercury should keep internal `total_assets` and `total_shares`, use virtual shares and an offset (or a seeded, burned initial deposit), and reject zero or near-zero rates.
- **Every new instruction can break global invariants.** Euler's donate path and marginfi's `transfer_to_new_account` were both added after audit. Each new instruction needs an explicit "health factor and solvency hold after this instruction" check. Invariant fuzzing should include the new instruction combined with flash loans.
- **Avoid curator risk by design.** A Mercury vault that lends only to its own over-collateralised xStock borrowers, with no third-party curator and no off-chain strategy, avoids the Stream/Elixir class of failure entirely. Any future "boost" that routes USDC into external vaults or synthetic dollars imports that risk, including rehypothecation chains (xUSD backing deUSD backing sdeUSD vaults).
- **Fixed or "hardcoded $1" oracles on collateral are dangerous.** They mute liquidations exactly when they are needed. If Mercury ever accepts a stablecoin or synthetic dollar as collateral, price it from market or redemption value with depeg circuit breakers.
- **Cap privileged mint and transfer paths on-chain.** Resolv shows that an off-chain signer with no on-chain rate limit or cap will be drained once compromised. Any keeper or relayer role in Mercury (liquidation bots, oracle pushers, rebalancers) needs on-chain bounds per transaction and per epoch.
- **Timelocks must not hand attackers an execution window.** Sonne shows that if timelocked actions can be executed by anyone, or bundled in a way that exposes an empty market, the timelock helps the attacker. Mercury should seed new markets atomically and execute timelocked actions only through an authorised executor.

### Gaps

- No primary Morpho or Euler post-mortems on xUSD were retrieved. Several curator figures come from aggregators.
- Final recovery for xUSD holders is unknown. Stream Soft Holding is collecting claims in two creditor classes: direct holders and curators.
- I found no primary sources for the mechanics of Usual USD0++ (Jan 2025) or USDX (Nov 2025).
- Resolv's official post-mortem was not fetched directly.
- Euler's later fund recovery (the attacker returned funds in 2023) is widely reported but was not verified in this session's sources.
- I found no primary account of Compound's 2021 Proposal 062 distribution bug.

---

## 3. Oracle risk for thinly traded or off-hours collateral (tokenized equities): manipulation, staleness, weekend gaps, corporate actions and multipliers

### Takeaway

xStocks have no reliable on-chain price discovery when US markets are closed. The standard design (Chainlink, Jupiter Lend, Kamino) prices off the underlying equity and holds the last price over weekends. That creates gap risk at Monday open, earnings and corporate actions.

Chainlink's own 24/5 equities guide says these cases need explicit logic:

- market status Closed (5) and Unknown (0);
- staleness;
- invalid or zero mids;
- halts, which the market-status field does not flag;
- corporate actions.

xStocks deliver dividends by changing a Token-2022 Scaled UI multiplier, so raw balances and oracle prices must be reconciled in consistent units.

### Cited Findings

- **Chainlink 24/5 US Equities Streams:**
  - Launched 2026-01-20. Covers regular, pre-market, post-market and overnight sessions, with market-status flags, bid/ask, volumes and staleness fields. — [The Block](https://www.theblock.co/post/386387/chainlink-24-5-onchain-data-streams-tokenized-us-stocks-etfs); [Chainlink docs](https://docs.chain.link/data-streams/rwa-streams/24-5-us-equities-user-guide)
  - Market status codes: 0 Unknown, 1 Pre-market, 2 Regular, 3 Post-market, 4 Overnight, 5 Closed. Weekends, holidays and unexpected closures are status 5, and all three streams carry stale values then. Traditional venues do not trade at weekends. — [Chainlink docs](https://docs.chain.link/data-streams/rwa-streams/24-5-us-equities-user-guide)
  - Overnight data comes from a single provider. Risks include outages, erroneous quotes, and zero or invalid `mid` values while timestamps still advance. `marketStatus` does not reveal halts or outages. The overnight provider may disable symbols during dividends, splits or mergers without a status change, so `lastSeenTimestampNs` must be monitored. — [Chainlink docs](https://docs.chain.link/data-streams/rwa-streams/24-5-us-equities-user-guide)
  - Session transitions typically jump 1–2%, and 10–20%+ is possible in thin periods or on news. At the regular open, illiquid names may show the prior close for several minutes. — [Chainlink docs](https://docs.chain.link/data-streams/rwa-streams/24-5-us-equities-user-guide)
  - Recommended safeguards:
    - pick the stream by market status;
    - handle statuses 0 and 5 deterministically;
    - set a staleness threshold (example: 5 minutes);
    - reject zero or out-of-range mids;
    - treat spread widening as a sign of a distorted mid;
    - add deviation circuit breakers;
    - pause, or restrict to a narrow band around the last valid price;
    - smooth across session transitions (EMA, VWAP, TWAP);
    - do not act on feed data while the market is closed;
    - when using tokenized-asset prices as a fallback, divide by the Total Return Tracker multiplier.
    - [Chainlink docs](https://docs.chain.link/data-streams/rwa-streams/24-5-us-equities-user-guide)
  - `lastTradedPrice` is deprecated as a production input, and dependencies should be removed by 2026-10-12. — [Chainlink docs](https://docs.chain.link/data-streams/rwa-streams/24-5-us-equities-user-guide)
- **Jupiter Lend xStocks risk assessment (2026-04-15):**
  - Oracle is a Chainlink underlying-equity feed, which holds the last traded price nights, weekends and holidays. During those windows xStocks have no on-chain price discovery, and RFQ is the only exit.
  - Main concern: a Monday-open gap with no intermediate liquidation opportunity.
  - Corporate actions (splits, mergers, reverse splits) are handled by pausing the market until the oracle and token supply update.
  - [Jupiter Lend risk report](https://static-r2.jup.ag/lend/risk-research/xstocks-risk-report.pdf)
- **Jupiter Lend parameters:**

  | Asset | LTV | Liquidation threshold | Penalty | Borrow cap |
  | ----- | --- | --------------------- | ------- | ---------- |
  | SPYx  | 75% | 85%                   | 5%      | $10M       |
  | QQQx  | 75% | 85%                   | 5%      | $10M       |
  | NVDAx | 65% | 75%                   | 7%      | $10M       |
  | TSLAx | 65% | 75%                   | 7%      | $10M       |
  - NVDAx/TSLAx markets are paused from 2 days before to 1 day after earnings.
  - Borrow caps are cut if RFQ sell-side depth falls below $30M.
  - Cited stresses: NVDA fell ~17% in one session in January 2025; TSLA has had 15–25%+ single-session moves.
  - [Jupiter Lend risk report](https://static-r2.jup.ag/lend/risk-research/xstocks-risk-report.pdf)

- **Issuer and custody (same report):** Issuer is Backed Assets (JE) Ltd, a Jersey SPV. Primary custodian is Alpaca Securities and secondary is InCore Bank. Lloyd's of London coverage is up to $175M aggregate. Proof of reserves is weekly with quarterly ISAE 3000 audits. RFQ capacity is >$100M per asset "under normal conditions", but market makers may widen spreads or withdraw during halts or stress. Holders have a contractual claim on the SPV, not direct share ownership. — [Jupiter Lend risk report](https://static-r2.jup.ag/lend/risk-research/xstocks-risk-report.pdf)
- **Kraken xStocks pricing:** Off-hours prices are not pegged to the prior close. Pre- and after-hours prices reference Nasdaq and NYSE extended hours, and overnight prices reference Blue Ocean ATS. Liquidity is thinner and prices more volatile off-hours. — [Kraken support](https://support.kraken.com/gb/articles/market-hours-explained)
- **Scaled UI Amount (Token-2022):** The issuer can apply an updatable multiplier to the displayed amount without minting. UI amount equals raw amount times the multiplier. The config stores the current multiplier plus a pending `new_multiplier` and `new_multiplier_effective_timestamp`. — [Solana docs](https://solana.com/docs/tokens/extensions/scaled-ui-amount)
- **xStocks dividends:** xStocks reinvest net dividends by raising the multiplier, so raw balances stay constant on Solana. The multiplier is reportedly updated around 8:00 PM EST the day before the ex-date [secondary]. — [Degate](https://degate.com/playbook/tokenized-stock-dividends-mechanisms/)
- **Kamino:** Became the first major DeFi lender to accept xStocks as collateral (July 2025, eight assets). — [The Block](https://www.theblock.co/post/362284/solana-based-decentralized-lending-protocol-kamino-integrates-tokenized-xstocks-as-collateral-option); [The Defiant](https://thedefiant.io/news/defi/kamino-becomes-first-major-defi-lender-to-accept-tokenized-stocks-as-collateral)
- **Kraken xStocks vaults (Sept 2026):** Deposit xStocks into Kamino lending, with a 3-day withdrawal because the lending position must unwind. — [Genfinity](https://genfinity.io/2026/09/14/kraken-xstocks-vaults-kamino-veda-sentora-tokenized-stock-yield/)
- **Manipulation precedents:**
  - Mango: MNGO pushed ~2,300% with about $4M of buys across three venues. — [Solidus Labs](https://www.soliduslabs.com/post/mango-hack)
  - Compound 2020: the spike appeared only on the oracle's source venues (Coinbase, Uniswap). — [Decrypt](https://decrypt.co/49657/oracle-exploit-sees-100-million-liquidated-on-compound)
  - Drift 2026: a wash-traded price history made the fake CVT look legitimate. Range recommends verifying collateral liquidity depth and trading history, not just spot price. — [Range](https://range.org/blog/inside-the-drift-exploit-how-to-protect-your-protocol-and-multisigs-against-dprk-threat-actors)

### Inferences

- **Mercury's oracle module should be a state machine keyed on market status:**
  - **Regular session:** full borrow and liquidate.
  - **Extended or overnight:** tighter deviation bands and possibly no new borrows. The overnight source is single-provider.
  - **Closed or Unknown:** no new borrows or withdrawals of collateral that increase LTV. Liquidations only at a conservative reference, such as last close minus a haircut, or deferred until open. Auto-pause if staleness exceeds the threshold.
  - Liquidation-penalty and LTV buffers must cover realistic gaps: single-name gaps of 15–25% suggest at most ~65% LTV and ~75% liquidation threshold, which matches Jupiter's numbers.
- **Unit consistency between oracle price and token balance is a likely bug.** Chainlink's underlying-equity feed prices one share. An xStock's economic exposure per raw token unit changes when the Scaled UI multiplier changes. Collateral value is probably raw amount × multiplier × underlying price per share, but this must be confirmed with Backed and Chainlink for each feed, and pending-multiplier timestamps must be handled atomically. Using the wrong one either undervalues collateral, causing spurious liquidations, or overvalues it, causing bad debt.
- **Corporate-action calendars should be operational inputs.** Splits, mergers, earnings and dividend ex-dates should drive automated market pauses or parameter changes. These should be pre-scheduled and visible to users, not ad-hoc admin actions.
- **Per-asset borrow caps should track RFQ depth**, since liquidation exit depends on RFQ market makers who may withdraw in stress.

### Gaps

- I could not confirm Kamino's off-hours "price band" from Kamino's own docs. One secondary article claims Kamino restricts prices to a band around the last close off-hours.
- I found no confirmed incident of xStocks oracle mispricing or a weekend-gap liquidation event through October 2026.
- No source confirmed whether Chainlink's xStocks feeds price the token (multiplier-adjusted) or the underlying share. The 24/5 guide only mentions TRT multiplier normalisation for fallbacks.
- I did not verify which Token-2022 extensions the xStocks mints carry (e.g., permanent delegate, pausable, freeze authority, transfer hook). The team should read the mint's extension bytes on-chain.

---

## 4. Solana program pitfalls: signer and owner checks, type confusion, PDA collisions, arbitrary CPI, math and rounding, re-init, closing, remaining_accounts, Token-2022 extensions, duplicate mutable accounts, sysvar spoofing; Anchor vs native

### Takeaway

The canonical list of Solana bug classes is well documented (Helius, sealevel-attacks, Anchor docs), and Anchor's typed accounts remove many of them. What Anchor does not cover:

- `remaining_accounts`;
- arithmetic (release builds wrap unless `overflow-checks = true`);
- business-logic invariants across instructions;
- Token-2022 extension semantics.

Mercury takes xStocks, which are Token-2022 mints, as collateral. So it must allowlist extensions, use internal accounting rather than balances, and plan for permanent-delegate burns, transfer fees and hooks, and multipliers.

### Cited Findings

**Core vulnerability classes (Helius guide unless noted)**

| Class                         | Failure mode                                                                       | Mitigation                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Missing signer check          | Privileged action runs without the authority's signature                           | `Signer<'info>` / check `is_signer`                                          |
| Missing owner check           | Accounts not owned by the expected program are trusted (Crema's fake tick account) | Anchor `Account<T>` / `owner` constraint                                     |
| Account data matching         | Stored keys (admin, mint, pool) not compared to supplied accounts (Cashio)         | `has_one` / explicit constraints                                             |
| Type cosplay                  | Account deserialised as the wrong type                                             | Discriminator check (automatic in `Account<T>`)                              |
| PDA sharing / seed collisions | One PDA serves several roles, or different inputs derive the same PDA              | Per-purpose seeds with unique prefixes and identifiers                       |
| Bump canonicalisation         | User-supplied bump creates non-canonical PDAs                                      | `find_program_address` and store the canonical bump; Anchor `seeds` + `bump` |
| Arbitrary CPI                 | Program invokes a caller-supplied program ID                                       | Hardcode or verify the program ID; Anchor CPI modules                        |
| Account reloading             | Deserialised state is stale after a CPI                                            | `reload()`                                                                   |
| Closing accounts              | Lamports drained but data not cleared, so the account can be revived               | Zero data and write a closed discriminator; Anchor `close =`                 |
| Insecure initialisation       | Anyone can call `initialize` first                                                 | Restrict to the upgrade authority via ProgramData                            |
| Duplicate mutable accounts    | Same account passed twice as mutable                                               | Key-inequality constraint                                                    |
| Overflow / precision          | Wraps silently in release builds; divide-before-multiply errors                    | `overflow-checks = true`, `checked_*`, `try_from`, fixed-point math          |
| `remaining_accounts`          | Bypasses Anchor validation                                                         | Manually verify owner, type and key of each                                  |
| Two-step authority transfer   | Single-step handoff risks mistakes or takeover                                     | Nominate-then-accept with a `pending_authority` field                        |
| Sysvars                       | Spoofed sysvar account (Wormhole)                                                  | Use `Sysvar::get()` or check the address                                     |

Sources: [Helius](https://www.helius.dev/blog/a-hitchhikers-guide-to-solana-program-security); Wormhole sysvar case: [Wormhole incident report](https://wormholecrypto.medium.com/wormhole-incident-report-02-02-22-ad9b8f21eec6)

**Notes on specific classes**

- **Overflow checks:** Solana tooling compiles in release mode, where Rust does not check overflow by default. Enabling overflow checks costs compute. — [Helius](https://www.helius.dev/blog/a-hitchhikers-guide-to-solana-program-security)
- **Duplicate mutable accounts, Anchor nuance:** Current Anchor docs say Anchor "prevents duplicate mutable accounts" by default, and `dup` opts out. Older guidance (Helius) says to add explicit key-inequality constraints. Behaviour depends on Anchor version. — [Anchor docs](https://www.anchor-lang.com/docs/references/account-constraints); [Helius](https://www.helius.dev/blog/a-hitchhikers-guide-to-solana-program-security)
- **`init_if_needed`:** Requires the `init-if-needed` cargo feature. The current constraints page carries no explicit reinitialisation warning, so re-init safety has to be enforced by program logic. — [Anchor docs](https://www.anchor-lang.com/docs/references/account-constraints)
- **Subtractive `realloc`:** Anchor warns, "Do not use subtractive realloc on accounts that intentionally hold extra lamports, such as vaults." — [Anchor docs](https://www.anchor-lang.com/docs/references/account-constraints)
- **Anchor vs native:** Anchor automates ownership, signer, discriminator, PDA-seed and close checks. Native programs must write these by hand. — [Helius](https://www.helius.dev/blog/a-hitchhikers-guide-to-solana-program-security)

**Token-2022 extension pitfalls (Neodyme)**

- **Permanent delegate:** Can transfer or burn from any account, including a pool or vault, down to zero. Integrate only trusted delegates and handle accounts that suddenly hold fewer tokens. — [Neodyme](https://neodyme.io/en/blog/token-2022)
- **Transfer hook:**
  - Any mint can attach your hook, so allowlist mints and include the mint in PDA seeds.
  - The hook can be called outside a transfer, so require the `transferring` flag.
  - Token accounts may come from a different mint, so check both accounts' mint fields.
  - The caller may be spoofed, so verify the calling program is Token-2022.
  - Extra accounts are resolved through a TLV-formatted PDA, which is hard to get right.
  - [Neodyme](https://neodyme.io/en/blog/token-2022)
- **Transfer fees:** The recipient receives less than the amount sent, so precompute the fee with `TransferCheckedWithFee` or measure balances before and after. Accounts holding withheld fees can't be closed until harvested. — [Neodyme](https://neodyme.io/en/blog/token-2022)
- **Mint close and reinitialise:** A mint can be closed and recreated at the same address with different extensions, leaving orphaned old token accounts. This enables KYC, soulbound and fee bypasses. Verify the mint was never reinitialised, not just that it currently lacks a close authority. — [Neodyme](https://neodyme.io/en/blog/token-2022)
- **Default account state:** New vault accounts may start frozen, and the freeze authority can change the default later. — [Neodyme](https://neodyme.io/en/blog/token-2022)
- **CPI Guard:** Breaks programs that forward the owner's signature through CPI; use delegation instead. — [Neodyme](https://neodyme.io/en/blog/token-2022)
- **Required memo:** Transfers revert without a memo. — [Neodyme](https://neodyme.io/en/blog/token-2022)
- **Confidential transfers:** Pending-balance counter DoS; privacy leaks; the auditor ElGamal key cannot be updated. — [Neodyme](https://neodyme.io/en/blog/token-2022)
- **Account type detection:** Size-based checks fail because extensions change account size. Unpack with `PodStateWithExtensions`. — [Neodyme](https://neodyme.io/en/blog/token-2022)
- **Extension allowlist:** Allowlist the extension types you support, and review every mint authority (freeze, fee config, permanent delegate). — [Neodyme](https://neodyme.io/en/blog/token-2022)
- **Neodyme's Token-2022 audit (2024-04-22):** Included a self-delegation CPI-guard bypass and mint-resurrection findings. — [Neodyme audit PDF](https://www.neodyme.io/reports/Token%202022%20-%202024.pdf)
- **Confidential transfer cryptography itself has failed:** see the April 2025 ZK ElGamal zero-day. — [Solana post-mortem](https://solana.com/news/post-mortem-may-2-2025)

**Incident-derived pitfalls**

- **New instructions breaking flash-loan invariants:** marginfi's `transfer_to_new_account`. — [Asymmetric](https://blog.asymmetric.re/threat-contained-marginfi-flash-loan-vulnerability/)
- **Saturating arithmetic hiding over-repayment:** DefiTuna's `repay_debt`. — [SigintZero](https://sigintzero.com/blog/defituna-580k-lending-exploit)
- **Mint not bound to pool, feeding wrong decimals into the oracle check:** DefiTuna `liquidate_position_orca` (I-02). — [SigintZero](https://sigintzero.com/blog/defituna-580k-lending-exploit)
- **Closing the wrong program or buffer is irreversible:** OptiFi. — [The Block](https://www.theblock.co/post/166445/optifi-locks-up-661000-by-accidentally-shutting-itself-down)

### Inferences

Concrete checklist for Mercury's program:

1. **Use Anchor**, pinned to a recent version, with `overflow-checks = true` in the release profile. Use `checked_*` everywhere and `u128` intermediates for interest and share math. Round in the protocol's favour: shares minted rounded down, shares burned on withdraw rounded up, debt rounded up, collateral value rounded down. Native or Pinocchio is only worth it for compute-critical liquidation paths, and every check it removes must be re-implemented and fuzzed.
2. **Avoid or tightly bound `remaining_accounts`.** If it is used (e.g., a variable list of collateral reserves), verify owner, discriminator, key against stored registry entries, and uniqueness for each account.
3. **Collateral registry with allowlisted mints only.** Only governance can list a new mint, behind a timelock. On listing, record and re-verify on every instruction: the mint's extension set, freeze authority, permanent delegate, transfer-hook program ID, transfer-fee config and Scaled-UI config. Fail closed if any of these change.
4. **Plan for the permanent delegate or freeze authority being used against the vault.** If xStocks mints carry these, the issuer could freeze or burn collateral held in Mercury's vault (e.g., for sanctions or a corporate action). Collateral would vanish while the debt stays. Mercury needs per-asset caps, a reserve fund and an issuer agreement.
5. **Internal accounting, not `token_account.amount`.** This defends against donations and transfer-fee shortfalls. Use `transfer_checked`, and fee-aware transfers if any mint has fees.
6. **One PDA per role, with unique seed prefixes.** Separate the vault authority, each reserve, each obligation and the fee vault. Include the mint in seeds. Store canonical bumps.
7. **Two-step authority transfers.** Use an `initialize` gated by the upgrade authority. Close accounts through Anchor `close`.
8. **Health check at the end of every user instruction** that changes debt or collateral, including any future "migrate position" or "transfer obligation" instruction. Forbid obligation changes during flash loans, and do not offer flash loans at launch.
9. **CPI only to hardcoded program IDs**: Token, Token-2022, Associated Token, oracle. `reload()` after CPIs.
10. **Use `Sysvar::get()`; never take sysvars as unchecked accounts.**

### Gaps

- I found no authoritative source listing Anchor version-specific defaults (e.g., when duplicate-mutable prevention became default). This should be checked against the Anchor changelog.
- I found no public Solana incident caused specifically by transfer hooks, transfer fees or the permanent delegate in a lending protocol. The risks are documented by Neodyme but none was confirmed as exploited.
- I did not retrieve the sealevel-attacks repo or Sec3 or OtterSec pitfall write-ups in this session. Helius and Neodyme cover the same ground.

---

## 5. Practices: audits, formal verification, fuzzing, bounties, staged launches, timelocked upgrades (Squads), pause scope, monitoring, insurance and reserve funds

### Takeaway

Mature Solana lenders now stack many audits, formal verification and large bounties: Kamino reports 18 audits, four formal verifications and a $1.5M Immunefi cap. Audits did not prevent Euler (on-chain 8 months after audit), Loopscale (weeks after launch) or the post-audit drift at DefiTuna. Admin-key compromise (Radiant, Drift, Resolv) is handled by operational controls, not code review:

- timelocks on every privileged action;
- no blind signing;
- independent transaction decoding;
- durable-nonce monitoring;
- role separation;
- on-chain caps.

Insurance and backstop funds (Aave Umbrella, Drift IF) cover market bad debt, not admin-key theft of the size seen at Drift.

### Cited Findings

- **Kamino (benchmark):**
  - Claims 18 security audits in total.
  - Fourth formal verification (by "Osec"/OtterSec) in October 2025, after ~6 months of work, covering deposit, withdraw, borrow and repay.
  - Certora published a Kamino Lending specification and verification report (2025-02-24) and a Kamino vault audit (2025-07-07).
  - [Crypto Times](https://www.cryptotimes.io/2025/10/10/kamino-boosts-solana-defi-safety-with-fourth-verification/); [Certora report](https://www.certora.com/reports/kamino-lending-security-report)
- **Kamino Immunefi bounty:** Went live 2025-10-06 with a maximum of $1.5M. Critical smart-contract bugs earn 10% of directly affected funds up to that cap. Proof of concept and KYC required; paid in USDC. — [Immunefi](https://immunefi.com/bug-bounty/kamino/information/)
- **Squads v4:**
  - Four audits (OtterSec, Neodyme, Certora, Trail of Bits) plus Certora formal verification. Features include time locks, spending limits and roles.
  - Program upgrade authority can be delegated to a Squad, and a GitHub action turns CI deployments into upgrade proposals with buffers checked against source through a verifiable build (Ellipsis Labs).
  - [Squads v4 security](https://squads.xyz/blog/v4-security-measures); [Squads GitHub](https://github.com/Squads-Protocol/v4); [Squads docs](https://docs.squads.so/main/navigating-your-squad/developers-assets/programs)
- **Bounty scale:** Wormhole paid $10M (May 2022); Polygon's earlier $2M was the previous record. — [The Block](https://www.theblock.co/post/148085/wormhole-announces-10-million-bug-bounty-payout)
- **Bounty value:** marginfi's flash-loan bug (>$160M at risk) was caught through its bounty program. — [Blockworks](https://blockworks.co/news/marginfi-flash-loan-bug)
- **Wormhole's post-incident plan:** continuous audits (Neodyme, Kudelski, Trail of Bits), an Immunefi bounty (initial max $3.5M), and monitoring. — [Wormhole incident report](https://wormholecrypto.medium.com/wormhole-incident-report-02-02-22-ad9b8f21eec6)
- **Fuzzing (Trident):** Trident is a manually guided fuzzer for Anchor programs. The developer defines instruction flows, the fuzzer randomises accounts and amounts, and developer-written invariants are checked each iteration. Aimed at missing account constraints and incorrect token handling. — [QuickNode guide](https://www.quicknode.com/guides/solana-development/tooling/trident-fuzzing)
- **Audits are commit-specific:** DefiTuna's lesson is that value-handling code changed after audit needs re-review, and that invariant and property testing catch seam bugs (rounding, share/fund conversion, oracle decimals). — [SigintZero](https://sigintzero.com/blog/defituna-580k-lending-exploit)
- **Old bugs survive audits:** Euler's bug sat on-chain ~8 months after an audited change. — [CryptoDaily](https://cryptodaily.co.uk/2023/03/euler-finance-hack-postmortem-reveals-8-month-old-vulnerability)
- **Unaudited and closed-source code got hit early:** Cashio (unaudited) and Nirvana (automated audit only). — [CertiK](https://www.certik.com/blog/cashio-app-incident-analysis); [Ackee](https://ackee.xyz/blog/2022-solana-hacks-explained-nirvana/)
- **Timelocks and governance controls (Drift lessons):**
  - Put timelocks on high-privilege actions.
  - Restrict durable nonces in governance: higher thresholds, time-bound or revocable approvals.
  - Monitor governance in real time, including nonce-account creation and admin changes.
  - Watch for social engineering during multisig migrations.
  - [BlockSec](https://blocksec.com/blog/drift-protocol-incident-multisig-governance-compromise-via-durable-nonce-exploitation)
- **Range's additional recommendations:**
  - minimum delays on member changes, threshold changes and collateral listings;
  - decode and simulate every transaction, with an independent review interface;
  - alert on zero-history wallets added to multisigs and on unusual proposal velocity;
  - monitor CCTP, Wormhole and deBridge for rapid outflows;
  - treat signer security as seriously as contract security.
  - [Range](https://range.org/blog/inside-the-drift-exploit-how-to-protect-your-protocol-and-multisigs-against-dprk-threat-actors)
- **Radiant's post-incident controls:** 72-hour minimum timelock on upgrades and ownership transfers, 4/7 thresholds, separated roles, Etherscan calldata decoding, no blind signing, and fresh devices. — [Radiant post-mortem](https://medium.com/@RadiantCapital/radiant-post-mortem-fecd6cd38081)
- **Pause behaviour:**
  - Radiant's automated pause on BSC was bypassed by the ownership transfer. — [Radiant post-mortem](https://medium.com/@RadiantCapital/radiant-post-mortem-fecd6cd38081)
  - Loopscale's halt of markets, followed by staged re-enabling of repayments and loop-closing, limited damage. — [Blockworks](https://blockworks.co/news/loopscale-loss-oracle-attack)
  - Sonne paused Optimism markets while Base stayed live. A Seal contributor saved $6.5M by donating to the market before the attacker could drain it. — [The Block](https://www.theblock.co/news/ecosystems/2024-05-15-lending-protocol-sonne-finance-faces-20-million-exploit-pauses-markets-on-optimism-294508); [Sonne post-mortem](https://medium.com/@SonneFinance/post-mortem-sonne-finance-exploit-12f3daa82b06)
- **Withdrawal limits and circuit breakers can be switched off by an admin:** the Drift attacker "relaxed withdrawal limits and circuit breakers" (raised 20x) before draining. — [BlockSec](https://blocksec.com/blog/drift-protocol-incident-multisig-governance-compromise-via-durable-nonce-exploitation); [Range](https://range.org/blog/inside-the-drift-exploit-how-to-protect-your-protocol-and-multisigs-against-dprk-threat-actors)
- **Supply chain:** The compromised @solana/web3.js 1.95.6/1.95.7 exfiltrated keys from backends and bots that handle private keys. Fixed in 1.95.8. — [Decrypt](https://decrypt.co/294742/solana-web3-js-library-compromised-in-targeted-supply-chain-attack)
- **Supply chain via contractors:** Resolv's signing key was reached through a contractor's GitHub credential. — [rekt](https://rekt.news/resolv-labs-rekt)
- **Insurance and backstops, Aave Umbrella:**
  - Replaces the stkAAVE/stkABPT Safety Module as bad-debt cover. Users stake aTokens (aUSDC, aUSDT, aWETH) or GHO, which are burned automatically to cover deficits in the same asset without a governance vote.
  - The first-loss offset is currently 100,000 units per asset, absorbed before stakers.
  - Stake token exchange rate starts at 1:1 and only falls on slashing.
  - Live in June [year not stated in snippet; 2025 per context].
  - [Aave docs](https://aave.com/docs/aave-v3/umbrella); [BGD governance post](https://governance.aave.com/t/bgd-aave-safety-module-umbrella/18366); [Blockworks](https://www.blockworks.com/news/umbrella-reshapes-aave-staking)
- **Umbrella design question:** A governance discussion flags asymmetry between Umbrella slashing stakers and prior treasury (reserve-factor) extraction. — [Aave governance](https://governance.aave.com/t/design-discussion-reserve-factor-and-bad-debt-loss-socialization-symmetry/23888)
- **Drift Insurance Fund:** Unaffected by the exploit, with a 13-day unstake cooldown. It did not make users whole: recovery runs through the DFX claim token at ~1% initial payout. — [CoinCentral](https://coincentral.com/drift-protocol-says-insurance-fund-deposits-remain-safe-after-280m-exploit/); [The Block](https://www.theblock.co/news/ecosystems/2026-10-02-drift-opens-exploit-recovery-claims-initial-payouts-just-over-1-user-losses-417581)
- **Third-party cover:** Sherlock paid $3.3M on the Euler claim, a small fraction of a ~$197M loss. — [CryptoDaily](https://cryptodaily.co.uk/2023/03/euler-finance-hack-postmortem-reveals-8-month-old-vulnerability)

### Inferences

Recommended programme for a small team (synthesis, not sourced as a standard):

- **Before mainnet:**
  - at least 2 independent audits from different firms (e.g., OtterSec, Neodyme, Zellic, Sec3, Halborn, Asymmetric), on a frozen commit;
  - one targeted review of the oracle and liquidation module;
  - Certora Solana Prover or an equivalent formal check of core invariants (solvency, share accounting, health factor monotonic per instruction);
  - Trident invariant fuzzing in CI;
  - verifiable builds published, and a `security.txt` embedded.
  - Re-audit any diff touching value flows. Kamino's 18 audits is the high end, not a requirement.
- **Bug bounty live at launch:** Immunefi, critical tier around 10% of funds at risk with a cap ≥ $250K–$1M, scaled with TVL. Kamino's $1.5M cap and Wormhole's $10M payout set the upper reference. Fund the bounty from day one.
- **Guarded launch:**
  - Hard on-chain deposit cap (e.g., single-digit $M), raised in steps by timelocked governance.
  - Per-asset borrow caps tied to RFQ depth, starting with ETF xStocks (SPYx, QQQx) before single names.
  - Per-epoch withdrawal and borrow outflow limits enforced in program code, whose parameters can only be raised through the timelock. Drift shows instantly adjustable limits are worthless against an admin compromise.
- **Upgrade and admin control:**
  - Upgrade authority in a Squads v4 multisig with a time lock, e.g., ≥48–72h as Radiant adopted.
  - Separate multisigs and roles for: upgrade; risk parameters (timelocked); listing (timelocked); and pause/guardian (fast, can only reduce risk).
  - The guardian can pause new deposits and borrows and per-market liquidations. It cannot move funds, change oracles or raise limits.
  - Unpause and parameter loosening go through the timelock.
  - Hardware wallets on dedicated devices, no blind signing, independent decoding of Squads proposals, and alerts on durable-nonce creation for any signer.
  - Consider making the program immutable once mature.
- **Monitoring:**
  - Real-time alerts on: multisig and governance events; oracle deviation and staleness; utilisation spikes; large withdrawals; bridge outflows. Options include Hypernative, Range, or a custom Helius-webhook setup.
  - Wire alerts to an on-call runbook with authority to trigger the guardian pause.
  - DefiTuna's 7-hour disclosure gap is the anti-pattern.
- **Backstop:**
  - A protocol reserve funded by a reserve factor on interest, plus optionally a Mercury corporate first-loss tranche (an Umbrella-style "first-loss offset").
  - A published waterfall: reserve, then Mercury first-loss, then pro-rata depositor haircut.
  - Size it against realistic gap-down scenarios on the largest single-name borrow positions, not against hacks. Code-level theft is better handled by caps and timelocks.

### Gaps

- I did not retrieve Hypernative's Drift write-up, any statement on whether monitoring vendors alerted before the Drift drain, or Riverguard and Sec3 X-ray details.
- Squads v4 timelock semantics for program upgrades specifically were not documented in the retrieved sources.
- Typical audit pricing and timelines for 2026 Solana lending launches were not found.
- Current Immunefi median critical payouts for Solana programs were not found.
- I could not find whether Kamino or Jupiter Lend operate a dedicated insurance fund.

---

## 6. Failures specific to apps that put retail users into vaults by default (communication, socialised losses, legal fallout)

### Takeaway

When an app routes retail balances into a yield or lending product, users experience the app as the counterparty. That holds whether the product is a CeFi lender (Gemini Earn to Genesis) or a third-party curated DeFi vault (Coinbase to Morpho/Steakhouse; curators to xUSD). The failure modes are:

- withdrawal freezes that last months to years;
- losses socialised pro rata across passive depositors (MEV Capital's 3.5% and 12% haircuts; Drift's ~1% initial recovery);
- users learning of problems before the operator says anything (Stream);
- regulatory action against the app (SEC charges and a $37M NYDFS penalty for Gemini Earn) and creditor litigation (Stream, Elixir).

### Cited Findings

- **Gemini Earn:**
  - Withdrawals paused 2022-11-16. SEC charged Gemini and Genesis in January 2023 for selling unregistered securities through Earn. — [Decrypt](https://decrypt.co/219610/gemini-return-1-billion-to-earn-customers-pay-37-million-fine-new-york); [Blockworks](https://blockworks.co/news/gemini-settlement-nydfs)
  - The NYDFS settlement (Feb 2024) required a $1.1B return and a $37M penalty for failures that "threatened the safety and soundness of the company". — [Decrypt](https://decrypt.co/219610/gemini-return-1-billion-to-earn-customers-pay-37-million-fine-new-york); [Blockworks](https://blockworks.co/news/gemini-settlement-nydfs)
  - Gemini later returned $2.18B in kind, roughly 18 months after the pause, with an initial ~97% distribution. — [NBC New York](https://nbcnewyork.com/news/business/money-report/crypto-exchange-gemini-returns-2-2-billion-to-users-after-pausing-withdrawals-18-months-ago/5457128)
- **Coinbase's in-app USDC lending (closest analogue to Mercury's plan):**
  - Coinbase first added USDC lending on Base through Morpho. — [Blockworks](https://blockworks.co/news/coinbase-usdc-onchain)
  - Two Steakhouse-curated vaults followed in June 2026: "Prime" (BTC/ETH collateral) and "Higher Yield" (Ethena-linked collateral, which brings protocol-level risk). Not available in New York.
  - Steakhouse selects markets and sets risk parameters; Morpho provides infrastructure; Steakhouse says it takes no custody.
  - Coverage flagged the conflict of interest from Coinbase Ventures' ENA stake, and Coinbase's blog did not name the instruments in the High Yield tier.
  - [The Defiant](https://thedefiant.io/news/defi/coinbase-usdc-lending-vaults-morpho-steakhouse-ethena-risk-tier); [Steakhouse](https://kitchen.steakhouse.financial/p/lend-your-usdc-on-coinbase)
- **Stream / curated-vault fallout for passive depositors:**
  - MEV Capital USDC vault depositors took 3.5% (Ethereum) and 12% (Arbitrum) haircuts [aggregator source]. — [MEXC News](https://www.mexc.com/news/has-defi-learned-anything-from-yield-vault-collapse/171234)
  - Users spotted the xUSD depeg before the team said anything. — [Parsec](https://parsec.substack.com/p/parsec-weekly-138)
  - Stream suspended deposits and withdrawals and hired Perkins Coie to investigate and set creditor priority. — [Cointelegraph](https://cointelegraph.com/news/stream-finance-pauses-platform-finds-93m-loss)
  - On 2025-12-08 Stream Trading Corp sued Caleb McMeans ("0xlaw") in N.D. Cal. — [The Defiant](https://thedefiant.io/news/defi/stream-finance-files-lawsuit-against-0xlaw-mcmeans)
  - Stream Soft Holding Company (Delaware, incorporated 2026-03-20) is collecting claims in separate classes for direct xUSD holders and curators. — [The Defiant](https://thedefiant.io/news/defi/stream-finance-starts-collecting-creditor-claims-in-step-toward-global-resolution)
  - K3 Capital threatened legal action against Elixir, alleging the $68M loan was misrepresented. — [Bankless](https://www.bankless.com/es/read/news/k3-capital-threatens-legal-action-against-elixir-over-deusd-depeg.md)
- **Morpho, after msY (June 2026):** A curator vault concentrated in one market hit 100% utilisation, so depositors could not withdraw. The curator had dropped its collateral verification service [single report]. — [KuCoin News](https://www.kucoin.com/news/flash/morpho-blue-vault-loses-18m-as-msy-token-collapses-85)
- **Visibility of the curator:** Front ends route deposits into third-party curated vaults without always making the curator prominent. — [Allium](https://allium.so/blog/morpho-who-controls-your-deposit/)
- **Recovery after a protocol-level exploit takes months:** Drift's claims opened six months after the hack, with ~1% initial payout and a claim window to 2028. — [The Block](https://www.theblock.co/news/ecosystems/2026-10-02-drift-opens-exploit-recovery-claims-initial-payouts-just-over-1-user-losses-417581)
- **Venue-specific oracle failure:** Binance paid $283M to users liquidated by its own USDe pricing, showing that the platform carries the cost when its own oracle design harms users. — [The Block](https://www.theblock.co/post/374295/binance-pays-283-million-in-compensation-following-fridays-depegs-covering-user-losses)
- **Mango:** The convictions were vacated partly because a permissionless protocol with no explicit rules could not be "deceived". Victims of an economic exploit of Mercury's market may have little legal recourse against the attacker. — [TRM Labs](https://www.trmlabs.com/resources/blog/breaking-federal-judge-overturns-all-criminal-convictions-in-mango-markets-case-against-avraham-eisenberg)
- **Solend:** The team's attempt to protect depositors by seizing a whale's account caused a governance backlash and was reversed within about a day. — [The Block](https://www.theblock.co/news/defi/2022-06-20-new-solend-vote-invalidates-governance-decision-to-take-over-whale-account-153011)

### Inferences

- **Default-on yield turns a protocol incident into a brand and regulatory incident for the app.** Mercury should make vault deposits explicit opt-in, or at least clearly separated from "cash" balances. It should state in-app who controls parameters (Mercury), what the collateral is (xStocks), the reserve and first-loss waterfall, and withdrawal mechanics, including that withdrawals can be delayed at 100% utilisation.
- **Utilisation risk is the most likely way retail users will feel trapped.** Lenders cannot withdraw USDC that is lent out. Use a kinked rate curve with a steep slope above ~90% utilisation, keep a liquidity buffer, and warn users in-app when utilisation is high.
- **Prepare incident communication in advance.** Have pre-written status-page and in-app banner templates, a commitment to disclose within an hour or two of detection, and one canonical source (not just X). Stream (users noticed first) and DefiTuna (7-hour gap) are the anti-patterns.
- **Make loss socialisation rules explicit and deterministic.** Choose and publish how bad debt is realised before launch: immediately pro rata like Morpho v1.0, or deferred like v1.1. Ad-hoc decisions (Solend-style takeovers, snapshot-and-claims portals) create legal and trust fallout.
- **Legal exposure:** A US-facing app offering yield on USDC through its own program raises securities and lending-law questions (Gemini Earn's SEC charges and NYDFS penalty; Coinbase excludes New York). Mercury should get counsel on whether the vault is a security, a lending programme or an investment-advisory activity in each launch jurisdiction. Jupiter's xStocks assessment notes US persons are geo-blocked from xStocks. This needs a separate legal research track.

### Gaps

- I found no source on how Coinbase handles losses or communication if a Steakhouse/Morpho vault takes bad debt.
- I found no retail-app-specific post-mortem from an embedded-wallet app (e.g., Privy-based) whose users lost funds in a default vault.
- The current status of the SEC case against Gemini and the DOJ's decision on re-prosecuting Eisenberg were not determined.
- I did not research regulatory specifics (e.g., US stablecoin legislation limits on paying yield to stablecoin holders, or EU MiCA treatment of yield-bearing tokens). This belongs to a separate legal or regulatory researcher.
