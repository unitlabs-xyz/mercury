import { describe, expect, it } from "vitest";
import { fails, fakeFetch, jupSearchImpostors, jupSearchOndo, jupSearchXStock } from "../testing/index.js";
import { JupiterRegistry } from "./registry.js";

/** The full verified list, answered from the recorded universe. */
const FULL = [...jupSearchXStock, ...jupSearchOndo];
const live = () => fakeFetch({ "tag?query=verified": FULL });

describe("JupiterRegistry", () => {
  it("strips the wrapper suffix to get the real ticker", async () => {
    const r = new JupiterRegistry({ fetch: live() });
    const nvda = (await r.instruments()).find((i) => i.ticker === "NVDA");
    expect(nvda).toBeDefined();
    expect(nvda!.wrappers.map((w) => w.symbol).sort()).toEqual(["NVDAon", "NVDAx"]);
  });

  it("keeps both issuers under one ticker, so the comparison has two legs", async () => {
    const r = new JupiterRegistry({ fetch: live() });
    const nvda = (await r.instruments()).find((i) => i.ticker === "NVDA");
    expect(nvda!.wrappers.map((w) => w.issuer).sort()).toEqual(["backed", "ondo"]);
  });

  it("refuses an impersonator that shares a symbol with the real thing", async () => {
    // The recorded NVDAx query returns the real token beside several "Nvidia
    // Stonk" mints with one holder each. A symbol match alone would route money
    // into one of them.
    const r = new JupiterRegistry({
      fetch: fakeFetch({ "tag?query=verified": jupSearchImpostors }),
    });
    const mints = (await r.all()).map((t) => t.mint);
    const fakes = jupSearchImpostors.filter((t) => t.isVerified !== true).map((t) => t.id);
    expect(fakes.length).toBeGreaterThan(0);
    for (const fake of fakes) expect(mints).not.toContain(fake);
  });

  it("keeps a thin instrument listed; filling it is the engine's call, not the shelf's", async () => {
    const thin = jupSearchXStock.map((t) => ({ ...t, liquidity: 1_000 }));
    const r = new JupiterRegistry({ fetch: fakeFetch({ "tag?query=verified": thin }) });
    const listed = await r.instruments();
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((i) => i.wrappers.every((w) => w.liquidityUsd.eq(1_000)))).toBe(true);
  });

  it("reads the whole universe in one call, not twenty results a search", async () => {
    let calls = 0;
    const many = Array.from({ length: 60 }, (_, n) => ({
      ...jupSearchXStock[0]!,
      id: `Mint${n}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`,
      symbol: `T${n}x`,
    }));
    const f = fakeFetch({ "tag?query=verified": many });
    const r = new JupiterRegistry({
      fetch: ((input: Parameters<typeof fetch>[0]) => {
        calls += 1;
        return f(input);
      }) as typeof fetch,
    });
    expect((await r.instruments()).length).toBe(60);
    expect(calls).toBe(1);
  });

  it("says whether Jupiter has a market for each wrapper", async () => {
    const [a, b] = jupSearchXStock;
    const r = new JupiterRegistry({
      fetch: fakeFetch({
        "tag?query=verified": [
          { ...a!, usdPrice: 180 },
          { ...b!, usdPrice: null },
        ],
      }),
    });
    const wrappers = (await r.instruments()).flatMap((i) => i.wrappers);
    expect(wrappers.find((w) => w.mint === a!.id)?.hasMarket).toBe(true);
    expect(wrappers.find((w) => w.mint === b!.id)?.hasMarket).toBe(false);
  });

  it("falls back to the two searches when the full list is unavailable", async () => {
    const r = new JupiterRegistry({
      fetch: fakeFetch({
        "tag?query=verified": fails(503),
        "query=xStock": jupSearchXStock,
        "query=Ondo%20Tokenized": jupSearchOndo,
      }),
    });
    const nvda = (await r.instruments()).find((i) => i.ticker === "NVDA");
    expect(nvda!.wrappers.map((w) => w.issuer).sort()).toEqual(["backed", "ondo"]);
  });

  it("answers wrappersFor with the four fields the decision path needs", async () => {
    const r = new JupiterRegistry({ fetch: live() });
    const wrappers = await r.wrappersFor("NVDA");
    expect(wrappers.length).toBe(2);
    const backed = wrappers.find((w) => w.issuer === "backed");
    expect(backed).toMatchObject({ ticker: "NVDA", symbol: "NVDAx", decimals: 8 });
    expect(backed!.mint).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  it("finds a mint, and says null for one it has never seen", async () => {
    const r = new JupiterRegistry({ fetch: live() });
    const all = await r.all();
    expect(await r.byMint(all[0]!.mint)).toEqual(all[0]);
    expect(await r.byMint("NotAMintAtAll")).toBeNull();
  });

  it("calls each upstream once and serves the rest from cache", async () => {
    let calls = 0;
    const counted = fakeFetch({ "tag?query=verified": FULL });
    const r = new JupiterRegistry({
      fetch: ((input: Parameters<typeof fetch>[0]) => {
        calls += 1;
        return counted(input);
      }) as typeof fetch,
    });
    await r.instruments();
    await r.instruments();
    await r.wrappersFor("NVDA");
    expect(calls).toBe(1);
  });

  it("re-reads once the cache is stale", async () => {
    let calls = 0;
    const counted = fakeFetch({ "tag?query=verified": FULL });
    let clock = 0;
    const r = new JupiterRegistry({
      ttlMs: 1_000,
      now: () => clock,
      fetch: ((input: Parameters<typeof fetch>[0]) => {
        calls += 1;
        return counted(input);
      }) as typeof fetch,
    });
    await r.instruments();
    clock = 1_001;
    await r.instruments();
    expect(calls).toBe(2);
  });

  it("keeps the xStocks leg when Ondo's search fails", async () => {
    const r = new JupiterRegistry({
      fetch: fakeFetch({
        "tag?query=verified": fails(503),
        "query=xStock": jupSearchXStock,
        "query=Ondo%20Tokenized": fails(500),
      }),
    });
    const instruments = await r.instruments();
    expect(instruments.length).toBeGreaterThan(0);
    expect(instruments.every((i) => i.wrappers.every((w) => w.issuer === "backed"))).toBe(true);
  });

  it("fails loudly when the xStocks search fails, because there is nothing left", async () => {
    const r = new JupiterRegistry({
      fetch: fakeFetch({
        "tag?query=verified": fails(503),
        "query=xStock": fails(500),
        "query=Ondo%20Tokenized": [],
      }),
    });
    await expect(r.instruments()).rejects.toThrow("500");
  });
});
