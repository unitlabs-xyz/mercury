import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

/* Privy's EVM wallet connectors, unused by an email-only Solana sign-in. See the file. */
const noEvm = fileURLToPath(new URL("./src/auth/no-evm-connectors.ts", import.meta.url));

const PRIVY_EVM_CONNECTORS =
  /^(@coinbase\/wallet-sdk|@walletconnect\/ethereum-provider|@walletconnect\/universal-provider)$/;

/**
 * The stand-ins go to Privy and to nobody else.
 *
 * This was a global alias, written when Privy was the only wallet code in the
 * app. AppKit came later, and its WalletConnect connector is built on the
 * same `@walletconnect/universal-provider` — so the alias quietly removed it,
 * and AppKit, finding no WalletConnect connector, hid its QR code and its
 * "All Wallets" list. Nobody could connect a phone.
 *
 * Scoped by importer instead: a package imported from inside `@privy-io` gets
 * the stub, as before, and the eager bundle stays as small as it was; the
 * same package imported by AppKit gets the real thing, which ships only in
 * the lazy wallet chunk. In `vite dev` the dependency pre-bundle does not run
 * resolve plugins, so Privy gets the real packages there — larger, unused,
 * and harmless, since its WalletConnect is switched off in PrivyBoundary.
 */
const stubPrivyEvmConnectors = (): Plugin => ({
  name: "stub-privy-evm-connectors",
  enforce: "pre",
  resolveId(source, importer) {
    return PRIVY_EVM_CONNECTORS.test(source) && importer?.includes("@privy-io") === true ? noEvm : null;
  },
});

export default defineConfig({
  plugins: [stubPrivyEvmConnectors(), react(), tailwindcss()],
  server: { port: 5173, proxy: { "/v1": "http://localhost:8787" } },
});
