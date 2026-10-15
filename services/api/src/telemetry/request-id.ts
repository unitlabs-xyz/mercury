/**
 * One id per request: on the context, on the active span, and in the response.
 *
 * This is what makes a report usable. "It failed" becomes a value somebody can
 * paste, and that value finds the trace in Tempo, every log line the request
 * wrote in Loki, and every query it ran — three stores that otherwise share no
 * key at all. Without it there are three systems and no way to join them.
 *
 * An inbound id is kept, so an id set by a proxy or by the web app on a retry
 * stays the same id end to end. It is validated first, and that is not
 * optional: the value is echoed into a response header and into log lines, so
 * an unchecked one is a caller writing our logs for us. A newline forges an
 * entry, and eight kilobytes echoed on every response is a free amplifier.
 * Shape and length, or we mint our own.
 */
import { randomUUID } from "node:crypto";
import { trace } from "@opentelemetry/api";
import type { MiddlewareHandler } from "hono";

declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
  }
}

const HEADER = "x-request-id";

/**
 * Letters, digits, dashes and underscores, long enough to be meant and short
 * enough to be a header.
 *
 * An allowlist rather than a search for the characters that would hurt:
 * stripping newlines leaves the next unexpected byte to be discovered by
 * whoever is reading the logs when it matters.
 */
const WELL_FORMED = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Whether an inbound id may be reused.
 *
 * Exported because it is the second line of defence and not the first: Node's
 * own HTTP layer rejects a header value containing a newline before any
 * handler runs, and `fetch`'s `Headers` will not even construct one. So the
 * injection case this guards cannot be expressed through the normal request
 * path, and its test calls this directly rather than pretending otherwise.
 *
 * It stays because the layer below is not ours to rely on. A different server
 * adapter, a proxy that rewrites headers, or a future caller that sets the
 * value from somewhere other than a parsed request would all arrive here, and
 * this value is echoed into a header and into log lines either way.
 */
export const acceptableId = (given: string | undefined): boolean =>
  given !== undefined && WELL_FORMED.test(given);

export const requestId = (generate: () => string = randomUUID): MiddlewareHandler => {
  return async (c, next) => {
    const given = c.req.header(HEADER);
    const id = acceptableId(given) ? given! : generate();

    c.set("requestId", id);
    c.header(HEADER, id);
    /*
     * On the span as well, so Tempo can be searched by the id a person quoted.
     * A no-op when telemetry is off: `getActiveSpan` returns undefined and the
     * optional call does nothing.
     */
    trace.getActiveSpan()?.setAttribute("mercury.request_id", id);

    await next();
  };
};
