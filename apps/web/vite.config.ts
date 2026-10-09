import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

/* Privy's EVM wallet connectors, unused by an email-only Solana sign-in. See the file. */
const noEvm = fileURLToPath(new URL("./src/auth/no-evm-connectors.ts", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@coinbase\/wallet-sdk$/, replacement: noEvm },
      { find: /^@walletconnect\/ethereum-provider$/, replacement: noEvm },
      { find: /^@walletconnect\/universal-provider$/, replacement: noEvm },
    ],
  },
  server: { port: 5173, proxy: { "/v1": "http://localhost:8787" } },
});
