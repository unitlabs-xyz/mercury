/**
 * The service's logger: pino, with a scope per area.
 *
 * Why a package and not the console. The service logged 41 lines across 21 of
 * its 100 files when this was written — nine announcing capabilities at boot,
 * twenty-four `console.error` calls in catch blocks — and `orders/`, `relay/`,
 * `auth/`, `prices/` and `pricing.ts` had none at all. So "why was my order
 * refused" had no answer anywhere. Fixing that by adding console calls would
 * have left every line a sentence, which is only greppable; pino gives fields,
 * which are queryable, plus level filtering, redaction and child loggers, all
 * of it maintained by somebody else.
 *
 * Usage:
 *
 *     const log = logger("orders");
 *     log.debug({ ticker, usd }, "gate inputs");
 *     log.info({ orderId, side }, "order filled");
 *     log.warn({ ticker, ageMs }, "reference feed stale, using issuer");
 *     log.error({ err }, "could not reach jupiter");
 *
 * Fields first, message second — pino's argument order, kept rather than
 * wrapped, so that everything written about pino applies to this.
 *
 * Three things are configured here and each is load-bearing:
 *
 * **Redaction.** `redact` removes the fields that must not leave the process:
 * addresses, emails, balances, credentials. It runs during serialization,
 * which means it has already happened by the time the OTel stream sees the
 * line — so the copy that leaves the machine is the redacted one. That is a
 * stronger guarantee than a rule each of a hundred call sites is trusted to
 * remember.
 *
 * **The `err` serializer.** `errorLine` rather than pino's default, which
 * writes the stack. The reasoning from the old `log.ts` still holds: a stack
 * is a screenful of `node_modules` frames around the one sentence that says
 * what went wrong, and every call site here already says where it is.
 *
 * **The OTel destination.** Added explicitly, because
 * `@opentelemetry/instrumentation-pino` does not work under ESM — measured,
 * four ways, in `telemetry/otel-stream.ts`. Without it pino would log
 * beautifully to stdout and nothing would reach Loki.
 */
import { pino, type Logger as PinoLogger } from "pino";
import { errorLine } from "../log.js";
import { otelLogStream } from "../telemetry/otel-stream.js";

export type Log = PinoLogger;

type Env = Readonly<Record<string, string | undefined>>;

/**
 * The lowest level written. `info` unless told otherwise.
 *
 * Debug is off by default and that is the whole point of it: debug is where
 * the decision inputs go — what the price board held, which wrappers the gate
 * considered, why it refused — and those are worth recording while somebody
 * is reproducing one person's problem, not the rest of the time, when they
 * would be most of the volume and all of the cost.
 */
export const levelFrom = (env: Env = process.env): string => {
  const given = env["LOG_LEVEL"]?.trim().toLowerCase();
  const allowed = ["trace", "debug", "info", "warn", "error", "fatal", "silent"];
  return given !== undefined && allowed.includes(given) ? given : "info";
};

/**
 * Field names that never leave the process.
 *
 * Paths rather than patterns, which is what pino's redaction takes. The
 * wildcard forms cover a field at the top level and one nested object down,
 * which is where log fields actually live; anything deeper is an object being
 * logged wholesale, and that is its own mistake.
 *
 * `userId` is deliberately absent, and so stays. It is our own UUID, it goes
 * to our own infrastructure, and a log line that cannot say whose request it
 * was answers nothing anybody asks.
 */
export const REDACT = [
  "email",
  "*.email",
  "userEmail",
  "*.userEmail",
  "privyUserId",
  "*.privyUserId",
  "address",
  "*.address",
  "walletAddress",
  "*.walletAddress",
  "recipientAddress",
  "*.recipientAddress",
  "depositAddress",
  "*.depositAddress",
  "publicKey",
  "*.publicKey",
  "authorization",
  "*.authorization",
  "identityToken",
  "*.identityToken",
  "secretKey",
  "*.secretKey",
  "apiKey",
  "*.apiKey",
  "privateKey",
  "*.privateKey",
  "mnemonic",
  "*.mnemonic",
  "signature",
  "*.signature",
  "txSignature",
  "*.txSignature",
  "balanceUsd",
  "*.balanceUsd",
  "totalUsd",
  "*.totalUsd",
  "realisedPnlUsd",
  "*.realisedPnlUsd",
  "unrealisedPnlUsd",
  "*.unrealisedPnlUsd",
  "costBasisUsd",
  "*.costBasisUsd",
  "shares",
  "*.shares",
];

let root: Log | null = null;

/**
 * The one pino instance, built on first use.
 *
 * Lazily, because the OTel destination asks for a logger provider and the SDK
 * starts before `index.ts` is imported but not before this module is. Built
 * once, because each instance is its own set of streams.
 */
const rootLogger = (env: Env = process.env): Log => {
  if (root !== null) return root;

  root = pino(
    {
      level: levelFrom(env),
      redact: { paths: REDACT, remove: true },
      /* Our own one-line form, for the reason the old log.ts gives. */
      serializers: { err: (value: unknown) => errorLine(value) },
      /* `level` as a word rather than a number, so a line read by a person
         and a line read by a query agree on what to call it. */
      formatters: { level: (label) => ({ level: label }) },
      /* `null`, not undefined: pino types this as an object or null, and null
         is what drops `pid` and `hostname`. They say nothing useful in a
         single-container deployment and the resource attributes on the OTel
         side already carry the service name. */
      base: null,
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream([
      { level: "trace", stream: process.stdout },
      { level: "trace", stream: otelLogStream() },
    ]),
  );
  return root;
};

/**
 * A logger for one area of the service.
 *
 * The scope is what that area is called in a query — `orders`, `relay`,
 * `funding` — and it is a field on every line, so "everything the order path
 * did for this request" is one filter rather than a list of file names
 * somebody has to already know.
 */
export const logger = (scope: string, env: Env = process.env): Log => rootLogger(env).child({ scope });

/** Drop the cached instance. For tests, which must not share streams. */
export const resetLogger = (): void => {
  root = null;
};
