import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BasketsRail } from "./rail";

describe("baskets right rail", () => {
  it("keeps the Glider rail signed-out state free of invented balances", () => {
    const html = renderToStaticMarkup(<BasketsRail
      onExplore={() => undefined}
      onSignIn={() => undefined}
      onRetry={() => undefined}
      signedIn={false}
      loading={false}
      error={false}
      portfolios={[]}
      templates={[]}
      instruments={new Map()}
    />);

    expect(html).toContain("Your baskets");
    expect(html).toContain("Sign in to see your baskets");
    expect(html).toContain("Glider rebalances daily");
    expect(html).not.toContain("You don’t have any baskets");
  });
});
