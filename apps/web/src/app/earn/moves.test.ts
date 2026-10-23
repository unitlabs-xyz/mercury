import { describe, expect, it } from "vitest";
import { earnCovers, floorCents, partialMoveText, runSteps, switchDeposit } from "./moves";
import type { EarnIntent, EarnStep } from "../../api/earn";

describe("switchDeposit", () => {
  /*
   * "Move my $100 from other vaults here" used to deposit "all": every dollar
   * in the wallet, so a person's buying cash went into the vault with it.
   */
  it("puts in what came out of the other vaults, never more than the figure shown", () => {
    expect(switchDeposit(100, 100.04)).toBe(100);
    expect(switchDeposit(100, 99.5)).toBe(99.5);
  });

  it("falls back to the figure shown when a withdrawal's amount could not be read", () => {
    expect(switchDeposit(100, null)).toBe(100);
  });

  it("rounds down to the cent", () => {
    expect(switchDeposit(100.009, null)).toBe(100);
  });
});

describe("floorCents", () => {
  it("never offers a cent more than is there", () => {
    expect(floorCents(12.349)).toBe(12.34);
    expect(floorCents(0.1 + 0.2)).toBe(0.3);
  });
});

describe("partialMoveText", () => {
  /* A switch whose second half failed used to say the money had not moved, after it had. */
  it("says what already moved before why the rest did not", () => {
    expect(partialMoveText(2000, "This vault is full. Pick another.")).toBe(
      "$2,000.00 came out of Earn and is in your cash. Moving it on didn't go through: This vault is full. Pick another.",
    );
  });

  it("still says money moved when the amount is not known", () => {
    expect(partialMoveText(null, "Something broke.")).toBe(
      "Your money came out of Earn and is in your cash. Moving it on didn't go through: Something broke.",
    );
  });
});

describe("runSteps", () => {
  /** Everything a move does outside this module, recorded, with the answers given. */
  const io = (opts: { filed?: string | null; refuse?: (intent: EarnIntent) => Error | undefined } = {}) => {
    const built: EarnIntent[] = [];
    let n = 0;
    return {
      built,
      io: {
        build: async (intent: EarnIntent) => {
          const refusal = opts.refuse?.(intent);
          if (refusal) throw refusal;
          built.push(intent);
          return { transactions: ["tx"], vault: intent.vault };
        },
        signAndSend: async () => `sig-${++n}`,
        confirm: async () => (opts.filed === null ? null : { recorded: true, usd: opts.filed ?? "0" }),
      },
    };
  };

  const SWITCH: EarnStep[] = [
    { kind: "withdraw", usd: "all", vault: "A" },
    { kind: "deposit", usd: { cameOutUpTo: 100 }, vault: "B" },
  ];

  it("deposits what came out of the old vault, and leaves the wallet's own cash alone", async () => {
    const r = io({ filed: "100.04" });
    expect(await runSteps(SWITCH, r.io)).toEqual(["sig-1", "sig-2"]);
    expect(r.built).toEqual([
      { kind: "withdraw", usd: "all", vault: "A" },
      { kind: "deposit", usd: "100.00", vault: "B" },
    ]);
  });

  it("deposits the figure shown when the withdrawal's confirm could not be read", async () => {
    const r = io({ filed: null });
    await runSteps(SWITCH, r.io);
    expect(r.built[1]).toEqual({ kind: "deposit", usd: "100.00", vault: "B" });
  });

  it("says what already moved when the second half fails", async () => {
    const r = io({
      filed: "100.04",
      refuse: (i) => (i.kind === "deposit" ? new Error("This vault is full. Pick another.") : undefined),
    });
    await expect(runSteps(SWITCH, r.io)).rejects.toThrow(
      "$100.04 came out of Earn and is in your cash. Moving it on didn't go through: This vault is full. Pick another.",
    );
  });

  it("passes a failure through as it is when nothing moved", async () => {
    const r = io({ refuse: () => new Error("Not enough cash.") });
    await expect(runSteps([{ kind: "deposit", usd: "20", vault: "B" }], r.io)).rejects.toThrow(
      /^Not enough cash\.$/,
    );
  });
});

describe("earnCovers", () => {
  /*
   * A $500 buy with $40 of cash and $3 in Earn used to offer only "Withdraw
   * from Earn": three dollars back, and no way to add the rest.
   */
  it("is true only when one vault alone holds the shortfall", () => {
    expect(earnCovers([{ balanceUsd: 3 }], 460)).toBe(false);
    expect(earnCovers([{ balanceUsd: 300 }, { balanceUsd: 200 }], 460)).toBe(false);
    expect(earnCovers([{ balanceUsd: 3 }, { balanceUsd: 500 }], 460)).toBe(true);
  });

  it("is false with nothing short, or nothing in Earn", () => {
    expect(earnCovers([{ balanceUsd: 500 }], 0)).toBe(false);
    expect(earnCovers(undefined, 10)).toBe(false);
  });
});
