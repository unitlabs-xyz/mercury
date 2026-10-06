import { defaultFetch } from "../fetch.js";

/** Jupiter's paid host. Same paths as `lite-api.jup.ag`; every request carries `x-api-key`. */
export const JUPITER_PRO = "https://api.jup.ag";

/** What every Jupiter adapter takes to reach the paid host instead of the free one. */
export interface JupiterAccess {
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
}

/** `"a, b,,c"` -> `["a", "b", "c"]`. */
export const parseJupiterKeys = (raw: string | undefined): readonly string[] =>
  (raw ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

/**
 * A fetch that signs each request with the next key in turn.
 *
 * Each key has its own rate limit, so rotating per request spreads the load
 * evenly across them rather than spending one key's quota before touching the
 * next. Server only: a key that ships to a browser is a public key, which is
 * why the web app stays on the keyless host.
 */
export const jupiterKeyedFetch = (
  keys: readonly string[],
  inner: typeof fetch = defaultFetch(),
): typeof fetch => {
  if (keys.length === 0) throw new Error("jupiterKeyedFetch: no keys");
  let next = 0;
  return (input, init) => {
    const key = keys[next]!;
    next = (next + 1) % keys.length;
    const headers = new Headers(init?.headers);
    headers.set("x-api-key", key);
    return inner(input, { ...init, headers });
  };
};

/** The paid host with rotating keys, or nothing — leaving each adapter on its keyless default. */
export const jupiterAccess = (keys: readonly string[], inner?: typeof fetch): JupiterAccess | undefined =>
  keys.length === 0 ? undefined : { baseUrl: JUPITER_PRO, fetch: jupiterKeyedFetch(keys, inner) };
