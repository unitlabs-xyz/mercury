import { WalletBoundary } from "../../wallet/WalletBoundary";
import { FundFromChain } from "./FundFromChain";

/**
 * The chunk boundary for everything AppKit.
 *
 * This file exists to be dynamically imported and nothing else. Measured on
 * 14 October: wiring `WalletBoundary` at the app root took the first-load
 * bundle from 2,524 kB to 3,774 kB — a 50% increase paid by every visitor
 * before the sign-in screen, for a connector only a depositor ever touches.
 * `apps/web/src/auth/no-evm-connectors.ts` stubbed Privy's EVM connectors out
 * of the bundle for being "about a fifth of the first download"; this was half
 * again on top of that.
 *
 * So the provider lives here, beside the one panel that needs it, and
 * `AddCash.tsx` reaches it through `React.lazy`. `createAppKit()` runs at
 * module scope inside `wallet/appkit.ts`, so deferring this import defers the
 * modal, the WalletConnect client and both adapters with it.
 *
 * The rule that keeps it that way: nothing in the eager graph may import
 * `wallet/appkit`, `wallet/WalletBoundary`, `wallet/useFunder`, or any
 * component that uses them. A static import anywhere else silently undoes all
 * of this, and the only thing that would notice is a bundle measurement.
 */
const FundFromChainWithWallet = () => (
  <WalletBoundary>
    <FundFromChain />
  </WalletBoundary>
);

export default FundFromChainWithWallet;
