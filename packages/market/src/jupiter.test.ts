import { describe, expect, it } from "vitest";
import { D } from "@mercury/core";
import type { TokenRef, TokenRegistry } from "@mercury/chain";
import { fails, fakeFetch, jupPrice, NVDAX_MINT, SPYX_MINT } from "@mercury/chain/testing";
import { JupiterMarket } from "./jupiter.js";

const NVDAX: TokenRef = { mint: NVDAX_MINT, symbol: "NVDAx", ticker: "NVDA", issuer: "backed", decimals: 8 };
const NVDAON: TokenRef = {
  mint: "OnDoNvDaMiNtAdDrEsSfOrTeStSoNlY1111111111",
  symbol: "NVDAon",
  ticker: "NVDA",
  issuer: "ondo",
  decimals: 6,
};

const registry = (refs: readonly TokenRef[]): TokenRegistry => ({
  wrappersFor: async (ticker) => refs.filter((r) => r.ticker === ticker),
  all: async () => refs,
  byMint: async (mint) => refs.find((r) => r.mint === mint) ?? null,
});

/** A price response with exactly the fields a test cares about. */
const priceOf = (mint: string, body: Record<string, unknown>) => ({ [mint]: body });

const recorded = jupPrice as Record<
  string,
  { usdPrice: number; stockData?: { price: number; updatedAt: string } } | null
>;

describe("JupiterMarket.pricesFor", () => {
  it("maps the recorded response onto the board", async () => {
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: fakeFetch({ "/price/v3": jupPrice }) });
    const board = await m.pricesFor([NVDAX_MINT]);
    const nvda = recorded[NVDAX_MINT]!;
    const price = board.get(NVDAX_MINT);
    expect(price!.usdPricePerToken.toFixed()).toBe(String(nvda.usdPrice));
    expect(price!.pricePerShare!.toFixed()).toBe(String(nvda.stockData!.price));
    expect(price!.underlyingMarketCapUsd!.toFixed()).toBe("5526523890000");
  });

  it("asks for every mint in one request", async () => {
    let seen = "";
    const f = fakeFetch({ "/price/v3": jupPrice });
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: ((input: Parameters<typeof fetch>[0]) => {
        seen = String(input);
        return f(input);
      }) as typeof fetch,
    });
    await m.pricesFor([NVDAX_MINT, SPYX_MINT]);
    expect(seen).toContain(`${NVDAX_MINT},${SPYX_MINT}`);
  });

  it("splits more than fifty mints into batches of fifty", async () => {
    const seen: string[] = [];
    const f = fakeFetch({ "/price/v3": jupPrice });
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: ((input: Parameters<typeof fetch>[0]) => {
        seen.push(String(input));
        return f(input);
      }) as typeof fetch,
    });
    const mints = [NVDAX_MINT, ...Array.from({ length: 119 }, (_, i) => `Mint${i}`)];
    const board = await m.pricesFor(mints);
    expect(seen.length).toBe(3);
    expect(seen.map((u) => u.split("ids=")[1]!.split(",").length)).toEqual([50, 50, 20]);
    expect(board.has(NVDAX_MINT)).toBe(true);
  });

  it("keeps at most four batches in flight, so pricing everything is not one burst", async () => {
    let open = 0;
    let peak = 0;
    const f = fakeFetch({ "/price/v3": jupPrice });
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: (async (input: Parameters<typeof fetch>[0]) => {
        open += 1;
        peak = Math.max(peak, open);
        await new Promise((r) => setTimeout(r, 1));
        open -= 1;
        return f(input);
      }) as typeof fetch,
    });
    const mints = [NVDAX_MINT, ...Array.from({ length: 499 }, (_, i) => `Mint${i}`)];
    expect((await m.pricesFor(mints)).has(NVDAX_MINT)).toBe(true);
    expect(peak).toBe(4);
  });

  it("does not call upstream for an empty list", async () => {
    const m = new JupiterMarket({ registry: registry([]), fetch: fakeFetch({}) });
    expect((await m.pricesFor([])).size).toBe(0);
  });

  it("uses newMultiplier once its effective timestamp has passed", async () => {
    const body = priceOf(NVDAX_MINT, {
      usdPrice: 224.43901496255418,
      decimals: 8,
      scaledUiConfig: {
        multiplier: 1.0009180758490996,
        newMultiplier: 1.001701196801074,
        newMultiplierEffectiveAt: "2026-09-10T00:30:00Z",
      },
    });
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: fakeFetch({ "/price/v3": body }),
      now: () => Date.parse("2026-09-24T00:00:00Z"),
    });
    expect((await m.pricesFor([NVDAX_MINT])).get(NVDAX_MINT)!.multiplier.toFixed()).toBe("1.001701196801074");
  });

  it("uses the current multiplier until then", async () => {
    const body = priceOf(NVDAX_MINT, {
      usdPrice: 1,
      decimals: 8,
      scaledUiConfig: {
        multiplier: 1.0009180758490996,
        newMultiplier: 1.001701196801074,
        newMultiplierEffectiveAt: "2026-09-10T00:30:00Z",
      },
    });
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: fakeFetch({ "/price/v3": body }),
      now: () => Date.parse("2026-09-01T00:00:00Z"),
    });
    expect((await m.pricesFor([NVDAX_MINT])).get(NVDAX_MINT)!.multiplier.toFixed()).toBe(
      "1.0009180758490996",
    );
  });

  it("says one for a token that has never paid a dividend", async () => {
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: fakeFetch({ "/price/v3": priceOf(NVDAX_MINT, { usdPrice: 10, decimals: 8 }) }),
    });
    const price = (await m.pricesFor([NVDAX_MINT])).get(NVDAX_MINT)!;
    expect(price.multiplier).toEqual(D(1));
    expect(price.underlyingMarketCapUsd).toBeNull();
  });

  it("skips a mint Jupiter answered null for, rather than pricing it at zero", async () => {
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: fakeFetch({ "/price/v3": { [NVDAX_MINT]: null } }),
    });
    expect((await m.pricesFor([NVDAX_MINT])).size).toBe(0);
  });
});

describe("JupiterMarket.priceFor", () => {
  it("prices a ticker from its Backed wrapper", async () => {
    const m = new JupiterMarket({
      registry: registry([NVDAON, NVDAX]),
      fetch: fakeFetch({ "/price/v3": jupPrice }),
    });
    const reference = await m.priceFor("NVDA");
    const nvda = recorded[NVDAX_MINT]!;
    expect(reference!.pricePerShare.toFixed()).toBe(String(nvda.stockData!.price));
    expect(reference!.observedAt).toEqual(new Date(nvda.stockData!.updatedAt));
    // Zero almost always: a dividend that has gone ex but is not yet in the
    // multiplier is the exception, and no upstream tells us about one.
    expect(reference!.pendingDividendNet).toEqual(D(0));
  });

  it("says null for a ticker it has never heard of", async () => {
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: fakeFetch({ "/price/v3": jupPrice }) });
    expect(await m.priceFor("NOPE")).toBeNull();
  });

  it("says null when there is no underlying quote, rather than using the pool price", async () => {
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: fakeFetch({ "/price/v3": priceOf(NVDAX_MINT, { usdPrice: 224.4, decimals: 8 }) }),
    });
    expect(await m.priceFor("NVDA")).toBeNull();
  });

  it("throws when Jupiter is down, so the caller can fall back rather than price on nothing", async () => {
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: fakeFetch({ "/price/v3": fails(502) }),
      // A 502 is retried now, so the waiting is pinned rather than slept through.
      sleep: async () => undefined,
    });
    await expect(m.priceFor("NVDA")).rejects.toThrow("502");
  });
});

describe("JupiterMarket as a MultiplierSource", () => {
  it("answers for a mint it can price", async () => {
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: fakeFetch({ "/price/v3": jupPrice }) });
    expect((await m.multiplierFor(NVDAX_MINT))!.gte(D(1))).toBe(true);
  });

  it("says null for a mint Jupiter does not know", async () => {
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: fakeFetch({ "/price/v3": {} }) });
    expect(await m.multiplierFor("NotAMint")).toBeNull();
  });

  it("cannot see a pause from a price, and says so rather than guessing", async () => {
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: fakeFetch({ "/price/v3": jupPrice }) });
    expect(await m.isPaused(NVDAX_MINT)).toBe(false);
  });

  it("answers many mints from one request rather than one request each", async () => {
    const seen: string[] = [];
    const f = fakeFetch({ "/price/v3": jupPrice });
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: ((input: Parameters<typeof fetch>[0]) => {
        seen.push(String(input));
        return f(input);
      }) as typeof fetch,
    });
    const found = await m.multipliersFor([NVDAX_MINT, SPYX_MINT]);
    // Asked one at a time, each of these cost a whole request for a single id
    // on an endpoint whose keyless allowance is thirty requests a minute.
    expect(seen).toHaveLength(1);
    expect(found.get(NVDAX_MINT)!.gte(D(1))).toBe(true);
  });

  it("leaves out a mint it could not price, rather than calling it one", async () => {
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: fakeFetch({ "/price/v3": priceOf(NVDAX_MINT, { usdPrice: 182 }) }),
    });
    expect([...(await m.multipliersFor([NVDAX_MINT, "NotAMint"])).keys()]).toEqual([NVDAX_MINT]);
  });
});

describe("JupiterMarket.pricesFor, when Jupiter refuses to answer", () => {
  /** A fetch that answers each call from a script, so a test can refuse once and then relent. */
  const scripted = (...replies: readonly (number | Error | Record<string, unknown>)[]) => {
    const urls: string[] = [];
    const doFetch = ((input: Parameters<typeof fetch>[0]) => {
      const reply = replies[urls.length] ?? replies[replies.length - 1]!;
      urls.push(String(input));
      if (reply instanceof Error) return Promise.reject(reply);
      if (typeof reply === "number") return Promise.resolve(new Response(null, { status: reply }));
      return Promise.resolve(
        new Response(JSON.stringify(reply), { headers: { "content-type": "application/json" } }),
      );
    }) as typeof fetch;
    return { doFetch, urls };
  };

  const waits: number[] = [];
  const patient = {
    sleep: async (ms: number) => void waits.push(ms),
    // Pinned, so the backoff is the figure the formula gives and not a range.
    random: () => 0,
  };

  it("comes back after a rate limit rather than failing the call", async () => {
    waits.length = 0;
    const net = scripted(429, priceOf(NVDAX_MINT, { usdPrice: 182, stockData: { price: 182 } }));
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: net.doFetch, ...patient });
    expect((await m.pricesFor([NVDAX_MINT])).has(NVDAX_MINT)).toBe(true);
    expect(net.urls).toHaveLength(2);
    // A second, not 200ms: Jupiter counts over a sliding minute and sends no
    // Retry-After, so a quick retry lands in the same window and is refused again.
    expect(waits).toEqual([500]);
  });

  it("waits longer each time, and gives up after its attempts", async () => {
    waits.length = 0;
    const net = scripted(429);
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: net.doFetch, ...patient });
    await expect(m.pricesFor([NVDAX_MINT])).rejects.toThrow("429");
    expect(net.urls).toHaveLength(4);
    expect(waits).toEqual([500, 1_000, 2_000]);
  });

  it("backs off in milliseconds for a server error, because a shelf is waiting", async () => {
    waits.length = 0;
    const net = scripted(502);
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: net.doFetch, ...patient });
    await expect(m.pricesFor([NVDAX_MINT])).rejects.toThrow("502");
    // 0.7s in total rather than 3.5s. A rate limit is worth waiting out; an
    // upstream that is down is not, and a read is blocked on this.
    expect(waits).toEqual([100, 200, 400]);
  });

  it("retries a dropped connection, which is what firing four batches at once produces", async () => {
    waits.length = 0;
    const net = scripted(new Error("fetch failed"), priceOf(NVDAX_MINT, { usdPrice: 182 }));
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: net.doFetch, ...patient });
    expect((await m.pricesFor([NVDAX_MINT])).has(NVDAX_MINT)).toBe(true);
    expect(net.urls).toHaveLength(2);
  });

  it("does not retry a refusal that will not change, and says what it was", async () => {
    waits.length = 0;
    const net = scripted(400);
    const m = new JupiterMarket({ registry: registry([NVDAX]), fetch: net.doFetch, ...patient });
    await expect(m.pricesFor([NVDAX_MINT])).rejects.toThrow("400");
    expect(net.urls).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it("fails the whole call when one batch cannot be answered, rather than reporting the rest", async () => {
    // A mint we could not ask about must not come back looking like a mint
    // Jupiter has no price for: the cache would write that down as "no price"
    // and hold it, and the holding would vanish off a portfolio.
    const net = scripted(priceOf(NVDAX_MINT, { usdPrice: 182 }), 429);
    const m = new JupiterMarket({
      registry: registry([NVDAX]),
      fetch: net.doFetch,
      attempts: 1,
      ...patient,
    });
    const mints = [NVDAX_MINT, ...Array.from({ length: 60 }, (_, i) => `Mint${i}`)];
    await expect(m.pricesFor(mints)).rejects.toThrow("429");
  });
});
