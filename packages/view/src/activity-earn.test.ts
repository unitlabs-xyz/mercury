import { describe, expect, it } from "vitest";
import { GROUPS, KIND_LABEL, toEvent } from "./index.js";
import type { ActivityItem } from "./activity-map.js";

const row = (kind: string): ActivityItem => ({
  id: "row-1",
  kind,
  occurredAt: "2026-10-22T10:00:00.000Z",
  title: kind === "earn_deposit" ? "Moved to Earn" : "Withdrew from Earn",
  subtitle: "Steakhouse USDC",
  amountUsd: "500",
  txSignature: "SIG",
  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  logoUrl: null,
});

/*
 * Earn in the feed. A move into or out of a vault used to leave no row at all,
 * and read as a receipt with "Receive" on it once the server started writing one.
 */
describe("Earn in the feed", () => {
  it("is its own kind each way, with its own label", () => {
    expect(toEvent(row("earn_deposit")).kind).toBe("earn_deposit");
    expect(toEvent(row("earn_withdraw")).kind).toBe("earn_withdraw");
    expect(KIND_LABEL.earn_deposit).toBe("To Earn");
    expect(KIND_LABEL.earn_withdraw).toBe("From Earn");
  });

  /* Cash moving within the account, as collateral does: no sign, no colour. */
  it("has no direction, since the money never leaves the account", () => {
    expect(toEvent(row("earn_deposit")).flow).toBeNull();
    expect(toEvent(row("earn_withdraw")).flow).toBeNull();
  });

  it("is found under Transfers", () => {
    const transfers = GROUPS.find((g) => g.key === "transfers")!.kinds;
    expect(transfers).toContain("earn_deposit");
    expect(transfers).toContain("earn_withdraw");
  });
});
