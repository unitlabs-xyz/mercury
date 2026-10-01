import { useEffect } from "react";
import { usePrivy, useIdentityToken } from "@privy-io/expo";

/**
 * Privy's two tokens, where non-React code can reach them.
 *
 * `apiFetch` is an ordinary function and cannot call a hook, so a component
 * inside the provider mirrors the getters here. The web does the same thing for
 * the same reason — see `apps/web/src/auth/identity.ts`.
 *
 * What is NOT the same is what the getters cost. On the web,
 * `getIdentityToken()` calls `/users/me` over the network on every invocation;
 * calling it per request there got one screen's three queries rate-limited by
 * Privy, and the 429 was swallowed into "no token", read by the server as "no
 * wallet on this session", and reported to the user as Kamino being
 * unreachable. The Expo SDK's reads the token out of local storage instead:
 *
 *     async getIdentityToken() {
 *       const id = await this.getActiveUserId();
 *       const t = await this._storage.get(key(id));
 *       return typeof t === "string" ? t : null;
 *     }
 *
 * So both are called per request here, which is also what Privy's own docs
 * require of the access token: "this function should be called anytime an
 * access token is needed, at the time it's needed. It is not recommended to
 * cache the response." A mirror of the VALUES would go stale and send an
 * expired one; a mirror of the GETTERS cannot.
 */
export interface TokenSource {
  readonly access: () => Promise<string | null>;
  readonly identity: () => Promise<string | null>;
}

let source: TokenSource | null = null;

/** Exported so a test can stand in for Privy. */
export const setTokenSource = (next: TokenSource | null): void => {
  source = next;
};

/**
 * The headers a call to our API carries.
 *
 * The access token says who is calling; the identity token carries Privy's
 * signed claim about their wallet, which is why the server never has to take
 * the client's word for an address. Either can be null when nobody is signed
 * in, which is not an error — the server decides whether the route needed them.
 */
export const authHeaders = async (): Promise<Record<string, string>> => {
  if (source === null) return {};
  const [access, identity] = await Promise.all([
    source.access().catch(() => null),
    source.identity().catch(() => null),
  ]);
  return {
    ...(access === null ? {} : { Authorization: `Bearer ${access}` }),
    ...(identity === null ? {} : { "X-Privy-Identity-Token": identity }),
  };
};

/**
 * Keeps the mirror pointed at Privy. Mounted once, inside the provider.
 *
 * Cleared on unmount so a later session is never handed the previous one's
 * getters.
 */
export const TokenSync = (): null => {
  const { getAccessToken } = usePrivy();
  const { getIdentityToken } = useIdentityToken();
  useEffect(() => {
    setTokenSource({ access: getAccessToken, identity: getIdentityToken });
    return () => setTokenSource(null);
  }, [getAccessToken, getIdentityToken]);
  return null;
};
