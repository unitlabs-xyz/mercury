import { getAccessToken } from "@privy-io/react-auth";

/**
 * This app's one way of talking to the API.
 *
 * A cut-down copy of the product's `api/client.ts`, and shorter for a reason
 * worth stating: it sends only the access token. The product also sends
 * `X-Privy-Identity-Token`, which carries Privy's signed claim about a
 * wallet address — that is what stops the server taking a client's word for
 * an address. The admin surface never names a wallet, reads no balance and
 * writes nothing, so it has no use for one, and not asking for it is one
 * fewer credential in play.
 *
 * There is no sample mode here either. The product has one for design review;
 * an internal dashboard whose whole job is to report real figures should never
 * be able to show invented ones.
 */
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

export const apiFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  /* Answers from memory and only goes to the network near expiry, so it is
     called per request rather than cached here. */
  const token = await getAccessToken();

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

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
