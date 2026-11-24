import { describe, expect, it } from "vitest";
import { address, generateKeyPairSigner, getProgramDerivedAddress } from "@solana/kit";
import { D } from "@mercury/core";
import type { ChainHistory, SignatureRef, TokenBalance, TransactionDetail } from "@mercury/chain";
import type { PriceBoard } from "@mercury/market";
import { mercuryWallet, testDb } from "../db/testing.js";
import { basketAccounts, historyEvents, historyTxs, users, wallets } from "../db/schema.js";
import { findOutsideBaskets, outsideCandidates, SWIG_PROGRAMS, type Listed } from "./outside.js";

const SWIG = [...SWIG_PROGRAMS][0]!;
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TSLAX = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
const LISTED = new Map<string, Listed>([
  [USDC, { symbol: "USDC", ticker: null }],
  [TSLAX, { symbol: "TSLAx", ticker: "TSLA" }],
]);

/** A program-derived address, off the curve, as a Swig sub-account is. */
const pda = async (seed: string) =>
  (await getProgramDerivedAddress({ programAddress: address(SWIG), seeds: [seed] }))[0] as string;

const seed = async () => {
  const db = await testDb();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:outside" }).returning();
  const userId = user!.id;
  const mercury = (await generateKeyPairSigner()).address as string;
  await mercuryWallet(db, userId, mercury);
  const phantom = (await generateKeyPairSigner()).address as string;
  const [w] = await db
    .insert(wallets)
    .values({ userId, address: phantom, kind: "external", isPrimary: false })
    .returning();
  let n = 0;
  /** A departure the history reader recorded, naming who received it, or not. */
  const sent = async (to: string | null, raw: unknown = {}) => {
    const signature = `sig-${++n}`;
    await db.insert(historyTxs).values({ signature, slot: BigInt(n), blockTime: new Date(), raw });
    await db.insert(historyEvents).values({
      walletId: w!.id,
      account: "usdc-account",
      signature,
      blockTime: new Date(),
      kind: "out",
      mint: USDC,
      amountRaw: 100n,
      destinationOwner: to,
    });
  };
  return { db, userId, mercury, wallet: { userId, walletId: w!.id, address: phantom }, sent };
};

describe("outsideCandidates", () => {
  it("is every account the linked wallet sent tokens to, but its own wallets and Mercury's baskets", async () => {
    const s = await seed();
    const [basket, friend, mercuryBasket] = [await pda("glider"), "Friend1111", await pda("mercury")];
    await s.sent(basket);
    await s.sent(basket);
    await s.sent(friend);
    await s.sent(s.mercury);
    await s.sent(mercuryBasket);
    await s.db
      .insert(basketAccounts)
      .values({ userId: s.userId, address: mercuryBasket, portfolioId: "p-m" });

    expect([...(await outsideCandidates(s.db, s.wallet))].sort()).toEqual([basket, friend].sort());
  });

  it("works out who received a departure read before that was recorded, from the transaction kept", async () => {
    const s = await seed();
    const basket = await pda("old");
    const tx: Partial<TransactionDetail> & Record<string, unknown> = {
      signature: "old",
      succeeded: true,
      accountKeys: [],
      preTokens: [{ mint: USDC, owner: s.wallet.address, rawAmount: "500", decimals: 6 }] as never,
      postTokens: [
        { mint: USDC, owner: s.wallet.address, rawAmount: "0", decimals: 6 },
        { mint: USDC, owner: basket, rawAmount: "500", decimals: 6 },
      ] as never,
    };
    await s.sent(null, tx);
    expect(await outsideCandidates(s.db, s.wallet)).toEqual([basket]);
  });

  it("is nothing for a wallet that never sent anything", async () => {
    const s = await seed();
    expect(await outsideCandidates(s.db, s.wallet)).toEqual([]);
  });
});

describe("findOutsideBaskets", () => {
  const ref = (signature: string): SignatureRef => ({ signature, slot: 1, blockTime: 1, failed: false });
  const tx = (signature: string, keys: string[]): TransactionDetail => ({
    signature,
    blockTime: 1,
    succeeded: true,
    accountKeys: keys,
    feeLamports: 0n,
    preLamports: [],
    postLamports: [],
    preTokens: [],
    postTokens: [],
  });
  /** A chain where `swigRun` accounts' transactions call Swig, and each account holds `held`. */
  const chain = (swigRun: Set<string>, held: Record<string, TokenBalance[]>) => {
    const asked: string[] = [];
    const history: Pick<ChainHistory, "signatures" | "transaction"> = {
      signatures: async (a) => (asked.push(a), [ref(`tx-${a}`)]),
      transaction: async (sig) => {
        const owner = sig.slice(3);
        return tx(sig, swigRun.has(owner) ? [owner, SWIG] : [owner, "SomeOtherProgram"]);
      },
    };
    return { history, chainReader: { tokenBalances: async (a: string) => held[a] ?? [] }, asked };
  };
  const prices = {
    pricesFor: async (mints: readonly string[]) =>
      new Map(mints.map((m) => [m, { usdPricePerToken: D(m === TSLAX ? 300 : 1) }])),
  } as unknown as PriceBoard;

  it("finds a Swig-run basket the wallet funded, and values what it holds that Mercury lists", async () => {
    const s = await seed();
    const basket = await pda("glider");
    await s.sent(basket);
    const c = chain(new Set([basket]), {
      [basket]: [
        { mint: TSLAX, rawAmount: 150_000_000n, decimals: 8 },
        { mint: USDC, rawAmount: 20_000_000n, decimals: 6 },
        { mint: "Bonk", rawAmount: 9n, decimals: 5 },
      ],
    });
    const found = await findOutsideBaskets(
      { db: s.db, history: c.history, chain: c.chainReader, prices, listed: async () => LISTED },
      s.wallet,
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.address).toBe(basket);
    expect(found[0]!.valueUsd.toString()).toBe("470");
    expect(found[0]!.holdings.map((h) => [h.symbol, h.amount.toString(), h.valueUsd.toString()])).toEqual([
      ["TSLAx", "1.5", "450"],
      ["USDC", "20", "20"],
    ]);
  });

  it("never calls a person's wallet a basket, even one that has used Swig, and never asks about it", async () => {
    const s = await seed();
    const friend = (await generateKeyPairSigner()).address as string;
    await s.sent(friend);
    const c = chain(new Set([friend]), { [friend]: [{ mint: TSLAX, rawAmount: 1n, decimals: 8 }] });
    const found = await findOutsideBaskets(
      { db: s.db, history: c.history, chain: c.chainReader, prices, listed: async () => LISTED },
      s.wallet,
    );
    expect(found).toEqual([]);
    expect(c.asked).toEqual([]);
  });

  it("leaves out a program's account that Swig doesn't run: another kind of smart wallet is not a Glider basket", async () => {
    const s = await seed();
    const vault = await pda("multisig");
    await s.sent(vault);
    const c = chain(new Set(), { [vault]: [{ mint: TSLAX, rawAmount: 1n, decimals: 8 }] });
    expect(
      await findOutsideBaskets(
        { db: s.db, history: c.history, chain: c.chainReader, prices, listed: async () => LISTED },
        s.wallet,
      ),
    ).toEqual([]);
  });

  it("leaves out a basket emptied already: there is nothing to bring in", async () => {
    const s = await seed();
    const basket = await pda("emptied");
    await s.sent(basket);
    const c = chain(new Set([basket]), { [basket]: [{ mint: TSLAX, rawAmount: 0n, decimals: 8 }] });
    expect(
      await findOutsideBaskets(
        { db: s.db, history: c.history, chain: c.chainReader, prices, listed: async () => LISTED },
        s.wallet,
      ),
    ).toEqual([]);
  });
});
