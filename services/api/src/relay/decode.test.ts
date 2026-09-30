import { describe, expect, it } from "vitest";
import { decodeSponsored, programsOf } from "./decode.js";

/*
 * A real sponsored swap, built by Jupiter on 30 September 2026: 5 USDC into
 * SPCXx, with `payer` set to an address other than the buyer. Unsigned, which
 * is the state it reaches the relayer in. A hand-built message would only
 * prove this parses what we think Jupiter emits.
 */
const SWAP =
  "AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAIBBAiQ4ipLd7reOZxOi2elNX14oUXQDl64GuwmrAYAGzb1tXHT2wWQs5H6wGwTPEjJgazXnjFC9fzqZcZtXUK3yms5B0Ep1FBuuW4mcZvyXI+tFFPDx0AF9uimbZWLff089KB5h1050PX9bhIBWaTAi9otSxBG8gFr+IxHiDULT2ra0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwZGb+UhFzL/7K26csOb57yM5bvF9xJrLEObOkAAAAAEedVb8jHAbu50xW7OaBUH/bGy3qP0jlECsc2iVrwTj7Q/+if11/ZKdMCbHylYed5LCas238ndUUsyGqezjOXoqBLrbqi+up4hfUMdeRX9vaLd319a1q1vGVK6foUgtnYCBQAFAsBcFQAGGA8BAgMGEAYHBg0AAQsEAwIMCQ8QDhEKCCTlF8uXeuOtKgEAAAB0AGQAAUBLTAAAAAAArB8zAAAAAAAyAAAB7LBblabAlujtnRsO80h3FdH85l3vJnQ0a4Xm0aF/pFkF7O7r8fQF8AQe6Qg=";

const RELAYER = "AkZjMBy3SAfbend3qq22aMh9nsAehS7a8HXk15VxGJmJ";
const BUYER = "8fLSHcVtPjDMytCpaK7AJjvU2tzpoGQudR5fFffmGdX6";

describe("decodeSponsored", () => {
  it("reads a real Jupiter swap built with a separate payer", () => {
    const r = decodeSponsored(SWAP);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The payer Jupiter was given, not the buyer: this is what sponsorship means.
    expect(r.tx.feePayer).toBe(RELAYER);
    expect(r.tx.signers).toEqual([RELAYER, BUYER]);
    expect(r.tx.signedBy).toEqual([]);
    expect(r.tx.programs).toContain("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
  });

  it("refuses anything that is not a transaction", () => {
    for (const junk of ["", "not base64 at all !!", "aGVsbG8gd29ybGQ="]) {
      const r = decodeSponsored(junk);
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.code).toBe("not_a_transaction");
    }
  });
});

describe("programsOf", () => {
  const statics = ["AAA", "BBB", "CCC"];

  it("resolves every program against the static accounts", () => {
    const r = programsOf([{ programAddressIndex: 2 }, { programAddressIndex: 0 }], statics);
    expect(r.ok && r.programs).toEqual(["CCC", "AAA"]);
  });

  /*
   * The case this exists for. An index past the static accounts is a program
   * loaded from a lookup table, which we cannot read without going and
   * fetching it — so it is refused rather than resolved.
   */
  it("refuses a program named past the static accounts", () => {
    const r = programsOf([{ programAddressIndex: 0 }, { programAddressIndex: 7 }], statics);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.at).toBe(7);
  });
});
