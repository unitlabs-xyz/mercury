// First, before anything that might reach for a global it sets.
import "./polyfills";
import { Analytics } from "@vercel/analytics/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PrivyBoundary } from "./auth/PrivyBoundary";
import { captureRef } from "./referrals/pending";
import "./tokens.css";
import { startValueFlash } from "./ui/valueFlash";

// Before the router can redirect the address away: see referrals/pending.ts.
captureRef(window.location.search);

// A value that changes on screen dips and comes back, everywhere; see ui/valueFlash.ts.
startValueFlash();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrivyBoundary>
      <App />
    </PrivyBoundary>
    {/* Vercel Web Analytics: visitors and page views, on the Vercel deployment. */}
    <Analytics />
  </StrictMode>,
);
