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
   * Absent means sponsorship is off, not that the server is misconfigured: it
   * still starts, and sends still work with the sender paying the network.
   * Trades are refused at execute instead, since the fee needs the relayer.
   */
  it("treats a missing relayer key as sponsorship being off", () => {
    expect("relayerSecretKey" in readConfig(base)).toBe(false);
    expect(readConfig({ ...base, RELAYER_SECRET_KEY: "[1,2,3]" }).relayerSecretKey).toBe("[1,2,3]");
  });

  it("reads Jupiter keys as a comma-separated list, and none as the keyless tier", () => {
    expect(readConfig(base).jupiterApiKeys).toEqual([]);
    expect(readConfig({ ...base, JUPITER_API_KEYS: "k1, k2" }).jupiterApiKeys).toEqual(["k1", "k2"]);
  });

  /*
   * The singular is the name a person writes when there is one key, and it
   * used to buy them the keyless tier in silence.
   */
  it("accepts the singular JUPITER_API_KEY, which is the easy name to reach for", () => {
    expect(readConfig({ ...base, JUPITER_API_KEY: "k1" }).jupiterApiKeys).toEqual(["k1"]);
  });

  /* Empty too: .env.example lists every optional variable with no value. */
  it("charges 50 bps on a trade when nothing says otherwise", () => {
    expect(readConfig(base).tradingFeeBps).toBe(50);
    expect(readConfig({ ...base, TRADING_FEE_BPS: "" }).tradingFeeBps).toBe(50);
  });

  it("reads the trading fee from TRADING_FEE_BPS, zero included", () => {
    expect(readConfig({ ...base, TRADING_FEE_BPS: "35" }).tradingFeeBps).toBe(35);
    expect(readConfig({ ...base, TRADING_FEE_BPS: "0" }).tradingFeeBps).toBe(0);
  });

  /*
   * A fee is a number every trade turns on. "0.5" meaning half a percent, or a
   * typo, would otherwise charge something nobody chose — refusing to boot is
   * the one place that cannot go unnoticed.
   */
  it("refuses a trading fee that is not whole basis points below 100%", () => {
    for (const bad of ["0.5", "-1", "10000", "fifty"]) {
      expect(() => readConfig({ ...base, TRADING_FEE_BPS: bad })).toThrow("TRADING_FEE_BPS");
    }
  });

  it("charges 30 bps on a swapped deposit when nothing says otherwise", () => {
    expect(readConfig(base).depositFeeBps).toBe(30);
    expect(readConfig({ ...base, DEPOSIT_FEE_BPS: "" }).depositFeeBps).toBe(30);
    expect(readConfig({ ...base, DEPOSIT_FEE_BPS: "0" }).depositFeeBps).toBe(0);
  });

  it("refuses a deposit fee that is not whole basis points below 100%", () => {
    for (const bad of ["0.3", "-1", "10000", "thirty"]) {
      expect(() => readConfig({ ...base, DEPOSIT_FEE_BPS: bad })).toThrow("DEPOSIT_FEE_BPS");
    }
  });

  /*
   * Relay pays app fees to an EVM address and nothing else, Solana deposits
   * included. Unset is a deployment that has not chosen one: no fee, rather
   * than a fee owed to nobody.
   */
  it("reads the deposit fee's recipient, and leaves it off when unset", () => {
    expect("depositFeeRecipient" in readConfig(base)).toBe(false);
    expect("depositFeeRecipient" in readConfig({ ...base, DEPOSIT_FEE_RECIPIENT: "" })).toBe(false);
    const evm = "0x999999cf1046e68e36E1aA2E0E07105eDDD1f08E";
    expect(readConfig({ ...base, DEPOSIT_FEE_RECIPIENT: evm }).depositFeeRecipient).toBe(evm);
  });

  /* A Solana address here would be accepted by nothing and noticed by nobody until the claim. */
  it("refuses a deposit fee recipient that is not an EVM address", () => {
    for (const bad of [
      "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      "0x1234",
      "999999cf1046e68e36E1aA2E0E07105eDDD1f08E",
    ]) {
      expect(() => readConfig({ ...base, DEPOSIT_FEE_RECIPIENT: bad })).toThrow("DEPOSIT_FEE_RECIPIENT");
    }
  });

  it("prefers the plural when a deployment somehow sets both", () => {
    expect(readConfig({ ...base, JUPITER_API_KEYS: "k1,k2", JUPITER_API_KEY: "old" }).jupiterApiKeys).toEqual(
      ["k1", "k2"],
    );
  });
});

describe("readConfig, the background jobs' RPC endpoints", () => {
  /* PublicNode and dRPC's free plan both refused the jobs' batched reads when measured. */
  it("takes Solana's own public endpoint when nothing is set", () => {
    expect(readConfig({ ...base }).solanaPublicRpcUrls).toEqual(["https://api.mainnet-beta.solana.com"]);
  });

  it("takes the list it is given, in order", () => {
    expect(
      readConfig({ ...base, SOLANA_PUBLIC_RPC_URLS: " https://a.example , https://b.example" })
        .solanaPublicRpcUrls,
    ).toEqual(["https://a.example", "https://b.example"]);
  });

  it("puts the jobs back on the paid endpoint when set empty", () => {
    expect(readConfig({ ...base, SOLANA_PUBLIC_RPC_URLS: "" }).solanaPublicRpcUrls).toEqual([]);
  });

  it("refuses an address that is not https, at boot", () => {
    expect(() => readConfig({ ...base, SOLANA_PUBLIC_RPC_URLS: "http://a.example" })).toThrow(
      "SOLANA_PUBLIC_RPC_URLS",
    );
  });
});
