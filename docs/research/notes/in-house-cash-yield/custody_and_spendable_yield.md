# Custody and spendable yield: account and token designs for "cash that earns and stays spendable" (Solana first)

Research date: 2026-10-21. Product features change quickly, so each item carries the date its source gives. "Inferences" are this researcher's reasoning, not sourced facts.

## 1. Solana smart accounts and programmable wallets (Squads, Swig, Lazorkit, Crossmint, Privy): what each supports, the custody model it implies, and whether a smart account can hold a yield position and auto-withdraw atomically on spend

### Takeaway

A smart account is not needed to make "withdraw from yield, then spend" atomic on Solana. A plain Privy EOA can already sign one transaction that holds a lending-withdraw instruction and a Jupiter swap instruction together. The hard part is the deposit side: getting idle USDC swept into yield with no user signature. That takes a delegated signer. There are two ways to get one:

- **Privy signers plus policies.** Enforced off-chain, inside Privy's secure enclave.
- **An on-chain smart account with scoped roles.** Swig roles or ProgramScope, or Squads Smart Account policies and spending limits. Enforced by the program.

### Cited Findings

**Privy: signers, formerly "session signers" / "delegated actions"**

- Privy describes signers as a way to "add signers to wallets that can take actions within the scope of certain permissions". Listed use cases include limit orders or agentic trades "even while a user is offline", subscriptions and portfolio rebalancing. — [Privy docs: Signers overview](https://docs.privy.io/wallets/using-wallets/signers/overview)
- Privy's custody claims (from its own docs):
  - "Privy's architecture guarantees that a signer will never see the wallet's private key."
  - "All signing takes place in a secure enclave that only your application can make authorized requests to."
  - Signers can be attached to wallets owned by users, authorization keys or key quorums.
  - Source: [Privy docs: Signers overview](https://docs.privy.io/wallets/using-wallets/signers/overview)
- How a signer gets added:
  - Client SDKs call `addSigners` with a `signerId` and optional `policyIds`. Server/REST updates set `additional_signers`, and "The wallet owner must sign the request." — [Privy docs: Add signers](https://docs.privy.io/wallets/using-wallets/signers/add-signers)
  - The older Solana flow, `delegateWallet({chainType:'solana'})`, opens a Privy modal in which the user approves or rejects the delegation. — [Privy docs: delegate wallet](https://docs.privy.io/wallets/using-wallets/session-signers/delegate-wallet)
  - The add-signers page does not document revocation or Solana-specific examples; its examples are EVM. — [Privy docs: Add signers](https://docs.privy.io/wallets/using-wallets/signers/add-signers)
- Privy policies on Solana:
  - Supported methods: `signTransaction`, `signAndSendTransaction`, `signMessage`, export key and export seed.
  - Conditions can test `programId`, System Program instruction names and Transfer fields, and SPL Token `Transfer`/`TransferChecked` amount and destination.
  - Custom programs can be decoded from an Anchor IDL (Anchor 0.30 or later, at most 32 KB, explicit discriminators). Privy ignores the IDL's address, so the IDL must be paired with a `programId` condition.
  - "DENY actions take precedence over ALLOW actions." Unmatched requests are denied by default.
  - "Every instruction must evaluate to an ALLOW action for the transaction to be allowed."
  - SPL Token decoding covers only Transfer, TransferChecked, Burn, MintTo, CloseAccount and InitializeAccount3.
  - For sign-and-send, simulation runs before policy evaluation.
  - Source: [Privy docs: Policies overview](https://docs.privy.io/controls/policies/overview)
- Privy Earn (wallet action; the page carries no dates):
  - What it does: "Deposit into vaults, withdraw at any time, and track positions in real time." Each deposit or withdraw is a "single API call per operation".
  - Providers: some are self-serve, and more Veda, Aave, Morpho and Kamino vaults are available "on any chain" through sales.
  - Fees: apps can keep a configurable share of yield (Morpho up to 50%; Aave performance fee up to 100%).
  - Consent: the docs say users "should explicitly direct the deposit action".
  - Not covered: Solana is not named explicitly, and there is no auto-withdraw-on-spend feature.
  - Source: [Privy docs: Earn overview](https://docs.privy.io/wallets/actions/earn/overview)
- Privy publishes a Kamino Earn recipe. It uses backend, developer-owned Solana wallets, with the app's authorization key as wallet owner, and builds deposits with `@kamino-finance/klend-sdk`. — [Privy recipe: Kamino guide](https://docs.privy.io/recipes/kamino-guide)
- Privy's Veda integration docs say deposits and withdrawals "settle synchronously in a single transaction". These docs describe the generic integration, not Plasma One specifically. — [Privy docs: Veda provider](https://docs.privy.io/wallets/actions/earn/providers/veda), as summarised in [Veda/Plasma search results](https://www.veda.tech/blog/plasma-one-app-stablecoins-veda-vault)
- Privy custody model:
  - Embedded wallets are described as self-custodial by default.
  - Keys use distributed key sharding, so "no single party, including Privy," holds a complete key.
  - Keys are reconstituted only inside TEEs at signing time, with user authorization.
  - Sources: [Privy docs: security architecture](https://docs.privy.io/guide/security/architecture); [Privy blog: how embedded wallets work](https://privy.io/blog/how-privy-embedded-wallets-work)
  - Third-party pages say the scheme is 2-of-3 Shamir; Privy's own pages do not name the scheme. — [Crossmint: Privy vs Crossmint](https://crossmint.com/learn/privy-vs-crossmint)
- Privy markets "custodial and self-custodial wallets side-by-side using one simple API" and "switching between self-custody, custodial, and customer-controlled models". — [Privy: Flexible custody](https://www.privy.io/flexible-custody)
- Privy has no documented native Solana smart-account (Swig or Squads) integration:
  - Alchemy's Privy integration covers only gas sponsorship (fee payer) for Privy Solana wallets. — [Alchemy docs: Privy signer](https://www.alchemy.com/docs/wallets/third-party/signers/privy)
  - Para, by contrast, documents using its embedded wallet as the Swig root authority. — [Para docs: Swig](https://docs.getpara.com/v2/react/guides/account-abstraction/swig)

**Squads Smart Account Program and Squads v4/v5**

- Smart Account Program README (v0.1):
  - Features: "Atomic policy enforcement and transaction execution", aimed at "fully onchain payment service providers, stablecoin banks, and programmable wallets"; rent-free wallet creation; archivable accounts using state compression; custom policy programs.
  - Audits: OtterSec and Certora, plus formal verification by Certora.
  - License: AGPL-3.0.
  - Warning: a compromised `settings_authority` can lower thresholds or swap members.
  - Source: [GitHub: Squads-Protocol/smart-account-program](https://github.com/Squads-Protocol/smart-account-program)
- Squads mainnet blog:
  - Live features: policies (m-of-n, admin keys, time locks), direct debits and subscriptions (third parties pull capped amounts), spending limits, and synchronous execution ("Enforce policy checks and execute transactions in the same operation").
  - Coming soon: rent-free accounts, session keys and passkeys.
  - Partners: Squads API is permissioned and Crossmint is the first partner.
  - Date conflict: the page metadata says April 14, 2026, but the text cites a Q2 2025 passkey target. The real publication date is probably 2025.
  - Source: [Squads blog: Smart Account Program live on mainnet](https://squads.xyz/blog/squads-smart-account-program-live-on-mainnet)
- Squads API v1 rules:
  - Spending limits are per token, with periods of one-time, day, week, month or year, plus allowed destinations and authorized signers.
  - "Thresholds are required for all transactions except spending limit debits", and time locks do not apply to spending-limit debits.
  - Source: [Squads API docs: introduction](https://developers.squads.so/squads-api/api-reference/v1/introduction)
- Squads v5 (forward-looking blog): synchronous execution with multiple top-level signatures (single-player MFA), and "hooks" programs that tighten or loosen consensus (spending limits, program allow-lists). It was stated to launch "later this year", and its ship status could not be confirmed. — [Squads blog: Protocol v5](https://squads.xyz/blog/squads-protocol-v5)
- Squads Grid offers stablecoin-native smart accounts with fiat rails. Its developer docs list Yield as "Coming soon", while marketing pages present yield as available. — [Squads Grid docs](https://developers.squads.so/grid/v0/introduction); [Squads blog: Grid](https://squads.xyz/blog/grid-a-stablecoin-api-for-accounts-payments-cards-and-yield)
- Squads Altitude is a self-custodial business account that includes "earn yield on capital held within the account". It launched publicly in December 2025, and Squads says it "does not take custody of customer funds". No yield rate or source was published. — [Squads blog: Introducing Altitude](https://squads.xyz/blog/introducing-altitude-and-a-strategic-investment-from-haun-ventures); [Solana Compass: Altitude](https://solanacompass.com/projects/altitude)

**Crossmint**

- Crossmint's Solana smart wallets are "powered by the battle-tested Squads Protocol" and use PDAs. — [Crossmint blog: Solana embedded smart wallets](https://blog.crossmint.com/solana-embedded-smart-wallets); [Squads blog: Crossmint integration](https://squads.so/blog/crossmint-integration)
- Solana delegated signers (scoped, on-chain permissions) were added in February 2025. They have since been renamed "operational signers", though the SDK method names still say "delegated". — [Crossmint changelog 2025-02-26](https://docs.crossmint.com/changelog/2025-02-26); [Crossmint glossary](https://docs.crossmint.com/introduction/glossary)

**Swig**

- Model: roles bind one authority to one or more permission actions.
- Authority types:
  - Ed25519, Secp256k1 and Secp256r1 (passkey), each with a time-bounded Session variant.
  - ProgramExec, which "checks another instruction in the same transaction against an expected program ID and instruction prefix".
- Permission types:
  - All and AllButManageAuthority; ManageAuthority.
  - SolLimit and SolRecurringLimit; TokenLimit and TokenRecurringLimit, using slot-based recurring windows, with destination variants.
  - Program, ProgramAll and ProgramCurated.
  - ProgramScope, which "binds a program, a target account, and numeric field offsets".
  - Stake variants, SubAccount, CloseSwigAuthority and RecoveryAuthority.
- Source: [Swig docs: Concepts and permissions](https://build.onswig.com/protocol/concepts-and-permissions)
- Sessions: `CreateSessionV1` "stores a session key and expiration window". "Sessions keep the existing permission model", meaning a session reuses its role's actions. — [Swig docs: Sessions and sub-accounts](https://build.onswig.com/protocol/sessions-and-subaccounts)
- Sub-accounts: a sub-account is "a separate balance bucket for a role". It is a PDA derived from swig_id and role_id, signs via `SubAccountSignV1`, can be toggled on or off, and has `WithdrawFromSubAccountV1`. "`All` alone is not enough to create one." — [Swig docs: Sessions and sub-accounts](https://build.onswig.com/protocol/sessions-and-subaccounts)
- Ecosystem sources cite up to about 65,000 roles per wallet and authorities including OAuth and OTP. These come from marketing pages. — [Solana Compass: Swig](https://solanacompass.com/projects/swig)

**Lazorkit**

- Lazorkit is an open-source passkey smart wallet. Keys live in device secure hardware (WebAuthn) and are verified through Solana's native Secp256r1 instruction.
- It supports paymaster gas sponsorship and "scoped session keys".
- Its mainnet program is reportedly audited by Accretion; this was not independently verified.
- Sources: [Solana Compass: LazorKit](https://solanacompass.com/projects/lazorkit); [Solana templates: Lazorkit starter](https://solana.com/developers/templates/lazorkit-starter-next)

### Inferences

- **Atomic withdraw-on-spend does not need a smart account.** Solana transactions can carry instructions to several programs under one signature. Every Mercury spend (Jupiter stock buy, send, loan repay, basket fund) is already user-signed, so the app can prepend a Kamino or Jupiter Lend withdraw for exactly the needed amount to the same transaction. The user signs once, as today. A smart account adds value only for (a) delegated deposits/sweeps without the user present, and (b) on-chain-enforced limits.
- **Two enforcement models for a sweep-only delegate:**
  - **Privy signer plus policy.** Allow only `programId` equals the lending program, with Anchor-decoded instruction name `deposit`. Enforcement happens off-chain in Privy's enclave: users must trust Privy's policy engine, and Mercury holds an authorization key that can sign within that policy.
  - **Swig role, or Squads Smart Account policy or spending limit.** Enforcement is on-chain. With Swig, ProgramScope or Program permissions could limit the Mercury server key to "deposit into the Kamino reserve from this wallet". This requires moving user cash from the Privy EOA into a smart-account PDA. That is a migration and changes address semantics, though the Privy key stays the root authority, so custody stays with the user.
- **Unresolved risk in the Privy policy route.** It is unclear whether a policy can pin the deposit's destination or receipt token account to the user's own ATA. Privy decodes instruction args from the IDL, but account-level constraints for custom programs are not documented. If they cannot be pinned, a "deposit-only" signer might be steerable into a different vault or obligation. This must be verified before relying on it.
- **Custody framing.** With either delegate model, the user's key remains the root authority, and Mercury's delegate can neither move value to arbitrary destinations nor act outside the policy. That supports the position that Mercury lacks "total independent control" (see Q5), but needs legal review.

### Gaps

- No Privy doc confirming whether policies can constrain specific account indices (destination or owner) for custom-program instructions on Solana.
- No Privy doc on revocation UX for Solana signers, or a 2026 changelog for Solana signer support. Older Expo docs said the Solana provider supported only `signMessage`, which is likely stale — [Privy Expo Solana usage (legacy)](https://docs.privy.io/guide/expo/embedded/solana/usage).
- Swig audits are not listed on the fetched pages, and there is no first-party Privy-plus-Swig integration guide.
- Squads Smart Account session keys and passkeys were "coming soon"; whether they have shipped by October 2026 is unconfirmed.
- Whether Kamino and Jupiter Lend IDLs meet Privy's Anchor 0.30+ IDL requirement has not been verified.

## 2. A program-owned per-user vault (PDA) the user controls: making deposit, withdraw and spend one atomic transaction (lending withdraw plus swap via CPI), compute and size limits, ALTs and Jito bundles

### Takeaway

On-chain atomic withdraw-and-spend is feasible today. It is simplest as top-level instructions in one v0 transaction using address lookup tables, rather than a Mercury program that CPIs into both Kamino and Jupiter. The binding constraints are:

- the 1,232-byte transaction size (the v1 format raises it to 4,096 bytes but drops ALT support);
- the 64-account load cap;
- CPI depth of 4 (8 once SIMD-0268 activates);
- the 1.4M compute-unit cap;
- counterparty protocols restricting which programs can share a transaction with them.

Jito bundles (up to 5 transactions, all-or-nothing) are the fallback when one transaction is too large.

### Cited Findings

- Compute: each transaction is capped at 1,400,000 CUs, with a default of 200,000 CUs per instruction. — [Solana docs: compute budget](https://solana.com/docs/core/fees/compute-budget)
- CPI depth:
  - SIMD-0268 raises the maximum nested CPI depth from 4 to 8 (stack height from 5 to 9). The upgrade page labels it "in development", gated behind SIMD-0219.
  - Re-entrancy rule: A→A self-calls are allowed, but A→B→A is not.
  - Source: [Solana upgrades: CPI nesting depth](https://solana.com/fi/upgrades/cpi-nesting-depth)
- Transaction size:
  - SIMD-0296 raises the maximum from 1,232 to 4,096 bytes, but only via a new v1 transaction format (version byte 129).
  - v1 replaces ComputeBudget instructions with a header config mask and "does not support address lookup tables".
  - Activation timing: the Solana Foundation page says Q3 2026. Solana Compass reported a September 9 mainnet activation plan. Actual activation should be checked via feature ID `txv1aq4pp281K9um3tnPgkfX8UqtFT6wcVW3hNezGLL`.
  - Sources: [Solana upgrades: larger transaction sizes](https://solana.com/upgrades/larger-transaction-sizes); [Solana Compass: Transaction V1 heads to mainnet](https://solanacompass.com/news/solana-transaction-v1-heads-to-mainnet-september-9-format-breaking-changes-and-what-it-unlocks)
- Address lookup tables:
  - A table stores up to 256 addresses, works only in v0 transactions, and a transaction may reference multiple tables.
  - The Solana Cookbook states a 64-loaded-account cap per transaction. A Chainstack guide's "256 accounts per table" wording conflicts if read as a per-transaction limit.
  - Sources: [Solana docs: lookup tables](https://solana.com/docs/advanced/lookup-tables); [Solana Cookbook: lookup tables](https://solana.com/vi/developers/cookbook/transactions/lookup-tables); contrast with [Chainstack: ALTs](https://docs.chainstack.com/docs/solana-address-lookup-tables)
- Jito bundles: up to 5 transactions, executed sequentially in order within the same block on Jito validators. "If any transaction fails, none are committed." The tip usually goes in the last transaction. — [QuickNode: Jito bundles](https://www.quicknode.com/guides/solana-development/transactions/jito-bundles); [Helius: send bundle](https://www.helius.dev/docs/sending-transactions/send-bundle.md)
- Kamino Lend withdraw path:
  - `refresh_reserve` must run before redeem so collateral is priced correctly; `redeem_reserve_collateral` burns cTokens for the underlying asset. — [Aurora: Kamino withdraw scenario](https://docs.intents.aurora.dev/intents-connect/developer-guides/solana/kamino-withdraw-scenario)
  - Obligation flows also need `refresh_obligation` first. — [klend docs: architecture](https://www.mintlify.com/kamino-finance/klend/concepts/architecture)
  - klend supports same-transaction flash borrow and repay. — [klend docs: liquidity instructions](https://www.mintlify.com/kamino-finance/klend/reference/instructions/liquidity)
  - klend has a `TransactionIncludesRestrictedPrograms` error, as reported in a search summary of the [klend instruction reference](https://www.mintlify.com/kamino-finance/klend/reference/instructions/overview).
- Composability can be revoked by a counterparty:
  - Jupiter Lend launched a one-click refinancing tool on November 27, 2025. It migrated Kamino positions in one atomic transaction.
  - On December 2, 2025, Kamino "updated its smart contracts to block Jupiter's program", while still allowing manual repay and withdraw.
  - Sources: [Blockworks: Jup Lend vs Kamino](https://blockworks.co/news/jup-lend-vs-kamino) (via the [MEXC reprint](https://www.mexc.com/news/248949))
- Jupiter Lend (JUICED / JupUSD):
  - The Lend SDK exposes `getDepositIx`/`getWithdrawIx` plus CPI contexts (`getDepositContext`/`getWithdrawContext`). The deposit/withdraw/mint/redeem REST endpoints need an API key.
  - "Under normal conditions, withdrawals are instant". Under mass withdrawals or high utilisation, an Automated Debt Ceiling smooths outflows, so redemption can be delayed.
  - Source: [Jupiter dev docs: JUICED](https://developers.jup.ag/docs/jupusd/juiced)
- Jupiter Earn on Recurring is a live Solana precedent for "idle cash earns until it is spent":
  - Launched July 11, 2026. It "automatically routes idle USDC sitting in active DCA orders into Jupiter Lend"; when a sub-order fires, "the funds are withdrawn and the buy executes".
  - About 4.65% APY was shown at launch. It is described as "fully automatic once enabled", which implies opt-in.
  - Atomicity of withdraw plus swap is not stated.
  - Source: [Solana Compass: Earn on Recurring](https://solanacompass.com/news/jupiters-earn-on-recurring-puts-idle-usdc-in-dca-orders-to-work)

### Inferences

- **Recommended transaction shape for a spend:** `[ComputeBudget] [lending refresh + withdraw exact USDC] [Jupiter swap instructions] [optional fee/ATA instructions]` as one v0 transaction with ALTs (Jupiter's own ALTs plus a Mercury ALT for the lending accounts). Top-level composition avoids spending CPI depth: Mercury program → Jupiter → AMM → Token would already sit at the current limit of 4.
- **Per-user PDA vault, if Mercury wants one:**
  - It adds the ability for Mercury's program to enforce invariants on-chain (for example, "withdrawn USDC can only go to this swap or this payee").
  - It costs a custom audited program, upgrade-authority risk (the Infini-style admin-key failure, Q4), and more CPI depth.
  - A cheaper middle ground is a thin Mercury program instruction that only checks pre/post balances. It would use instruction introspection, the same pattern Swig's ProgramExec uses, rather than wrapping Jupiter via CPI.
- **Size and route trade-offs:**
  - Jupiter routes are account-heavy, so adding the lending instructions may require restricting route complexity.
  - The v1 format's 4,096 bytes helps with instruction data but not with account count, since v1 has no ALTs.
  - When a single transaction fails to fit, use a 2-transaction Jito bundle (withdraw, then swap). That is still atomic, but depends on a Jito leader slot and tip.
- **Avoid over-withdrawing:** read the exchange rate on-chain at build time and withdraw by shares for the exact USDC needed plus a small buffer. Then either leave the dust in USDC or re-deposit it in the same transaction.
- **Inflows:** sell proceeds and loan disbursements produced by user-signed transactions can append a `deposit` instruction to the same transaction ("sweep at the edges"). External inflows (on-ramp, P2P receipts) are the only case needing a delegated signer or the next user interaction.

### Gaps

- No measured CU or byte budgets were found for a "Kamino or Jupiter Lend withdraw plus Jupiter swap" transaction.
- Exactly what Kamino's restricted-programs check covers is unconfirmed. Whether it would block the Jupiter aggregator, or only Jupiter Lend, sharing a transaction with Kamino withdraws needs on-chain or code verification.
- The SIMD-0296 (v1) and SIMD-0268 mainnet activation status as of 2026-10-21 was not verified.
- Whether Jupiter Swap routes can use jlUSDC/JUICED directly as an input leg (redeeming within the route) is not documented on the fetched pages. JUICED docs say only that it can be held, transferred and used as collateral, while the FAQ says users can "swap for JUICED". — [Jupiter user docs: JupUSD FAQ](https://docs.jup.ag/user-docs/earn/jupusd/faq)

## 3. Token designs for spendable yield: rebasing, share-price, Token-2022 extensions, and Solana yield dollars

### Takeaway

Three families make the held token itself the yield position:

- **Rebasing tokens** (USDM-style). USDM is now defunct.
- **Share-price tokens** (sUSDS, USDY, JUICED/jlTokens, kTokens, USDC+).
- **Issuer revenue sharing paid off-chain** on a plain stablecoin (PYUSD in-app rewards, USDG partner rewards, USDB to businesses, Base App USDC rewards).

Token-2022's InterestBearing and ScaledUiAmount extensions only change displayed amounts. Transfer hooks cannot move a holder's funds. A permanent delegate can, but it is an issuer-wide custodial power. None of these can be retrofitted onto Circle's USDC.

### Cited Findings

- **Token-2022 InterestBearingMint is display-only.**
  - "No new tokens are created", and the change is purely aesthetic. The rate is set in basis points.
  - The UI amount is computed continuously from the cluster clock via `amount_to_ui_amount`.
  - Sources: [Solana course: interest-bearing token](https://solana.com/developers/courses/token-extensions/interest-bearing-token); [Chainstack: interest-bearing tokens](https://chainstack.com/solana-interest-bearing-tokens-token-2022/amp/)
  - Neodyme calls it "solely cosmetic", so programs can safely support it. — [Neodyme: Token-2022](https://neodyme.io/de/blog/token-2022)
  - Phantom: "this interest rate is for cosmetic purposes only". — [Phantom docs: Token22](https://docs.phantom.app/developer-powertools/solana-token-extensions-token22)
- **Token-2022 ScaledUiAmount.**
  - An updatable multiplier with an update authority; it can be scheduled for a future timestamp.
  - Use cases: stock splits, "dividends or distributing yield". Stored amounts never change.
  - It cannot be combined with InterestBearing. Conversions are floating-point and "not guaranteed to round-trip exactly".
  - Source: [Solana docs: Scaled UI Amount](https://solana.com/docs/tokens/extensions/scaled-ui-amount)
- **Transfer hooks cannot sweep funds.** The sender, mint, receiver and owner are de-escalated to read-only, non-signer accounts inside the hook CPI, "to prevent malicious use". Hooks may only add extra signer or writable accounts of their own. — [Solana guide: transfer hook](https://solana.com/developers/guides/token-extensions/transfer-hook); [Solana docs: transfer hook](https://solana.com/docs/tokens/extensions/transfer-hook)
- **Permanent delegate.** It is set at mint creation and gives one key "unrestricted, permanent transfer and burn rights over every single token account" of that mint. The typical use is compliance clawback. The source is secondary. — [Chainstack: Token-2022 utility extensions](https://chainstack.com/solana-token-2022-utility-extensions/)
- **Mountain USDM (rebasing T-bill dollar) is defunct.**
  - It rebased daily. Anchorage agreed to acquire Mountain in May 2025, and Mountain began an "orderly wind-down": minting stopped May 12, 2025, and rewards went to 0% after 30 days.
  - Pyth sunset the USDM feeds on June 11, 2025.
  - Sources: [The Block](https://www.theblock.co/post/354004/anchorage-acquires-mountain-protocol-sunset-usdm-token); [Pyth forum](https://dev-forum.pyth.network/t/deprecation-of-usdm-and-wusdm-feeds-on-pyth-core-june-11-2025/152)
  - Primary redemptions reportedly closed on August 22, 2025. — [tradingstrategy.ai: USDM](https://tradingstrategy.ai/trading-view/vaults/stablecoins/usdm)
- **Ondo USDY (share-price / accumulating).**
  - Its redemption value rises with accrued interest; one source cites about $1.117 on April 23, 2026.
  - Restricted to non-US persons, with KYC onboarding to an allowlist and a reported 40-day transfer restriction after subscription.
  - A rebasing wrapper, rUSDY, holds a constant 1.00 value. Note: the search summary garbled which variant rebases; Ondo's design is that USDY accumulates and rUSDY rebases. Verify with Ondo docs.
  - Sources: [eco.com: USDY deep dive 2026](https://eco.com/support/en/articles/15254015-usdy-deep-dive-2026-ondo-s-retail-yield-token); [Sei blog: USDY](https://blog.sei.io/usdy-on-sei-a-guide-to-tokenized-treasury-yield/)
- **Sky USDS / sUSDS on Solana.**
  - USDS was deployed on Solana on November 19, 2024 via Wormhole NTT, with Kamino and Drift incentives. The savings rate at launch was 8.3%, and is governance-set. — [Blockworks](https://blockworks.com/news/sky-deploys-stablecoin-on-solana)
  - A July 2026 listing says SkyLink 1:1 USDS bridging between Ethereum and Solana "has recommenced". — [MadeOnSol: Keel](https://madeonsol.com/tools/keel)
  - The live sUSDS-on-Solana status and rate were not confirmed.
- **Reflect USDC+.**
  - USDC deposits mint USDC+, a "fully liquid, interest-bearing stablecoin redeemable to the underlying asset on demand". There are no lockups or redemption fees, and an insurance pool is backed by Jito restaked assets. Sources differ on strategy: lending across Kamino and Jupiter Lend, or a Drift delta-neutral position.
  - Funding: a $3.75M seed round, led by a16z CSX.
  - Sources: [Blockworks: Reflect raise](https://blockworks.co/news/reflect-stablecoin-infra-raise); [Solana Compass: Reflect Money](https://solanacompass.com/projects/reflect-money)
- _*Perena USD*._*
  - A yield-bearing synthetic dollar backed by delta-neutral CEX positions (BTC/ETH/SOL), secured borrow-lend and RWAs (an OnRe reinsurance fund). It has senior and junior tranches (USD*-P, USD*-J).
  - About 15% APY was cited in a December 2025 press release.
  - Sources: [Barchart/DFDV press release](https://www.barchart.com/story/news/36454295/defi-development-corp-announces-strategic-partnership-with-perena-to-leverage-usd-stablecoin-yield-for-sps-growth); [Perena job posting (product description)](https://www.builtinnyc.com/job/solana-protocol-engineer/10539435)
- **Jupiter JupUSD / JUICED.**
  - JupUSD alone "does not accrue any yield". JUICED is the share token (9 decimals) whose exchange rate "never decreases". Yield comes from Jupiter Lend borrow interest plus T-bill yield on the reserves (mainly Ethena USDtb).
  - Mint and redeem through the JupUSD program carry a 0.04% fee; DEX swaps do not.
  - Sources: [Jupiter dev docs: JUICED](https://developers.jup.ag/docs/jupusd/juiced); [Jupiter docs: JupUSD FAQ](https://docs.jup.ag/user-docs/earn/jupusd/faq)
  - JupUSD is reported as 90% backed by BlackRock and Ethena's USDtb. — [The Block: JupUSD](https://www.theblock.co/post/384366/jupiter-rolls-out-native-jupusd-stablecoin-backed-90-by-blackrock-and-ethenas-usdtb)
- **PYUSD rewards.**
  - 3.7% annually on PYUSD held in US PayPal or Venmo wallets. The rate is "determined at all times in PayPal's sole discretion". The program was announced April 23, 2025. — [PayPal newsroom](https://newsroom.paypal-corp.com/2025-04-23-Buy-Hold-Earn-Rewards-PayPal-Unlocks-Rewards-for-Holding-PayPal-USD)
  - Sending on-chain to Solana or Ethereum wallets exits the loyalty program. — [Decrypt](https://decrypt.co/333472/coinbase-paypal-stablecoin-rewards-genius-prohibitions-how)
- **USDG (Global Dollar Network, issued by Paxos).**
  - Returns reserve yield to network partners "based on minting, custody, and acceptance activity". Holders get yield only if a partner passes it through. — [Global Dollar: earn with USDG](https://globaldollar.com/earn-with-usdg); [Global Dollar: join](https://globaldollar.com/join)
  - Third-party guides cite partner shares of about 97–100%. Paxos's on-chain "Partner Rewards Engine" entered closed alpha in March 2026. — [eco.com: USDG](https://eco.com/support/en/articles/11753007-what-is-global-dollar-usdg)
- **USDB (Bridge/Stripe).** Unlike USDC, where the issuer keeps the yield, "USDB passes that value to the business". — [Forrester interview with Bridge](https://www.forrester.com/blogs/how-stripe-and-bridge-are-pushing-stablecoin-real-world-adoption-a-conversation-with-mai-leduc)

### Inferences

- **Mercury cannot change USDC's behaviour.** Circle controls the USDC mint, so InterestBearing, ScaledUiAmount, hooks or a permanent delegate cannot be attached to it. Token-2022 tricks only apply to a Mercury-issued wrapper, such as "mUSD" over a kToken or jlUSDC.
- **What a Mercury-issued wrapper could do:**
  - Use ScaledUiAmount to make share-price yield look like a rebasing $1 balance in wallets. The Mercury update authority must be trusted.
  - A permanent delegate on that wrapper would hand Mercury unilateral power over user balances. That undermines the self-custody claim and likely meets FinCEN's "total independent control" test (Q5), so avoid it.
- **Share-price tokens (kTokens, jlTokens, JUICED, USDC+, USDY) are the cleanest on-chain "cash that earns".** The balance is the position, and spend means redeem plus pay in one transaction.
  - Risk ranking, roughly by source of yield: lending receipts on USDC (Kamino, Jupiter Lend) < T-bill tokens (USDY, KYC-gated, non-US) < strategy dollars (USDC+, USD*, with basis or credit risk).
  - USDY's allowlist and US-person restriction rule it out as a default for a US retail app.
- **The non-on-chain alternative is the Base App / PYUSD / USDG model:** keep plain USDC in the user's wallet and pay off-chain "rewards" funded by issuer revenue share. That gives zero UX friction (no sweep, instant spend) and no smart-contract risk. It needs (a) a revenue-share deal (USDG partner program, Bridge Open Issuance like Phantom's CASH, or a Circle arrangement), and (b) carries the most regulatory exposure under the CLARITY compromise (Q5).

### Gaps

- No primary Reflect or Perena docs were fetched (audits, redemption mechanics, current APY, TVL). The Blockworks risk piece on Reflect was commissioned by Reflect.
- Current (October 2026) sUSDS availability and rate on Solana are unknown.
- The USDY rebasing/accumulating detail needs confirmation from Ondo's docs.
- Whether Circle offers USDC revenue share to apps of Mercury's size was not researched here.

## 4. Consumer precedents: how leading products source yield, default vs opt-in, how spending pulls from the yield position, and custody

### Takeaway

Custodial products do it easily, because the "sweep" is an internal ledger move:

- Coinbase, PayPal, Robinhood, Wealthfront, Revolut, KAST, Backpack.
- Broker-dealers use regulated bank-sweep programs.

Self-custodial products do it two ways:

- **Off-chain rewards on a plain stablecoin:** Base App.
- **A vault the wallet holds, with withdraw-on-spend:** Plasma One (Privy plus a Veda vault, "no separate savings account"), ether.fi Cash (Safe), Jupiter Earn on Recurring.

Gnosis Pay shows the opposite design: card-safety modules make DeFi inside the card account awkward.

### Cited Findings

**Custodial / off-chain ledger**

- **Coinbase app (custodial).**
  - USDC rewards became exclusive to Coinbase One after December 15, 2025, at 3.5%. — [Decrypt](https://decrypt.co/351946/coinbase-ending-usdc-rewards-free-users-only-paid-members); [DL News](https://www.dlnews.com/articles/web3/coinbase-ends-usdc-rewards-for-non-paying-customers/)
  - The user agreement requires at least $1 USDC to earn. — [ConductAtlas: Coinbase user agreement](https://conductatlas.com/platform/coinbase/coinbase-user-agreement/provision/CA-P-020872/usdc-rewards-require-minimum-one-dollar-usdc-balance/)
  - A reported July 2026 change to "variable USDC yields" could not be confirmed.
- **Base App, formerly Coinbase Wallet (self-custodial).**
  - "up to 3.35% APY in rewards by holding USDC in the app". US only, not in the EU or Canada. Users must link a Coinbase account. Rewards are paid monthly into the wallet on Base, and the rate is at Coinbase's discretion.
  - This is a self-custodial precedent: yield on plain USDC with no vault, so spend is instant.
  - Source: [App Store: Base](https://apps.apple.com/app/id1278383455)
- **PayPal/Venmo PYUSD (custodial):** 3.7%, discretionary, and moving coins on-chain exits the program. — [PayPal newsroom](https://newsroom.paypal-corp.com/2025-04-23-Buy-Hold-Earn-Rewards-PayPal-Unlocks-Rewards-for-Holding-PayPal-USD); [Decrypt](https://decrypt.co/333472/coinbase-paypal-stablecoin-rewards-genius-prohibitions-how)
- **Robinhood (broker-dealer sweep).**
  - The High-Yield Cash Program, in rolling release from February 2, 2026, pays Gold subscribers 3.35% APY on eligible cash swept to program banks.
  - Program banks pay interest "minus any fees paid to Robinhood". The APY can change at the banks' discretion.
  - FDIC coverage is up to $1.5M across program banks. Cash is SIPC-protected until it is swept.
  - Sources: [Robinhood: High-Yield Cash Program](https://robinhood.com/us/en/support/articles/high-yield-cash-program/); [Robinhood: brokerage sweep program](https://robinhood.com/support/articles/360034303352/deposit-sweep-program)
  - A 2022 post describes customers who "opt in to brokerage cash sweep" having cash "automatically swept". — [Robinhood newsroom 2022](https://robinhood.com/newsroom/we-did-it-again-now-earn-4-apy-with-robinhood-gold/)
- **Wealthfront Cash Account (broker sweep).**
  - 3.55% base APY as of September 18, 2026, paid by program banks. "Not a deposit account", and Wealthfront Brokerage "does not pay interest".
  - Up to $8M FDIC eligibility, "free 24/7 instant withdrawals", and an optional debit card.
  - Sources: [Wealthfront cash page](https://cash.wealthfront.com/); [Wealthfront support](https://support.wealthfront.com/hc/en-us/articles/360043680212); [Wealthfront blog: APY](https://www.wealthfront.com/blog/cash-account-APY)
- **Revolut (EU).**
  - Instant Access Savings: withdraw "any time... with no fees and no delays". Up to 2.25% in Germany, with a €100k cap (varies by market and plan). — [Revolut DE: Instant Access Savings](https://www.revolut.com/en-DE/savings/open-a-savings-account/)
  - Money market funds are a separate product. — [Irish Tech News](https://irishtechnews.ie/?p=164991)
- **KAST (custodial).**
  - "KAST Earn" is powered by Gauntlet USD Alpha (Morpho and Pendle), quoted at 4.69% in January 2026 to over 500,000 users. — [Gauntlet](https://gauntlet.xyz/resources/gauntlet-usd-alpha-kast-earn-stablecoin-yield-to-500k-users)
  - A profile says cards spend stablecoins and draw on Earn balances "without manual withdrawals". This is unverified. — [Solana Compass: KAST](https://solanacompass.com/projects/kast)
  - A user publicly alleged that KAST "books incoming stablecoins as its own asset". — [The Defiant](https://thedefiant.io/news/cefi/kast-s-terms-of-service-draw-fire-after-public-feud-with-etherfi-ceo)
- **Backpack Exchange Auto Lend (custodial).**
  - When enabled in a subaccount, deposits go to the lending pool "by default" and "remain fully margin-eligible".
  - Manual redemption may be unavailable while Auto Lend is on.
  - Sources: [Backpack: What is Auto Lend](https://learn.backpack.exchange/zh-tw/articles/what-is-auto-lend); [Backpack: manage lend positions](https://learn.backpack.exchange/zh-tw/articles/how-do-i-manage-lend-and-borrow-positions-on-backpack-exchange)
- **Stripe Stablecoin Financial Accounts (businesses).**
  - Hold USDC or USDB; "Bridge acts as the custodian". USDB is backed by cash and BlackRock money market funds. — [Stripe docs](https://docs.stripe.com/financial-accounts/stablecoins)
  - Available in 101 countries, and USDB passes reserve value to businesses. — [Dynamic blog](https://www.dynamic.xyz/blog/stripe-bets-on-stablecoins-with-new-financial-accounts); [Forrester](https://www.forrester.com/blogs/how-stripe-and-bridge-are-pushing-stablecoin-real-world-adoption-a-conversation-with-mai-leduc)
  - Bridge reportedly received a conditional OCC national trust charter in February 2026. — [private.law wiki](https://wiki.private.law/en/bridge-stripe.md)

**Self-custodial / on-chain**

- **Plasma One (Privy embedded wallets, Plasma chain).**
  - "Users earn yield on their balance continuously, even as they spend from it". "There is no separate savings account to move funds into or out of". Yield applies to "eligible balances".
  - Traction: over $10M card spend, and a 90% repeat-spender rate (company-reported).
  - The post's date is ambiguous; the byline says June 25, 2026.
  - Source: [Privy blog: Plasma One](https://privy.io/blog/building-a-stablecoin-native-neobank-from-the-ground-up-with-plasma-one)
  - Yield comes from a Veda vault that allocates "to stablecoin lending markets like Aave". There are three card tiers with up to 4% cashback. — [Veda blog](https://www.veda.tech/blog/plasma-one-app-stablecoins-veda-vault)
  - Rain issues the cards, and the launch pitch claimed over 10% yield. — [Decrypt](https://decrypt.co/340659/plasma-to-launch-stablecoin-native-neobank-after-this-months-mainnet-beta); [The Defiant](https://thedefiant.io/news/infrastructure/plasma-launches-plasma-one-stablecoin-neobank)
  - An August 2026 snapshot showed about 3.2% base APY. — [Portals](https://explorer.portals.fi/yield/plasma:0xd1074e0ae85610ddba0147e29ebe0d8e5873a000.md)
- **ether.fi Cash.**
  - A Rain-issued Visa, with funds in a user-controlled Safe on Scroll.
  - Two modes: "Direct Pay" spends the USDC balance, and "Borrow Mode" borrows USDC against collateral, so assets keep earning.
  - Sources: [Bleap review](https://www.bleap.finance/en-us/blog/etherfi-crypto-card-review-pros-cons-alternatives); [community gist](https://gist.github.com/pmp89981/5e24d10697319d7ff4afa7eefbd0fffd)
  - These are secondary sources, and promo rates and dates vary.
- **Gnosis Pay (Safe on Gnosis Chain).**
  - The Roles module limits the card to a token, a daily cap and the issuer's settlement Safe. The Delay module puts a 3-minute hold on all non-card outgoing transactions and pauses the card while they are pending. — [Gnosis Pay docs: GP Safe](https://docs.gnosispay.com/gp-onchain/about-GP-safe)
  - The help centre recommends keeping DeFi in a separate wallet. — [Gnosis Pay help](https://help.gnosispay.com/en/articles/8464758-how-is-the-gnosis-card-self-custodial)
  - A Delay-module exploit occurred (date not captured), and Gnosis pledged to cover losses. — [The Defiant](https://thedefiant.io/news/hacks/gnosis-pay-hit-by-delay-module-exploit-as-gnosis-pledges-to-cover-user-losses)
  - No native Aave yield integration was found.
- **Jupiter Earn on Recurring (July 11, 2026):** idle USDC in DCA orders goes to Jupiter Lend and is withdrawn at each fill. — [Solana Compass](https://solanacompass.com/news/jupiters-earn-on-recurring-puts-idle-usdc-in-dca-orders-to-work)
- **Avici (Solana):** a self-custodial smart wallet with passkeys and no seed phrase, a Visa card, and EUR IBAN and USD ACH accounts that auto-convert to USDC. No yield feature was found. This is aggregator data. — [MadeOnSol: Avici](https://madeonsol.com/compare/avici-vs-nexo)
- **Phantom.**
  - The Phantom Cash Visa debit card (Lead Bank) launched September 2025 and was extended to all users in spring 2026.
  - The CASH stablecoin is issued via Bridge Open Issuance, and Bridge virtual accounts auto-convert into CASH.
  - No yield on CASH was found.
  - Source: [Stripe customer story: Phantom](https://stripe.com/gb/customers/phantom-spotlight)
- **Sling Money:** a self-custodial wallet; USDP yield is described only as a possible future feature. — [The Block: Sling Series A](https://www.theblock.co/post/311223/sling-money-a-stablecoin-based-global-payment-app-raises-15-million-in-series-a)
- **Infini (cautionary case).**
  - In February 2025, about $49.5M was drained from its earn vault, held in the Morpho MEVCapital Usual USDC vault, via retained admin privileges on the contract. It was "not a private key leak".
  - Sources: [The Block](https://www.theblock.co/post/342911/stablecoin-neobank-infini-exploited-for-49-million-security-analysts); [Rekt](https://rekt.news/infini-rekt)
- **Squads Altitude (businesses, Solana):** self-custodial, with yield on balances; launched December 2025. — [Squads blog](https://squads.xyz/blog/introducing-altitude-and-a-strategic-investment-from-haun-ventures)

### Inferences

- **Two self-custodial patterns exist:**
  - **Pattern A** (Base App): an off-chain reward on unmoved USDC. It is simplest, but depends on an issuer or exchange revenue share and on regulation.
  - **Pattern B** (Plasma One, Jupiter Recurring): the balance lives in a vault or share token, and spends withdraw just in time.
- **Mercury maps naturally to Pattern B on Solana.** It also uses Privy, and Privy's Earn product already offers Kamino or Morpho vaults plus an app fee share, which gives Mercury a revenue line.
- **Lessons from Gnosis Pay and Infini:**
  - Safety modules that delay non-card spends conflict with DeFi positions in the same account.
  - Vault admin and upgrade keys are the main loss vector in "earn" products.
  - Mercury should prefer immutable or timelocked, widely used vaults (Kamino main market, Jupiter Lend), or curated vaults with timelocked curators, over bespoke strategy vaults.
- **How the yield is labelled tracks custody:**
  - Custodial or regulated providers (Robinhood, Wealthfront) quote APY from program banks.
  - Crypto custodians label it "rewards" (Coinbase, PayPal).
  - On-chain apps show a variable vault APY and name the underlying protocol (Plasma One with Veda/Aave, KAST with Gauntlet).

### Gaps

- No primary docs from ether.fi, KAST or Avici on the spend-from-vault mechanics (atomic or batched, synchronous or not).
- Whether Plasma One card authorisations withdraw from the Veda vault synchronously, or whether a buffer is pre-funded, is not documented.
- The Gnosis Pay exploit date and size were not captured.
- The current Coinbase USDC rewards status (July 2026) is unconfirmed.
- Not found: Phantom or Backpack self-custodial wallet "earn" features for USDC in 2026, and Infini's post-hack earn status.

## 5. Default vs opt-in: disclosure and consent patterns, and regulatory guidance relevant to auto-sweeping retail cash into yield (brokerage sweep rules, GENIUS Act, CLARITY Act, SEC/FinCEN positions)

### Takeaway

Regulated brokerage sweeps require disclosure, notice of product changes, and affirmative written consent. The SEC has recently penalised sweep programs that offered a single low-rate option.

For stablecoins:

- **GENIUS Act (July 2025)** bars issuers from paying holders yield. It does not expressly bar third-party "rewards".
- **CLARITY Act compromise (May 2026, Section 404)** would bar yield on passive balances that is "economically or functionally equivalent" to deposit interest, while allowing activity-based rewards. As of late July 2026 the bill had cleared Senate Banking but stalled; the final status after that is unknown.

Mercury's safest consumer pattern is explicit opt-in, or opt-out with affirmative consent at onboarding, with protocol-named, variable-rate disclosure. Calling DeFi lending yield "rewards" or "interest" on cash is risky.

### Cited Findings

- **Brokerage sweep rule.**
  - SEC Rule 15c3-3(j)(2)(ii) requires disclosure, notice and affirmative consent for sweeps into money funds or bank deposits.
  - A broker can change sweep products only if the customer gave "prior written affirmative consent" after being told the products may change.
  - Sources: [Morgan Lewis 2014](https://www.morganlewis.com/pubs/im_lf_secissuesrelieffinancialresponsibilityrulereqs_28feb14); [FindKnowDo](https://www.findknowdo.com/node/138106)
  - 2014 SEC staff relief allowed documented verbal consent, with written consent within 90 days. The relief was extended to September 30, 2015. — [Morgan Lewis FAQ 2014](https://morganlewis.com/pubs/2014/03/fs_lf_secissuesfaqsonfinancialresponsibilityrules_12march14); [FindKnowDo](https://www.findknowdo.com/node/139015)
- **FINRA (2026).** Guidance on negative consent for bulk account transfers says receiving firms may reinvest free credit balances into sweeps if Rule 15c3-3(j) is met, with at least 30 days' notice absent exigent circumstances. — [Mondaq: FINRA negative consent guidance](https://www.mondaq.com/unitedstates/financial-services/1748266/finra-provides-guidance-on-the-use-of-negative-consent-for-bulk-transfers-of-customer-accounts-and-discontinues-related-prior-review-process)
- **SEC enforcement.**
  - On January 17, 2025, the SEC settled with Wells Fargo Clearing ($28M), Wells Fargo Advisors Financial Network ($7M) and Merrill ($25M), $60M in total, over advisory cash sweeps. The firms had "only offered one option" and lacked reasonable policies. — [SEC press release 2025-16](https://www.sec.gov/newsroom/press-releases/2025-16)
  - The SEC later dropped a Morgan Stanley cash sweep case (headline only). — [Compliance Week](https://complianceweek.com/regulatory-enforcement/sec-drops-morgan-stanley-cash-sweep-case-sign-of-the-times/35999.article)
- **GENIUS Act (P.L. 119-27, July 2025), Section 4.**
  - Text: "[n]o permitted payment stablecoin issuer ... shall pay the holder of any payment stablecoin any form of interest or yield ... solely in connection with the holding, use, or retention".
  - "Holder" is undefined, and the Act does not explicitly stop exchanges paying rewards.
  - In a two-party model (issuer to retail), the ban "presumably" applies even when customers self-custody.
  - Source: [CRS IF13174, March 6, 2026](https://www.everycrsreport.com/reports/IF13174.html)
- **Coinbase's position:** "we are not the issuer" and "we pay rewards". The ABA Community Bankers Council argues "the exception swallows the rule". — [CRS via LegiStorm](https://www.legistorm.com/reports/view/crs/608234/The_Stablecoin_Yield_Debate.html)
- **CLARITY Act, chronology:**
  - January 2026: a Senate Banking draft would have banned exchange yield on holdings. Coinbase withdrew support on January 14, and the markup was postponed. — [CRS IF13174](https://www.everycrsreport.com/reports/IF13174.html)
  - May 1, 2026: the Tillis–Alsobrooks compromise, Section 404, bars paying yield "on stablecoin balances alone" or in any way "economically or functionally equivalent to the payment of interest or yield on an interest-bearing bank deposit". It preserves "bona fide" activity-based rewards and directs regulators to build a disclosure regime and define permissible rewards. — [Baker McKenzie](https://blockchain.bakermckenzie.com/2026/05/05/the-clarity-acts-yield-compromise-what-the-senate-actually-agreed-to-and-why-it-matters/); [The Block](https://theblock.co/post/399780/coinbase-says-deal-reached-on-clarity-act-stablecoin-yield-clearing-path-to-long-stalled-senate-markup); [Elliptic](https://www.elliptic.co/blog/crypto-regulatory-affairs-clarity-act-senate-compromise-meets-mixed-reception)
  - An earlier draft was described as banning rewards on passive stablecoin balances. — [The Defiant](https://thedefiant.io/news/regulation/latest-clarity-act-draft-bans-rewards-on-passive-stablecoin-balances)
  - May 2026: the bill cleared Senate Banking 15-9.
  - July 30, 2026: Senators Curtis and Cornyn objected on yield and deposit flight. The bill had stalled ahead of the August recess.
  - Sources: [Solana Compass](https://solanacompass.com/news/two-senate-republicans-flag-stablecoin-yield-risk-eight-days-before-clarity-act-august-recess-deadline); [Crypto Briefing](https://cryptobriefing.com/clarity-act-stalls-stablecoin-yield-concerns/)
- **FinCEN 2019 CVC guidance.**
  - Money-transmitter status for wallet providers turns on whether the provider has "total independent control" over the value.
  - An unhosted multisig provider is not a money transmitter if the user initiates with partial credentials and the co-signer "cannot unilaterally access or move" funds.
  - Sources: [Covington summary](https://www.cov.com/-/media/files/corporate/publications/2019/10/fincen_issues_guidance_to_synthesize_regulatory_framework_for_virtual_currency.pdf); [S. Horowitz: MPC wallets](https://s-horowitz.com/multi-party-computation-mpc-wallets-and-the-evolving-regulatory-landscape-in-the-united-states/); [Coin Center](https://coincenter.org/fincens-new-cryptocurrency-guidance-matches-coin-center-recommendations/)
- **Consent and disclosure as practised by products:**
  - Privy Earn docs: users "should explicitly direct the deposit action". — [Privy Earn](https://docs.privy.io/wallets/actions/earn/overview)
  - PayPal: the rate is at its "sole discretion" and "not guaranteed". — [PayPal newsroom](https://newsroom.paypal-corp.com/2025-04-23-Buy-Hold-Earn-Rewards-PayPal-Unlocks-Rewards-for-Holding-PayPal-USD)
  - Wealthfront: "not a deposit account", the APY comes from program banks, and FDIC coverage is "subject to... conditions". — [Wealthfront](https://cash.wealthfront.com/)
  - Robinhood: interest is paid net of Robinhood's fees, and the APY can change at the banks' discretion. — [Robinhood](https://robinhood.com/us/en/support/articles/high-yield-cash-program/)
  - Jupiter Recurring: "fully automatic once enabled". — [Solana Compass](https://solanacompass.com/news/jupiters-earn-on-recurring-puts-idle-usdc-in-dca-orders-to-work)

### Inferences

- **The regulatory question differs by design:**
  - If Mercury deposits user USDC into a third-party lending protocol from the user's own wallet, there is no "issuer paying yield" (GENIUS), and the yield is not a "reward on balances alone" paid by Mercury. The CLARITY Section 404 framing is therefore less directly on point than for an off-chain rewards program.
  - The open questions are securities/investment-adviser characterisation of an auto-allocated DeFi strategy, and state money-transmission analysis of any delegated signer.
- **Defaults:**
  - Making yield the default without affirmative consent would diverge from the brokerage-sweep norm of disclosure plus affirmative consent, and from Privy's own guidance.
  - A defensible "near-default" is a pre-checked onboarding step with a plain-language disclosure: protocol name, variable rate, smart-contract and liquidity risk, not FDIC/SIPC, revocable at any time. Pair it with a one-tap off switch, and get the user's single signature to add the scoped deposit signer.
- **Delegated signer scope:** a signer limited to "deposit or withdraw between the user's own USDC ATA and the user's own position in protocol X" supports the "no total independent control" position. A signer able to send USDC to arbitrary destinations would not. Legal review is needed.
- **Avoid deposit-like language.** Do not call the yield "interest" or the account a "savings account" or "cash account". Bank-deposit equivalence is the core concern in the CLARITY debate.

### Gaps

- CLARITY Act status from August to October 2026 (floor vote, enactment) is unknown, and no Treasury or OCC GENIUS implementing rules on "holder" or yield were found.
- No SEC or FINRA guidance specific to auto-sweeping into DeFi lending or tokenized money market funds was found.
- The current eCFR text of Rule 15c3-3(j) and the status of the post-2015 consent relief were not verified.
- The primary text of the FinCEN 2019 guidance was not fetched; secondary summaries were used.
- No state-level (e.g., NYDFS) or EU MiCA guidance on yield-bearing e-money tokens was researched; MiCA bars interest on EMTs per general knowledge, but this was not sourced here.
