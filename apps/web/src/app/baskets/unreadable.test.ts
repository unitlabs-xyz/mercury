import { describe, expect, it } from "vitest";
import { partial, stale, unread } from "./unreadable";

describe("one vocabulary for an unreadable thing", () => {
  it("names who failed, rather than leaving it passive", () => {
    /* "Account balances are unavailable" does not say unavailable to whom, or
       whose fault it is. It was ours, and there is a Retry next to it. */
    expect(unread("your balances")).toBe("We could not read your balances.");
  });

  it("gives the stale line no full stop, because it is not a sentence in a block", () => {
    /* It renders in a one-line strip with a Retry link at the far end. */
    const line = stale("recent activity");

    expect(line).toBe("Could not refresh recent activity · showing the last reading");
    expect(line.endsWith(".")).toBe(false);
  });

  it("keeps partial apart from absent, because the figure shown is real", () => {
    expect(partial("balances")).toContain("may be low");
    expect(partial("balances")).not.toBe(unread("balances"));
  });

  it("reads correctly for every noun the basket page passes it", () => {
    /* The nouns are the only thing that varies, so they are the only thing
       that can read wrong. */
    for (const what of [
      "this basket",
      "your holdings",
      "your balances",
      "recent activity",
      "the sector breakdown",
    ]) {
      expect(unread(what)).toMatch(/^We could not read .+\.$/);
      expect(stale(what)).toMatch(/^Could not refresh .+ · showing the last reading$/);
    }
  });
});
