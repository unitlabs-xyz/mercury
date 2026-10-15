/**
 * OpenTelemetry, started before the app it watches.
 *
 * Loaded with `node --import ./src/telemetry/otel.ts`, which is the whole
 * reason this is a separate file from `index.ts`: auto-instrumentation works
 * by patching modules as they load, so anything imported before the SDK
 * starts is something the SDK never sees. The failure mode is silence — no
 * error, no spans, nothing saying the flag was dropped — which is why
 * `dockerfile.test.ts` asserts on the order of the arguments.
 *
 * Off unless configured, like every other optional capability in this service
 * (`relay`, `fund`, `notifier`, the Pyth feed). An unset endpoint means the
 * SDK never starts: no exporter retrying against a host that is not there, no
 * overhead, and one line at boot saying so. Tests run this way, and so does a
 * deployment nobody has given a collector.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { defaultResource, resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from "@opentelemetry/semantic-conventions";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Where telemetry goes, or nothing at all.
 *
 * The standard OTel variable rather than a name of ours, so every exporter in
 * the SDK reads the same value without being told it, and anyone who has set
 * up a collector before already knows what to set.
 *
 * Trimmed and length-checked because an unset variable and an emptied one are
 * the same intention: Coolify writes an empty string for a value somebody
 * cleared rather than removing the key, and `.env.example` ships it empty.
 */
export const telemetryEndpoint = (env: Env = process.env): string | null => {
  const value = env["OTEL_EXPORTER_OTLP_ENDPOINT"]?.trim();
  return value === undefined || value.length === 0 ? null : value;
};

/**
 * Metrics are pushed every thirty seconds.
 *
 * Nothing recorded here moves faster than the jobs worth watching, and a
 * shorter period is more writes for a graph nobody reads between them. The
 * fastest job runs every two seconds, so this still catches roughly fifteen
 * of its passes in a sample.
 */
const METRIC_PERIOD_MS = 30_000;

let started: NodeSDK | null = null;

/**
 * Start the SDK, or decline to.
 *
 * Returns whether it started, so the caller can say which happened rather than
 * inferring it. Idempotent: `--import` runs this once, and a second call from
 * a test would otherwise register a second set of instrumentations over the
 * same modules.
 */
export const startTelemetry = (env: Env = process.env): boolean => {
  if (started !== null) return true;
  if (telemetryEndpoint(env) === null) return false;

  started = new NodeSDK({
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: env["OTEL_SERVICE_NAME"] ?? "mercury-api",
        /* The commit, when the deploy passes one. Without it every version of
           the service reports as the same one, and "did this start at the last
           deploy" has no answer. */
        [ATTR_SERVICE_VERSION]: env["GIT_SHA"] ?? "dev",
        [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: env["NODE_ENV"] ?? "development",
      }),
    ),
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: METRIC_PERIOD_MS,
      }),
    ],
    /* An options object, not the exporter: `BatchLogRecordProcessor` takes
       `{ exporter }` as of sdk-logs 0.223, unlike its span counterpart. */
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    instrumentations: [
      getNodeAutoInstrumentations({
        /* Off deliberately. It spans every file read, and this service runs
           TypeScript through tsx — thousands of reads per cold start, none of
           which tells anybody anything. */
        "@opentelemetry/instrumentation-fs": { enabled: false },
        /*
         * Off because it does not work here, and because if it ever starts
         * working it would send every log line twice.
         *
         * It patches the `pino` module as it loads, and under ESM it never
         * does: measured with and without `tsx`, and with and without
         * `@opentelemetry/instrumentation/hook.mjs` registered, pino wrote to
         * stdout correctly and the collector received no `/v1/logs` and no
         * `trace_id` — four combinations, same result. `log/index.ts` attaches
         * the same kind of destination stream explicitly instead, which is
         * what this instrumentation would have done, so leaving it enabled
         * buys a duplicate rather than a fallback.
         */
        "@opentelemetry/instrumentation-pino": { enabled: false },
      }),
    ],
  });

  started.start();

  /*
   * Flush on the way out.
   *
   * The container runs under tini, which forwards SIGTERM, and a batch
   * processor that has not flushed loses the spans from whatever was being
   * served when the deploy rolled — which is exactly the window somebody would
   * be looking at. `once`, because a second signal during shutdown should kill
   * the process rather than start a second shutdown.
   */
  const stop = () => {
    void started?.shutdown().catch(() => undefined);
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  return true;
};

/* Started on import, because `--import` is how this module is loaded. */
startTelemetry();
