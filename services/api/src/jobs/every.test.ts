import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { Tracer } from "@opentelemetry/api";
import { pino } from "pino";
import { every, type EveryDeps } from "./every.js";
import { noteStrain } from "./strain.js";

/**
 * A clock and a scheduler the test drives, so nothing here waits on a real
 * tick. `setTimeout` returns a handle whose `unref` is a no-op, which is the
 * one method the helper calls on it.
 */
const harness = () => {
  const pending: (() => void)[] = [];
  /** How long each pass was scheduled after the one before, in order. */
  const delays: number[] = [];
  const lines: string[] = [];
  let clock = 0;

  const deps: EveryDeps = {
    now: () => clock,
    setTimeout: ((fn: () => void, ms: number) => {
      pending.push(fn);
      delays.push(ms);
      return { unref: () => undefined } as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout,
    /* A real pino writing to an array, rather than a hand-made double: the
       assertions are about the fields it emits, and a double would only
       assert our own belief about pino back to us. */
    log: pino(
      { level: "debug", base: null, formatters: { level: (label) => ({ level: label }) } },
      { write: (line: string) => void lines.push(line) },
    ),
  };

  return {
    lines,
    delays,
    deps,
    advance: (ms: number) => {
      clock += ms;
    },
    /** Fire the next scheduled pass. */
    tick: async () => {
      const next = pending.shift();
      next?.();
      await Promise.resolve();
    },
    pendingCount: () => pending.length,
    now: () => clock,
  };
};

/** A tracer that records what it was asked to do. */
const recordingTracer = () => {
  const spans: {
    name: string;
    ended: boolean;
    attributes: Record<string, unknown>;
    exceptions: unknown[];
    status: unknown;
  }[] = [];

  const tracer = {
    startActiveSpan: <T>(name: string, fn: (span: unknown) => T): T => {
      const record = {
        name,
        ended: false,
        attributes: {} as Record<string, unknown>,
        exceptions: [] as unknown[],
        status: undefined as unknown,
      };
      spans.push(record);
      return fn({
        setAttribute: (k: string, v: unknown) => {
          record.attributes[k] = v;
        },
        setAttributes: (a: Record<string, unknown>) => Object.assign(record.attributes, a),
        recordException: (e: unknown) => record.exceptions.push(e),
        setStatus: (s: unknown) => {
          record.status = s;
        },
        end: () => {
          record.ended = true;
        },
      });
    },
  } as unknown as Tracer;

  return { spans, tracer };
};

describe("every", () => {
  it("runs the job immediately rather than waiting out the first interval", async () => {
    /* index.ts depends on this: a deploy takes the current hour's
       portfolio-snapshot at once instead of up to an hour later, and that
       job's output is the only thing here that cannot be backfilled. */
    const h = harness();
    const run = vi.fn(async () => null);

    every("job", 1000, run, h.deps);

    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });

  it("says nothing when the job had nothing to say", async () => {
    /* position-sync runs every two seconds. A line per pass would bury the
       passes that matter, which is why the helper takes `string | null`. */
    const h = harness();

    every("quiet", 1000, async () => null, h.deps);

    await vi.waitFor(() => expect(h.pendingCount()).toBe(1));
    expect(h.lines).toEqual([]);
  });

  it("logs the note the job returned, prefixed with its name", async () => {
    const h = harness();

    every("stocks", 1000, async () => "41 instruments, 118 tokens", h.deps);

    await vi.waitFor(() => expect(h.lines).toHaveLength(1));
    /* The note is the message and the job is a field, so one job's history is
       a filter rather than a grep for a prefix. */
    expect(JSON.parse(h.lines[0]!)).toMatchObject({
      level: "info",
      job: "stocks",
      msg: "41 instruments, 118 tokens",
    });
  });

  it("keeps the schedule after a failure, because an upstream being down is not a reason to stop", async () => {
    const h = harness();
    const run = vi.fn(async () => {
      throw new Error("jupiter 429");
    });

    every("prices", 1000, run, h.deps);

    await vi.waitFor(() =>
      expect(h.lines.some((l) => l.includes('"job":"prices"') && l.includes("job failed"))).toBe(true),
    );
    await h.tick();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });

  it("schedules the next pass only after the last one finishes", async () => {
    /* The reason the next run is scheduled at the end rather than on a fixed
       tick: a pass that overruns its interval must not have a second one start
       behind it and write the same rows twice. */
    const h = harness();
    let inFlight = 0;
    let overlapped = false;

    every(
      "slow",
      1,
      async () => {
        inFlight += 1;
        if (inFlight > 1) overlapped = true;
        await Promise.resolve();
        inFlight -= 1;
        return null;
      },
      h.deps,
    );

    for (let i = 0; i < 5; i += 1) await h.tick();

    expect(overlapped).toBe(false);
  });

  it("labels its metrics mercury_job, because Prometheus owns `job`", () => {
    /* A regression test for a label collision that only shows against a real
       Prometheus: the OTLP bridge writes `job` as the scrape target's name, so
       an attribute by that name is overwritten and every job collapses into
       one series. Asserted on the source, because asserting it through a meter
       would need the collector this suite deliberately does without. */
    const source = readFileSync(fileURLToPath(new URL("./every.ts", import.meta.url)), "utf8");

    expect(source).toContain("mercury_job: name");
    expect(source).not.toMatch(/\.(add|record)\([^)]*\{\s*job:/);
  });

  it("records a span per pass, named for the job", async () => {
    const h = harness();
    const { spans, tracer } = recordingTracer();

    every("stocks", 1000, async () => "done", { ...h.deps, tracer });

    await vi.waitFor(() => expect(spans).toHaveLength(1));
    expect(spans[0]?.name).toBe("job stocks");
    expect(spans[0]?.attributes["mercury.job"]).toBe("stocks");
    await vi.waitFor(() => expect(spans[0]?.ended).toBe(true));
  });

  it("marks a quiet pass as quiet, so an idle job is distinguishable from a stuck one", async () => {
    const h = harness();
    const { spans, tracer } = recordingTracer();

    every("quiet", 1000, async () => null, { ...h.deps, tracer });

    await vi.waitFor(() => expect(spans[0]?.attributes["mercury.job.quiet"]).toBe(true));
  });

  it("ends the span even when the job throws", async () => {
    /* A span left open is a trace that never arrives, so a failing job would
       be invisible in exactly the case somebody is looking for it. */
    const h = harness();
    const { spans, tracer } = recordingTracer();

    every(
      "boom",
      1000,
      async () => {
        throw new Error("nope");
      },
      { ...h.deps, tracer },
    );

    await vi.waitFor(() => expect(spans[0]?.ended).toBe(true));
  });

  it("puts the failure on the span as well as in the log", async () => {
    const h = harness();
    const { spans, tracer } = recordingTracer();

    every(
      "boom",
      1000,
      async () => {
        throw new Error("deadlock detected");
      },
      { ...h.deps, tracer },
    );

    await vi.waitFor(() => expect(spans[0]?.exceptions).toHaveLength(1));
    expect(String(spans[0]?.exceptions[0])).toContain("deadlock detected");
    expect(spans[0]?.status).toMatchObject({ message: expect.stringContaining("deadlock") });
  });

  it("names the job and the failure as fields", async () => {
    /* The job's name is a field and the failure is `err`, which pino's
       serializer reduces to one line. The harness has no serializer
       configured, so it sees pino's own default for an Error — what is
       asserted here is that the job and the message arrive, which is what
       anybody queries on. */
    const h = harness();

    every(
      "position-sync",
      1000,
      async () => {
        throw new Error("rpc timeout");
      },
      h.deps,
    );

    await vi.waitFor(() => expect(h.lines).toHaveLength(1));
    expect(JSON.parse(h.lines[0]!)).toMatchObject({
      level: "error",
      job: "position-sync",
      msg: "job failed",
    });
    expect(h.lines[0]).toContain("rpc timeout");
  });

  it("reports a duration taken from the clock it was given", async () => {
    const h = harness();
    const { spans, tracer } = recordingTracer();

    every(
      "timed",
      1000,
      async () => {
        h.advance(1500);
        return null;
      },
      { ...h.deps, tracer },
    );

    await vi.waitFor(() => expect(spans[0]?.ended).toBe(true));
    expect(spans[0]?.attributes["mercury.job.duration_ms"]).toBe(1500);
  });
});

describe("every, when the node is refusing", () => {
  /* After a deploy every job read every wallet in the same second, and the node refused all of it. */
  it("waits `startAfterMs` before its first pass", async () => {
    const h = harness();
    const run = vi.fn(async () => null);
    every("job", 1000, run, { ...h.deps, startAfterMs: 5000 });
    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();
    expect(h.delays).toEqual([5000]);
    await h.tick();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });

  it("backs off while the endpoints it reads are strained, and comes back once a pass is clean", async () => {
    const h = harness();
    h.advance(1);
    const strained = [true, true, false];
    const run = vi.fn(async () => {
      if (strained.shift()) noteStrain();
      return null;
    });
    every("job", 1000, run, h.deps);
    await vi.waitFor(() => expect(h.delays).toHaveLength(1));
    h.advance(2000);
    await h.tick();
    await vi.waitFor(() => expect(h.delays).toHaveLength(2));
    h.advance(4000);
    await h.tick();
    await vi.waitFor(() => expect(h.delays).toHaveLength(3));
    expect(h.delays).toEqual([2000, 4000, 1000]);
  });

  it("backs off to two minutes at most, and never below its own interval", async () => {
    const h = harness();
    h.advance(1);
    const strain = async () => {
      noteStrain();
      return null;
    };
    every("often", 60_000, strain, h.deps);
    await vi.waitFor(() => expect(h.delays).toHaveLength(1));
    await h.tick();
    await vi.waitFor(() => expect(h.delays).toHaveLength(2));
    expect(h.delays).toEqual([120_000, 120_000]);

    const hourly = harness();
    hourly.advance(1);
    every("hourly", 3_600_000, strain, hourly.deps);
    await vi.waitFor(() => expect(hourly.delays).toHaveLength(1));
    expect(hourly.delays).toEqual([3_600_000]);
  });

  /*
   * Measured 23 October 2026: the jobs shared one strain signal, so a
   * snapshot that read seventeen accounts of seventeen logged a refusal, and
   * wallet-events waited two minutes a pass for a night on other jobs' calls.
   */
  it("backs off on its own pass's refusals only, not another job's", async () => {
    const h = harness();
    h.advance(1);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    // `quiet` is in flight while `loud` is refused.
    every("quiet", 1000, async () => (await held, null), h.deps);
    every("loud", 1000, async () => (noteStrain(), release(), null), h.deps);
    await vi.waitFor(() => expect(h.delays).toHaveLength(2));
    expect([...h.delays].sort((a, b) => a - b)).toEqual([1000, 2000]);
    // And a refusal outside any pass, a route's, marks nothing.
    expect(() => noteStrain()).not.toThrow();
  });
});
