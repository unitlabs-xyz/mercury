import { describe, expect, it } from "vitest";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { otelLogStream, recordFrom, severityOfPinoLevel } from "./otel-stream.js";

describe("severityOfPinoLevel", () => {
  it.each([
    [10, SeverityNumber.TRACE],
    [20, SeverityNumber.DEBUG],
    [30, SeverityNumber.INFO],
    [40, SeverityNumber.WARN],
    [50, SeverityNumber.ERROR],
    [60, SeverityNumber.FATAL],
  ])("maps pino's %i", (level, expected) => {
    expect(severityOfPinoLevel(level)).toBe(expected);
  });

  it.each([
    ["trace", SeverityNumber.TRACE],
    ["debug", SeverityNumber.DEBUG],
    ["info", SeverityNumber.INFO],
    ["warn", SeverityNumber.WARN],
    ["error", SeverityNumber.ERROR],
    ["fatal", SeverityNumber.FATAL],
  ])("maps the word %s, which is how this service writes it", (level, expected) => {
    /* `formatters.level` writes the word, so a person and a query agree on
       what to call a level. A number-only reader looked correct and filed
       every record as INFO — five records at four levels all arrived as INFO
       on the wire, because the string fell through to the default. */
    expect(severityOfPinoLevel(level)).toBe(expected);
  });

  it("files an unrecognised level as info rather than dropping the line", () => {
    expect(severityOfPinoLevel("verbose")).toBe(SeverityNumber.INFO);
    expect(severityOfPinoLevel(37)).toBe(SeverityNumber.INFO);
  });

  it("does not file debug as info, which would make it unfilterable", () => {
    expect(severityOfPinoLevel("debug")).not.toBe(SeverityNumber.INFO);
  });
});

describe("recordFrom", () => {
  it("reads the message as the body and the rest as attributes", () => {
    const record = recordFrom(
      JSON.stringify({ level: "info", time: "t", scope: "orders", side: "buy", msg: "order filled" }),
    );

    expect(record?.body).toBe("order filled");
    expect(record?.attributes).toEqual({ scope: "orders", side: "buy" });
  });

  it("leaves pino's own framing out of the attributes", () => {
    /* `time`, `pid` and `hostname` are the record's shape, not its content,
       and the resource attributes already say which service this is. */
    const record = recordFrom(JSON.stringify({ level: "info", time: "t", pid: 1, hostname: "h", msg: "x" }));

    expect(record?.attributes).toEqual({});
  });

  it("carries the severity through", () => {
    expect(recordFrom(JSON.stringify({ level: "error", msg: "x" }))?.severityNumber).toBe(
      SeverityNumber.ERROR,
    );
    expect(recordFrom(JSON.stringify({ level: "error", msg: "x" }))?.severityText).toBe("ERROR");
  });

  it("returns null for a line that is not JSON, rather than throwing", () => {
    /* pino writes one JSON object per line and nothing else, so this should
       not happen — and a stream that throws on unexpected input takes down
       the request that logged it, which is far worse than a dropped line. */
    expect(recordFrom("not json at all")).toBe(null);
    expect(recordFrom("")).toBe(null);
    expect(recordFrom("[1,2,3]")).not.toBe(null);
    expect(recordFrom("null")).toBe(null);
  });

  it("falls back to the whole line when there is no message", () => {
    expect(recordFrom(JSON.stringify({ level: "info", a: 1 }))?.body).toContain('"a":1');
  });

  it("defaults the level when a line carries none", () => {
    expect(recordFrom(JSON.stringify({ msg: "x" }))?.severityNumber).toBe(SeverityNumber.INFO);
  });
});

describe("otelLogStream", () => {
  const emitted: unknown[] = [];
  const stream = () =>
    otelLogStream(() => ({ emit: (r: never) => void emitted.push(r), enabled: () => true }) as never);

  it("emits one record per line written", async () => {
    emitted.length = 0;
    const s = stream();

    s.write(`${JSON.stringify({ level: "warn", msg: "stale price served" })}\n`);
    await new Promise((r) => setImmediate(r));

    expect(emitted).toHaveLength(1);
    expect((emitted[0] as { body: string }).body).toBe("stale price served");
  });

  it("swallows a line it cannot parse instead of failing the write", async () => {
    emitted.length = 0;
    const s = stream();

    expect(() => s.write("garbage\n")).not.toThrow();
    await new Promise((r) => setImmediate(r));

    expect(emitted).toHaveLength(0);
  });

  it("survives a logger that throws, because a collector must not cost a request", async () => {
    const s = otelLogStream(
      () =>
        ({
          emit: () => {
            throw new Error("collector gone");
          },
          enabled: () => true,
        }) as never,
    );

    expect(() => s.write(`${JSON.stringify({ level: "info", msg: "x" })}\n`)).not.toThrow();
  });
});
