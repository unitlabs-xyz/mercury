import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import "./tokens.css";

/**
 * The admin app's entry.
 *
 * **Email only**, and the same Privy app as the product — which is what lets
 * `ADMIN_PRIVY_USER_IDS` on the API gate this app with no backend change at
 * all: same app, same DIDs, same allowlist.
 *
 * `loginMethods: ["email"]` does not make the bundle smaller, and it is worth
 * recording that it does not. Measured: this app builds to 2,576 kB against
 * the customer app's 2,555 kB, because `@privy-io/react-auth` ships the
 * wallet stack transitively — walletconnect, ethers, secp256k1 — and these
 * options are runtime configuration, not anything a bundler can act on. The
 * reason to keep the login narrow is that an admin session should not be able
 * to connect a wallet, not that it saves bytes.
 */
const appId = import.meta.env["VITE_PRIVY_APP_ID"] as string | undefined;
if (appId === undefined || appId.length === 0) {
  throw new Error("VITE_PRIVY_APP_ID is required; it is substituted at build time");
}

/** Each read sets its own interval; this is just the shared client. */
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email"],
        appearance: { theme: "light", accentColor: "#0f7480" },
        /* No wallet is created for an admin session, on either chain.
           Signing in here is proving who you are, not holding anything — and
           an admin who is also a customer keeps the wallet they already have:
           this only suppresses creating a new one. */
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          solana: { createOnLogin: "off" },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </PrivyProvider>
  </StrictMode>,
);
