import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * The admin app's build.
 *
 * Deliberately plain next to `apps/web`'s, which carries resolver plugins to
 * scope wallet connectors per importer. This app needs none of that: it has
 * no chain code of its own and nothing to keep apart.
 *
 * It is not smaller for it. Privy ships the wallet stack transitively, so the
 * bundle is 2,576 kB either way — see `src/deps.test.ts`. What this app does
 * not carry is the product's own chain, execution and market code.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174 },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
