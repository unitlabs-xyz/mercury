/**
 * The service's log lines, forwarded to the collector.
 *
 * This file exists because of something that is easy to assume and wrong:
 * configuring `logRecordProcessors` on the SDK does not make `console.log`
 * reach Loki. OpenTelemetry ships log bridges for winston, pino and bunyan —
 * and for nothing else. This service logs through `console`, deliberately
 * (`log.ts` patches it so that every call site gets one-line errors for free),
 * so without a bridge the OTLP logs pipeline is configured, connected and
 * carrying nothing at all.
 *
 * The alternatives were worse. A Promtail or Alloy sidecar reading the
 * container's stdout is a fourth deployable, which ADR 0004 explicitly argued
 * against. Moving the service to pino is a change across every call site in
 * the API and the packages it runs, to gain a bridge we can write in forty
 * lines. So: forward the console.
 *
 * It is a forward and never a replacement. The console still writes exactly
 * what it wrote before, because `docker logs` is how anybody actually reads
 * this service and a deployment whose collector is down must not also lose its
 * stdout.
 *
 * Trace correlation comes free on this path. The SDK's log record processor
 * reads the active context when a record is emitted, so a line written inside
 * a request carries that request's `trace_id` without this file doing
 * anything — and that field is the one that turns "an error happened at 14:02"
 * into "here is the request it happened in".
 */
import { SeverityNumber, logs, type Logger } from "@opentelemetry/api-logs";
import { errorLine } from "../log.js";

type Env = Readonly<Record<string, string | undefined>>;

const LEVELS = ["error", "warn", "log", "info"] as const;
type Level = (typeof LEVELS)[number];

/**
 * The console's four levels, onto the numbers a log store sorts and filters by.
 *
 * `log` and `info` are both INFO: the console distinguishes them and nothing
 * downstream does, so pretending otherwise would only mean two names for one
 * severity in every query somebody writes.
 */
export const severityOf = (level: Level): SeverityNumber =>
  level === "error" ? SeverityNumber.ERROR : level === "warn" ? SeverityNumber.WARN : SeverityNumber.INFO;

/**
 * The arguments of one console call as the line a person would have read.
 *
 * An `Error` becomes its one line, for the reason `log.ts` gives: a stack is a
 * screenful of `node_modules` frames around the one sentence that says what
 * went wrong, and every call site here already says where it is.
 */
export const lineOf = (args: readonly unknown[]): string =>
  args
    .map((value) => {
      if (value instanceof Error) return errorLine(value);
      if (typeof value === "string") return value;
      try {
        return JSON.stringify(value) ?? String(value);
      } catch {
        /* A cycle, or a BigInt, both of which JSON.stringify throws on. A log
           line that throws takes the request with it. */
        return String(value);
      }
    })
    .join(" ");

/** Patched once per console, however many times this is called. */
const patched = new WeakSet<Console>();

export const forwardConsoleToOtel = (
  target: Console = console,
  env: Env = process.env,
  getLogger: () => Logger = () => logs.getLogger("mercury-api"),
): void => {
  const endpoint = env["OTEL_EXPORTER_OTLP_ENDPOINT"]?.trim();
  if (endpoint === undefined || endpoint.length === 0) return;
  /* `--import` runs the bootstrap once, but a second call — from a test, or
     from a future entry point — would wrap the console again and emit every
     line twice. */
  if (patched.has(target)) return;
  patched.add(target);

  for (const level of LEVELS) {
    const write = target[level].bind(target);
    const severity = severityOf(level);
    target[level] = (...args: unknown[]) => {
      write(...args);
      try {
        getLogger().emit({ severityNumber: severity, severityText: level, body: lineOf(args) });
      } catch {
        /* The collector being unreachable costs a log record, never the
           request that was being served. Nothing is reported about it,
           because reporting it would go through this same console. */
      }
    };
  }
};
