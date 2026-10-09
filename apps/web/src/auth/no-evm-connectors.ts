/**
 * Stand-ins for the EVM wallet connectors Privy imports at the top of its
 * bundle: Coinbase Wallet and both WalletConnect providers. vite.config.ts
 * points those packages here.
 *
 * Sign-in is email-only and the wallet is Solana, so nothing here ever runs:
 * Privy reaches for them only to connect an external EVM wallet, and
 * `externalWallets.walletConnect.enabled: false` in PrivyBoundary keeps it from
 * initialising WalletConnect on its own. The real packages were about a fifth
 * of the first download, paid before the sign-in screen appeared.
 *
 * If a connector is ever wanted, delete the alias, not this guard: each one
 * fails loudly rather than pretending to connect.
 */
const refuse = (name: string) => () =>
  Promise.reject(new Error(`${name} is not bundled: Mercury signs in by email only.`));

// @coinbase/wallet-sdk. Privy builds its Coinbase connector on load whatever
// the login methods, and asks it for a provider then, so this one has to exist:
// it listens to nothing and answers every request with a refusal.
const inertProvider = {
  request: refuse("Coinbase Wallet"),
  on: () => inertProvider,
  once: () => inertProvider,
  off: () => inertProvider,
  removeListener: () => inertProvider,
  removeAllListeners: () => inertProvider,
  emit: () => false,
  disconnect: () => Promise.resolve(),
};
export const createCoinbaseWalletSDK = () => ({ getProvider: () => inertProvider });

// @walletconnect/ethereum-provider
export const EthereumProvider = { init: refuse("WalletConnect") };
export const OPTIONAL_METHODS: string[] = [];
export const OPTIONAL_EVENTS: string[] = [];

// @walletconnect/universal-provider
export const UniversalProvider = { init: refuse("WalletConnect") };
export default UniversalProvider;
