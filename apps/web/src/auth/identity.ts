import { useIdentityToken } from "@privy-io/react-auth";
import { useEffect } from "react";

/**
 * Privy's identity token, where non-React code can read it.
 *
 * Privy normally sends this as a cookie on every request to your own server,
 * which needs the two to be same-origin. Ours are not — the browser talks to
 * the API on another origin — so the other route in Privy's docs applies: read
 * the token with `useIdentityToken` and attach it yourself.
 *
 * That hook is the cheap one. It returns what Privy already holds and
 * re-renders when it changes. Its imperative sibling, `getIdentityToken()`,
 * calls `/users/me` over the network on every invocation, and `apiFetch` used
 * to call it per request — so one screen with three queries made three calls,
 * refetch intervals made more, and Privy answered 429. That failure was
 * swallowed into "no token", the server read it as "no wallet on this
 * session", and the screen reported that Kamino could not be reached: a rate
 * limit on our own auth provider, blamed on a third party two layers away.
 *
 * A module-level mirror rather than a context, because the reader is
 * `apiFetch` — an ordinary function, which cannot use a hook.
 */
let current: string | null = null;

export const identityToken = (): string | null => current;

/** Set by `IdentityTokenSync`. Exported so a test can stand in for Privy. */
export const setIdentityToken = (token: string | null): void => {
  current = token;
};

/**
 * Keeps the mirror in step with Privy. Mounted once, inside the provider.
 *
 * Privy issues a fresh identity token whenever the user authenticates, links
 * an account, reloads the page, or renews an expired access token. Each of
 * those re-renders this and changes what the next request carries. Signing out
 * sets it to null, so a later session is never handed the previous one's token.
 */
export const IdentityTokenSync = (): null => {
  const { identityToken: token } = useIdentityToken();
  useEffect(() => {
    setIdentityToken(token);
  }, [token]);
  return null;
};
