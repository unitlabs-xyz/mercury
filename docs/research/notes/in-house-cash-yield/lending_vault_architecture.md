# Lending Market and Yield Vault Architecture: Cross-Chain Design References for a Solana USDC Pool + Vault (as of 2026-10-21)

Scope note: EVM protocols are design references. Solana-specific evidence includes source code from the klend, kvault and marginfi-v2 repos (pulled 2026-10-21), live Kamino API data, and on-chain reads from Solana mainnet RPC on 2026-10-21. The version and date for each design are given inline.

## 1. Morpho Blue (Markets V1) and Morpho Vaults V1/V1.1/V2: roles, timelocks, queues and caps, and why the core is split from the vault layer

### Takeaway

Morpho keeps the lending core tiny. Each market is isolated, has fixed parameters (loan token, collateral token, oracle, IRM, LLTV), and is governance-minimised. All curation, meaning allocation, caps, fees, timelocks and emergency roles, lives in a separate ERC-4626 vault layer. Vaults V2 (live since late September 2025) generalises this with adapters, ID-based absolute and relative caps, a Sentinel role, timelocks of up to 3 weeks, and in-kind exit through `forceDeallocate`. For Mercury, this maps cleanly onto "one immutable-ish USDC market program + one curated vault program."

### Cited Findings

**Morpho Blue core (Markets V1, repo created 2023-06)**

- Blue is described as "a simple, immutable, and governance-minimized base layer that allows for a wide variety of other layers to be built on top". It offers "permissionless market creation with oracle agnostic pricing", a singleton implementation, callbacks and free flash loans. — [morpho-blue README](https://github.com/morpho-org/morpho-blue)
- Market identity is the tuple (loanToken, collateralToken, oracle, irm, lltv). The canonical "idle" market sets collateral, oracle and IRM to `address(0)` and LLTV to 0 so funds cannot be borrowed. — [MetaMorpho v1.1 README](https://github.com/morpho-org/metamorpho-v1.1)
- Health Factor = collateral value in loan token × LLTV / borrowed. A position is liquidatable below 1.0. Liquidation incentive factor LIF = min(1.15, 1/(0.3·LLTV + 0.7)), which is about 5% at 86% LLTV. The whole bonus goes to the liquidator with no protocol fee. There is no close factor: a liquidator can repay up to 100% of debt. Liquidations are first-come-first-served at the oracle price, with no auction. — [Morpho liquidation docs](https://docs.morpho.org/learn/concepts/liquidation/)
- The IRM is chosen at market creation from a governance-approved set, and the only approved IRM is AdaptiveCurveIRM. Governance sets a per-market fee (WAD-scaled), and suppliers receive interest minus that fee. — [Morpho IRM docs](https://docs.morpho.org/learn/concepts/irm/)
- Rationale for the high utilisation target: "Morpho doesn't rehypothecate collateral, so liquidation needs don't constrain liquidity." This allows a 90% target utilisation. — [Morpho IRM docs](https://docs.morpho.org/learn/concepts/irm/)
- License: `src/Morpho.sol` is GPL-2.0-or-later and all other files are MIT. The previous license was BUSL-1.1. — [morpho-blue README](https://github.com/morpho-org/morpho-blue)

**MetaMorpho / Vaults V1.1 (legacy)**

- One vault maps to one loan asset and can enable at most 30 markets. Each market has a supply cap, which defaults to 0. There are four roles: owner, curator, guardian and allocator. The performance fee is capped at 50%. — [MetaMorpho v1.1 README](https://github.com/morpho-org/metamorpho-v1.1)
- Actions "that may be against users' interests" are timelocked. The initial timelock is 0 or 24h–2w, and later changes must stay within 24h–2w. The owner or guardian can revoke during the timelock, and anyone can execute once it has passed. — [MetaMorpho v1.1 README](https://github.com/morpho-org/metamorpho-v1.1)
- Allocators set `supplyQueue`, which deposits fill in order up to each market's cap, and `withdrawQueue`, which withdrawals drain in order up to each market's liquidity. They can also reallocate instantly. An empty supplyQueue disables deposits. The curator can raise caps (timelocked), lower caps instantly, and submit a forced market removal (timelocked) for a market that keeps reverting. — [MetaMorpho v1.1 README](https://github.com/morpho-org/metamorpho-v1.1)
- V1.1 differs from V1.0 in that it "does not realize the bad debt", allows a timelock of zero at deployment, has mutable name and symbol, and makes `reallocate` revert for markets that are not enabled. — [MetaMorpho v1.1 README](https://github.com/morpho-org/metamorpho-v1.1)
- Bad-debt handling differs by version. V1.0 realises bad debt and shares it pro rata. V1.1 leaves it unrealised until it is paid down manually. V2 socialises losses through share-price depreciation detected via `realAssets()`. — [Morpho liquidation docs](https://docs.morpho.org/learn/concepts/liquidation/)

**Vaults V2 (launched late Sept 2025)**

- Launch: Morpho's blog says Vaults V2 "launches today". A news report dated 2025-09-30 covers the launch. At launch, V2 allocated only to Morpho V1 markets and vaults. — [Morpho blog](https://morpho.org/blog/morpho-vaults-v2-a-new-standard-for-asset-curation); [mpost](https://mpost.io/morpho-introduces-vaults-v2-setting-new-standard-in-asset-curation/)
- "All the contracts are immutable." Vaults allocate through adapter contracts, which hold positions and report value (interest and losses). An adapter registry limits which adapters can be added, and abdicating the registry fixes the set forever. — [vault-v2 README](https://github.com/morpho-org/vault-v2)
- Roles:
  - **Owner** sets the curator and sentinels.
  - **Curator** sets adapters, caps, gates, allocators, timelocks and fees. Everything is timelockable except cap decreases.
  - **Allocators** allocate within caps and set the liquidity adapter and `maxRate`.
  - **Sentinels** can revoke pending actions, deallocate to idle, and lower caps.
  - Source: [vault-v2 README](https://github.com/morpho-org/vault-v2)
- Timelocks are configurable from 0 to 3 weeks. Timelocks start at zero at deployment and should be raised after setup. Pending actions are visible through `executableAt`. — [Morpho Vault V2 docs](https://docs.morpho.org/learn/concepts/vault-v2); [Morpho V2 roles summary](https://www.mintlify.com/morpho-org/vault-v2/concepts/roles)
- ID-based caps: an "id is an abstract identifier for a common risk factor" such as a collateral, an oracle or a protocol. Allocations sharing an ID are limited by absolute caps and by relative caps (a percentage of total assets). Relative caps are not checked on withdrawals. — [vault-v2 README](https://github.com/morpho-org/vault-v2); [Morpho Vault V2 docs](https://docs.morpho.org/learn/concepts/vault-v2)
- Liquidity: withdrawals use idle assets first, then the designated `liquidityAdapter`, which also receives new deposits. Permissionless `forceDeallocate` enables in-kind redemption: flash-loan liquidity, supply it to the adapter's market, force-deallocate, then repay. Each adapter can set a penalty of up to 2%. — [vault-v2 README](https://github.com/morpho-org/vault-v2)
- Emergency playbook: the Sentinel or Curator sets all caps to zero immediately, since cap decreases are exempt from timelock. This neutralises a compromised allocator even if removing its role is timelocked. — [Morpho V2 emergency tutorial](https://docs.morpho.org/curate/tutorials-v2/emergency)
- Gates (receive/send shares, receive/send assets) allow KYC or whitelisting. They are timelocked, can be abdicated, and "can weaken noncustodial guarantees". — [Morpho Vault V2 docs](https://docs.morpho.org/learn/concepts/vault-v2)
- The performance fee is capped at 50% and the management fee at 5% per year. `maxRate` caps share-price growth to smooth yield or build a loss buffer. — [vault-v2 README](https://github.com/morpho-org/vault-v2)
- ERC-4626 caveat: V2's `maxDeposit`, `maxMint`, `maxWithdraw` and `maxRedeem` "always return zero". This is non-conventional. — [vault-v2 README](https://github.com/morpho-org/vault-v2)
- License: GPL-2.0 (GitHub SPDX metadata) for vault-v2, metamorpho and metamorpho-v1.1. — [GitHub vault-v2](https://github.com/morpho-org/vault-v2)

### Inferences

- The split works because the two layers have different trust profiles. The market layer holds collateral and must be correct forever, so it should be minimal, immutable and heavily audited. The vault layer holds lender cash and needs discretion (caps, allocation) that changes often. Putting discretion behind timelocks, with "risk-reducing actions are instant", gives depositors an exit window without blocking emergency de-risking.
- For Mercury, a direct analogue is a minimal Solana market program (USDC loan asset, N xStock collaterals, each with its own oracle config and LLTV, ideally one isolated market per collateral) plus a thin vault program. The vault would hold user USDC and allocate between the in-house market and external liquid venues (Kamino or Jupiter Lend USDC) acting as the "liquidity adapter."
- Morpho's LIF formula gives larger bonuses at low LLTV. By my calculation: about 12.7% at LLTV 62.5%, about 7.4% at 77%, and the 15% cap at LLTV ≤ about 56.5%. That is a reasonable starting shape for volatile, thin-liquidity collateral such as single-name xStocks.

### Gaps

- Exact Morpho governance-approved LLTV list and the Morpho Markets V2 launch status were not verified in this session.
- No Solana deployment of Morpho was found. This was not searched exhaustively.

## 2. How Aave v3/v4, Compound III, Euler v2, Fluid/Jupiter Lend, Kamino klend/kVaults, marginfi, Save/Solend and Drift isolate risk between assets

### Takeaway

Risk isolation sits on a spectrum:

- **Pooled cross-margin with flags:** Aave v3 isolation mode, siloed borrowing and eMode; Kamino elevation groups; marginfi risk tiers.
- **Single-borrowable-asset markets** where collateral is never lent out: Compound III, and Fluid/Jupiter Lend vaults.
- **Fully isolated markets:** Morpho Blue, and Euler EVK vaults wired by the EVC. Kamino also isolates at the "lending market" level, and its xStocks market is its own lending market.
- **Shared liquidity with per-module caps:** Aave v4 hub-and-spoke and Fluid's liquidity layer.

For a small team with one borrowable asset (USDC), the Compound III / isolated-market pattern minimises attack surface.

### Cited Findings

**Aave v3 / v4**

- v3 isolation mode: an isolated collateral cannot be combined with other collaterals, and borrowing against it is limited to governance-approved stablecoins up to a USD debt ceiling. Siloed borrowing: a user who borrows a siloed asset cannot borrow any other asset. eMode raises borrowing power for price-correlated assets. Per-asset supply and borrow caps also apply. — [Aave v3 overview](https://aave.com/docs/aave-v3/overview); [aave/docs-v3](https://github.com/aave/docs-v3)
- v4 launched on Ethereum mainnet on 2026-03-30 with a hub-and-spoke design. — [The Block](https://www.theblock.co/post/395617/aave-v4-launches-ethereum-mainnet)
- The v4 launch configuration has 3 Hubs (Core, Prime, Plus) and 10 Spokes. Prime is a non-borrowable environment for blue-chip collateral. LlamaRisk calls the launch parameters deliberate guardrails. — [Aave governance ARFC / LlamaRisk](https://governance.aave.com/t/arfc-aave-v4-activation-on-ethereum-mainnet/24293/4)
- The v4 Hub is immutable. It holds the liquidity registry, per-Spoke add/draw caps, per-asset IRM, liquidity fee, deficit accounting and an optional reinvestment controller. It enforces invariants, including that the supply share price and drawn index never decrease. Spokes are upgradeable. They hold user positions, spoke-specific oracles and liquidation parameters, and can be "crypto-based, RWA-based, DEX-LPs-based". — [Aave v4 overview.md](https://github.com/aave/aave-v4/blob/main/docs/overview.md)
- v4 Risk Premium: the base drawn rate is set by Hub utilisation. A premium is added according to the user's collateral mix, with each asset assigned a Collateral Risk value from 0 to 1000_00 bps. — [Aave v4 overview.md](https://github.com/aave/aave-v4/blob/main/docs/overview.md)
- v4 Dynamic Risk Configuration: changing CF, max liquidation bonus or liquidation fee creates a new config key. Existing positions keep their old key until a risk-increasing action, which addresses v3's problem that lowering a liquidation threshold "immediately affects every open position". — [Aave v4 overview.md](https://github.com/aave/aave-v4/blob/main/docs/overview.md)
- v4 Reinvestment Module: idle Hub liquidity can be swept to external strategies. This is "interest rate neutral" because swept funds stay in the utilisation denominator. Users opt in per Hub asset, and the Governor absorbs strategy losses. — [Aave v4 overview.md](https://github.com/aave/aave-v4/blob/main/docs/overview.md)

**Compound III (Comet)**

- There is one base (borrowable) asset per deployment. Collateral is seized and resold for the base asset, and the base asset funds reserves and payouts. — [Compound III liquidation docs](https://docs.compound.xyz/liquidation/)
- Borrow collateral factors are lower than liquidation collateral factors, so new positions have a buffer. Governance can cut borrow CFs without liquidating anyone. — [Compound III liquidation docs](https://docs.compound.xyz/liquidation/)

**Euler v2 (EVK + EVC)**

- Each EVK vault is an ERC-4626 "credit vault". The liability vault decides which other vaults are acceptable collateral and at what LTVs. The EVC tracks each account's collaterals, gives each address 256 sub-accounts, and allows only one liability per account at a time. — [EVK whitepaper](https://github.com/euler-xyz/euler-vault-kit/blob/master/docs/whitepaper.md)
- Governance risk is a 2×2 choice: upgradeable (beacon proxy) or immutable (minimal proxy), crossed with governed or finalised (governor set to `address(0)`). A limited governor contract can restrict which methods may be called. — [EVK whitepaper](https://github.com/euler-xyz/euler-vault-kit/blob/master/docs/whitepaper.md)
- Untrusted collateral warning: "A badly coded or malicious vault could refuse to release funds in a liquidation event". Assets without an LTV can never be seized. Hooks on collateral vaults can block liquidations. — [EVK whitepaper](https://github.com/euler-xyz/euler-vault-kit/blob/master/docs/whitepaper.md)

**Fluid / Jupiter Lend (Solana, public beta 2025-08-27)**

- Jupiter Lend runs on Fluid's Liquidity Layer and uses three programs: Liquidity, Lending (Earn) and Vaults (Borrow). "Lending and Vaults do not hold tokens directly. They CPI into Liquidity." — [Jupiter Lend architecture](https://developers.jup.ag/docs/lend/architecture)
- Each vault has exactly one supply (collateral) token and one borrow token, and holds a `UserSupplyPosition` and a `UserBorrowPosition` on Liquidity. Debt and collateral ceilings "adjust in real time based on utilisation". — [Jupiter Lend architecture](https://developers.jup.ag/docs/lend/architecture); [Jupiter Lend liquidity](https://developers.jup.ag/docs/lend/liquidity)
- Mainnet programs (IDL v0.1.8–0.1.9) include separate `oracle`, `dex` and `flashloan` programs. A separate `ethena` market is a separate deployment with its own program IDs. — [jup-ag/jupiter-lend README](https://github.com/jup-ag/jupiter-lend)
- Public beta launched on 2025-08-27 with more than 40 vaults. — [PANews via MEXC](https://www.mexc.com/news/76058); [The Block](https://www.theblock.co/post/355466/liquidity-begets-liquidity-solana-dex-aggregator-jupiter-unveils-a-new-lending-protocol)

**Kamino klend + kVaults (source as of 2026-10-19 push)**

- klend reserve configuration includes:
  - `loan_to_value_pct` and `liquidation_threshold_pct`
  - min, max and bad-debt liquidation bonuses
  - `borrow_factor_pct`, `deposit_limit` and `borrow_limit`
  - deposit and debt withdrawal caps
  - up to 20 elevation-group memberships, plus a flag to disable collateral use outside eMode
  - `utilization_limit_block_borrowing_above_pct`
  - `emergency_mode`
  - `protocol_take_rate_pct` and `protocol_liquidation_fee_pct`
  - Source: [klend source (state/reserve.rs)](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/state/reserve.rs)
- klend constants: `MAX_NUM_ELEVATION_GROUPS = 32` and `MAX_OBLIGATION_RESERVES = 20`. — [klend utils/consts.rs](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/utils/consts.rs)
- Isolation is at the lending-market level. Kamino's API lists a separate "xStocks Market" (`5wJeMrUY…`) and a curated "Sentora xStocks Market" (`8BNUWRSi…`). — [Kamino API market list](https://api.kamino.finance/v2/kamino-market)
- kVault: admins define target allocations across reserves of the same asset on klend, and users receive vault shares. — [kvault README](https://github.com/Kamino-Finance/kvault)

**marginfi v2 / Project 0**

- Structure: a Group is a set of Banks with one admin (typically a governance multisig) and delegate admins. Each Bank is one asset with its own settings and oracle, and many Banks may exist per asset. An Account has up to 16 positions. — [marginfi-v2 README](https://github.com/mrgnlabs/marginfi-v2)
- Assets and liabilities each carry an Initial and a Maintenance weight. Banks in the "Isolated" risk tier have zero asset weight (they are worthless as collateral), and an account can borrow only one Isolated asset at a time. — [marginfi-v2 README](https://github.com/mrgnlabs/marginfi-v2)
- marginfi can list Kamino reserves as collateral Banks, so lenders there earn the Kamino rate. — [marginfi-v2 README](https://github.com/mrgnlabs/marginfi-v2)

**Save (formerly Solend)**

- Solend rebranded to Save in 2024 and offers isolated lending pools. — [Decrypt](https://decrypt.co/241709/solend-save-rebrand-susd-savesol-dumpy-fun)
- Third-party 2026 guides still list Save among the four major Solana lenders. — [MadeOnSol](https://madeonsol.com/blog/best-solana-lending-protocols)
- The 2022 episode in which the team took control of a whale position is still cited as a trust issue. — [MadeOnSol](https://madeonsol.com/blog/best-solana-lending-protocols)

**Drift (spot and perps), now Velocity**

- On 2026-04-01 an attacker with admin control created a malicious CVT collateral market, pointed it at an attacker-controlled oracle, and relaxed withdrawal limits and circuit breakers. About $285M was drained in 31 withdrawals over roughly 12 minutes. — [BlockSec](https://blocksec.com/blog/drift-protocol-incident-multisig-governance-compromise-via-durable-nonce-exploitation)
- Drift was rebuilt as "Velocity", announced 2026-07-01. The protocol-v2 GitHub repo is archived. — [Solana Compass](https://solanacompass.com/news/drift-co-founder-cindy-leow-steps-down-hands-rebuilt-velocity-exchange-to-new-team); [GitHub drift-labs/protocol-v2](https://github.com/drift-labs/protocol-v2)

### Inferences

- **Don't run a cross-margined pool.** In shared pools (Aave v3, Kamino main market, marginfi groups), a mispriced or new collateral can drain every borrowable asset. Drift's CVT drain is the canonical example: one new market plus one oracle change, and the whole pool was drained. Mercury has one loan asset (USDC) and a few xStock collaterals, so it should use isolated markets. Either one Morpho-style market per collateral, or a Compound-style single-base market with per-collateral caps. Collateral should not be borrowable, which avoids xStock shorting, rehypothecation and the need for an IRM on xStocks.
- **Kamino's xStocks market is a counter-example to copy selectively.** It lets USDC be used as collateral to borrow xStocks, which enables shorts. That adds xStock borrow-side risk and IRMs Mercury does not need (see the reserve list in Q6).
- **Treat the vault-to-external-venue link as a capped adapter.** Aave v4's Hub/Spoke and Fluid's liquidity layer show that a shared-liquidity layer works when every consumer module has hard add/draw caps. Mercury's vault allocating to its own market plus external venues is the same pattern at small scale.

### Gaps

- Aave v4's exact launch caps and spoke list were not fetched beyond the LlamaRisk summary.
- Save's current technical architecture (any v2 rewrite) and 2026 TVL were not verified.
- Fluid "smart collateral / smart debt" mechanics were not verified from primary docs. Instadapp's blog only confirms they are the two DEX v1 designs being ported to DEX v2 ([Instadapp blog](https://blog.instadapp.io/fluid-dex-v2/)). My understanding is that collateral and/or debt double as DEX liquidity earning swap fees, but this is unverified.

## 3. Share accounting: ERC-4626 and its pitfalls, Solana equivalents, and interest index accrual

### Takeaway

ERC-4626's main pitfalls are first-depositor inflation/donation attacks, rounding direction, and reading balances that anyone can donate to. The standard defences are virtual shares and assets (an offset), internal balance tracking, seed deposits at initialisation, and always rounding in the vault's favour. Solana has no ratified vault standard; each protocol mints its own SPL share token from a PDA (cTokens on klend/Solend, jlTokens on Jupiter Lend, kVault share mint). klend already ships a seed-deposit-at-init defence, and kvault tracks `token_available` internally. Interest accrues lazily through cumulative indexes or exchange prices updated on every touch.

### Cited Findings

- EIP-4626 requires opposing rounding directions that favour the vault over users. — [EIP-4626](https://eips.ethereum.org/EIPS/eip-4626)
- OpenZeppelin's decimals offset sets a ratio of virtual shares to virtual assets. With the default offset of 0 the attack is unprofitable but still possible. A larger offset makes the attack "orders of magnitude more expensive" than its profit, but changes vault decimals, and PR #3979 warned that 1 wei might become unrecoverable. — [OpenZeppelin blog](https://www.openzeppelin.com/news/a-novel-defense-against-erc4626-inflation-attacks); [OZ PR #3979](https://github.com/OpenZeppelin/openzeppelin-contracts/pull/3979)
- A disclosed report found that a vault using the default offset of 0 still let a griefing variant cost victims 9–25% of deposits. Zellic recommends deploying atomically with an initial deposit. — [HackenProof OpenEden report](https://hackenproof.com/reports/OPENEDCA-112); [Zellic](https://reports.zellic.io/publications/solera/sections/regarding-inflation-attacks-inflation-attacks)
- EVK uses exchangeRate = (cash + totalBorrows + VIRTUAL_DEPOSIT) / (totalShares + VIRTUAL_DEPOSIT). It uses internal balance tracking rather than `balanceOf`, so direct transfers cannot manipulate the rate, and stray tokens are recovered via `skim()`. — [EVK whitepaper](https://github.com/euler-xyz/euler-vault-kit/blob/master/docs/whitepaper.md)
- EVK rounding rules: debts round up; assets per redeemed share round down; shares per withdrawal round up; a zero-rounded operation is a no-op. — [EVK whitepaper](https://github.com/euler-xyz/euler-vault-kit/blob/master/docs/whitepaper.md)
- EVK does not support rebasing tokens because of internal tracking. — [EVK whitepaper](https://github.com/euler-xyz/euler-vault-kit/blob/master/docs/whitepaper.md)
- Solana has no canonical standard. Solana's own guide says ERC-4626 is implemented "with custom programs". — [Solana ERC4626 guide](https://solana.com/developers/evm-to-svm/erc4626)
- Exo says the Solana Foundation asked it to explore a canonical vault standard compatible with sRFC 37 (Token ACL). No published spec was found. — [Exo](https://exo.beehiiv.com/p/solana-needs-something-like-erc4626-vaults)
- klend has a `seed_deposit_on_init_reserve` instruction. It requires that no initial deposit has happened yet, then deposits `market.min_initial_deposit_amount` and sets the reserve's available liquidity and collateral-mint supply to that amount. This is a dead-shares-style defence. — [klend handler](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/handlers/handler_seed_deposit_on_init_reserve.rs)
- klend cTokens use `COLLATERAL_MINT_DECIMALS = 6` and an initial exchange rate of 1. — [klend consts.rs](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/utils/consts.rs)
- `VaultState` in kvault has:
  - accounting: `shares_mint` (PDA seed "shares"), `shares_issued`, `token_available`, `prev_aum_sf`, `pending_fees_sf`
  - fees: `performance_fee_bps` and `management_fee_bps` (capped at `MAX_MGMT_FEE_BPS = 1000`, i.e. 10%)
  - limits and roles: `deposit_cap`, `min_deposit_amount`, `allocation_admin` and a `permissioning_authority`
  - The vault code tracks and covers `rounding_loss` explicitly.
  - Source: [kvault vault_state.rs](https://github.com/Kamino-Finance/kvault/blob/master/programs/kvault/src/state/vault_state.rs); [kvault consts](https://github.com/Kamino-Finance/kvault/blob/master/programs/kvault/src/utils/consts.rs)
- Jupiter Lend Earn mints jlTokens, which are shares that "accrue interest and rewards". Exchange prices update in `operate`, "so interest accrues on every interaction". A separate rewards rate model bumps the jlToken exchange price. — [Jupiter Lend architecture](https://developers.jup.ag/docs/lend/architecture)
- marginfi computes interest "just before any balance change", compounding for all of a Bank's users at once. Busy Banks compound near-continuously and quiet ones less often. — [marginfi-v2 README](https://github.com/mrgnlabs/marginfi-v2)
- klend marks reserve and obligation state stale after one slot (`STALE_AFTER_SLOTS_ELAPSED = 1`), so refresh instructions must run in the same transaction. marginfi notes that Kamino banks need `refresh_reserve` "within 1 slot". — [klend last_update.rs](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/state/last_update.rs); [marginfi-v2 README](https://github.com/mrgnlabs/marginfi-v2)
- Morpho's IRM returns an interval-average rate from the market's last update to the current block. Borrow APY = e^(rate·secondsPerYear) − 1. — [Morpho IRM docs](https://docs.morpho.org/learn/concepts/irm/)

### Inferences

- **Account internally.** On Solana anyone can transfer SPL tokens into a vault's PDA-owned token account. Never derive `totalAssets` from the token account balance. Track it internally (kvault `token_available`, the EVK model) and seed the first deposit at init (klend). Add a virtual offset as well.
- **Expect Token-2022 nuances.** The vault's USDC side is classic SPL. Collateral xStocks are Token-2022 with ScaledUiAmount (see Q6), so the market program must use `token_interface` and handle the extension.
- **Prefer a share mint over a balance tracked in program state.** Recommended pattern: one SPL share mint per vault whose mint authority is a PDA; `totalAssets = idle + Σ adapter positions valued at their exchange rate`; floor shares on deposit and ceil shares on withdraw. Kamino and Jupiter both use a transferable share mint (cTokens, jlTokens). That makes Mercury vault shares composable, for example usable as collateral elsewhere later.

### Gaps

- Whether the Solana Foundation or Exo vault standard has been published or adopted by October 2026 was not found.
- kvault's exact first-deposit share math (virtual shares or not) was not confirmed from source.

## 4. Interest rate models, reserve factor and protocol fees, and keeping withdrawals liquid

### Takeaway

Most protocols use kinked utilisation curves. klend uses an 11-point piecewise curve. Morpho's AdaptiveCurveIRM targets 90% utilisation and shifts the whole curve over days, which is safe there because collateral is not rehypothecated. Fees are a cut of interest: Morpho's per-market fee, klend's `protocol_take_rate_pct`, Aave v4's Hub liquidity fee, marginfi's insurance and protocol fees. Withdrawal liquidity is defended in layers:

- utilisation caps on borrowing
- idle buffers or liquidity adapters
- rate-limited withdrawal limits (Fluid)
- withdrawal queues or tickets (klend)
- in-kind redemption (Morpho V2, kvault)

### Cited Findings

- **Morpho AdaptiveCurveIRM:**
  - Target utilisation is 90%.
  - The curve runs from 1/4× the target rate at 0% utilisation to 4× at 100% utilisation.
  - The target rate doubles in 10 days at 95% utilisation, halves in 10 days at 45%, and doubles in 5 days (the maximum speed) at 100%.
  - Source: [Morpho IRM docs](https://docs.morpho.org/learn/concepts/irm/)
- An academic critique notes that the adaptive model has a kink at target and that its "speed factor effectively resets with each interaction", so rates can swing. — [arXiv 2407.10426](https://arxiv.org/pdf/2407.10426)
- klend's `BorrowRateCurve` has `points: [CurvePoint; 11]`, a piecewise-linear curve. Reserves also have `utilization_limit_block_borrowing_above_pct` and `protocol_take_rate_pct`. — [klend borrow_rate_curve.rs](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/utils/borrow_rate_curve.rs); [klend reserve.rs](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/state/reserve.rs)
- klend has a withdrawal queue. Handlers `enqueue_to_withdraw`, `withdraw_queued_liquidity`, `cancel_withdraw_ticket` and `recover_invalid_ticket_collateral` exist. A `WithdrawTicket` records `sequence_number`, owner, reserve, destination, `queued_collateral_amount` and `created_at_timestamp`, and `MIN_WITHDRAW_QUEUED_LIQUIDITY_VALUE = 2`. — [klend handlers](https://github.com/Kamino-Finance/klend/tree/master/programs/klend/src/handlers); [klend withdraw_ticket.rs](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/state/withdraw_ticket.rs)
- klend also has fixed-term borrow features (`rollover_fixed_term_borrow`, borrow orders) and per-reserve deposit and debt withdrawal caps (`withdrawal_cap_operations.rs`). — [klend source tree](https://github.com/Kamino-Finance/klend/tree/master/programs/klend/src)
- **Fluid liquidity-layer withdrawal limits:**
  - Above a base limit, withdrawals expand over time.
  - Documented example: expand percent 20%, expand duration 200s, base limit 5.
  - Deposits can restore the limit instantly.
  - A governance post proposed moving from automated limits to static expansion limits of 20–25%.
  - Source: [Fluid contracts docs](https://git.instadapp.io/Instadapp/fluid-contracts-public/src/branch/main/docs/docs.md); [Instadapp governance](https://gov.instadapp.io/t/update-expansion-rates-on-liquidity-layer/706)
- Jupiter Lend's Liquidity layer stores a withdrawal limit on each `UserSupplyPosition` and a debt ceiling on each `UserBorrowPosition`. Ceilings adjust with utilisation. — [Jupiter Lend architecture](https://developers.jup.ag/docs/lend/architecture); [Jupiter Lend liquidity](https://developers.jup.ag/docs/lend/liquidity)
- Morpho V2 liquidity tools: idle first, then the liquidity adapter, then `forceDeallocate` (penalty up to 2%). MetaMorpho V1: idle market plus withdrawQueue. — [vault-v2 README](https://github.com/morpho-org/vault-v2); [MetaMorpho v1.1 README](https://github.com/morpho-org/metamorpho-v1.1)
- kvault equivalents: `unallocated_weight` and `unallocated_tokens_cap` (idle buffer), per-reserve `target_allocation_weight` and `token_allocation_cap`, `min_invest_delay_slots`, a `redeem_in_kind` handler, and `withdrawal_penalty_bps`. — [kvault vault_state.rs](https://github.com/Kamino-Finance/kvault/blob/master/programs/kvault/src/state/vault_state.rs); [kvault vault_allocation.rs](https://github.com/Kamino-Finance/kvault/blob/master/programs/kvault/src/state/vault_allocation.rs)
- **Aave v4:** the Hub IRM is per asset and uses an optimal usage ratio, a base rate and slopes. A per-asset liquidity fee is the protocol's share of interest. — [Aave v4 overview.md](https://github.com/aave/aave-v4/blob/main/docs/overview.md)
- marginfi banks typically use a 2-point curve (rate at 0% utilisation, one kink, rate at 100%). Borrowers pay insurance and protocol fees on top of the lender rate. — [marginfi-v2 README](https://github.com/mrgnlabs/marginfi-v2)
- **Live Kamino xStocks Market, USDC reserve (2026-10-21):**
  - supply about $5.71M, borrow about $5.20M, which by my calculation is about 91% utilisation
  - supply APY 5.09%, borrow APY 6.25%
  - Source: [Kamino API reserves/metrics](https://api.kamino.finance/kamino-market/5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua/reserves/metrics?env=mainnet-beta)

### Inferences

- Kamino's xStocks USDC reserve runs near its kink at about 91% utilisation. Mercury's own lenders would face the same trade-off: high utilisation means high yield but thin instant liquidity.
- For a consumer cash product where users expect instant withdrawal, Mercury needs several layers:
  1. a hard borrow utilisation cap (klend-style `utilization_limit_block_borrowing_above_pct`, for example 85–90%)
  2. a vault-level idle buffer and a liquidity adapter to a deep external USDC venue
  3. a steep curve above the kink so borrowers repay when liquidity is short
  4. a FIFO withdraw-ticket queue as a last resort, so the system degrades gracefully instead of reverting
- An AdaptiveCurve-style IRM reduces governance load, since there are no manual rate tweaks. A small team may still prefer a fixed kinked curve for predictability and easier user-facing APY disclosure.

### Gaps

- Kamino's actual curve points and fee rates for the xStocks USDC reserve were not decoded from chain.
- Jupiter Lend withdrawal-limit numbers were not found.

## 5. Liquidation design, who runs liquidators on Solana, and thin, market-hours-bound xStock collateral

### Takeaway

Designs range across:

- fixed bonus with a close factor (Aave v3, klend)
- LLTV-derived bonus with no close factor (Morpho)
- reverse Dutch auction or HF-scaled bonus (Euler, Aave v4, Kamino)
- protocol-absorbs-then-auctions (Compound III)
- batched tick liquidations with very low penalties (Fluid/Jupiter)
- continuous soft liquidation (crvUSD LLAMMA)
- grace-period auto-deleveraging (klend)

Bad debt is socialised to lenders by most (Euler optional, Morpho V2, klend `socialize_loss`), absorbed by reserves (Compound III), or by an insurance fund (marginfi). On Solana, liquidations are permissionless keeper bots that atomically flash-borrow and swap through DEX aggregators. That depends on on-chain xStock depth, which is unproven under stress and is closed-market-sensitive.

### Cited Findings

- **Aave v3:** default close factor 50%, rising to 100% when HF < 0.95 or the position is small, with a static bonus. — [Aave v4 overview.md](https://github.com/aave/aave-v4/blob/main/docs/overview.md)
- **Aave v4:**
  - Liquidators repay only enough to restore a spoke-wide `TargetHealthFactor`.
  - The bonus scales linearly from minLB = (maxLB − 100%)·liquidationBonusFactor + 100% at HF = 1 up to maxLB at `healthFactorForMaxBonus`.
  - A protocol `liquidationFee` takes a cut of the bonus.
  - If no collateral remains, a deficit is recorded, and a Spoke can later `eliminateDeficit`.
  - Source: [Aave v4 overview.md](https://github.com/aave/aave-v4/blob/main/docs/overview.md)
- **Compound III:**
  - Anyone calls `absorb`. The protocol takes over debt and collateral, paying the user collateral value minus `liquidationFactor` in base asset, funded by reserves.
  - Liquidators then `buyCollateral` at a discount = StoreFrontPriceFactor × (1 − LiquidationFactor), only while reserves are below `targetReserves`.
  - Source: [Compound III liquidation docs](https://docs.compound.xyz/liquidation/)
- **Euler EVK:**
  - Reverse Dutch auction: the discount scales with how deep the violation is, up to a vault-set maximum discount (default 0, so it must be set).
  - Separate borrow and liquidation LTVs.
  - LTV ramping lowers liquidation LTV linearly over a chosen duration.
  - An optional "cool-off period" blocks liquidation in the same block an account was last healthy, specifically against pull-oracle (Pyth/RedStone) price-selection attacks.
  - Bad-debt socialisation is optional (`CFG_DONT_SOCIALIZE_DEBT`).
  - Source: [EVK whitepaper](https://github.com/euler-xyz/euler-vault-kit/blob/master/docs/whitepaper.md)
- **Kamino klend:**
  - The bonus is max(min bonus, LTV − reserve LTV), capped by the max bonus and by solvency. It becomes `badDebtLiquidationBonusBps` (about 1%) near 99% LTV.
  - The close factor varies by market and becomes 100% above `insolvencyRiskUnhealthyLtvPct` (default 95%).
  - Defaults: `maxLiquidatableDebtMarketValueAtOnce` $500,000; full liquidation below $2 of debt.
  - `protocolLiquidationFeePct` takes a share of the bonus.
  - Losses above 100% LTV are spread across depositors via `socialize_loss`, which has "never been triggered on Kamino".
  - Source: [Kamino liquidation engine docs](https://kamino.com/docs/build/developers/borrow/liquidations/liquidation-engine)
- klend source constants: `LIQUIDATION_CLOSE_FACTOR = 20` and `MAX_LIQUIDATABLE_VALUE_AT_ONCE = 500_000`. `socialize_loss` requires the `lending_market_owner` signer. — [klend consts.rs](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/utils/consts.rs); [klend handler_socialize_loss.rs](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/handlers/handler_socialize_loss.rs)
- klend auto-deleveraging: `mark_obligation_for_deleveraging`, `deleveraging_margin_call_period_secs`, `deleveraging_threshold_decrease_bps_per_day` and `min_deleveraging_bonus_bps`. Kamino documents it as a market-owner-triggered grace period with a target LTV, used for volatility, oracle issues or oversized positions. — [klend reserve.rs](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/state/reserve.rs); [klend docs mirror (autodeleverage)](https://www.mintlify.com/kamino-finance/klend/advanced/autodeleverage)
- klend also supports user stop-loss and take-profit "obligation orders" and a `priceTriggeredLiquidationDisabled` switch. — [Kamino liquidation engine docs](https://kamino.com/docs/build/developers/borrow/liquidations/liquidation-engine)
- **marginfi:**
  - Partial liquidations with a 2.5% liquidator fee plus a 2.5% insurance fee in the worked example, and a "2.5–10%" typical liquidator profit.
  - Borrowing uses the EMA price and liquidation uses spot.
  - Liquidation is "open to third parties, and encouraged".
  - Source: [marginfi-v2 README](https://github.com/mrgnlabs/marginfi-v2)
- **Fluid / Jupiter Lend:**
  - Vault positions sit in collateralisation ticks, and branches track liquidation state and merge positions when liquidated. "Slot-based liquidation enables gas-efficient liquidation of large numbers of positions". Penalties are "as low as 0.1%".
  - Source: [Jupiter Lend architecture](https://developers.jup.ag/docs/lend/architecture); [Jupiter Lend liquidity](https://developers.jup.ag/docs/lend/liquidity); [MixBytes on Fluid](https://mixbytes.io/blog/modern-defi-lending-protocols-how-its-made-fluid-vault)
- **crvUSD LLAMMA:** collateral is spread across 4–50 AMM bands and continuously rebalanced (soft liquidation) rather than closed at one price. Liquidation operates per band, not per user. — [Curve LLAMMA explainer](https://docs.curve.fi/crvUSD/llamma-explainer); [DeFi Saver crvUSD](https://help.defisaver.com/protocols/curveusd/dashboard-and-use-case)
- **Solana keeper pattern:** Drift's repo points to open-source keeper bots ("makers, liquidators, fillers"). A sample klend-touching mainnet transaction on 2026-10-21 shows `FlashBorrowReserveLiquidity` followed by multi-hop swaps through Orca Whirlpool and Meteora DLMM in one transaction. — [drift protocol-v2 README](https://github.com/drift-labs/protocol-v2); [Solscan tx 29GBZC…](https://solscan.io/tx/29GBZCWDnxCFTEyBntxGYG56asBCkPQ2ReBShVdbug4BvfDWe1oQXkkMCic7DCKZYtqfzoPtPKSJtMkAuKVTLcC2)
- **Thin and closed markets:**
  - Kraken says market makers price xStocks off-hours from ATS venues, index futures and models. Spreads are wider off-hours, and divergence is corrected at reopening, "historically under 1%". — [Kraken xStocks FAQ](https://support.kraken.com/articles/xstocks-faq)
  - xStock order-book depth "has not been tested at scale under forced-selling conditions". — [Spotted Crypto](https://www.spotedcrypto.com/bybit-xstocks-collateral-loans-2026/)
  - Only about 9.9% of the roughly $845M of on-chain xStocks sits in DeFi. — [Coinpaprika (2026-10-06)](https://coinpaprika.com/education/tokenized-stocks-defi/)
  - Weekend liquidity is claimed to drop about 70%. This is a single source, unverified. — [BlockEden](https://blockeden.xyz/blog/2025/10/30/xstocks/)
- Chainlink advises: "Avoid liquidations based on feed data while the market is closed". It also notes that halts are not flagged in `marketStatus`, so a halt "may look like an outage and trigger unnecessary liquidations". — [Chainlink 24/5 US Equities guide](https://docs.chain.link/data-streams/rwa-streams/24-5-us-equities-user-guide)
- Live Kamino xStocks Market collateral (2026-10-21): about $23.3M of xStocks supplied across 9 non-trivial reserves against about $5.2M of USDC borrowed. The largest are MSTRx $4.54M, SPYx $4.32M, GOOGLx $4.05M, QQQx $3.26M, TSLAx $2.91M and NVDAx $2.31M. — [Kamino API reserves/metrics](https://api.kamino.finance/kamino-market/5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua/reserves/metrics?env=mainnet-beta)

### Inferences

- **Why the usual model is fragile here.** Standard permissionless liquidation assumes a keeper can seize xStock and immediately sell it on-chain for USDC. With thin DEX depth and closed underlying markets, a Friday-close to Monday-open gap can make liquidations unprofitable or impossible at the oracle price, and bad debt follows.
- **Recommended Mercury design:**
  1. Conservative LTVs, with the LTV-to-liquidation gap sized to historical weekend and overnight gaps per name.
  2. Freeze new borrows and collateral withdrawals while the market is closed or the price is out of band.
  3. During closed sessions, either disable price-triggered liquidations or allow them only beyond a wide band, as Chainlink recommends.
  4. A Compound-III-style absorb path or a protocol-operated backstop liquidator. Mercury can redeem or sell xStocks off-chain through Backed/Kraken rails, which permissionless bots cannot.
  5. An HF-scaled (Dutch-auction) bonus so small breaches are cheap for users.
  6. Per-liquidation size caps (klend's $500k default is a reference), ideally scaled to observed DEX depth.
  7. An explicit insurance or first-loss tranche funded by protocol fees before socialisation. kvault even has a `first_loss_capital_farm` field.
- Grace-period auto-deleveraging (klend) and LTV ramping (Euler) are valuable for an app with retail borrowers. Mercury can push notifications and margin calls before liquidation, which is a consumer-app advantage over raw protocols.
- Euler's cool-off period directly mitigates pull-oracle price-selection attacks. Pyth and Chainlink Data Streams on Solana are both pull-based, so it is relevant to Mercury.

### Gaps

- No public record was found of an actual xStock liquidation cascade or weekend gap event on Kamino.
- No data on Jupiter or DEX depth per xStock was gathered.
- Whether Kamino operates its own backstop liquidator for the xStocks market was not found.
- Kamino's per-reserve liquidation thresholds and bonuses for xStocks were not decoded. The API returns only `maxLtv`.

## 6. Oracles for tokenized equities (Pyth, Switchboard, Chainlink, RedStone): market hours, staleness, confidence and circuit breakers, and how Kamino's xStocks market handles them

### Takeaway

Equity feeds follow market sessions, so every lending design must define behaviour for closed, unknown and halted states and for corporate-action multiplier changes. Chainlink (Kamino's official xStocks provider) and Pyth now publish session-segmented feeds (regular, extended, overnight). Pyth also has separate 24/7 indices. Weekend prices are effectively the last close unless the protocol uses tokenized-asset or index fallbacks. Kamino handles xStocks with:

- Chainlink Data Streams, aggregated in its Scope oracle
- a price band around the last market close during low-liquidity periods
- market-status and staleness checks
- live max LTVs of 0.30 to 0.73 by name

### Cited Findings

**Pyth**

- US equity sessions (ET): Regular 9:30–16:00; Pre 4:00–9:30; Post 16:00–20:00; Overnight Sunday–Thursday 20:00–4:00. Holidays follow NYSE, and overnight follows Blue Ocean ATS. — [Pyth market hours](https://docs.pyth.network/price-feeds/market-hours)
- Lenders should value collateral at μ−σ and debt at μ+σ, and "pause new activity" when σ/μ exceeds a threshold. Integrators should "respect market hours and implement availability guardrails" and use conservative pricing "instead of reusing stale executable prices". — [Pyth best practices](https://docs.pyth.network/price-feeds/best-practices)
- Pyth launched 24/7 single-name indices (NVDA, TSLA, AAPL, MSFT and others) as a separate product. — [The Block](https://www.theblock.co/post/404238/pyth-launches-24-7-propetary-indices-for-us-equities-oil-and-metals); [Pyth overnight equities](https://www.pyth.network/blog/overnight-equities-explained)

**Chainlink**

- 24/5 US Equities Streams were announced in January 2026. They use the "RWA Advanced (v11)" schema, with three feeds per instrument (Regular, Extended, Overnight). — [Chainlink blog](https://blog.chain.link/chainlink-24-5-us-equities-streams/); [Chainlink 24/5 guide](https://docs.chain.link/data-streams/rwa-streams/24-5-us-equities-user-guide)
- Integrators must "always use the `marketStatus` field" to route between feeds, and define behaviour for status 0 (unknown) and 5 (closed: weekends, holidays, unexpected closures). — [Chainlink 24/5 guide](https://docs.chain.link/data-streams/rwa-streams/24-5-us-equities-user-guide)
- Chainlink also advises:
  - Use `lastSeenTimestampNs` for staleness. It covers only `mid` and may not be monotonic.
  - Validate `mid` against bands and spreads.
  - Pause on staleness, spread or deviation triggers.
  - The overnight feed comes from a "single data provider".
  - `lastTradedPrice` is deprecated for production by 2026-10-12.
  - Source: [Chainlink 24/5 guide](https://docs.chain.link/data-streams/rwa-streams/24-5-us-equities-user-guide)
- The "Tokenized Asset (v10)" schema adds tokenizer-supplied corporate-action fields: current and new multipliers and an activation time. Tokenized "Total Return Trackers" must be divided by the multiplier to get a spot-equivalent price. — [Chainlink report schema overview](https://docs.chain.link/data-streams/reference/report-schema-overview); [Chainlink 24/5 guide](https://docs.chain.link/data-streams/rwa-streams/24-5-us-equities-user-guide)

**The xStocks multiplier**

- Each xStock carries a Token-2022 Scaled UI Amount config. The issuer's multiplier represents dividends, splits and reverse splits, and the raw balance never changes. — [Solana xStocks case study](https://solana.com/news/case-study-xstocks); [Solana Scaled UI Amount docs](https://solana.com/docs/tokens/extensions/scaled-ui-amount)
- Multiplier updates carry an effective Unix timestamp. One guide says the xStocks multiplier is updated about 20:00 EST on the day before the ex-date. — [Solana Scaled UI Amount docs](https://solana.com/docs/tokens/extensions/scaled-ui-amount); [Degate](https://degate.com/playbook/tokenized-stock-dividends-mechanisms/)

**Kamino**

- The xStocks Market launched with 8 collaterals (SPYx, QQQx, GOOGLx, AAPLx, NVDAx, TSLAx, MSTRx, HOODx). The governance post is dated 2025-07-14. — [Kamino forum](https://gov.kamino.finance/t/kamino-is-integrating-xstocks-powered-by-the-chainlink-data-standard-to-enable-tokenized-equities-lending/792)
- Chainlink is the "official provider of xStocks price feeds on Kamino". Chainlink provides a market-status feed and staleness indicator, so Kamino can "respond automatically" to halts and outages. — [Kamino forum](https://gov.kamino.finance/t/kamino-is-integrating-xstocks-powered-by-the-chainlink-data-standard-to-enable-tokenized-equities-lending/792)
- During weekends, evenings and pre/post-market, Kamino accepts only prices within a "custom percentage deviation range of the asset price at last market close". — [Kamino forum](https://gov.kamino.finance/t/kamino-is-integrating-xstocks-powered-by-the-chainlink-data-standard-to-enable-tokenized-equities-lending/792)
- At launch, multiplier support was described as an upcoming Chainlink upgrade. — [Kamino forum](https://gov.kamino.finance/t/kamino-is-integrating-xstocks-powered-by-the-chainlink-data-standard-to-enable-tokenized-equities-lending/792)
- Scope (Kamino's oracle aggregator):
  - cross-validates Chainlink and Pyth Pro, de-prioritising an anomalous feed
  - picks the freshest valid price
  - rejects order-of-magnitude jumps, negatives and out-of-sequence updates
  - applies TWAP/EWMA smoothing, staleness flags and pegged-asset bands (USDC ±1%)
  - was audited by Certora and Offside Labs
  - "a newer or less liquid token may be supported by only one feed"
  - Source: [Kamino oracle pricing risk docs](https://kamino.com/docs/risk/asset-risk/oracle-pricing). The single-feed quote came via a search-result excerpt of Kamino docs, not a full-page fetch.
- klend per-reserve `TokenInfo` includes:
  - a `PriceHeuristic {lower, upper, exp}` hard band
  - `max_twap_divergence_bps`, `max_age_price_seconds` and `max_age_twap_seconds`
  - Scope, Switchboard and Pyth configs, and `block_price_usage`
  - Price status flags record loaded, age-checked, TWAP-checked, TWAP-age-checked, heuristic-checked and usage-allowed. Liquidations require only loaded, age-checked and usage-allowed.
  - Source: [klend token_info.rs](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/state/token_info.rs); [klend last_update.rs](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/state/last_update.rs)
- Live xStocks Market max LTVs (Kamino API, 2026-10-21). An older (2025) article cited 35–50%. — [Kamino API reserves/metrics](https://api.kamino.finance/kamino-market/5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua/reserves/metrics?env=mainnet-beta); [Coinpaprika](https://coinpaprika.com/education/tokenized-stocks-defi/)

  | Reserve                                       | Max LTV |
  | --------------------------------------------- | ------- |
  | cbBTC                                         | 0.75    |
  | SPYx                                          | 0.73    |
  | QQQx                                          | 0.70    |
  | GOOGLx                                        | 0.60    |
  | TSLAx                                         | 0.55    |
  | NVDAx                                         | 0.55    |
  | AAPLx                                         | 0.40    |
  | METAx                                         | 0.35    |
  | HOODx                                         | 0.30    |
  | CRCLx                                         | 0.30    |
  | MSTRx                                         | 0.30    |
  | USDC (usable as collateral to borrow xStocks) | 0.80    |
  | USDG                                          | 0       |

- The curated Sentora xStocks Market lends PYUSD (about $12.3M supplied, $2.68M borrowed) against SPYx (0.72), QQQx (0.70) and NVDAx (0.62). This is the Kraken xStocks vault strategy launched 2026-09-14. — [Kamino API (Sentora market)](https://api.kamino.finance/kamino-market/8BNUWRSibVasaAmhYpBCFpGgMisGKfVAf9ho3Cmf6vjr/reserves/metrics?env=mainnet-beta); [Genfinity](https://genfinity.io/2026/09/14/kraken-xstocks-vaults-kamino-veda-sentora-tokenized-stock-yield/)
- Kamino xStocks Multiply allows up to 3.7× leverage on QQQx and SPYx. — [Kamino on X](https://x.com/kamino/status/2020924453161730390)
- Kamino added USDC as collateral to borrow SPYx, TSLAx, QQQx and NVDAx. — [Kamino on X](https://x.com/kamino/status/2047693104682299699)
- marginfi uses Switchboard by default and also Pyth and fixed prices. It applies a confidence-interval adjustment (assets at P−c, liabilities at P+c), with confidence clamped to 5% or the transaction aborted. Switchboard feeds need a crank in or just before the consuming transaction. — [marginfi-v2 README](https://github.com/mrgnlabs/marginfi-v2)
- **Oracle-config failures on Solana:**
  - Loopscale lost about $5.8M (2025-04-26) through manipulated pricing of RateX PT collateral two weeks after launch. The flaw was in Loopscale's own pricing logic, and the funds were later returned. — [Blockworks](https://blockworks.co/news/loopscale-loss-oracle-attack); [Halborn](https://www.halborn.com/blog/post/explained-the-loopscale-hack-april-2025)
  - The Drift drain used an admin-set attacker oracle. — [BlockSec](https://blocksec.com/blog/drift-protocol-incident-multisig-governance-compromise-via-durable-nonce-exploitation)

### Inferences

- **Mercury oracle stack:**
  - Primary: Chainlink Data Streams with `marketStatus` routing.
  - Secondary: Pyth or Pyth Pro for cross-validation.
  - Hard heuristic bands per reserve, plus a "last-close band" while the market is closed.
  - Confidence and spread haircuts (collateral at μ−σ).
  - A max-age check, with borrows disabled on any failed check.
- **Multiplier correctness.** Price per raw token unit = equity price × current multiplier (or tokenized-TRT price ÷ multiplier for spot equivalence). The multiplier switch is timestamped, so the program must read the Token-2022 ScaledUiAmount config on-chain at valuation time rather than trusting a cached value. Otherwise a split or dividend boundary will misprice collateral. This is the most xStock-specific correctness bug to design out.
- **Name-by-name LTVs.** Kamino's live LTVs run from 0.30 for volatile single names (MSTRx, HOODx, CRCLx) up to 0.70–0.73 for index ETFs (SPYx, QQQx). This is a credible reference ladder for Mercury v1. Starting with only SPYx and QQQx (and perhaps 2–3 mega-caps) would cut oracle, liquidity and corporate-action surface.

### Gaps

- The width of Kamino's closed-market price band was not disclosed in any source found.
- The exact Scope staleness intervals were not found.
- RedStone and Switchboard tokenized-equity feed handling was not researched.
- Whether Chainlink's v10 multiplier fields are live for xStocks on Solana today was not confirmed.

## 7. Governance and upgrades on Solana: upgrade authority, Squads, timelocks, immutability, and how Kamino, marginfi, Jupiter Lend and Drift manage upgrades

### Takeaway

On Solana, the BPF Upgradeable Loader lets a single upgrade authority replace program code instantly, so the upgrade authority is the protocol's root of trust. Leading protocols put it behind Squads v4 multisigs. On-chain reads on 2026-10-21 show:

- Kamino: 5-of-10 with a 24h timelock
- Jupiter Lend: 4-of-6 with a 12h timelock
- marginfi: 7-of-15 with no timelock

Drift's April 2026 loss of about $285M came from a 2-of-5 admin multisig with zero timelock, attacked with social engineering plus durable-nonce pre-signed transactions. That is now the reference failure.

### Cited Findings

- **Squads time locks:** a time lock applies "globally to all Squad transactions", with presets of 1h, 1d, 1w or custom seconds. Activating it cancels pending Active/Ready settings transactions. — [Squads time locks docs](https://docs.squads.so/main/navigating-your-squad/settings/time-locks)
- A single-key upgrade authority is described as unacceptable for production. The norm is to transfer the authority to a Squads vault PDA requiring M-of-N approval. — [Squads blog](https://squads.xyz/blog/solana-multisig-program-upgrades-management); [Squads programs docs](https://docs.squads.so/main/navigating-your-squad/developers-assets/programs)
- Raydium keeps upgrade and admin authority under a Squads multisig but "does not employ a timelock". — [Raydium access controls](https://docs.raydium.io/raydium/protocol/access-controls)
- **On-chain upgrade authorities (Solana mainnet RPC, 2026-10-21).** All programs below are upgradeable.

  | Program                | ID          | Upgrade authority           | Notes                                         |
  | ---------------------- | ----------- | --------------------------- | --------------------------------------------- |
  | klend                  | `KLend2g3…` | `GzFgdRJX…`                 | programData last deployed at slot 458,858,791 |
  | kvault                 | `KvauGMsp…` | `GzFgdRJX…` (same as klend) |                                               |
  | Scope                  | `HFn8GnPA…` | `4R33WT7i…`                 |                                               |
  | marginfi v2            | `MFv2hWf3…` | `J3oBkTkD…`                 |                                               |
  | Jupiter Lend liquidity | `jupeiUmn…` | `4MsgBB5V…`                 |                                               |
  | Jupiter Lend vaults    | `jupr81Yt…` | `4MsgBB5V…` (same)          |                                               |
  | Solend                 | `So1endDq…` | `RY93CZYe…`                 | programData last deployed at slot 350,614,570 |

  Source: getAccountInfo on program and programData accounts, mainnet RPC; [Solscan klend](https://solscan.io/account/KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD)

- **Kamino:** the klend authority's upgrade on 2026-10-19 ran through a Squads v4 `VaultTransactionExecute` that invoked the BPF Upgradeable Loader. The multisig is `6hhBGCtm…`: threshold 5 of 10 members, `time_lock` = 86,400s (24h), and no config authority, so settings changes need the multisig itself. Another transaction from the same authority that day updated an on-chain verify program (`verifycLy8…`). That appears to be a verified-build attestation, though this is my interpretation. — [Solscan upgrade tx](https://solscan.io/tx/2a44ujRtW2Kb9DK2TQ2xEnHY7unkKrcBZ9VZY9EUGMJYjqE69aZ6XxXaV8HYj4wMvqGaXKwm9KAnF1XTrQJbXPUe); [Solscan multisig](https://solscan.io/account/6hhBGCtmg7tPWUSgp3LG6X2rsmYWAc4tNsA6G4CnfQbM)
- **Jupiter Lend:** the liquidity program upgrade on 2026-10-06 ran through Squads v4 multisig `J3mJ3wz6…`: threshold 4 of 6, `time_lock` = 43,200s (12h). — [Solscan tx](https://solscan.io/tx/588prriTXvtmeFGuyUmgSKZyxb5EubxCcQKnMqHaZKAft8aQgtMcydaZH8EW5ooWm7UghZ97L8NsqbgeDGCotAQT); [Solscan multisig](https://solscan.io/account/J3mJ3wz6xkVUk3T8qHnuAYNxsRH3ixHsryYNZAU2vG8P)
- **marginfi:** the most recent transaction touching marginfi's programData (2026-10-14) was executed by Squads v4 multisig `7FCPipJW…`: threshold 7 of 15, `time_lock` = 0. That transaction invoked an unidentified program `ProgM6JC…` rather than the loader directly, so it is not confirmed as a code upgrade. — [Solscan tx](https://solscan.io/tx/GSeStfKTFTtfjbJQD7wK2p9hFpDj4DPgKJVMduFhgmAjaDmM9hkKLuL4mkdHq8ZDjcnaFpsB17hgWTwodra3KRD); [Solscan multisig](https://solscan.io/account/7FCPipJWVbPbdHymVt1gJYwKciakkJz5GahdQySemvHk)
- **marginfi governance:** "Groups have a single administrator (typically a secure governance MS)… and several delegate admins (limit, emode, etc)". — [marginfi-v2 README](https://github.com/mrgnlabs/marginfi-v2)
- **Drift (2026-04-01):**
  - Configuration: a Squads 2-of-5 Security Council governing admin, market, oracle, risk and withdrawal-limit changes, with zero timelock.
  - Two signers were induced to pre-sign durable-nonce transactions. These were re-obtained after a council migration on 2026-03-27.
  - Two transactions four slots apart created, approved and executed `UpdateAdmin`.
  - The attacker then listed CVT with an attacker oracle and drained about $285.3M.
  - Lessons: timelock high-privilege actions, harden signing pipelines, add safeguards for durable nonces, monitor governance on-chain.
  - Source: [BlockSec](https://blocksec.com/blog/drift-protocol-incident-multisig-governance-compromise-via-durable-nonce-exploitation)
- Squads said its programs were not compromised. — [Crypto Times](https://www.cryptotimes.io/2026/04/03/drift-protocol-exploit-linked-to-compromised-multisig-signers-squads/)
- Drift called the exploit a six-month DPRK operation and reported $270M. — [CoinDesk](https://www.coindesk.com/markets/2026/04/05/drift-says-usd270-million-exploit-was-a-six-month-north-korean-intelligence-operation)
- **EVM analogues:**
  - Morpho V2 vaults are immutable, with all curator actions timelockable up to 3 weeks and abdicable. — [vault-v2 README](https://github.com/morpho-org/vault-v2)
  - The EVK lets creators pick upgradeable vs immutable and governed vs finalised. — [EVK whitepaper](https://github.com/euler-xyz/euler-vault-kit/blob/master/docs/whitepaper.md)
  - Aave v4 makes Hubs immutable and Spokes upgradeable. — [Aave v4 overview.md](https://github.com/aave/aave-v4/blob/main/docs/overview.md)

### Inferences

- **Recommended setup for Mercury:**
  1. A Squads v4 multisig, at least 3-of-5 with hardware keys, holds the program upgrade authority and the market owner role, behind a 24–72h timelock.
  2. A separate risk-reducing-only emergency role (a Morpho "sentinel" analogue), enforced in program code and needing no timelock. It can pause borrows, lower caps and LTVs gradually, and block price usage, but cannot raise limits, list collateral or change oracles.
  3. Oracle changes, new collateral listings and cap increases are always timelocked. Drift's exploit required exactly those three admin powers.
  4. Durable-nonce hygiene: signer training, transaction simulation and decoding, and short-lived approvals.
  5. Publish verified builds.
- **Graduated immutability.** Solana programs can be made immutable by setting the upgrade authority to none. For a small team that is too risky for v1. A practical path is a timelocked upgradeable v1, then freezing the core market program once it is stable, with a Morpho-like "minimal core, mutable vault" split so the frozen part is small.

### Gaps

- Whether the observed authorities are the vault PDAs of these exact multisigs was not derived cryptographically. It is inferred from the transactions that executed them.
- Kamino's separate market-owner (risk admin) key setup and any on-chain timelock for reserve config changes were not checked.
- Save's upgrade authority (`RY93…`) appeared directly as signer on top-level BPF-loader transactions on 2026-04-04, not via Squads. Its multisig status is unknown.
- Velocity's post-relaunch governance was not researched.

## 8. A minimal v1 for a small team: isolated market vs general pool, fork vs build, and licensing

### Takeaway

The lowest-risk v1 for Mercury has two parts:

- **(a)** One isolated, single-borrowable-asset USDC market with 2–5 xStock collaterals (start with SPYx and QQQx). Collateral is never lent out. Caps, conservative LTVs, closed-market freezes and a protocol backstop liquidator apply.
- **(b)** A thin curated vault that splits user USDC between that market and a deep external venue for instant liquidity.

**Licensing:**

- Kamino klend and kvault, Fluid, Euler EVK, Aave v3/v4 and Comet are BUSL-type or restrictive and cannot legally be forked for production now. Comet may have converted to GPL by date.
- marginfi v2 (Apache-2.0), Solend/SPL token-lending (Apache-2.0) and Drift v2 (Apache-2.0, archived) are forkable on Solana.
- Morpho Blue and Vault V2 (GPL-2.0-or-later or MIT) are forkable design and code references on EVM.

### Cited Findings

**License files (read 2026-10-21)**

| Codebase                    | License                                                                                             | Production use / Change Date                                                                                                     | Source                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Kamino klend                | BUSL 1.1, Licensor StroudGlobal S.A., Additional Use Grant: None                                    | Change Date 2027-11-17 → GPL-2.0-or-later (or 4 years after a version's first distribution, whichever first)                     | [klend LICENSE](https://github.com/Kamino-Finance/klend/blob/master/LICENSE)                      |
| Kamino kvault               | BUSL 1.1                                                                                            | Change Date 2029-05-20                                                                                                           | [kvault LICENSE](https://github.com/Kamino-Finance/kvault/blob/master/LICENSE)                    |
| Kamino Scope                | BUSL 1.1                                                                                            | Change Date 2028-11-25                                                                                                           | [scope LICENSE](https://github.com/Kamino-Finance/scope/blob/master/LICENSE)                      |
| Fluid contracts             | BUSL 1.1, Additional Use Grant "educational purposes only", expressly prohibiting production use    | Change Date 2027-12-19                                                                                                           | [Fluid LICENSE](https://github.com/Instadapp/fluid-contracts-public/blob/main/LICENSE)            |
| Jupiter Lend                | Public repo has only integration guides, CPI references and IDLs; no program source or license file | n/a                                                                                                                              | [jup-ag/jupiter-lend](https://github.com/jup-ag/jupiter-lend)                                     |
| Euler Vault Kit             | BUSL 1.1, no grant                                                                                  | Change Date 2029-04-24                                                                                                           | [EVK LICENSE](https://github.com/euler-xyz/euler-vault-kit/blob/master/LICENSE)                   |
| Euler EVC                   | GPL-2.0                                                                                             | n/a                                                                                                                              | [EVC repo](https://github.com/euler-xyz/ethereum-vault-connector)                                 |
| Aave v3.3 (aave-v3-origin)  | BUSL 1.1 with grant conditions                                                                      | Barred if the use enables migration from the Aave ecosystem, or if you operated a competing fork in the prior 4 years            | [aave-v3-origin LICENSE](https://github.com/aave/aave-v3-origin/blob/main/LICENSE)                |
| Aave V4                     | Custom "Business Source License" from Aave Labs                                                     | Use permitted "solely in a Test Environment"; "No Competitive Production Deployment"                                             | [aave-v4 LICENSE](https://github.com/aave/aave-v4/blob/main/LICENSE)                              |
| Compound III (Comet)        | BUSL 1.1                                                                                            | Change Date "the earlier of 2025-12-31 or a date specified at v3-change-date.compound-community-licenses.eth" → GPL-2.0-or-later | [comet LICENSE](https://github.com/compound-finance/comet/blob/main/LICENSE)                      |
| Morpho Blue                 | `Morpho.sol` GPL-2.0-or-later, rest MIT (formerly BUSL)                                             | n/a                                                                                                                              | [morpho-blue README](https://github.com/morpho-org/morpho-blue)                                   |
| Morpho vault-v2, metamorpho | GPL-2.0 (GitHub SPDX)                                                                               | n/a                                                                                                                              | [vault-v2](https://github.com/morpho-org/vault-v2)                                                |
| marginfi-v2 (Project 0)     | Apache-2.0                                                                                          | n/a                                                                                                                              | [marginfi-v2](https://github.com/mrgnlabs/marginfi-v2)                                            |
| Solend main lending program | Apache-2.0, copyright Solana Foundation (SPL heritage)                                              | n/a                                                                                                                              | [solendprotocol/solana-program-library](https://github.com/solendprotocol/solana-program-library) |
| Drift protocol-v2           | Apache-2.0, repo archived                                                                           | n/a                                                                                                                              | [drift-labs/protocol-v2](https://github.com/drift-labs/protocol-v2)                               |

- BUSL prohibits production use without the licensor's approval until the Change Date, then converts to a GPL-compatible license. — [Wikipedia: Business Source License](https://en.wikipedia.org/wiki/Business_Source_License)
- **Solana engineering constraints seen in production code:**
  - klend caps an obligation at 20 reserves, requires same-slot reserve refreshes, and was most recently deployed in October 2026, which shows ongoing upgrades. — [klend consts.rs](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/utils/consts.rs)
  - marginfi notes account and compute-unit constraints when bundling oracle cranks into transactions. — [marginfi-v2 README](https://github.com/mrgnlabs/marginfi-v2)
- New-protocol risk: Loopscale was exploited two weeks after launch through its own collateral pricing logic. — [The Block](https://www.theblock.co/post/352083/solana-defi-protocol-loopscale-hit-with-5-8-million-exploit-two-weeks-after-launch)
- Morpho's reason for not rehypothecating collateral is that it lets lenders run higher utilisation. — [Morpho IRM docs](https://docs.morpho.org/learn/concepts/irm/)
- Compound III's single base asset model centralises bad-debt absorption in protocol reserves. — [Compound III liquidation docs](https://docs.compound.xyz/liquidation/)
- **Kamino's own building blocks** are possible components if Mercury chose to keep using Kamino as a curator rather than build:
  - Curated markets: Kamino lists "isCurated" markets, such as the Sentora xStocks Market.
  - kVaults: allocation_admin, permissioning_authority, first-loss capital.
  - Source: [Kamino API market list](https://api.kamino.finance/v2/kamino-market); [kvault vault_state.rs](https://github.com/Kamino-Finance/kvault/blob/master/programs/kvault/src/state/vault_state.rs)

### Inferences

- **Option A: fork marginfi v2 (Apache-2.0).**
  - Pros: Solana-native, actively maintained (pushed 2026-10-19), with a mature risk engine (initial/maintenance weights, confidence adjustment, EMA-for-borrow, isolated tier, insurance fee), and permissively licensed.
  - Cons: it is a general cross-margin pool by design, which is more surface than Mercury needs. It would have to be configured as a single Group with USDC as the only borrowable Bank, and xStock-specific market-hours logic and Token-2022 ScaledUiAmount pricing added. Re-audit is still needed.
- **Option B: fork Solend / SPL token-lending (Apache-2.0).** Simple, well-understood reserve/obligation model, but older code with less modern oracle handling.
- **Option C: build a minimal Morpho-Blue-style program from scratch in Anchor.**
  - Shape: isolated markets keyed by (USDC, xStock mint, oracle config, LLTV), no collateral lending, a hard-coded IRM, and roughly 1–2k lines of core logic.
  - Pros: smallest audit surface; easiest to make immutable later; Morpho's GPL/MIT code and whitepaper can guide the design.
  - Cons: everything is new code, so it needs at least two audits plus formal or fuzz testing. Note that GPL-2.0-or-later obligations may attach if code is translated rather than reimplemented from the spec. This needs legal review.
- **Option D: stay on Kamino but run a Mercury-curated market or kVault.** Lowest engineering cost and inherits Kamino's audited code and Scope oracle. It does not achieve independence from Kamino, but reduces dependence to "Kamino as infrastructure" rather than "Kamino as counterparty".
- **Suggested v1 shape (whichever codebase):**
  - One USDC market.
  - Collateral: SPYx and QQQx first (Kamino max LTV 0.70–0.73 is a ceiling, not a target), adding at most 2–3 mega-caps later.
  - Per-collateral supply caps sized to on-chain DEX depth.
  - Borrows disabled when `marketStatus ≠ open` or the price is out of band.
  - A HF-scaled liquidation bonus, plus Mercury-operated backstop liquidation through off-chain redemption.
  - A protocol fee (10–20% of interest) funding a first-loss reserve before any socialisation.
  - A Squads v4 multisig with a 24h+ timelock on everything except risk-reducing actions.
  - A vault with an internal-accounting SPL share mint, seed deposit and virtual offset, an idle buffer plus a liquidity adapter to an external USDC venue, and a FIFO withdrawal queue fallback.
- **Comet's license.** Its Change Date clause ("earlier of 2025-12-31 or…") suggests that version has converted to GPL-2.0-or-later as of October 2026. It is still EVM code, so it serves mainly as a design reference for the absorb/buyCollateral model.

### Gaps

- No legal opinion was obtained on BUSL Change Date mechanics (per-version four-year clocks) or on GPL obligations when porting Solidity logic to Rust.
- Audit history and recent findings for marginfi v2 (Project 0) and Save were not compiled in this session.
- No cost or timeline benchmarks for Solana lending audits (OtterSec, Neodyme, Certora, Offside) were gathered.
- Kamino's commercial licensing or partnership terms (for example an Additional Use Grant for a partner) were not researched.
