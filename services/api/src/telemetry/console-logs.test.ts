import { describe, expect, it } from "vitest";
import { SeverityNumber } from "@opentelemetry/api-logs";
import { forwardConsoleToOtel, severityOf, lineOf } from "./console-logs.js";

const capture = () => {
  const written: string[] = [];
  const target = {
    log: (...a: unknown[]) => written.push(`log ${a.join(" ")}`),
    info: (...a: unknown[]) => written.push(`info ${a.join(" ")}`),
    warn: (...a: unknown[]) => written.push(`warn ${a.join(" ")}`),
    error: (...a: unknown[]) => written.push(`error ${a.join(" ")}`),
  } as unknown as Console;
  return { target, written };
};

const recorder = () => {
  const records: { severityNumber?: SeverityNumber; body?: unknown }[] = [];
  return { records, logger: { emit: (r: never) => void records.push(r), enabled: () => true } };
};

describe("forwardConsoleToOtel", () => {
  it("does nothing unless telemetry is configured", () => {
    /* Nothing to forward to, and patching the console for no reason is a cost
       paid by every line the service writes. */
    const { target, written } = capture();
    const { records, logger } = recorder();

    forwardConsoleToOtel(target, {}, () => logger as never);
    target.log("migrations: up to date");

    expect(records).toEqual([]);
    expect(written).toEqual(["log migrations: up to date"]);
  });

  it("still writes to the console, because docker logs is how anybody reads this", () => {
    /* The forward is additional, never a replacement. A deployment whose
       collector is down must not also lose its stdout. */
    const { target, written } = capture();
    const { logger } = recorder();

    forwardConsoleToOtel(target, { OTEL_EXPORTER_OTLP_ENDPOINT: "x" }, () => logger as never);
    target.log("prices: 41/41 mints warm");

    expect(written).toEqual(["log prices: 41/41 mints warm"]);
  });

  it("emits one log record per console call", () => {
    const { target } = capture();
    const { records, logger } = recorder();

    forwardConsoleToOtel(target, { OTEL_EXPORTER_OTLP_ENDPOINT: "x" }, () => logger as never);
    target.log("one");
    target.error("two");

    expect(records).toHaveLength(2);
    expect(records[0]?.body).toBe("one");
  });

  it("reduces an Error to its one line rather than a stack", () => {
    /* The reasoning in log.ts holds here too: a stack is a screenful of
       node_modules frames around the one sentence that says what broke. */
    const { target } = capture();
    const { records, logger } = recorder();

    forwardConsoleToOtel(target, { OTEL_EXPORTER_OTLP_ENDPOINT: "x" }, () => logger as never);
    target.error("position-sync failed:", new TypeError("nope"));

    expect(records[0]?.body).toBe("position-sync failed: TypeError: nope");
    expect(String(records[0]?.body)).not.toContain("at ");
  });

  it("patches each level exactly once, however many times it is called", () => {
    /* `--import` runs the bootstrap once, but a test or a second call would
       otherwise wrap the console again and emit every line twice. */
    const { target, written } = capture();
    const { records, logger } = recorder();

    forwardConsoleToOtel(target, { OTEL_EXPORTER_OTLP_ENDPOINT: "x" }, () => logger as never);
    forwardConsoleToOtel(target, { OTEL_EXPORTER_OTLP_ENDPOINT: "x" }, () => logger as never);
    target.log("once");

    expect(records).toHaveLength(1);
    expect(written).toHaveLength(1);
  });

  it("never lets a failing logger take the process with it", () => {
    /* A log line that throws inside the logger kills whatever was being
       served. The collector being unreachable must cost a log record, not a
       request. */
    const { target, written } = capture();
    const exploding = {
      emit: () => {
        throw new Error("collector gone");
      },
      enabled: () => true,
    };

    forwardConsoleToOtel(target, { OTEL_EXPORTER_OTLP_ENDPOINT: "x" }, () => exploding as never);

    expect(() => target.log("still fine")).not.toThrow();
    expect(written).toEqual(["log still fine"]);
  });
});

describe("severityOf", () => {
  it("maps the console's levels onto the ones a log store understands", () => {
    expect(severityOf("error")).toBe(SeverityNumber.ERROR);
    expect(severityOf("warn")).toBe(SeverityNumber.WARN);
    expect(severityOf("log")).toBe(SeverityNumber.INFO);
    expect(severityOf("info")).toBe(SeverityNumber.INFO);
  });

  it("treats log and info alike, because the difference means nothing downstream", () => {
    expect(severityOf("log")).toBe(severityOf("info"));
  });
});

describe("lineOf", () => {
  it("joins the arguments the way the console would", () => {
    expect(lineOf(["stocks:", "41 instruments"])).toBe("stocks: 41 instruments");
  });

  it("serialises an object rather than printing [object Object]", () => {
    expect(lineOf([{ mints: 41 }])).toBe('{"mints":41}');
  });

  it("survives a value that will not serialise", () => {
    const looped: Record<string, unknown> = {};
    looped["self"] = looped;

    expect(() => lineOf([looped])).not.toThrow();
  });

  it("survives a BigInt, which JSON.stringify throws on", () => {
    expect(() => lineOf([{ n: 1n }])).not.toThrow();
  });
});
