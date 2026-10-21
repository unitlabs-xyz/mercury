# Privacy-first payments and investing around an app-issued Solana dollar (design survey, as of 21 Oct 2026)

Scope note: Solana first, other chains as reference only. Not legal advice. "On-chain check (21 Oct 2026)" means I queried Solana mainnet public RPC (`getAccountInfo` / `getProgramAccounts`, jsonParsed) on 2026-10-21. The Solscan link is there so the result can be re-checked; it is not the source of the numbers.

---

## 1. Confidential Transfers (CT) on an app-issued Token-2022 mint: mechanics, auditor, extension compatibility, ecosystem support, production usage, DeFi usability

### Takeaway

CT is live again (re-enable gate at epoch 982, 4 Jun 2026; Token-2022 redeployed later that month). An issuer that creates its own mint can combine it with transfer hooks, freeze, pausable, scaled UI amount, and confidential fees. It hides amounts and balances but never parties, and every move between public and confidential balances shows the amount. As of 21 Oct 2026 no major stablecoin or tokenized-stock issuer had turned it on for users. PYUSD, USDG, xStocks and Ondo GM tokens all _initialized_ the extension with `autoApproveNewAccounts=false` and no auditor key, and my on-chain check found essentially zero configured or used confidential accounts.

### Cited Findings

**Account model and flow**

- Deposits move public tokens into a confidential _pending_ balance. `ApplyPendingBalance` moves pending into _available_. A transfer debits the sender's available balance and credits the recipient's pending balance, and only the available balance can be withdrawn. `EmptyAccount` clears both so the account can be closed. "Token account addresses remain public. Only amounts and balances are private." — [Solana docs: Confidential Transfer](https://solana.com/docs/tokens/extensions/confidential-transfer)
- Why pending and available are split: only the owner's apply and outgoing-transfer instructions change the available balance, so the owner can keep an AES-GCM-SIV copy (`decryptable_available_balance`) for instant display. Senders can't update a recipient's AES ciphertext, so incoming credits are stored as twisted-ElGamal ciphertexts in `pending_balance_lo` / `pending_balance_hi`. — [SPL docs: Confidential Balances – Encryption](https://www.solana-program.com/docs/confidential-balances/encryption)
- Transfer amounts are limited to **48 bits**, split into a low 16 bits and a high 32 bits. `pending_balance_credit_counter` counts incoming credits since the last apply. `maximum_pending_balance_credit_counter` is set in `ConfigureAccount` and "should typically be 2^16", which keeps pending lo within 32 bits and hi within 48 bits. ElGamal decryption cost grows exponentially with value size: 32-bit values take seconds, 64-bit values are impractical. — [SPL docs: Encryption](https://www.solana-program.com/docs/confidential-balances/encryption)
- Once the counter hits the max, the account can't receive more confidential credits until the owner applies. Applying "needs no proofs" and is a single instruction. Integrators holding funds should apply "at sensible times, such as before a send." — [Solana CT integration guide](https://solana.com/docs/tokens/extensions/confidential-transfer/integration-guide)
- On-chain check (21 Oct 2026): a configured PYUSD confidential account showed `maximumPendingBalanceCreditCounter: 65536`, `allowConfidentialCredits` and `allowNonConfidentialCredits` flags, and expected/actual counters. This matches the spec. — [PYUSD mint on Solscan](https://solscan.io/token/2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo)
- CT must be configured at mint creation and "cannot add it later". Approve policy is `auto` (any user can opt in) or `manual` (the CT authority approves each account). Only the account owner can configure CT on their account. — [SPL docs: Confidential Balances](https://www.solana-program.com/docs/confidential-balances)
- The extension adds about **295 bytes** per token account (about **0.0015 SOL** extra rent). Configuring normally needs the owner's signature plus a proof of ElGamal key ownership. An **ElGamal registry** lets a user register a key once, after which a third party (payer only) can run `ConfigureAccountWithRegistry`. That exists in the Rust `spl-token-client` but "not yet in the JS client". — [Solana CT integration guide](https://solana.com/docs/tokens/extensions/confidential-transfer/integration-guide)

**Proofs, transactions, compute**

- A transfer needs three proofs (equality, ciphertext validity, range), each written to its own proof context account and verified by the ZK ElGamal Proof program. The sender then closes them. A withdraw needs equality and range proofs. — [Solana docs: CT](https://solana.com/docs/tokens/extensions/confidential-transfer)
- Historically a transfer "span[s] a few dependent transactions" because the proofs exceed the transaction size limit. The **transaction v1** format allows a CT "in a single onchain transaction" (the guide gives no date). — [Solana CT integration guide](https://solana.com/docs/tokens/extensions/confidential-transfer/integration-guide)
- Transaction v1 activated on mainnet **15 Sep 2026 (epoch 1035)**, raising the cap from 1,232 to **4,096 bytes**, so a full proof set can fit in one transaction. Range proofs are 672 B (64-bit), 736 B (128-bit) and 800 B (256-bit). — [xroot.dev](https://xroot.dev/blog/solana-confidential-transfers-kill-switch-proof-cost); [DEV mirror, data as of 17 Sep 2026](https://dev.to/sulimanmukhtar/confidential-transfers-have-a-kill-switch-what-it-costs-you-5h39)
- Compute units per proof: batched range proof 64/128/256-bit = **111k / 200k / 368k**; pubkey validity 2.6k; zero-ciphertext 6k; ciphertext-ciphertext equality 8k; ciphertext-commitment equality 6.4k; percentage-with-cap (fees) 6.5k; grouped-ciphertext validity 2/3 handles 6.4k/8.1k (batched 13k/16.4k); closing a context account 3.3k. The per-transaction ceiling is 1.4M CU. A CT costs "roughly two orders of magnitude" more compute than a plain transfer. The block limit is 75M CU today and becomes 62.5M CU with 250 ms slots from epoch 1037. — [xroot.dev](https://xroot.dev/blog/solana-confidential-transfers-kill-switch-proof-cost)
- Decrypting a balance uses a 32-bit baby-step giant-step search with a precomputed table, "roughly a second on a phone." The legacy ZK _Token_ Proof program address is a stub that returns success without verifying anything, so integrators must not target it. — [xroot.dev](https://xroot.dev/blog/solana-confidential-transfers-kill-switch-proof-cost)

**Kill switch history and status**

- A Fiat-Shamir transcript flaw was found on 10 Jun 2025. The disable gate activated on 19 Jun 2025 (epoch 805, slot 347,760,000) and the re-enable gate on **4 Jun 2026 (epoch 982, slot 424,224,000)**. Token-2022 was redeployed with confidential instructions later in June 2026. While disabled, public balances on CT mints worked normally, but confidential balances could not move or be withdrawn and pending deposits stayed pending. Re-enabling needed no migration. — [xroot.dev](https://xroot.dev/blog/solana-confidential-transfers-kill-switch-proof-cost); [DEV](https://dev.to/sulimanmukhtar/confidential-transfers-have-a-kill-switch-what-it-costs-you-5h39); [Solana post-mortem, June 2025](https://solana.com/news/post-mortem-june-25-2025)
- A Solana Compass article (Aug 2026) confirms the ZK ElGamal Proof Program was re-enabled after "more than a year offline". — [Solana Compass](https://solanacompass.com/news/solana-activates-bn254-bls12-381-and-zk-elgamal-three-cryptographic-primitives-now-live). Caveat: I found no primary Anza/Solana Foundation announcement for the re-enable. The dates rest on xroot/DEV feature-account data.

**Auditor key: how an issuer reads activity**

- A mint can hold one global auditor ElGamal public key. When it is set, "every confidential transfer includes the amount encrypted for the sender, recipient, and auditor", and the proof checks that all three ciphertexts match. The mint authority sets it at init or via `UpdateMint` and can rotate or clear it. "A rotation applies only to future transfers," so old keys are needed for historical audits. Auditor keys are read-only, "do not authorize transfers or reveal a full balance." — [Solana docs: CT](https://solana.com/docs/tokens/extensions/confidential-transfer)
- With the standard key derivation, one wallet has one ElGamal and AES key pair across _all_ mints. Sharing an owner's keys therefore "discloses all of the owner's confidential accounts, not just one." — [Solana CT integration guide](https://solana.com/docs/tokens/extensions/confidential-transfer/integration-guide)

**Compatibility with other Token-2022 extensions (from the Token-2022 CT processor source)**

- **Transfer hook: compatible.** On confidential transfers the hook is invoked with `amount: u64::MAX` ("Since the amount is unknown during a confidential transfer, pass in u64::MAX as a convention"). It runs only on the transfer path, not on deposit or withdraw. — [token-2022 `confidential_transfer/processor.rs`](https://github.com/solana-program/token-2022/blob/main/program/src/extension/confidential_transfer/processor.rs). This contradicts Spark's claim that CT and transfer hooks "cannot be enabled simultaneously". Spark also lists both on PYUSD and USDG, and the source code is authoritative. — [Spark research, 20 Jul 2026](https://www.spark.money/research/solana-token-extensions-payments)
- **Pausable:** deposit, withdraw and transfer return `MintPaused`. Configure, approve and apply-pending do not check it. **Freeze:** `AccountFrozen` is enforced on deposit, withdraw, both sides of a transfer, and apply-pending. **Non-transferable:** blocks deposit, withdraw and the source side of a transfer. **Memo-required:** enforced on the destination side. **CPI Guard:** blocks owner-signed transfers via CPI. **Transfer fee:** if `TransferFeeConfig` exists, transfers use the fee-aware proof. The fee is subtracted from the destination's pending balance and withheld _encrypted_ under the `withdraw_withheld_authority_elgamal_pubkey`. **ConfidentialMintBurn:** if present, deposit and withdraw fail with `IllegalMintBurnConversion`, so supply lives only in confidential form. **Scaled UI amount** and **permanent delegate** are not referenced anywhere in the CT processor. — [token-2022 CT processor](https://github.com/solana-program/token-2022/blob/main/program/src/extension/confidential_transfer/processor.rs)
- The integration guide confirms that confidential mint/burn "disables the public deposit and withdraw path on that mint", and that confidential fee harvesting and withdrawal belong to the fee authority. — [Solana CT integration guide](https://solana.com/docs/tokens/extensions/confidential-transfer/integration-guide)

**Real issuer configurations (on-chain check, 21 Oct 2026)**

- **PYUSD** (Token-2022): extensions are mintCloseAuthority, permanentDelegate, transferFeeConfig (0 bps), `confidentialTransferMint{auditorElgamalPubkey: null, autoApproveNewAccounts: false}`, `confidentialTransferFeeConfig` (withheld-authority ElGamal key set, harvestToMint enabled), transferHook (programId null) and metadata. Of **495,503** PYUSD token accounts, only **2** had a configured ConfidentialTransferAccount, both `approved: false` with all-zero ciphertexts. — [PYUSD on Solscan](https://solscan.io/token/2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo)
- **USDG**: same extension set as PYUSD (CT mint with null auditor and manual approve). Of **190,581** token accounts, none had the 554-byte size of a CT plus CT-fee account. — [USDG on Solscan](https://solscan.io/token/2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH)
- Spark: PYUSD and USDG initialized CT, but "neither has activated confidential transfers for end users as of mid-2026". USDC and USDT use the legacy SPL Token program with no extensions. — [Spark](https://www.spark.money/research/solana-token-extensions-payments). Earlier coverage called PYUSD's CT feature "yet to go live". — [Blockworks Lightspeed](https://blockworks.com/news/lightspeed-newsletter-solana-hooks-paypal); [Cointelegraph](https://cointelegraph.com/news/paypal-pyusd-stablecoin-confidential-transfers-solana)

**Wallet, explorer and DEX support**

- The guide's support checklist: wallets must show public balance, unlock by signature, show pending vs available and a "locked" state, and support deposit/transfer/withdraw. Explorers must label CT accounts, never render ciphertexts as numbers, and group multi-transaction transfers. Exchanges must track both balances separately and apply pending on deposit. Wallets without CT support still show the public balance, and standard transfers still work if the destination accepts non-confidential credits. — [Solana CT integration guide](https://solana.com/docs/tokens/extensions/confidential-transfer/integration-guide)
- The April 2025 Helius explainer said "no wallet supports these features natively yet". Proofs were then generated server-side in Rust, with JS libraries expected later in 2025. — [Helius blog: Confidential Balances](https://www.helius.dev/blog/confidential-balances). JS/WASM tooling now exists: `@solana/zk-sdk` (WASM: key derivation and proof data), `@solana-program/zk-elgamal-proof`, and `@solana-program/token-2022` high-level helpers. — [Solana CT integration guide](https://solana.com/docs/tokens/extensions/confidential-transfer/integration-guide)
- A DeFi-safety helper crate has explicit checks that reject mints with Confidential Transfer, Permanent Delegate or Transfer Hook. — [docs.rs hopper-token-2022](https://docs.rs/hopper-token-2022). Jupiter routes across both token programs but warns on permanent-delegate tokens. Hook tokens often route only through specialized pools. — [Spark](https://www.spark.money/research/solana-token-extensions-payments)

**Making a confidential balance usable in DeFi**

- Deposits and withdrawals "carry cleartext amounts, so these flows remain visible." Withdraw needs equality and range proofs, with pending funds applied first. — [Solana CT integration guide](https://solana.com/docs/tokens/extensions/confidential-transfer/integration-guide)
- Arcium argues Token-2022 CT saw limited uptake partly because it is hard to use, can't be used confidentially by on-chain programs/PDAs, and requires recipients to pre-create confidential accounts. Its **C-SPL** (Confidential SPL) standard merges SPL, Token-2022, CT and Arcium MPC so programs and PDAs can hold and move encrypted balances. — [Arcium roadmap update](https://www.arcium.com/articles/arcium-roadmap-update); [Solana Compass, Breakpoint 2025 keynote](https://solanacompass.com/learn/breakpoint-25/keynote-arcium-yannik-schrade). In Feb 2026 C-SPL was "nearing completion". — [The Block, 2 Feb 2026](https://www.theblock.co/post/387564/arcium-launches-privacy-preserving-mainnet-alpha-on-solana-as-umbra-debuts-shielded-finance-layer)

### Inferences

- **Design for an app-issued dollar ("Mercury dollar")**. A plausible extension set at mint creation: ConfidentialTransferMint (manual approve, auditor key held by Mercury compliance in an HSM, with a rotation log), ConfidentialTransferFee only if fees are wanted, TransferHook (sees parties but not amounts, so a KYC allowlist or sanctions hook still works under CT), Pausable, freeze authority, DefaultAccountState (frozen-until-KYC or initialized), PermanentDelegate, and Metadata. Leave out ConfidentialMintBurn unless supply privacy is wanted, because it removes the public deposit/withdraw path and breaks DeFi composability.
- **Permanent delegate does not reach confidential balances.** The CT processor never consults it, and CT transfers and withdrawals need owner proofs. So the issuer's clawback/burn power covers only the public balance, while freeze and pause still lock confidential funds in place. This is an inference from code. Have it confirmed by Token-2022 maintainers or an auditor before relying on it for seizure policy.
- **What the issuer can and can't see.** The auditor key gives per-_transfer_ amounts, not balances. To get per-user balances, Mercury must index every CT instruction plus the public deposits and withdrawals. Since Mercury runs the app and relayer and approves every account, it can also keep its own off-chain ledger of the amounts its client generated.
- **Privy embedded wallets.** The standard derivation (sign `solana-conf-bal/v1`) needs a dedicated signing flow, since wallets should refuse generic `signMessage` for that prefix. The `fromIkm`/`fromPrf` route exists for MPC or passkey wallets. Proofs must be built where the ElGamal secret lives. Generating them on Mercury's server means Mercury holds every user's view key, which is a custodial-style trust model even if spend keys stay with the user.
- **Relayer fit.** Mercury's fee-paying relayer can pay fees and rent for proof-context accounts and reclaim the rent on close. With tx v1 most transfers can be one transaction, so multi-transaction orchestration becomes optional.
- **Throughput.** At roughly 200–250k CU per non-fee transfer (128-bit range proof plus validity and equality; this per-instruction mapping is my reading, not stated in the sources), CT is 50–100x a plain transfer. Fine for consumer payment volumes, but priority fees during congestion will be higher.
- **Kill-switch risk is real.** The feature was off for about 50 weeks. Keep the public path open (don't use ConfidentialMintBurn), so users can always exit through public balances if the proof program is disabled again.
- **The 48-bit cap** means at most about 2^48 base units per transfer (about $281M at 6 decimals). Not a consumer constraint.

### Gaps

- No primary Anza/SF announcement of the June 2026 re-enable was found. No public data on CT usage across all mints (I checked only PYUSD, USDG, TSLAx and Ondo mints).
- No measured mobile proof-generation times (only "a few seconds" from Spark, and about 1 s mobile _decryption_ from xroot).
- No confirmed list of wallets (Phantom, Solflare, Backpack) or explorers rendering CT natively in Oct 2026.
- C-SPL mainnet status in Oct 2026 is unconfirmed.

---

## 2. Private payments UX: stealth addresses, shielded pools, MPC (Arcium/Umbra), TEEs (MagicBlock), Helius Rings, app-level and omnibus privacy

### Takeaway

On Solana in Oct 2026, three classes hide _parties_ as well as amounts, which CT does not: shielded pools / mixers (Umbra on Arcium MPC, Cloak, Helius "anonymous rings"), TEE rollups (MagicBlock Private Ephemeral Rollups / Private Payments API), and routing aggregators (Solflare PAL via Houdini Swap). Every serious production design now pairs privacy with screening at the entry and exit perimeter (mostly Range, via oracle) plus viewing keys. An omnibus "app relays through pooled accounts" model is the easiest to build and gives strong privacy from on-chain observers. But it makes the app the custodian and the single point of disclosure, and it sits closest to the AMLR Art. 79 "increased obfuscation" language (see §4).

### Cited Findings

**Umbra (Arcium MPC)**

- Arcium Mainnet Alpha launched 2 Feb 2026 with Umbra as the first app. Initial limits were a **$500 deposit cap per user** and 100 new users per week. Melee, Vanish and Anonmesh were building integrations. — [The Block, 2 Feb 2026](https://www.theblock.co/post/387564/arcium-launches-privacy-preserving-mainnet-alpha-on-solana-as-umbra-debuts-shielded-finance-layer)
- Umbra opened to the public on 27 Mar 2026. Shielded transfers hide sender, recipient and amount, and swaps keep size and intent private. — [The Block, 27 Mar 2026](https://www.theblock.co/news/ecosystems/2026-03-27-umbra-opens-privacy-wallet-to-the-public-on-solana-powered-by-arciums-encrypted-execution-engine-394892). The compliance stack bundles viewing keys, risk screening and geo-blocking. — [KuCoin flash](https://www.kucoin.com/news/flash/umbra-launches-public-privacy-wallet-on-solana-using-arcium-encrypted-compute)
- The Umbra SDK (TypeScript; mainnet and devnet; works with Phantom/Solflare adapters) wraps three primitives: **encrypted token accounts** (shield SPL and Token-2022 balances), a **unified mixer pool** (Merkle tree plus ZK to unlink deposit from withdrawal), and **selective disclosure** for auditors. Crypto runs off-chain on Arcium MPC, and a REST API serves UTXO and Merkle-proof queries. — [Colosseum Codex, 3 Apr 2026](https://blog.colosseum.com/umbra-sdk-magicblock-private-payments-x402/)
- Key architecture: each transfer uses a one-time key. Addresses derive from a registered **Master Viewing Key (MVK)**, and each address is used once. MVKs are stored on-chain encrypted; "Only the MPC cluster as a whole can decrypt them." Range screening flow: the client or relayer requests a signed risk score through a Switchboard On-Demand oracle, and Umbra's program verifies the quote on-chain before letting the action proceed. This can block transfers, claims and withdrawals and can gate MVK registration and per-user limits. The audit trail is shareable "under lawful process". — [Range, 18 Nov 2025](https://range.org/blog/umbra-integrates-range-to-power-real-time-risk-and-compliance-for-private-transfers-on-solana)
- Messari describes per-user viewing keys scoped to a date range or specific transactions, shareable with auditors without giving up spend authority. — [Messari](https://messari.io/report/arcium-bringing-privacy-to-solana-with-umbra)

**Cloak (ZK, Solana)**

- Supports USDC, USDT and SOL and breaks the sender–receiver link, though deposits and payouts stay visible. Screening runs at entry (before funds enter) and at exit (relay sends screened against the authenticated sender) using Range checks: OFAC/UN/EU/UK lists, PEPs, and stablecoin issuer blacklists. Viewing keys allow selective disclosure after the fact. Screening code was in the audited program. As of 31 Aug 2026 it was in mainnet private beta with more than $500k total volume. — [Range case study](https://range.org/blog/how-cloak-screens-for-sanctioned-addresses-before-its-privacy-layer-applies)

**Helius Privacy ("Rings")**

- Beta. **Confidential rings** hide asset and amount (parties visible). **Anonymous rings** hide asset, amount, sender and recipient. Transfers settle directly on Solana with no L2 or bridge, and recipients don't need a special wallet. Helius "cannot freeze, move, or seize your funds". Anonymous rings support only delegated decryption (the RPC can serve balances and history but can't spend). — [Helius Privacy docs](https://docs.helius.dev/privacy)
- **Custom Rings** are a Solana program enforcing on-chain controls before settlement: allowed assets, participant allowlist, recipient blocklist, freeze, co-signing, a permanent delegate inside the ring, per-period transfer/deposit/withdrawal limits, and "Deposit Auditing" (only deposits whose recipient the auditor can identify). You can bring your own compliance or use Helius-managed KYC and sanctions screening. A public devnet demo exists. — [Helius enterprise integration](https://www.helius.dev/docs/privacy/integration/enterprise)

**MagicBlock Private Ephemeral Rollups (TEE)**

- PERs combine Intel TDX TEEs with ephemeral rollups. Accounts are public by default until shielded, a fine-grained access-control layer governs reads, and the main trust assumption is the TEE vendor's hardware. Docs list a devnet endpoint (`devnet-tee.magicblock.app`, auth token required). — [MagicBlock PER docs](https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/introduction/onchain-privacy); [MagicBlock TEE intro](https://docs.magicblock.gg/pages/tools/tee/introduction)
- The **Private Payments API** was in "Beta, on Solana mainnet" as of 3 Apr 2026. Users delegate USDC into a PER, recipient and release instructions are encrypted client-side, and a crank settles back to Solana so "sender and receiver cannot be traced on-chain". It supports split and time-delayed payouts, real-time wallet screening and AML checks, OFAC geofencing by default, and an MCP server for agents. — [Colosseum Codex](https://blog.colosseum.com/umbra-sdk-magicblock-private-payments-x402/). Conflict: MagicBlock's own docs pages I retrieved show only a devnet endpoint.
- MagicBlock's stated targets are "payments providers facilitating stablecoin payments, or private swaps and OTC trading". — [Blockworks Lightspeed](https://lightspeed-4bed7b.beehiiv.com/p/solana-rollups-bring-privacy)

**Wallet-level routing (app-level privacy precedent)**

- Solflare launched the "Privacy Aggregator Layer" with **Private Send** in early Mar 2026, in mobile and extension. It is opt-in per transaction and off by default, routes through **Houdini Swap** (not its own protocol), hides the direct sender–recipient link, and has asset-dependent support. — [SpendNode](https://www.spendnode.io/blog/solflare-privacy-aggregator-layer-pal-private-send-solana-houdini-swap/); [press release](https://www.crypto-reporter.com/press-releases/solflare-launches-solanas-first-wallet-native-privacy-aggregator-123328/)

**History**

- Elusiv (Solana ZK privacy) announced its sunset on 29 Feb 2024. It had processed more than $125M and built a compliance system ("ZEUS"), and the team went on to build Arcium. — [QuickNode Elusiv guide](https://www.quicknode.com/guides/solana-development/legacy/privacy-with-elusiv); [Arcium roadmap](https://www.arcium.com/ko-kr/road-to-mainnet)

### Inferences

- **Privacy ladder for Mercury payments, cheapest first:**
  1. **App-level omnibus.** P2P sends between Mercury users are book entries on Mercury's ledger, and on-chain only pooled settlement accounts move. Observers see nothing per user. Mercury sees everything, so compliance is trivial (it is the ledger). But Mercury becomes a custodian (MiCA CASP custody, safeguarding, insolvency segregation), user self-custody via Privy becomes nominal for those funds, and sends to external wallets leave from Mercury's hot wallet (privacy for the user, travel-rule duty for Mercury).
  2. **CT on the Mercury dollar** with a Mercury auditor key. Non-custodial. Hides amounts and balances, not who-pays-whom. Cheap to integrate with JS helpers.
  3. **CT plus fresh per-payment recipient token accounts** (stealth-style). This reduces linkability, but each account costs rent and needs configuring, and the registry configure path is Rust-only today.
  4. **Integrate a shielded pool** (Umbra SDK, Cloak, or Helius Rings once on mainnet) for sender/recipient unlinkability, with Range screening at the perimeter.
  5. **TEE (MagicBlock)** for fast, cheap private payouts with an extra hardware-trust assumption.
- **Custodial vs non-custodial in practice.** Omnibus maximizes UX (instant, free, no proofs) and gives Mercury full visibility, but concentrates hack, insolvency and regulator-seizure risk on Mercury. Non-custodial CT or shielded pools keep keys with users but need proof generation, key management (view keys tied to Privy) and support for "my balance is locked or pending" states.
- **Umbra's trust model.** Because the Arcium MPC cluster can collectively decrypt MVKs, Umbra's privacy against a lawful-process demand ultimately depends on Arcium node operators. That is relevant if Mercury wants to promise privacy _from itself_ as well as from the public.

### Gaps

- Umbra fees, supported assets, current deposit caps and volume/TVL in Oct 2026 were not found. No primary Umbra docs were retrieved.
- Helius Rings mainnet date is unknown (docs show beta/devnet only). Whether Rings uses Token-2022 CT internally is not stated.
- MagicBlock Private Payments mainnet versus devnet status is unclear (sources conflict). No independent audit or attestation details found.
- No sourced Solana stealth-address standard (an ERC-5564 equivalent) was found.

---

## 3. Privacy for investing: hiding which stocks a user holds and when they trade

### Takeaway

Confidential balances on stock tokens are _technically_ available, since both Backed xStocks and Ondo GM Solana mints have ConfidentialTransferMint initialized. But they use manual approval with no auditor, and no xStocks account has a configured confidential balance. So Mercury can't use CT on xStocks without Backed's cooperation. And CT would still expose the stock's mint (which stock) and the public deposit/withdraw amounts. The practical near-term route to "nobody on-chain can see what I hold" is an omnibus/pooled vault where Mercury tracks per-user positions. Order-flow privacy on Solana is mostly MEV-protection plumbing (Jito BAM TEE ordering, DontFront, Helius MEV-Protect) rather than true dark pools. MPC/ZK dark pools exist on EVM (Renegade) and as early or partner apps on Arcium.

### Cited Findings

**Stock-token issuer configurations (on-chain check, 21 Oct 2026)**

- **Backed xStocks** (TSLAx, NVDAx, SPYx) are Token-2022 with metadataPointer, **permanentDelegate**, defaultAccountState (initialized), **scaledUiAmountConfig** (for example NVDAx multiplier 1.000918, next 1.001701 scheduled), **pausableConfig**, `confidentialTransferMint{auditorElgamalPubkey: null, autoApproveNewAccounts: false}`, transferHook (programId null) and tokenMetadata. — [TSLAx](https://solscan.io/token/XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB), [NVDAx](https://solscan.io/token/Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh), [SPYx](https://solscan.io/token/XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W) on Solscan
- TSLAx had **145,474** token accounts. 15 are sized at 478 bytes (room for a CT account), but their TLV data contains only pausable and transfer-hook entries, so **zero configured confidential accounts** were observed. — [TSLAx on Solscan](https://solscan.io/token/XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB)
- **Ondo Global Markets** Solana mints (TSLAon, SPYon) are Token-2022 with scaledUiAmount, pausable, defaultAccountState, `confidentialTransferMint{auditor: null, autoApprove: false}`, transferHook (null) and metadata, and **no permanent delegate**. — [TSLAon](https://solscan.io/token/KeGv7bsfR4MheC1CkmnAVceoApjrkvBhHYjWb67ondo), [SPYon](https://solscan.io/token/k18WJUULWheRkSpSquYGdNNmtuE2Vbw1hpuUi92ondo) on Solscan. Ondo GM launched on Solana on 21 Jan 2026 with 200+ stocks/ETFs and 24/5 mint/redeem. — [Solana Foundation](https://solana.com/news/ondo-global-markets-tokenized-stocks-etfs-solana)
- The CT processor does not reference Scaled UI Amount, so the two coexist on these mints. The multiplier is a display-layer concept. — [token-2022 CT processor](https://github.com/solana-program/token-2022/blob/main/program/src/extension/confidential_transfer/processor.rs)

**Pooled/omnibus vault, encrypted order flow, dark pools**

- Arcium MPC is pitched for dark pools, sealed-bid auctions and front-running-resistant order books. Its Purplepaper (3 Jun 2026) frames "dark pools and private transfers" as native capabilities. Delivered examples are partner apps: Melee and Pythia encrypt prediction-market order books with Arcium. No Arcium-branded dark pool launch was confirmed. — [BEX blog, 7 May 2026](https://bex.co/blog/2026/05/07/arcium-mpc-supercomputer-decentralized-encrypted-computation); [Castle Labs](https://research.castlelabs.io/p/privacy-ecosystem-on-solana)
- Umbra's swaps keep "trade size and intent private". — [The Block](https://www.theblock.co/news/ecosystems/2026-03-27-umbra-opens-privacy-wallet-to-the-public-on-solana-powered-by-arciums-encrypted-execution-engine-394892)
- Solana "dark pool" DEXs such as GoDark (ZK, waitlist as of Jul 2026) and DarkVeil exist mainly as listings or wiki entries. Status is unverified. — [MadeOnSol GoDark](https://madeonsol.com/tools/godark-dex); [IQ.wiki DarkVeil](https://iq.wiki/wiki/darkveil.md). Prop AMMs that quote privately and route via aggregators are described as de-facto "dark" liquidity. — [Pine Analytics](https://pineanalytics.substack.com/p/the-largest-dexs-on-solana-dont-want)
- **Renegade (EVM reference):** pairwise MPC matching between relayer nodes, settlement inside ZK proofs, orders pegged to the Binance midpoint, live on Arbitrum and Base. — [Renegade docs](https://docs.renegade.fi); [The Block launch coverage](https://www.theblock.co/post/314959/on-chain-dark-pool-renegade-goes-live-on-arbitrum). About $340M cumulative volume by 16 Jun 2026 (DefiLlama via an aggregator), and a reported 10 May 2026 V1 exploit of about $209k via an unprotected initializer. Both are secondary and uncorroborated. — [Simplify profile](https://simplify.jobs/c/Renegade)

**MEV protection and private submission on Solana**

- **Jito BAM** (Block Assembly Marketplace): an encrypted mempool inside TEEs, where "transactions remain confidential until execution", with ordering provable via on-chain attestations. Modeled on Flashbots BuilderNet. — [Helius BAM blog](https://www.helius.dev/blog/block-assembly-marketplace-bam). Reported mainnet launch 25 Sep 2025, permissionless validator participation. — [Solana Compass BAM](https://solanacompass.com/projects/bam-block-assembly-marketplace)
- **Jito DontFront:** add a `jitodontfront…` pubkey to any instruction and the block engine forces the transaction to bundle index 0. It protects only on the Jito path, "may help reduce sandwich attacks but is not guaranteed", and doesn't work on devnet or localhost. — [Solana docs: MEV protection](https://solana.com/docs/defi/mev-protection)
- **Helius MEV Protect:** opt-in `mev-protect=true` routing that avoids validators linked to sandwiching. Works with sends, bundles and Helius Sender, and can be combined with backrun rebates. — [Helius docs](https://www.helius.dev/docs/sending-transactions/mev-protect)
- The Solana Foundation removed delegation from validators participating in private mempools that facilitate sandwiching (count undisclosed). — [Unlock](https://www.unlock-bc.com/en/solana-foundation-expels-validators-facilitating-sandwich-attacks-delegation-program). Ghostlogs estimated $370–500M extracted by bots over 16 months (2025 talk). — [Solana Compass, Accelerate 2025](https://solanacompass.com/learn/accelerate-25/scale-or-die-at-accelerate-2025-the-state-of-solana-mev)

### Inferences

- **Option A: CT on stock tokens.** This needs Backed (or Ondo) to approve Mercury users' accounts, since `autoApprove=false`. It hides how much of a stock a user holds and moves, but not _which_ stock (the token account's mint is public) or the public deposit/withdraw amounts, and buys from DEXs arrive publicly. Backed would also lose its permanent-delegate reach over confidential balances (inference from §1), which it may resist. CT on xStocks also blocks most DeFi lending against them, which conflicts with Mercury's borrow product.
- **Option B: omnibus/pooled vaults.** Mercury buys and holds xStocks in a few pooled accounts and keeps per-user sub-ledgers. Chain observers see only aggregate flows; trade timing is blurred further if Mercury nets user orders internally and executes in batches or via RFQ/market makers. This is the most realistic "privacy for investing" in 2026. Costs: Mercury becomes a custodian and broker-like intermediary (licensing, segregation, proof-of-reserves), loses the non-custodial narrative, and borrowing against positions becomes an internal credit book rather than an on-chain loan.
- **Option C: shielded or encrypted execution** (Umbra encrypted swaps, Arcium order books, MagicBlock PER for private OTC). Early, liquidity-thin and mostly unproven for xStocks. Revisit in 2027.
- **Baseline any design should adopt:** route all user swaps through MEV-protected submission (Jito/BAM path with DontFront, or Helius MEV-Protect), and use limit/RFQ execution instead of large market swaps. This prevents value extraction, not observation.

### Gaps

- Not confirmed: whether Backed or Ondo have any public policy or roadmap for approving CT accounts, setting an auditor key, or enabling auto-approve.
- BAM's current share of Solana stake and its exact privacy guarantees in Oct 2026 are unknown.
- No live Solana dark pool with verified volume for tokenized equities was found.
- Robinhood/Kraken/other tokenized-stock CT support was not checked.

---

## 4. Compliance-preserving privacy: view keys, travel rule, screening, association sets, sanctions risk, regulated precedents

### Takeaway

The regulatory perimeter in Oct 2026 tolerates _privacy with accountable disclosure_: KYC'd users, screening before entry and exit, issuer or auditor view keys, and retained records. It is hostile to _anonymity_. EU AMLR Art. 79 (applies from 10 Jul 2027) bars CASPs from keeping anonymous crypto accounts "or any account otherwise allowing … the anonymisation or increased obfuscation of transactions", and MiCA 76(3) restricts trading admission of assets with built-in anonymisation unless holders can be identified. Regulated precedents point the same way: Paxos's USAD on Aleo (live Feb 2026), Circle's USDCx on Aleo, Zama cUSDT (live, about $7.7M TVL), Circle Arc (privacy still on roadmap, TEE-based), Kinexys/Canton (permissioned visibility), and Ethereum's Kohaku (integrating Privacy Pools).

### Cited Findings

**EU AMLR / MiCA**

- AMLR Art. 79(1): credit institutions, financial institutions and CASPs "shall be prohibited from keeping … anonymous crypto-asset accounts as well as any account otherwise allowing for the anonymisation of the customer account holder or the anonymisation or increased obfuscation of transactions, including through anonymity-enhancing coins." Art. 79(2) requires CDD on existing anonymous accounts before any use. — [Springlex reproduction of Reg. (EU) 2024/1624, Art. 79](https://www.springlex.eu/en/packages/aml/amlr-regulation/article-79/)
- Applies from **10 July 2027**. Didit argues the scope is narrower than headlines suggest: self-hosted wallets are not banned. Under **MiCA Art. 76(3)**, platform rules must prevent admission of crypto-assets with an inbuilt anonymisation function unless holders and history can be identified. — [Didit AMLR guide](https://didit.me/blog/amlr-crypto-casp-requirements/). Press reads it as barring CASPs from Monero/Zcash-style coins. — [Cointelegraph](https://cointelegraph.com/news/eu-crypto-ban-anonymous-privacy-tokens-2027). Separately, AMLA directly supervises up to 40 CASPs from 1 Jul 2027 (a different date). — [AMBCrypto](https://ambcrypto.com/eus-crypto-crackdown-40-firms-to-face-scrutiny-by-2027-details/)
- The AMLR definition of anonymity-enhancing coins covers built-in features that anonymise transfer information "either systematically or optionally" (per secondary reporting; Art. 2 text not retrieved). — [Didit](https://didit.me/blog/amlr-crypto-casp-requirements/)

**Travel rule (FATF R.16 / EU TFR)**

- FATF revised R.16 in June 2025 and opened consultation on implementation guidance in June 2026 (comments closed 21 Aug 2026). Countries are expected to be ready by **end-2030**. — [FATF](https://www.fatf-gafi.org/en/publications/Fatfrecommendations/R16-Public-Consultation-June-2026.html). The guidance was expected to finalize around October 2026 and to cover missing or partial information and de minimis thresholds. — [RUSI](https://www.rusi.org/explore-our-research/publications/commentary/getting-financial-task-forces-travel-rule-right-delivering-guidance)
- EU TFR (Reg. 2023/1113), as summarized by an operator's compliance wiki: it applies when at least one party is a CASP and not to self-hosted-to-self-hosted transfers. Transfers above €1,000 to or from a self-hosted wallet the customer claims as their own need proof of ownership. Information must reach the counterparty CASP before or at the time of transfer, and records are kept at least 5 years. — [General Bytes TR wiki](https://generalbytes.atlassian.net/wiki/spaces/ESD/pages/3779526658/EU+Specific+TR+Details+and+Instructions). The EBA Travel Rule Guidelines apply from 30 Dec 2024 and cover missing-information handling and self-hosted-address risk. — [EBA GL/2024/11](https://www.eba.europa.eu/sites/default/files/2024-07/6de6e9b9-0ed9-49cd-985d-c0834b5b4356/Travel%20Rule%20Guidelines.pdf)

**Screening before entry and association sets**

- Range's guide: screen the depositor's wallet before accepting funds via the Address Risk Score endpoint. — [Range docs](https://docs.range.org/risk-api/guides/privacy-protocol-screening). On-chain enforcement via Switchboard-verified signed risk scores (Umbra) and perimeter screening at entry and exit (Cloak). — [Range/Umbra](https://range.org/blog/umbra-integrates-range-to-power-real-time-risk-and-compliance-for-private-transfers-on-solana); [Range/Cloak](https://range.org/blog/how-cloak-screens-for-sanctioned-addresses-before-its-privacy-layer-applies)
- **Privacy Pools (0xbow):** an Association Set Provider screens deposits against sanctions, stolen-funds and risk data. Withdrawals prove membership in the compliant set via an in-browser ZK proof. Sets are dynamic (illicit deposits can be removed later), and excluded depositors can "ragequit" back to their origin address. — [Cointelegraph](https://cointelegraph.com/news/privacy-pools-launches-ethereum-support-vitalik-buterin). Ethereum mainnet since Mar 2025: about $6M volume, 1,500+ users, 1,186+ withdrawals (as of Apr 2026), and a $3.5M seed (Nov 2025, with Coinbase Ventures). Ethereum only, no Solana. — [BlockEden, 12 Apr 2026 (promotional source)](https://blockeden.xyz/blog/2026/04/12/0xbow-privacy-compliance-defi-fatf-travel-rule/). The earlier report's figure of about $9M was not re-verified here.
- Legal backdrop cited by the same source: the Fifth Circuit ruled in Nov 2024 that immutable smart contracts are not IEEPA "property", and Treasury lifted Tornado Cash sanctions in March 2025. — [BlockEden](https://blockeden.xyz/blog/2026/04/12/0xbow-privacy-compliance-defi-fatf-travel-rule/)

**Regulated precedents (status dated)**

- **Paxos Labs USAD on Aleo:** announced 1 Oct 2025, **live on Aleo mainnet 11 Feb 2026**. 1:1 backed by USDG reserves, with participant identities and amounts confidential ("privacy by default"). — [Aleo announcement](https://aleo.org/post/paxos-labs-and-ANF-launch-USAD-Private-Stablecoin/); [BusinessWire, 11 Feb 2026](https://www.businesswire.com/news/home/20260211924754/en/Paxos-Labs-Aleo-Network-Foundation-Announce-USAD-Stablecoin-Live-on-Aleo-Mainnet)
- **Circle USDCx on Aleo:** announced 9 Dec 2025 as a private, programmable stablecoin. — [BusinessWire](https://secure.businesswire.com/news/home/20251209069657/en/Aleo-to-Launch-USDCx-a-Private-and-Programmable-Stablecoin-Built-for-Real-World-Use)
- **Circle Arc:** docs say privacy is "on the roadmap and not yet available on Arc". The design runs validators' private execution inside hardware enclaves, uses a Shamir-split master key reconstructed only in attested enclaves and post-quantum hybrid encryption, and controls access through per-function policies and trust domains. — [Arc docs: opt-in privacy](https://docs.arc.io/arc/concepts/opt-in-privacy). Public mainnet was reported for 16 Sep 2026, unconfirmed. — [Decrypt](https://decrypt.co/340212/what-is-arc-the-stablecoin-blockchain-from-usdc-issuer-circle). Note: the Arc docs page contained embedded "agent instructions" text, which I ignored.
- **Zama (FHE, Ethereum):** mainnet launched 30–31 Dec 2025. USDT wraps into confidential **cUSDT** (ERC-7984) in two transactions. As of mid-Sep 2026: $131.3M cumulative shielded volume and **$7.7M shielded TVL**, plus 16 confidential Morpho vaults. The article does not say whether Tether or Zama operates the wrapper. — [Crypto Briefing, 15 Sep 2026](https://cryptobriefing.com/usdt-live-zama-confidential-transactions/)
- **JPMorgan Kinexys:** Project EPIC (Nov 2024) ran privacy and identity proofs of concept, including Zama fhEVM and Rayls. — [Zama](https://www.zama.org/post/kinexys-by-jpmorgan-releases-a-proof-of-concept-leveraging-zama-fhevm). JPM Coin (JPMD) expanded to Base (Nov 2025), and native Canton issuance was announced 7 Jan 2026, phased through 2026. — [The Block](https://www.theblock.co/news/business/2026-01-07-jpmorgan-jpm-coin-canton-384575)
- **Canton:** transactions are decomposed into "views", each party sees only its portion, and privacy and permissions are configured in Daml. — [Canton docs](https://docs.canton.network/overview/understand/what-is-canton); [Canton primer](https://www.canton.network/blog/canton-network-primer-8-terms)
- **Ethereum Kohaku:** an SDK plus a reference wallet (an Ambire fork, not consumer-oriented). Phase 1 (2025) covered private addresses and private balance/send. Phase 2 (2025–26) covers per-dapp account isolation, shielded transactions and P2P broadcast. Phase 3 (2026+) covers ZK recovery and PQ signatures. — [QuickNode deep-dive](https://blog.quicknode.com/ethereum-kohaku-wallet-privacy-roadmap). It integrates Privacy Pools and Railgun. — [BlockEden](https://blockeden.xyz/blog/2026/04/12/0xbow-privacy-compliance-defi-fatf-travel-rule/)

### Inferences

- **Mercury's compliance posture under CT.** Mercury as issuer holds the auditor key, approves every confidential account (manual approve, tied to KYC), runs a transfer-hook allowlist (parties visible to the hook), keeps freeze and pause, and retains decrypted amount records. That arguably keeps users identifiable and transactions reconstructable by the obliged entity, which is the property Art. 79 and MiCA 76(3) turn on. Whether "privacy from the public but not from the CASP" counts as "increased obfuscation" is an open legal question. Get counsel.
- **Travel rule.**
  - CT hides amounts, so counterparty VASPs can't apply thresholds from chain data alone. Mercury must send originator/beneficiary data and amounts off-chain (TRP/TRUST-style), using its auditor-decrypted or client-reported amounts.
  - Omnibus internal transfers raise intra-CASP questions.
  - With shielded pools, the beneficiary VASP can't see the originating address, so a structured off-chain message is the only channel. Design for TR messaging regardless of the privacy primitive.
- **Selective disclosure granularity.** Token-2022 CT gives only a mint-wide auditor key and per-wallet keys (sharing one discloses all of a user's CT accounts). Per-transaction or date-range disclosure, as with Umbra MVK/viewing keys, needs either an app-layer escrow of decrypted records or a different primitive.
- **Sanctions risk for Mercury.** The controls regulators and courts look for are: entry/exit screening with on-chain enforcement (Range plus oracle), the ability to freeze or refuse (manual CT approval, hooks, freeze), no unhosted-to-unhosted anonymity for non-KYC'd parties, and documented lawful-access procedures. A Tornado-style immutable, permissionless anonymity pool is what to avoid.

### Gaps

- Primary EUR-Lex text of AMLR Art. 2 (definition) and Art. 90 (dates) could not be fetched. Dates rest on Didit.
- No source found on how the EBA or national regulators treat Token-2022 CT, or shielded-pool transfers, under the TFR. Intra-CASP (omnibus) treatment under the TFR is not confirmed.
- Status of FATF R.16 final guidance (expected around Oct 2026) not confirmed.
- USAD and USDCx adoption figures, and their exact view-key or regulator-access mechanics, not found.
- Whether Arc mainnet launched on 16 Sep 2026 and whether any privacy feature shipped with it is unconfirmed.
- Roman Storm and US enforcement developments after the earlier report were not re-researched.

---

## 5. Costs, limits, and what a small team can integrate vs must build

### Takeaway

A small team can _integrate_, without writing cryptography: CT on its own mint (JS SDKs exist, tx v1 makes a transfer one transaction, about 0.0015 SOL rent per account, roughly 100x a plain transfer's compute), Range screening, Helius/Jito MEV protection, and third-party shielded rails (Umbra SDK, MagicBlock API, Helius Rings when on mainnet). It must _build_: the Privy-to-ElGamal key flow, auditor indexing and decryption, pending-balance automation, travel-rule messaging, and (for investing) the omnibus ledger. The hard limits are no party privacy in CT, visible deposit/withdraw amounts, no PDA/DeFi use of confidential balances (pending C-SPL), sparse wallet and explorer support, and kill-switch risk.

### Cited Findings

- Compute per proof and tx size: see §1. Range proof 64/128/256-bit = 111k/200k/368k CU, 1.4M CU per-tx cap, 4,096-byte tx v1 since 15 Sep 2026. — [xroot.dev](https://xroot.dev/blog/solana-confidential-transfers-kill-switch-proof-cost)
- Rent: about 295 bytes, about 0.0015 SOL per CT-enabled account. Proof-context accounts hold rent until closed. — [Solana CT integration guide](https://solana.com/docs/tokens/extensions/confidential-transfer/integration-guide); [xroot.dev](https://xroot.dev/blog/solana-confidential-transfers-kill-switch-proof-cost)
- Client-side: proofs take "a few seconds" (Spark), and mobile decryption takes about 1 s (xroot). — [Spark](https://www.spark.money/research/solana-token-extensions-payments); [xroot.dev](https://xroot.dev/blog/solana-confidential-transfers-kill-switch-proof-cost)
- SDKs: `@solana/zk-sdk` (WASM), `@solana-program/zk-elgamal-proof`, `@solana-program/token-2022` (high-level helpers, auto-reads the auditor key), `spl-token-client` (Rust, including registry configure). — [Solana CT integration guide](https://solana.com/docs/tokens/extensions/confidential-transfer/integration-guide)
- Umbra SDK: TypeScript, mainnet and devnet, standard wallet adapters. MagicBlock: a single-API private USDC transfer plus an MCP server. — [Colosseum Codex](https://blog.colosseum.com/umbra-sdk-magicblock-private-payments-x402/)
- Umbra had a $500 per-user deposit cap at launch (Feb 2026). — [The Block](https://www.theblock.co/post/387564/arcium-launches-privacy-preserving-mainnet-alpha-on-solana-as-umbra-debuts-shielded-finance-layer)
- Helius Rings is beta and names, endpoints and behavior "may change". — [Helius Privacy docs](https://docs.helius.dev/privacy)

### Inferences

- **Integrate (weeks):** a CT-enabled Mercury dollar mint. Relayer-paid CT deposit/transfer/withdraw using the JS helpers. A Range risk API at onboarding and send time. Jito DontFront / Helius MEV-Protect on swaps. Optionally an Umbra or MagicBlock "private send" behind a feature flag with low limits.
- **Build (months):**
  - Privy-to-ElGamal/AES key derivation, recovery and rotation.
  - A CT indexer and decryptor for the auditor key, plus reconciliation.
  - Automatic apply-pending before sends and on deposit.
  - A Rust or service-side registry configure path (JS missing).
  - UI states for locked, pending and available balances.
  - Travel-rule messaging with the amounts kept off-chain.
  - For investing privacy: an omnibus position ledger, internal netting and batched execution.
- **Do not build:** custom ZK circuits, mixers, or MPC networks.
- **Sequencing suggestion.** Phase 1: Mercury dollar with CT initialized (manual approve, auditor set), public by default. Phase 2: opt-in "private balance" for KYC'd users. Phase 3: unlinkable P2P via a screened partner pool. Phase 4: re-evaluate C-SPL/Arcium for confidential balances usable in Mercury's lending, plus private xStocks positions if Backed enables CT.

### Gaps

- No benchmarked proof-generation times for `@solana/zk-sdk` on iOS/Android were found.
- No fee schedules for Umbra, MagicBlock Private Payments or Helius Rings.
- No data on Privy's support for the `solana-conf-bal/v1` derivation or a PRF/IKM export.
- No real-world SOL/$ cost per CT under current priority-fee conditions.
