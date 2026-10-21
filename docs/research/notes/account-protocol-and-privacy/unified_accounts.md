# Unified account architectures (earn + borrow + spend + trade on one account): design references for a Solana "Mercury Account"

Research date: 21 October 2026. Versions and dates are given inline. Where a claim comes only from a search-result summary or a third-party page, that is said.

## Gearbox v3 credit accounts: factory, credit managers, adapters, post-multicall collateral checks, bots, whole-account liquidation, and why "the account holds the borrowed funds" matters

### Takeaway

In Gearbox, borrowed funds never reach the user. They sit in an isolated per-position smart-contract account that can only call allowlisted adapters through a filter contract (the Credit Facade). Every multicall ends with one solvency check, and a liquidator takes over the whole account. This is the closest EVM template for a Mercury Account that holds cash, stocks and debt, and lets modules act on it only through vetted paths.

### Cited Findings

- **What a credit account is.** A Credit Account (CA) is a smart-contract wallet that can hold assets and interact with other contracts. What sets it apart is that it can draw debt from Gearbox pools. Once it has borrowed, it must stay solvent, meaning it holds enough recognised collateral to cover its debt. — [Gearbox dev docs: Accounts](https://dev.gearbox.finance/core/accounts)
- **Owner access goes through a filter.** All interaction between the owner and the CA goes through the Credit Facade. The Facade limits which contracts the account can touch (via adapters) and which actions the owner can take, and this is what keeps the account solvent. — [Gearbox: Accounts](https://dev.gearbox.finance/core/accounts)
- **Each market has its own contract set.** Every Credit Manager has its own `CreditManager`, `CreditFacade` and `CreditConfigurator`, plus a per-manager adapter list (for example "Adapter for UNISWAP_V3_ROUTER", "CURVE_3CRV_POOL", "YEARN_USDC_VAULT"). Core contracts include `AccountFactory`, `BotList` and `PriceOracleV3`. Each pool has a `PoolQuotaKeeper` and a `Gauge`. — [Gearbox dev portal index](https://dev.gearbox.finance/)
- **Account factory, v2 vs v3.1.**
  - In v2, CAs were pre-deployed and "rented" from a linked list, then returned on close or liquidation. EIP-1167 clones were the fallback. The stated benefits were gas savings, isolation that limits contagion between accounts, and balance transparency. — [Gearbox v2 AccountFactory](https://dev.gearbox.finance/v2/architecture/account-factory)
  - In the current `DefaultAccountFactoryV3` (`version = 3_11`), reuse is gone: `returnCreditAccount` is a no-op ("Account reuse is no longer supported"). `takeCreditAccount` clones a per-credit-manager master account with OpenZeppelin `Clones`, and only registered credit managers can call it. — [DefaultAccountFactoryV3.sol](https://raw.githubusercontent.com/Gearbox-protocol/core-v3/main/contracts/core/DefaultAccountFactoryV3.sol)
- **Multicall structure.** A multicall is a list of (target, calldata) pairs sent to the Credit Facade and executed atomically. "Each multicall is followed by a collateral check." Calls either target the Facade (account management) or an adapter (an external protocol call made from the CA). Adapters reset token allowances to 1 after each operation. A slippage check can run at the end of the multicall. — [Gearbox: Multicall](https://dev.gearbox.finance/core/multicall)
- **Account-management operations.** The multicall functions are: `onDemandPriceUpdates` (must come first), `storeExpectedBalances`/`compareBalances` (slippage), `addCollateral`, `addCollateralWithPermit`, `increaseDebt`, `decreaseDebt`, `updateQuota`, `withdrawCollateral`, `setFullCheckParams` and `setBotPermissions`. — [ICreditFacadeV3Multicall.sol](https://raw.githubusercontent.com/Gearbox-protocol/core-v3/main/contracts/interfaces/ICreditFacadeV3Multicall.sol)
- **Risk-aware restrictions in the check path.**
  - `increaseDebt` is prohibited if forbidden tokens are enabled as collateral, and if debt was already updated in the same block.
  - `withdrawCollateral` turns on safe pricing: the minimum of the main and reserve price feeds (`USE_SAFE_PRICES_FLAG = 1<<196`).
  - `REVERT_ON_FORBIDDEN_TOKENS_FLAG` (`1<<195`) is set after risky operations.
  - Repaying debt in full skips the collateral check.
  - Source: [ICreditFacadeV3Multicall.sol](https://raw.githubusercontent.com/Gearbox-protocol/core-v3/main/contracts/interfaces/ICreditFacadeV3Multicall.sol)
- **Lazy collateral check.** `setFullCheckParams(uint256[] collateralHints, uint16 minHealthFactor)` controls the check. Hinted tokens are valued first, and the check stops early once total weighted value is at least the debt (`twvUSD >= debtUSD`), which saves oracle calls. `minHealthFactor` is in basis points and must be at least 10000 (HF 1.0). — [Gearbox: full check params](https://dev.gearbox.finance/credit/multicall/full-check-params)
- **Bot permission bitmask (`uint192`).**
  - Bits: ADD_COLLATERAL `1<<0`, INCREASE_DEBT `1<<1`, DECREASE_DEBT `1<<2`, WITHDRAW_COLLATERAL `1<<5`, UPDATE_QUOTA `1<<6`, SET_BOT_PERMISSIONS `1<<8`, EXTERNAL_CALLS `1<<16`.
  - Bits 3, 4 and 7 were used by deprecated methods.
  - `setBotPermissions` reverts on unexpected bits.
  - Source: [ICreditFacadeV3Multicall.sol](https://raw.githubusercontent.com/Gearbox-protocol/core-v3/main/contracts/interfaces/ICreditFacadeV3Multicall.sol)
- **What bots can and cannot do.**
  - Bots act through `botMulticall`.
  - "There are no checks performed after bot multicalls beyond the usual collateral check." Any other limits (slippage, minimum health, protocol allow/deny lists) must be built into the bot contract itself.
  - Governance can forbid a bot, which blocks it even where users granted permissions.
  - Governance can also grant "special permissions" across all accounts in a Credit Manager that override user settings. This is how features like partial liquidation are added without changing core contracts.
  - Source: [Gearbox: Bots](https://dev.gearbox.finance/core/bots)
  - A search-result summary of an older Gearbox docs page says grants are scoped per (bot, creditManager, creditAccount). That page returned 404 when fetched, so this is unverified. — [Gearbox docs (search summary)](https://docs.gearbox.finance/developers/gm-bots)
- **Liquidation.**
  - Anyone can liquidate when HF < 1.
  - Total value is split into: an amount to the pool (debt plus DAO fees), "remaining funds" (the minimum the owner keeps), and a liquidator premium.
  - The liquidator runs a multicall with arbitrary external calls. Afterwards the account must cover the amount to the pool, keep at least the remaining funds, and not have increased its enabled-collateral balances.
  - Losses lower the pool share price and stop borrowing in that Credit Manager until governance re-enables it.
  - An "expiration mode" allows liquidation after a set date, with a smaller premium.
  - Source: [Gearbox: Liquidations](https://dev.gearbox.finance/core/liquidation)

### Inferences

- **Why "the account holds the borrowed funds" matters for Mercury.** Because borrowed USDC never leaves the account, the protocol can:
  - let it be spent only to allowlisted destinations (a card-settlement address, an earn vault, a swap adapter);
  - count it as collateral in the same health check;
  - liquidate it together with the stocks.

  Compare Kamino or marginfi, where borrowed tokens go to the user's wallet and the protocol loses sight of them. A Mercury credit line that pays Bridge card settlement straight from the account is the Gearbox model applied to spending.

- **The Solana version of the Gearbox stack:**

  | Gearbox piece         | Solana equivalent                                                                                                              |
  | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
  | Credit Account        | Per-user PDA that owns its token accounts (USDC, xStock Token-2022 ATAs)                                                       |
  | Credit Facade         | The Mercury program's instruction set                                                                                          |
  | Adapters              | Allowlisted CPI targets (Kamino/Jupiter Lend for earn, a swap router, a card-settlement vault) stored in a config account      |
  | Bot permissions       | Per-delegate bitmask stored on the user account                                                                                |
  | Full collateral check | One health computation at the end of each top-level instruction, or at the end of a "region" (see the Solana patterns section) |

- Gearbox v3.1 dropped account reuse. On Solana this matters less, because PDAs are deterministic and rent can be reclaimed on close.
- **Lessons on bots.**
  - Gearbox's bot design admits that the core check only enforces solvency. Anything else (slippage, rate limits, destination allowlists) is the bot's job. For Mercury, card-settlement and auto-earn modules need their own on-chain limits (per-period caps, destination pinning), not just a passing health check.
  - Governance "special permissions" that override users are a convenience that is also an admin-risk vector. Mercury should limit any such override to liquidation-type actions.

### Gaps

- Live Gearbox docs did not give the exact v3 partial-liquidation function, the liquidation premium/fee values, or a confirmed per-(bot, account) scope. Some docs.gearbox.finance URLs returned 404.
- No quantitative data on how many adapters or tokens a single Credit Manager supports in practice. The gas limits that drive the "collateral hints" design are not quantified.

## Euler v2 EVC: sub-accounts, operators, controller/collateral vaults, deferred account and vault status checks, permits

### Takeaway

The EVC separates who may act (owner, operators, permits), which vault controls the debt (one controller per account), and when solvency is checked (deferred to the end of the outermost batch). Each vault defines its own rules. This "deferred checks + single controller + collateral seizure via `controlCollateral`" pattern maps directly to a Solana "begin/end health region" with one debt module per sub-account.

### Cited Findings

- **Sub-accounts.**
  - Addresses sharing the same first 19 bytes form a group of up to 256 sub-accounts. The first address to interact with the EVC is recorded as owner.
  - `getAccountOwner` returns `address(0)` before first interaction.
  - Source: [EVC whitepaper](https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md)
  - "Each user address is granted 256 virtual sub-accounts." Risk is determined by the vaults, controllers, collaterals and operators enabled on each one. — [Euler docs: EVC](https://docs.euler.finance/build/evc)
- **Operators.**
  - `setOperator(bytes19 addressPrefix, address operator, uint256 operatorBitField)` lets the owner choose which of the 256 sub-accounts an operator controls.
  - `setAccountOperator(account, operator, bool)` can be called by the owner, or by an operator only to remove itself.
  - An operator cannot be the EVC or an address within the same prefix.
  - Source: [IEthereumVaultConnector.sol](https://raw.githubusercontent.com/euler-xyz/ethereum-vault-connector/master/src/interfaces/IEthereumVaultConnector.sol)
  - Operators can change an account's collateral and controller sets. The owner can revoke them at any time. — [EVC whitepaper](https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md)
- **Controller and collateral limits.**
  - `enableCollateral` allows up to 10 unique collaterals per account.
  - `enableController` is callable by owner or operator. At most one controller may remain enabled after the outermost call.
  - `disableController` can only be called by the controller vault itself, so a lender releases its own claim only once the debt is gone.
  - Source: [IEthereumVaultConnector.sol](https://raw.githubusercontent.com/euler-xyz/ethereum-vault-connector/master/src/interfaces/IEthereumVaultConnector.sol)
- **Deferred status checks.**
  - Vaults implement `checkAccountStatus` and `checkVaultStatus`. They schedule checks via `requireAccountStatusCheck` / `requireVaultStatusCheck`.
  - Inside `call`, `batch` or `controlCollateral` (which can be nested), checks are deferred until the outermost call finishes.
  - Deferred sets hold up to 10 elements (`SET_MAX_ELEMENTS`).
  - Only one execution context exists. A `checksInProgress` mutex blocks changes while checks unwind.
  - `forgiveAccountStatusCheck` is allowed only for the sole enabled controller.
  - Source: [EVC whitepaper](https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md); [IEVC](https://raw.githubusercontent.com/euler-xyz/ethereum-vault-connector/master/src/interfaces/IEthereumVaultConnector.sol)
  - Intermediate states may violate constraints, but the transaction succeeds only if all final checks pass. "A vault that fails to request the correct check gets no protection from deferral." — [Euler docs: EVC](https://docs.euler.finance/build/evc)
- **Liquidation.** When an account is under water, the liability vault calls `controlCollateral` to seize collateral from enabled collateral vaults. To the collateral vault this looks like an ordinary withdrawal or transfer. — [Euler docs: EVC](https://docs.euler.finance/build/evc). The flag `controlCollateralInProgress` blocks changes to collateral/controller sets, and re-entry into `call`/`batch`/`permit`, during seizure. — [EVC whitepaper](https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md)
- **Permits.**
  - EIP-712 fields: `signer, sender, nonceNamespace, nonce, deadline, value, data`.
  - Signatures are checked with `ecrecover`, falling back to ERC-1271.
  - Nonces are sequential within a namespace for strict ordering. Separate namespaces allow any order.
  - Permits are cancelled with `setNonce` (`type(uint256).max` invalidates a whole namespace) or by letting the deadline pass.
  - Sources: [EVC whitepaper](https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md); [IEVC](https://raw.githubusercontent.com/euler-xyz/ethereum-vault-connector/master/src/interfaces/IEthereumVaultConnector.sol)
- **Lockdown mode and permit-disabled mode.**
  - Lockdown mode (owner only, applies to the whole prefix): the owner can only manage operators and nonces, operators can only revoke themselves, and external calls are blocked. Controllers can still seize collateral.
  - Permit-disabled mode stops execution of the owner's signed permits.
  - Turning either mode off must be a direct EVC call, not a permit or deferred call.
  - Sources: [EVC whitepaper](https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md); [IEVC](https://raw.githubusercontent.com/euler-xyz/ethereum-vault-connector/master/src/interfaces/IEthereumVaultConnector.sol)
- **Simulation.** `batchSimulation` runs a batch and reverts it, returning results. The whitepaper warns that malicious contracts can detect the `simulationInProgress` flag and behave differently. — [EVC whitepaper](https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md)
- **Stated security model.**
  - Malicious or buggy controllers can lose funds or brick accounts, so users should enable only audited controllers.
  - Collateral vaults can misreport balances or block liquidation, so controllers should accept only registry-verified collateral.
  - The EVC itself should never hold privileged roles or token balances.
  - Source: [EVC whitepaper](https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md)

### Inferences

- **Mercury mapping.**
  - Each Mercury user gets N sub-accounts. Solana PDAs seeded by (owner, index) are the natural equivalent; no address-prefix trick is needed.
  - Each sub-account has at most one debt module (credit line) as "controller" plus a capped collateral set. EVC's 10 matches Kamino's 8 deposits.
  - Operators are per-sub-account bitmasks.
  - An emergency "lockdown" flag lets the user freeze all delegated activity except liquidation and repayment. This is cheap to build and directly limits the damage from a compromised relayer or session key.
- The "one controller" rule avoids the hardest unified-margin problem: two lenders competing for the same collateral. If Mercury lets both a credit line and a margin/basket module carry debt, a single program must own the combined debt ledger, or the sub-accounts must be separate.
- The warning that "a vault that fails to request the check gets no protection" is the EVM version of the Euler-2023 and marginfi bug classes: every state-changing instruction must enter the health-check path. On Solana, enforce this in code, for example with one `exit_with_health_check()` that every handler must call, plus a test that walks every instruction.

### Gaps

- No public figure found for gas or complexity overhead of EVC deferred checks at scale.
- How widely operators and permits are used in production (for example by Euler's own UI or keepers) was not found.

## How unified/cross-margin systems net cash, collateral and debt: Hyperliquid, dYdX, Drift, Aave v4, Fluid/Jupiter Lend, Kamino (obligations and Multiply), marginfi, Mango v4

### Takeaway

Every production system bounds its account unit to keep health checks tractable:

- Kamino: 8 deposits / 5 borrows.
- Drift: 8 spot / 8 perp positions per sub-account.
- EVC: 10 collaterals and 1 controller.
- dYdX: one position per isolated child sub-account.
- Aave v4: positions scoped per Spoke.

Netting happens by summing risk-weighted collateral against risk-weighted debt across a fixed set of positions, re-priced in the same transaction. Hyperliquid portfolio margin is the most aggressive netting: spot and perps share one balance, and missing balances are auto-borrowed.

### Cited Findings

- **Hyperliquid account modes (docs, undated snapshot read October 2026).**
  - "Unified account" is recommended for most users: one balance per asset backs all cross-margin positions in that asset and also serves spot.
  - "Portfolio margin" covers HYPE, BTC, USDC and USDT in one portfolio.
  - "Standard" keeps spot and perp balances separate, and separate per DEX.
  - Unified and portfolio-margin accounts are limited to 50k user actions per day.
  - A `computeUnifiedAccountRatio` function sums cross maintenance margin per collateral token across perp DEXs, divides by (spot total minus isolated margin), and takes the maximum across tokens.
  - Source: [Hyperliquid: account abstraction modes](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/account-abstraction-modes)
- **Hyperliquid portfolio margin, borrowing and caps.**
  - Eligible collateral LTVs: HYPE 0.65, BTC 0.5. Insufficient balances are auto-borrowed against eligible collateral, up to `balance * borrow_oracle_price * ltv`.
  - Stablecoin borrow rate: `0.05 + 4.75 * max(0, U - 0.8)` APY. Interest accrues hourly, and 10% of borrow interest is retained as a liquidation buffer.
  - Caps: USDC 50M per-user borrow cap, among others.
  - Source: [Hyperliquid: portfolio margin](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/portfolio-margin)
- **Hyperliquid portfolio margin, health and liquidation.**
  - Portfolio margin ratio = max over borrowable tokens of (maintenance requirement / liquidation value).
  - Maintenance requirement = 20 USDC + cross maintenance margin across DEXs + borrowed size × oracle price.
  - Liquidation threshold = `0.5 + 0.5*LTV`. The account is liquidatable above a ratio of 0.95.
  - A backstop liquidator takes over positions in 20% increments between the partial and full thresholds.
  - Sub-accounts are margined separately.
  - Source: [Hyperliquid: portfolio margin](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/portfolio-margin)
- **Hyperliquid launch status, with conflicts.**
  - Portfolio margin launched in pre-alpha on testnet in December 2025, with HYPE as the only collateral, USDC as the only borrowable asset, a $1k per-user borrow cap and a volume gate. — [The Defiant](https://thedefiant.io/news/defi/hyperliquid-launches-portfolio-margin-and-blp-pre-alpha)
  - A 26 May 2026 report says USDT borrowing was enabled on testnet and that "the mainnet upgrade will soon roll out". — [Pluang](https://pluang.com/en/news-feed/hyperliquid-tambahkan-usdt-sebagai-aset-pinjam-di-testnet-upgrade-mainnet)
  - The current docs list larger caps and BTC collateral without saying which network. Mainnet status of portfolio margin is unconfirmed.
- **dYdX v4.**
  - The per-address sub-account cap rose from 127 to 128,000 in v5.0.0.
  - Sub-accounts 0–127 are cross-margined "parent" accounts. Sub-accounts 128–128,000 are isolated "child" accounts holding at most one position.
  - Isolated markets cannot be cross-margined with anything.
  - Sources: [dYdX isolated markets](https://docs.dydx.exchange/api_integration-trading/isolated_markets); [dYdX isolated positions](https://docs.dydx.xyz/concepts/trading/isolated-positions)
- **Drift (Solana) `User` account.**
  - Fields: `authority`, optional `delegate`, `sub_account_id` (u16), up to 8 `spot_positions`, up to 8 `perp_positions`, up to 32 orders, `margin_mode` (Cross/Isolated), `pool_id` and status flags. — [drift-rs User account reference](https://mintlify.wiki/drift-labs/drift-rs/api/accounts/user)
  - A delegate can do most operations "except for withdrawals". This comes from a third-party indexer guide. — [Shyft: Drift delegate](https://docs.shyft.to/solana-indexers/case-studies/drift/get-user-account-for-delegate)
- **Aave v4, live on Ethereum mainnet since 30 March 2026.**
  - Launched with 3 Hubs and 10 Spokes (Core: Main, Lido, EtherFi, Kelp, Lombard BTC, Gold, Forex; Prime: Bluechip; Plus: two Ethena spokes) and conservative caps. — [Aave governance ARFC](https://governance.aave.com/t/arfc-aave-v4-activation-on-ethereum-mainnet/24293)
  - Users interact with Spokes. A user position is what the user has supplied and borrowed within a given Spoke. Health factor = eligible collateral / debt. Liquidators repay only enough to reach a Spoke-level Target Health Factor. A User Risk Premium is added to the borrow rate based on collateral composition. — [Aave v4 docs](https://aave.com/docs/aave-v4)
- **Aave v4 Position Managers.**
  - Governance must register a manager per Spoke. The user then enables it with `setUserPositionManager(manager, approve, user)` and can revoke at any time.
  - `GiverPositionManager` (supply/repay on behalf, using the caller's funds) needs no allowance.
  - `TakerPositionManager` (withdraw/borrow on behalf, funds go to the caller) needs per-reserve `approveWithdraw` / `approveBorrow` allowances, on-chain or via EIP-712.
  - `ConfigPositionManager` changes collateral flags under per-action permissions.
  - Managers are not enumerable on-chain.
  - Source: [Aave v4 Position Managers](https://aave.com/docs/aave-v4/positions/managers)
- **Fluid / Jupiter Lend smart vaults.**
  - In Fluid, "smart collateral" is an LP position that keeps earning DEX fees while securing a loan. "Smart debt" puts borrowed liquidity into DEX trading, so fees offset interest. — [The Big Whale](https://www.thebigwhale.io/article/fluid-fluid-the-protocol-that-merges-dex-and-lending-in-one-place)
  - Fluid liquidations group positions into LTV "slots" (ticks) for simultaneous liquidation. — [DeFi Saver: Fluid vaults](https://help.defisaver.com/protocols/fluid/vault-protocol)
  - Jupiter Lend v2 smart vaults (dated August 2026, Solana) evaluate debt-to-collateral on the combined USD value of both legs, pricing the pair through its DEX share price, with tick-based liquidation. At launch only one smart side per vault and only correlated pairs (for example JupSOL/SOL). Smart Earn mints a Position NFT that "must not be burned or transferred". — [Jupiter Lend smart vaults](https://docs.jup.ag/user-docs/earn/lend/smart-vaults)
- **Kamino Lend (Solana) obligation.**
  - Fields: `owner`, `lending_market`, `deposits: [ObligationCollateral; 8]`, `borrows: [ObligationLiquidity; 5]`, `deposited_value_sf`, `borrow_factor_adjusted_debt_value_sf`.
  - `refresh_reserve` (interest + oracle) and `refresh_obligation` (recompute values and LTV) must run before operations.
  - A LendingMarket holds up to 32 elevation groups.
  - Source: [klend architecture](https://mintlify.wiki/kamino-finance/klend/concepts/architecture)
  - Inside an elevation group, collateral and borrows must come from that group's reserves. — [klend elevation groups](https://www.mintlify.com/kamino-finance/klend/advanced/elevation-groups)
  - These mintlify pages are community-generated docs of the klend source, not confirmed as official.
- **Kamino flash loans.**
  - `flash_borrow_reserve_liquidity` must be followed in the same transaction by `flash_repay_reserve_liquidity`, checked by instruction introspection: same reserve, same amount, same accounts.
  - Both reject CPI (`FlashBorrowCpi`/`FlashRepayCpi`). Only one flash borrow per transaction is allowed.
  - Source: [klend flash loans](https://mintlify.wiki/kamino-finance/klend/advanced/flash-loans)
  - Kamino's leverage SDK (`@kamino-finance/klend-sdk/leverage`) provides leveraged deposit/withdraw helpers. — [sendaifun Kamino skill](https://skills.sh/sendaifun/skills/kamino)
  - Auto-deleverage lets only the `lending_market_owner` flag risky obligations for reduction, with a grace period. — [klend autodeleverage](https://www.mintlify.com/kamino-finance/klend/advanced/autodeleverage)
- **marginfi (Solana).**
  - `lending_account_start_flashloan` uses the Instructions sysvar to require a matching `end_flashloan` later in the transaction for the same account, then sets `ACCOUNT_IN_FLASHLOAN`.
  - While the flag is set, `check_account_init_health` skips health checks.
  - `end_flashloan` cannot run via CPI, clears the flag and runs the health check.
  - "Only the final health state matters", so every instruction that touches a MarginfiAccount must be aware of flash-loan state.
  - Source: [Asymmetric Research](https://asymmetric.com/threat-contained-marginfi-flash-loan-vulnerability/)
- **Mango v4 (Solana) health regions.**
  - `HealthRegionBegin` reads the Instructions sysvar. It forbids being called by CPI and requires a matching `HealthRegionEnd` for the same account later in the transaction.
  - It requires every instruction in between to belong to Mango and be on a whitelist: perp and Serum3/OpenBook place, cancel and settle only. Deposits and withdrawals are excluded.
  - It stores pre-region init health. `HealthRegionEnd` recomputes health and calls `check_health_post` against that stored value.
  - Source: [mango-v4 health_region.rs](https://raw.githubusercontent.com/blockworks-foundation/mango-v4/dev/programs/mango-v4/src/instructions/health_region.rs)
  - MangoAccount sizes (token, serum3, perp, perp-OO and token-conditional-swap counts) are `u8` creation parameters with on-chain resize logic. — [mango-v4 account_create.rs](https://raw.githubusercontent.com/blockworks-foundation/mango-v4/dev/programs/mango-v4/src/instructions/account_create.rs)
  - Mango Markets began winding down in January 2025 after an SEC settlement, using governance votes that raised rates and collateral requirements. — [The Block](https://www.theblock.co/post/334172/mango-markets-to-wind-down-in-wake-of-sec-settlement-dao-battle)

### Inferences

- **Netting patterns:**
  1. Single-ledger cross-margin: Hyperliquid, Drift and Mango. Every position lives in one account, and one function computes weighted equity minus weighted requirements.
  2. Modular netting through a connector: EVC and Gearbox. The account is a container, and the debt module asks each collateral module for its value.
  3. Siloed per-market accounts: Kamino obligations per market and elevation group, Aave v4 positions per Spoke.

  For Mercury (USDC cash, xStocks, earn shares, one credit line) pattern 1 inside one program is simplest and safest on Solana. All positions sit in one PDA, and one health function covers them all. External earn venues (Kamino, Jupiter Lend) are held as receipt tokens or obligation references and valued with a haircut.

- **Size the position arrays like Kamino and Drift.** Each extra position adds oracle and reserve accounts to every health check. For example: about 8 stock collateral slots, 1–2 cash/earn slots and 1 debt slot.
- **Hyperliquid's auto-borrow** (spending more than your cash automatically borrows against collateral) is the "borrow mode" UX Mercury wants for card spending. Its safeguards are worth copying: per-user borrow caps, a liquidation threshold set halfway between LTV and 1, partial liquidation in 20% steps, and a global cap after which the account falls back to non-margined behaviour.
- **Aave v4's Giver/Taker split is a strong permission template.** Modules that only add value (deposit, repay) need no allowance. Modules that take value out (withdraw, borrow, spend) need explicit per-asset allowances.

### Gaps

- Mainnet launch date for Hyperliquid portfolio margin, and the exact date unified account became the default, were not confirmed.
- Exact Mango v4 position limits, delegate restrictions and `check_health_post` semantics were not read. In particular, whether health may decrease inside a region is unknown.
- How Aave v4 aggregates one user's risk across Spokes: the docs scope positions per Spoke, and no cross-Spoke netting was found.
- Kamino Multiply internals and whether Kamino "obligation orders" (stop-loss/LTV orders) are permissionlessly executable were not confirmed.
- Zeta cross-margin design was not researched.
- marginfi's "Project 0" rebrand and the current account structure (number of balances) were not verified; the docs URL returned 404.

## Spend-against-collateral accounts: ether.fi Cash, Gnosis Pay, Plasma One, Rain, KAST, Avici, Coinbase spend permissions / ERC-7715, Solana equivalents

### Takeaway

Self-custodial card products converge on four parts:

1. A user-owned smart account.
2. A narrowly scoped "spend" permission held by the card operator: token, daily cap, and a fixed recipient (the settlement address).
3. A delay on all other outflows, so card authorisations cannot be double-spent.
4. Optionally, a debt module that lends against collateral held in the same account (ether.fi "Borrow Mode", Rain credit lines, Avici).

The Gnosis Pay exploit (June 2026) shows that the delay/permission modules become the security boundary, and a bug there drains every account.

### Cited Findings

- **ether.fi Cash v1 (repo archived 19 Feb 2026).**
  - Debit: funds flow from per-user `UserSafe` contracts to a Settlement Dispatcher.
  - Credit: users borrow from the Debt Manager against collateral in their UserSafe.
  - Mentions "spending limits, delayed withdrawals, and recovery mechanisms".
  - Source: [etherfi cash-contracts](https://github.com/etherfi-protocol/cash-contracts)
- **ether.fi Cash v3.**
  - Components: `EtherFiSafe` (multi-sig smart accounts), `CashModule` (spending/rewards), `DebtManager`, `PriceProvider`, and a permissionless `SettlementDispatcher` between on-chain and off-chain systems.
  - Audits by Certora and Nethermind.
  - Tests deploy an Aave v4 instance for lending, against an Optimism fork.
  - Source: [etherfi cash-v3](https://github.com/etherfi-protocol/cash-v3)
- **ether.fi modes and scale (secondary sources).**
  - Direct Pay works like debit, drawing from the vault at purchase. In Borrow Mode, ether.fi borrows USDC for the user from a lending pool against staked ETH and pays the merchant. — [HackerNoon](https://hackernoon.com/lang/ja/can-you-spend-crypto-without-selling-it-inside-the-etherfi-cash-cards-never-sell-revolution)
  - CASH passed $800M total spend, $600M of it in 2026, and reportedly migrated to OP Mainnet in February 2026. — [Crypto Briefing](https://cryptobriefing.com/ether-fi-cash-exceeds-800m-spend/)
  - Older sources say Scroll, so the chain is a conflict between sources.
  - A troubleshooting guide cites a $5k daily card limit and a $10k vault daily limit, and Borrow Mode declines when collateral ratio falls. — [kkinvesting](https://kkinvesting.io/zh/posts/etherfi-card-transaction-declined/)
  - Other reviews cite $30k–$100k per day. Limits are unverified.
  - An Aave governance proposal describes liquidation triggers for a US credit product, including non-payment 21 days after due date. This is a proposal, not final terms. — [Aave governance: ether.fi Cash ARFC](https://governance.aave.com/t/arfc-aave-and-ether-fi-cash-a-proposal-for-real-world-utility/21909/4)
- **Gnosis Pay architecture.**
  - Each user gets a Safe with Delay, Roles and Bouncer modules. The Safe's owner is set to an inaccessible address, and the user's EOA becomes an indirect owner via the Delay Module.
  - The Roles module defines the spendable token, a daily limit, the recipient (an issuer-owned Safe used to settle with Visa) and the role holder. Users can change the daily limit without Gnosis Pay's permission.
  - The Delay module adds a 3-minute wait to non-card outgoing transactions, and pauses the card while a transaction is queued, to prevent double spending.
  - Source: [Gnosis Pay docs (search summary; page 404 on fetch)](https://docs.gnosispay.com/account); [Gnosis Pay help](https://help.gnosispay.com/en/articles/8464758-how-is-the-gnosis-card-self-custodial)
  - A community guide says the issuer settles with Visa off-chain using the funds in the Issuer Safe at the end of every business day. — [Gnosis research guide](https://paragraph.xyz/@gnosis-research/an-in-depth-guide-to-how-gnosis-pay-works-%F0%9F%A6%89%F0%9F%92%B3)
- **Gnosis Pay exploit, 1 June 2026: what happened.**
  - ERC-1271 signature validation in the Zodiac Delay/Roles modules read the return value of a `staticcall` but did not check that the call succeeded.
  - An attacker contract that reverts with the magic value as revert data was accepted as a valid signature. This let the attacker queue withdrawals from Safes they did not own.
  - The bug was introduced in Zodiac 3.4.0 (30 October 2023, commit 9a9e380).
  - Source: [Gnosis Pay post-mortem](https://gnosispay.com/blog/post-mortem-gnosis-pay-vulnerability-exploit)
- **Gnosis Pay exploit: losses and response.**
  - About $1.5M taken and about $300k made inaccessible, across 5,281 wallets holding at least $1. Gnosis covered the losses.
  - Card services went offline, new modules were deployed 4–7 June after a ChainSecurity review, and service returned for 99% of users by 6 June.
  - Source: [Gnosis Pay post-mortem](https://gnosispay.com/blog/post-mortem-gnosis-pay-vulnerability-exploit)
- **Gnosis Pay exploit: Verichains analysis.**
  - The call path was `Delay.execTransactionFromModule()` → `moduleTxSignedBy()`, which parsed attacker-appended bytes after the ABI arguments as signature material, then `_isValidContractSignature()` with the unchecked `staticcall`.
  - A fix landed silently in the separate `zodiac-core` line on 27 Feb 2026 (v4.0.0-alpha.0). Deployed instances still compiled against the legacy `@gnosis.pm/zodiac` package.
  - Verichains reports about $265K lost. This conflicts with the official $1.5M figure.
  - Source: [Verichains](https://blog.verichains.io/p/gnosis-pay-exploit-the-devs-discovered)
- **Coinbase SpendPermissionManager (SPM).**
  - A singleton added as an owner of the user's Coinbase Smart Wallet.
  - The `SpendPermission` struct holds `account, spender, token (ERC-7528 native or ERC-20), allowance (uint160), period (uint48 seconds), start, end, salt, extraData`.
  - `spend` can only be called by the spender, and transfers from the account to the spender. `approveWithSignature` is ERC-6492 compatible, so it works for undeployed accounts. `revoke` / `revokeAsSpender` disable a permission permanently.
  - Sources: [CDP: SpendPermissionManager](https://docs.cdp.coinbase.com/coinbase-wallet/reference/onchain-contracts/spend-permissions.md); [coinbase/spend-permissions](https://github.com/coinbase/spend-permissions)
- **SPM spend path, audits and deployments.**
  - Spends bypass the ERC-4337 EntryPoint, so paymasters cannot spend user tokens.
  - Audited by Spearbit/Cantina (private Oct and Dec 2024, public competition Nov 2024). A new SpendRouter was audited in March 2026.
  - Deployed at `0xf852…67Ad` on Base, Ethereum, Optimism, Arbitrum, Polygon and others.
  - Source: [coinbase/spend-permissions](https://github.com/coinbase/spend-permissions)
- **ERC-7715.** It adds `wallet_grantPermissions` and is still Draft. It relies on ERC-7710 (`delegationManager`) on the contract side. MetaMask supports it via its Delegation Toolkit (Flask 13.5.0+). — [MetaMask: ERC-7715](https://docs.metamask.io/delegation-toolkit/concepts/erc7715); [ERC-7715 draft diff](https://github.com/ethereum/ERCs/pull/436.diff)
- **Rain.**
  - Customers keep stablecoins in a smart contract they own. Rain extends a credit line against it, fronts fiat to merchants, and settles from the collateral. — [Sacra: Rain](https://sacra.com/c/rain/) (AI-generated summary of company material)
  - Rain tokenized its card receivables and moved all Visa settlement to USDC (May 2025 release). — [Rain/Visa press release](https://www.streetinsider.com/PRNewswire/Rain+and+Visa+Partner+to+Accelerate+Onchain+Credit+Cards/24723342.html)
  - Visa redeems from Circle daily in USDC. — [Solana Foundation, 2 Mar 2026](https://solana.com/news/how-cards-became-the-trojan-horse-for-stablecoin-adoption)
- **Plasma One.**
  - Every balance, payment, transfer and card transaction runs through the user's Privy-powered embedded wallet. — [Privy blog](https://privy.io/blog/building-a-stablecoin-native-neobank-from-the-ground-up-with-plasma-one)
  - The card is issued by Rain. — [Decrypt](https://decrypt.co/340659/plasma-to-launch-stablecoin-native-neobank-after-this-months-mainnet-beta)
  - A competitor review (mid-2026) says it is still invite-only. — [Bleap](https://www.bleap.finance/blog/plasma-one-review)
- **KAST and Avici (Solana).**
  - KAST is described as a custodial prepaid Visa on Solana. Stablecoins are converted to a USD balance held by KAST. — [Bleap KAST review](https://bleap.finance/blog/kast-card-review) (competitor source)
  - Avici is described as a self-custodial Solana app with a passkey-secured, account-abstracted wallet and a Visa credit line collateralised by deposits. — [The Grid: Avici](https://thegrid.id/profiles/avici); [MadeOnSol](https://madeonsol.com/compare/avici-vs-stably) (directory sources)

### Inferences

- **Two architectures for Mercury's Bridge card.**
  - (a) Gnosis Pay / Coinbase SPM style: the account grants the card program a "spend up to X per period, only to settlement address S, only token USDC" permission, plus a short delay on all other outflows so authorised-but-unsettled card spend stays covered.
  - (b) Rain / ether.fi Borrow Mode style: settlement draws USDC from cash first, then borrows against xStocks via the debt module, with the health check run at settlement.

  Both can run in one Mercury program: a `settle_card` instruction that pulls cash, then auto-borrows (Hyperliquid-style), with destination pinned to the Bridge settlement vault and a per-period cap.

- **Pre-funding and authorisation gap.**
  - Card networks authorise in real time but settle later (end of business day in Gnosis Pay's case). The account therefore needs an "authorised hold" balance or delay so the user cannot withdraw between authorisation and settlement.
  - Gnosis Pay solves this with a 3-minute delay and pausing the card while a withdrawal is queued.
  - On Solana, an equivalent is a `pending_card_holds` field on the account, counted as a liability in the health check and set by the card-auth service through a scoped role.
- **Lessons from Gnosis Pay.**
  - Modules that can queue transactions are owner-equivalent.
  - Signature-verification paths and fallback handlers are the weakest link.
  - Dependency forks can strand fixes.

  For Mercury on Solana, this argues for permissions enforced by Mercury's own program logic, checked on every instruction, rather than generic, upgradeable third-party module frameworks. If Swig or Squads is used, pin and monitor versions.

- **Custody spectrum among Solana card products:** KAST is custodial. Avici and Mercury's plan are self-custodial. Mercury's distinguishing feature would be xStocks as card collateral, which no surveyed Solana card was found to offer.

### Gaps

- Official ether.fi Cash docs for Safe owner/threshold, spend-limit enforcement, withdrawal delay length, liquidation parameters and current chain were not retrieved.
- Gnosis Pay docs pages returned 404 on direct fetch, so architecture details come from search summaries.
- Rain's smart-contract code and audits were not found.
- Avici's and KAST's on-chain architecture (which smart-account program, how the credit line is enforced) was not found from primary sources.
- Bridge-specific card settlement mechanics were not researched here.

## Solana implementation patterns: program-owned PDA account vs smart account vs wallet-held assets; delegates/operators; CPI depth, transaction size, ALTs, locks and parallelism, rent; who has built cross-margin on Solana and lessons

### Takeaway

On Solana, the robust pattern for "one account, many modules, one health check" is a single program that owns a per-user PDA, holding both the position ledger and the token accounts, with modules implemented as instructions of that same program. The alternative (a smart account such as Swig or Squads CPI-ing into several protocol programs) runs into CPI-depth, account-count and atomic-health-check problems. Recent runtime changes (as of October 2026) help but do not remove the need for compact designs:

- v1 4,096-byte transactions are live, but have no ALTs and a 64-account cap.
- 100M CU blocks.
- Rent cut to 5,080 lamports/byte.
- CPI depth 8 is still not activated on mainnet.

### Cited Findings

- **CPI depth (SIMD-0268).** Raises nested CPI from 4 to 8, so max stack height goes from 5 to 9. Mainnet activation is expected "after Agave 4.4, date to be determined" and gated on SIMD-0219. It is already on by default in `solana-test-validator`. — [Solana upgrades: CPI nesting depth](https://solana.com/upgrades/cpi-nesting-depth)
- **Larger transactions (SIMD-0296 / SIMD-0385, page updated September 2026).**
  - v1 transactions went live on mainnet on 15 September 2026 (epoch 1035). Max size is 4,096 bytes, up from 1,232.
  - Version byte 129. Compute and priority fee settings move into a header config, and ComputeBudget instructions become no-ops.
  - No address lookup tables. Up to 64 accounts listed inline. SIMD-0596 (draft) would raise this to 96.
  - Resource limits default to zero and must be set. Transactions over 1,232 bytes must be base64.
  - Source: [Solana upgrades: larger transactions](https://solana.com/upgrades/larger-transaction-sizes)
- **Block limits (SIMD-0286).** Max CU per block went from 60M to 100M on 29 July 2026 (epoch 1009). Max writable-account CU per block stays at 12M. — [Solana upgrades: 100M CU blocks](https://solana.com/upgrades/100m-cu-blocks)
- **Rent (SIMD-0437).**
  - The rent rate is being cut from 6,960 to 696 lamports/byte in five steps.
  - Steps 1 (3 Sept 2026) and 2 (11 Sept 2026) are live, so the current rate is 5,080 lamports/byte. Steps 3–5 are expected with Agave 4.4 (November 2026).
  - Rent-exempt minimum = (128 + data_len) × lamports_per_byte. A token account now needs 1,488,440 lamports instead of 2,039,280.
  - SIMD-0438 can reset the rate.
  - Sources: [Chainstack](https://docs.chainstack.com/docs/solana-rent-reduction-reclaim-excess-rent); [Solana Compass](https://solanacompass.com/news/simd-0437-step-1-goes-live-on-solana-mainnet-beginning-a-five-phase-rent-reduction)
- **SPL token delegate.** "A token account stores one current delegate and one delegated amount at a time." Approving a new delegate replaces the old one. — [Solana docs: approve delegate](https://solana.com/docs/tokens/basics/approve-delegate)
- **Swig.**
  - A config account stores roles, and a separate wallet address signs. Each role pairs one authority (Ed25519, secp256k1, secp256r1/passkey, or another program, each with a session variant) with actions.
  - Actions include: full access, SOL/token spend limits (optionally recurring), destination-scoped limits, program allowlists/"program scopes", program-scoped balance tracking, staking limits, and sub-accounts that hold their own funds.
  - Rules are checked on-chain every transaction.
  - Audits: Accretion (2025), Halborn (August 2026).
  - Program `swigypWHEksbC64pWKwah1WTeh9JXwx8H1rJHLdbQMB`.
  - Source: [Swig GitHub](https://github.com/anagrambuild/swig-wallet)
- **Squads Smart Account Program (v0.1).**
  - Rent-free wallet creation (about 0.0000025 SOL, rent deferred until execution), atomic policy checking and execution, custom policy programs, archivable accounts.
  - Audited by OtterSec and Certora (with formal verification).
  - The README warns that a compromised `settings_authority` can change thresholds and members, and that long time-locks can lock funds.
  - Program `SMRTzfY6DfH5ik3TKiyLFfXexV8uSG3d2UksSCYdunG`.
  - Source: [Squads smart-account-program](https://github.com/Squads-Protocol/smart-account-program)
  - Squads Grid spending limits support ONE_TIME/DAILY/WEEKLY/MONTHLY periods, destination allowlists and designated signers. — [Squads Grid: spending limits](https://developers.squads.so/grid/v1/api-reference/endpoint/spending-limits/post.md)
- **Privy policies.**
  - Rules are evaluated off-chain at signing time. DENY beats ALLOW, and the default is DENY. Solana rules can allowlist `programId` and cap SOL transfer amounts.
  - Session signers are key quorums that can request signatures, each with its own policy and no fallback to other signers' policies.
  - Sources: [Privy policies](https://docs.privy.io/controls/policies/overview); [Privy Solana policy examples](https://docs.privy.io/controls/policies/example-policies/solana); [Privy key quorums](https://docs.privy.io/controls/key-quorum/overview)
- **Solana-native deferred health checks.**
  - Mango v4 `HealthRegionBegin/End`: introspection, no CPI, whitelist of inner instructions, compare pre/post health. — [mango-v4 health_region.rs](https://raw.githubusercontent.com/blockworks-foundation/mango-v4/dev/programs/mango-v4/src/instructions/health_region.rs)
  - marginfi `start/end_flashloan`: introspection, health skipped mid-loan, `end` cannot be CPI. — [Asymmetric Research](https://asymmetric.com/threat-contained-marginfi-flash-loan-vulnerability/)
  - Kamino flash borrow/repay pairing, no CPI, one per transaction. — [klend flash loans](https://mintlify.wiki/kamino-finance/klend/advanced/flash-loans)
- **Cross-margin on Solana: Drift.** Cross-margin over spot and perps, with 8 spot + 8 perp positions per sub-account. — [drift-rs User](https://mintlify.wiki/drift-labs/drift-rs/api/accounts/user)
- **Drift exploit, 1 April 2026: how admin was taken.**
  - About $285M lost from about $309M TVL.
  - Admin was a Squads v4 multisig with a 2/5 threshold and a zero-second timelock.
  - The attacker obtained misrepresented pre-signatures, stored them via durable nonces, then executed `UpdateAdmin`.
  - Source: [4Pillars](https://research.4pillars.io/en/research/reflections-on-the-drift-protocol-exploit)
- **Drift exploit: how funds were drained.**
  - With the admin key, the attacker listed a fake token (CVT) via `initializeSpotMarket` with an attacker-controlled Switchboard oracle and maximum asset weights.
  - They raised `updateWithdrawGuardThreshold` to about 500 trillion across markets, deposited CVT and borrowed out real assets.
  - "The margin system worked as designed, but every input had been manipulated."
  - Source: [4Pillars](https://research.4pillars.io/en/research/reflections-on-the-drift-protocol-exploit)
  - Attribution to North Korean actors is reported but unconfirmed. Loss figures range from $270M to $285M. — [TRM Labs](https://trmlabs.com/resources/blog/north-korean-hackers-attack-drift-protocol-in-285-million-heist)
- **Cross-margin on Solana: Mango (October 2022).** The attacker pumped MNGO about 13-fold in 30 minutes on the exchanges feeding the oracle, then borrowed against inflated perp value. Losses were over $110M. — [CFTC release 8647-23](https://www.cftc.gov/PressRoom/PressReleases/8647-23)

### Inferences

- **Option A, recommended baseline: program-owned per-user PDA.**
  - Mercury program P owns `MercuryAccount` PDA (seeds: owner, sub-account index). It holds the position ledger and holds token accounts (USDC ATA, xStock Token-2022 ATAs, earn receipt tokens) whose authority is the PDA.
  - Modules (earn, credit line, spend/card settlement, baskets) are instructions of P. Each ends with the same health function, or runs inside a Mango-style begin/end region with a whitelist.
  - The user authenticates with their Privy wallet. The relayer is only fee payer.
  - Delegates are a per-account list of {pubkey, permission bitmask, per-period caps, destination pin, expiry}, modelled on Gearbox bot permissions, EVC operator bitfields, Aave Giver/Taker and Coinbase SPM.
  - Pros: one atomic health check, one CPI hop to external venues, assets cannot leave except through P's code paths, and whole-account liquidation is possible.
  - Cons: P's upgrade authority holds every user's assets (see the security section), and external composability requires P to wrap each venue.
- **Option B: smart account (Swig/Squads) holds assets and CPIs into modules.**
  - Flexible, but health becomes a cross-program property. No single program sees all positions unless every module reports into a registry, which re-creates the EVC.
  - Each hop costs CPI depth. With the current 4-level nesting limit, a chain such as smart account → Mercury → Jupiter Lend/Kamino → token program can approach or hit the cap: top-level counts as height 1, and 4 nested hops are allowed until SIMD-0268 activates.
  - Swig and Squads are best used as the user's signer and policy layer in front of Option A (passkeys, session keys, spend limits), not as the container for positions.
- **Option C: assets in the user's wallet, protocol tracks positions only (Kamino/marginfi style).**
  - Simplest for earn and borrow.
  - Spend-against-collateral cannot be enforced without token delegates. Only one delegate is allowed per token account, which conflicts with other apps and with Privy-controlled wallets.
  - Borrowed funds leave protocol control, so the Gearbox advantage is lost.
- **Hybrid that fits Mercury.** Cash and stocks live in the Mercury Account PDA (Option A). Privy embedded wallet plus optional Swig roles sign user intents. Privy policies serve only as an off-chain extra layer: they are evaluated by Privy, not enforced on-chain.
- **Transaction budget.**
  - With v1 transactions there are no ALTs and a 64-account cap. A health check over 8 xStocks needs each oracle account plus reserves/obligations for external earn positions, plus mints for Token-2022 transfers.
  - So: keep a compact on-chain price cache, or a single aggregated oracle account updated by a pusher, to cut account count. Use v0 + ALTs when more accounts are needed and v1 when payload size (signatures, ZK proofs) matters.
- **Parallelism.**
  - Per-user PDAs parallelise well. Avoid writing global accounts (pool totals, a global config) on every spend or earn instruction.
  - The 12M CU per writable account per block cap means a single hot pool or settlement vault written by every card settlement becomes a bottleneck. Shard settlement vaults or batch settlements.
- **Rent.** A 1,000-byte account costs (128+1,000)×5,080 = 5,730,240 lamports, about 0.0057 SOL, at today's rate. At the final 696 rate it is about 0.00079 SOL. Relayer-paid rent is cheap and falling, and is reclaimable on close.
- **Lessons from Solana cross-margin.**
  - Mango 2022 and Drift 2026 were not health-check math bugs. They were input failures: a manipulable oracle in 2022, and admin-listed fake collateral plus a disabled withdrawal guard in 2026.
  - For xStocks collateral, Mercury needs per-asset caps, conservative weights, oracle sanity bounds (for example, outside market hours), and listing and weight changes behind long timelocks.

### Gaps

- Mainnet date for SIMD-0268 (CPI depth 8) is not set. Confirmation that SIMD-0219 is a blocker came only from the upgrade page.
- The current per-transaction account-lock limit for v0 transactions with ALTs was not confirmed in this research.
- Exact CU cost of a 10-position health check with Token-2022 xStocks (including any transfer-hook or scaled-UI-amount extension overhead) was not found.
- Whether Backed xStocks' Token-2022 configuration includes a permanent delegate or pausable extension, which would affect PDA custody and liquidation, was not verified here.
- Zeta's cross-margin design and incidents were not researched.

## Security of account-level designs: operator/permission abuse, health-check bypass via new instructions, module bugs, admin upgrade risk, and blast-radius limits

### Takeaway

Across the surveyed incidents, the recurring failure classes are:

1. A new or edge-case instruction changes balances without passing through the health check (Euler 2023, marginfi 2025).
2. A permission or module layer accepts forged authorisation (Gnosis Pay 2026).
3. Admin powers over listings, oracles and limits with no timelock (Drift 2026).
4. Oracle or input manipulation that the health check faithfully accepts (Mango 2022, Drift 2026).

Blast radius is limited by isolating accounts, scoping and capping delegations, giving users an emergency lockdown, and putting timelocks and caps on admin actions.

### Cited Findings

- **Euler v1, 13 March 2023.**
  - `donateToReserves()` lacked a solvency check. The attacker flash-borrowed, built a self-leveraged position, donated 100M eDAI to make the account insolvent, then self-liquidated at a discount for profit.
  - About $197M lost, later recovered. TVL fell from $264M to $10M.
  - Sources: [BlockSec](https://blocksec.com/blog/euler-finance-incident-the-largest-hack-of-2023); [Cyfrin](https://www.cyfrin.io/blog/how-did-the-euler-finance-hack-happen-hack-analysis)
  - Hacken identifies a second health-score flaw as well. — [Hacken](https://hacken.io/discover/euler-finance-hack/)
  - Loss figures vary from $196M to $200M across sources.
- **marginfi, disclosed September 2025.** A new `transfer_to_new_account` instruction did not check `ACCOUNT_IN_FLASHLOAN`. An attacker could start a flash loan, borrow the maximum, move liabilities to a new account, end the flash loan on the now-empty account (passing health) and never repay. More than $160M in deposits was at risk, nothing was lost, and the fix (commit 67ab029) blocks transfers during flash loans. — [Asymmetric Research](https://asymmetric.com/threat-contained-marginfi-flash-loan-vulnerability/); [Blockworks](https://blockworks.co/news/marginfi-flash-loan-bug)
- **Gnosis Pay, 1 June 2026.** An unchecked `staticcall` success flag in ERC-1271 verification inside the Zodiac Delay module let attacker-queued withdrawals through. A 2023 library change stayed in production after the fix landed only in a forked package. — [Gnosis Pay post-mortem](https://gnosispay.com/blog/post-mortem-gnosis-pay-vulnerability-exploit); [Verichains](https://blog.verichains.io/p/gnosis-pay-exploit-the-devs-discovered)
- **Drift, 1 April 2026: admin takeover.** A 2/5 Squads multisig with no timelock was captured through durable-nonce pre-signed transactions. — [4Pillars](https://research.4pillars.io/en/research/reflections-on-the-drift-protocol-exploit)
- **Drift: recommended controls.**
  - At least 48h timelocks on `UpdateAdmin` and `InitializeSpotMarket`.
  - Capped weights for newly listed collateral, with separate timelocks for weight changes.
  - Bounded withdrawal-guard thresholds.
  - Human-readable signing, plus real-time alerts and automatic pauses on admin transfers, multisig rotations and new market registrations.
  - Source: [4Pillars](https://research.4pillars.io/en/research/reflections-on-the-drift-protocol-exploit)
- **EVC built-in blast-radius controls.**
  - Lockdown mode: only operator and nonce management allowed, external calls blocked, liquidation still allowed.
  - Permit-disabled mode.
  - Nonce-namespace invalidation.
  - Operators can only remove themselves.
  - Only the controller can release itself.
  - Sources: [EVC whitepaper](https://github.com/euler-xyz/ethereum-vault-connector/blob/master/docs/whitepaper.md); [IEVC](https://raw.githubusercontent.com/euler-xyz/ethereum-vault-connector/master/src/interfaces/IEthereumVaultConnector.sol)
- **Gearbox built-in controls.**
  - Governance can forbid bots.
  - Forbidden tokens block new debt and withdrawals.
  - Safe pricing (minimum of two feeds) applies on withdrawals.
  - Same-block debt changes are blocked.
  - Borrowing halts after a loss.
  - Sources: [Gearbox Bots](https://dev.gearbox.finance/core/bots); [ICreditFacadeV3Multicall.sol](https://raw.githubusercontent.com/Gearbox-protocol/core-v3/main/contracts/interfaces/ICreditFacadeV3Multicall.sol); [Gearbox Liquidations](https://dev.gearbox.finance/core/liquidation)
- **Aave v4 controls.** Position managers must be governance-registered and user-enabled, and take-type actions need per-reserve allowances. — [Aave v4 Position Managers](https://aave.com/docs/aave-v4/positions/managers)
- **Squads controls.** The README flags `settings_authority` compromise as a full takeover risk for thresholds and members. — [Squads smart-account-program](https://github.com/Squads-Protocol/smart-account-program)

### Inferences

- **Health-check bypass is the top risk for a modular Mercury Account.** Every new module instruction is a potential "donateToReserves" or "transfer_to_new_account". Mitigations:
  - (i) A single choke-point: all handlers return through one `finalize(account)` that runs health and invariants. CI should fail if any instruction that mutates `MercuryAccount` skips it.
  - (ii) If using a deferred-check region, use Mango's whitelist approach (only explicitly allowed inner instructions) rather than marginfi's "skip all checks while flag set".
  - (iii) Block account transfer, close or migrate while in a region or flash state.
  - (iv) Fuzz invariants such as "no instruction sequence ends with lower health and more outflow" across all instructions.
- **Bounding operator and delegate abuse.** Each delegate (card settlement service, auto-earn keeper, relayer, AI agent) gets the smallest bitmask needed, plus:
  - per-period caps (Coinbase SPM `allowance`/`period`);
  - destination pinning (Gnosis Roles recipient = settlement Safe);
  - expiry;
  - and "Giver" actions (deposit/repay) separated from "Taker" actions (withdraw/borrow/spend) as in Aave v4.

  Add a user-triggered lockdown that cancels all delegations except liquidation and repayment, as in EVC lockdown.

- **Bounding admin and upgrade risk.**
  - Program upgrades, oracle changes, new collateral listings and weight increases go behind a meaningful timelock: Drift lesson ≥48h; for xStocks, longer is reasonable. Use a higher multisig threshold with hardware or air-gapped signing.
  - Never rely on durable-nonce pre-signing for privileged actions.
  - Hard-code ceilings, such as maximum collateral weight for new assets and a maximum per-epoch outflow per asset, that the admin cannot lift instantly.
  - Consider making the account-custody core immutable or slow-upgradable, with modules upgraded separately, so that a module upgrade cannot move funds out of PDAs without passing the immutable core's health and permission checks.
- **Dependency risk.** If Mercury builds on Swig or Squads for user signing, it inherits their bug surface, as Gnosis Pay did with Zodiac. Pin audited versions, monitor upstream security fixes, and keep Mercury's own spend caps in Mercury's program so a smart-account bug cannot exceed them.

### Gaps

- No public incident data was found for Swig or the Squads Smart Account Program (as opposed to Squads v4 multisig misuse in Drift).
- How Euler v2 has fared post-launch (incidents, if any) was not researched.
- No source quantified how often per-user isolation (Gearbox, EVC sub-accounts) actually contained losses in practice, compared with shared-pool designs.
