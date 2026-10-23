# Trade Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every sponsored stock trade runs through Mercury's own `mercury_router` program, which takes the fees into a timelocked vault and emits a `TradeFilled` event the server settles from, with or without the app's confirm.

**Architecture:** An Anchor 1.2.1 program puts `open_trade` and `close_trade` around Jupiter's swap instructions in one transaction (never calling Jupiter itself), checks balances and pairing through the instructions sysvar, and holds no user funds. The API builds routed transactions when `ROUTER_PROGRAM_ID` is set and falls back to today's path when the router is paused, unset, or the transaction is too large. A `router-fills` job reads the program's transactions and settles any order the app did not confirm.

**Tech Stack:** Rust, Anchor 1.2.1 (`event-cpi`), anchor-spl 1.2.1, LiteSVM 0.18.1, Agave 4.3 (`cargo build-sbf`), TypeScript, `@solana/kit` 2.3.0, vitest, Hono.

**Spec:** `docs/superpowers/specs/2026-10-21-trade-router-design.md`

## Global Constraints

- The program never holds a user's funds. It moves only fees: the network fee to the relayer's USDC account, Mercury's fee to the fee vault.
- Hard limits live in code: `MAX_FEE_RATE = 10_000` (hundredths of a basis point, so 1%); the allowlist between open and close is exactly Jupiter v6 `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`, the ATA program and the compute-budget program; one trade pair per transaction.
- No cap on the network fee in the program. The relayer's server sets it.
- Buys: Mercury's fee is the amount the server computed (`buy_fee`), at most `floor(gross_in × fee_rate / 1_000_000)`; the user is never debited more than `gross_in`. Sells: the fee is `floor(got × fee_rate / 1_000_000)` of what actually arrived; the ticket reads "Mercury fee (0.5% of proceeds) ≈ $X".
- Roles: admin (a 2-of-3 Squads multisig with a 48-hour timelock, configured in Squads, not here) may upgrade, change the relayer account and the guardian, propose a treasury, withdraw to the treasury and unpause; a proposed treasury goes live only when the key that owns it signs `accept_treasury`; the guardian may only pause. No server key has power over the program or vault.
- Events use `emit_cpi!`. Readers trust only router inner instructions whose first account is the router's event authority.
- Today's trade path (`composeSponsored` with a USDC charge) stays for good as the fallback.
- When the router is configured, Jupiter quotes use `maxAccounts=40`.
- Transaction readers request `maxSupportedTransactionVersion: 255`.
- Never commit a keypair. `programs/keys/` and `programs/target/` are git-ignored.
- Referral payouts are out of scope. `affiliate` is always `0` for now.
- Comments and test names follow the repo's voice: plain sentences saying what happens and why.

## File Structure

```
programs/                         Cargo workspace for on-chain code
  Cargo.toml                      workspace: router, mock-swap
  .cargo/config.toml              target-dir = "target" (so tests find the .so)
  router/
    Cargo.toml
    src/lib.rs                    instructions and account structs
    src/constants.rs              addresses, caps, seeds
    src/error.rs                  RouterError
    src/state.rs                  Config
    src/token.rs                  token-account and multiplier readers, fee arithmetic (pure)
    src/pairing.rs                OpenArgs, close_follows, open_precedes
    tests/common/mod.rs           LiteSVM harness
    tests/admin.rs                initialize, pause, keys
    tests/trade.rs                buys, sells, refusals
    tests/withdraw.rs             withdrawals
  mock-swap/                      TEST ONLY: stands in for Jupiter at Jupiter's address
    Cargo.toml
    src/lib.rs
packages/chain/src/ports.ts       TransactionDetail.innerInstructions
packages/chain/src/solana/rpc.ts  parse inner instructions
packages/chain/src/jupiter/lite.ts maxAccounts
services/api/src/router/
  program.ts                      discriminators, PDAs, constants, fee arithmetic
  instructions.ts                 open/close instruction encoders, uuid bytes
  event.ts                        TradeFilled decoder
  trade.ts                        routed-trade fields from an order
  deps.ts                         RouterBuildDeps from config
services/api/src/relay/build.ts   routed path with size fallback
services/api/src/orders/fill.ts   fillFromEvent
services/api/src/orders/settle.ts record mercury_fee_usd from the fill
services/api/src/orders/confirm.ts shared confirm logic (route and job)
services/api/src/orders/router-fills.ts the router-fills job
services/api/src/app.ts           execute passes routed fields; confirm calls confirmOrder
services/api/src/deps.ts          ROUTER_* config, maxAccounts, ReadDeps.router
services/api/src/index.ts         router deps, the router-fills job, job table
docs/adr/0018-trade-router.md     the decision and the deploy runbook
.github/workflows/program.yml     build and test the program
```

---

### Task 1: Program workspace, config and roles

**Files:**

- Create: `programs/Cargo.toml`, `programs/.cargo/config.toml`, `programs/router/Cargo.toml`, `programs/router/src/{lib.rs,constants.rs,error.rs,state.rs}`, `programs/router/tests/common/mod.rs`, `programs/router/tests/admin.rs`, `.github/workflows/program.yml`
- Modify: `.gitignore`, `.prettierignore`

**Interfaces:**

- Produces: program `mercury_router` with `initialize(admin, guardian, relayer_usdc, treasury)`, `set_paused(paused)`, `set_guardian(guardian)`, `set_relayer_usdc(relayer_usdc)`, `set_treasury(treasury)`, `accept_treasury()`; `state::Config { admin, guardian, relayer_usdc, treasury, pending_treasury, fee_vault, paused, bump, vault_bump }`; seeds `CONFIG_SEED = b"config"`, `VAULT_SEED = b"vault"`; `RouterError` codes 6000 `Paused`, 6001 `FeeTooHigh`, 6002 `BadArgs`, 6003 `StaleBalance`, 6004 `Unpaired`, 6005 `Forbidden`, 6006 `Slippage`, 6007 `Overspent`, 6008 `BadAccount`, 6009 `Unauthorized`; harness `common::Env`.

- [ ] **Step 1: Generate the program key (never committed)**

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
mkdir -p programs/keys
solana-keygen new --no-bip39-passphrase --silent -o programs/keys/mercury_router-keypair.json
solana-keygen pubkey programs/keys/mercury_router-keypair.json
```

Put the printed pubkey in `declare_id!` below. Store the keypair file in the team's secret store; it claims the program address at first deploy.

- [ ] **Step 2: Workspace and ignore rules**

`programs/Cargo.toml`:

```toml
[workspace]
members = ["router"]
resolver = "2"

[profile.release]
overflow-checks = true
lto = "fat"
codegen-units = 1
```

`programs/.cargo/config.toml`:

```toml
# Pinned so the tests always find target/deploy/*.so, whatever the machine's cargo config says.
[build]
target-dir = "target"
```

Append to `.gitignore`:

```
# On-chain programs: build output and keypairs never go in the repo.
programs/target/
programs/keys/
```

Append to `.prettierignore`:

```
programs/target
```

`programs/router/Cargo.toml`:

```toml
[package]
name = "mercury-router"
version = "0.1.0"
edition = "2021"
description = "Mercury's trade router: fees and a TradeFilled event around a Jupiter swap"

[lib]
crate-type = ["cdylib", "lib"]
name = "mercury_router"

[features]
default = []
cpi = ["no-entrypoint"]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]
anchor-debug = []
custom-heap = []
custom-panic = []

[dependencies]
anchor-lang = { version = "=1.2.1", features = ["event-cpi"] }
anchor-spl = { version = "=1.2.1" }

[dev-dependencies]
litesvm = "=0.18.1"
```

Then add the Solana client crates the tests use, at the versions LiteSVM 0.18.1 already resolves, so there is one copy of each type:

```bash
cd programs && cargo tree -p litesvm --depth 1 | grep -E "solana-(keypair|signer|transaction |account )"
```

and add `solana-keypair`, `solana-signer`, `solana-transaction`, `solana-account` to `[dev-dependencies]` with exactly those versions.

- [ ] **Step 3: Constants, errors, state**

`programs/router/src/constants.rs`:

```rust
use anchor_lang::prelude::*;

pub const JUPITER_V6: Pubkey = pubkey!("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
pub const ATA_PROGRAM: Pubkey = pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
pub const COMPUTE_BUDGET: Pubkey = pubkey!("ComputeBudget111111111111111111111111111111");
pub const TOKEN_PROGRAM: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const TOKEN_2022_PROGRAM: Pubkey = pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
pub const INSTRUCTIONS_SYSVAR: Pubkey = pubkey!("Sysvar1nstructions1111111111111111111111111");
pub const USDC_MINT: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

/// 1% in hundredths of a basis point. A friend's discounted 37.5 bps is a whole 3750.
pub const MAX_FEE_RATE: u32 = 10_000;
pub const RATE_DENOMINATOR: u128 = 1_000_000;

pub const SIDE_BUY: u8 = 0;
pub const SIDE_SELL: u8 = 1;
pub const EVENT_VERSION: u8 = 1;

pub const CONFIG_SEED: &[u8] = b"config";
pub const VAULT_SEED: &[u8] = b"vault";
```

`programs/router/src/error.rs`:

```rust
use anchor_lang::prelude::*;

#[error_code]
pub enum RouterError {
    #[msg("The router is paused")]
    Paused,
    #[msg("Fee above the hard maximum")]
    FeeTooHigh,
    #[msg("Bad arguments")]
    BadArgs,
    #[msg("A claimed balance is not the real one")]
    StaleBalance,
    #[msg("Open and close do not pair")]
    Unpaired,
    #[msg("A program that is not allowed runs between open and close")]
    Forbidden,
    #[msg("Received less than the minimum")]
    Slippage,
    #[msg("Spent more than the user agreed to")]
    Overspent,
    #[msg("Not the expected token account")]
    BadAccount,
    #[msg("Not allowed to do this")]
    Unauthorized,
}
```

`programs/router/src/state.rs`:

```rust
use anchor_lang::prelude::*;

/// Read on every trade, written only by admin actions, so trades never contend for it.
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// The Squads vault. Its 48-hour timelock is Squads configuration, not ours.
    pub admin: Pubkey,
    /// May pause, and nothing else.
    pub guardian: Pubkey,
    /// Where the network fee goes: the relayer's USDC account.
    pub relayer_usdc: Pubkey,
    /// The only USDC account fees can be withdrawn to: a Squads vault's, or a hot payout wallet's.
    /// Default (nothing) until the first one is accepted.
    pub treasury: Pubkey,
    /// Proposed by the admin, live once its owner accepts. A configured address can be one nobody
    /// holds the key for (ADR 0015); a signature from the owner proves somebody does.
    pub pending_treasury: Pubkey,
    /// The USDC account owned by the vault PDA.
    pub fee_vault: Pubkey,
    pub paused: bool,
    pub bump: u8,
    pub vault_bump: u8,
}
```

- [ ] **Step 4: The program with admin instructions**

`programs/router/src/lib.rs`:

```rust
//! Mercury's trade router. See docs/superpowers/specs/2026-10-21-trade-router-design.md.
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

pub mod constants;
pub mod error;
pub mod state;

use constants::*;
use error::RouterError;
use state::Config;

declare_id!("PASTE_THE_STEP_1_PUBKEY");

#[program]
pub mod mercury_router {
    use super::*;

    /// Only the upgrade authority can initialise, so nobody can claim the config between deploy and setup.
    /// It starts paused: trading begins with an admin unpause, through the timelock.
    pub fn initialize(
        ctx: Context<Initialize>,
        admin: Pubkey,
        guardian: Pubkey,
        relayer_usdc: Pubkey,
        treasury: Pubkey,
    ) -> Result<()> {
        let c = &mut ctx.accounts.config;
        c.admin = admin;
        c.guardian = guardian;
        c.relayer_usdc = relayer_usdc;
        c.treasury = Pubkey::default();
        c.pending_treasury = treasury;
        c.fee_vault = ctx.accounts.fee_vault.key();
        c.paused = true;
        c.bump = ctx.bumps.config;
        c.vault_bump = ctx.bumps.vault_authority;
        Ok(())
    }

    /// The guardian may pause; only the admin may unpause, so a stolen guardian key cannot undo a pause.
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        let who = ctx.accounts.authority.key();
        let c = &mut ctx.accounts.config;
        require!(who == c.admin || (paused && who == c.guardian), RouterError::Unauthorized);
        c.paused = paused;
        Ok(())
    }

    pub fn set_guardian(ctx: Context<AdminOnly>, guardian: Pubkey) -> Result<()> {
        ctx.accounts.config.guardian = guardian;
        Ok(())
    }

    pub fn set_relayer_usdc(ctx: Context<AdminOnly>, relayer_usdc: Pubkey) -> Result<()> {
        ctx.accounts.config.relayer_usdc = relayer_usdc;
        Ok(())
    }

    /// Proposes a treasury. The current one stays live until the new one is accepted.
    pub fn set_treasury(ctx: Context<AdminOnly>, treasury: Pubkey) -> Result<()> {
        ctx.accounts.config.pending_treasury = treasury;
        Ok(())
    }

    /// Signed by the owner of the proposed USDC account, which proves a key for it exists.
    pub fn accept_treasury(ctx: Context<AcceptTreasury>) -> Result<()> {
        let c = &mut ctx.accounts.config;
        c.treasury = c.pending_treasury;
        c.pending_treasury = Pubkey::default();
        Ok(())
    }
}

#[derive(Accounts)]
pub struct AcceptTreasury<'info> {
    pub owner: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        address = config.pending_treasury @ RouterError::BadAccount,
        constraint = treasury.mint == USDC_MINT @ RouterError::BadAccount,
        constraint = treasury.owner == owner.key() @ RouterError::Unauthorized,
    )]
    pub treasury: InterfaceAccount<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init, payer = payer, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    /// CHECK: a PDA that owns the fee vault and holds nothing itself.
    #[account(seeds = [VAULT_SEED], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        constraint = fee_vault.owner == vault_authority.key() @ RouterError::BadAccount,
        constraint = fee_vault.mint == USDC_MINT @ RouterError::BadAccount,
    )]
    pub fee_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ RouterError::Unauthorized)]
    pub program: Program<'info, crate::program::MercuryRouter>,
    #[account(constraint = program_data.upgrade_authority_address == Some(payer.key()) @ RouterError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(address = config.admin @ RouterError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
}
```

- [ ] **Step 5: The LiteSVM harness**

`programs/router/tests/common/mod.rs`:

```rust
#![allow(dead_code)]
use anchor_lang::prelude::{pubkey, Pubkey};
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::{AccountDeserialize, AnchorDeserialize, Discriminator, InstructionData, ToAccountMetas};
use litesvm::types::{FailedTransactionMetadata, TransactionMetadata};
use litesvm::LiteSVM;
use mercury_router::constants::*;
use mercury_router::state::Config;
use solana_account::Account;
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;

pub const ROUTER_SO: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../target/deploy/mercury_router.so");
pub const MOCK_SO: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../target/deploy/mock_swap.so");
pub const LOADER_V3: Pubkey = pubkey!("BPFLoaderUpgradeab1e11111111111111111111111");
pub const SYSTEM: Pubkey = pubkey!("11111111111111111111111111111111");
/// Later than the test stock's multiplier change, so the new multiplier is in force.
pub const NOW: i64 = 1_790_000_000;
pub const CHANGE_AT: i64 = 1_781_755_200;
pub const OLD_MULTIPLIER: f64 = 1.003909240011759;
pub const NEW_MULTIPLIER: f64 = 1.005714560286254;

/// A Mint's 82-byte base layout: no authorities, initialised.
pub fn mint_data(decimals: u8) -> Vec<u8> {
    let mut d = vec![0u8; 82];
    d[44] = decimals;
    d[45] = 1;
    d
}

/// A Token-2022 mint carrying only ScaledUiAmount (extension 25), laid out as on mainnet.
pub fn stock_mint_data(decimals: u8, current: f64, at: i64, next: f64) -> Vec<u8> {
    let mut d = mint_data(decimals);
    d.resize(165, 0);
    d.push(1); // AccountType::Mint
    d.extend_from_slice(&25u16.to_le_bytes());
    d.extend_from_slice(&56u16.to_le_bytes());
    d.extend_from_slice(&[0u8; 32]);
    d.extend_from_slice(&current.to_le_bytes());
    d.extend_from_slice(&at.to_le_bytes());
    d.extend_from_slice(&next.to_le_bytes());
    d
}

/// A token account's 165-byte base layout, initialised, with no delegate.
pub fn token_account_data(mint: &Pubkey, owner: &Pubkey, amount: u64) -> Vec<u8> {
    let mut d = vec![0u8; 165];
    d[0..32].copy_from_slice(&mint.to_bytes());
    d[32..64].copy_from_slice(&owner.to_bytes());
    d[64..72].copy_from_slice(&amount.to_le_bytes());
    d[108] = 1;
    d
}

pub struct Env {
    pub svm: LiteSVM,
    pub deployer: Keypair,
    pub admin: Keypair,
    pub guardian: Keypair,
    pub user: Keypair,
    pub config: Pubkey,
    pub vault_authority: Pubkey,
    pub fee_vault: Pubkey,
    pub relayer_usdc: Pubkey,
    /// A USDC account of the admin's that is not the treasury.
    pub admin_usdc: Pubkey,
    /// A hot payout wallet's USDC account, the treasury once accepted.
    pub treasury: Pubkey,
    pub treasury_owner: Keypair,
    pub stock_mint: Pubkey,
    pub user_usdc: Pubkey,
    pub user_stock: Pubkey,
    pub pool_authority: Pubkey,
    pub pool_usdc: Pubkey,
    pub pool_stock: Pubkey,
    pub event_authority: Pubkey,
}

impl Env {
    /// Deployed, initialised, treasury accepted and unpaused, with $1,000 in the user's wallet and no stock.
    pub fn new() -> Self {
        let mut env = Self::bare();
        env.initialize(&env.deployer.insecure_clone()).expect("initialize");
        let (owner, treasury) = (env.treasury_owner.insecure_clone(), env.treasury);
        env.accept_treasury(&owner, treasury).expect("accept treasury");
        env.set_paused(&env.admin.insecure_clone(), false).expect("unpause");
        env
    }

    /// Deployed but not initialised.
    pub fn bare() -> Self {
        let mut svm = LiteSVM::new();
        let (deployer, admin, guardian, user) = (Keypair::new(), Keypair::new(), Keypair::new(), Keypair::new());
        let treasury_owner = Keypair::new();
        for k in [&deployer, &admin, &guardian, &user, &treasury_owner] {
            svm.airdrop(&k.pubkey(), 10_000_000_000).unwrap();
        }
        svm.add_program(mercury_router::ID, &std::fs::read(ROUTER_SO).expect("run cargo build-sbf in programs/ first"))
            .unwrap();
        set_upgrade_authority(&mut svm, &mercury_router::ID, &deployer.pubkey());
        let mut clock = svm.get_sysvar::<anchor_lang::prelude::Clock>();
        clock.unix_timestamp = NOW;
        svm.set_sysvar(&clock);

        let (config, _) = Pubkey::find_program_address(&[CONFIG_SEED], &mercury_router::ID);
        let (vault_authority, _) = Pubkey::find_program_address(&[VAULT_SEED], &mercury_router::ID);
        let (event_authority, _) = Pubkey::find_program_address(&[b"__event_authority"], &mercury_router::ID);
        let (pool_authority, _) = Pubkey::find_program_address(&[b"pool"], &JUPITER_V6);
        let stock_mint = Pubkey::new_unique();

        let mut env = Self {
            svm,
            deployer,
            admin,
            guardian,
            user,
            config,
            vault_authority,
            fee_vault: Pubkey::new_unique(),
            relayer_usdc: Pubkey::new_unique(),
            admin_usdc: Pubkey::new_unique(),
            treasury: Pubkey::new_unique(),
            treasury_owner,
            stock_mint,
            user_usdc: Pubkey::new_unique(),
            user_stock: Pubkey::new_unique(),
            pool_authority,
            pool_usdc: Pubkey::new_unique(),
            pool_stock: Pubkey::new_unique(),
            event_authority,
        };
        env.put(USDC_MINT, mint_data(6), TOKEN_PROGRAM);
        env.put(stock_mint, stock_mint_data(8, OLD_MULTIPLIER, CHANGE_AT, NEW_MULTIPLIER), TOKEN_2022_PROGRAM);
        let user = env.user.pubkey();
        let admin = env.admin.pubkey();
        env.put_token(env.fee_vault, USDC_MINT, vault_authority, 0, TOKEN_PROGRAM);
        env.put_token(env.relayer_usdc, USDC_MINT, Pubkey::new_unique(), 0, TOKEN_PROGRAM);
        env.put_token(env.admin_usdc, USDC_MINT, admin, 0, TOKEN_PROGRAM);
        let treasury_owner = env.treasury_owner.pubkey();
        env.put_token(env.treasury, USDC_MINT, treasury_owner, 0, TOKEN_PROGRAM);
        env.put_token(env.user_usdc, USDC_MINT, user, 1_000_000_000, TOKEN_PROGRAM);
        env.put_token(env.user_stock, stock_mint, user, 0, TOKEN_2022_PROGRAM);
        env.put_token(env.pool_usdc, USDC_MINT, pool_authority, 1_000_000_000_000, TOKEN_PROGRAM);
        env.put_token(env.pool_stock, stock_mint, pool_authority, 1_000_000_000_000, TOKEN_2022_PROGRAM);
        env
    }

    pub fn put(&mut self, at: Pubkey, data: Vec<u8>, owner: Pubkey) {
        self.svm
            .set_account(at, Account { lamports: 10_000_000, data, owner, executable: false, rent_epoch: 0 })
            .unwrap();
    }

    pub fn put_token(&mut self, at: Pubkey, mint: Pubkey, owner: Pubkey, amount: u64, program: Pubkey) {
        self.put(at, token_account_data(&mint, &owner, amount), program);
    }

    pub fn balance(&self, at: &Pubkey) -> u64 {
        let a = self.svm.get_account(at).expect("account");
        u64::from_le_bytes(a.data[64..72].try_into().unwrap())
    }

    pub fn read_config(&self) -> Config {
        let a = self.svm.get_account(&self.config).expect("config");
        Config::try_deserialize(&mut a.data.as_slice()).unwrap()
    }

    pub fn send(&mut self, ixs: &[Instruction], signers: &[&Keypair]) -> Result<TransactionMetadata, FailedTransactionMetadata> {
        let tx = Transaction::new_signed_with_payer(ixs, Some(&signers[0].pubkey()), signers, self.svm.latest_blockhash());
        let out = self.svm.send_transaction(tx);
        self.svm.expire_blockhash();
        out
    }

    pub fn initialize(&mut self, signer: &Keypair) -> Result<TransactionMetadata, FailedTransactionMetadata> {
        let (program_data, _) = Pubkey::find_program_address(&[mercury_router::ID.as_ref()], &LOADER_V3);
        let ix = Instruction {
            program_id: mercury_router::ID,
            accounts: mercury_router::accounts::Initialize {
                payer: signer.pubkey(),
                config: self.config,
                vault_authority: self.vault_authority,
                fee_vault: self.fee_vault,
                program: mercury_router::ID,
                program_data,
                system_program: SYSTEM,
            }
            .to_account_metas(None),
            data: mercury_router::instruction::Initialize {
                admin: self.admin.pubkey(),
                guardian: self.guardian.pubkey(),
                relayer_usdc: self.relayer_usdc,
                treasury: self.treasury,
            }
            .data(),
        };
        self.send(&[ix], &[signer])
    }

    pub fn set_paused(&mut self, signer: &Keypair, paused: bool) -> Result<TransactionMetadata, FailedTransactionMetadata> {
        let ix = Instruction {
            program_id: mercury_router::ID,
            accounts: mercury_router::accounts::SetPaused { authority: signer.pubkey(), config: self.config }
                .to_account_metas(None),
            data: mercury_router::instruction::SetPaused { paused }.data(),
        };
        self.send(&[ix], &[signer])
    }

    pub fn set_treasury(&mut self, signer: &Keypair, treasury: Pubkey) -> Result<TransactionMetadata, FailedTransactionMetadata> {
        let ix = Instruction {
            program_id: mercury_router::ID,
            accounts: mercury_router::accounts::AdminOnly { admin: signer.pubkey(), config: self.config }
                .to_account_metas(None),
            data: mercury_router::instruction::SetTreasury { treasury }.data(),
        };
        self.send(&[ix], &[signer])
    }

    pub fn accept_treasury(&mut self, signer: &Keypair, treasury: Pubkey) -> Result<TransactionMetadata, FailedTransactionMetadata> {
        let ix = Instruction {
            program_id: mercury_router::ID,
            accounts: mercury_router::accounts::AcceptTreasury { owner: signer.pubkey(), config: self.config, treasury }
                .to_account_metas(None),
            data: mercury_router::instruction::AcceptTreasury {}.data(),
        };
        self.send(&[ix], &[signer])
    }

    pub fn set_guardian(&mut self, signer: &Keypair, guardian: Pubkey) -> Result<TransactionMetadata, FailedTransactionMetadata> {
        let ix = Instruction {
            program_id: mercury_router::ID,
            accounts: mercury_router::accounts::AdminOnly { admin: signer.pubkey(), config: self.config }
                .to_account_metas(None),
            data: mercury_router::instruction::SetGuardian { guardian }.data(),
        };
        self.send(&[ix], &[signer])
    }
}

/// `add_program` writes no upgrade authority. Write one into the ProgramData account:
/// tag u32 (3), slot u64, then Option<Pubkey> at byte 12.
pub fn set_upgrade_authority(svm: &mut LiteSVM, program: &Pubkey, authority: &Pubkey) {
    let (pda, _) = Pubkey::find_program_address(&[program.as_ref()], &LOADER_V3);
    let mut a = svm.get_account(&pda).expect("programdata");
    a.data[12] = 1;
    a.data[13..45].copy_from_slice(&authority.to_bytes());
    svm.set_account(pda, a).unwrap();
}

/// The custom error a failed transaction carried, if any.
pub fn assert_code(result: Result<TransactionMetadata, FailedTransactionMetadata>, code: u32) {
    let err = result.err().expect("expected the transaction to fail");
    let text = format!("{:?}", err.err);
    assert!(text.contains(&format!("Custom({code})")), "expected Custom({code}), got {text}\n{:#?}", err.meta.logs);
}
```

- [ ] **Step 6: Write the failing admin tests**

`programs/router/tests/admin.rs`:

```rust
mod common;
use common::*;
use mercury_router::constants::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

#[test]
fn only_the_upgrade_authority_can_initialise_and_it_starts_paused() {
    let mut env = Env::bare();
    let user = env.user.insecure_clone();
    assert_code(env.initialize(&user), 6009);
    let deployer = env.deployer.insecure_clone();
    env.initialize(&deployer).expect("initialize");
    let c = env.read_config();
    assert!(c.paused);
    assert_eq!(c.admin, env.admin.pubkey());
    assert_eq!(c.fee_vault, env.fee_vault);
    // No treasury until its owner accepts, so nothing can be withdrawn to a mistyped account.
    assert_eq!(c.treasury, anchor_lang::prelude::Pubkey::default());
    assert_eq!(c.pending_treasury, env.treasury);
}

#[test]
fn the_guardian_can_pause_but_only_the_admin_unpauses() {
    let mut env = Env::new();
    let (guardian, admin) = (env.guardian.insecure_clone(), env.admin.insecure_clone());
    env.set_paused(&guardian, true).expect("guardian pauses");
    assert_code(env.set_paused(&guardian, false), 6009);
    env.set_paused(&admin, false).expect("admin unpauses");
    assert!(!env.read_config().paused);
}

#[test]
fn only_the_admin_changes_the_guardian() {
    let mut env = Env::new();
    let (user, admin) = (env.user.insecure_clone(), env.admin.insecure_clone());
    let next = anchor_lang::prelude::Pubkey::new_unique();
    assert_code(env.set_guardian(&user, next), 6009);
    env.set_guardian(&admin, next).expect("admin sets guardian");
    assert_eq!(env.read_config().guardian, next);
}

#[test]
fn only_the_admin_proposes_a_treasury_and_the_old_one_stays_until_accepted() {
    let mut env = Env::new();
    let (guardian, admin) = (env.guardian.insecure_clone(), env.admin.insecure_clone());
    let next = anchor_lang::prelude::Pubkey::new_unique();
    assert_code(env.set_treasury(&guardian, next), 6009);
    env.set_treasury(&admin, next).expect("admin proposes a treasury");
    let c = env.read_config();
    assert_eq!((c.treasury, c.pending_treasury), (env.treasury, next));
}

#[test]
fn only_the_owner_of_the_proposed_account_accepts_it() {
    let mut env = Env::new();
    let admin = env.admin.insecure_clone();
    let (next, next_owner) = (anchor_lang::prelude::Pubkey::new_unique(), Keypair::new());
    env.svm.airdrop(&next_owner.pubkey(), 1_000_000_000).unwrap();
    env.put_token(next, USDC_MINT, next_owner.pubkey(), 0, TOKEN_PROGRAM);
    env.set_treasury(&admin, next).unwrap();
    assert_code(env.accept_treasury(&admin, next), 6009);
    env.accept_treasury(&next_owner, next).expect("owner accepts");
    let c = env.read_config();
    assert_eq!((c.treasury, c.pending_treasury), (next, anchor_lang::prelude::Pubkey::default()));
}

#[test]
fn an_account_that_is_not_usdc_cannot_become_the_treasury() {
    let mut env = Env::new();
    let (admin, user) = (env.admin.insecure_clone(), env.user.insecure_clone());
    let stock_account = env.user_stock;
    env.set_treasury(&admin, stock_account).unwrap();
    assert_code(env.accept_treasury(&user, stock_account), 6008);
}
```

- [ ] **Step 7: Build and run**

```bash
cd programs && cargo build-sbf && cargo test --test admin
```

Expected: 6 passed. If an API differs in LiteSVM 0.18.1 or Anchor 1.2.1 (for example `get_sysvar`, `expire_blockhash`, `CpiContext`), fix the call, not the behaviour under test.

- [ ] **Step 8: CI**

`.github/workflows/program.yml`:

```yaml
name: Program

on:
  pull_request:
    paths: ["programs/**", ".github/workflows/program.yml"]
  push:
    branches: [main]
    paths: ["programs/**"]

concurrency:
  group: program-${{ github.ref }}
  cancel-in-progress: true

jobs:
  program:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - name: Install Agave
        run: |
          sh -c "$(curl -sSfL https://release.anza.xyz/v4.3.1/install)"
          echo "$HOME/.local/share/solana/install/active_release/bin" >> "$GITHUB_PATH"
      - uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cache/solana
            programs/target
          key: program-${{ hashFiles('programs/Cargo.lock') }}
      - run: cargo build-sbf
        working-directory: programs
      - run: cargo test
        working-directory: programs
```

- [ ] **Step 9: Commit**

```bash
git add programs .github/workflows/program.yml .gitignore .prettierignore
git commit -m "feat(router): the program's config and roles, tested on LiteSVM"
```

---

### Task 2: Token and multiplier readers

**Files:**

- Create: `programs/router/src/token.rs`
- Modify: `programs/router/src/lib.rs` (add `pub mod token;`)

**Interfaces:**

- Produces: `parse_token_account(data: &[u8]) -> Option<(Pubkey, Pubkey, u64)>` (mint, owner, amount); `balance_of(acc: &AccountInfo, owner: &Pubkey, mint: &Pubkey, program: &Pubkey) -> Result<u64>`; `effective_multiplier_e12(mint_data: &[u8], now: i64) -> u64`; `fee_on(amount: u64, rate: u32) -> u64`.

- [ ] **Step 1: Write the failing unit tests and the module**

`programs/router/src/token.rs`:

```rust
//! Readers the trade instructions share. Pure where they can be, so they test on the host.
use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::RouterError;

/// mint (0..32), owner (32..64), amount (64..72): the base layout both token programs share.
pub fn parse_token_account(data: &[u8]) -> Option<(Pubkey, Pubkey, u64)> {
    if data.len() < 72 {
        return None;
    }
    let mint = Pubkey::new_from_array(data[0..32].try_into().ok()?);
    let owner = Pubkey::new_from_array(data[32..64].try_into().ok()?);
    let amount = u64::from_le_bytes(data[64..72].try_into().ok()?);
    Some((mint, owner, amount))
}

/// A token account's raw amount. An account that does not exist yet (the stock
/// account on a first buy) is zero; anything else must be `program`'s token
/// account for `mint`, owned by `owner`.
pub fn balance_of(acc: &AccountInfo, owner: &Pubkey, mint: &Pubkey, program: &Pubkey) -> Result<u64> {
    if acc.data_is_empty() && *acc.owner == anchor_lang::system_program::ID {
        return Ok(0);
    }
    require_keys_eq!(*acc.owner, *program, RouterError::BadAccount);
    let data = acc.try_borrow_data()?;
    let (m, o, amount) = parse_token_account(&data).ok_or(RouterError::BadAccount)?;
    require_keys_eq!(m, *mint, RouterError::BadAccount);
    require_keys_eq!(o, *owner, RouterError::BadAccount);
    Ok(amount)
}

const ONE_E12: u64 = 1_000_000_000_000;

/// The Token-2022 ScaledUiAmount multiplier (extension 25) in force at `now`,
/// × 10^12, or 10^12 for a mint without one. The stored `multiplier` gives way
/// to `new_multiplier` once its timestamp passes: on SPYx in October 2026 the
/// stored value was 0.18% behind the one in force.
pub fn effective_multiplier_e12(mint_data: &[u8], now: i64) -> u64 {
    if mint_data.len() <= 166 || mint_data[165] != 1 {
        return ONE_E12;
    }
    let mut i = 166;
    while i + 4 <= mint_data.len() {
        let t = u16::from_le_bytes([mint_data[i], mint_data[i + 1]]);
        let l = u16::from_le_bytes([mint_data[i + 2], mint_data[i + 3]]) as usize;
        let end = i + 4 + l;
        if t == 0 || end > mint_data.len() {
            break;
        }
        if t == 25 && l >= 56 {
            let v = &mint_data[i + 4..end];
            let current = f64::from_le_bytes(v[32..40].try_into().unwrap());
            let at = i64::from_le_bytes(v[40..48].try_into().unwrap());
            let next = f64::from_le_bytes(v[48..56].try_into().unwrap());
            let m = if now >= at { next } else { current };
            return (m * 1e12).round() as u64;
        }
        i = end;
    }
    ONE_E12
}

/// `amount × rate / 1,000,000`, rounded down: a fee is never rounded up against the user.
pub fn fee_on(amount: u64, rate: u32) -> u64 {
    ((amount as u128 * rate as u128) / RATE_DENOMINATOR) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stock_mint(current: f64, at: i64, next: f64) -> Vec<u8> {
        let mut d = vec![0u8; 165];
        d.push(1);
        d.extend_from_slice(&25u16.to_le_bytes());
        d.extend_from_slice(&56u16.to_le_bytes());
        d.extend_from_slice(&[0u8; 32]);
        d.extend_from_slice(&current.to_le_bytes());
        d.extend_from_slice(&at.to_le_bytes());
        d.extend_from_slice(&next.to_le_bytes());
        d
    }

    #[test]
    fn the_new_multiplier_applies_once_its_time_has_come() {
        let d = stock_mint(1.003909240011759, 100, 1.005714560286254);
        assert_eq!(effective_multiplier_e12(&d, 99), 1_003_909_240_012);
        assert_eq!(effective_multiplier_e12(&d, 100), 1_005_714_560_286);
    }

    #[test]
    fn a_mint_without_the_extension_is_one() {
        assert_eq!(effective_multiplier_e12(&[0u8; 82], 0), ONE_E12);
        let mut truncated = stock_mint(2.0, 0, 2.0);
        truncated.truncate(180);
        assert_eq!(effective_multiplier_e12(&truncated, 1), ONE_E12);
    }

    #[test]
    fn fees_round_down_and_hold_a_fractional_basis_point() {
        assert_eq!(fee_on(100_000_000, 5_000), 500_000);
        assert_eq!(fee_on(100_000_000, 3_750), 375_000);
        assert_eq!(fee_on(199, 5_000), 0);
    }

    #[test]
    fn a_token_account_reads_mint_owner_and_amount() {
        let (mint, owner) = (Pubkey::new_unique(), Pubkey::new_unique());
        let mut d = vec![0u8; 165];
        d[0..32].copy_from_slice(&mint.to_bytes());
        d[32..64].copy_from_slice(&owner.to_bytes());
        d[64..72].copy_from_slice(&42u64.to_le_bytes());
        assert_eq!(parse_token_account(&d), Some((mint, owner, 42)));
        assert_eq!(parse_token_account(&d[..71]), None);
    }
}
```

Add `pub mod token;` to `lib.rs` beside the other modules.

- [ ] **Step 2: Run**

```bash
cd programs && cargo test -p mercury-router --lib
```

Expected: 4 passed.

- [ ] **Step 3: Commit**

```bash
git add programs/router/src
git commit -m "feat(router): read token balances and the multiplier in force"
```

---

### Task 3: The mock swap

**Files:**

- Create: `programs/mock-swap/Cargo.toml`, `programs/mock-swap/src/lib.rs`
- Modify: `programs/Cargo.toml`, `programs/router/Cargo.toml`, `programs/router/tests/common/mod.rs`

**Interfaces:**

- Produces: TEST-ONLY program at Jupiter's address with `swap(amount_in: u64, amount_out: u64)`; accounts `user, user_in, pool_in, pool_out, user_out, pool_authority (PDA ["pool"]), mint_in, mint_out, in_program, out_program`.

- [ ] **Step 1: Cargo.toml**

```toml
[package]
name = "mock-swap"
version = "0.0.0"
edition = "2021"
publish = false
description = "TEST ONLY: stands in for Jupiter v6 inside LiteSVM"

[lib]
crate-type = ["cdylib", "lib"]
name = "mock_swap"

[features]
default = []
cpi = ["no-entrypoint"]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]
anchor-debug = []
custom-heap = []
custom-panic = []

[dependencies]
anchor-lang = "=1.2.1"
anchor-spl = "=1.2.1"
```

- [ ] **Step 2: The program**

```rust
//! TEST ONLY. Deployed at Jupiter's address in LiteSVM so the router's tests run
//! a swap whose amounts they choose. Never deploy this.
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

declare_id!("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");

#[program]
pub mod mock_swap {
    use super::*;

    /// Takes `amount_in` from the user and pays `amount_out` from the pool. A zero is skipped.
    pub fn swap(ctx: Context<Swap>, amount_in: u64, amount_out: u64) -> Result<()> {
        let a = &ctx.accounts;
        if amount_in > 0 {
            token_interface::transfer_checked(
                CpiContext::new(
                    a.in_program.key(),
                    TransferChecked {
                        from: a.user_in.to_account_info(),
                        mint: a.mint_in.to_account_info(),
                        to: a.pool_in.to_account_info(),
                        authority: a.user.to_account_info(),
                    },
                ),
                amount_in,
                a.mint_in.decimals,
            )?;
        }
        if amount_out > 0 {
            let seeds: &[&[u8]] = &[b"pool", &[ctx.bumps.pool_authority]];
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    a.out_program.key(),
                    TransferChecked {
                        from: a.pool_out.to_account_info(),
                        mint: a.mint_out.to_account_info(),
                        to: a.user_out.to_account_info(),
                        authority: a.pool_authority.to_account_info(),
                    },
                    &[seeds],
                ),
                amount_out,
                a.mint_out.decimals,
            )?;
        }
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Swap<'info> {
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_in: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub pool_in: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub pool_out: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub user_out: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: the PDA that owns the pool's accounts.
    #[account(seeds = [b"pool"], bump)]
    pub pool_authority: UncheckedAccount<'info>,
    pub mint_in: InterfaceAccount<'info, Mint>,
    pub mint_out: InterfaceAccount<'info, Mint>,
    pub in_program: Interface<'info, TokenInterface>,
    pub out_program: Interface<'info, TokenInterface>,
}
```

- [ ] **Step 3: Load it at Jupiter's address in the tests**

`programs/Cargo.toml`: `members = ["router", "mock-swap"]`.

`programs/router/Cargo.toml`, under `[dev-dependencies]`:

```toml
mock-swap = { path = "../mock-swap", features = ["no-entrypoint"] }
```

`programs/router/tests/common/mod.rs`, in `Env::bare()` right after the router's `add_program`:

```rust
        svm.add_program(JUPITER_V6, &std::fs::read(MOCK_SO).expect("run cargo build-sbf in programs/ first"))
            .unwrap();
```

- [ ] **Step 4: Build and rerun**

```bash
cd programs && cargo build-sbf && ls target/deploy/mock_swap.so && cargo test --test admin
```

Expected: the `.so` exists and the 6 admin tests still pass.

- [ ] **Step 5: Commit**

```bash
git add programs
git commit -m "test(router): a mock swap at Jupiter's address for LiteSVM"
```

---

### Task 4: Buys through `open_trade` and `close_trade`

**Files:**

- Create: `programs/router/src/pairing.rs`, `programs/router/tests/trade.rs`
- Modify: `programs/router/src/lib.rs`, `programs/router/tests/common/mod.rs`

**Interfaces:**

- Consumes: Task 2's `balance_of`, `effective_multiplier_e12`, `fee_on`.
- Produces: `pairing::OpenArgs { order_id: [u8;16], side: u8, fee_rate: u32, buy_fee: u64, network_fee: u64, gross_in: u64, min_out: u64, pre_in: u64, pre_out: u64, affiliate: u64 }` (Borsh, 85 bytes with the discriminator); instructions `open_trade(args)`, `close_trade(order_id)`; event `TradeFilled { version: u8, order_id: [u8;16], user: Pubkey, side: u8, input_mint: Pubkey, output_mint: Pubkey, spent: u64, got: u64, network_fee: u64, mercury_fee: u64, multiplier_e12: u64, affiliate: u64 }`. Account order for both: `user, config, fee_vault, relayer_usdc, user_in, user_out, usdc_mint, stock_mint, usdc_token_program, instructions` (close adds `event_authority, program`).

- [ ] **Step 1: Pairing**

`programs/router/src/pairing.rs`:

```rust
//! Binding open and close together through the instructions sysvar.
use anchor_lang::compat::solana_instructions_sysvar::{load_current_index_checked, load_instruction_at_checked};
use anchor_lang::prelude::*;
use anchor_lang::Discriminator;

use crate::constants::*;
use crate::error::RouterError;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct OpenArgs {
    pub order_id: [u8; 16],
    pub side: u8,
    /// Hundredths of a basis point.
    pub fee_rate: u32,
    /// Buys only: Mercury's fee, as the server computed it. Zero on a sell.
    pub buy_fee: u64,
    pub network_fee: u64,
    /// Buy: the USDC agreed to, fees included. Sell: the tokens agreed to sell.
    pub gross_in: u64,
    /// Buy: least tokens. Sell: least USDC after both fees.
    pub min_out: u64,
    pub pre_in: u64,
    pub pre_out: u64,
    pub affiliate: u64,
}

/// The first six accounts both halves share, in order:
/// user, config, fee_vault, relayer_usdc, user_in, user_out.
pub type TradeKeys = [Pubkey; 6];

/// From `open_trade`: no router instruction before it, the next one is this
/// order's close on the same accounts, and only Jupiter, ATA creation and
/// compute budget run in between.
pub fn close_follows(sysvar: &AccountInfo, order_id: &[u8; 16], keys: &TradeKeys) -> Result<()> {
    let me = load_current_index_checked(sysvar)? as usize;
    for j in 0..me {
        require!(load_instruction_at_checked(j, sysvar)?.program_id != crate::ID, RouterError::Unpaired);
    }
    let mut i = me + 1;
    while let Ok(ix) = load_instruction_at_checked(i, sysvar) {
        if ix.program_id == crate::ID {
            require!(
                ix.data.len() >= 24
                    && ix.data[..8] == *crate::instruction::CloseTrade::DISCRIMINATOR
                    && ix.data[8..24] == order_id[..]
                    && ix.accounts.len() >= 6
                    && (0..6).all(|k| ix.accounts[k].pubkey == keys[k]),
                RouterError::Unpaired
            );
            return Ok(());
        }
        require!(
            ix.program_id == JUPITER_V6 || ix.program_id == ATA_PROGRAM || ix.program_id == COMPUTE_BUDGET,
            RouterError::Forbidden
        );
        i += 1;
    }
    err!(RouterError::Unpaired)
}

/// From `close_trade`: the nearest router instruction before it is this order's
/// open on the same accounts. Returns the open's arguments.
pub fn open_precedes(sysvar: &AccountInfo, order_id: &[u8; 16], keys: &TradeKeys) -> Result<OpenArgs> {
    let me = load_current_index_checked(sysvar)? as usize;
    for j in (0..me).rev() {
        let ix = load_instruction_at_checked(j, sysvar)?;
        if ix.program_id != crate::ID {
            continue;
        }
        require!(
            ix.data.len() >= 8 && ix.data[..8] == *crate::instruction::OpenTrade::DISCRIMINATOR,
            RouterError::Unpaired
        );
        let args = OpenArgs::deserialize(&mut &ix.data[8..])?;
        require!(
            args.order_id == *order_id && ix.accounts.len() >= 6 && (0..6).all(|k| ix.accounts[k].pubkey == keys[k]),
            RouterError::Unpaired
        );
        return Ok(args);
    }
    err!(RouterError::Unpaired)
}
```

- [ ] **Step 2: The trade instructions**

In `lib.rs`: add `pub mod pairing;`, these imports, the two handlers inside `pub mod mercury_router`, and the structs and helpers below the program.

```rust
use anchor_spl::token_interface::{self, Mint, TokenInterface, TransferChecked};
use pairing::{close_follows, open_precedes, OpenArgs, TradeKeys};
use token::{balance_of, effective_multiplier_e12, fee_on};
```

Handlers:

```rust
    /// Before the swap: check the claimed balances and the pairing; on a buy, take both fees.
    pub fn open_trade(ctx: Context<OpenTrade>, args: OpenArgs) -> Result<()> {
        let a = &ctx.accounts;
        require!(!a.config.paused, RouterError::Paused);
        require!(args.fee_rate <= MAX_FEE_RATE, RouterError::FeeTooHigh);
        let (in_mint, in_prog, out_mint, out_prog) = sides(args.side, &a.stock_mint)?;
        let user = a.user.key();
        require!(balance_of(&a.user_in, &user, &in_mint, &in_prog)? == args.pre_in, RouterError::StaleBalance);
        require!(balance_of(&a.user_out, &user, &out_mint, &out_prog)? == args.pre_out, RouterError::StaleBalance);
        if args.side == SIDE_BUY {
            require!(args.buy_fee <= fee_on(args.gross_in, args.fee_rate), RouterError::FeeTooHigh);
        } else {
            require!(args.buy_fee == 0, RouterError::BadArgs);
        }
        let keys: TradeKeys = [user, a.config.key(), a.fee_vault.key(), a.relayer_usdc.key(), a.user_in.key(), a.user_out.key()];
        close_follows(&a.instructions.to_account_info(), &args.order_id, &keys)?;
        if args.side == SIDE_BUY {
            pay(&a.usdc_token_program, &a.user_in, &a.usdc_mint, &a.relayer_usdc, &a.user, args.network_fee)?;
            pay(&a.usdc_token_program, &a.user_in, &a.usdc_mint, &a.fee_vault, &a.user, args.buy_fee)?;
        }
        Ok(())
    }

    /// After the swap: measure what moved, take a sell's fees, emit what happened.
    pub fn close_trade(ctx: Context<CloseTrade>, order_id: [u8; 16]) -> Result<()> {
        let a = &ctx.accounts;
        let user = a.user.key();
        let keys: TradeKeys = [user, a.config.key(), a.fee_vault.key(), a.relayer_usdc.key(), a.user_in.key(), a.user_out.key()];
        let args = open_precedes(&a.instructions.to_account_info(), &order_id, &keys)?;
        let (in_mint, in_prog, out_mint, out_prog) = sides(args.side, &a.stock_mint)?;
        let post_in = balance_of(&a.user_in, &user, &in_mint, &in_prog)?;
        let post_out = balance_of(&a.user_out, &user, &out_mint, &out_prog)?;
        let spent = args.pre_in.checked_sub(post_in).ok_or(RouterError::BadArgs)?;
        let got = post_out.checked_sub(args.pre_out).ok_or(RouterError::Slippage)?;
        require!(spent <= args.gross_in, RouterError::Overspent);
        let mercury_fee = if args.side == SIDE_BUY {
            require!(got >= args.min_out, RouterError::Slippage);
            args.buy_fee
        } else {
            let fee = fee_on(got, args.fee_rate);
            let net = got.checked_sub(args.network_fee).and_then(|v| v.checked_sub(fee)).ok_or(RouterError::Slippage)?;
            require!(net >= args.min_out, RouterError::Slippage);
            pay(&a.usdc_token_program, &a.user_out, &a.usdc_mint, &a.relayer_usdc, &a.user, args.network_fee)?;
            pay(&a.usdc_token_program, &a.user_out, &a.usdc_mint, &a.fee_vault, &a.user, fee)?;
            fee
        };
        let multiplier_e12 = effective_multiplier_e12(&a.stock_mint.try_borrow_data()?, Clock::get()?.unix_timestamp);
        emit_cpi!(TradeFilled {
            version: EVENT_VERSION,
            order_id,
            user,
            side: args.side,
            input_mint: in_mint,
            output_mint: out_mint,
            spent,
            got,
            network_fee: args.network_fee,
            mercury_fee,
            multiplier_e12,
            affiliate: args.affiliate,
        });
        Ok(())
    }
```

Below the program:

```rust
/// (input mint, its program, output mint, its program) for a side.
fn sides(side: u8, stock_mint: &AccountInfo) -> Result<(Pubkey, Pubkey, Pubkey, Pubkey)> {
    let stock_program = *stock_mint.owner;
    require!(stock_program == TOKEN_PROGRAM || stock_program == TOKEN_2022_PROGRAM, RouterError::BadAccount);
    match side {
        SIDE_BUY => Ok((USDC_MINT, TOKEN_PROGRAM, stock_mint.key(), stock_program)),
        SIDE_SELL => Ok((stock_mint.key(), stock_program, USDC_MINT, TOKEN_PROGRAM)),
        _ => err!(RouterError::BadArgs),
    }
}

fn pay<'info>(
    program: &Interface<'info, TokenInterface>,
    from: &UncheckedAccount<'info>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &UncheckedAccount<'info>,
    authority: &Signer<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    token_interface::transfer_checked(
        CpiContext::new(
            program.key(),
            TransferChecked {
                from: from.to_account_info(),
                mint: mint.to_account_info(),
                to: to.to_account_info(),
                authority: authority.to_account_info(),
            },
        ),
        amount,
        mint.decimals,
    )
}

#[derive(Accounts)]
pub struct OpenTrade<'info> {
    pub user: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: checked against config.
    #[account(mut, address = config.fee_vault @ RouterError::BadAccount)]
    pub fee_vault: UncheckedAccount<'info>,
    /// CHECK: checked against config.
    #[account(mut, address = config.relayer_usdc @ RouterError::BadAccount)]
    pub relayer_usdc: UncheckedAccount<'info>,
    /// CHECK: owner, mint and program checked in `balance_of`.
    #[account(mut)]
    pub user_in: UncheckedAccount<'info>,
    /// CHECK: may not exist yet; checked in `balance_of`.
    pub user_out: UncheckedAccount<'info>,
    #[account(address = USDC_MINT)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    /// CHECK: its owner is checked in `sides`; read for its multiplier at close.
    pub stock_mint: UncheckedAccount<'info>,
    #[account(address = TOKEN_PROGRAM)]
    pub usdc_token_program: Interface<'info, TokenInterface>,
    /// CHECK: the instructions sysvar.
    #[account(address = INSTRUCTIONS_SYSVAR)]
    pub instructions: UncheckedAccount<'info>,
}

#[event_cpi]
#[derive(Accounts)]
pub struct CloseTrade<'info> {
    pub user: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: checked against config.
    #[account(mut, address = config.fee_vault @ RouterError::BadAccount)]
    pub fee_vault: UncheckedAccount<'info>,
    /// CHECK: checked against config.
    #[account(mut, address = config.relayer_usdc @ RouterError::BadAccount)]
    pub relayer_usdc: UncheckedAccount<'info>,
    /// CHECK: checked in `balance_of`.
    pub user_in: UncheckedAccount<'info>,
    /// CHECK: checked in `balance_of`; pays a sell's fees.
    #[account(mut)]
    pub user_out: UncheckedAccount<'info>,
    #[account(address = USDC_MINT)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    /// CHECK: its owner is checked in `sides`; read for its multiplier.
    pub stock_mint: UncheckedAccount<'info>,
    #[account(address = TOKEN_PROGRAM)]
    pub usdc_token_program: Interface<'info, TokenInterface>,
    /// CHECK: the instructions sysvar.
    #[account(address = INSTRUCTIONS_SYSVAR)]
    pub instructions: UncheckedAccount<'info>,
}

#[event]
pub struct TradeFilled {
    pub version: u8,
    pub order_id: [u8; 16],
    pub user: Pubkey,
    pub side: u8,
    pub input_mint: Pubkey,
    pub output_mint: Pubkey,
    /// Out of the input account: tokens on a sell, USDC with both fees on a buy.
    pub spent: u64,
    /// Into the output account, before a sell's fees.
    pub got: u64,
    pub network_fee: u64,
    pub mercury_fee: u64,
    /// The stock's effective multiplier at the fill, × 10^12.
    pub multiplier_e12: u64,
    pub affiliate: u64,
}
```

- [ ] **Step 3: Harness helpers for trades**

Append to `programs/router/tests/common/mod.rs`:

```rust
pub use mercury_router::pairing::OpenArgs;
pub use mercury_router::TradeFilled;

pub fn args(side: u8, gross_in: u64, pre_in: u64, pre_out: u64) -> OpenArgs {
    OpenArgs {
        order_id: *b"order-0000000001",
        side,
        fee_rate: 5_000,
        buy_fee: if side == SIDE_BUY { gross_in / 200 } else { 0 },
        network_fee: 10_000,
        gross_in,
        min_out: 1,
        pre_in,
        pre_out,
        affiliate: 7,
    }
}

impl Env {
    pub fn legs(&self, side: u8) -> (Pubkey, Pubkey) {
        if side == SIDE_BUY { (self.user_usdc, self.user_stock) } else { (self.user_stock, self.user_usdc) }
    }

    fn trade_metas(&self, side: u8) -> mercury_router::accounts::OpenTrade {
        let (user_in, user_out) = self.legs(side);
        mercury_router::accounts::OpenTrade {
            user: self.user.pubkey(),
            config: self.config,
            fee_vault: self.fee_vault,
            relayer_usdc: self.relayer_usdc,
            user_in,
            user_out,
            usdc_mint: USDC_MINT,
            stock_mint: self.stock_mint,
            usdc_token_program: TOKEN_PROGRAM,
            instructions: INSTRUCTIONS_SYSVAR,
        }
    }

    pub fn open_ix(&self, a: &OpenArgs) -> Instruction {
        Instruction {
            program_id: mercury_router::ID,
            accounts: self.trade_metas(a.side).to_account_metas(None),
            data: mercury_router::instruction::OpenTrade { args: *a }.data(),
        }
    }

    pub fn close_ix(&self, side: u8, order_id: [u8; 16]) -> Instruction {
        let o = self.trade_metas(side);
        Instruction {
            program_id: mercury_router::ID,
            accounts: mercury_router::accounts::CloseTrade {
                user: o.user,
                config: o.config,
                fee_vault: o.fee_vault,
                relayer_usdc: o.relayer_usdc,
                user_in: o.user_in,
                user_out: o.user_out,
                usdc_mint: o.usdc_mint,
                stock_mint: o.stock_mint,
                usdc_token_program: o.usdc_token_program,
                instructions: o.instructions,
                event_authority: self.event_authority,
                program: mercury_router::ID,
            }
            .to_account_metas(None),
            data: mercury_router::instruction::CloseTrade { order_id }.data(),
        }
    }

    pub fn swap_ix(&self, side: u8, amount_in: u64, amount_out: u64) -> Instruction {
        let (user_in, user_out) = self.legs(side);
        let (pool_in, pool_out, mint_in, mint_out, in_program, out_program) = if side == SIDE_BUY {
            (self.pool_usdc, self.pool_stock, USDC_MINT, self.stock_mint, TOKEN_PROGRAM, TOKEN_2022_PROGRAM)
        } else {
            (self.pool_stock, self.pool_usdc, self.stock_mint, USDC_MINT, TOKEN_2022_PROGRAM, TOKEN_PROGRAM)
        };
        Instruction {
            program_id: JUPITER_V6,
            accounts: mock_swap::accounts::Swap {
                user: self.user.pubkey(),
                user_in,
                pool_in,
                pool_out,
                user_out,
                pool_authority: self.pool_authority,
                mint_in,
                mint_out,
                in_program,
                out_program,
            }
            .to_account_metas(None),
            data: mock_swap::instruction::Swap { amount_in, amount_out }.data(),
        }
    }

    pub fn trade(&mut self, a: &OpenArgs, swap_in: u64, swap_out: u64) -> Result<TransactionMetadata, FailedTransactionMetadata> {
        let ixs = [self.open_ix(a), self.swap_ix(a.side, swap_in, swap_out), self.close_ix(a.side, a.order_id)];
        let user = self.user.insecure_clone();
        self.send(&ixs, &[&user])
    }
}

/// The TradeFilled the router emitted through its self-CPI, if any.
pub fn trade_filled(meta: &TransactionMetadata) -> Option<TradeFilled> {
    for group in &meta.inner_instructions {
        for inner in group {
            let d = &inner.instruction.data;
            if d.len() >= 16 && d[..8] == anchor_lang::event::EVENT_IX_TAG_LE[..] && d[8..16] == *TradeFilled::DISCRIMINATOR {
                return TradeFilled::try_from_slice(&d[16..]).ok();
            }
        }
    }
    None
}

/// A plain Token-program transfer, for slipping between open and close.
pub fn token_transfer(from: Pubkey, to: Pubkey, owner: Pubkey, amount: u64) -> Instruction {
    let mut data = vec![3u8];
    data.extend_from_slice(&amount.to_le_bytes());
    Instruction {
        program_id: TOKEN_PROGRAM,
        accounts: vec![AccountMeta::new(from, false), AccountMeta::new(to, false), AccountMeta::new_readonly(owner, true)],
        data,
    }
}
```

- [ ] **Step 4: Write the failing buy tests**

`programs/router/tests/trade.rs`:

```rust
mod common;
use anchor_lang::prelude::Pubkey;
use common::*;
use mercury_router::constants::*;
use solana_signer::Signer;

const AGREED: u64 = 100_000_000; // $100
const BOUGHT: u64 = 12_345_678;

fn buy() -> OpenArgs {
    OpenArgs { min_out: 12_000_000, ..args(SIDE_BUY, AGREED, 1_000_000_000, 0) }
}
/// What reaches the swap: the agreed amount less both fees.
fn swapped(a: &OpenArgs) -> u64 {
    a.gross_in - a.network_fee - a.buy_fee
}

#[test]
fn a_buy_records_exactly_what_moved_and_pays_both_fees() {
    let mut env = Env::new();
    let a = buy();
    let meta = env.trade(&a, swapped(&a), BOUGHT).expect("buy");
    let e = trade_filled(&meta).expect("event");
    assert_eq!(e.order_id, a.order_id);
    assert_eq!(e.user, env.user.pubkey());
    assert_eq!((e.spent, e.got), (AGREED, BOUGHT));
    assert_eq!((e.network_fee, e.mercury_fee), (10_000, 500_000));
    assert_eq!(e.multiplier_e12, 1_005_714_560_286);
    assert_eq!(e.affiliate, 7);
    assert_eq!(env.balance(&env.fee_vault), 500_000);
    assert_eq!(env.balance(&env.relayer_usdc), 10_000);
    assert_eq!(env.balance(&env.user_usdc), 1_000_000_000 - AGREED);
    assert_eq!(env.balance(&env.user_stock), BOUGHT);
}

#[test]
fn a_friends_fractional_rate_is_accepted() {
    let mut env = Env::new();
    let a = OpenArgs { fee_rate: 3_750, buy_fee: 375_000, ..buy() };
    env.trade(&a, swapped(&a), BOUGHT).expect("discounted buy");
    assert_eq!(env.balance(&env.fee_vault), 375_000);
}

#[test]
fn a_swap_and_close_without_an_open_is_refused() {
    let mut env = Env::new();
    let a = buy();
    let ixs = [env.swap_ix(SIDE_BUY, swapped(&a), BOUGHT), env.close_ix(SIDE_BUY, a.order_id)];
    let user = env.user.insecure_clone();
    assert_code(env.send(&ixs, &[&user]), 6004);
}

#[test]
fn an_open_with_no_close_is_refused() {
    let mut env = Env::new();
    let a = buy();
    let ixs = [env.open_ix(&a), env.swap_ix(SIDE_BUY, swapped(&a), BOUGHT)];
    let user = env.user.insecure_clone();
    assert_code(env.send(&ixs, &[&user]), 6004);
}

#[test]
fn a_false_balance_before_is_refused() {
    let mut env = Env::new();
    let a = OpenArgs { pre_in: 999, ..buy() };
    assert_code(env.trade(&a, swapped(&a), BOUGHT), 6003);
}

#[test]
fn a_rate_over_the_cap_is_refused() {
    let mut env = Env::new();
    let a = OpenArgs { fee_rate: MAX_FEE_RATE + 1, ..buy() };
    assert_code(env.trade(&a, swapped(&a), BOUGHT), 6001);
}

#[test]
fn a_buy_fee_above_its_rate_is_refused() {
    let mut env = Env::new();
    let a = OpenArgs { buy_fee: 500_001, ..buy() };
    assert_code(env.trade(&a, swapped(&a), BOUGHT), 6001);
}

#[test]
fn a_close_from_another_order_is_refused() {
    let mut env = Env::new();
    let a = buy();
    let ixs = [env.open_ix(&a), env.swap_ix(SIDE_BUY, swapped(&a), BOUGHT), env.close_ix(SIDE_BUY, *b"order-0000000002")];
    let user = env.user.insecure_clone();
    assert_code(env.send(&ixs, &[&user]), 6004);
}

#[test]
fn a_token_transfer_between_open_and_close_is_refused() {
    let mut env = Env::new();
    let a = buy();
    let sneak = token_transfer(env.user_usdc, env.fee_vault, env.user.pubkey(), 1);
    let ixs = [env.open_ix(&a), env.swap_ix(SIDE_BUY, swapped(&a), BOUGHT), sneak, env.close_ix(SIDE_BUY, a.order_id)];
    let user = env.user.insecure_clone();
    assert_code(env.send(&ixs, &[&user]), 6005);
}

#[test]
fn two_trades_in_one_transaction_are_refused() {
    let mut env = Env::new();
    let a = buy();
    let b = OpenArgs { order_id: *b"order-0000000002", pre_in: 1_000_000_000 - AGREED, pre_out: BOUGHT, ..buy() };
    let ixs = [
        env.open_ix(&a), env.swap_ix(SIDE_BUY, swapped(&a), BOUGHT), env.close_ix(SIDE_BUY, a.order_id),
        env.open_ix(&b), env.swap_ix(SIDE_BUY, swapped(&b), BOUGHT), env.close_ix(SIDE_BUY, b.order_id),
    ];
    let user = env.user.insecure_clone();
    assert_code(env.send(&ixs, &[&user]), 6004);
}

#[test]
fn spending_more_than_agreed_is_refused() {
    let mut env = Env::new();
    let a = buy();
    assert_code(env.trade(&a, swapped(&a) + 1, BOUGHT), 6007);
}

#[test]
fn receiving_less_than_the_minimum_is_refused() {
    let mut env = Env::new();
    let a = OpenArgs { min_out: BOUGHT + 1, ..buy() };
    assert_code(env.trade(&a, swapped(&a), BOUGHT), 6006);
}

#[test]
fn someone_elses_token_account_is_refused() {
    let mut env = Env::new();
    let stranger = Pubkey::new_unique();
    let usdc = env.user_usdc;
    env.put_token(usdc, USDC_MINT, stranger, 1_000_000_000, TOKEN_PROGRAM);
    let a = buy();
    assert_code(env.trade(&a, swapped(&a), BOUGHT), 6008);
}

#[test]
fn a_network_fee_to_anyone_but_the_relayer_is_refused() {
    let mut env = Env::new();
    env.relayer_usdc = env.admin_usdc;
    let a = buy();
    assert_code(env.trade(&a, swapped(&a), BOUGHT), 6008);
}

#[test]
fn a_paused_router_refuses_trades() {
    let mut env = Env::new();
    let guardian = env.guardian.insecure_clone();
    env.set_paused(&guardian, true).unwrap();
    let a = buy();
    assert_code(env.trade(&a, swapped(&a), BOUGHT), 6000);
}
```

- [ ] **Step 5: Run to watch them fail, then build and pass**

```bash
cd programs && cargo build-sbf && cargo test --test trade
```

Expected after Step 2's code: 15 passed. Run them first with the handlers stubbed (`Ok(())`) to see the refusals fail; then restore.

- [ ] **Step 6: Commit**

```bash
git add programs/router
git commit -m "feat(router): a buy pays both fees and states what moved, and pairs only with its own close"
```

---

### Task 5: Sells take their fees from what arrived

**Files:**

- Modify: `programs/router/tests/trade.rs`

**Interfaces:**

- Consumes: Task 4's program and harness.

- [ ] **Step 1: Write the sell tests**

Append to `programs/router/tests/trade.rs`:

```rust
const HELD: u64 = 100_000_000; // one share's worth of tokens, 8 decimals
const PROCEEDS: u64 = 800_000_000; // $800

/// A wallet holding stock and no cash.
fn seller() -> Env {
    let mut env = Env::new();
    let (stock, mint, user, usdc) = (env.user_stock, env.stock_mint, env.user.pubkey(), env.user_usdc);
    env.put_token(stock, mint, user, HELD, TOKEN_2022_PROGRAM);
    env.put_token(usdc, USDC_MINT, user, 0, TOKEN_PROGRAM);
    env
}
fn sell() -> OpenArgs {
    OpenArgs { min_out: 790_000_000, ..args(SIDE_SELL, HELD, HELD, 0) }
}

#[test]
fn a_sell_takes_both_fees_from_the_proceeds() {
    let mut env = seller();
    let meta = env.trade(&sell(), HELD, PROCEEDS).expect("sell");
    let e = trade_filled(&meta).expect("event");
    assert_eq!((e.spent, e.got), (HELD, PROCEEDS));
    assert_eq!(e.mercury_fee, 4_000_000);
    assert_eq!(env.balance(&env.fee_vault), 4_000_000);
    assert_eq!(env.balance(&env.relayer_usdc), 10_000);
    assert_eq!(env.balance(&env.user_usdc), PROCEEDS - 10_000 - 4_000_000);
}

#[test]
fn a_sell_carrying_a_buy_fee_is_refused() {
    let mut env = seller();
    let a = OpenArgs { buy_fee: 1, ..sell() };
    assert_code(env.trade(&a, HELD, PROCEEDS), 6002);
}

#[test]
fn a_sell_netting_less_than_the_minimum_is_refused() {
    let mut env = seller();
    let a = OpenArgs { min_out: PROCEEDS, ..sell() };
    assert_code(env.trade(&a, HELD, PROCEEDS), 6006);
}

#[test]
fn selling_more_than_agreed_is_refused() {
    let mut env = seller();
    let a = OpenArgs { gross_in: HELD - 1, ..sell() };
    assert_code(env.trade(&a, HELD, PROCEEDS), 6007);
}

#[test]
fn fees_larger_than_the_proceeds_are_refused() {
    let mut env = seller();
    let a = OpenArgs { network_fee: PROCEEDS, min_out: 0, ..sell() };
    assert_code(env.trade(&a, HELD, PROCEEDS), 6006);
}
```

- [ ] **Step 2: Run**

```bash
cd programs && cargo test --test trade
```

Expected: 20 passed.

- [ ] **Step 3: Commit**

```bash
git add programs/router/tests/trade.rs
git commit -m "test(router): a sell pays its fees out of what arrived"
```

---

### Task 6: Withdrawals to the treasury

**Files:**

- Modify: `programs/router/src/lib.rs`, `programs/router/tests/common/mod.rs`
- Create: `programs/router/tests/withdraw.rs`

**Interfaces:**

- Consumes: Task 1's `Config.treasury`, `set_treasury` and `accept_treasury`; `Env::new()` has already accepted `env.treasury`.
- Produces: `withdraw(amount: u64)`; accounts `admin, config, vault_authority, fee_vault, treasury, usdc_mint, token_program`.

- [ ] **Step 1: The instruction**

`TokenAccount` is already imported (Task 1). Inside `pub mod mercury_router`:

```rust
    /// Admin only, so each withdrawal waits out the timelock, and only to the treasury. The admin
    /// picks the amount, so a hot treasury holds only what was sent to it.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let a = &ctx.accounts;
        let seeds: &[&[u8]] = &[VAULT_SEED, &[a.config.vault_bump]];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                a.token_program.key(),
                TransferChecked {
                    from: a.fee_vault.to_account_info(),
                    mint: a.usdc_mint.to_account_info(),
                    to: a.treasury.to_account_info(),
                    authority: a.vault_authority.to_account_info(),
                },
                &[seeds],
            ),
            amount,
            a.usdc_mint.decimals,
        )
    }
```

and below the program:

```rust
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(address = config.admin @ RouterError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: the vault PDA, signing for the transfer.
    #[account(seeds = [VAULT_SEED], bump = config.vault_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, address = config.fee_vault @ RouterError::BadAccount)]
    pub fee_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        address = config.treasury @ RouterError::BadAccount,
        constraint = treasury.mint == USDC_MINT @ RouterError::BadAccount,
    )]
    pub treasury: InterfaceAccount<'info, TokenAccount>,
    #[account(address = USDC_MINT)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(address = TOKEN_PROGRAM)]
    pub token_program: Interface<'info, TokenInterface>,
}
```

- [ ] **Step 2: Harness helper**

Append to `impl Env` in `tests/common/mod.rs`:

```rust
    pub fn withdraw(&mut self, signer: &Keypair, to: Pubkey, amount: u64) -> Result<TransactionMetadata, FailedTransactionMetadata> {
        let ix = Instruction {
            program_id: mercury_router::ID,
            accounts: mercury_router::accounts::Withdraw {
                admin: signer.pubkey(),
                config: self.config,
                vault_authority: self.vault_authority,
                fee_vault: self.fee_vault,
                treasury: to,
                usdc_mint: USDC_MINT,
                token_program: TOKEN_PROGRAM,
            }
            .to_account_metas(None),
            data: mercury_router::instruction::Withdraw { amount }.data(),
        };
        self.send(&[ix], &[signer])
    }
```

- [ ] **Step 3: Tests**

`programs/router/tests/withdraw.rs`:

```rust
mod common;
use common::*;
use mercury_router::constants::*;

fn funded() -> Env {
    let mut env = Env::new();
    let (vault, authority) = (env.fee_vault, env.vault_authority);
    env.put_token(vault, USDC_MINT, authority, 5_000_000, TOKEN_PROGRAM);
    env
}

#[test]
fn the_admin_withdraws_what_it_chooses_to_the_treasury() {
    let mut env = funded();
    let (admin, to) = (env.admin.insecure_clone(), env.treasury);
    env.withdraw(&admin, to, 2_000_000).expect("withdraw");
    assert_eq!(env.balance(&env.treasury), 2_000_000);
    assert_eq!(env.balance(&env.fee_vault), 3_000_000);
}

#[test]
fn a_withdrawal_anywhere_but_the_treasury_is_refused() {
    let mut env = funded();
    let admin = env.admin.insecure_clone();
    let (user, own) = (env.user_usdc, env.admin_usdc);
    assert_code(env.withdraw(&admin, user, 1), 6008);
    assert_code(env.withdraw(&admin, own, 1), 6008);
}

#[test]
fn nobody_but_the_admin_withdraws() {
    let mut env = funded();
    let (guardian, to) = (env.guardian.insecure_clone(), env.treasury);
    assert_code(env.withdraw(&guardian, to, 1), 6009);
}

#[test]
fn a_proposed_treasury_takes_over_only_once_accepted() {
    let mut env = funded();
    let admin = env.admin.insecure_clone();
    let (old, next) = (env.treasury, env.admin_usdc);
    env.set_treasury(&admin, next).expect("propose");
    assert_code(env.withdraw(&admin, next, 1), 6008);
    env.withdraw(&admin, old, 1).expect("the old treasury is still live");
    env.accept_treasury(&admin, next).expect("the admin owns admin_usdc, so it accepts");
    assert_code(env.withdraw(&admin, old, 1), 6008);
    env.withdraw(&admin, next, 1).expect("withdraw to the new treasury");
    assert_eq!(env.balance(&env.admin_usdc), 1);
}
```

- [ ] **Step 4: Run all program tests**

```bash
cd programs && cargo build-sbf && cargo test
```

Expected: every test passes (4 unit, 6 admin, 20 trade, 4 withdraw).

- [ ] **Step 5: Commit**

```bash
git add programs/router
git commit -m "feat(router): fees leave the vault only for the treasury the admin set"
```

---

### Task 7: Inner instructions on a read transaction

**Files:**

- Modify: `packages/chain/src/ports.ts`, `packages/chain/src/solana/rpc.ts`, `packages/chain/src/solana/rpc.test.ts`

**Interfaces:**

- Produces: `InnerInstruction { programId: string; accounts: readonly string[]; data: string /* base58 */ }`; `TransactionDetail.innerInstructions?: readonly InnerInstruction[]`, present only when the transaction has at least one unparsed inner instruction.

- [ ] **Step 1: Write the failing test**

In `packages/chain/src/solana/rpc.test.ts`, inside `describe("SolanaRpc.transaction", ...)`:

```ts
/* A program's own event, emitted by a self-CPI, arrives unparsed: program, accounts, base58 data. */
it("keeps the inner instructions the node could not parse", async () => {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    result: {
      blockTime: 1_790_000_000,
      transaction: { message: { accountKeys: [{ pubkey: FIXTURE_OWNER }] } },
      meta: {
        fee: 5000,
        preBalances: [1],
        postBalances: [1],
        innerInstructions: [
          {
            index: 2,
            instructions: [
              {
                programId: "Router1111111111111111111111111111111111111",
                accounts: ["EventAuth111111111111111111111111111111111"],
                data: "3Bxs4h24hBtQy9rw",
              },
              {
                programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                parsed: { type: "transfer", info: {} },
              },
            ],
          },
        ],
      },
    },
  };
  const rpc = new SolanaRpc({ rpcUrl: RPC, fetch: fakeFetch({ [RPC]: body }) });
  expect((await rpc.transaction(SIGNATURE))?.innerInstructions).toEqual([
    {
      programId: "Router1111111111111111111111111111111111111",
      accounts: ["EventAuth111111111111111111111111111111111"],
      data: "3Bxs4h24hBtQy9rw",
    },
  ]);
});
```

- [ ] **Step 2: Run to see it fail**

```bash
pnpm --filter @mercury/chain exec vitest run src/solana/rpc.test.ts
```

Expected: FAIL, `innerInstructions` is undefined.

- [ ] **Step 3: Implement**

`packages/chain/src/ports.ts`, beside `TransactionDetail`:

```ts
/** An instruction a program ran inside another that the node could not parse: a program's own event, for one. */
export interface InnerInstruction {
  readonly programId: string;
  readonly accounts: readonly string[];
  /** Base58, as jsonParsed reports it. */
  readonly data: string;
}
```

and in `TransactionDetail`:

```ts
  /** Unparsed inner instructions, in order. Absent when there are none. */
  readonly innerInstructions?: readonly InnerInstruction[];
```

`packages/chain/src/solana/rpc.ts`: extend `RpcParsedInstruction` with

```ts
  readonly accounts?: readonly string[];
  readonly data?: string;
```

and in `transaction()`, after `const instructions = [...]`:

```ts
const inner = (meta.innerInstructions ?? [])
  .flatMap((group) => group.instructions)
  .flatMap((ix) =>
    ix.data === undefined ? [] : [{ programId: ix.programId, accounts: ix.accounts ?? [], data: ix.data }],
  );
```

and add to the returned object:

```ts
      ...(inner.length > 0 ? { innerInstructions: inner } : {}),
```

(Absent rather than empty, so the existing exact-equality tests stay as they are.)

- [ ] **Step 4: Run**

```bash
pnpm --filter @mercury/chain test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/chain/src
git commit -m "feat(chain): keep the inner instructions a node could not parse"
```

---

### Task 8: The router client

**Files:**

- Create: `services/api/src/router/program.ts`, `services/api/src/router/instructions.ts`, `services/api/src/router/event.ts`, `services/api/src/router/router.test.ts`

**Interfaces:**

- Consumes: Task 7's `InnerInstruction`.
- Produces:
  - `program.ts`: `OPEN_TRADE`, `CLOSE_TRADE`, `EVENT_IX_TAG`, `TRADE_FILLED` (Uint8Array), `MAX_FEE_RATE = 10_000`, `INSTRUCTIONS_SYSVAR`, `TOKEN_2022_PROGRAM`, `RouterAccounts { programId, config, vaultAuthority, eventAuthority }`, `routerAccounts(programId: Address): Promise<RouterAccounts>`, `feeRate(bps: number): number`, `feeOn(amount: bigint, rate: number): bigint`, `associatedTokenAddressFor(owner: Address, mint: Address, program: Address): Promise<Address>`.
  - `instructions.ts`: `TradeAccounts`, `OpenTradeArgs`, `encodeOpenTrade(a): Uint8Array`, `openTradeInstruction(t, a): Instruction`, `closeTradeInstruction(t, orderId: Uint8Array): Instruction`, `uuidBytes(id: string): Uint8Array`, `uuidFrom(bytes: Uint8Array): string`.
  - `event.ts`: `TradeFilled`, `decodeTradeFilledBody(body: Uint8Array): TradeFilled`, `tradeFilledEvents(tx: TransactionDetail, router: RouterAccounts): TradeFilled[]`.

- [ ] **Step 1: Write the failing tests**

`services/api/src/router/router.test.ts`:

```ts
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getAddressEncoder, getBase58Decoder, getU64Encoder, type Address } from "@solana/kit";
import type { TransactionDetail } from "@mercury/chain";
import {
  CLOSE_TRADE,
  EVENT_IX_TAG,
  OPEN_TRADE,
  TRADE_FILLED,
  feeOn,
  feeRate,
  routerAccounts,
} from "./program.js";
import { encodeOpenTrade, uuidBytes, uuidFrom } from "./instructions.js";
import { tradeFilledEvents } from "./event.js";

const PROGRAM = "FpSzEnBD2BJuis285Lu3PatL463iiygtqm4rTXVVZG7W" as Address;
const USER = "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6";
const SPYX = "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ORDER = "8f14e45f-ceea-467a-9f0b-bc2a5e8c1d3e";
const sha8 = (s: string) => [...createHash("sha256").update(s).digest().subarray(0, 8)];

describe("router constants", () => {
  it("match Anchor's discriminators", () => {
    expect([...OPEN_TRADE]).toEqual(sha8("global:open_trade"));
    expect([...CLOSE_TRADE]).toEqual(sha8("global:close_trade"));
    expect([...TRADE_FILLED]).toEqual(sha8("event:TradeFilled"));
  });

  it("writes a friend's 37.5 bps as a whole rate, and rounds a fee down", () => {
    expect(feeRate(50)).toBe(5_000);
    expect(feeRate(37.5)).toBe(3_750);
    expect(feeOn(100_000_000n, 3_750)).toBe(375_000n);
    expect(feeOn(199n, 5_000)).toBe(0n);
  });
});

describe("encodeOpenTrade", () => {
  it("lays the arguments out as the program reads them, 85 bytes", () => {
    const data = encodeOpenTrade({
      orderId: uuidBytes(ORDER),
      side: "sell",
      feeRate: 5_000,
      buyFee: 0n,
      networkFee: 10_000n,
      grossIn: 100_000_000n,
      minOut: 790_000_000n,
      preIn: 100_000_000n,
      preOut: 0n,
      affiliate: 7n,
    });
    expect(data.length).toBe(85);
    expect([...data.subarray(0, 8)]).toEqual([...OPEN_TRADE]);
    expect(uuidFrom(data.subarray(8, 24))).toBe(ORDER);
    expect(data[24]).toBe(1);
    expect(new DataView(data.buffer, data.byteOffset).getUint32(25, true)).toBe(5_000);
    expect(new DataView(data.buffer, data.byteOffset).getBigUint64(77, true)).toBe(7n);
  });

  it("refuses an order id that is not 16 bytes", () => {
    expect(() => uuidBytes("not-a-uuid")).toThrow();
  });
});

describe("tradeFilledEvents", () => {
  const body = () => {
    const a = getAddressEncoder();
    const u64 = getU64Encoder();
    return Uint8Array.from([
      1,
      ...uuidBytes(ORDER),
      ...a.encode(USER as Address),
      0,
      ...a.encode(USDC as Address),
      ...a.encode(SPYX as Address),
      ...u64.encode(100_000_000n),
      ...u64.encode(12_345_678n),
      ...u64.encode(10_000n),
      ...u64.encode(500_000n),
      ...u64.encode(1_005_714_560_286n),
      ...u64.encode(7n),
    ]);
  };
  const tx = async (programId: string, account: string): Promise<TransactionDetail> => ({
    signature: "sig",
    blockTime: 1_790_000_000,
    succeeded: true,
    accountKeys: [],
    feeLamports: 0n,
    preLamports: [],
    postLamports: [],
    preTokens: [],
    postTokens: [],
    innerInstructions: [
      {
        programId,
        accounts: [account],
        data: getBase58Decoder().decode(Uint8Array.from([...EVENT_IX_TAG, ...TRADE_FILLED, ...body()])),
      },
    ],
  });

  it("reads the event the router emitted", async () => {
    const router = await routerAccounts(PROGRAM);
    const [e] = tradeFilledEvents(await tx(PROGRAM, router.eventAuthority), router);
    expect(e).toEqual({
      version: 1,
      orderId: ORDER,
      user: USER,
      side: "buy",
      inputMint: USDC,
      outputMint: SPYX,
      spent: 100_000_000n,
      got: 12_345_678n,
      networkFee: 10_000n,
      mercuryFee: 500_000n,
      multiplierE12: 1_005_714_560_286n,
      affiliate: 7n,
    });
  });

  /* Anyone can print bytes; nobody else can sign as the router's event authority. */
  it("ignores the same bytes from another program, or without the event authority", async () => {
    const router = await routerAccounts(PROGRAM);
    expect(tradeFilledEvents(await tx(USER, router.eventAuthority), router)).toEqual([]);
    expect(tradeFilledEvents(await tx(PROGRAM, USER), router)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

```bash
pnpm --filter @mercury/api exec vitest run src/router/router.test.ts
```

Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`services/api/src/router/program.ts`:

```ts
import { getAddressEncoder, getProgramDerivedAddress, type Address } from "@solana/kit";
import { ASSOCIATED_TOKEN_PROGRAM } from "../relay/usdc.js";

/** Anchor's discriminators: the first eight bytes of sha256("global:<name>") and sha256("event:<Name>"). */
export const OPEN_TRADE = Uint8Array.from([125, 254, 110, 105, 226, 33, 232, 107]);
export const CLOSE_TRADE = Uint8Array.from([161, 199, 69, 82, 9, 63, 203, 42]);
export const TRADE_FILLED = Uint8Array.from([178, 143, 149, 27, 109, 147, 88, 118]);
/** What every `emit_cpi!` event starts with. */
export const EVENT_IX_TAG = Uint8Array.from([0xe4, 0x45, 0xa5, 0x2e, 0x51, 0xcb, 0x9a, 0x1d]);

/** 1% in hundredths of a basis point: the program's hard cap. */
export const MAX_FEE_RATE = 10_000;
export const INSTRUCTIONS_SYSVAR = "Sysvar1nstructions1111111111111111111111111" as Address;
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" as Address;

export interface RouterAccounts {
  readonly programId: Address;
  readonly config: Address;
  readonly vaultAuthority: Address;
  readonly eventAuthority: Address;
}

const pda = async (programId: Address, seed: string): Promise<Address> =>
  (await getProgramDerivedAddress({ programAddress: programId, seeds: [new TextEncoder().encode(seed)] }))[0];

export const routerAccounts = async (programId: Address): Promise<RouterAccounts> => ({
  programId,
  config: await pda(programId, "config"),
  vaultAuthority: await pda(programId, "vault"),
  eventAuthority: await pda(programId, "__event_authority"),
});

/** Hundredths of a basis point, so a friend's 37.5 bps is a whole 3750. */
export const feeRate = (bps: number): number => Math.round(bps * 100);

/** The program's own arithmetic: rounded down. */
export const feeOn = (amount: bigint, rate: number): bigint => (amount * BigInt(rate)) / 1_000_000n;

/** The associated token account for any token program; xStocks are Token-2022. */
export const associatedTokenAddressFor = async (
  owner: Address,
  mint: Address,
  program: Address,
): Promise<Address> => {
  const e = getAddressEncoder();
  const [address] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM,
    seeds: [e.encode(owner), e.encode(program), e.encode(mint)],
  });
  return address;
};
```

`services/api/src/router/instructions.ts`:

```ts
import { AccountRole, getU32Encoder, getU64Encoder, type Address, type Instruction } from "@solana/kit";
import { CLOSE_TRADE, INSTRUCTIONS_SYSVAR, OPEN_TRADE, type RouterAccounts } from "./program.js";

/** The accounts both halves take, in the order the program compares them. */
export interface TradeAccounts {
  readonly router: RouterAccounts;
  readonly user: Address;
  readonly feeVault: Address;
  readonly relayerUsdc: Address;
  /** USDC on a buy, the stock on a sell. */
  readonly userIn: Address;
  /** The stock on a buy, USDC on a sell. May not exist yet. */
  readonly userOut: Address;
  readonly usdcMint: Address;
  readonly stockMint: Address;
  readonly usdcTokenProgram: Address;
}

export interface OpenTradeArgs {
  /** Mercury's order UUID as 16 bytes, so the event joins the order row. */
  readonly orderId: Uint8Array;
  readonly side: "buy" | "sell";
  /** Hundredths of a basis point. */
  readonly feeRate: number;
  /** Buys only; zero on a sell. */
  readonly buyFee: bigint;
  readonly networkFee: bigint;
  readonly grossIn: bigint;
  readonly minOut: bigint;
  readonly preIn: bigint;
  readonly preOut: bigint;
  readonly affiliate: bigint;
}

const u32 = getU32Encoder();
const u64 = getU64Encoder();

export const encodeOpenTrade = (a: OpenTradeArgs): Uint8Array => {
  if (a.orderId.length !== 16) throw new Error("an order id is 16 bytes");
  return Uint8Array.from([
    ...OPEN_TRADE,
    ...a.orderId,
    a.side === "buy" ? 0 : 1,
    ...u32.encode(a.feeRate),
    ...u64.encode(a.buyFee),
    ...u64.encode(a.networkFee),
    ...u64.encode(a.grossIn),
    ...u64.encode(a.minOut),
    ...u64.encode(a.preIn),
    ...u64.encode(a.preOut),
    ...u64.encode(a.affiliate),
  ]);
};

const shared = (t: TradeAccounts, userIn: AccountRole, userOut: AccountRole) => [
  { address: t.user, role: AccountRole.READONLY_SIGNER },
  { address: t.router.config, role: AccountRole.READONLY },
  { address: t.feeVault, role: AccountRole.WRITABLE },
  { address: t.relayerUsdc, role: AccountRole.WRITABLE },
  { address: t.userIn, role: userIn },
  { address: t.userOut, role: userOut },
  { address: t.usdcMint, role: AccountRole.READONLY },
  { address: t.stockMint, role: AccountRole.READONLY },
  { address: t.usdcTokenProgram, role: AccountRole.READONLY },
  { address: INSTRUCTIONS_SYSVAR, role: AccountRole.READONLY },
];

export const openTradeInstruction = (t: TradeAccounts, a: OpenTradeArgs): Instruction => ({
  programAddress: t.router.programId,
  accounts: shared(t, AccountRole.WRITABLE, AccountRole.READONLY),
  data: encodeOpenTrade(a),
});

export const closeTradeInstruction = (t: TradeAccounts, orderId: Uint8Array): Instruction => ({
  programAddress: t.router.programId,
  accounts: [
    ...shared(t, AccountRole.READONLY, AccountRole.WRITABLE),
    { address: t.router.eventAuthority, role: AccountRole.READONLY },
    { address: t.router.programId, role: AccountRole.READONLY },
  ],
  data: Uint8Array.from([...CLOSE_TRADE, ...orderId]),
});

export const uuidBytes = (id: string): Uint8Array => {
  const hex = id.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error(`not a uuid: ${id}`);
  return Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
};

export const uuidFrom = (bytes: Uint8Array): string => {
  const h = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};
```

`services/api/src/router/event.ts`:

```ts
import { getAddressDecoder, getBase58Encoder } from "@solana/kit";
import type { TransactionDetail } from "@mercury/chain";
import { EVENT_IX_TAG, TRADE_FILLED, type RouterAccounts } from "./program.js";
import { uuidFrom } from "./instructions.js";

/** What the router says a trade moved. Amounts are raw, in each mint's smallest unit. */
export interface TradeFilled {
  readonly version: number;
  readonly orderId: string;
  readonly user: string;
  readonly side: "buy" | "sell";
  readonly inputMint: string;
  readonly outputMint: string;
  /** Out of the input account: tokens on a sell, USDC with both fees on a buy. */
  readonly spent: bigint;
  /** Into the output account, before a sell's fees. */
  readonly got: bigint;
  readonly networkFee: bigint;
  readonly mercuryFee: bigint;
  /** The stock's effective multiplier at the fill, × 10^12. */
  readonly multiplierE12: bigint;
  readonly affiliate: bigint;
}

const BODY = 1 + 16 + 32 + 1 + 32 + 32 + 8 * 6;
const address = getAddressDecoder();

const startsWith = (data: Uint8Array, prefix: Uint8Array, at: number) =>
  prefix.every((b, i) => data[at + i] === b);

export const decodeTradeFilledBody = (body: Uint8Array): TradeFilled => {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const u64 = (at: number) => view.getBigUint64(at, true);
  return {
    version: body[0]!,
    orderId: uuidFrom(body.subarray(1, 17)),
    user: address.decode(body.subarray(17, 49)),
    side: body[49] === 0 ? "buy" : "sell",
    inputMint: address.decode(body.subarray(50, 82)),
    outputMint: address.decode(body.subarray(82, 114)),
    spent: u64(114),
    got: u64(122),
    networkFee: u64(130),
    mercuryFee: u64(138),
    multiplierE12: u64(146),
    affiliate: u64(154),
  };
};

/**
 * Every TradeFilled the router emitted in this transaction. Only an inner
 * instruction from the router whose first account is its event authority
 * counts: anyone can put these bytes in a log, nobody else can sign as that PDA.
 */
export const tradeFilledEvents = (tx: TransactionDetail, router: RouterAccounts): TradeFilled[] =>
  (tx.innerInstructions ?? []).flatMap((ix) => {
    if (ix.programId !== router.programId || ix.accounts[0] !== router.eventAuthority) return [];
    const data = Uint8Array.from(getBase58Encoder().encode(ix.data));
    if (data.length < 16 + BODY || !startsWith(data, EVENT_IX_TAG, 0) || !startsWith(data, TRADE_FILLED, 8))
      return [];
    return [decodeTradeFilledBody(data.subarray(16, 16 + BODY))];
  });
```

- [ ] **Step 4: Run**

```bash
pnpm --filter @mercury/api exec vitest run src/router/router.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/router
git commit -m "feat(api): build the router's instructions and read its TradeFilled event"
```

---

### Task 9: Routed builds, with the size fallback

**Files:**

- Modify: `packages/chain/src/jupiter/lite.ts`, `packages/chain/src/jupiter/lite.test.ts`, `services/api/src/relay/build.ts`, `services/api/src/relay/build.test.ts`, `services/api/src/app.ts`
- Create: `services/api/src/router/trade.ts`, `services/api/src/router/trade.test.ts`

**Interfaces:**

- Consumes: Task 8's client.
- Produces:
  - `JupiterLiteConfig.maxAccounts?: number`.
  - `build.ts`: `RouterBuildDeps { accounts: RouterAccounts; feeVault: Address; relayerUsdc: Address; lookupTable: Address; balance(owner: string, mint: string): Promise<bigint>; mintProgram(mint: string): Promise<Address> }`; `RoutedTrade { orderId; stockMint; feeRate; buyFee; networkFee; grossIn; minOut; affiliate }`; `SponsoredBuildDeps.router?`, `SponsoredBuildInput.routed?`; `buildSponsored(...) → Promise<{ wire: string; routed: boolean }>`; exported `usdcBaseUnits(usdc: Decimal): bigint`; `MAX_TRANSACTION_BYTES = 1232`.
  - `trade.ts`: `routedTradeFor(input: { orderId: string; side: "buy" | "sell"; agreedUsd: string; stockMint: string; quoteRaw: unknown; charge: TradeCharge }): RoutedTrade`.

- [ ] **Step 1: `maxAccounts` on the quote, test first**

In `packages/chain/src/jupiter/lite.test.ts`:

```ts
it("caps the route's accounts when told to, so a routed trade still fits", async () => {
  let seen = "";
  const lite = new JupiterLite({
    maxAccounts: 40,
    fetch: (async (input: RequestInfo | URL) => {
      seen = String(input);
      return new Response(JSON.stringify({ outAmount: "1" }), { status: 200 });
    }) as typeof fetch,
  });
  await lite.quote({ side: "buy", mint: NVDAX_MINT, decimals: 8, amount: D(10) });
  expect(seen).toContain("maxAccounts=40");
});
```

Run `pnpm --filter @mercury/chain exec vitest run src/jupiter/lite.test.ts` → FAIL. Then in `lite.ts` add `readonly maxAccounts?: number;` to `JupiterLiteConfig`, a `private readonly maxAccounts: number | undefined;` set in the constructor, and after the `slippageBps` line in `quote()`:

```ts
// The router's two instructions take room a 3–4 pool route already uses; 40 kept every
// tested $10k route under the size limit for at most a basis point of price.
if (this.maxAccounts !== undefined) url.searchParams.set("maxAccounts", String(this.maxAccounts));
```

Run again → PASS.

- [ ] **Step 2: Routed fields from an order, test first**

`services/api/src/router/trade.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import { routedTradeFor } from "./trade.js";

const charge = { usdc: D("0.51"), lamports: 5000, network: D("0.01"), mercury: D("0.5"), mercuryBps: 50 };

describe("routedTradeFor", () => {
  it("passes a buy's agreed dollars, its fee and the route's floor", () => {
    const t = routedTradeFor({
      orderId: "8f14e45f-ceea-467a-9f0b-bc2a5e8c1d3e",
      side: "buy",
      agreedUsd: "100",
      stockMint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
      quoteRaw: { inAmount: "99490000", otherAmountThreshold: "12000000" },
      charge,
    });
    expect(t).toMatchObject({
      feeRate: 5_000,
      buyFee: 500_000n,
      networkFee: 10_000n,
      grossIn: 100_000_000n,
      minOut: 12_000_000n,
      affiliate: 0n,
    });
  });

  it("nets both fees out of a sell's floor, and carries no buy fee", () => {
    const t = routedTradeFor({
      orderId: "8f14e45f-ceea-467a-9f0b-bc2a5e8c1d3e",
      side: "sell",
      agreedUsd: "0",
      stockMint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
      quoteRaw: { inAmount: "100000000", otherAmountThreshold: "800000000" },
      charge: { ...charge, mercuryBps: 37.5 },
    });
    expect(t).toMatchObject({
      feeRate: 3_750,
      buyFee: 0n,
      grossIn: 100_000_000n,
      minOut: 800_000_000n - 10_000n - 3_000_000n,
    });
  });
});
```

`services/api/src/router/trade.ts`:

```ts
import { D } from "@mercury/core";
import type { TradeCharge } from "../relay/fee.js";
import { usdcBaseUnits, type RoutedTrade } from "../relay/build.js";
import { feeOn, feeRate } from "./program.js";

/**
 * What `open_trade` needs to know about an order. A buy's fee is the one the
 * server already took out of the amount, so the swap and the program agree to
 * the unit; a sell's is the rate, applied by the program to what arrives, and
 * its floor is the route's minus both fees at that rate.
 */
export const routedTradeFor = (input: {
  readonly orderId: string;
  readonly side: "buy" | "sell";
  /** The dollars the buyer agreed to, fees included. Unused on a sell. */
  readonly agreedUsd: string;
  readonly stockMint: string;
  /** Jupiter's quote: `inAmount` and `otherAmountThreshold`, raw. */
  readonly quoteRaw: unknown;
  readonly charge: TradeCharge;
}): RoutedTrade => {
  const raw = input.quoteRaw as { inAmount?: string; otherAmountThreshold?: string };
  const rate = feeRate(input.charge.mercuryBps);
  const networkFee = usdcBaseUnits(input.charge.network);
  const floor = BigInt(raw.otherAmountThreshold ?? "0");
  const selling = input.side === "sell";
  const sellFloor = floor - networkFee - feeOn(floor, rate);
  return {
    orderId: input.orderId,
    stockMint: input.stockMint,
    feeRate: rate,
    buyFee: selling ? 0n : usdcBaseUnits(input.charge.mercury),
    networkFee,
    grossIn: selling ? BigInt(raw.inAmount ?? "0") : usdcBaseUnits(D(input.agreedUsd)),
    minOut: selling ? (sellFloor > 0n ? sellFloor : 0n) : floor,
    affiliate: 0n,
  };
};
```

- [ ] **Step 3: The routed path in `buildSponsored`, test first**

Append to `services/api/src/relay/build.test.ts`:

```ts
import { routerAccounts, TOKEN_2022_PROGRAM } from "../router/program.js";

const ROUTER = "FpSzEnBD2BJuis285Lu3PatL463iiygtqm4rTXVVZG7W" as Address;

const routed = {
  orderId: "8f14e45f-ceea-467a-9f0b-bc2a5e8c1d3e",
  stockMint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
  feeRate: 5_000,
  buyFee: 500_000n,
  networkFee: 10_000n,
  grossIn: 100_000_000n,
  minOut: 1n,
  affiliate: 0n,
};

const routerDeps = async () => ({
  accounts: await routerAccounts(ROUTER),
  feeVault: "FeeVau1t111111111111111111111111111111111111" as Address,
  relayerUsdc: "Re1ayerUsdc11111111111111111111111111111111" as Address,
  lookupTable: TABLE,
  balance: async () => 0n,
  mintProgram: async () => TOKEN_2022_PROGRAM,
});

describe("buildSponsored through the router", () => {
  it("puts open_trade before Jupiter's instructions and close_trade after them, with no separate charge", async () => {
    const { wire, routed: wasRouted } = await buildSponsored(deps({ router: await routerDeps() }), {
      quote: { quoteId: "q", raw: {} },
      owner: BUYER,
      side: "buy" as const,
      feeUsdc: D("0.51"),
      routed,
    });
    expect(wasRouted).toBe(true);
    const programs = read(wire).programs.filter((p) => p !== "ComputeBudget111111111111111111111111111111");
    expect(programs[0]).toBe(ROUTER);
    expect(programs.at(-1)).toBe(ROUTER);
    expect(programs).not.toContain(TOKEN);
  });

  it("falls back to today's transaction when the routed one would not fit", async () => {
    const big = { ...jupiter.swapInstruction, data: Buffer.alloc(1100).toString("base64") };
    const quotes = {
      ...deps().quotes,
      buildSwapInstructions: async () => ({
        computeBudget: [],
        setup: [],
        swap: big,
        cleanup: null,
        lookupTables: [TABLE],
      }),
    };
    const { routed: wasRouted } = await buildSponsored(
      deps({ router: await routerDeps(), quotes: quotes as never }),
      {
        quote: { quoteId: "q", raw: {} },
        owner: BUYER,
        side: "buy" as const,
        feeUsdc: D("0.51"),
        routed,
      },
    );
    expect(wasRouted).toBe(false);
  });
});
```

Run → FAIL.

Then in `services/api/src/relay/build.ts`:

- Export the converter: rename `toBaseUnits` to `export const usdcBaseUnits` and update its one call site.
- Add:

```ts
import {
  closeTradeInstruction,
  openTradeInstruction,
  uuidBytes,
  type TradeAccounts,
} from "../router/instructions.js";
import { associatedTokenAddressFor, type RouterAccounts } from "../router/program.js";
import { TOKEN_PROGRAM } from "./usdc.js";

/** Solana's limit for a v0 transaction, signatures included. */
export const MAX_TRANSACTION_BYTES = 1232;

export interface RouterBuildDeps {
  readonly accounts: RouterAccounts;
  readonly feeVault: Address;
  readonly relayerUsdc: Address;
  /** Mercury's table: config, fee vault, relayer USDC, event authority, sysvar, mints, programs. */
  readonly lookupTable: Address;
  /** The owner's raw balance of a mint now; zero for an account that does not exist. */
  readonly balance: (owner: string, mint: string) => Promise<bigint>;
  /** The token program a mint belongs to. */
  readonly mintProgram: (mint: string) => Promise<Address>;
}

export interface RoutedTrade {
  readonly orderId: string;
  readonly stockMint: string;
  readonly feeRate: number;
  readonly buyFee: bigint;
  readonly networkFee: bigint;
  readonly grossIn: bigint;
  readonly minOut: bigint;
  readonly affiliate: bigint;
}
```

- `SponsoredBuildDeps` gains `readonly router?: RouterBuildDeps;`; `SponsoredBuildInput` gains `readonly routed?: RoutedTrade;`; the return type becomes `Promise<{ wire: string; routed: boolean }>`.
- After the lookup-table check and before the legacy charge, insert:

```ts
/*
 * Through the router when it is set up and the order says how: open_trade
 * before Jupiter's instructions, close_trade after, and the fees inside them
 * instead of a separate transfer. Too large for one transaction, or a table
 * we cannot read, and the trade goes the way it always has.
 */
if (deps.router !== undefined && input.routed !== undefined) {
  const r = deps.router;
  const t = input.routed;
  const owner = input.owner as Address;
  const [stockProgram, routerTables] = await Promise.all([
    r.mintProgram(t.stockMint),
    deps.lookups.read([r.lookupTable]),
  ]);
  if (routerTables.has(r.lookupTable)) {
    const usdcAccount = await associatedTokenAddressFor(owner, USDC_MINT as Address, TOKEN_PROGRAM);
    const stockAccount = await associatedTokenAddressFor(owner, t.stockMint as Address, stockProgram);
    const buying = input.side === "buy";
    const [userIn, userOut] = buying ? [usdcAccount, stockAccount] : [stockAccount, usdcAccount];
    const [preIn, preOut] = await Promise.all([
      r.balance(input.owner, buying ? USDC_MINT : t.stockMint),
      r.balance(input.owner, buying ? t.stockMint : USDC_MINT),
    ]);
    const accounts: TradeAccounts = {
      router: r.accounts,
      user: owner,
      feeVault: r.feeVault,
      relayerUsdc: r.relayerUsdc,
      userIn,
      userOut,
      usdcMint: USDC_MINT as Address,
      stockMint: t.stockMint as Address,
      usdcTokenProgram: TOKEN_PROGRAM,
    };
    const orderId = uuidBytes(t.orderId);
    const open = openTradeInstruction(accounts, { ...t, orderId, side: input.side, preIn, preOut });
    const close = closeTradeInstruction(accounts, orderId);
    const routedTx = composeSponsored({
      relayer,
      blockhash: lifetime.blockhash,
      lastValidBlockHeight: lifetime.lastValidBlockHeight,
      computeBudget: instructions.computeBudget.map(toInstruction),
      charge: null,
      chargePosition: "before",
      swap: [
        open,
        ...instructions.setup.map(toInstruction),
        toInstruction(instructions.swap),
        ...(instructions.cleanup === null ? [] : [toInstruction(instructions.cleanup)]),
        close,
      ],
      lookupTables: new Map([...tables, ...routerTables]),
    });
    if (Buffer.from(routedTx.wire, "base64").length <= MAX_TRANSACTION_BYTES) {
      deps.relay.builds.remember(routedTx.messageBytes);
      return { wire: routedTx.wire, routed: true };
    }
  }
}
```

- The legacy return becomes `return { wire, routed: false };`.

Run `pnpm --filter @mercury/api exec vitest run src/relay/build.test.ts src/router` → PASS.

- [ ] **Step 4: The execute route passes routed fields**

In `services/api/src/app.ts`, in `/v1/orders/:id/execute`, replace the `buildSponsored` call with:

```ts
const { wire: built } = await buildSponsored(
  {
    quotes: market().quotes,
    lookups: rpcLookupTables(rpc),
    relay,
    blockhash: async () => {
      const { value } = await rpc.getLatestBlockhash().send();
      return { blockhash: value.blockhash, lastValidBlockHeight: value.lastValidBlockHeight };
    },
    ...(read.router === undefined ? {} : { router: read.router }),
  },
  {
    quote,
    owner,
    feeUsdc: charge.usdc,
    side: shown.side,
    ...(read.router === undefined
      ? {}
      : {
          routed: routedTradeFor({
            orderId: order.id,
            side: shown.side,
            agreedUsd: shown.amount,
            stockMint: fresh.best.mint,
            quoteRaw: fresh.best.quoteRaw,
            charge,
          }),
        }),
  },
);
```

with `import { routedTradeFor } from "./router/trade.js";`. (`read.router` is added in Task 12; until then add `readonly router?: RouterBuildDeps;` to `ReadDeps` in `deps.ts` so this compiles.)

- [ ] **Step 5: Typecheck and test**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api test && pnpm --filter @mercury/chain test
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/chain/src/jupiter services/api/src/relay services/api/src/router services/api/src/app.ts services/api/src/deps.ts
git commit -m "feat(api): build trades through the router, and fall back when they would not fit"
```

---

### Task 10: Fills from `TradeFilled`

**Files:**

- Modify: `services/api/src/orders/fill.ts`, `services/api/src/orders/settle.ts`, `services/api/src/app.ts`
- Create: `services/api/src/orders/confirm.ts`, `services/api/src/orders/fill-event.test.ts`

**Interfaces:**

- Consumes: Task 8's `tradeFilledEvents`, `TradeFilled`.
- Produces: `Fill.mercuryFeeUsd?: Decimal`; `fillFromEvent(e: TradeFilled, decimals: number, occurredAt: Date): Fill | NotAFill`; `confirm.ts`: `ConfirmDeps`, `ConfirmInput { userId; order: StoredOrder; owner: string; signature: string }`, `ConfirmResult`, `confirmOrder(deps, input): Promise<ConfirmResult>`, `confirmDepsFor(read: ReadDeps, market: Deps): ConfirmDeps`.

- [ ] **Step 1: Write the failing test**

`services/api/src/orders/fill-event.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fillFromEvent } from "./fill.js";
import type { TradeFilled } from "../router/event.js";

const event = (over: Partial<TradeFilled> = {}): TradeFilled => ({
  version: 1,
  orderId: "8f14e45f-ceea-467a-9f0b-bc2a5e8c1d3e",
  user: "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6",
  side: "buy",
  inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  outputMint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
  spent: 100_000_000n,
  got: 12_345_678n,
  networkFee: 10_000n,
  mercuryFee: 500_000n,
  multiplierE12: 1_000_000_000_000n,
  affiliate: 0n,
  ...over,
});
const at = new Date("2026-10-21T10:00:00Z");

describe("fillFromEvent", () => {
  it("prices a buy on what the swap spent, apart from both fees", () => {
    const fill = fillFromEvent(event(), 8, at);
    if (fill.kind !== "filled") throw new Error(fill.detail);
    expect(fill.tokensRaw).toBe(12_345_678n);
    expect(fill.usd.toFixed()).toBe("99.49");
    expect(fill.feeUsd.toFixed()).toBe("0.51");
    expect(fill.mercuryFeeUsd?.toFixed()).toBe("0.5");
    expect(fill.shares.toFixed()).toBe("0.12345678");
  });

  it("prices a sell on what it fetched before fees, at the multiplier in force", () => {
    const fill = fillFromEvent(
      event({
        side: "sell",
        spent: 100_000_000n,
        got: 800_000_000n,
        mercuryFee: 4_000_000n,
        multiplierE12: 1_005_714_560_286n,
      }),
      8,
      at,
    );
    if (fill.kind !== "filled") throw new Error(fill.detail);
    expect(fill.usd.toFixed()).toBe("800");
    expect(fill.feeUsd.toFixed()).toBe("4.01");
    expect(fill.shares.toFixed(9)).toBe("1.005714560");
  });

  it("is not a fill when no shares moved", () => {
    expect(fillFromEvent(event({ got: 0n }), 8, at).kind).toBe("not_a_fill");
  });
});
```

Run `pnpm --filter @mercury/api exec vitest run src/orders/fill-event.test.ts` → FAIL.

- [ ] **Step 2: `fillFromEvent` and the recorded fee**

In `services/api/src/orders/fill.ts`: add to `Fill`:

```ts
  /** Mercury's part of `feeUsd`, when the router stated it. */
  readonly mercuryFeeUsd?: Decimal;
```

and:

```ts
import type { TradeFilled } from "../router/event.js";

/**
 * A fill as the router stated it, rather than worked out from balances. On a
 * buy the swap spent what left the wallet less both fees; on a sell it fetched
 * what arrived before them. The multiplier is the one in force at the fill.
 */
export function fillFromEvent(e: TradeFilled, decimals: number, occurredAt: Date): Fill | NotAFill {
  const buying = e.side === "buy";
  const tokensRaw = buying ? e.got : e.spent;
  if (tokensRaw === 0n) return { kind: "not_a_fill", detail: "The router recorded no shares moving." };
  const tokens = scaled(tokensRaw, decimals);
  const shares = tokens.mul(D(e.multiplierE12.toString()).div(1e12));
  const usd = buying
    ? scaled(e.spent - e.networkFee - e.mercuryFee, USDC_DECIMALS)
    : scaled(e.got, USDC_DECIMALS);
  return {
    kind: "filled",
    tokensRaw,
    tokens,
    shares,
    usd,
    feeUsd: scaled(e.networkFee + e.mercuryFee, USDC_DECIMALS),
    mercuryFeeUsd: scaled(e.mercuryFee, USDC_DECIMALS),
    pricePerShare: usd.div(shares),
    occurredAt,
  };
}
```

In `services/api/src/orders/settle.ts`, in the claim's `.set({...})`, add:

```ts
        ...(fill.mercuryFeeUsd === undefined ? {} : { mercuryFeeUsd: fixed(fill.mercuryFeeUsd) }),
```

Run the test → PASS.

- [ ] **Step 3: Move confirm into `orders/confirm.ts`**

`services/api/src/orders/confirm.ts`:

```ts
import { D, type Decimal } from "@mercury/core";
import type { TransactionDetail } from "@mercury/chain";
import { fillFromEvent, planFill, type Fill } from "./fill.js";
import type { FillDeps } from "./settle.js";
import type { StoredOrder } from "./store.js";
import { tradeFilledEvents } from "../router/event.js";
import type { RouterAccounts } from "../router/program.js";
import type { Deps, ReadDeps } from "../deps.js";

export interface ConfirmDeps {
  readonly tokenRef: FillDeps["tokenRef"];
  readonly settle: FillDeps["settle"];
  readonly decimals: (mint: string) => Promise<number | null>;
  readonly multiplier: (mint: string) => Promise<Decimal | null>;
  readonly referencePrice: (mint: string) => Promise<Decimal | null>;
  readonly transaction: (signature: string) => Promise<TransactionDetail | null>;
  readonly relayer?: string;
  readonly router?: RouterAccounts;
}

export interface ConfirmInput {
  readonly userId: string;
  readonly order: StoredOrder;
  readonly owner: string;
  readonly signature: string;
}

export type ConfirmResult =
  | { readonly kind: "refused"; readonly detail: string }
  | { readonly kind: "unknown_token" }
  | { readonly kind: "pending" }
  | { readonly kind: "not_a_fill"; readonly detail: string }
  | {
      readonly kind: "settled";
      readonly alreadySettled: boolean;
      readonly fill: Fill;
      readonly realisedPnlUsd: Decimal | null;
    };

/** The same reads for the route and the job. */
export const confirmDepsFor = (read: ReadDeps, market: Deps): ConfirmDeps => ({
  tokenRef: read.fills.tokenRef,
  settle: read.fills.settle,
  decimals: async (mint) => (await market.registry.byMint(mint))?.decimals ?? null,
  multiplier: (mint) => market.multipliers.multiplierFor(mint),
  // The underlying quote now, not the one on the order, which can be a minute older than the fill.
  referencePrice: async (mint) => (await market.prices.pricesFor([mint])).get(mint)?.pricePerShare ?? null,
  transaction: (signature) => market.history.transaction(signature),
  // Without this the charge for sponsoring is indistinguishable from money the swap spent.
  ...(read.send.relay === undefined ? {} : { relayer: read.send.relay.signer.address }),
  ...(read.router === undefined ? {} : { router: read.router.accounts }),
});

interface StoredDecision {
  readonly kind: string;
  readonly detail?: string;
  readonly side: "buy" | "sell";
  readonly ticker: string;
  readonly best: { readonly mint: string };
}

/**
 * Record an order that landed, from the chain. The route and the router-fills
 * job both come here: the router's own TradeFilled when the transaction carries
 * one for this order and wallet, the wallet's balances otherwise.
 */
export async function confirmOrder(deps: ConfirmDeps, input: ConfirmInput): Promise<ConfirmResult> {
  const decision = input.order.decision as StoredDecision;
  if (decision.kind === "refuse") return { kind: "refused", detail: decision.detail ?? "Not tradable." };
  const mint = decision.best.mint;
  const [ref, decimals, multiplier, reference] = await Promise.all([
    deps.tokenRef(mint),
    deps.decimals(mint),
    deps.multiplier(mint),
    deps.referencePrice(mint),
  ]);
  if (ref === null || decimals === null) return { kind: "unknown_token" };

  const tx = await deps.transaction(input.signature);
  if (tx === null) return { kind: "pending" };

  const event =
    deps.router === undefined || !tx.succeeded
      ? undefined
      : tradeFilledEvents(tx, deps.router).find(
          (e) => e.orderId === input.order.id && e.user === input.owner,
        );
  const occurredAt = tx.blockTime === null ? new Date() : new Date(tx.blockTime * 1000);
  const fill =
    event !== undefined
      ? fillFromEvent(event, decimals, occurredAt)
      : planFill(tx, {
          wallet: input.owner,
          side: decision.side,
          mint,
          decimals,
          multiplier: multiplier ?? D(1),
          ...(deps.relayer === undefined ? {} : { relayer: deps.relayer }),
          now: new Date(),
        });
  if (fill.kind === "not_a_fill") return fill;

  const settled = await deps.settle({
    userId: input.userId,
    orderId: input.order.id,
    signature: input.signature,
    side: decision.side,
    ticker: decision.ticker,
    mint,
    tokenId: ref.tokenId,
    instrumentId: ref.instrumentId,
    fill,
    referencePricePerShare: reference,
  });
  return {
    kind: "settled",
    alreadySettled: settled.kind === "already_settled",
    fill,
    realisedPnlUsd: settled.kind === "settled" ? settled.realisedPnlUsd : null,
  };
}
```

In `app.ts`, keep the route's request parsing, order lookup and owner check, then replace the rest of `/v1/orders/:id/confirm` with:

```ts
const result = await confirmOrder(confirmDepsFor(read, market()), {
  userId: identity.userId,
  order,
  owner,
  signature: parsed.data.signature,
});
switch (result.kind) {
  case "refused":
    return c.json(fail("instrument_not_tradable", result.detail), 409);
  case "unknown_token":
    return c.json(fail("not_found", "Unknown token."), 404);
  case "pending":
    return c.json(fail("transaction_pending", "Transaction is not settled yet. Try again shortly."), 409);
  case "not_a_fill":
    return c.json(fail("validation_failed", result.detail), 422);
  case "settled":
    return c.json({
      status: "filled",
      alreadySettled: result.alreadySettled,
      shares: toWire(result.fill.shares),
      pricePerShare: toWire(result.fill.pricePerShare),
      usd: toWire(result.fill.usd),
      feeUsd: toWire(result.fill.feeUsd),
      realisedPnlUsd: result.realisedPnlUsd === null ? null : toWire(result.realisedPnlUsd),
    });
}
```

with `import { confirmDepsFor, confirmOrder } from "./orders/confirm.js";`. Keep the existing comments on the route (why the chain, why retryable). Move the "refuse" decision check into `confirmOrder` as written.

- [ ] **Step 4: Run every API test**

```bash
pnpm --filter @mercury/api typecheck && pnpm --filter @mercury/api test
```

Expected: pass, the existing confirm tests included.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/orders services/api/src/app.ts
git commit -m "feat(api): settle a routed trade from the router's own event"
```

---

### Task 11: The `router-fills` job

**Files:**

- Create: `services/api/src/orders/router-fills.ts`, `services/api/src/orders/router-fills.test.ts`

**Interfaces:**

- Consumes: Task 10's `confirmOrder` shape, Task 8's `tradeFilledEvents`.
- Produces: `RouterFillsDeps { router: RouterAccounts; signatures(address, page): Promise<readonly SignatureRef[]>; transaction(sig): Promise<TransactionDetail | null>; userIdForWallet(address): Promise<string | null>; order(userId, id): Promise<StoredOrder | null>; confirm(input: ConfirmInput): Promise<ConfirmResult> }`; `routerFills(deps): () => Promise<RouterFillsPass>` with `RouterFillsPass { checked: number; settled: number; failed: number }`.

- [ ] **Step 1: Write the failing tests**

`services/api/src/orders/router-fills.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Address } from "@solana/kit";
import { routerAccounts } from "../router/program.js";
import { tradeFilledEvents, type TradeFilled } from "../router/event.js";
import { routerFills, type RouterFillsDeps } from "./router-fills.js";

// The decoder has its own tests; here it only says which orders a transaction carries.
vi.mock("../router/event.js", () => ({ tradeFilledEvents: vi.fn() }));

const ORDER = "8f14e45f-ceea-467a-9f0b-bc2a5e8c1d3e";
const WALLET = "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6";
const tx = {
  signature: "sig-1",
  blockTime: 1,
  succeeded: true,
  accountKeys: [],
  feeLamports: 0n,
  preLamports: [],
  postLamports: [],
  preTokens: [],
  postTokens: [],
};
const order = (status: string) => ({
  id: ORDER,
  decision: {},
  status,
  usdAmount: "100",
  max: false,
  mercuryFeeUsd: null,
  createdAt: "",
});

const deps = async (over: Partial<RouterFillsDeps> = {}): Promise<RouterFillsDeps> => ({
  router: await routerAccounts("FpSzEnBD2BJuis285Lu3PatL463iiygtqm4rTXVVZG7W" as Address),
  signatures: async () => [{ signature: "sig-1", slot: 1, blockTime: 1, failed: false }],
  transaction: async () => tx,
  userIdForWallet: async () => "user-1",
  order: async () => order("executing") as never,
  confirm: vi
    .fn()
    .mockResolvedValue({ kind: "settled", alreadySettled: false, fill: {}, realisedPnlUsd: null }),
  ...over,
});

const filled = { orderId: ORDER, user: WALLET } as unknown as TradeFilled;

describe("routerFills", () => {
  beforeEach(() => vi.mocked(tradeFilledEvents).mockReturnValue([filled]));

  it("settles an order the app never confirmed", async () => {
    const d = await deps();
    expect(await routerFills(d)()).toEqual({ checked: 1, settled: 1, failed: 0 });
    expect(d.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", owner: WALLET, signature: "sig-1" }),
    );
  });

  it("leaves an order that is already filled, and a wallet nobody owns", async () => {
    const settledOrder = await deps({ order: async () => order("filled") as never });
    await routerFills(settledOrder)();
    expect(settledOrder.confirm).not.toHaveBeenCalled();
    const stranger = await deps({ userIdForWallet: async () => null });
    await routerFills(stranger)();
    expect(stranger.confirm).not.toHaveBeenCalled();
  });

  it("asks again for a transaction the node cannot return yet, and once it is handled, never again", async () => {
    let ready = false;
    const d = await deps({ transaction: async () => (ready ? tx : null) });
    const pass = routerFills(d);
    await pass();
    expect(d.confirm).not.toHaveBeenCalled();
    ready = true;
    await pass();
    await pass();
    expect(d.confirm).toHaveBeenCalledTimes(1);
  });

  it("skips a failed transaction", async () => {
    const d = await deps({
      signatures: async () => [{ signature: "sig-1", slot: 1, blockTime: 1, failed: true }],
    });
    expect((await routerFills(d)()).checked).toBe(0);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement**

`services/api/src/orders/router-fills.ts`:

```ts
import type { SignaturePage, SignatureRef, TransactionDetail } from "@mercury/chain";
import { tradeFilledEvents } from "../router/event.js";
import type { RouterAccounts } from "../router/program.js";
import type { ConfirmInput, ConfirmResult } from "./confirm.js";
import type { StoredOrder } from "./store.js";

export interface RouterFillsDeps {
  readonly router: RouterAccounts;
  readonly signatures: (address: string, page: SignaturePage) => Promise<readonly SignatureRef[]>;
  readonly transaction: (signature: string) => Promise<TransactionDetail | null>;
  readonly userIdForWallet: (address: string) => Promise<string | null>;
  readonly order: (userId: string, orderId: string) => Promise<StoredOrder | null>;
  readonly confirm: (input: ConfirmInput) => Promise<ConfirmResult>;
}

export interface RouterFillsPass {
  readonly checked: number;
  readonly settled: number;
  readonly failed: number;
}

const PAGE = 50;
const REMEMBERED = 5_000;
const OPEN: readonly string[] = ["pending", "executing"];

/**
 * Confirm stops being the only way a trade gets recorded. Each pass reads the
 * router's newest transactions and settles any order still open, so a fill
 * whose app never called confirm is in the books within seconds, not read as a
 * transfer ten minutes later. Settling is a conditional claim, so racing the
 * route's own confirm writes nothing twice.
 */
export const routerFills = (deps: RouterFillsDeps): (() => Promise<RouterFillsPass>) => {
  const handled = new Set<string>();
  return async () => {
    let checked = 0;
    let settled = 0;
    let failed = 0;
    for (const ref of await deps.signatures(deps.router.programId, { limit: PAGE })) {
      if (ref.failed || handled.has(ref.signature)) continue;
      checked++;
      const tx = await deps.transaction(ref.signature);
      if (tx === null) continue; // Not readable yet; the next pass asks again.
      let done = true;
      for (const e of tradeFilledEvents(tx, deps.router)) {
        try {
          const userId = await deps.userIdForWallet(e.user);
          if (userId === null) continue;
          const order = await deps.order(userId, e.orderId);
          if (order === null || !OPEN.includes(order.status)) continue;
          const result = await deps.confirm({ userId, order, owner: e.user, signature: ref.signature });
          if (result.kind === "pending") done = false;
          else if (result.kind === "settled" && !result.alreadySettled) settled++;
        } catch {
          failed++;
          done = false;
        }
      }
      if (done) handled.add(ref.signature);
    }
    while (handled.size > REMEMBERED) handled.delete(handled.values().next().value as string);
    return { checked, settled, failed };
  };
};
```

- [ ] **Step 3: Run**

```bash
pnpm --filter @mercury/api exec vitest run src/orders/router-fills.test.ts
```

Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add services/api/src/orders/router-fills.ts services/api/src/orders/router-fills.test.ts
git commit -m "feat(api): settle routed trades the app never confirmed"
```

---

### Task 12: Configuration, wiring, ADR

**Files:**

- Create: `services/api/src/router/deps.ts`, `docs/adr/0018-trade-router.md`
- Modify: `services/api/src/deps.ts`, `services/api/src/index.ts`, `services/api/.env.example`, `docs/superpowers/specs/2026-10-21-trade-router-design.md`

**Interfaces:**

- Consumes: everything above.
- Produces: `Config.routerProgramId?`, `Config.routerLookupTable?`; `routerBuildDeps(config, relayerAddress, rpcUrl, chain): Promise<RouterBuildDeps | undefined>`; `ReadDeps.router?: RouterBuildDeps`; the `router-fills` job.

- [ ] **Step 1: Config, test first**

In the existing `deps.test.ts` (or `readConfig` tests), add:

```ts
it("reads the router only as a pair", () => {
  const base = { DATABASE_URL: "postgres://x", PRIVY_APP_ID: "app", SOLANA_RPC_URL: "https://rpc" };
  expect(readConfig({ ...base }).routerProgramId).toBeUndefined();
  expect(readConfig({ ...base, ROUTER_PROGRAM_ID: "P", ROUTER_LOOKUP_TABLE: "T" })).toMatchObject({
    routerProgramId: "P",
    routerLookupTable: "T",
  });
  expect(() => readConfig({ ...base, ROUTER_PROGRAM_ID: "P" })).toThrow("ROUTER_LOOKUP_TABLE");
});
```

In `deps.ts`: add to `Config`

```ts
  /** The trade router. Unset, every trade goes the way it always has. Set as a pair with the table. */
  readonly routerProgramId?: string;
  /** Mercury's lookup table for the router's fixed accounts. */
  readonly routerLookupTable?: string;
```

in `readConfig`, before the return:

```ts
const routerProgramId = env["ROUTER_PROGRAM_ID"] || undefined;
const routerLookupTable = env["ROUTER_LOOKUP_TABLE"] || undefined;
if ((routerProgramId === undefined) !== (routerLookupTable === undefined)) {
  throw new Error("ROUTER_PROGRAM_ID and ROUTER_LOOKUP_TABLE are set together or not at all");
}
```

and spread `...(routerProgramId ? { routerProgramId, routerLookupTable } : {})` into the returned config. In `buildDeps`, change `quotes: new JupiterLite(jupiter)` to

```ts
    quotes: new JupiterLite({ ...jupiter, ...(config.routerProgramId ? { maxAccounts: 40 } : {}) }),
```

Add `readonly router?: RouterBuildDeps;` to `ReadDeps` if Task 9 did not, and a last parameter `router?: RouterBuildDeps` to `buildReadDeps` that it spreads in as `...(router === undefined ? {} : { router })`.

- [ ] **Step 2: `routerBuildDeps`**

`services/api/src/router/deps.ts`:

```ts
import { createSolanaRpc, type Address } from "@solana/kit";
import { USDC_MINT, type ChainReader } from "@mercury/chain";
import type { Config } from "../deps.js";
import type { RouterBuildDeps } from "../relay/build.js";
import { associatedTokenAddress } from "../relay/usdc.js";
import { routerAccounts } from "./program.js";

/**
 * The router, ready for the build, or undefined when it is not configured or
 * there is no relayer to pay for it. A mint's token program never changes, so
 * it is read once.
 */
export async function routerBuildDeps(
  config: Config,
  relayer: string | undefined,
  chain: Pick<ChainReader, "tokenBalances">,
): Promise<RouterBuildDeps | undefined> {
  if (
    config.routerProgramId === undefined ||
    config.routerLookupTable === undefined ||
    relayer === undefined
  ) {
    return undefined;
  }
  const accounts = await routerAccounts(config.routerProgramId as Address);
  const rpc = createSolanaRpc(config.solanaRpcUrl);
  const programs = new Map<string, Address>();
  return {
    accounts,
    feeVault: await associatedTokenAddress(accounts.vaultAuthority, USDC_MINT as Address),
    relayerUsdc: await associatedTokenAddress(relayer as Address, USDC_MINT as Address),
    lookupTable: config.routerLookupTable as Address,
    balance: async (owner, mint) =>
      (await chain.tokenBalances(owner)).find((b) => b.mint === mint)?.rawAmount ?? 0n,
    mintProgram: async (mint) => {
      const known = programs.get(mint);
      if (known !== undefined) return known;
      const { value } = await rpc.getAccountInfo(mint as Address, { encoding: "base64" }).send();
      if (value === null) throw new Error(`mint ${mint} not found`);
      programs.set(mint, value.owner);
      return value.owner;
    },
  };
}
```

- [ ] **Step 3: Wire the job**

In `services/api/src/index.ts`, before `const read = buildReadDeps(...)`:

```ts
const router = await routerBuildDeps(config, relay?.signer.address, deps.chain);
```

pass `router` as `buildReadDeps`'s new last argument, and after the `wallet-events` job register:

```ts
/**
 * Five seconds: a routed trade the app never confirmed is in the books before
 * the person looks again. Only when the router is configured.
 */
if (read.router !== undefined) {
  const routed = read.router;
  const pass = routerFills({
    router: routed.accounts,
    signatures: (address, page) => deps.history.signatures(address, page),
    transaction: (signature) => deps.history.transaction(signature),
    userIdForWallet: async (address) =>
      (await auth.db.query.wallets.findFirst({ where: eq(wallets.address, address) }))?.userId ?? null,
    order: (userId, id) => read.orders.byId(userId, id),
    confirm: (input) => confirmOrder(confirmDepsFor(read, deps), input),
  });
  every("router-fills", 5_000, async () => {
    const s = await pass();
    if (s.settled === 0 && s.failed === 0) return null;
    return `${s.settled} settled of ${s.checked} checked` + (s.failed > 0 ? `, ${s.failed} failed` : "");
  });
}
```

Import `routerBuildDeps` from `./router/deps.js`, `routerFills` from `./orders/router-fills.js`, `confirmDepsFor` and `confirmOrder` from `./orders/confirm.js`, `eq` from `drizzle-orm` and `wallets` from `./db/schema.js`. Add the row to the job table in `index.ts`:

```
 * | `router-fills`       | 5s      | `order`, `lot`, `position`, through settle; only when the router is configured |
```

- [ ] **Step 4: `.env.example`**

Append to `services/api/.env.example`:

```
# Optional. Mercury's trade router (docs/adr/0018-trade-router.md). Set both or neither.
# Unset, every trade goes the way it always has. The table holds the router's fixed accounts.
ROUTER_PROGRAM_ID=
ROUTER_LOOKUP_TABLE=
```

- [ ] **Step 5: ADR 0018 and the spec**

Both were written before the build: `docs/adr/0018-trade-router.md` (status **proposed**) and the
spec. Change the ADR's status line to `**Status:** accepted · <the date it ships>`, then correct
anything in either that the build changed: an error code, an account, a number in "Sizes and
limits". If nothing changed, change only the status.

- [ ] **Step 6: Everything**

```bash
pnpm lint && pnpm -r typecheck && pnpm -r test && npx prettier --check docs services packages
cd programs && cargo build-sbf && cargo test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add services/api docs/adr/0018-trade-router.md docs/superpowers/specs/2026-10-21-trade-router-design.md
git commit -m "feat(api): configure the router, run router-fills, and write down the decision"
```
