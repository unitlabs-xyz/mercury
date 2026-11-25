import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it } from "vitest";
import type { AccountWallet } from "../../api/wallets";
import { walletConnectConfigured } from "../../wallet/appkit";
import LinkWalletSection from "./LinkWalletSection";

const mercury: AccountWallet = {
  id: "w-mercury",
  address: "Merc1111111111111111111111111111111111111111",
  kind: "privy_embedded",
  isPrimary: true,
  label: null,
  linkedAt: null,
};

it("says linking isn't available where AppKit has no project ID, rather than taking the page down", () => {
  // The test build has no Reown project ID, as a preview or a misconfigured deploy would not.
  expect(walletConnectConfigured).toBe(false);
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(LinkWalletSection, { wallets: [mercury], limit: 5 }),
    ),
  );
  expect(html).toContain("Linking a wallet isn&#x27;t available here yet.");
});
