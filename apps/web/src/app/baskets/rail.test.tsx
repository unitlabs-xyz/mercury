import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BasketsRail } from "./rail";

describe("baskets right rail", () => {
  it("explains Glider ownership without inventing a wallet position", () => {
    const html = renderToStaticMarkup(<BasketsRail onExplore={() => undefined} />);

    expect(html).toContain("Your baskets");
    expect(html).toContain("Portfolio tracking is coming to Mercury");
    expect(html).toContain("your own smart account");
    expect(html).toContain("Glider rebalances daily");
    expect(html).not.toContain("You don’t have any baskets");
  });
});
