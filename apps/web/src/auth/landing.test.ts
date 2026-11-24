import { describe, expect, it } from "vitest";
import { landingAfterSignIn, returnTo } from "./landing";

describe("landingAfterSignIn", () => {
  it("goes to the portfolio, keeping what the link asked for", () => {
    expect(landingAfterSignIn(null, "?move=1")).toBe("/portfolio?move=1");
    expect(landingAfterSignIn(undefined, "")).toBe("/portfolio");
  });

  it("goes back to where someone was headed before signing in, query and all", () => {
    expect(landingAfterSignIn({ from: "/stock/TSLA?borrow=repay" }, "")).toBe("/stock/TSLA?borrow=repay");
  });

  it("never goes anywhere but a path on this site", () => {
    expect(landingAfterSignIn({ from: "https://elsewhere.test" }, "")).toBe("/portfolio");
    expect(landingAfterSignIn({ from: 7 }, "?move=1")).toBe("/portfolio?move=1");
  });
});

describe("returnTo", () => {
  it("remembers the page and its query", () => {
    expect(returnTo({ pathname: "/portfolio", search: "?move=1" })).toBe("/portfolio?move=1");
  });
});
