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
    const headers: (HeadersInit | undefined)[] = [];
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
