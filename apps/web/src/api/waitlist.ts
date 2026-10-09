import { ApiError } from "./client";

/**
 * The waitlist lives on the production API, whichever API the rest of the app
 * talks to: a signup from a dev or beta build is still a real person joining
 * the one list. VITE_WAITLIST_API_URL overrides it, e.g. for a local API.
 */
const WAITLIST_BASE = (
  (import.meta.env["VITE_WAITLIST_API_URL"] as string | undefined) || "https://api.trymercury.xyz"
).replace(/\/$/, "");

/**
 * Joining the waitlist from inside the sign-in sheet.
 *
 * The same public route the marketing site posts to. Signing up again with an
 * address already on the list is a success, not a clash — the server answers
 * `ok` either way — so someone who forgot they had joined is not told off.
 *
 * A plain fetch rather than apiFetch: the route is public, and the session
 * tokens apiFetch attaches have no business going to another host.
 */
export const joinWaitlist = async (entry: {
  email: string;
  country: string;
  name?: string;
  handle?: string;
}): Promise<{ ok: true }> => {
  const res = await fetch(`${WAITLIST_BASE}/waitlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err =
      body && typeof body === "object" && "error" in body
        ? (body.error as { code?: string; message?: string })
        : {};
    throw new ApiError(res.status, err.code ?? "unknown", err.message ?? res.statusText);
  }
  return body as { ok: true };
};
