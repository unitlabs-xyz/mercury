# Crypto card programs and spend rails: how they settle against on-chain accounts (status as of 21 Oct 2026)

Scope: card-issuing options for a Solana consumer app (Mercury: Privy embedded wallets, USDC cash, tokenized stocks, stock-backed credit) for non-US users. Covers authorization and settlement against on-chain balances, what the issuer needs from the account, economics, regulation and privacy. These are research notes, not legal advice.

## 1. Providers and programs: who is BIN sponsor or principal member, regions, Solana support, KYC, timelines

### Takeaway

For a Solana app, the providers that are live and documented are Bridge/Stripe and Rain. Bridge pulls USDC just-in-time through an SPL delegate on the user's own wallet, and Privy publishes a recipe for it. Rain uses a collateral contract it deploys on Solana; that contract was exploited in August 2026. Baanx also supports Solana delegation. Bridge's non-US coverage is still being built out: LatAm and Africa are live, and the EU and APAC are "planned for 2026". Rain and Reap (a Visa principal member in Hong Kong and Mexico) cover more regions today. Kulipa, an EU issuer that served Solana wallets, shut down in July 2026, which shows that counterparty risk at the issuer is real.

### Cited Findings

**Bridge (Stripe)**

- On 3 Mar 2026 Visa and Bridge said the stablecoin-linked card product was live in 18 countries. They targeted more than 100 countries across Europe, APAC, Africa and the Middle East by end-2026. Phantom and MetaMask were named as customers. Lead Bank participates in Visa's stablecoin settlement pilot alongside Bridge. — [Visa press release](https://usa.visa.com/about-visa/newsroom/press-releases.releaseId.22206.html)
- The product launched in 2025 with a LatAm focus: Argentina, Colombia, Ecuador, Mexico, Peru and Chile. Lead Bank is piloting on-chain settlement of Visa card transactions on Solana. — [The Block](https://www.theblock.co/post/392019/visa-and-stripe-plan-global-expansion-of-stablecoin-card-issuance-product-to-over-100-countries)
- On 29 Apr 2026 Bridge cards became fully integrated with Stripe Issuing. The integration added physical cards, and Bridge said cards were "available in 30 countries with one integration, on track to reach 100+ by the end of 2026". The disclosure reads: "The Prepaid Debit Visa Card is issued by Lead Bank and managed by Bridge Ventures, LLC." No non-US issuer is named. — [Bridge blog](https://www.bridge.xyz/blog/stablecoin-backed-cards-are-now-integrated-with-stripe-issuing)
- Bridge's product page says issuance is available across Africa, Latin America and the US, with "EU and APAC planned for 2026". Programs keep "100% of the interchange", can add custom per-transaction fees deducted from wallet balances, and can launch "in as little as a few weeks". Cardholders who spend in their KYC country use a localized BIN, which avoids the "typical ~1% cross-border fee". No minimums are stated. — [Bridge cards product page](https://www.bridge.xyz/product/cards)
- Bridge holds a MiCA CASP authorization and an EMI licence in Luxembourg. A July 2026 report says these let it operate across the 27 EU states. The same article says Stripe's stablecoin program "runs in more than 100 markets", which conflicts with Bridge's own "on track to 100+" wording. — [The Cryptonomist, 27 Jul 2026](https://en.cryptonomist.ch/2026/07/27/stripe-bridge-stablecoin-global/)
- Bridge handles identity and KYC, and Stripe Issuing creates the card. "The customer must complete KYC within 24 hours or the endorsement is revoked." Chains supported for non-custodial spend are Tempo, Solana, Base, World Chain and Linea, with USDC or OUSD as the currency. — [Privy: Bridge cards recipe](https://docs.privy.io/recipes/bridge-cards)
- Phantom's card runs on Stripe Issuing plus Bridge. It rolled out to all users in spring 2026, and Phantom plans international expansion through Stripe's issuing network. The page metadata lists the US. — [Stripe customer story: Phantom](https://stripe.com/us/customers/phantom-spotlight)

**Rain**

- Rain is a Visa principal member and issues directly. That status is described as rare for a US non-bank. Customer stablecoins sit in a smart contract, and Rain underwrites a credit line against them. Rain settles all volume with Visa in stablecoins, and "Visa redeems directly from Circle every day in USDC." Rain has 200+ clients and raised a $250M Series C at a $1.95B valuation. — [Solana Foundation, 2 Mar 2026](https://solana.com/news/how-cards-became-the-trojan-horse-for-stablecoin-adoption)
- In the US, Rain's Visa debit cards are issued by Cross River Bank. Rain Products, Inc. is the program manager, and Rain says it has approvals to issue "in dozens of countries" without naming them. KYC/AML workflows are part of every Rain program. Rain settles with Visa daily, including weekends and holidays. KAST is a client that expanded regions on Rain. — [Rain: global card programs](https://rain.xyz/resources/how-to-launch-global-card-programs-without-starting-over-in-every-market)
- Rain grew about 38x in 2025 to more than $3B annualized volume, with 200+ partners across 150+ jurisdictions and more than $338M raised. Its Series C closed in Jan 2026, led by ICONIQ. — [insights4vc, 22 Jan 2026](https://insights4vc.substack.com/p/the-state-of-stablecoin-cards)
- Rain runs a Solana card-collateral contract, one deployment per program. Avici, Tria and Solayer Pay ran on it, per the exploit coverage in §3. — [Blockaid](https://blockaid.io/blog/11m-rain-ecosystem-exploit-how-onchain-monitoring-gives-stablecoin-card-issuers-fleet-level-coverage)
- In Rain's API, the app submits the user's KYC data to `/issuing/applications/user`. Rain deploys and operates the user's collateral contract and exposes `creditLimit`, `spendingPower` and `balanceDue`. The sample uses Base Sepolia. — [Crossmint: Rain credit cards guide](https://docs.crossmint.com/wallets/guides/credit-cards)
- ether.fi Cash is issued through Rain as a credit product. It had more than 75,000 active cards by Mar 2026 and went from concept to live in under four weeks. This is a vendor case study. — [Rain case study: ether.fi](https://www.rain.xyz/resources/from-onchain-assets-to-everyday-liquidity-how-ether-fi-uses-stablecoin-cards-to-drive-engagement-revenue-and-retention)

**Reap (Hong Kong)**

- Reap holds Visa Principal Issuer membership in Mexico as well as Hong Kong, a dual licence it calls rare across Asia and the Americas. Stablecoins serve as credit collateral "behind the scenes". — [Reap, May 2026](https://reap.global/newsroom/reap-visa-principal-member-in-mexico-global-stablecoin-card-issuing)
- On 23 Sep 2026 Reap and Visa announced stablecoin-linked Visa credit card programs in more than 100 markets, extending into EMEA and Africa. Partners can use stablecoins as collateral and for repayment. Reap settles with Visa in stablecoins and is part of Visa's APAC stablecoin settlement program. Its client focus is fintechs, businesses and platforms. — [Reap newsroom](https://reap.global/newsroom/reap-visa-launch-100-markets-stablecoin-card-program)
- Reap had more than $6B in annualized card volume by early 2026, skewed toward corporate spend. — [insights4vc](https://insights4vc.substack.com/p/the-state-of-stablecoin-cards)

**Baanx / Monavate (now Exodus)**

- Baanx delegation is non-custodial: an ERC-20 `approve` on EVM, or SPL Token delegation on Solana, for USDC/USDT. Linea is the "primary network", and Ethereum and Solana are also supported. Users set or redelegate the allowance and can revoke it. — [Baanx docs: delegation](https://docs.baanx.com/guides/delegation/overview.md)
- The MetaMask Card (Mastercard, issued by Baanx) launched as an EU/UK pilot in Aug 2024 and spent from Linea. — [The Defiant](https://thedefiant.io/news/tradfi-and-fintech/metamask-mastercard-baanx-launch-crypto-debit-card-eu-uk)
- In Nov 2025 Exodus agreed to buy W3C, the parent of Baanx and Monavate, for $175M. — [The Block](https://www.theblock.co/post/380292/exodus-acquires-w3c). In May 2026 Exodus instead bought the shares of Monavate and Baanx from UK receivers after W3C defaulted on a loan. The reported price was about $76.27M, and the source formatting is odd. — [Barchart release](https://www.barchart.com/story/news/1656001/exodus-movement-acquires-outstanding-shares-of-monavate-holdings-limited-and-baanx-com-ltd)
- Baanx holds UK and EU EMI licences and mainly uses Mastercard rails. — [insights4vc](https://insights4vc.substack.com/p/the-state-of-stablecoin-cards)

**Gnosis Pay**

- Gnosis Pay provisions accounts with Pismo, deploys a self-custodial "Spending Safe", and runs KYC via Sumsub. Partners can share existing Sumsub KYC. Deposits are KYT-screened before they become spendable. "Spending is settled through Monavate on a 12-hour batch." — [Gnosis Pay docs: architecture](https://docs.gnosispay.com/concepts/architecture.md)
- It is live on Gnosis Chain and Celo, with EUR, USD and GBP accounts. It covers the EU, UK, Brazil, Colombia, Mexico, Japan, Singapore, the Philippines, Indonesia and Thailand. "Reversals are processed instantly as the message is received by network." It has no Solana support. — [Gnosis Pay docs home](https://docs.gnosispay.com/)

**Immersve**

- Immersve is a Mastercard principal member offering issuing-as-a-service to wallets, dapps and exchanges. Bitget Wallet's card launched in the UK and EEA in 2025, with LatAm, AU and NZ planned. — [Cryptonews](https://cryptonews.com/news/mastercard-bitget-wallet-and-immersve-launch-crypto-card-in-uk-and-eu/)
- KuCoin's KuCard launched in Australia in Apr 2026 with Immersve. USDC funds purchases in real time at the point of sale. — [AAP release](https://www.aap.com.au/aapreleases/cision20260424ae32353/)
- Immersve's original Mastercard partnership covered Australia and New Zealand in 2023. — [Mastercard newsroom](https://www.mastercard.com/news/ap/en/newsroom/press-releases/en/2023/immersve-partners-with-mastercard-to-deliver-world-first-web3-payment-innovation-in-australia-and-new-zealand/)

**Kulipa (Paris), wound down**

- Kulipa launched with Mastercard and Argent in Jul 2024. — [The Block](https://www.theblock.co/post/304287/crypto-payment-kulipa-mastercard-argent-debit-card)
- Kulipa shut down on 29 Jul 2026, citing solvency, and abruptly killed more than 120,000 cards across about 20 clients, including Ready (formerly Argent) and Solflare. Both had built pull-at-purchase cards, so no customer balances sat at Kulipa. — [KuCoin News flash](https://www.kucoin.com/news/flash/ready-shuts-down-card-program-after-kulipa-wind-down). A competitor blog reports similar details. — [Bleap](https://www.bleap.finance/blog/kulipa-shutting-down)

**Holyheld**

- Holyheld is a self-custody Mastercard debit card for residents of about 30 EEA countries. Card tiers cost €29, €99 or €199, and transactions outside the EEA cost 2.5% + €1. The profile was last updated Feb 2026. A Jul 2026 user report describes on-ramp and off-ramp outages during a backend provider transition. — [CryptoCardHub](https://www.cryptocardhub.com/card/holyheld-card)

**RedotPay**

- RedotPay completed VASP registration in Mexico in Jun 2026, with approval to act as a credit card issuer there. — [Fintech News HK](https://fintechnews.hk/39219/blockchain/redotpay-mexico-vasp-registration-stablecoin/)
- In Mar 2026 it reported a Canadian MSB registration, a FinCEN registration (it does not serve US citizens) and an Argentina VASP licence. — [CFOtech Asia](https://cfotech.asia/story/redotpay-expands-global-crypto-payments-with-new-licences)

**Coinbase**

- The Coinbase One Card is US-only. It runs on the Amex network, is issued by First Electronic Bank via Cardless, and pays 2–4% back in BTC to Coinbase One members. It was announced 12 Jun 2025 for a fall 2025 launch. — [American Express IR](https://ir.americanexpress.com/news/investor-relations-news/investor-relations-news-details/2025/New-Coinbase-One-Card-to-Launch-on-the-American-Express-Network/default.aspx)
- The older Coinbase Card, a Visa debit card, launched in the UK in Apr 2019 and then in EU countries. — [The Block](https://www.theblock.co/post/26323/coinbase-extends-crypto-to-fiat-visa-card-to-6-more-european-countries-following-uk-launch)

**Networks**

- Visa reported more than 160 stablecoin-linked card programs, payment volume up nearly 200% YoY (fiscal Q2 2026), and a $20B annualized stablecoin settlement run rate, up 15x YoY. — [Reap/Visa release](https://reap.global/newsroom/reap-visa-launch-100-markets-stablecoin-card-program); [TokenPost, 17 Oct 2026](https://www.tokenpost.com/news/business/34115)
- Visa began US USDC settlement on Solana with Cross River and Lead Bank. The run rate was about $3.5B as of 30 Nov 2025, and settlement moves to a 7-day window. — [Decrypt](https://decrypt.co/352548/visa-begins-us-stablecoin-settlement-usdc-solana)
- Visa carries more than 90% of on-chain crypto card volume. Mastercard runs Crypto Credential and the Multi-Token Network and is piloting stablecoin settlement, without disclosing volumes. — [insights4vc](https://insights4vc.substack.com/p/the-state-of-stablecoin-cards)
- Mastercard signed a definitive agreement on 20 Mar 2026 to buy BVNK for up to $1.8B, expected to close late 2026. — [FStech](https://fstech.co.uk/fst/Mastercard_Agrees_1_8bn_BVNK_Acquisition.php)
- Mastercard was reported in Oct 2025 to be in talks to buy Zerohash for $1.5–2B, unconfirmed. — [The Block](https://www.theblock.co/post/376840/mastercard-acquire-crypto-infrastructure-startup-zerohash-deal-worth-2-billion-fortune)

**Market size**

- Monthly crypto card spend grew from about $100M in early 2023 to more than $1.5B by late 2025, about $18B annualized. — [Solana Foundation](https://solana.com/news/how-cards-became-the-trojan-horse-for-stablecoin-adoption)

### Inferences

- Mercury's planned Bridge path is technically aligned: Solana, USDC, a Privy embedded wallet and a non-custodial SPL delegate. Its weak point is the non-US footprint. Bridge's own page still lists the EU and APAC as "planned for 2026", and the only issuer disclosure found is Lead Bank (US). Mercury needs written confirmation from Bridge of which issuer and BIN serve each target country. Localized BINs matter for Mercury's "1% FX fee abroad" idea; see §4.
- Fallbacks with non-US issuing licences in place today: Rain (Visa principal; EU, LatAm, APAC claimed but no country list), Reap (Visa principal in HK and MX, a credit-card model that fits stock-backed credit), Gnosis Pay/Monavate (EU/UK/LatAm/Asia, but EVM-only and now Exodus-owned), Immersve (Mastercard principal; UK/EEA/AU) and Baanx (Solana delegation, Mastercard).
- Kulipa's failure supports the JIT, non-custodial design. Users of the affected programs lost their cards but not their funds. Mercury should still plan for losing its issuer: a second provider and portable KYC.

### Gaps

- No published list of Bridge's live countries or of non-US issuing entities and BINs. No minimums, setup fees or per-card fees for Bridge, Rain, Reap, Immersve or Baanx were found publicly.
- No primary source on Rain's legal entities or licences outside the US.
- Coinbase/Base app card status outside the US in 2026 not found.
- No current issuer details found for the KAST, Jupiter or Backpack cards, apart from KAST being on Rain.

## 2. Settlement models: prefunded, JIT, collateral/credit line; holds vs finality; refunds, incremental and offline auths; FX

### Takeaway

Three patterns dominate:

- **Custodial prefunded:** a Bridge Wallet or an issuer ledger.
- **JIT pull:** Bridge or Baanx debits an on-chain allowance or delegate at authorization.
- **Collateral/credit:** Rain, Reap and ether.fi Borrow mode lend against stablecoins held in a contract, so the issuer is exposed to a credit balance rather than racing the user for the funds.

In every model the card network side is fiat and runs on its own schedule:

- captures can come up to 31 days later, can exceed the authorization, or can arrive with no authorization at all
- refunds may be unlinked to any purchase
- network settlement is batched daily or every 12 hours

So the issuer must carry the gap between authorization and capture with a hold, an allowance buffer or a credit line.

### Cited Findings

- **Bridge funding options.** Non-custodial (`type=standard`): "Bridge pulls funds directly from a wallet controlled by your customer at the time of each card authorization." Bridge Wallet (`type=bridge_wallet`): custodial, debited at each authorization. A Stripe Financial Account is a third option. "A wallet can only be linked to one card at a time." Excess funds return to the wallet. — [Bridge docs: funding strategies](https://apidocs.bridge.xyz/platform/cards/overview/funding-strategies)
- **Bridge JIT timing.** "Transactions will be submitted onchain at the time of card authorization, but complete asynchronously." `card_transaction.created` arrives without crypto details; `card_transaction.updated` follows "typically within seconds of onchain confirmation" with the chain, amount and `tx_hash`. "Incremental authorizations will cause additional transactions to be submitted onchain to cover the additional charge." — [Bridge docs: non-custodial](https://apidocs.bridge.xyz/platform/cards/overview/noncustodial.md)
- **Bridge declines** when the approval is inactive, the approved amount is too low, or the wallet lacks funds. Stripe also emits `issuing_authorization.created` and `issuing_transaction.created`. — [Privy recipe](https://docs.privy.io/recipes/bridge-cards)
- **Network edge cases (Stripe Issuing, which Bridge cards run on):**
  - Capture normally happens within 24h, but "hotels, airlines, and car rental companies are able to capture up to 31 days after authorisation."
  - Spending controls, real-time authorization controls and card status "don't apply for capture… captures for approved authorisations always succeed."
  - Over-captures happen for restaurants (tips), vehicle rental and ground transport, where the authorized amount is "typically a minimal amount". They cannot be blocked.
  - Multi-capture applies for airlines, cruise lines and rail.
  - Force captures arrive after a declined authorization or with no authorization. In-flight terminals are offline, and the amount is still deducted from the issuing balance.
  - Refunds may link to no authorization, or to the wrong one, and "will still be processed… even if your card status is inactive or cancelled." Refund reversals also exist.
    — [Stripe docs: Issuing transactions](https://docs.stripe.com/issuing/purchases/transactions)
- **Gnosis Pay.** Payments are "authorized in real time against the account balance". The spendable balance drops at authorization or when a withdrawal starts. Settlement runs through Monavate on a 12-hour batch. — [Gnosis Pay architecture](https://docs.gnosispay.com/concepts/architecture.md); [Safe overview](https://docs.gnosispay.com/concepts/safe/overview.md)
- **Gnosis Pay limits.** The on-chain Roles limit is hardcoded at $20K per token, twice the card limit, "because card clearing and settlement can take 1–4 days". — [Gnosis Pay docs: Safe overview](https://docs.gnosispay.com/concepts/safe/overview.md)
- **ether.fi Cash modes.** "When spending in Direct Pay mode, tokens are transferred directly from the Vault to the settlement dispatcher." "In Credit mode, tokens are borrowed against the Vault's collateral." Switching to Credit mode may carry a delay; switching to Direct Pay is immediate after verification. `canSpend` checks balance or borrowing power. The BIN sponsor parameter identifies "Rain or Reap". — [ether.fi docs: Cash modules](https://etherfi.gitbook.io/etherfi/products/cash/cash-modules)
- **ether.fi settlement chain.** ether.fi chose Scroll as the settlement layer for Cash in Sep 2024. — [Cointelegraph](https://cointelegraph.com/news/ether-fi-crypto-native-credit-card-zk-rollup-scroll)
- **Rain collateral/credit.** Rain underwrites credit against stablecoins in a contract and settles with Visa daily in USDC. — [Solana Foundation](https://solana.com/news/how-cards-became-the-trojan-horse-for-stablecoin-adoption)
- **Rain settlement financing.** Rain's revolving facility from Credit Coop had financed about $2B of settlement volume by 19 Aug 2026, with at least $1.58M in interest paid. — [TokenPost](https://www.tokenpost.com/news/business/34115). 24/7 stablecoin transfers do not remove the need for short-term financing when settlement obligations fall due. — [CryptoSlate, 17 Oct 2026](https://cryptoslate.com/stablecoin-cards-are-booming-but-who-makes-money-when-you-swipe/)
- **Reap.** Stablecoin settlement with Visa "reduces the need for issuers to hold large pre-funded balances" and works outside banking hours. — [Reap newsroom](https://reap.global/newsroom/reap-visa-launch-100-markets-stablecoin-card-program)
- **Baanx multi-wallet priority.** Each transaction is charged against the delegated wallet up to its remaining allowance. With several wallets, "Lower number = Higher priority", and the platform "attempts wallets in order until transaction succeeds". — [Baanx docs](https://docs.baanx.com/guides/delegation/overview.md)
- **FX.** Bridge says cardholders spending in their KYC country on a localized BIN avoid FX markups and the "typical ~1% cross-border fee". — [Bridge cards](https://www.bridge.xyz/product/cards). Holyheld charges 2.5% + €1 outside the EEA. — [CryptoCardHub](https://www.cryptocardhub.com/card/holyheld-card)

### Inferences

- Mercury's "cash → earn → credit line" waterfall maps onto existing mechanisms. Baanx's ordered wallet priority is the closest analogue to a funding cascade, and ether.fi's Direct Pay vs Credit mode is the closest analogue to a balance-then-borrow fallback. Two differences: ether.fi uses a user-selected mode (with a delay to switch into Credit), not an automatic cascade, and an automatic cascade means the authorization path has to price the earn position and the stock collateral in real time.
- With Bridge's JIT delegate, the "earn" and "credit" tiers cannot be pulled directly. Bridge pulls only the delegated USDC token account, one wallet per card. Mercury would need to keep a USDC "spend buffer" topped up by its own program, unwinding earn and drawing credit, before or during authorization. Alternatively, it would need an issuer whose model is credit against collateral (Rain or Reap).
- Solana finality of about a second is not the binding constraint. The binding constraints are the issuer's authorization response window and the fact that captures, over-captures, force captures and refunds come later and cannot be blocked. Any design that lets the user empty the account between authorization and capture leaves the issuer short. That is why issuers impose allowance buffers (Gnosis Pay, 2x the card limit), holds, withdrawal delays or credit lines.
- Incremental authorizations (hotels, fuel, car rental) on Bridge generate extra on-chain pulls. Force captures with no authorization are settled from the program's balance, so the program has a receivable against the user. Mercury needs a negative-balance or recovery policy, for example a lien on the earn or credit line.

### Gaps

- No primary documentation on how Bridge treats refunds and reversals for non-custodial wallets: whether funds are pushed back on-chain, and how fast.
- Visa or Mastercard authorization timeout values and stand-in processing rules for crypto issuers were not found.
- ether.fi Credit-mode LTV and liquidation parameters, and its current settlement chain, were not confirmed from primary docs.

## 3. What the program needs from the account: debit authority, withdrawal delays, limits, balance queries, self-custody; exploits

### Takeaway

Every self-custodial card model gives the issuer an on-chain debit authority and then works to stop the user from front-running settlement. The authority takes the form of an SPL delegate or ERC-20 allowance (Bridge, Baanx), a Roles-module allowance plus a Delay module (Gnosis Pay), a role-gated `spend` with timelocked withdrawals and limit changes (ether.fi), or an issuer-operated collateral contract (Rain).

That settlement module is where losses have happened:

- **Gnosis Pay, 1 Jun 2026** (not 2025): about $1.8M affected, a Zodiac Delay/Roles ERC-1271 bug.
- **Rain's Solana collateral contract, 28 Aug 2026:** about $1.1M, Ed25519 signature-instruction reuse in an outdated version.

In both cases the issuer or app made users whole.

### Cited Findings

- **Bridge on Solana (debit authority).** Card provisioning triggers an on-chain transaction that registers a program delegate. The app then adds an SPL `approve` to a PDA derived from the Bridge-assigned `MERCHANT_ID`, the mint and the token account. Token-2022 applies for some currencies. An optional fee payer lets the app sponsor fees. On EVM, an ERC-20 `approve` goes to an issuer contract specific to the program. — [Bridge docs: non-custodial](https://apidocs.bridge.xyz/platform/cards/overview/noncustodial.md)
- **Privy guidance for Bridge.** Create the card before the approval, and submit with `sponsor: true`. Privy flags double-spend risk: "Card networks can pull funds without your backend's involvement." The mitigations are a Privy policy that blocks outbound transfers except to the issuer contract, or on-chain bookkeeping via webhooks. — [Privy recipe](https://docs.privy.io/recipes/bridge-cards)
- **Baanx.** Users keep custody, and the platform cannot move funds beyond the approved allowance. Users can raise, lower or revoke it at any time. The flow involves a single-use token, an approval transaction, a signed ownership message and a post-approval registration, which Baanx estimates at 2–5 minutes. — [Baanx docs](https://docs.baanx.com/guides/delegation/overview.md)
- **Gnosis Pay Safe.**
  - It uses a Delay module with a 25-hour delay and 31-hour expiration, "designed to discourage direct delay module interaction". "Any interaction with the delay module will block the card and require customer support intervention."
  - The Roles module manages spending permissions and allowances.
  - Withdrawals reduce the spendable balance immediately to prevent double-spending.
  - Balances are split into spendable, non-spendable (AML hold), processing deposits and processing withdrawals.
    — [Gnosis Pay docs: Safe overview](https://docs.gnosispay.com/concepts/safe/overview.md)
  - API withdrawals go only to the Safe owner address and only in supported tokens. — [Gnosis Pay docs: on-chain withdrawal](https://docs.gnosispay.com/guides/accounts/onchain-withdrawal.md)
- **ether.fi Cash.** `spend` requires `ETHER_FI_WALLET_ROLE`. Daily and monthly USD spending-limit changes "take effect after the configured delay period". `requestWithdrawal` needs owner signatures, and `processWithdrawal` "fails if the withdrawal delay period has not yet elapsed". A cashback split is configured in basis points. — [ether.fi docs](https://etherfi.gitbook.io/etherfi/products/cash/cash-modules)
- **Gnosis Pay exploit (1 Jun 2026).**
  - Root cause: the ERC-1271 check "read the answer the contract returned. It did not check whether the call had succeeded." A contract that reverts while still returning the magic value let attackers queue withdrawals from Safes they did not own. The bug entered Zodiac v3.4.0 (30 Oct 2023), and the fix is `success && bytes4(returnData) == EIP1271_MAGIC_VALUE`.
  - Losses: about $1.5M extracted and about $300K made inaccessible, roughly $1.8M across 5,281 wallets. Gnosis absorbed the losses.
  - Response: Gnosis paused cards, bridge transfers and onboarding, redeployed card Safe modules in tranches, and is rebuilding the product as v2.
    — [Gnosis Pay post-mortem](https://gnosispay.com/blog/post-mortem-gnosis-pay-vulnerability-exploit); [The Block](https://www.theblock.co/post/403147)
- **Rain Solana exploit (28 Aug 2026).**
  - Root cause: an outdated Rain Solana card contract used two Ed25519 verification instructions per withdrawal. The attacker pointed the second instruction's offsets at the first, so "a single attacker-controlled signature stood in for two." The attacker then called `AddCollateralAdmin` (2,945 times) and `WithdrawCollateralAsset` (5,288 times) over about 2h29m.
  - Losses: Avici lost $500,859 across 1,685 users and Tria about $431,945 across 636 users; Solayer Pay was also affected. About $1.1M went to Tornado Cash and was not recovered.
  - Response: Rain upgraded the contract across all programs, and Avici refunded users plus 10%. Blockaid found the same bytecode in four deployments.
    — [Blockaid](https://blockaid.io/blog/11m-rain-ecosystem-exploit-how-onchain-monitoring-gives-stablecoin-card-issuers-fleet-level-coverage)
- **Real-time balance queries.** Rain exposes `creditLimit`, `spendingPower` and `balanceDue`. — [Crossmint guide](https://docs.crossmint.com/wallets/guides/credit-cards). Gnosis Pay exposes balances and account statement APIs. — [Gnosis Pay llms.txt index](https://docs.gnosispay.com/llms.txt)
- **Regulated parties bear smart-contract failures.** Smart-contract failures can force regulated issuers to make users whole. — [insights4vc](https://insights4vc.substack.com/p/the-state-of-stablecoin-cards)

### Inferences

- **Minimum account requirements** an issuer will expect from Mercury's protocol:
  - a scoped debit authority over a USDC account: an SPL delegate for Bridge or Baanx, or a program-level "card spender" role in Mercury's own program
  - a guarantee that the authorized amount stays available until capture, through a hold or lock in the account state, a withdrawal delay, or an allowance with a buffer
  - spending-limit changes that cannot take effect instantly
  - a real-time balance or "spending power" read covering cash plus earn plus available credit
  - a way to recover force captures and over-captures
- **SPL delegate limit.** An SPL delegate is a single delegate per token account with a fixed amount, and the owner can revoke it or move funds at any time. With a Privy embedded wallet, Mercury can enforce the "no outbound except issuer" rule with a Privy policy. That is off-chain policy enforcement by Mercury and Privy, not a protocol guarantee, which matters for any "self-custody" claim.
- **Where the losses were.** Both 2026 exploits were in signature-verification paths of the settlement or collateral module (ERC-1271 return handling; Solana Ed25519 instruction-offset introspection), not in the card rails. If Mercury builds a Solana program that holds card collateral, then whenever it inspects the Ed25519 or secp256k1 precompile instructions it must check that the offsets and instruction indices point to the instruction itself, and its admin or role-grant paths need the strictest review. Upgrade coverage across every deployment is also an operational requirement: Rain's loss was in a stale version.
- **Delay length trade-off.** Gnosis Pay's 25-hour delay shows that withdrawal delays are a product decision as well as a security one: long delays protect settlement and frustrate users. ether.fi applies delays to withdrawals, limit changes and mode switches.

### Gaps

- No public details found of Rain's normal admin and withdrawal authorization structure, or whether Rain enforces withdrawal timelocks.
- Bridge's behavior when a user revokes the delegate between authorization and capture, and the user's liability in that case, is undocumented publicly.
- Not checked: whether Gnosis Pay's current 25-hour delay predates the June 2026 exploit or was raised afterwards. Earlier figures were not found.

## 4. Economics: interchange by region, app revenue share, FX, fees, cashback, how crypto card apps make money

### Takeaway

Interchange is the main revenue line. Bridge passes 100% of it to the program. In the EU (and UK domestic), consumer cards are capped at 0.2% debit and 0.3% credit, which cannot fund meaningful cashback; a 2% reward on a 0.2% card loses 1.8% of spend. Non-EEA cards used in the EEA are capped at 0.2%/0.3% in-store and 1.15%/1.5% online until Nov 2029. Uncapped markets and commercial cards pay more. Successful crypto card apps add FX spread, card and subscription fees, float or yield, and, for credit models, interest. Rewards are often subsidized to drive core-product activity.

### Cited Findings

- **EU IFR.** Consumer debit is capped at 0.2% of value and consumer credit at 0.3%. Member states may set lower domestic caps or allow up to €0.05 per transaction for debit. The caps do not cover commercial cards limited to business expenses, three-party schemes or cash withdrawals. They apply only where both the payer's and payee's PSPs are in the EU. — [CMS](https://cms.law/en/BGR/Publication/EU-cap-on-interchange-fees-for-card-based-payments2)
- **Inter-regional.** For non-EEA consumer cards used in the EEA, Visa and Mastercard committed in 2019 to 0.2% debit and 0.3% credit in-store, and 1.15% debit and 1.5% credit online. The caps were extended to Nov 2029. — [Fintech Futures](https://fintechfutures.com/?p=15357476)
- **UK.** UK caps are 0.2% for domestic consumer debit and 0.3% for credit. A £100 debit purchase yields at most £0.20 of interchange, against £2 for 2% cashback. Bridge lets operators keep 100% of interchange and charge extra transaction fees. — [CryptoSlate, 17 Oct 2026](https://cryptoslate.com/stablecoin-cards-are-booming-but-who-makes-money-when-you-swipe/)
- **UK–EEA cross-border.** On 15 Jan 2026 the High Court upheld the PSR's power to cap UK–EEA cross-border interchange against Visa, Mastercard and Revolut. — [Crowdfund Insider](https://www.crowdfundinsider.com/2026/01/257433-london-high-court-backs-psr-mastercard-visa-revolut-lose-battle-over-proposed-eea-uk-card-fee-ceiling/). The PSR dropped an interim cap and will set one cap once its level work concludes. — [PSR statement](https://www.psr.org.uk/publications/market-reviews/mr2229-decision-not-to-proceed-with-interim-cap-on-cross-border-interchange-fees-statement-of-reasons/)
- **Brazil.** Prepaid interchange is capped at 0.7% from Apr 2023, debit at 0.5% per transaction, and debit on prepaid at 0.5%. Nubank earned 7% of its revenue from interchange. This is 2022 reporting on the rule. — [PYMNTS](https://www.pymnts.com/prepaid/2022/brazil-to-cap-prepaid-card-interchange-fees-starting-april-2023/)
- **Revenue stack.** Issuers and processors earn interchange (typically 1–2%), FX and conversion spreads, and float or reserve yield. Apps earn thinner, often subsidized margins: ATM fees, card issuance fees, premium tiers, conversion spreads and an interchange share. Gemini's card reportedly ran at a loss to drive trading. Reap earns commercial interchange, SaaS fees and FX. — [insights4vc](https://insights4vc.substack.com/p/the-state-of-stablecoin-cards)
- **Credit vs debit.** ether.fi captures more interchange because Rain cards are a credit product, and lower infrastructure cost funds cashback. This is a vendor claim. — [Rain case study](https://www.rain.xyz/resources/from-onchain-assets-to-everyday-liquidity-how-ether-fi-uses-stablecoin-cards-to-drive-engagement-revenue-and-retention)
- **Engagement effects.** Deposits into ether.fi's LiquidUSD earn product more than doubled in the card's first year, which the case study credits to card engagement. — [Rain case study](https://www.rain.xyz/resources/from-onchain-assets-to-everyday-liquidity-how-ether-fi-uses-stablecoin-cards-to-drive-engagement-revenue-and-retention)
- **Card mix and fee splits.** Business and commercial cards were about 17% of stablecoin-linked card volume in fiscal 2026 through 31 Mar. No typical fee split is disclosed. — [TokenPost](https://www.tokenpost.com/news/business/34115)
- **Example fee schedules.**
  - Holyheld: card tiers €29/€99/€199 and 2.5% + €1 outside the EEA. — [CryptoCardHub](https://www.cryptocardhub.com/card/holyheld-card)
  - Coinbase One Card: 2–4% BTC back, tied to a paid subscription (US). — [American Express IR](https://ir.americanexpress.com/news/investor-relations-news/investor-relations-news-details/2025/New-Coinbase-One-Card-to-Launch-on-the-American-Express-Network/default.aspx)
- **Cost side.** Chargebacks, fraud investigation, support and settlement financing erode margins. — [CryptoSlate](https://cryptoslate.com/stablecoin-cards-are-booming-but-who-makes-money-when-you-swipe/)

### Inferences

- In the EU and UK, a "free to the user, our share of interchange" card earns about 0.2% on debit or prepaid spend, before Bridge's processing and program costs, which are not public. A credit-classified card (Mercury's stock-backed line) could earn 0.3% in the EU and more elsewhere, but it brings consumer-credit regulation (§5).
- Mercury's "1% FX fee abroad" stacks on top of the network's own cross-border fees. Bridge cites about 1% cross-border, avoided only with a localized BIN in the user's KYC country. A user from a country where Bridge has no localized BIN may pay both. Revenue is plausible, but the fee should be benchmarked against Revolut- and Wise-style zero-markup competitors.
- The more durable revenue for Mercury is likely indirect: float or yield on the USDC spend buffer, earn deposits, and interest on stock-backed credit drawn by card spend. The ether.fi case points the same way, with card engagement credited for more than doubling its earn deposits.

### Gaps

- Bridge's program pricing (per-card, per-transaction, setup), and how much of the gross interchange reaches the program after Lead Bank and Stripe, is not public.
- Interchange levels in Mexico, Argentina, Colombia, Southeast Asia and India were not verified.
- No reliable figure was found for program-manager net margin per $1 spent.

## 5. Regulation and privacy: KYC, network visibility, travel rule/AML, consumer credit (CCD2), what privacy is possible

### Takeaway

Card issuing always requires the issuer or program to run full KYC; Bridge's endorsement lapses unless KYC completes within 24 hours. The issuer, processor and network see every merchant, MCC, amount and location. JIT on-chain models add a second, public trail: each authorization produces an on-chain pull from the user's wallet with a tx hash. In the EU, pulls from a self-hosted wallet into a CASP fall under the Transfer of Funds Regulation (TFR), with an ownership check above €1,000.

Stock-backed credit used for consumer card spend probably falls within EU CCD2 from 20 Nov 2026: CCD2 covers credit up to €100,000, and its exclusion for investor credit is tied to financial-instrument transactions. Real privacy for card spend is not available today. At most, confidential on-chain balances can hide the funding side, which is still on Solana devnet for Helius's design.

### Cited Findings

- **KYC.** Bridge runs KYC for card endorsement, and Stripe creates the cardholder. — [Privy recipe](https://docs.privy.io/recipes/bridge-cards). Gnosis Pay uses Sumsub and screens deposits with KYT. — [Gnosis Pay architecture](https://docs.gnosispay.com/concepts/architecture.md). Rain programs include required KYC/AML workflows and ongoing monitoring. — [Rain](https://rain.xyz/resources/how-to-launch-global-card-programs-without-starting-over-in-every-market)
- **Visibility of card data.** Stripe Issuing transaction objects carry the merchant name, MCC, city, postal code and network ID for every capture and refund. — [Stripe docs](https://docs.stripe.com/issuing/purchases/transactions)
- **Visibility of on-chain pulls.** Bridge's webhook returns the on-chain `tx_hash` for each authorization pull. — [Bridge docs](https://apidocs.bridge.xyz/platform/cards/overview/noncustodial.md)
- **Linkage.** KYC'd card spend links wallet addresses to identities. — [insights4vc](https://insights4vc.substack.com/p/the-state-of-stablecoin-cards)
- **EU TFR for self-hosted wallets.** CASPs must collect originator and beneficiary information for transfers to and from self-hosted addresses (Art. 14(5) and 16(2)). Above €1,000 they must verify that their customer owns or controls the self-hosted address. Accepted methods include signing a message or sending a predefined amount, and one method suffices under the EBA guidelines finalized 4 Jul 2024. — [Notabene](https://notabene.id/post/a-deep-dive-into-self-hosted-wallet-transaction-requirements-under-the-eu-tfr)
- **CCD2 dates and scope.** Member states had until 20 Nov 2025 to transpose and apply the rules from 20 Nov 2026. The ceiling rises to €100,000, small and interest-free credit is now included, and the blanket exemptions for deferred debit cards and overdrafts are narrowed. — [A&L Goodbody CCD2 report](https://www.algoodbody.com/files/uploads/news_insights_pub/CCD2_Report_F.pdf); [DLA Piper](https://www.dlapiper.com/insights/publications/2023/10/new-consumer-credit-directive-ccd-2)
- **Investor-credit exclusion.** CCD1 Art. 2(2)(h) excluded credit from investment firms or credit institutions "for the purposes of allowing an investor to carry out a transaction" in MiFID financial instruments where the lender is involved. — [legislation.gov.uk, Directive 2008/48/EC ch. I](https://www.legislation.gov.uk/eudr/2008/48/chapter/I). A search summary says the 2023 recast keeps this exclusion with MiFID II cross-references. I could not open the EUR-Lex text. — [EUR-Lex 2023/2225](https://eur-lex.europa.eu/eli/dir/2023/2225)
- **National transposition of CCD2.** The Dutch act brings BNPL, credit cards and overdrafts within scope. — [vLex: NL Implementation Act](https://vlex.com/vid/implementation-act-consumer-credit-1099177018). Germany's draft partly excludes short interest-free SME deferrals. — [Noerr](https://www.noerr.com/en/insights/draft-bill-for-the-implementation-of-the-consumer-credit-directive-2023-published)
- **Licensing.** Bridge holds a MiCA CASP authorization and an EMI licence in Luxembourg. — [Cryptonomist](https://en.cryptonomist.ch/2026/07/27/stripe-bridge-stablecoin-global/). A third-party review says the ether.fi card lacks a full EU MiCA or EMI licence and is unavailable in the Netherlands. This is unverified. — [Bleap review](https://www.bleap.finance/de-de/blog/etherfi-crypto-card-review-pros-cons-alternatives)
- **Regulatory risks.** Networks can disable programs. Sanctions screening is required because stablecoins can be frozen. MiCA licensing is expected to filter out smaller programs. — [insights4vc](https://insights4vc.substack.com/p/the-state-of-stablecoin-cards)
- **Exploit response and AML.** Gnosis Pay shared attacker addresses with stablecoin issuers during its exploit response. — [Gnosis Pay post-mortem](https://gnosispay.com/blog/post-mortem-gnosis-pay-vulnerability-exploit)
- **Privacy tooling on Solana.** The Helius Private Wallet (page updated 25 Aug 2026) lists cards as a use case: "spend from private onchain balances so transactions don't leak cardholder history". Its "confidential" ring hides asset and amount but not sender and recipient; its "anonymous" ring hides all four. Deposits and withdrawals to public addresses are public. It is on devnet only, with an audit planned before mainnet. — [Helius privacy](https://helius.dev/privacy)

### Inferences

- **KYC duplication.** Mercury will run KYC for investing anyway. The card partner (Bridge) runs its own KYC for the endorsement. Mercury should check whether its KYC can be shared, as Gnosis Pay allows with Sumsub, to avoid double onboarding.
- **Bridge pulls and TFR.** In the EU, Bridge's pull from a Privy self-hosted wallet into Bridge, a CASP, plausibly counts as a transfer from a self-hosted address. If so, the TFR information duty and the over-€1,000 ownership proof would apply. The Bridge onboarding signature and the delegate approval may satisfy the ownership proof; Mercury should confirm with Bridge and counsel.
- **CCD2 for the stock-backed line (not legal advice).** If Mercury's stock-backed credit line funds ordinary consumer card purchases, the investor-transaction exclusion likely does not apply, because the credit is not for trading financial instruments. Up to €100,000 it would likely be consumer credit under CCD2 from 20 Nov 2026. That brings creditworthiness assessment, pre-contractual disclosure, APR, withdrawal-right and advertising rules, and national creditor licensing. Using an issuer's credit product (Reap, Rain) shifts some of this to the issuer, but marketing and servicing duties may remain with Mercury. Other regions (UK, LatAm, Asia) need separate analysis.
- **What privacy is possible.** Off-chain, none from the issuer, processor or network. On-chain, a JIT design leaks each spend amount and time from the user's address, while the merchant stays off-chain. Mitigations:
  - fund from a separate spend sub-account rather than the main investing wallet
  - batch or net settlement rather than one pull per authorization; this is Gnosis Pay's ledger-plus-batch pattern
  - confidential balances in the future, though Helius is devnet-only and the issuer would still need visibility for AML
- **Privacy vs credit draws.** An on-chain credit line that draws per card swipe leaks spending behavior through borrow events.

### Gaps

- I could not access EUR-Lex for the verbatim text of CCD2 Article 2(2) or IFR Article 1; the summaries above rely on secondary sources.
- No source found on whether loans backed by tokenized stocks (tracker certificates, not shares) are treated differently under CCD2 or national rules.
- No source on UK consumer credit (CCA/FCA) treatment of stock-backed card credit, or on LatAm and Asian equivalents.
- No public statement found from Bridge or Visa on TFR handling for non-custodial JIT pulls.
