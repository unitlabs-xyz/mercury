# Account-level privacy for a Mercury Account on Solana: balances, earn, credit line, liquidation, identity, payments and card spend (status as of October 2026)

Scope note: these notes build on what earlier research already established (Token-2022 CT re-enabled June 2026, single v1 transaction, amounts hidden but parties visible, one auditor key per mint, hooks see u64::MAX, no production stablecoin or stock token using CT, issuers holding CT authority, Umbra/Cloak screened pools, Helius Rings, omnibus custody, AMLR Art. 79). They do not repeat those points. Status labels: LIVE (mainnet, real users), ALPHA (mainnet but early or unaudited), TESTNET/DEVNET, RESEARCH/PITCH.

## 1. Confidential DeFi on encrypted state: who has private lending or private collateral live, and how health checks and liquidations work

### Takeaway

As of October 2026 I found no production lending market on any chain where collateral or debt is private. FHE (Zama on Ethereum) and MPC (Arcium on Solana) are live for confidential transfers, OTC trades and swaps, but lending exists only as vendor designs, testnet code and hackathon pitches. The published designs agree on one pattern: positions stay encrypted, only a binary "healthy / liquidatable" signal is decrypted, and the position is opened up only at liquidation, through threshold decryption or keys held by the protocol. Nobody has shipped a fully specified version of who learns what at liquidation time.

### Cited Findings

#### Arcium (MPC, Solana)

- ALPHA: Arcium launched Mainnet Alpha on Solana on Feb 2, 2026, with Umbra (shielded transfers, encrypted swaps) as the first live app — [The Block](https://www.theblock.co/post/387564/arcium-launches-privacy-preserving-mainnet-alpha-on-solana-as-umbra-debuts-shielded-finance-layer). Messari covers the same release — [Messari](https://messari.io/report/arcium-mainnet-alpha-release). One secondary source says the network launched with four independent node operators and is moving toward full decentralization (via search results summarizing [Solana Compass](https://solanacompass.com/projects/arcium)).
- C-SPL status unconfirmed: C-SPL (the Confidential SPL standard combining SPL Token, Token-2022, the CT extension and Arcium MPC) was unveiled at Breakpoint 2025 with a Q1 2026 target — [Solana Compass, Breakpoint 25 keynote](https://solanacompass.com/learn/breakpoint-25/keynote-arcium-yannik-schrade). Arcium's roadmap placed it on Solana Devnet during Public Testnet Phase 2, before mainnet — [Arcium roadmap update](https://arcium.substack.com/p/arcium-roadmap-update). A later Arcium post on X describes strong interest from stablecoin, payments and confidential-balance use cases but does not say C-SPL is on mainnet — [Arcium on X](https://x.com/Arcium/status/2046976636134760777). Secondary sources describe "early access being rolled out to selected teams". I could not confirm a mainnet C-SPL launch by Oct 2026.
- Arcium says C-SPL lets smart contracts and PDAs hold and move private token balances. That is the capability plain Token-2022 CT lacks for lending — [Arcium Build](https://www.arcium.com/build).
- Arcium encryption model: data is typed `Enc<Owner, T>`. With `Mxe` as owner, "the nodes can collectively decrypt the data under dishonest-majority assumptions". With `Shared`, data is encrypted under an X25519-derived shared secret between client and MXE, using the Rescue cipher in CTR mode (128-bit security). `reveal` decrypts globally, and "sealing" re-encrypts a value to a chosen recipient — [Arcium docs: Encryption](https://docs.arcium.com/developers/encryption).
- Each MXE sets its own MPC protocol, encryption scheme and security model. MXEs do not share state with each other, and Arcium "does not provide global encrypted state by default" (search snippet of [Arcium: What is Arcium](https://arcium.com/what-is-arcium); the page 404'd on direct fetch).
- Lending on Arcium is only a pitch. Zkredit, a hackathon submission, describes encrypted collateral and debt with the health factor computed under MPC and liquidations still triggered, but I could not verify that it runs — [Devfolio: zkredit](https://devfolio.co/projects/zkredit-9142). The only live Arcium demo cited at Accelerate 2025 was an encrypted order book on devnet — [Solana Compass, Accelerate 25](https://solanacompass.com/learn/accelerate-25/ship-or-die-at-accelerate-2025-you-can-and-should-be-encrypted).

#### Zama fhEVM / ERC-7984 (FHE, Ethereum)

- LIVE (transfers): Zama's protocol went live on Ethereum mainnet on Dec 30, 2025, with a first confidential cUSDT transfer — [Bex](https://bex.co/blog/2026/04/02/zama-fhe-fully-homomorphic-encryption-blockchain-privacy-primitive); [MEXC](https://blog.mexc.com/news/ethereums-privacy-breakthrough-zama-mainnet-delivers-confidential-transactions/). In March 2026, GSR executed a confidential OTC trade between two KYC'd counterparties on mainnet — [Zama](https://www.zama.org/); [Bex](https://bex.co/blog/2026/03/13/zama-fhe-protocol-first-confidential-institutional-otc-trade-encrypted-ethereum).
- As of May 7, 2026, the live ERC-7984 confidential wrappers were USDC, USDT, WETH, BRON, ZAMA, tGBP and XAUt. The live mainnet apps are a Portfolio App (shield/unshield/transfer, cUSDT onramp), staking and bridging. "Confidential Vaults" and "Confidential Swap" appear only in navigation. No lending app is named — [Zama protocol update, May 7 2026](https://www.zama.org/post/zama-protocol-update-new-sdk-delegated-decryption-developer-tooling-and-protocol-apps).
- Zama does not support Solana or the SVM for confidential tokens. Only the $ZAMA token is bridged to Solana — [Zama protocol update](https://www.zama.org/post/zama-protocol-update-new-sdk-delegated-decryption-developer-tooling-and-protocol-apps).
- Zama's own confidential-lending design (Feb 20, 2025) encrypts collateral and debt as `euint` and evaluates eligibility (for example a 50% LTV) without decryption. It admits liquidation is unsolved ("Encrypted values complicate triggers") and suggests encrypted events or off-chain relays to notify liquidators. Its uncollateralized variant gives the lender decryption rights on default. Leakage it lists: timing and transaction patterns, public oracle prices hinting at encrypted values, and liquidity split between cWETH and WETH. Aave, Morpho and Euler are named only as candidates to rebuild — [Zama blog](https://www.zama.org/post/onboard-the-next-trillions-in-defi-with-confidential-lending).
- ERC-7984 mechanics relevant to lending integration. Balances are ciphertext handles and the standard is not ERC-20 compliant. Operators with an expiry can move tokens but cannot decrypt balances, and the docs warn an operator can "take all of your tokens". Receiver callbacks (`IERC7984Receiver`) return an encrypted bool, and the token refunds if it is false. Unwrapping is asynchronous: mark the value publicly decryptable, the Gateway decrypts off-chain, then `checkSignatures` verifies — [OpenZeppelin Confidential Contracts](https://docs.openzeppelin.com/confidential-contracts/token).
- RESEARCH/PITCH: null402 calls itself the first confidential lending protocol on fhEVM and shows "fhEVM Mainnet Ready". I found no verified deployment or audit — [null402](https://null402.vercel.app/). Ztocks (encrypted-collateral synthetic stocks) runs on Sepolia — [Ztocks](https://ztocks.vercel.app/).

#### Fhenix CoFHE (FHE, EVM)

- TESTNET: Fhenix says CoFHE runs on Ethereum Sepolia, Arbitrum Sepolia and Base Sepolia, with mainnet to follow — [Fhenix](https://fhenix.io/). A HackerNoon piece claims it is live on Ethereum, Arbitrum and Base. That conflicts with Fhenix's own page and is unverified — [HackerNoon](https://hackernoon.com/canopy-and-fhenix-want-to-make-encrypted-data-the-default-state-of-onchain-apps).
- Fhenix encrypted-lending design (published Dec 30, 2025, updated Aug 25, 2026): collateral, debt and pool liquidity are `euint64`. The health factor is encrypted and only a binary result (HF≥1 or HF<1) is published. Liquidation eligibility and auction state are public, while per-address queue position stays hidden. It proposes sealed bids, commit-reveal or Dutch auctions. Decryption needs an explicit on-chain grant (`FHE.allow*`) and is threshold-based, so no single node can decrypt a position. An auditor can be granted access to specific ciphertexts. Threshold decryption can reveal aggregates such as proof of reserves, TVL and utilization. Sender, timing, gas and contract interactions stay visible. No encrypted lending protocol is named as live, and its CCS 2025 decryption benchmarks are "not yet integrated" into production — [Fhenix blog](https://www.fhenix.io/blog/encrypted-lending-ethereum-fully-homomorphic-encryption-private-defi).

#### Inco Lightning (TEE, Solana devnet)

- DEVNET BETA: Inco Lightning runs on Solana Devnet in beta (and Base Sepolia). Its confidential SPL program stores encrypted `Euint128`/`Ebool` values off-chain as handles, sets per-handle decryption permissions through an allowance-PDA system, and uses "attested decryption" (Ed25519-signed by TEE covalidators) — [Inco Lightning](https://www.inco.org/lightning); [Inco SVM docs](https://docs.inco.org/svm/tutorials/confidential-spl-token/overview); [Inco devnet launch](https://www.inco.org/blog/inco-lightning-beta-launches-on-solana-devnet). Money markets appear only as a target use case — [Inco: what to build](https://www.inco.org/blog/what-to-build-with-inco).

#### MagicBlock Private Ephemeral Rollups (TEE, Solana)

- PERs run Solana program logic inside Intel TDX and settle back to Solana. Access-control rules apply per account, and the stated trade-off is trust in the hardware vendor. The docs show only a devnet endpoint — [MagicBlock docs](https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/introduction/onchain-privacy.md). A single secondary profile says a Private Payments API reached mainnet in March 2026 and that no third-party audit was surfaced — [Solana Compass: MagicBlock](https://solanacompass.com/projects/Magicblock).

#### Helius Privacy / Solana Foundation options (Solana)

- DEVNET: Helius Privacy was "Live on Solana Devnet" as of Aug 25, 2026, with mainnet to follow after audit and formal verification. Private balances "can interact with Solana DeFi through cross-program invocations". Custom rings support asset allowlists, transfer limits that need approval above a threshold, allow and block lists, view-only auditors, and freeze/thaw. Operators can use Helius-managed KYC and sanctions screening. The page also says Helius "cannot freeze, move, or seize your funds", which conflicts with ring-level freeze — [Helius blog](https://helius.dev/blog/solana-privacy).
- Solana Foundation docs present three options. Confidential Balances. Privacy Rings (beta), where Custom Rings let developers build "swaps, staking, yield, and lending using private escrow". Private Channels, institution-operated private execution where the operator sets participation, ordering, compliance and auditor visibility, with value entering and leaving through mainnet — [Solana docs: Privacy for financial applications](https://solana.com/docs/finance/privacy).

#### Penumbra, Aztec, Renegade (non-Solana references)

- Penumbra: a single multi-asset shielded pool with sealed-bid batch-auction DEX (ZSwap) — [Penumbra protocol](https://protocol.penumbra.zone/). Flow encryption, which threshold-encrypts swap amounts so validators decrypt only per-pair batch totals, did not ship in V1. Flow contributions are "in the clear until a future network upgrade", and the design gives no protection for single-swap batches — [Penumbra: Flow Encryption](https://protocol.penumbra.zone/main/crypto/flow.html); [Penumbra: Batch Swaps](https://protocol.penumbra.zone/main/dex/swap.html). I found no Penumbra lending or shielded-collateral product. A Jan 2026 Bern MSc thesis rates Penumbra's privacy highly — [Univ. of Bern thesis](https://crypto.unibe.ch/archive/theses/2025.msc.noah.maggio.pdf).
- Aztec: Alpha Network went live on Ethereum mainnet around Apr 1, 2026. Private contracts are written in Noir, with client-side proving on the user's device. Aztec describes it as early, unaudited software where critical bugs are expected — [Aztec docs: Alpha](https://docs.aztec.network/participate/alpha); [The Defiant](https://thedefiant.io/news/blockchains/aztec-launches-alpha-network-ethereum-s-first-l2-for-private-smart-contracts). A critical proving-system vulnerability in Alpha v4 was disclosed on Mar 27, 2026, with the fix planned for v5 in July 2026 — [Aztec blog](https://aztec.network/blog/alpha-network-security-what-to-expect). Fhenix's Aug 2026 post refers to "Aztec (Alpha V5)", which weakly suggests v5 exists — [Fhenix](https://www.fhenix.io/blog/encrypted-lending-ethereum-fully-homomorphic-encryption-private-defi). I found no live Aztec lending app.
- Renegade (MPC + ZK dark pool) is LIVE on Arbitrum (since Sept 2024) and Base, not Solana — [Renegade](https://renegade.fi/); [The Block](https://www.theblock.co/post/314959/on-chain-dark-pool-renegade-goes-live-on-arbitrum). A job post claims $336M all-time volume — [Dragonfly jobs](https://jobs.dragonfly.xyz/companies/renegade/jobs/65709922-gtm-lead).

#### Why privacy matters for liquidation

- Fhenix argues that public collateral and debt balances give MEV bots a "hit-list", and exact health factors help them time attacks — [Fhenix](https://www.fhenix.io/what-is-fhe).
- An empirical study of Aave, Compound, MakerDAO and dYdX (over 85% of Ethereum lending) found that liquidation designs sell excessive discounted collateral at borrowers' expense — [Qin et al., IMC'21](https://arxiv.org/pdf/2106.06389). The BEV study counted 31,057 liquidations yielding $89.18M liquidator profit over 28 months, including destructive front-running among liquidators — [Qin et al., "How dark is the forest?"](https://arxiv.org/pdf/2101.05511).

### Inferences

- The common liquidation architecture is: (a) the position is encrypted at rest; (b) a computation network (MPC cluster, FHE coprocessor or TEE) evaluates `HF<1` against public oracle prices and reveals only that bit; (c) on a true result, either the position is revealed to the winning liquidator or auction, or the protocol liquidates internally and reveals only the auction lot. Who sees the position at liquidation is therefore a design choice. The most private option is protocol-run liquidation, where the protocol sells the collateral itself via a sealed or Dutch auction, so outside liquidators bid on a lot and never see the borrower's full book.
- A Mercury credit line differs from open DeFi because Mercury is the only lender and is a KYC'd intermediary. Mercury itself, as risk manager, can hold decryption rights to every position, so the privacy goal becomes "private from the public and other users, fully visible to Mercury risk and its auditors". That is much easier than trustless private lending. It can be built today with protocol-held view keys plus Arcium MXE or Mercury-run keepers, without waiting for FHE lending research.
- Leakage remains even with perfect encryption. Liquidation events, auction sizes, timing of collateral top-ups and oracle-driven batch timing are public signals (Zama and Fhenix both concede timing and metadata leakage). Batch liquidations and batched top-ups reduce linkability, and Penumbra's small-batch caveat applies directly.

### Gaps

- No primary source confirms C-SPL on Solana mainnet by Oct 2026. Arcium's current docs pages for C-SPL returned 404.
- I found no description of Arcium's MPC protocol thresholds (Cerberus / Manticore) or liveness guarantees from a primary source. The encryption docs state only "dishonest-majority" for `Mxe`-owned data.
- I found no audited, mainnet private-collateral lending protocol on any chain. null402 and zkredit are unverified claims.
- Whether Aztec v5 shipped, and whether any lending app runs on Aztec Alpha, is unverified.

## 2. Using confidential balances in Solana programs: can a program verify a CT balance, or must funds be made public first?

### Takeaway

A Solana program cannot read or decrypt a CT balance. It can verify ZK statements about ciphertexts: the ZK ElGamal Proof program exposes equality, range, zero-balance and validity proofs, and any program can consume them through instruction data or context-state accounts. A PDA can also own a confidential token account and move it by CPI. A Solana Foundation DvP prototype (Oct 2026) shows the working pattern: a PDA-owned confidential escrow whose ElGamal "view" key is shared off-chain with the parties and an operator. Collateral can therefore stay confidential in the public's eyes, but someone holding the escrow key (user, Mercury or a keeper) must generate the proofs. The program cannot compute health on its own.

### Cited Findings

- The ZK ElGamal Proof program's instructions: `VerifyPubkeyValidity`, `VerifyZeroCiphertext`, `VerifyCiphertextCommitmentEquality`, `VerifyCiphertextCiphertextEquality`, `VerifyBatchedRangeProofU64/U128/U256`, grouped-ciphertext 2- and 3-handle validity (plus batched variants), `VerifyPercentageWithCap` and `CloseContextState` — [Anza docs: ZK ElGamal Proof program](https://docs.anza.xyz/runtime/zk-elgamal-proof).
- These proofs are not restricted to Token-2022: "Programs should directly access the context data from the proof instruction data and use it in its program logic". Context-state accounts persist proof data and are useful "when ZK proofs are required from PDAs" — [Anza docs](https://docs.anza.xyz/runtime/zk-elgamal-proof).
- The Token program adds incoming encrypted amounts to the pending balance without decrypting, i.e. additive homomorphism. Twisted ElGamal messages are encoded as Pedersen commitments, so Pedersen-based ZK proof systems apply. Decryption is a discrete log: 32-bit values take seconds and 64-bit values are impractical, which is why transfers are capped at 48 bits and split into 16-bit low and 32-bit high parts. The available balance is also stored AES-GCM-SIV-encrypted (`decryptable_available_balance`) for fast owner reads — [Solana Program docs: Confidential balances encryption](https://www.solana-program.com/docs/confidential-balances/encryption).
- Solana Foundation DvP confidential cash leg (issue opened Oct 7, 2026; implementation in PR #20, Oct 16, 2026) — [GitHub solana-foundation/dvp #19](https://github.com/solana-foundation/dvp/issues/19):
  - A `SwapDvp` PDA owns the Token-2022 confidential escrow account and is the only signer. Every escrow step, including transfers and closing proof accounts, runs by CPI.
  - "The escrow ElGamal key is not a custody key": holders can read amounts and produce proofs but cannot move funds.
  - Per-swap escrow ElGamal and AE keys are derived from a seed via HMAC-SHA256 under an operator master key that can sit in a KMS or HSM. The seed is shared with both users and the settlement operator, so the operator can read amounts.
  - At Create the program stores Enc(lo) and Enc(hi) of the amount. At Settle, two `CiphertextCiphertextEquality` proofs bind transfer ciphertexts to the stored ones and the program compares bytes. Terminal states use a zero-balance proof.
  - Create (553 bytes) and Settle (729 bytes) fit in v0 transactions. The transfer range proof needs v1 or staging via SPL Record, and funded-leg refunds take several transactions because proofs are first verified into context accounts.
  - Limits: parties, mints, timing, instruction types and whether a surplus exists stay public. A party can invalidate prepared proofs by applying a pending credit, forcing a rebuild. If the seed copies and master key are lost, funds cannot be recovered. While the ZK ElGamal Proof program is disabled, no confidential exit works. "The mint auditor, if configured, sees all amounts."
- An independent explainer says the native CT variant lets only directly owned accounts handle confidential balances and that "Confidential DeFi is therefore not yet natively possible" — [SolanaHub](https://solanahub.de/en/knowledge/privacy-on-solana-explained/). The DvP prototype above partly contradicts this for PDA-escrow patterns.
- Helius (devnet) says private balances can interact with Solana DeFi through CPI — [Helius](https://helius.dev/blog/solana-privacy). Solana's docs say Custom Rings support lending via private escrow — [Solana docs](https://solana.com/docs/finance/privacy).
- Arcium's C-SPL aims to let programs and PDAs hold private balances and run MPC computation over token state — [Arcium Build](https://www.arcium.com/build).

### Inferences

- **"Prove collateral ≥ X" on plain CT.** The building blocks exist. A user can submit a `CiphertextCommitmentEquality` proof linking their available-balance ciphertext to a Pedersen commitment, plus a range proof that (commitment − X) ≥ 0. Token-2022's withdraw already proves "remaining balance ≥ 0" this way. A lending program could check those proofs against the account's on-chain ciphertext. However, a balance in the user's own account is not locked collateral, since the user can spend it in the next transaction. Real collateral must move into a PDA-owned confidential escrow, as in DvP, which preserves amount privacy from the public.
- **Health under plain ElGamal.** Additive homomorphism plus multiplication by a public scalar (an oracle price) is mathematically enough to form an encrypted `collateral·price − debt·k`. Only a key holder can then produce the range proof showing it is negative. Under CT alone, liquidation therefore requires Mercury or a keeper to hold the escrow key (DvP "Option B"), which makes the design "private from the public, transparent to Mercury". Arcium MXE-owned state or C-SPL is the route for computing health without any single key holder. Neither the Anza nor the Solana Program docs explicitly document on-chain scalar multiplication on CT ciphertexts, so this needs engineering validation.
- **Design hazards from DvP.** Proof invalidation by an incoming pending credit is a griefing vector for liquidations against confidential collateral accounts. A Mercury escrow should not accept third-party credits, or should apply pending first. Disabling the proof program freezes confidential exits, so a public-escrow fallback path (or a governance-controlled exit) is a risk control the credit line needs.
- The per-mint auditor key sees every transfer into and out of the escrow, so whoever holds the auditor key for USDC-equivalent or xStock mints (the issuer) sees the whole credit book's flows.

### Gaps

- I found no Anza or Solana Foundation roadmap item titled "confidential balances usable by programs" beyond the docs above, the DvP prototype, Rings and Private Channels.
- I could not confirm whether Solana's curve25519 syscalls make on-chain homomorphic scalar multiplication of CT ciphertexts practical within compute limits. No source gave compute-unit costs.
- Questions on Private Channels, planned Token-2022 changes and Foundation plans were explicitly left open in the DvP thread.

## 3. Private identity and compliance: ZK KYC credentials, selective disclosure, view-key escrow, and how risk teams and auditors get visibility

### Takeaway

Solana's native attestation layer (SAS, live since May 2025) is signed on-chain data with no ZK, so it proves "KYC'd by issuer X" in public but must not hold PII. Mature ZK identity sits mostly outside Solana: Human ID "Clean Hands" pairs a ZK proof with escrowed encrypted identity, and the EU age app shows boolean ZK-style proofs. Regulation still requires the regulated entity (Mercury or its KYC provider) to collect and keep identity data. So the realistic model is "full KYC off-chain at Mercury, minimal attestation on-chain, selective disclosure by delegated or escrowed decryption", with aggregate proofs for solvency.

### Cited Findings

#### On-chain attestations

- The Solana Attestation Service launched on mainnet in May 2025 — [Range blog](https://www.range.org/blog/introducing-solana-attestation-service); [Solana Compass](https://about.solanacompass.com/learn/accelerate-25/ship-or-die-2025-solana-attestation-service). Its site lists Civic, Range, Sumsub, Solana ID and Trusta Labs among users — [attest.solana.com](https://attest.solana.com/). Civic announced reusable compliance credentials on SAS (search snippet; page returned 403) — [Blockworks](https://www.blockworks.com/news/solana-attestation-service-sas-permissions). The model: issuers such as exchanges and KYC providers attest about wallets using predefined schemas — [Range](https://www.range.org/blog/introducing-solana-attestation-service).
- SAS attestation data is "stored directly on-chain", with schema, credential reference, expiry timestamp, nonce and an optional token account. Credentials have an authority and authorized signers. Expiry exists but no revocation mechanism is described beyond closure by signers or authorities. The docs' identity example lists full name, DOB and nationality as fields, and they mention no ZK or privacy features — [Solana docs: Attestations](https://solana.com/docs/tools/attestations/overview).

#### ZK KYC with escrowed identity

- Human ID "Proof of Clean Hands" (docs updated Jun 8, 2026): the user completes KYC plus sanctions and PEP screening, an issuer signs the credential, and the user generates a ZK proof. The user also encrypts name and DOB to Human Network and selects a smart contract that sets decryption conditions. A requester needs both the ciphertext (from an observer node) and decryption rights from that contract — [Human ID docs](https://docs.id.human.tech/architecture/clean-hands). Verifiers learn "the answer to one question and nothing more", e.g. verified and unsanctioned — [Human Tech: Individual Verifications](https://docs.passport.human.tech/building-with-passport/individual-verifications/introduction). Name and DOB are processed in RAM only, and sanctions checks use sanctions.io — [Human Tech privacy policy](https://human.tech/policy). Deployments include an Aztec testnet bridge minting "clean" USDC/ETH/WBTC — [Holonym Q3 2025 update](https://passport.human.tech/blog/holonym-foundation-quarterly-update-q3-2025). Holonym's own critique of pure ZK KYC is that verified users become fully pseudonymous, so businesses cannot meet AML and sanctions obligations, hence the escrow — [Holonym Medium](https://medium.com/feed/holonym).
- Sanctions status is the weak link. A ZK sanctions proof helps only if refreshed against the current list, and OFAC screening continues for the life of the account (vendor source) — [Zyphe](https://www.zyphe.com/resources/blog/zero-knowledge-kyc-regulators-mica-fatf-amla).

#### Regulatory signals

- On Sept 23, 2026 at SIFMA, SEC Commissioner Peirce, speaking personally, proposed attribute-based credentials and ZK proofs for age, citizenship and non-sanctioned status, plus broader reliance on other firms' KYC: "What is missing is the regulatory framework...". No rule or guidance followed. She left the SEC on Oct 2, 2026. CIP still requires name, DOB, address and ID number, and records of verification data — [Zyphe summary](https://www.zyphe.com/resources/news/sec-peirce-zero-knowledge-kyc-cip-reliance-september-2026); [crypto.news](https://crypto.news/sec-peirce-backs-zero-knowledge-proofs-for-kyc/).
- The EU age-verification app was declared "technically ready" in April 2026. It gives the platform a yes/no answer without name or DOB, pilots run in Cyprus, Denmark, France, Greece, Ireland, Italy and Spain, and wide availability is expected by end-2026 — [Mobile ID World](https://www.mobileidworld.com/eu-clears-anonymous-age-verification-app-for-deployment/); [Pillitteri](https://pasqualepillitteri.it/en/news/949/eu-age-verification-app-anonymous-mini-wallet-2026-guide); [Joinble](https://joinble.io/blog/eu-age-verification-app-dsa).

#### Source-of-funds and association proofs

- Proof of Source of Funds (arXiv, June 8, 2026): the user proves with IVC-based ZK that funds derive only from a compliant sub-DAG of history without revealing topology. Updating the proof takes about 1.8 s per new transaction, and final EVM verification takes about 1.5 ms (around 800k gas) — [Kavousi, Seres, Wang, arXiv:2606.10172](https://arxiv.org/abs/2606.10172).
- Privacy Pools (0xbow) has been LIVE on Ethereum mainnet since Mar 31, 2025. Association Set Providers exclude tainted deposits, and users prove membership in a compliant set without revealing their deposit — [The Block](https://www.theblock.co/post/348959); [Spark glossary](https://www.spark.money/glossary/privacy-pool). One commentary argues Railgun's optional proof of innocence is weaker than mandatory screening (opinion) — [BlockEden](https://blockeden.xyz/blog/2026/04/12/0xbow-privacy-compliance-defi-fatf-travel-rule/).

#### Selective disclosure and view-key models

- Solana CT auditor: a mint-level ElGamal key that decrypts transfer amounts but "does not reveal an account's full balance or grant authority to move tokens" — [Solana docs](https://solana.com/docs/finance/privacy). An auditor must therefore rebuild balances from transfer history.
- Zama "delegated decryption" (May 2026) lets a designated custodian, compliance provider or regulator decrypt specific values "under defined conditions". Revocation is not described — [Zama](https://www.zama.org/post/zama-protocol-update-new-sdk-delegated-decryption-developer-tooling-and-protocol-apps).
- Fhenix grants auditors access to specific ciphertexts via `FHE.allow`, and threshold decryption can reveal aggregates (proof of reserves, TVL, utilization) — [Fhenix](https://www.fhenix.io/blog/encrypted-lending-ethereum-fully-homomorphic-encryption-private-defi).
- Arcium "sealing" re-encrypts a value to a chosen recipient — [Arcium docs](https://docs.arcium.com/developers/encryption). Inco uses per-handle allowance PDAs — [Inco SVM docs](https://docs.inco.org/svm/tutorials/confidential-spl-token/overview). Helius custom rings offer view-only, revocable auditors, with no key-management details given — [Helius](https://helius.dev/blog/solana-privacy). Solana Private Channels let the institution grant auditors whatever visibility its policy requires — [Solana docs](https://solana.com/docs/finance/privacy).

#### Aggregate solvency

- A Merkle sum tree alone can hide negative balances, so a zk-SNARK proving that all leaves are non-negative is needed. An operator can also simply exclude users to shrink liabilities — [Spark research](https://www.spark.money/research/bitcoin-exchange-proof-of-reserves-standards). PSE's Summa discontinued its proof-of-liabilities work, concluding that cost and speed were "only one small part" of the proof-of-reserves problem — [PSE Summa retrospective](https://pse.dev/blog/retrospective-summa); design at [PSE Summa part 1](https://pse.dev/blog/from-cex-to-ccex-with-summa-part-1). DAPOL defines proof of solvency as proof of liabilities plus proof of reserves — [ZKProof DAPOL proposal](https://docs.zkproof.org/pages/standards/accepted-workshop3/proposal-dapol.pdf).

### Inferences

- For Mercury, SAS fits as a public, non-PII flag ("wallet W passed Mercury KYC tier T, residency bucket R, expires E") that its programs check. Identity stays in Mercury's or its KYC vendor's systems, as CIP-style regimes require anyway. A ZK credential adds value mainly for third-party DeFi integrations that should learn only "eligible", not who.
- Three view-key escrow patterns are available. (a) Protocol-held keys: Mercury derives escrow keys under an HSM master key, as in DvP. (b) Threshold or MPC custody of decryption rights (Arcium `Mxe` owner, Zama or Fhenix threshold decryption). (c) User-chosen conditional escrow (Human ID contract-gated decryption). For a regulated consumer app, (a) for operations plus (b) or (c) for regulator access under defined conditions maps best to "selective disclosure" without "increased obfuscation".
- Risk teams and auditors need aggregates rather than per-user data. Credible options are: threshold-decrypted totals (debt outstanding, collateral by asset, utilization, bad debt); a liabilities commitment (Merkle-sum with non-negativity ZK) checked by users; and public on-chain reserves. Summa's retrospective warns that the cryptography is the easy part, while completeness (no excluded users) and reserve ownership are the hard parts.

### Gaps

- I found no primary 2026 sources on Solana deployments of zkMe, Privado ID, zkPass, Reclaim or World ID. Search results were low-quality aggregator or AI-generated pages, so no status claims are made.
- No source describes ZK proofs over SAS attestations, or a SAS privacy or selective-disclosure mode.
- No regulator text found specifically blesses view-key escrow or delegated decryption as satisfying record-keeping. This needs legal review (not legal advice).

## 4. Card spend privacy: what networks and issuers must see, and whether pooled or tokenized settlement reduces on-chain linkability

### Takeaway

Card rails always expose PAN, merchant, MCC, amount and time to the issuer, processor and network, and tokenization hides the PAN only from merchants. The real privacy issue for crypto cards is on-chain linkability. Self-custodial card programs (Gnosis Pay and similar) and per-user collateral contracts publish each spend or top-up from the user's address, and Dune already indexes them, including Solana and Rain-issued programs. Pooled or custodial settlement, or a ZK note system like Payy, breaks the per-wallet link, at the cost of custody or new trust assumptions.

### Cited Findings

- Mastercard says the network sees card number, merchant name and location, MCC, date and amount, and does not know the cardholder's identity or the items purchased — [Mastercard newsroom, 2022](https://newsroom.mastercard.com/news/press/2022/september/how-we-support-merchants-and-consumers-through-clear-consistent-principles/).
- Network tokens replace the PAN before the merchant. At the network the token is swapped back and "processed as usual by the card issuer", so the issuer sees the real account — [Evervault docs](https://docs.evervault.com/cards/network-tokens.md).
- Card custody and settlement taxonomy (May 1, 2026) — [Inco: Crypto card architecture](https://www.inco.org/blog/crypto-card-architecture-custody-settlement-privacy):
  - Custodial cards (Coinbase, Binance, Bybit, KAST) give the provider full visibility of amount, merchant, timestamp and asset, but nothing goes on-chain.
  - Self-custodial cards (Gnosis Pay, MetaMask Card, Ledger/CL Card, Ready) make "the user-to-program transfer... onchain and publicly visible", with timing and amount, linking the user's address to a known card program.
  - On-chain settlement programs (Rain, Reap) settle the issuer-to-network leg in stablecoins on Base, Solana, Polygon and Arbitrum, which exposes the issuer's own volumes and treasury.
  - "Analytics sites already show live card transactions with likely spending categories."
  - Crypto card spend grew from about $100M a month in early 2023 to over $1.5B a month by late 2025 (citing CoinDesk).
- Dune's `payments.card_transactions` dataset covers EVM, Solana, Starknet and Tron, with providers Cypher, Etherfi, Exa, Gnosis Pay, Holyheld, Ready, Redotpay and Safepal and issuers including Rain, Reap, Fiat24, Immersve, Kulipa and Wirex. Fields include `user_address`, `amount_usd`, `block_time` and `tx_type` (`card_spend`, `card_top_up`, `batch_settlement`). There is no merchant field, only receiver labels — [Dune docs](https://docs.dune.com/data-catalog/curated/payments/card-transactions).
- Gnosis Pay Safe transactions are public on Gnosis Chain. A Gnosis research guide said merchants were not trackable on-chain at the time of writing — [Gnosis research guide](https://paragraph.xyz/@gnosis-research/an-in-depth-guide-to-how-gnosis-pay-works-%F0%9F%A6%89%F0%9F%92%B3). A security writer reconstructed a person's full Gnosis Pay history from funder addresses and warned of physical-attack risk — [tzedonn substack](https://tzedonn.substack.com/p/22-crypto-cards-will-get-you-robbed).
- Rain creates a per-customer smart contract the customer controls, queries on-chain balances to authorize in under 200 ms, settles with Visa daily in stablecoins, and claims up to 60% lower collateral needs — [Rain](https://www.rain.xyz/resources/giving-stablecoins-real-world-spending-power); [Tokenized newsletter](https://newsletter.tokenizedpod.com/p/rain-puts-stablecoins-under-the-card-network). Rain's embedded wallets support 12 chains including Solana, and partners can bring third-party non-custodial wallets — [The Paypers](https://thepaypers.com/crypto-web3-and-cbdc/news/rain-launches-embedded-stablecoin-wallets-for-partner-apps).
- Payy (Visa card, launched Aug 2025) uses a UTXO note model on its ZK rollup. ZK proofs authorize spends, and transaction data stays off-chain with only state roots and deposits/withdrawals on L1 — [Forklog](https://forklog.com/en/former-apple-engineer-launches-payy-visa-card-for-private-crypto-transactions/amp); [L2BEAT](https://l2beat.com/privacy/projects/payy). L2BEAT flags no delay on code upgrades and a TVL of about $711. Sources disagree on Ethereum vs Polygon settlement — [Zero Knowledge podcast](https://zeroknowledge.fm/podcast/381/); [DefiLlama](https://defillama.com/protocol/payy).
- A Protofire blueprint describes the model where a card program reads a balance it does not own and approves in real time, with spend settling on-chain afterwards. It names Gnosis Pay (EU, since 2024) as the only live implementation — [Protofire](https://protofire.io/blueprints/crypto-cards/).

### Inferences

- For a Mercury card, the main privacy lever is the funding topology, not the card rails. The options rank roughly as follows. (a) Per-user on-chain debits at authorization time (Gnosis Pay or Rain-contract style) are the most linkable, because each authorization creates a matching on-chain event, and timing plus amount correlates with merchant receipts. (b) Per-user confidential collateral account (CT) with periodic net sweeps to a Mercury settlement pool hides amounts but still leaks debit timing and count. Sweeping on a fixed schedule or in fixed denominations reduces correlation. (c) A pooled settlement account (Mercury ledger debits an internal balance, with the pool settling to Rain or Visa in aggregate) removes the per-wallet link entirely, but is custodial for the spend float. This is the KAST or custodial model.
- A hybrid fits Mercury's "user-controlled account": the user pre-authorizes a capped spend allowance from their account into a Mercury card pool in batched, CT-encrypted top-ups. Card authorizations then hit the pool ledger, not the chain. That limits custody to the float and limits public data to "this wallet funds Mercury card".
- Even the most private design leaves Mercury (as program manager), the issuer, processor and network with full merchant-level data. Privacy gains are only against the public and other users, which matches regulatory expectations.

### Gaps

- No source documents a published merchant-timing deanonymization attack on a crypto card. The risk is inferred from Dune's indexed fields.
- I did not find how Rain-issued programs on Solana structure settlement on-chain (pooled vs per-user) beyond the per-customer contract claim, or Rain's own privacy documentation.
- Whether Gnosis Pay's announced move to a private zkEVM L2 happened is unverified.

## 5. Privacy UX and keys with Privy embedded wallets: key derivation, recovery, mobile proof times, and user disclosure

### Takeaway

Solana's recommended CT key derivation is a wallet signature over the constant `solana-conf-bal/v1`, which gives one ElGamal plus one AES key per wallet, so an embedded wallet that can sign deterministically can rebuild CT keys with nothing stored. Alternatives (`fromIkm`/`fromPrf`) decouple view keys from the signing key, which suits passkeys, enclaves and MPC. The main trade-off is that sharing the wallet-derived key discloses every confidential account, so "share a statement" needs per-account keys or proof-based statements. CT proofs (sigma protocols and Bulletproofs) are light compared with SNARKs, but I found no published mobile timing.

### Cited Findings

- Recommended default derivation: the owner signs the constant `solana-conf-bal/v1`, and both keys are derived from that signature, so nothing is stored and one wallet maps to one ElGamal keypair and one AES key across all mints. Wallets should expose a dedicated derivation flow and refuse generic `signMessage` for that prefix. They should treat the signature request like "unlocking a private view of balances" and derive on demand rather than store. For passkeys, enclaves or MPC, `ConfidentialKeys.fromIkm` and `ConfidentialKeys.fromPrf` (WebAuthn PRF) make keys "not tied to the account's signing key". Custodial or MPC providers may generate keys directly and must protect them like signing keys — [Solana CT integration guide](https://solana.com/docs/tokens/extensions/confidential-transfer/integration-guide).
- Conflict: search snippets of the same guide reference JS helpers `deriveElGamalKeypairForOwnerMint` and `deriveAeKeyForOwnerMint` that bind keys to (owner, mint), and a Rust example seeds from the token account address — [Solana CT integration guide (search snippet)](https://solana.com/docs/tokens/extensions/confidential-transfer/integration-guide.md). The fetched version describes one key set for all mints. Per-mint or per-account binding may depend on client version.
- Disclosure: under wallet-bound derivation, "sharing keys therefore discloses every confidential account, not just one" — [Solana CT integration guide](https://solana.com/docs/tokens/extensions/confidential-transfer/integration-guide).
- UX guidance: always show the public balance; unlock with a signature; show a "locked" state, not zero; show pending vs available; auto-apply pending before sends. The extension adds about 295 bytes (about 0.0015 SOL rent) per token account. Registry-based configuration (`ConfigureAccountWithRegistry`, `spl-elgamal-registry`) existed in Rust, with JS helpers not yet available at publication — [Solana CT integration guide](https://solana.com/docs/tokens/extensions/confidential-transfer/integration-guide).
- Balance reads: the AES-encrypted available balance decrypts in constant time. ElGamal decryption is a discrete log (32-bit in seconds), and large pending balances should be applied often to stay decryptable — [Solana Program docs](https://www.solana-program.com/docs/confidential-balances/encryption).
- Privy: Solana embedded wallets export by private key only, not seed phrase. Export runs in a separate-domain iframe. Programmatic export works only for TEE-based wallets, returns an encrypted key and needs Privy Support to enable it — [Privy docs: Export](https://docs.privy.io/wallets/wallets/export); [Privy docs: Programmatic export](https://docs.privy.io/wallets/wallets/programmatic-export). Privy combines TEEs with distributed key sharding — [Privy blog](https://privy.io/blog/how-privy-embedded-wallets-work). I found no Privy documentation for Token-2022 CT.
- EVM analogue: a proposal derives a BabyJubJub privacy key by hashing an EIP-712 signature — [arXiv 2507.09231](https://web3.arxiv.org/pdf/2507.09231).
- Mobile proving references (not CT-specific):
  - FibRace (Oct 2025, 2.2M proofs on 1,420 device models) found most modern phones produced a Cairo M proof in under 5 s, and devices with at least 3 GB RAM proved stably — [FibRace, arXiv:2510.14693](https://arxiv.org/pdf/2510.14693).
  - Mopro's older numbers: Keccak256 Circom took 11.0 s on an iPhone 15 Pro, and an RSA circuit crashed at about 5 GB memory. Native mobile proving is up to 10x faster than browser WASM — [Wavect, Aug 2026](https://wavect.io/blog/zero-knowledge-proofs-production-2026/).
  - Aztec contracts prove client-side on the user's device — [The Defiant](https://thedefiant.io/news/blockchains/aztec-launches-alpha-network-ethereum-s-first-l2-for-private-smart-contracts).
- Statement sharing in other systems: Arcium sealing to a recipient — [Arcium docs](https://docs.arcium.com/developers/encryption); Zama delegated decryption — [Zama](https://www.zama.org/post/zama-protocol-update-new-sdk-delegated-decryption-developer-tooling-and-protocol-apps); Inco per-handle allowances — [Inco docs](https://docs.inco.org/svm/tutorials/confidential-spl-token/overview).

### Inferences

- **Determinism risk for Privy.** Signature-derived keys only work if signing the same message always yields the same signature. Standard Ed25519 is deterministic, but threshold or MPC EdDSA signing typically uses fresh nonces. If any Privy signing path (TEE-reconstituted key vs sharded signing, or a future change) is non-deterministic, derived CT keys would change and balances would become unreadable. The keys would not be lost for funds custody, but proofs could not be generated. Safer: derive CT keys with `fromIkm` from a dedicated secret held alongside the wallet in Privy's TEE, or from passkey PRF, and add a recovery copy (for example encrypted to a Mercury HSM under the escrow model in Q3).
- **Recovery.** With wallet-signature derivation, recovering the wallet recovers the view keys. With independent IKM, Mercury needs its own backup path. DvP shows the failure mode: lose all seed copies plus the master key and confidential funds become unrecoverable.
- **Scoped disclosure.** To let a user "share a statement" without exposing everything, the cleanest options are: (a) a signed statement generated by Mercury, which already sees the data, with optional ZK equality proofs tying stated amounts to on-chain ciphertexts; (b) per-account or per-purpose derived keys, so sharing one view key exposes one account; (c) for MPC or FHE state, sealing or delegated decryption of specific values.
- **Proof times.** CT proofs (sigma protocols plus batched Bulletproofs over curve25519) are far smaller than SNARK circuits, so sub-second native mobile generation is plausible. Without published numbers, Mercury should benchmark `@solana/zk-sdk` WASM in React Native or a native Rust binding on mid-range Android before committing UX.

### Gaps

- No published proof-generation timings for Solana CT (zk-sdk) on mobile or in browser WASM.
- No Privy documentation on deterministic signing guarantees for Solana embedded wallets, or on CT support.
- The per-mint vs per-wallet key derivation discrepancy in Solana's docs is unresolved.

## 6. Threats specific to private finance: hidden insolvency, private bad debt, laundering, oracle and liquidation front-running, and mitigations

### Takeaway

Privacy removes the public monitoring that makes DeFi lending auditable. The main new risks are hidden insolvency and bad debt, laundering through private balances, and new trust and liveness dependencies (MPC clusters, TEEs, proof programs, key custodians). Privacy also reduces targeted liquidation and MEV attacks. Mitigations already exist in pieces: threshold-decrypted aggregates, binary health signals, proof-of-liabilities techniques, association-set and source-of-funds proofs, screened rings with caps and freeze, and protocol-held view keys. None has been assembled into a production private lending system.

### Cited Findings

- Hidden insolvency and bad debt: public DeFi's debt dashboards make it easier to monitor than CeFi, and privacy DeFi is a caveat to that (opinion) — [Benzinga/Zinger](https://benzinga.com/z/31193198). In a historical case of opacity around bad debt, Iron Bank froze Alpha Homora's credit line over about $30M of bad debt and pushed for a written remediation plan rather than private calls — [The Block](https://www.theblock.co/post/216832/iron-bank-tells-alpha-homora-to-take-ownership-of-its-bad-debt).
- Aggregate visibility mitigations: Fhenix's threshold decryption of aggregates (proof of reserves, TVL, utilization) and binary HF publication — [Fhenix](https://www.fhenix.io/blog/encrypted-lending-ethereum-fully-homomorphic-encryption-private-defi). Proof-of-liabilities pitfalls (negative balances, excluded users) — [Spark research](https://www.spark.money/research/bitcoin-exchange-proof-of-reserves-standards); [PSE Summa retrospective](https://pse.dev/blog/retrospective-summa).
- Laundering mitigations:
  - Association sets: Privacy Pools — [The Block](https://www.theblock.co/post/348959).
  - Source-of-funds proofs: PoSoF — [arXiv:2606.10172](https://arxiv.org/abs/2606.10172).
  - Identity escrow: Human ID — [Human ID docs](https://docs.id.human.tech/architecture/clean-hands).
  - Ring policies with allow and block lists, approval thresholds, auditor visibility, freeze/thaw and managed KYC and sanctions screening — [Helius](https://helius.dev/blog/solana-privacy).
- Front-running and MEV: public positions act as a hit-list, and hiding them removes the information advantage — [Fhenix](https://www.fhenix.io/what-is-fhe). Measured liquidation extraction and front-running are in [Qin et al. IMC'21](https://arxiv.org/pdf/2106.06389) and [Qin et al. BEV](https://arxiv.org/pdf/2101.05511). Hiding collateral composition raises an oracle-manipulation attacker's cost — [Fhenix](https://www.fhenix.io/blog/encrypted-lending-ethereum-fully-homomorphic-encryption-private-defi).
- Residual leakage: FHE leaves sender, timing, gas and contract interactions visible — [Fhenix](https://www.fhenix.io/blog/encrypted-lending-ethereum-fully-homomorphic-encryption-private-defi). Public oracle prices can hint at encrypted values, and timing patterns leak — [Zama](https://www.zama.org/post/onboard-the-next-trillions-in-defi-with-confidential-lending). Small batches give little or no protection — [Penumbra](https://protocol.penumbra.zone/main/crypto/flow.html). CT leaves parties, mints, timing and instruction types public — [DvP #19](https://github.com/solana-foundation/dvp/issues/19).
- New trust and liveness dependencies:
  - TEE vendor trust — [MagicBlock](https://docs.magicblock.gg/pages/private-ephemeral-rollups-pers/introduction/onchain-privacy.md).
  - Dishonest-majority MPC decryption by Arcium nodes — [Arcium docs](https://docs.arcium.com/developers/encryption).
  - If the proof program is disabled, no confidential exit works; master-key loss makes escrow funds unrecoverable; proofs can be griefed by pending credits — [DvP #19](https://github.com/solana-foundation/dvp/issues/19).
  - Unaudited proving systems with critical bugs (Aztec Alpha v4) — [Aztec blog](https://aztec.network/blog/alpha-network-security-what-to-expect).
  - No upgrade delay on Payy — [L2BEAT](https://l2beat.com/privacy/projects/payy).
- Operator risk with confidential-token approvals: an ERC-7984 operator can drain all tokens and cannot see balances — [OpenZeppelin](https://docs.openzeppelin.com/confidential-contracts/token).

### Inferences

- For a Mercury credit line, hidden insolvency is mainly a supervisory and auditor issue, not a market one, because Mercury holds the risk. A minimum control set would be:
  1. Mercury risk and its auditors hold or can obtain decryption of every position (protocol-held escrow keys or threshold or delegated decryption).
  2. Periodic public aggregates: total credit outstanding, collateral by asset at oracle price, utilization, bad debt realized.
  3. A per-user verifiable liabilities commitment, so users can check their own position is included.
  4. Reserves for the cash or earn pool held in public or attestable accounts.
- Laundering risk is bounded mostly by keeping the system closed. KYC-gated entry (SAS attestation check on account open), sanctions re-screening, caps (as Umbra and Cloak do), and protocol-visible flows keep Mercury from offering "increased obfuscation". The account is private from the public but not from Mercury, which is the posture AMLR Art. 79 allows. Open-ended shielded transfers to arbitrary wallets are where risk concentrates, so sends out of the private domain should unshield or pass a screened ring.
- Privacy against liquidation front-running is real but secondary for Mercury. As sole lender running its own liquidations or auctions, Mercury already controls ordering. The bigger win is hiding users' stock collateral and leverage from public watchers, which also addresses wealth-targeting and physical-safety risk (the Gnosis Pay critique).
- Every privacy primitive adds a liveness dependency on an exit path (MPC cluster, TEE operator, ZK proof program, key escrow). For a regulated consumer product, each module needs a documented fallback: public-mode exit, or protocol-controlled unshield, under governance.

### Gaps

- No regulator statement specifically on confidential lending or hidden bad debt was found.
- No incident data exists for private lending (none in production), so failure modes are inferred from public DeFi and custodial precedents.
- No quantitative data found on how much oracle or liquidation MEV privacy would save on Solana lending specifically.
