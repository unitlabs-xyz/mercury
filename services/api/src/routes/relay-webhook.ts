import { Hono } from "hono";
import type { FundingStore } from "../funding/store.js";
import type { RelayStatus } from "../funding/relay.js";
import { verifyRelayWebhook } from "../funding/verify.js";

export interface RelayWebhookDeps {
  readonly store: FundingStore;
  /** Relay signs with the API key. Same secret, two jobs — theirs, not our choice. */
  readonly secret: string;
}

interface WirePayload {
  readonly event?: string;
  readonly data?: {
    readonly status?: RelayStatus;
    readonly requestId?: string;
    readonly inTxHashes?: readonly string[];
    readonly txHashes?: readonly string[];
    readonly failReason?: string;
    readonly depositAddress?: {
      readonly address?: string;
      readonly depositTxHash?: string | null;
    } | null;
  };
}

/**
 * Relay telling us a deposit moved.
 *
 * Registered outside `/v1/*`, so the auth middleware in `app.ts` does not guard
 * it — it cannot, because the caller is Relay and has no session. The signature
 * is its authentication; see `funding/verify.ts`.
 *
 * It advances the row and stops. Naming the deposit in the feed happens in the
 * wallet-events pass, not here: Relay reports `success` the moment it fills,
 * which is before `wallet-events` has seen the USDC, so there is usually no row
 * to name yet. See `funding/enrich.ts`.
 */
export function relayWebhookRoutes(deps: RelayWebhookDeps): Hono {
  const app = new Hono();

  app.post("/webhooks/relay", async (c) => {
    /*
     * The raw text, not a parse and re-serialise. The signature covers the
     * bytes Relay sent, and `JSON.stringify(JSON.parse(x))` is not reliably x.
     */
    const body = await c.req.text();
    const verdict = verifyRelayWebhook({
      body,
      timestamp: c.req.header("x-signature-timestamp") ?? null,
      signature: c.req.header("x-signature-sha256") ?? null,
      secret: deps.secret,
    });
    if (!verdict.ok) {
      /* The code, never the body or the headers: an unverified body is somebody
         else's data and may be anything at all. */
      console.warn(`relay-webhook: refused a delivery (${verdict.code})`);
      return c.json({ error: { code: verdict.code } }, 401);
    }

    let payload: WirePayload;
    try {
      payload = JSON.parse(body) as WirePayload;
    } catch {
      return c.json({ error: { code: "malformed" } }, 400);
    }

    const data = payload.data;
    /*
     * Matched on the deposit address, never on `requestId`. Relay regenerates
     * the quote on over- or underpayment and the fill lands under a new id
     * while the one we minted stays `waiting` forever — a tracker keyed on our
     * id reports a landed deposit as pending for all time.
     */
    const address = data?.depositAddress?.address;
    const status = data?.status;
    if (address === undefined || status === undefined) {
      return c.json({ ok: true, ignored: "no deposit address or status" });
    }

    const advanced = await deps.store.advance(address, {
      status,
      ...(data?.depositAddress?.depositTxHash ? { inTxHash: data.depositAddress.depositTxHash } : {}),
      ...(data?.txHashes?.[0] === undefined ? {} : { outTxHash: data.txHashes[0] }),
      /* "N/A" is Relay's way of saying there is no reason, not a reason. */
      ...(data?.failReason === undefined || data.failReason === "N/A" ? {} : { failReason: data.failReason }),
      ...(data?.requestId === undefined ? {} : { relayRequestId: data.requestId }),
    });

    /*
     * 200 for an address we do not know. A 4xx would have Relay retry forever
     * for a deposit that was never ours — another app's webhook pointed at us,
     * or a row we have since deleted.
     */
    if (advanced === null) return c.json({ ok: true, ignored: "unknown deposit address" });

    return c.json({ ok: true, status });
  });

  return app;
}
