import { afterEach, describe, expect, it, vi } from "vitest";
import { actingLabel, actionBlockedCopy, canAct, readsForChoice, resolveChoice } from "./acting-wallet";
import type { AccountWallet } from "./wallets";

const wallet = (over: Partial<AccountWallet>): AccountWallet => ({
  id: "w",
  address: "7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs",
  kind: "external",
  isPrimary: false,
  label: null,
  linkedAt: "2026-11-21T10:00:00.000Z",
  ...over,
});
const MERCURY = wallet({ id: "mercury", kind: "privy_embedded", isPrimary: true, linkedAt: null });
const PHANTOM = wallet({ id: "phantom", label: "Phantom" });
const WALLETS = [MERCURY, PHANTOM];

describe("resolveChoice", () => {
  it("is the Mercury wallet with nothing chosen", () => {
    expect(resolveChoice(null, WALLETS)).toEqual({
      acting: { kind: "mercury", wallet: MERCURY },
      stale: false,
    });
  });

  it("is the Mercury wallet named by its id", () => {
    expect(resolveChoice("mercury", WALLETS).acting).toEqual({ kind: "mercury", wallet: MERCURY });
  });

  it("is a linked wallet named by its id", () => {
    expect(resolveChoice("phantom", WALLETS)).toEqual({
      acting: { kind: "linked", wallet: PHANTOM },
      stale: false,
    });
  });

  it("is every wallet for `all`", () => {
    expect(resolveChoice("all", WALLETS)).toEqual({ acting: { kind: "all" }, stale: false });
  });

  it("falls back to the Mercury wallet, and says the choice is stale, once the wallet is unlinked", () => {
    expect(resolveChoice("gone", WALLETS)).toEqual({
      acting: { kind: "mercury", wallet: MERCURY },
      stale: true,
    });
  });

  it("has no `all` with nothing linked", () => {
    expect(resolveChoice("all", [MERCURY])).toEqual({
      acting: { kind: "mercury", wallet: MERCURY },
      stale: true,
    });
  });

  it("shows the Mercury wallet while the list loads, without forgetting the choice", () => {
    expect(resolveChoice("phantom", undefined)).toEqual({
      acting: { kind: "mercury", wallet: null },
      stale: false,
    });
  });
});

describe("acting", () => {
  it("acts only from the Mercury wallet, for now", () => {
    expect(canAct({ kind: "mercury", wallet: MERCURY })).toBe(true);
    expect(canAct({ kind: "linked", wallet: PHANTOM })).toBe(false);
    expect(canAct({ kind: "all" })).toBe(false);
  });

  it("says why an action is not there, and nothing when it is", () => {
    expect(actionBlockedCopy({ kind: "mercury", wallet: MERCURY })).toBeNull();
    expect(actionBlockedCopy({ kind: "all" })).toMatch(/Choose a wallet/);
    expect(actionBlockedCopy({ kind: "linked", wallet: PHANTOM })).toMatch(/Mercury wallet/);
  });

  it("never sends a linked wallet's loan to the Mercury wallet, whose loan is a different one", () => {
    const copy = actionBlockedCopy({ kind: "linked", wallet: PHANTOM }, "loan");
    expect(copy).toBe(
      "This is Phantom's own loan. Repaying or borrowing from Phantom in Mercury is coming soon. Until then, repay it or add collateral from Phantom itself.",
    );
    expect(copy).not.toMatch(/Switch to/);
  });

  it("asks whose loan when every wallet is shown", () => {
    expect(actionBlockedCopy({ kind: "all" }, "loan")).toBe(
      "A loan belongs to one wallet. Choose whose loan this is.",
    );
  });

  it("lets the Mercury wallet manage its own loan", () => {
    expect(actionBlockedCopy({ kind: "mercury", wallet: MERCURY }, "loan")).toBeNull();
  });

  it("names what is shown", () => {
    expect(actingLabel({ kind: "mercury", wallet: MERCURY })).toBe("Mercury");
    expect(actingLabel({ kind: "linked", wallet: PHANTOM })).toBe("Phantom");
    expect(actingLabel({ kind: "linked", wallet: wallet({}) })).toBe("7EYn…awMs");
    expect(actingLabel({ kind: "all" })).toBe("All wallets");
  });
});

describe("the remembered choice", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const storage = (initial: Record<string, string> = {}) => {
    const items = new Map(Object.entries(initial));
    return {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
      items,
    };
  };

  it("comes back from the browser, and is kept and forgotten there", async () => {
    const store = storage({ "mercury.wallet": "phantom" });
    vi.stubGlobal("localStorage", store);
    vi.resetModules();
    const choice = await import("./wallet-choice");
    expect(choice.chosenWallet()).toBe("phantom");

    const heard: string[] = [];
    const stop = choice.subscribeChoice(() => heard.push(String(choice.chosenWallet())));
    choice.setChosenWallet("all");
    expect(store.items.get("mercury.wallet")).toBe("all");
    choice.setChosenWallet(null);
    expect(store.items.has("mercury.wallet")).toBe(false);
    choice.setChosenWallet(null); // no change, no news
    stop();
    expect(heard).toEqual(["all", "null"]);
  });

  it("is the Mercury wallet, and still works for the tab, when the browser keeps nothing", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    vi.resetModules();
    const choice = await import("./wallet-choice");
    expect(choice.chosenWallet()).toBeNull();
    choice.setChosenWallet("phantom");
    expect(choice.chosenWallet()).toBe("phantom");
  });

  it("chooses the wallet a phone's link names, then takes it out of the address", async () => {
    const store = storage();
    vi.stubGlobal("localStorage", store);
    vi.resetModules();
    const choice = await import("./wallet-choice");
    const replaced: string[] = [];
    const history = {
      state: { from: "router" },
      replaceState: (_s: unknown, _t: string, url?: string | URL | null) => void replaced.push(String(url)),
    };

    choice.adoptWalletFromUrl(
      { search: "?tab=loans&wallet=phantom", pathname: "/money", hash: "#borrow" },
      history,
    );
    expect(choice.chosenWallet()).toBe("phantom");
    expect(store.items.get("mercury.wallet")).toBe("phantom");
    expect(replaced).toEqual(["/money?tab=loans#borrow"]);

    choice.adoptWalletFromUrl({ search: "?wallet=all", pathname: "/", hash: "" }, history);
    expect(replaced.at(-1)).toBe("/");
  });

  it("leaves the choice and the address alone when the link names no wallet", async () => {
    vi.stubGlobal("localStorage", storage({ "mercury.wallet": "phantom" }));
    vi.resetModules();
    const choice = await import("./wallet-choice");
    const replaced: string[] = [];
    const history = { state: null, replaceState: () => void replaced.push("touched") };
    choice.adoptWalletFromUrl({ search: "?wallet=", pathname: "/", hash: "" }, history);
    choice.adoptWalletFromUrl({ search: "", pathname: "/", hash: "" }, history);
    expect(choice.chosenWallet()).toBe("phantom");
    expect(replaced).toEqual([]);
  });
});

describe("readsForChoice", () => {
  it("drops the chosen wallet's reads when another is chosen", () => {
    expect(readsForChoice(["api", "portfolio"])).toBe(true);
    expect(readsForChoice(["api", "portfolio", "history", "1D"])).toBe(true);
    expect(readsForChoice(["api", "money"])).toBe(true);
    expect(readsForChoice(["api", "activity", "feed"])).toBe(true);
  });

  it("keeps what reads the same for any choice", () => {
    expect(readsForChoice(["api", "wallets"])).toBe(false);
    expect(readsForChoice(["api", "summary"])).toBe(false);
  });

  it("keeps reads for every wallet at once, which name their own wallet", () => {
    expect(readsForChoice(["api", "portfolio", "all"])).toBe(false);
    expect(readsForChoice(["api", "portfolio", "all", "history", "1W"])).toBe(false);
  });

  it("leaves anything that is not an API read alone", () => {
    expect(readsForChoice(["prices", "AAPL"])).toBe(false);
  });
});
