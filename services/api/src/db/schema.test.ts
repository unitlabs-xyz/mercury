import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { users, wallets } from "./schema.js";

describe("schema", () => {
  it("gives a user an id, a creation time and a display currency", () => {
    const cols = Object.keys(getTableColumns(users));
    expect(cols).toEqual(
      expect.arrayContaining(["id", "privyUserId", "createdAt", "displayCurrency"]),
    );
  });

  it("gives a wallet an address, a kind and an owner", () => {
    const cols = Object.keys(getTableColumns(wallets));
    expect(cols).toEqual(
      expect.arrayContaining(["id", "userId", "address", "kind", "isPrimary"]),
    );
  });
});

import { activities, instruments, lots, multiplierEvents, orders, positions, tokens } from "./schema.js";

describe("read model schema", () => {
  it("gives an instrument the fields a shelf needs", () => {
    const cols = Object.keys(getTableColumns(instruments));
    expect(cols).toEqual(
      expect.arrayContaining(["id", "ticker", "name", "sector", "description", "logoUrl", "isTradable"]),
    );
  });

  it("gives a token its mint, its issuer and its multiplier", () => {
    const cols = Object.keys(getTableColumns(tokens));
    expect(cols).toEqual(
      expect.arrayContaining([
        "id", "instrumentId", "mint", "issuer", "symbol", "decimals",
        "multiplier", "multiplierUpdatedAt", "isRoutable", "firstSeenAt",
      ]),
    );
  });

  it("records both sides of a multiplier change, because it is a dividend", () => {
    const cols = Object.keys(getTableColumns(multiplierEvents));
    expect(cols).toEqual(
      expect.arrayContaining(["id", "tokenId", "oldMultiplier", "newMultiplier", "observedAt", "kind"]),
    );
  });

  it("stores both sides of a quantity on a lot, because they drift apart", () => {
    // docs/05: a holding has a token quantity AND a share count. Deriving one
    // from the other with today's multiplier would rewrite history.
    const cols = Object.keys(getTableColumns(lots));
    expect(cols).toEqual(
      expect.arrayContaining([
        "id", "userId", "tokenId", "instrumentId", "tokenQty", "shares",
        "unitCostUsd", "acquiredAt", "source", "isEstimated", "orderId",
      ]),
    );
  });

  it("rolls a position up per instrument, not per token", () => {
    const cols = Object.keys(getTableColumns(positions));
    expect(cols).toEqual(
      expect.arrayContaining(["userId", "instrumentId", "shares", "costBasisUsd", "avgUnitCostUsd", "updatedAt"]),
    );
    expect(cols).not.toContain("tokenId");
  });

  it("keeps the decision verbatim on an order", () => {
    const cols = Object.keys(getTableColumns(orders));
    expect(cols).toEqual(
      expect.arrayContaining([
        "id", "userId", "instrumentId", "side", "usdAmount", "decision",
        "chosenTokenId", "referencePrice", "premiumPct", "status",
        "txSignature", "triggerOrderAccount", "filledAt", "createdAt",
      ]),
    );
  });

  it("gives activity everything it needs without a join", () => {
    const cols = Object.keys(getTableColumns(activities));
    expect(cols).toEqual(
      expect.arrayContaining([
        "id", "userId", "kind", "occurredAt", "title", "subtitle",
        "amountUsd", "refTable", "refId", "txSignature",
      ]),
    );
  });

  it("holds money as numeric, never as a float", () => {
    const money = [
      getTableColumns(lots).unitCostUsd,
      getTableColumns(lots).shares,
      getTableColumns(positions).costBasisUsd,
      getTableColumns(orders).usdAmount,
      getTableColumns(tokens).multiplier,
    ];
    for (const column of money) expect(column.getSQLType()).toBe("numeric(38, 18)");
    // A raw token amount is an integer count of the smallest unit, so it is a
    // bigint and not a numeric: it is never fractional and never rounded.
    expect(getTableColumns(lots).tokenQty.getSQLType()).toBe("bigint");
  });
});
