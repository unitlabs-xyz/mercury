// First, before anything that might reach for a global it sets.
import "./polyfills";
import { Analytics } from "@vercel/analytics/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PrivyBoundary } from "./auth/PrivyBoundary";
import { WalletBoundary } from "./wallet/WalletBoundary";
import "./tokens.css";
import { startValueFlash } from "./ui/valueFlash";

// A value that changes on screen dips and comes back, everywhere; see ui/valueFlash.ts.
startValueFlash();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrivyBoundary>
      {/* Wagmi's context, for the wallets somebody funds from. Inside Privy's
          because the account has to exist before anything can be funded, and a
          pass-through when no Reown project id is configured. */}
      <WalletBoundary>
        <App />
      </WalletBoundary>
    </PrivyBoundary>
    {/* Vercel Web Analytics: visitors and page views, on the Vercel deployment. */}
    <Analytics />
  </StrictMode>,
);
