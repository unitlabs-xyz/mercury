import { describe, expect, it } from "vitest";
import { fails, fakeFetch, yahooChartNvda } from "@mercury/chain/testing";
import { anchoredTo, YahooHistory } from "./yahoo.js";
import { D } from "@mercury/core";

/** The recorded response, rebuilt with whatever series a test needs. */
const chartOf = (timestamp: readonly number[], close: readonly (number | null)[]) => ({
  chart: {
    result: [
      {
        meta: { currency: "USD", symbol: "NVDA" },
        timestamp,
        indicators: { quote: [{ close }] },
      },
    ],
    error: null,
  },
});

const DAY = 86_400;

describe("YahooHistory.seriesFor", () => {
  it("asks for the range and interval that span, and identifies itself", async () => {
    const seen: string[] = [];
    // `HeadersInit` is not a global under lib ES2023, so take fetch's own type.
    const headers: NonNullable<Parameters<typeof fetch>[1]>["headers"][] = [];
    const doFetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      seen.push(String(input));
      headers.push(init?.headers);
      return Promise.resolve(
        new Response(JSON.stringify(yahooChartNvda), { headers: { "content-type": "application/json" } }),
      );
    }) as typeof fetch;

    const yahoo = new YahooHistory({ fetch: doFetch });
    await yahoo.seriesFor("NVDA", "1Y");

    expect(seen[0]).toContain("/v8/finance/chart/NVDA");
    expect(seen[0]).toContain("range=1y");
    expect(seen[0]).toContain("interval=1d");
    // Without a User-Agent Yahoo answers 429. Measured 28 September 2026.
    expect(JSON.stringify(headers[0]).toLowerCase()).toContain("user-agent");
  });

  it("reads the recorded response into dated points", async () => {
    const yahoo = new YahooHistory({
      fetch: fakeFetch({ "/v8/finance/chart/": yahooChartNvda }),
    });
    const series = await yahoo.seriesFor("NVDA", "1M");

    expect(series).not.toBeNull();
    expect(series!.points.length).toBe(yahooChartNvda.chart.result[0]!.timestamp.length);
    const first = series!.points[0]!;
    expect(first.at).toBeInstanceOf(Date);
    expect(first.price.gt(0)).toBe(true);
    // Ascending in time, so a chart can draw it straight through.
    expect(series!.points.every((p, i, a) => i === 0 || p.at >= a[i - 1]!.at)).toBe(true);
  });

  it("measures the move from the first close to the last", async () => {
    const yahoo = new YahooHistory({
      fetch: fakeFetch({ "/v8/finance/chart/": chartOf([0, DAY, 2 * DAY], [100, 110, 125]) }),
    });
    const series = await yahoo.seriesFor("NVDA", "1M");
    expect(series!.changePct.toFixed(2)).toBe("25.00");
  });

  it("drops the null closes Yahoo leaves in a series rather than reading them as zero", async () => {
    const yahoo = new YahooHistory({
      fetch: fakeFetch({
        "/v8/finance/chart/": chartOf([0, DAY, 2 * DAY, 3 * DAY], [100, null, null, 200]),
      }),
    });
    const series = await yahoo.seriesFor("NVDA", "1M");

    expect(series!.points.length).toBe(2);
    expect(series!.points.map((p) => p.price.toFixed(0))).toEqual(["100", "200"]);
    // A null read as zero would have made this -100%, then +infinity.
    expect(series!.changePct.toFixed(0)).toBe("100");
  });

  it("returns null for a ticker the provider does not know", async () => {
    const yahoo = new YahooHistory({ fetch: fakeFetch({ "/v8/finance/chart/": fails(404) }) });
    expect(await yahoo.seriesFor("ZZZNOTREAL", "1M")).toBeNull();
  });

  it("returns null when the provider answers with an error instead of a result", async () => {
    const yahoo = new YahooHistory({
      fetch: fakeFetch({
        "/v8/finance/chart/": {
          chart: { result: null, error: { code: "Not Found", description: "No data found" } },
        },
      }),
    });
    expect(await yahoo.seriesFor("ZZZ", "1M")).toBeNull();
  });

  it("throws when the provider is failing, so a caller can tell 'unknown' from 'down'", async () => {
    const yahoo = new YahooHistory({ fetch: fakeFetch({ "/v8/finance/chart/": fails(503) }) });
    await expect(yahoo.seriesFor("NVDA", "1M")).rejects.toThrow("503");
  });

  it("returns null for a series too short to measure a move across", async () => {
    const yahoo = new YahooHistory({
      fetch: fakeFetch({ "/v8/finance/chart/": chartOf([0], [100]) }),
    });
    expect(await yahoo.seriesFor("NVDA", "1M")).toBeNull();
  });

  it("serves a repeated ask from cache rather than the provider", async () => {
    let calls = 0;
    const doFetch = (() => {
      calls += 1;
      return Promise.resolve(
        new Response(JSON.stringify(yahooChartNvda), { headers: { "content-type": "application/json" } }),
      );
    }) as typeof fetch;

    const yahoo = new YahooHistory({ fetch: doFetch });
    await yahoo.seriesFor("NVDA", "1Y");
    await yahoo.seriesFor("NVDA", "1Y");
    expect(calls).toBe(1);

    // A different span is a different series, not a cache hit.
    await yahoo.seriesFor("NVDA", "1M");
    expect(calls).toBe(2);
  });

  it("asks again once the cached span has gone stale", async () => {
    let calls = 0;
    let now = 0;
    const doFetch = (() => {
      calls += 1;
      return Promise.resolve(
        new Response(JSON.stringify(yahooChartNvda), { headers: { "content-type": "application/json" } }),
      );
    }) as typeof fetch;

    const yahoo = new YahooHistory({ fetch: doFetch, now: () => now });
    await yahoo.seriesFor("NVDA", "1D");
    now += 61_000; // past the intraday ttl
    await yahoo.seriesFor("NVDA", "1D");
    expect(calls).toBe(2);
  });
});

describe("anchoredTo", () => {
  const series = {
    points: [
      { at: new Date(0), price: D(100) },
      { at: new Date(DAY * 1000), price: D(110) },
      { at: new Date(2 * DAY * 1000), price: D(125) },
    ],
    changePct: D(25),
  };

  it("lands the last point exactly on the live price", () => {
    const out = anchoredTo(series, D("223.31"));
    expect(out.points[out.points.length - 1]!.price.toFixed(2)).toBe("223.31");
  });

  it("leaves the move untouched, because re-levelling is not a rewrite", () => {
    const out = anchoredTo(series, D("223.31"));
    expect(out.changePct.toFixed(2)).toBe("25.00");
    // Every point scales by the same factor, so each step keeps its ratio.
    const first = out.points[0]!.price;
    const last = out.points[out.points.length - 1]!.price;
    expect(last.div(first).sub(1).mul(100).toFixed(2)).toBe("25.00");
  });

  it("keeps the timestamps as they were", () => {
    const out = anchoredTo(series, D("500"));
    expect(out.points.map((p) => p.at.getTime())).toEqual(series.points.map((p) => p.at.getTime()));
  });

  it("returns the series unchanged rather than dividing by a zero last price", () => {
    const zeroed = { points: [{ at: new Date(0), price: D(0) }], changePct: D(0) };
    expect(anchoredTo(zeroed, D(100))).toBe(zeroed);
  });
});

describe("YahooHistory.priceAt", () => {
  const NOW = Date.parse("2026-11-24T12:00:00.000Z");
  const answering = (body: unknown, status = 200) => {
    const seen: string[] = [];
    const doFetch = ((input: Parameters<typeof fetch>[0]) => {
      seen.push(String(input));
      return Promise.resolve(
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
      );
    }) as typeof fetch;
    return { doFetch, seen };
  };
  const at = (iso: string) => new Date(iso);
  const sec = (iso: string) => Date.parse(iso) / 1000;

  it("asks hourly by period around a recent moment, and takes the last close at or before it", async () => {
    const { doFetch, seen } = answering(
      chartOf(
        [sec("2026-06-01T13:00:00Z"), sec("2026-06-01T14:00:00Z"), sec("2026-06-01T15:00:00Z")],
        [100, 101, 102],
      ),
    );
    const yahoo = new YahooHistory({ fetch: doFetch, now: () => NOW });
    const price = await yahoo.priceAt("TSLA", at("2026-06-01T14:30:00Z"));

    expect(price?.toString()).toBe("101");
    expect(seen[0]).toContain("/v8/finance/chart/TSLA");
    expect(seen[0]).toContain("interval=1h");
    expect(seen[0]).toContain(`period1=${sec("2026-05-29T14:30:00Z")}`);
    expect(seen[0]).toContain(`period2=${sec("2026-06-04T14:30:00Z")}`);
    expect(seen[0]).not.toContain("range=");
  });

  it("asks daily for a moment older than Yahoo keeps hourly closes", async () => {
    const { doFetch, seen } = answering(chartOf([sec("2023-03-01T00:00:00Z")], [42]));
    const yahoo = new YahooHistory({ fetch: doFetch, now: () => NOW });
    expect((await yahoo.priceAt("TSLA", at("2023-03-01T15:00:00Z")))?.toString()).toBe("42");
    expect(seen[0]).toContain("interval=1d");
  });

  it("takes the first close after the moment when there is none before it, a weekend say", async () => {
    const { doFetch } = answering(
      chartOf([sec("2026-06-08T13:00:00Z"), sec("2026-06-08T14:00:00Z")], [90, 91]),
    );
    const yahoo = new YahooHistory({ fetch: doFetch, now: () => NOW });
    expect((await yahoo.priceAt("TSLA", at("2026-06-07T10:00:00Z")))?.toString()).toBe("90");
  });

  it("never asks past now for a moment in the last few days", async () => {
    const { doFetch, seen } = answering(chartOf([sec("2026-11-24T10:00:00Z")], [5]));
    const yahoo = new YahooHistory({ fetch: doFetch, now: () => NOW });
    await yahoo.priceAt("TSLA", at("2026-11-24T11:00:00Z"));
    expect(seen[0]).toContain(`period2=${NOW / 1000}`);
  });

  it("skips Yahoo's nulls for untraded hours", async () => {
    const { doFetch } = answering(
      chartOf([sec("2026-06-01T13:00:00Z"), sec("2026-06-01T14:00:00Z")], [100, null]),
    );
    const yahoo = new YahooHistory({ fetch: doFetch, now: () => NOW });
    expect((await yahoo.priceAt("TSLA", at("2026-06-01T14:30:00Z")))?.toString()).toBe("100");
  });

  it("is null when Yahoo has nothing for the symbol then, and remembers that", async () => {
    const empty = answering(chartOf([], []));
    const yahoo = new YahooHistory({ fetch: empty.doFetch, now: () => NOW });
    expect(await yahoo.priceAt("TSLA", at("2026-06-01T14:30:00Z"))).toBeNull();
    const missing = answering({}, 404);
    expect(
      await new YahooHistory({ fetch: missing.doFetch, now: () => NOW }).priceAt(
        "NOPE",
        at("2026-06-01T14:30:00Z"),
      ),
    ).toBeNull();
  });

  it("throws when Yahoo is failing, so a missing price and an outage stay different answers", async () => {
    const { doFetch } = answering({}, 500);
    const yahoo = new YahooHistory({ fetch: doFetch, now: () => NOW });
    await expect(yahoo.priceAt("TSLA", at("2026-06-01T14:30:00Z"))).rejects.toThrow(
      "yahoo chart returned 500",
    );
  });

  it("asks once for two moments in the same hour, since a past close does not change", async () => {
    const { doFetch, seen } = answering(chartOf([sec("2026-06-01T14:00:00Z")], [101]));
    const yahoo = new YahooHistory({ fetch: doFetch, now: () => NOW });
    await yahoo.priceAt("TSLA", at("2026-06-01T14:10:00Z"));
    await yahoo.priceAt("TSLA", at("2026-06-01T14:50:00Z"));
    expect(seen).toHaveLength(1);
  });

  it("does not remember a failure, so the next ask tries again", async () => {
    let fail = true;
    const doFetch = (() =>
      Promise.resolve(
        fail
          ? new Response("{}", { status: 503 })
          : new Response(JSON.stringify(chartOf([sec("2026-06-01T14:00:00Z")], [7])), {
              headers: { "content-type": "application/json" },
            }),
      )) as typeof fetch;
    const yahoo = new YahooHistory({ fetch: doFetch, now: () => NOW });
    await expect(yahoo.priceAt("TSLA", at("2026-06-01T14:30:00Z"))).rejects.toThrow();
    fail = false;
    expect((await yahoo.priceAt("TSLA", at("2026-06-01T14:30:00Z")))?.toString()).toBe("7");
  });
});
