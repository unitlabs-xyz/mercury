import { describe, expect, it } from "vitest";
import { REFUSE_COPY, refuseCopy } from "./OrderSheet";

/**
 * The refusal copy was written for a buyer, and four of the seven reasons are
 * reachable on a sell. One of them told the truth about us and a falsehood
 * about the reader: "we don't offer this stock yet", when what happened is
 * their wallet holds none of it.
 */
describe("refuseCopy", () => {
  it("does not tell a seller we do not offer a stock they were just holding", () => {
    expect(refuseCopy("no_candidates", "sell").body).toContain("don't hold this stock");
    expect(refuseCopy("no_candidates", "buy").body).toContain("don't offer this stock");
  });

  it("turns the price the right way: a buy pushes up, a sell pushes down", () => {
    expect(refuseCopy("impact_too_high", "buy").body).toContain("push the price up");
    expect(refuseCopy("impact_too_high", "sell").body).toContain("push the price down");
  });

  it("says sell, not buy, in the reasons a seller can reach", () => {
    for (const reason of ["no_route", "corp_action_pending"] as const) {
      const { title, body } = refuseCopy(reason, "sell");
      expect(`${title} ${body}`.toLowerCase()).not.toContain("buy");
    }
  });

  it("leaves every buy-side message exactly as it was", () => {
    for (const reason of Object.keys(REFUSE_COPY) as (keyof typeof REFUSE_COPY)[]) {
      expect(refuseCopy(reason, "buy")).toEqual(REFUSE_COPY[reason]);
    }
  });

  /* The minimum is a buy-side rule — `decide` does not apply it to a sell — so
     there is no sell wording for it, and falling back is correct. */
  it("falls back to the shared copy where a sell has no wording of its own", () => {
    expect(refuseCopy("below_minimum", "sell")).toEqual(REFUSE_COPY.below_minimum);
    expect(refuseCopy("reference_stale", "sell")).toEqual(REFUSE_COPY.reference_stale);
  });
});
