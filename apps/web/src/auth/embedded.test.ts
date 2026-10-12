import { describe, expect, it } from "vitest";
import { embeddedOf } from "./embedded";

/** Privy's own wallet says so. Only what picking reads, so no class is needed. */
const privy = (address: string) => ({ address, standardWallet: { isPrivyWallet: true } });
/** Anything injected: Phantom, Backpack, Solflare. No such property. */
const injected = (address: string, name = "Phantom") => ({ address, standardWallet: { name } });

describe("embeddedOf", () => {
  it("finds the embedded wallet wherever it sits in the list", () => {
    const mine = privy("MERCURY");
    expect(embeddedOf([injected("PHANTOM"), mine])?.address).toBe("MERCURY");
    expect(embeddedOf([mine, injected("PHANTOM")])?.address).toBe("MERCURY");
  });

  it("finds it when it is the only wallet, which is every account today", () => {
    expect(embeddedOf([privy("MERCURY")])?.address).toBe("MERCURY");
  });

  /*
   * The whole point of the function. Indexing by [0] returned whatever had
   * connected first, so a wallet somebody attached to add cash with could be
   * handed a buy, a sell, a send or a loan to sign — transactions built for
   * the embedded wallet as both fee payer and authority.
   */
  it("refuses to pick an injected wallet, however alone it is", () => {
    expect(embeddedOf([injected("PHANTOM")])).toBeUndefined();
    expect(embeddedOf([injected("PHANTOM"), injected("BACKPACK", "Backpack")])).toBeUndefined();
  });

  it("has nothing to pick from an empty list", () => {
    expect(embeddedOf([])).toBeUndefined();
  });

  /*
   * Fails closed, and that is the contract: callers turn `undefined` into
   * `walletReady: false`, which shows "Waiting for wallet…" and will not sign.
   * Signing with the wrong key is the outcome worth refusing a signature over.
   */
  it("would rather return nothing than guess", () => {
    expect(embeddedOf([{ address: "ODD", standardWallet: null }])).toBeUndefined();
    expect(embeddedOf([{ address: "ODD", standardWallet: undefined }])).toBeUndefined();
  });

  /* A property is only a claim. `true` is the claim; "true" is not it. */
  it("takes only a boolean true, not anything truthy", () => {
    expect(embeddedOf([{ address: "X", standardWallet: { isPrivyWallet: "true" } }])).toBeUndefined();
    expect(embeddedOf([{ address: "X", standardWallet: { isPrivyWallet: 1 } }])).toBeUndefined();
  });

  /*
   * Two wallets both claiming to be ours is a state we have no rule for, so
   * there is no right one to pick and picking either would be a guess.
   */
  it("refuses when more than one claims to be the embedded wallet", () => {
    expect(embeddedOf([privy("ONE"), privy("TWO")])).toBeUndefined();
  });
});
