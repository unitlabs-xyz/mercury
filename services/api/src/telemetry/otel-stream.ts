/**
 * A pino destination that sends log records to the OpenTelemetry Logs API.
 *
 * This exists because `@opentelemetry/instrumentation-pino` does not work
 * here, and that was measured rather than assumed. The instrumentation patches
 * the `pino` module as it loads, and under ESM it never does: with and without
 * `tsx`, and with and without `@opentelemetry/instrumentation/hook.mjs`
 * registered, a pino line reached stdout correctly and the collector received
 * no `/v1/logs` at all and no `trace_id` in the record. Four combinations,
 * same result.
 *
 * So the same mechanism is implemented explicitly instead. It is not a
 * workaround of a different shape — the official instrumentation does exactly
 * this, adding a stream through `pino.multistream` and parsing the serialized
 * line (`log-sending-utils.js`). The only difference is that this stream is
 * attached by us, in code, rather than by monkey-patching a module ESM will
 * not let it patch.
 *
 * Two properties follow from sitting at the end of pino's pipeline, and both
 * matter:
 *
 * `redact` has already run. The record this stream parses is the redacted
 * one, so a wallet address or a balance removed for stdout is removed here
 * too — and this is the copy that leaves the machine, for a store with
 * different retention and different access than the database it came from.
 *
 * The level filter has already run. A `debug` line below the configured level
 * never reaches a stream, so nothing is spent serializing or shipping it.
 */
import { Writable } from "node:stream";
import { SeverityNumber, logs, type AnyValueMap, type Logger } from "@opentelemetry/api-logs";
import { context } from "@opentelemetry/api";

/**
 * pino's numeric levels onto OTel's.
 *
 * pino counts in tens from 10 (trace) to 60 (fatal); OTel's scale is finer and
 * named. Anything unrecognised becomes INFO rather than being dropped: a log
 * line with an odd level is still a log line somebody wrote on purpose.
 */
const BY_NAME: Readonly<Record<string, SeverityNumber>> = {
  trace: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
};

/**
 * pino's level onto OTel's, whichever way pino was told to write it.
 *
 * Both forms, because this service configures `formatters.level` to write the
 * word rather than pino's default number — so a reader and a query agree on
 * what to call a level. A number-only reader looked right and quietly filed
 * every record as INFO: the string fell through to the default, and five
 * records at four different levels all arrived as INFO. The numbers are kept
 * because a child logger or a library writing through this stream may not
 * have the formatter.
 *
 * pino counts in tens from 10 (trace) to 60 (fatal). Anything unrecognised
 * becomes INFO rather than being dropped — a line with an odd level is still a
 * line somebody wrote on purpose.
 */
export const severityOfPinoLevel = (level: number | string): SeverityNumber => {
  if (typeof level === "string") return BY_NAME[level.toLowerCase()] ?? SeverityNumber.INFO;
  return level >= 60
    ? SeverityNumber.FATAL
    : level >= 50
      ? SeverityNumber.ERROR
      : level >= 40
        ? SeverityNumber.WARN
        : level >= 30
          ? SeverityNumber.INFO
          : level >= 20
            ? SeverityNumber.DEBUG
            : level >= 10
              ? SeverityNumber.TRACE
              : SeverityNumber.INFO;
};

/** pino's own fields, which are the record's shape rather than its content. */
const PINO_OWN = new Set(["level", "time", "pid", "hostname", "msg"]);

/**
 * One serialized pino line as a log record.
 *
 * `null` for a line that is not JSON. pino writes one JSON object per line and
 * nothing else, so this should not happen — but a stream that throws on
 * unexpected input would take down the request that logged it, which is a far
 * worse failure than a dropped line.
 */
export interface PinoRecord {
  readonly severityNumber: SeverityNumber;
  readonly severityText: string;
  readonly body: string;
  readonly attributes: AnyValueMap;
}

export const recordFrom = (line: string): PinoRecord | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const record = parsed as Record<string, unknown>;
  const given = record["level"];
  const severityNumber = severityOfPinoLevel(
    typeof given === "number" || typeof given === "string" ? given : 30,
  );

  /*
   * Everything pino serialized that is not pino's own framing. These came out
   * of `JSON.parse`, so every value is already a JSON value and therefore a
   * valid OTel attribute value — which is what makes the assertion below safe
   * rather than hopeful.
   */
  const attributes: AnyValueMap = {};
  for (const [key, value] of Object.entries(record)) {
    if (PINO_OWN.has(key)) continue;
    attributes[key] = value as AnyValueMap[string];
  }

  return {
    severityNumber,
    severityText: SeverityNumber[severityNumber] ?? "INFO",
    body: typeof record["msg"] === "string" ? record["msg"] : line,
    attributes,
  };
};

/**
 * The stream itself.
 *
 * The active context is read here rather than taken from the line, which is
 * what gives these records their `trace_id` — the field that turns "an error
 * happened at 14:02" into "here is the request it happened in, and everything
 * else that request did". pino writes synchronously within the call that
 * logged, so the context at this point is still the caller's.
 */
export const otelLogStream = (getLogger: () => Logger = () => logs.getLogger("mercury-api")): Writable =>
  new Writable({
    write(chunk: unknown, _encoding, callback) {
      const line = String(chunk);
      try {
        const record = recordFrom(line);
        if (record !== null) {
          getLogger().emit({ ...record, context: context.active() });
        }
      } catch {
        /*
         * A collector that is unreachable, or a record the SDK refuses, costs
         * a log line and never the request that wrote it. Reporting it would
         * go back through this same stream.
         */
      }
      /* Always succeed: pino treats a stream error as fatal to the logger. */
      callback();
    },
  });
