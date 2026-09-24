import { describe, expect, it } from "vitest";
import { fails, fakeFetch, pythSpy } from "@mercury/chain/testing";
import { PythSessions } from "./pyth.js";

/** A feed list with the hours a test wants, keeping the recorded shape. */
const feedsWith = (hours: { is_open: boolean; next_open?: number; next_close?: number }) => [
  { id: "abc", market_hours: hours, attributes: { display_symbol: "SPY", asset_type: "Equity" } },
];

/** A Wednesday and a Saturday, both 15:00 in New York. */
const WEDNESDAY = new Date("2026-09-23T19:00:00Z");
const SATURDAY = new Date("2026-09-26T19:00:00Z");

describe("PythSessions", () => {
  it("reads the recorded feed without inventing a shape", async () => {
    const p = new PythSessions({ fetch: fakeFetch({ "/v2/price_feeds": pythSpy }), now: () => WEDNESDAY });
    const state = await p.current();
    expect(["open", "closed"]).toContain(state.status);
    expect(typeof state.isOpen).toBe("boolean");
  });

  it("calls the market open", async () => {
    const p = new PythSessions({
      fetch: fakeFetch({ "/v2/price_feeds": feedsWith({ is_open: true, next_close: 1_790_280_000 }) }),
      now: () => WEDNESDAY,
    });
    const state = await p.current();
    expect(state.status).toBe("open");
    expect(state.isOpen).toBe(true);
    expect(state.nextCloseAt).toEqual(new Date(1_790_280_000 * 1000));
    expect(state.nextOpenAt).toBeNull();
  });

  it("calls it closed, and says when it opens", async () => {
    const p = new PythSessions({
      fetch: fakeFetch({ "/v2/price_feeds": feedsWith({ is_open: false, next_open: 1_790_256_600 }) }),
      now: () => WEDNESDAY,
    });
    const state = await p.current();
    expect(state.status).toBe("closed");
    expect(state.isOpen).toBe(false);
    expect(state.nextOpenAt).toEqual(new Date(1_790_256_600 * 1000));
  });

  it("knows a weekend from a weekday, in New York rather than in UTC", async () => {
    const closed = feedsWith({ is_open: false, next_open: 1_790_256_600 });
    const weekday = new PythSessions({
      fetch: fakeFetch({ "/v2/price_feeds": closed }),
      now: () => WEDNESDAY,
    });
    const weekend = new PythSessions({
      fetch: fakeFetch({ "/v2/price_feeds": closed }),
      now: () => SATURDAY,
    });
    expect((await weekday.current()).isWeekend).toBe(false);
    expect((await weekend.current()).isWeekend).toBe(true);
  });

  it("takes SPY's calendar over another symbol's, when the search returns several", async () => {
    const mixed = [
      { id: "1", market_hours: { is_open: false }, attributes: { display_symbol: "SPYG" } },
      { id: "2", market_hours: { is_open: true, next_close: 99 }, attributes: { display_symbol: "SPY" } },
    ];
    const p = new PythSessions({ fetch: fakeFetch({ "/v2/price_feeds": mixed }), now: () => WEDNESDAY });
    expect((await p.current()).isOpen).toBe(true);
  });

  it("falls back to the first feed when SPY is missing", async () => {
    const other = [{ id: "1", market_hours: { is_open: true }, attributes: { display_symbol: "SPYV" } }];
    const p = new PythSessions({ fetch: fakeFetch({ "/v2/price_feeds": other }), now: () => WEDNESDAY });
    expect((await p.current()).isOpen).toBe(true);
  });

  it("throws rather than guessing when Pyth is down", async () => {
    const p = new PythSessions({ fetch: fakeFetch({ "/v2/price_feeds": fails(502) }), now: () => WEDNESDAY });
    await expect(p.current()).rejects.toThrow("502");
  });

  it("throws when there is no calendar at all", async () => {
    const p = new PythSessions({ fetch: fakeFetch({ "/v2/price_feeds": [] }), now: () => WEDNESDAY });
    await expect(p.current()).rejects.toThrow(/no equity feed/);
  });
});
