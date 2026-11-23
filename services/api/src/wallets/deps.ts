import type { Db } from "../db/client.js";
import type { WalletDeps } from "../routes/wallets.js";
import { completeLink, listWallets, openChallenge, renameWallet, unlinkWallet } from "./store.js";
import { verifyWalletSignature } from "./verify.js";

/**
 * The wallet routes over Postgres, with real signature checks and the clock.
 * One construction, used by the server and by the test that drives the routes
 * end to end, so the two cannot be wired differently.
 */
export const pgWalletDeps = (
  db: Db,
  opts: { readonly appUrl: string; readonly limit: number },
): WalletDeps => ({
  limit: opts.limit,
  list: (userId) => listWallets(db, userId),
  challenge: (userId, address) =>
    openChallenge(db, { userId, address, appUrl: opts.appUrl, limit: opts.limit, now: new Date() }),
  link: (userId, challengeId, signature) =>
    completeLink(db, {
      userId,
      challengeId,
      signature,
      limit: opts.limit,
      now: new Date(),
      verify: verifyWalletSignature,
    }),
  rename: (userId, walletId, label) => renameWallet(db, { userId, walletId, label }),
  unlink: (userId, walletId, deleteHistory) =>
    unlinkWallet(db, { userId, walletId, deleteHistory, now: new Date() }),
});
