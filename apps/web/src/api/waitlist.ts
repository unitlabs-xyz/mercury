import { apiFetch } from "./client";

/**
 * Joining the waitlist from inside the sign-in sheet.
 *
 * The same public route the marketing site posts to. Signing up again with an
 * address already on the list is a success, not a clash — the server answers
 * `ok` either way — so someone who forgot they had joined is not told off.
 */
export const joinWaitlist = (entry: {
  email: string;
  country: string;
  name?: string;
  handle?: string;
}): Promise<{ ok: true }> => apiFetch("/waitlist", { method: "POST", body: JSON.stringify(entry) });
