import { ReferralCode } from "@mercury/types";

/**
 * An invite code from the address someone arrived on, kept until they are
 * signed in and it can be claimed.
 *
 * Read once, before React mounts, because the router redirects `/` to the
 * portfolio or opens sign-in, and neither keeps the query string. Stored
 * rather than threaded through, because Privy's email code is a step the
 * address does not survive on every device.
 */
const KEY = "harbor.ref";
const KEEP_MS = 30 * 86_400_000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const browser = (): Store | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const captureRef = (search: string, store: Store | null = browser(), now = Date.now()): void => {
  const code = new URLSearchParams(search).get("ref");
  if (store === null || code === null || !ReferralCode.safeParse(code).success) return;
  try {
    store.setItem(KEY, JSON.stringify({ code, at: now }));
  } catch {
    /* full or blocked: the link simply does not count */
  }
};

export const pendingRef = (store: Store | null = browser(), now = Date.now()): string | null => {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const { code, at } = JSON.parse(raw) as { code?: unknown; at?: unknown };
    return typeof code === "string" &&
      ReferralCode.safeParse(code).success &&
      typeof at === "number" &&
      now - at < KEEP_MS
      ? code
      : null;
  } catch {
    return null;
  }
};

export const clearRef = (store: Store | null = browser()): void => {
  try {
    store?.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
};

/* Not answers about the code: the request was not authorised yet, timed out, or was rate limited. */
const TRANSIENT = new Set([401, 408, 429]);

/**
 * Whether an attempt to claim is over for good. Only a refusal is: an
 * `ApiError` with a 4xx status other than the transient ones above. Read by
 * shape rather than `instanceof`, so this module stays free of `api/client.ts`
 * and the Privy import that comes with it.
 */
export const settles = (err: unknown): boolean => {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500 && !TRANSIENT.has(status);
};
