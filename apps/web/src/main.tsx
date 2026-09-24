import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PrivyBoundary } from "./auth/PrivyBoundary";
import "./tokens.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrivyBoundary>
      <App />
    </PrivyBoundary>
  </StrictMode>,
);
