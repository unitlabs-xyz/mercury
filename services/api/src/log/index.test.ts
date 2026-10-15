import { afterEach, describe, expect, it } from "vitest";
import { pino } from "pino";
import { REDACT, levelFrom, resetLogger } from "./index.js";
import { errorLine } from "../log.js";

afterEach(() => resetLogger());

describe("levelFrom", () => {
  it("is info when nothing says otherwise", () => {
    /* Debug off by default is the point of having it: debug is where the
       decision inputs go, worth recording while somebody reproduces one
       person's problem and not the rest of the time, when it would be most of
       the volume and all of the cost. */
    expect(levelFrom({})).toBe("info");
  });

  it.each(["trace", "debug", "info", "warn", "error", "fatal", "silent"])("reads %s", (level) => {
    expect(levelFrom({ LOG_LEVEL: level })).toBe(level);
  });

  it("tolerates the case and spaces an edited env var has", () => {
    expect(levelFrom({ LOG_LEVEL: " DEBUG " })).toBe("debug");
  });

  it("falls back to info on a word it does not know, so a typo cannot silence the service", () => {
    expect(levelFrom({ LOG_LEVEL: "verbose" })).toBe("info");
    expect(levelFrom({ LOG_LEVEL: "" })).toBe("info");
  });
});

/**
 * The redaction list, exercised against a pino instance writing to a string.
 *
 * Built here rather than through `logger()` because that one also attaches the
 * OTel stream, and what is under test is the configuration — which is also
 * what protects the record that leaves the machine, since `redact` runs during
 * serialization and the OTel stream parses the serialized line.
 */
const lines = () => {
  const out: string[] = [];
  const log = pino(
    {
      level: "debug",
      redact: { paths: REDACT, remove: true },
      serializers: { err: (value: unknown) => errorLine(value) },
      formatters: { level: (label) => ({ level: label }) },
      base: null,
    },
    { write: (line: string) => void out.push(line) },
  );
  return { log, out };
};

describe("redaction", () => {
  it.each([
    "email",
    "userEmail",
    "privyUserId",
    "address",
    "walletAddress",
    "recipientAddress",
    "depositAddress",
    "publicKey",
    "authorization",
    "identityToken",
    "secretKey",
    "apiKey",
    "privateKey",
    "mnemonic",
    "signature",
    "txSignature",
    "balanceUsd",
    "totalUsd",
    "realisedPnlUsd",
    "unrealisedPnlUsd",
    "costBasisUsd",
    "shares",
  ])("removes %s", (field) => {
    /* The most likely way an address reaches a log store is somebody handing
       it to a log call. This runs during serialization, so it has already
       happened by the time the OTel stream sees the line — the copy that
       leaves the machine is the redacted one. */
    const { log, out } = lines();

    log.info({ [field]: "secret-value", keep: "ok" }, "m");

    expect(out[0]).not.toContain("secret-value");
    expect(out[0]).toContain("ok");
  });

  it("removes a banned field one object down as well", () => {
    const { log, out } = lines();

    log.info({ wallet: { walletAddress: "7xKX", kind: "external" } }, "m");

    expect(out[0]).not.toContain("7xKX");
    expect(out[0]).toContain("external");
  });

  it("keeps userId, which is ours and not a person's name for themselves", () => {
    /* Our own UUID, to our own infrastructure, and a line that cannot say
       whose request it was answers nothing anybody asks. */
    const { log, out } = lines();

    log.info({ userId: "6f1b0c2e" }, "m");

    expect(out[0]).toContain("6f1b0c2e");
  });

  it("keeps the fields a dashboard is built from", () => {
    const { log, out } = lines();

    log.info({ scope: "funding", chain: "base", status: "settled", ms: 1200 }, "m");

    for (const value of ["funding", "base", "settled", "1200"]) expect(out[0]).toContain(value);
  });
});

describe("a thrown value belongs under `err`", () => {
  /*
   * The trap this documents cost a real test. `log.error({ raw }, "…")` where
   * `raw` is an Error records `"raw":{}` — an Error's own properties are not
   * enumerable, so JSON.stringify sees nothing — and the error is gone. Only
   * `err` goes through the serializer, and the serializer is where `errorLine`
   * reduces it to the one sentence that says what went wrong.
   */
  it("keeps an error passed as err", () => {
    const { log, out } = lines();

    log.error({ err: new TypeError("socket hang up") }, "m");

    expect(JSON.parse(out[0]!).err).toBe("TypeError: socket hang up");
  });

  it("loses an error passed under any other name, which is why this test exists", () => {
    const { log, out } = lines();

    log.error({ cause: new TypeError("socket hang up") }, "m");

    expect(JSON.parse(out[0]!).cause).toEqual({});
    expect(out[0]).not.toContain("socket hang up");
  });

  it("keeps a thrown string under err too, which the Solana SDK does throw", () => {
    const { log, out } = lines();

    log.error({ err: "Unable to find chain: Chain id 8453" }, "m");

    expect(JSON.parse(out[0]!).err).toContain("Chain id 8453");
  });
});

describe("the log line", () => {
  it("names the level in words, so a reader and a query agree", () => {
    const { log, out } = lines();

    log.warn("m");

    expect(JSON.parse(out[0]!)).toMatchObject({ level: "warn", msg: "m" });
  });

  it("reduces a thrown value to one line rather than a stack", () => {
    /* The reasoning from the old log.ts: a stack is a screenful of
       node_modules frames around the one sentence that says what broke, and
       every call site here already says where it is. */
    const { log, out } = lines();

    log.error({ err: new TypeError("socket hang up") }, "could not reach jupiter");

    const line = JSON.parse(out[0]!) as { err: string };
    expect(line.err).toBe("TypeError: socket hang up");
    expect(out[0]).not.toContain("    at ");
  });

  it("writes nothing below the configured level", () => {
    const out: string[] = [];
    const log = pino({ level: "warn", base: null }, { write: (l: string) => void out.push(l) });

    log.debug("no");
    log.info("no");
    log.warn("yes");

    expect(out).toHaveLength(1);
  });
});
