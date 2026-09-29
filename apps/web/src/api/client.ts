import { SAMPLE, sampleResponse } from "../dev/sample";
import { getAccessToken } from "@privy-io/react-auth";
import { identityToken } from "../auth/identity";

const BASE = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "http://localhost:8787";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /**
     * Whatever the route attached to the refusal. A price that moved between
     * confirming and signing carries the new decision here, so the sheet can
     * show what changed instead of only saying that something did.
     */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Two tokens go up. The access token says who is calling; the identity token
 * carries Privy's signed claim about their wallet, which is why the server
 * never has to take the client's word for an address.
 *
 * Either can be null when nobody is signed in, which is not an error — the
 * server decides whether the route needed them.
 */
export const apiFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  // Sample data for design review (VITE_SAMPLE=1); off in a normal build.
  if (SAMPLE) {
    const sample = sampleResponse(path);
    if (sample !== undefined) return sample as T;
  }
  // `getAccessToken` answers from memory and only goes to the network when the
  // token is near expiry, so it is called per request. The identity token is
  // read from what Privy already holds — see auth/identity.tsx for what asking
  // Privy for it on every request cost us.
  const token = await getAccessToken();
  const identity = identityToken();

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (identity) headers.set("X-Privy-Identity-Token", identity);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const err =
      body && typeof body === "object" && "error" in body
        ? (body.error as { code?: string; message?: string; details?: unknown })
        : {};
    throw new ApiError(res.status, err.code ?? "unknown", err.message ?? res.statusText, err.details);
  }
  return body as T;
};
