import { describe, expect, it } from "vitest";
import { LIVE } from "./live";

/**
 * Fields, not behaviour, and not for want of trying.
 *
 * React Query refuses to schedule any timer when `isServer()` — which is
 * `typeof window === "undefined"` — so a `QueryObserver` driven from these
 * tests never polls no matter how far the clock is advanced. This package has
 * no DOM environment, and adding one to watch a `setInterval` would be a large
 * dependency bought for a small assertion.
 *
 * What is left still catches the bug that prompted this. The activity feed
 * carried a `staleTime` and no interval, which reads like a policy and behaves
 * like none — and the first test below is exactly the one it would have failed.
 */
describe("the account polling policy", () => {
  it("has an interval at all, which the activity feed did not", () => {
    expect(LIVE.refetchInterval).toBeGreaterThan(0);
  });

  /* Each poll reads the chain on the paid RPC; at ten seconds an open tab ran a plan's month out. */
  it("refreshes every thirty seconds", () => {
    expect(LIVE.refetchInterval).toBe(30_000);
  });

  /* Two policies about one piece of data. A page remounting inside the stale
     window would be served cache while the timer refetched underneath it. */
  it("never counts an answer fresh for longer than it waits to replace it", () => {
    expect(LIVE.staleTime).toBeLessThanOrEqual(LIVE.refetchInterval);
  });

  it("refetches on focus, because that is when a wallet popup has just closed", () => {
    expect(LIVE.refetchOnWindowFocus).toBe(true);
  });

  /* Absent rather than false: React Query's own default is not to poll a hidden
     tab, and restating it invites someone to "fix" it to true. A forgotten tab
     would spend an RPC quota on nobody — /v1/portfolio and /v1/money each read
     the chain, and the portfolio also asks Jupiter for prices. */
  it("does not poll a background tab", () => {
    expect("refetchIntervalInBackground" in LIVE).toBe(false);
  });
});
