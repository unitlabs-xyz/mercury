import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Whether this really came from Relay, and recently.
 *
 * `POST /webhooks/relay` is the one route in this service with no session
 * behind it — it cannot have one, because the caller is Relay — so the
 * signature is the whole of its authentication and this function is the whole
 * of the signature check. Pure on purpose: the clock is injected, so the
 * replay window is a test rather than a wait.
 *
 * Relay signs `timestamp.body` with the API key and sends the hex digest in
 * `X-Signature-SHA256`, with the timestamp in `X-Signature-Timestamp`.
 */

export type WebhookRefusal = "malformed" | "stale" | "bad_signature";

export type WebhookVerdict = { readonly ok: true } | { readonly ok: false; readonly code: WebhookRefusal };

/**
 * Five minutes either side.
 *
 * A valid signature is valid forever, so without a window a captured delivery
 * can be replayed at us indefinitely — and `advance` would happily walk a
 * deposit from `success` to `refund` on somebody else's schedule. Both
 * directions, because a clock ahead of ours is as much a sign of something
 * replaying as a clock behind it.
 */
const WINDOW_MS = 5 * 60_000;

export const verifyRelayWebhook = (input: {
  readonly body: string;
  readonly timestamp: string | null;
  readonly signature: string | null;
  readonly secret: string;
  readonly now?: () => number;
}): WebhookVerdict => {
  if (input.timestamp === null || input.timestamp.length === 0 || input.signature === null) {
    return { ok: false, code: "malformed" };
  }

  const sent = Number(input.timestamp);
  if (!Number.isFinite(sent)) return { ok: false, code: "malformed" };

  const now = (input.now ?? Date.now)();
  if (Math.abs(now - sent) > WINDOW_MS) return { ok: false, code: "stale" };

  /* The timestamp is inside the signed string, so relabelling a stale delivery
     to get past the window above fails here instead. */
  const expected = createHmac("sha256", input.secret).update(`${input.timestamp}.${input.body}`).digest();

  let got: Buffer;
  try {
    got = Buffer.from(input.signature, "hex");
  } catch {
    return { ok: false, code: "bad_signature" };
  }

  /*
   * `timingSafeEqual` throws on a length mismatch rather than returning false,
   * so the length is checked first — which also covers a signature that is not
   * hex at all, since Node decodes those to a short buffer rather than
   * throwing. Comparing lengths is not a leak: the digest length is fixed and
   * public.
   */
  if (got.length !== expected.length) return { ok: false, code: "bad_signature" };
  return timingSafeEqual(got, expected) ? { ok: true } : { ok: false, code: "bad_signature" };
};
