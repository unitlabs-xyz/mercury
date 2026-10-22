/**
 * A background job, on its own clock, leaving a record of what it did.
 *
 * Moved out of `index.ts` and given its own tests, because this helper is the
 * background half of the system and the background half is the whole of it:
 * eight jobs go through here, and they are the only things that write a stock
 * row, a lot, a position, a snapshot or an activity. No request does.
 *
 * The scheduling behaviour is unchanged and every part of it is load-bearing.
 * The next run is scheduled after the last one finishes, never on a fixed
 * tick: a pass that overruns its interval must not have a second one start
 * behind it and write the same rows twice. A failure is logged and the
 * schedule continues — an upstream being down is a reason to try again later,
 * not to stop trying. And the first pass runs immediately, or after
 * `startAfterMs`, which is what lets a deploy take the current hour's
 * portfolio snapshot rather than waiting up to an hour for it.
 *
 * What is new is that a pass is now measured. Before this, a failing
 * `position-sync` — every two seconds, the only writer of a position — was one
 * `console.error` line and nothing anybody could graph, and a pass that merely
 * got slower was nothing at all. The log output is byte-for-byte what it was,
 * so nothing anybody greps for has changed; the span and the metrics are
 * additional.
 *
 * The metric label is `mercury_job` and not `job`, which matters and is not a
 * style choice. `job` is Prometheus's own target label: the OTLP bridge writes
 * it as the scrape job name, so a metric attribute called `job` is silently
 * overwritten. Measured against a real Prometheus, every one of the eight jobs
 * collapsed into `job="mercury-api"` and `mercury_job_runs_total` had two
 * series — one per outcome — with no job names in it at all. The span
 * attribute is still `mercury.job`; spans have no such collision.
 *
 * Everything is injectable because none of it should need a real clock, a real
 * scheduler or a real collector to test. With telemetry off, `getTracer`
 * returns the API's no-op tracer and the only cost is one function call per
 * pass.
 */
import { SpanStatusCode, trace, type Tracer } from "@opentelemetry/api";
/* pino's `err` serializer uses this too; the span needs it directly, because a
   span attribute takes a string and not a serializer. */
import { errorLine } from "../log.js";
import { logger, type Log } from "../log/index.js";
import { jobMetrics } from "../telemetry/metrics.js";

export interface EveryDeps {
  readonly now?: () => number;
  readonly setTimeout?: typeof setTimeout;
  readonly log?: Log;
  readonly tracer?: Tracer;
  /**
   * When the first pass runs. Immediately when left out. Jobs started together
   * are given different offsets, so a deploy does not have every one of them
   * read every wallet in the same second.
   */
  readonly startAfterMs?: number;
  /**
   * When the endpoints this job reads last refused a request outright, on the
   * same clock as `now` (see `Rotation.strainedAt`). A pass that saw it waits
   * twice as long before the next, up to two minutes, and a clean pass goes
   * back to the job's own interval.
   */
  readonly strainedAt?: () => number;
}

/** The longest a strained job waits between passes, unless its own interval is longer. */
const BACKOFF_CAP_MS = 120_000;

/**
 * What a job reports: a line worth logging, or nothing.
 *
 * `null` is the common case for the fast jobs and means "this pass changed
 * nothing worth a line".
 */
export type JobRun = () => Promise<string | null>;

export const every = (name: string, ms: number, run: JobRun, deps: EveryDeps = {}): void => {
  const now = deps.now ?? (() => Date.now());
  const schedule = deps.setTimeout ?? setTimeout;
  const log = deps.log ?? logger("jobs");
  const tracer = deps.tracer ?? trace.getTracer("mercury-api");
  /** Strained passes in a row. */
  let streak = 0;

  const tick = async (): Promise<void> => {
    let wait = ms;
    await tracer.startActiveSpan(`job ${name}`, async (span) => {
      const started = now();
      span.setAttribute("mercury.job", name);
      try {
        const note = await run();
        /* So an idle job and a stuck one are different shapes in a trace list,
           rather than both being "a pass that said nothing". */
        span.setAttribute("mercury.job.quiet", note === null);
        /* The job's name as a field, so one job's history is a filter rather
           than a grep for a prefix. */
        if (note !== null) log.info({ job: name, ms: now() - started }, note);
        jobMetrics().runs.add(1, { mercury_job: name, outcome: "ok" });
      } catch (error: unknown) {
        log.error({ job: name, err: error, ms: now() - started }, "job failed");
        span.recordException(errorLine(error));
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorLine(error) });
        jobMetrics().runs.add(1, { mercury_job: name, outcome: "failed" });
      } finally {
        /*
         * In `finally`, because a span left open is a trace that never
         * arrives — which would make a failing job invisible in exactly the
         * case somebody went looking for it.
         */
        const elapsed = now() - started;
        span.setAttribute("mercury.job.duration_ms", elapsed);
        jobMetrics().duration.record(elapsed / 1000, { mercury_job: name });

        const strainedAt = deps.strainedAt?.() ?? 0;
        if (strainedAt > 0 && strainedAt >= started) {
          streak += 1;
          wait = Math.min(ms * 2 ** streak, Math.max(ms, BACKOFF_CAP_MS));
          span.setAttribute("mercury.job.backoff_ms", wait);
          log.warn({ job: name, waitMs: wait }, "the node refused this pass; waiting longer before the next");
        } else {
          streak = 0;
        }
        span.end();
      }
    });

    schedule(() => void tick(), wait).unref();
  };

  if (deps.startAfterMs !== undefined && deps.startAfterMs > 0) {
    schedule(() => void tick(), deps.startAfterMs).unref();
  } else {
    void tick();
  }
};
