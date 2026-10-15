import { describe, expect, it } from "vitest";
import { parseAdmins } from "./allowlist.js";

describe("parseAdmins", () => {
  it("is empty when unset, which is what keeps the routes unmounted", () => {
    /* The capability pattern this service already uses: absent configuration
       means the feature is not built, not that it is open. */
    expect(parseAdmins(undefined)).toEqual([]);
    expect(parseAdmins("")).toEqual([]);
    expect(parseAdmins("   ")).toEqual([]);
  });

  it("reads a comma-separated list", () => {
    expect(parseAdmins("did:privy:a,did:privy:b")).toEqual(["did:privy:a", "did:privy:b"]);
  });

  it("tolerates the spaces a person leaves when editing an env var", () => {
    expect(parseAdmins(" did:privy:a , did:privy:b ")).toEqual(["did:privy:a", "did:privy:b"]);
  });

  it("drops empty entries from a trailing comma", () => {
    /* `did:privy:a,` would otherwise admit the empty string, and an identity
       whose privyUserId was somehow empty would match it. */
    expect(parseAdmins("did:privy:a,,")).toEqual(["did:privy:a"]);
  });

  it("keeps the case, because a DID is case-sensitive", () => {
    expect(parseAdmins("did:privy:AbC")).toEqual(["did:privy:AbC"]);
  });
});
