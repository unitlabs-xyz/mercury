import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PrivyBoundary } from "./auth/PrivyBoundary";
import "./tokens.css";
import { startValueFlash } from "./ui/valueFlash";

// A value that changes on screen dips and comes back, everywhere; see ui/valueFlash.ts.
startValueFlash();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrivyBoundary>
      <App />
    </PrivyBoundary>
  </StrictMode>,
);
