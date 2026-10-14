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
 * Relay telling us a deposit moved. The only writer of a terminal status.
 *
 * Registered outside `/v1/*`, so the auth middleware in `app.ts` does not
 * guard it — it cannot, because the caller is Relay and has no session. The
 * signature is its authentication; see `funding/verify.ts`.
 *
 * This is deliberately the only way a deposit becomes `success`. The browser
 * reports what it executed through `/v1/money/fund/submitted`, and that cannot
 * set a terminal status — the hash it holds proves a transaction landed, not
 * that it was this deposit, and on an EVM origin it proves only leg one of two.
 * A deposit record a client can write success into is not a record.
 *
 * It settles the row and stops. Naming the deposit in the feed happens in the
 * wallet-events pass: Relay reports `success` the moment it fills, which is
 * before `wallet-events` has seen the USDC, so there is usually no row to name
 * yet. See `funding/enrich.ts`.
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
     * Matched on the request id, which is ours: we minted it, stored it, and
     * handed it to nobody but the browser that executed it.
     *
     * It could not be the key while deposit addresses existed — Relay
     * regenerates the quote on over- or underpayment, and the fill then lands
     * under a new id while the one we minted stays `waiting` for ever. That
     * cannot happen here: the amount is fixed by a signature before Relay
     * sees it, so there is nothing to regenerate. Dropping deposit addresses
     * is what made this the right key.
     */
    const requestId = data?.requestId;
    const status = data?.status;
    if (requestId === undefined || status === undefined) {
      return c.json({ ok: true, ignored: "no request id or status" });
    }

    const settled = await deps.store.settle(requestId, {
      status,
      ...(data?.inTxHashes?.[0] === undefined ? {} : { inTxHash: data.inTxHashes[0] }),
      ...(data?.txHashes?.[0] === undefined ? {} : { outTxHash: data.txHashes[0] }),
      /* "N/A" is Relay's way of saying there is no reason, not a reason. */
      ...(data?.failReason === undefined || data.failReason === "N/A" ? {} : { failReason: data.failReason }),
    });

    /*
     * 200 for a request id we do not know. A 4xx would have Relay retry for
     * ever over a deposit that was never ours — another app's webhook pointed
     * at us, or a row we have since deleted.
     */
    if (settled === null) return c.json({ ok: true, ignored: "unknown request id" });

    return c.json({ ok: true, status });
  });

  return app;
}
