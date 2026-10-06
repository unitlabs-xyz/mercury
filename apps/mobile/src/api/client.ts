import { authHeaders } from "./identity.js";

/**
 * Inlined at bundle time by Metro, so a change needs `expo start -c` rather
 * than a reload. The simulator reaches this Mac as localhost; a real device
 * does not, which is why a deployed URL is the sane default to point at.
 */
const BASE = process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:8787";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /**
     * Whatever the route attached to the refusal. A price that moved between
     * confirming and signing carries the new decision here, so a sheet can show
     * what changed instead of only saying that something did.
     */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Every read from our own API goes through here. The web's `apiFetch`, for RN. */
export const apiFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  for (const [k, v] of Object.entries(await authHeaders())) headers.set(k, v);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const err =
      body !== null && typeof body === "object" && "error" in body
        ? (body.error as { code?: string; message?: string; details?: unknown })
        : {};
    throw new ApiError(
      res.status,
      err.code ?? "unknown",
      err.message ?? `request failed with ${res.status}`,
      err.details,
    );
  }
  return body as T;
};
