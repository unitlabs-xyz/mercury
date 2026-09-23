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
