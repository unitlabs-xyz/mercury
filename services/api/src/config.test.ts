import { describe, expect, it } from "vitest";
import { readConfig } from "./deps.js";

const base = {
  DATABASE_URL: "postgresql://localhost/test",
  PRIVY_APP_ID: "app",
  SOLANA_RPC_URL: "https://rpc.example",
};

describe("SEND_MODE", () => {
  it("sends for real by default", () => {
    expect(readConfig(base).sendMode).toBe("broadcast");
  });

  it("is a dry run when set to simulate", () => {
    expect(readConfig({ ...base, SEND_MODE: "simulate" }).sendMode).toBe("simulate");
  });

  it("refuses to start on anything else, so a typo can never quietly mean send", () => {
    expect(() => readConfig({ ...base, SEND_MODE: "simulated" })).toThrow("SEND_MODE");
  });
});
