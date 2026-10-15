import { describe, expect, it, vi } from "vitest";
import type { Tracer } from "@opentelemetry/api";
import { operationOf, withQuerySpans, type UnsafeClient } from "./query-span.js";

const recordingTracer = () => {
  const spans: {
    name: string;
    attributes: Record<string, unknown>;
    status: { code?: number; message?: string } | null;
    ended: boolean;
  }[] = [];

  const tracer = {
    startSpan: (name: string) => {
      const record = {
        name,
        attributes: {} as Record<string, unknown>,
        status: null as { code?: number; message?: string } | null,
        ended: false,
      };
      spans.push(record);
      return {
        setAttribute: (k: string, v: unknown) => {
          record.attributes[k] = v;
        },
        setStatus: (s: { code?: number; message?: string }) => {
          record.status = s;
        },
        end: () => {
          record.ended = true;
        },
      };
    },
  } as unknown as Tracer;

  return { spans, tracer };
};

describe("operationOf", () => {
  it.each([
    ['select "id" from "order" where "user_id" = $1', "db select order"],
    ['insert into "lot" ("user_id") values ($1)', "db insert lot"],
    ['update "user" set "email" = $1', "db update user"],
    ['delete from "price_bar" where "bucket_start" < $1', "db delete price_bar"],
    ["begin", "db begin"],
    ["commit", "db commit"],
  ])("names %s as %s", (sql, expected) => {
    expect(operationOf(sql)).toBe(expected);
  });

  it("names a join by its first table rather than all of them", () => {
    expect(operationOf('select * from "order" join "token" on $1')).toBe("db select order");
  });

  it("falls back for something it cannot parse", () => {
    /* Never the statement text as the span name: that is one name per
       distinct query, which is cardinality in Tempo and a flame graph nobody
       can read. */
    expect(operationOf("VACUUM ANALYZE")).toBe("db query");
    expect(operationOf("")).toBe("db query");
  });
});

describe("withQuerySpans", () => {
  const clientWith = (unsafe: UnsafeClient["unsafe"]) =>
    ({ unsafe, other: "untouched" }) as unknown as UnsafeClient & { other: string };

  it("opens a span per query and ends it when the query settles", async () => {
    /* Without this a slow request is one flat span with nothing inside, and
       "which query" is the question anybody actually has. */
    const { spans, tracer } = recordingTracer();
    const db = withQuerySpans(
      clientWith(async () => [{ n: 1 }]),
      tracer,
    );

    await db.unsafe("select 1");

    expect(spans).toHaveLength(1);
    expect(spans[0]?.ended).toBe(true);
  });

  it("does not end the span before the query settles", async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => (release = resolve));
    const { spans, tracer } = recordingTracer();
    const db = withQuerySpans(
      clientWith(() => pending),
      tracer,
    );

    const inFlight = db.unsafe("select 1");
    expect(spans[0]?.ended).toBe(false);

    release?.();
    await inFlight;
    await vi.waitFor(() => expect(spans[0]?.ended).toBe(true));
  });

  it("names the span for the operation and keeps the statement as an attribute", async () => {
    const { spans, tracer } = recordingTracer();
    const db = withQuerySpans(
      clientWith(async () => []),
      tracer,
    );

    await db.unsafe('select "id" from "order" where "user_id" = $1', ["u1"]);

    expect(spans[0]?.name).toBe("db select order");
    expect(spans[0]?.attributes["db.statement"]).toContain('from "order"');
    expect(spans[0]?.attributes["db.system"]).toBe("postgresql");
  });

  it("carries no parameter values", async () => {
    /* The parameters are an address, an email, an amount — the user's. The
       statement shape is what helps; the values are what leaks. */
    const { spans, tracer } = recordingTracer();
    const db = withQuerySpans(
      clientWith(async () => []),
      tracer,
    );

    await db.unsafe("select 1 where email = $1", ["someone@example.com"]);

    expect(JSON.stringify(spans[0]?.attributes)).not.toContain("example.com");
  });

  it("clips a statement too long to be worth storing whole", async () => {
    const { spans, tracer } = recordingTracer();
    const db = withQuerySpans(
      clientWith(async () => []),
      tracer,
    );

    await db.unsafe(`select ${"x".repeat(500)} from "order"`);

    expect(String(spans[0]?.attributes["db.statement"]).length).toBe(300);
    expect(String(spans[0]?.attributes["db.statement"]).endsWith("…")).toBe(true);
  });

  it("marks the span failed and ends it when the query rejects", async () => {
    const { spans, tracer } = recordingTracer();
    const db = withQuerySpans(
      clientWith(async () => {
        throw new Error("deadlock detected");
      }),
      tracer,
    );

    await expect(db.unsafe("select 1")).rejects.toThrow("deadlock");
    await vi.waitFor(() => expect(spans[0]?.ended).toBe(true));
    expect(spans[0]?.status?.message).toContain("deadlock");
  });

  it("ends the span when the call throws synchronously", async () => {
    const { spans, tracer } = recordingTracer();
    const db = withQuerySpans(
      clientWith(() => {
        throw new Error("bad call");
      }),
      tracer,
    );

    expect(() => db.unsafe("select 1")).toThrow("bad call");
    expect(spans[0]?.ended).toBe(true);
  });

  it("passes the query and its parameters through unchanged", async () => {
    /* Every read in the service goes through here. A wrapper that dropped an
       argument would break them all. */
    const unsafe = vi.fn(async () => [{ n: 1 }]);
    const { tracer } = recordingTracer();
    const db = withQuerySpans(clientWith(unsafe), tracer);

    await db.unsafe("select $1", ["a"], { prepare: false });

    expect(unsafe).toHaveBeenCalledWith("select $1", ["a"], { prepare: false });
  });

  it("returns what the driver returned, so .values() and friends still work", async () => {
    /* Drizzle calls `client.unsafe(q, p).values()` on one of its two paths.
       A wrapper that returned a plain promise would break it. */
    const query = Object.assign(Promise.resolve([{ n: 1 }]), { values: () => Promise.resolve([[1]]) });
    const { tracer } = recordingTracer();
    const db = withQuerySpans(
      clientWith(() => query),
      tracer,
    );

    const answer = db.unsafe("select 1") as typeof query;

    expect(answer).toBe(query);
    expect(await answer.values()).toEqual([[1]]);
  });

  it("leaves everything other than unsafe alone", async () => {
    /* `begin`, `end`, `listen` and the tagged-template call all have to keep
       working — only the execution path is wrapped. */
    const { tracer } = recordingTracer();
    const db = withQuerySpans(
      clientWith(async () => []),
      tracer,
    );

    expect(db.other).toBe("untouched");
  });

  it("times a query that is not a thenable without hanging", async () => {
    const { spans, tracer } = recordingTracer();
    const db = withQuerySpans(
      clientWith(() => 42 as unknown as Promise<unknown>),
      tracer,
    );

    expect(db.unsafe("select 1")).toBe(42);
    expect(spans[0]?.ended).toBe(true);
  });
});
