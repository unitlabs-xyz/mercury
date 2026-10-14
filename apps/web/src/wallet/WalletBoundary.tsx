import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "./appkit";

/**
 * Wagmi's context, which AppKit's EVM adapter reads through.
 *
 * A pass-through when no project ID is configured — the app renders exactly as
 * it did before any of this, and the deposit methods that need a wallet are
 * hidden rather than broken.
 *
 * React Query is already provided further in; AppKit uses the same instance.
 */
export const WalletBoundary = ({ children }: { children: ReactNode }) =>
  wagmiConfig === null ? <>{children}</> : <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>;
