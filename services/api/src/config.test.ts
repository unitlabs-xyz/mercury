import { describe, expect, it } from "vitest";
import { readConfig } from "./deps.js";

const base = {
  DATABASE_URL: "postgresql://localhost/test",
  PRIVY_APP_ID: "app",
  SOLANA_RPC_URL: "https://rpc.example",
};

describe("readConfig", () => {
  it("reads what the server cannot start without", () => {
    const config = readConfig(base);
    expect(config.databaseUrl).toBe(base.DATABASE_URL);
    expect(config.privyAppId).toBe(base.PRIVY_APP_ID);
    expect(config.solanaRpcUrl).toBe(base.SOLANA_RPC_URL);
  });

  it("names the one that is missing rather than failing somewhere later", () => {
    const { SOLANA_RPC_URL: _omitted, ...without } = base;
    expect(() => readConfig(without)).toThrow("SOLANA_RPC_URL");
  });

  it("leaves the optional scan endpoint off rather than undefined", () => {
    expect("solanaScanRpcUrl" in readConfig(base)).toBe(false);
    expect(readConfig({ ...base, SOLANA_SCAN_RPC_URL: "https://scan.example" }).solanaScanRpcUrl).toBe(
      "https://scan.example",
    );
  });

  /*
   * Absent means sponsorship is off, not that the server is misconfigured. A
   * deployment without a funded relayer still sells stock; buyers just pay
   * their own network costs, which is the behaviour before any of this.
   */
  it("treats a missing relayer key as sponsorship being off", () => {
    expect("relayerSecretKey" in readConfig(base)).toBe(false);
    expect(readConfig({ ...base, RELAYER_SECRET_KEY: "[1,2,3]" }).relayerSecretKey).toBe("[1,2,3]");
  });

  it("only enables Glider catalog sync when its API key is configured", () => {
    expect(readConfig(base).gliderApiKey).toBeUndefined();
    expect(readConfig({ ...base, GLIDER_API_KEY: "test-key" }).gliderApiKey).toBe("test-key");
  });
});
