/**
 * The instruments this service records, created once and cached.
 *
 * Lazily, because a meter asked for before the SDK has started is a no-op
 * meter and stays one for the life of the process. `index.ts` imports this
 * module at the top of the file, which on a cold start is before the
 * bootstrap has finished, so the instruments have to be built on first use
 * rather than at import.
 *
 * No instrument here takes an id as a label, and none ever should. A
 * `user_id` label is one time series per account, growing with every signup,
 * and Prometheus falls over long before that graph tells anybody anything.
 * Ids belong on spans, where Tempo indexes them and nothing multiplies — see
 * `attributes.ts`, which allows `user_id` for exactly that reason and is not
 * used here.
 */
import { metrics, type Counter, type Histogram } from "@opentelemetry/api";

export interface JobMetrics {
  /** Passes, by job and outcome. The error rate is derived from this. */
  readonly runs: Counter;
  /** How long a pass took, in seconds, by job. */
  readonly duration: Histogram;
}

let cached: JobMetrics | null = null;

export const jobMetrics = (): JobMetrics => {
  if (cached !== null) return cached;
  const meter = metrics.getMeter("mercury-api");
  cached = {
    runs: meter.createCounter("mercury_job_runs_total", {
      /* Labelled `mercury_job`, never `job` — see jobs/every.ts. Prometheus
         owns `job` and overwrites it with the scrape target's name. */
      description: "Background job passes, by mercury_job and outcome.",
    }),
    duration: meter.createHistogram("mercury_job_duration_seconds", {
      description: "How long a background job pass took, by mercury_job.",
      unit: "s",
    }),
  };
  return cached;
};

/**
 * Drop the cached instruments.
 *
 * For tests, which would otherwise share one set — built against whichever
 * meter happened to be registered when the first test file ran — across every
 * file in the suite.
 */
export const resetJobMetrics = (): void => {
  cached = null;
};
