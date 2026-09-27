import { SAMPLE, sampleResponse } from "../dev/sample";
import { getAccessToken } from "@privy-io/react-auth";

const BASE = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "http://localhost:8787";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
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
 * `getAccessToken` refreshes one that is near expiry, so call it per request
 * rather than holding one. Either can be null when nobody is signed in, which
 * is not an error — the server decides whether the route needed them.
 */
export const apiFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  // Sample data for design review (VITE_SAMPLE=1); off in a normal build.
  if (SAMPLE) {
    const sample = sampleResponse(path);
    if (sample !== undefined) return sample as T;
  }
  const [token, identityToken] = await Promise.all([
    getAccessToken(),
    // Older builds of the SDK do not export this; a missing identity token
    // costs the wallet address, not the session.
    import("@privy-io/react-auth")
      .then((m) => ("getIdentityToken" in m ? m.getIdentityToken() : null))
      .catch(() => null),
  ]);

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (identityToken) headers.set("X-Privy-Identity-Token", identityToken);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const err =
      body && typeof body === "object" && "error" in body
        ? (body.error as { code?: string; message?: string })
        : {};
    throw new ApiError(res.status, err.code ?? "unknown", err.message ?? res.statusText);
  }
  return body as T;
};
