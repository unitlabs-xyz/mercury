/**
 * Loaded before anything else, from `main.tsx`, the app's entry.
 *
 * Privy reaches for `Buffer` when it signs a message, and the browser has no
 * such global. Until the EVM connectors were aliased away in vite.config.ts it
 * arrived by accident — `@coinbase/wallet-sdk` and WalletConnect each bundle a
 * shim, and stubbing them out took the shim with them. Basket withdrawals,
 * which sign a message, then failed with `Buffer is not defined` and a spinner
 * that never stopped.
 *
 * Assigned to the global rather than imported at each call site because Privy
 * reads it from inside its own modules, where our imports cannot reach. The
 * same reason, and the same fix, as `apps/mobile/src/polyfills.ts`.
 */
import { Buffer } from "buffer";

const withBuffer = globalThis as { Buffer?: typeof Buffer };
if (withBuffer.Buffer === undefined) withBuffer.Buffer = Buffer;
