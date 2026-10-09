import { describe, expect, it } from "vitest";
import { D, ZERO } from "@mercury/core";
import { fails, fakeFetch } from "@mercury/chain/testing";
import { FallbackReference, PythReference } from "./pyth-reference.js";
import type { ReferenceSource } from "./ports.js";

const NVDA_ID = "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593";

/** The recorded shapes: the keyless feed list, and one parsed price update. */
const FEEDS = [
  { id: NVDA_ID, attributes: { display_symbol: "NVDA", symbol: "Equity.US.NVDA/USD", asset_type: "Equity" } },
  { id: "spyfeed", attributes: { symbol: "Equity.US.SPY/USD", asset_type: "Equity" } },
];

const update = (price: string, expo: number, publishTime: number) => ({
  parsed: [{ id: NVDA_ID, price: { price, expo, publish_time: publishTime }, conf: "1" }],
});

/** Counts calls per path, so a cached feed list is provable. */
const counting = (routes: Record<string, unknown>) => {
  const calls: string[] = [];
  const inner = fakeFetch(routes);
  const doFetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls.push(String(input));
    return inner(input, init);
  }) as typeof fetch;
  return { calls, doFetch };
};

const pyth = (routes: Record<string, unknown>, apiKey = "key-1") => {
  const net = counting(routes);
  return { net, source: new PythReference({ apiKey, fetch: net.doFetch }) };
};

describe("PythReference", () => {
  it("scales the integer price by its exponent", async () => {
    // Pyth publishes 22994000000 with expo -8, which is $229.94.
    const { source } = pyth({
      "/v2/price_feeds": FEEDS,
      "/v2/updates/price/latest": update("22994000000", -8, 1_791_575_000),
    });
    const price = await source.priceFor("NVDA");
    expect(price?.pricePerShare.toFixed()).toBe("229.94");
    expect(price?.pendingDividendNet).toEqual(ZERO);
  });

  /*
   * The whole reason for this adapter. `observedAt` is what `staleWidening`
   * reads, and Pyth's publish time is seconds old where the issuer's quote is
   * minutes old.
   */
  it("takes the publish time as the observation, not the moment we asked", async () => {
    const { source } = pyth({
      "/v2/price_feeds": FEEDS,
      "/v2/updates/price/latest": update("22994000000", -8, 1_791_575_000),
    });
    const price = await source.priceFor("NVDA");
    expect(price?.observedAt).toEqual(new Date(1_791_575_000 * 1000));
  });

  it("sends the key as a bearer token, which Hermes has required since August 2026", async () => {
    const seen: (string | null)[] = [];
    const source = new PythReference({
      apiKey: "key-1",
      fetch: ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/v2/price_feeds")) {
          return Promise.resolve(
            new Response(JSON.stringify(FEEDS), { headers: { "content-type": "application/json" } }),
          );
        }
        seen.push(new Headers(init?.headers).get("authorization"));
        return Promise.resolve(
          new Response(JSON.stringify(update("1", 0, 1)), {
            headers: { "content-type": "application/json" },
          }),
        );
      }) as typeof fetch,
    });
    await source.priceFor("NVDA");
    expect(seen).toEqual(["Bearer key-1"]);
  });

  it("finds a feed that names the equity only in its full symbol", async () => {
    const { source } = pyth({
      "/v2/price_feeds": FEEDS,
      "/v2/updates/price/latest": {
        parsed: [{ id: "spyfeed", price: { price: "66", expo: 0, publish_time: 1 } }],
      },
    });
    expect((await source.priceFor("SPY"))?.pricePerShare.toFixed()).toBe("66");
  });

  it("reads the feed list once, however many prices are asked for", async () => {
    const { net, source } = pyth({
      "/v2/price_feeds": FEEDS,
      "/v2/updates/price/latest": update("1", 0, 1),
    });
    await Promise.all([source.priceFor("NVDA"), source.priceFor("NVDA"), source.priceFor("SPY")]);
    // 1,252 equity feeds is 700KB. Fetching it per quote would cost more than
    // the price lookup it exists to serve.
    expect(net.calls.filter((c) => c.includes("/v2/price_feeds"))).toHaveLength(1);
  });

  /*
   * Null, never a throw. `priceOrder` turns a missing reference into "Unknown
   * instrument", so an adapter that throws on a 401 would make every stock
   * read as nonexistent the day a key expires — including to somebody trying
   * to sell. Null hands the question to the source behind this one.
   */
  it("answers null on the 401 an expired key produces, rather than throwing", async () => {
    const { source } = pyth({ "/v2/price_feeds": FEEDS, "/v2/updates/price/latest": fails(401) });
    await expect(source.priceFor("NVDA")).resolves.toBeNull();
  });

  it("answers null for a ticker Pyth has no feed for", async () => {
    // 686 of the 1,506 tagged tickers, almost all European listings.
    const { source } = pyth({ "/v2/price_feeds": FEEDS });
    await expect(source.priceFor("ADYEN")).resolves.toBeNull();
  });

  it("answers null when the feed list itself cannot be read", async () => {
    const { source } = pyth({ "/v2/price_feeds": fails(503) });
    await expect(source.priceFor("NVDA")).resolves.toBeNull();
  });

  it("does not remember a failed feed list for ever", async () => {
    let attempt = 0;
    const source = new PythReference({
      apiKey: "key-1",
      fetch: ((input: Parameters<typeof fetch>[0]) => {
        const url = String(input);
        if (url.includes("/v2/price_feeds")) {
          attempt += 1;
          if (attempt === 1) return Promise.resolve(new Response(null, { status: 503 }));
          return Promise.resolve(
            new Response(JSON.stringify(FEEDS), { headers: { "content-type": "application/json" } }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify(update("5", 0, 1)), {
            headers: { "content-type": "application/json" },
          }),
        );
      }) as typeof fetch,
    });
    expect(await source.priceFor("NVDA")).toBeNull();
    // A transient failure that poisoned the cache would leave Pyth switched
    // off until the next deploy.
    expect((await source.priceFor("NVDA"))?.pricePerShare.toFixed()).toBe("5");
  });

  it("refuses a price that is zero or unreadable", async () => {
    const { source } = pyth({
      "/v2/price_feeds": FEEDS,
      "/v2/updates/price/latest": update("0", -8, 1_791_575_000),
    });
    await expect(source.priceFor("NVDA")).resolves.toBeNull();
  });
});

const fixed = (perShare: string): ReferenceSource => ({
  priceFor: async () => ({
    pricePerShare: D(perShare),
    observedAt: new Date(0),
    pendingDividendNet: ZERO,
  }),
});
const empty: ReferenceSource = { priceFor: async () => null };
const broken: ReferenceSource = {
  priceFor: async () => {
    throw new Error("hermes is down");
  },
};

describe("FallbackReference", () => {
  it("prefers the primary when it answers", async () => {
    const r = new FallbackReference(fixed("229.94"), fixed("1"));
    expect((await r.priceFor("NVDA"))?.pricePerShare.toFixed()).toBe("229.94");
  });

  it("falls back when the primary has no feed for this ticker", async () => {
    const r = new FallbackReference(empty, fixed("229.90"));
    expect((await r.priceFor("ADYEN"))?.pricePerShare.toFixed()).toBe("229.9");
  });

  /*
   * The outage case. A reference a few minutes old is something
   * `staleWidening` can price against; no reference at all is every stock
   * reading as unknown.
   */
  it("falls back when the primary throws, rather than taking the decision down", async () => {
    const r = new FallbackReference(broken, fixed("229.90"));
    expect((await r.priceFor("NVDA"))?.pricePerShare.toFixed()).toBe("229.9");
  });

  it("answers null only when neither source has anything", async () => {
    const r = new FallbackReference(empty, empty);
    expect(await r.priceFor("NVDA")).toBeNull();
  });
});
