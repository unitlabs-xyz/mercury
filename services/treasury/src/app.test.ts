import { describe, expect, it } from "vitest";
import { createTreasuryApp } from "./app.js";
import type { TreasuryConfig } from "./config.js";

const CONFIG: TreasuryConfig = {
  secret: "shared-secret",
  addresses: {
    evm: "0x2c7536E3605D9C16a7a3D7b1898e529396a65c23",
    svm: "FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z",
    bvm: "bc1qnduq8yy8h4nr7g9vuuglzklqatmaquq9ac42k2",
  },
};

/* Values that must never appear in any response, whatever the route. */
const KEYS = [
  "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318",
  "KymWWYtz6iLgVAzxMYNk3TcVQps2BasrSZFB2T8qVp2jgK7NRof2",
  "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
];

const app = createTreasuryApp(CONFIG);
const get = (path: string, secret?: string) =>
  app.request(path, { headers: secret === undefined ? {} : { "x-treasury-secret": secret } });

describe("createTreasuryApp", () => {
  it("returns all three addresses to a caller with the secret", async () => {
    const res = await get("/addresses", CONFIG.secret);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ addresses: CONFIG.addresses });
  });

  it("refuses a wrong secret", async () => {
    const res = await get("/addresses", "not-the-secret");

    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toContain("0x2c7536");
  });

  it("refuses a secret of a different length rather than throwing", async () => {
    /* timingSafeEqual throws on a length mismatch, so the length is checked
       first — and a 500 here would be a denial of service with a stack trace. */
    expect((await get("/addresses", "x")).status).toBe(401);
    expect((await get("/addresses", `${CONFIG.secret}aaaaaaaaaaaa`)).status).toBe(401);
  });

  it("refuses a missing secret", async () => {
    expect((await get("/addresses")).status).toBe(401);
  });

  it("answers health without a secret, and says nothing else", async () => {
    const res = await get("/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("has no other routes", async () => {
    expect((await get("/", CONFIG.secret)).status).toBe(404);
    expect((await get("/keys", CONFIG.secret)).status).toBe(404);
    expect((await get("/sign", CONFIG.secret)).status).toBe(404);
  });

  it("never returns key material from any route, authenticated or not", async () => {
    const bodies: string[] = [];
    for (const path of ["/addresses", "/health", "/", "/keys"]) {
      for (const secret of [CONFIG.secret, "wrong", undefined]) {
        bodies.push(await (await get(path, secret)).text());
      }
    }

    const all = bodies.join("\n");
    for (const key of KEYS) expect(all).not.toContain(key);
    /* And no fragment of one either. */
    for (const key of KEYS) expect(all).not.toContain(key.slice(4, 24));
  });
});
