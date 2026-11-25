import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  AccountRole,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getPublicKeyFromAddress,
  getTransactionDecoder,
  partiallySignTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signBytes,
  verifySignature,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";
import { mercuryWallet, testDb } from "../db/testing.js";
import { users } from "../db/schema.js";
import { inMemoryBuilds } from "../relay/builds.js";
import { keypairRelaySigner } from "../relay/signer.js";
import { sendRoutes } from "../routes/send.js";
import { walletRoutes } from "../routes/wallets.js";
import { actingWallet, oneWalletToAct, WALLET_HEADER } from "./acting.js";
import { pgWalletDeps } from "./deps.js";

/**
 * A linked wallet acting, end to end, with real keys and no wallet app: what
 * Phantom does in the browser, done with `@solana/kit` key pairs.
 *
 * Over HTTP and Postgres, through the routes the server mounts: the wallet is
 * linked by signing the message the server issued; it is chosen with the
 * header; a transaction the server built for it, signed by its own key, is
 * checked and co-signed by the relayer under that choice. The relayer is a
 * real key too, so the transaction it hands to the network is checked for
 * both signatures, each over the same message bytes.
 *
 * The node is a closed port: the send fails there, after every check this
 * test is about has passed.
 */

const lifetime = {
  blockhash: "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k" as never,
  lastValidBlockHeight: 1_000_000n,
};

/** A secret key as `solana-keygen` would hold it, from 32 random bytes. */
const relayerSecret = () => JSON.stringify([...crypto.getRandomValues(new Uint8Array(32))]);

const world = async () => {
  const db = await testDb();
  const mercury = await generateKeyPairSigner();
  const phantom = await generateKeyPairSigner();
  const [user] = await db.insert(users).values({ privyUserId: "did:privy:acting" }).returning();
  await mercuryWallet(db, user!.id, mercury.address);

  const realRelayer = await keypairRelaySigner(relayerSecret());
  const cosigned: string[] = [];
  const builds = inMemoryBuilds();
  const relay = {
    signer: {
      address: realRelayer.address,
      cosign: async (b64: string) => {
        const out = await realRelayer.cosign(b64);
        cosigned.push(out);
        return out;
      },
    },
    builds,
  };

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("identity", { userId: user!.id, privyUserId: "did:privy:acting", walletAddress: mercury.address });
    await next();
  });
  app.use("/v1/*", actingWallet({ db }));
  app.use("/v1/transactions/send", oneWalletToAct());
  app.route("/", walletRoutes(pgWalletDeps(db, { appUrl: "https://beta.trymercury.xyz", limit: 5 })));
  app.route("/", sendRoutes({ rpcUrl: "http://127.0.0.1:1", relay }));

  const call = async (path: string, body: unknown, wallet?: string) => {
    const res = await app.request(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(wallet === undefined ? {} : { [WALLET_HEADER]: wallet }),
      },
      body: JSON.stringify(body),
    });
    return {
      status: res.status,
      body: (await res.json().catch(() => null)) as Record<string, unknown> | null,
    };
  };

  /** What Phantom does on "Link": sign the message the server issued, as base58. */
  const link = async (wallet: KeyPairSigner) => {
    const challenge = await call("/v1/wallets/link/challenge", { address: wallet.address });
    const message = new TextEncoder().encode(challenge.body!["message"] as string);
    const signature = getBase58Decoder().decode(await signBytes(wallet.keyPair.privateKey, message));
    const linked = await call("/v1/wallets/link", { challengeId: challenge.body!["challengeId"], signature });
    return { status: linked.status, id: (linked.body?.["wallet"] as { id: string } | undefined)?.id };
  };

  /**
   * What the server builds for an action: the relayer pays the fee, and `owner`
   * must sign. Remembered as this server's own build, as every builder does.
   * Signed by `signer`, as the wallet's pop-up would: only its own signature.
   */
  const built = async (owner: Address, signer: KeyPairSigner | null) => {
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayer(realRelayer.address as Address, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
      (m) =>
        appendTransactionMessageInstructions(
          [
            {
              programAddress: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" as Address,
              accounts: [{ address: owner, role: AccountRole.READONLY_SIGNER }],
              data: new Uint8Array([1]),
            },
          ],
          m,
        ),
    );
    const compiled = compileTransaction(message);
    builds.remember(compiled.messageBytes as unknown as Uint8Array);
    if (signer === null) return getBase64EncodedWireTransaction(compiled);
    return getBase64EncodedWireTransaction(await partiallySignTransaction([signer.keyPair], compiled));
  };

  return { mercury, phantom, link, built, call, cosigned, relayer: realRelayer.address as Address };
};

describe("a linked wallet acting, with real keys", () => {
  it("links by signing the server's message, then has its own transaction co-signed under its choice", async () => {
    const w = await world();

    const linked = await w.link(w.phantom);
    expect(linked.status).toBe(200);

    const wire = await w.built(w.phantom.address, w.phantom);
    const sent = await w.call("/v1/transactions/send", { transaction: wire }, linked.id);

    // Through every check to the network, which is a closed port here.
    expect(sent.status).toBe(422);
    expect(sent.body).toMatchObject({ error: { code: "send_failed" } });
    expect(w.cosigned).toHaveLength(1);

    // What the relayer handed on carries both signatures, each valid over the one message.
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(w.cosigned[0]!));
    const message = tx.messageBytes as unknown as Uint8Array;
    for (const who of [w.phantom.address, w.relayer]) {
      const signature = tx.signatures[who];
      expect(signature, who).toBeTruthy();
      expect(await verifySignature(await getPublicKeyFromAddress(who), signature!, message), who).toBe(true);
    }
  });

  it("refuses the Mercury wallet's signature on a transaction while the linked wallet is chosen", async () => {
    const w = await world();
    const { id } = await w.link(w.phantom);
    const wire = await w.built(w.mercury.address, w.mercury);
    const sent = await w.call("/v1/transactions/send", { transaction: wire }, id);
    expect(sent.status).toBe(403);
    expect(sent.body).toMatchObject({ error: { code: "not_your_transaction" } });
    expect(w.cosigned).toEqual([]);
  });

  it("refuses the linked wallet's transaction while the Mercury wallet is chosen", async () => {
    const w = await world();
    await w.link(w.phantom);
    const wire = await w.built(w.phantom.address, w.phantom);
    const sent = await w.call("/v1/transactions/send", { transaction: wire });
    expect(sent.status).toBe(403);
    expect(w.cosigned).toEqual([]);
  });

  it("will not co-sign before the linked wallet has signed", async () => {
    const w = await world();
    const { id } = await w.link(w.phantom);
    // Built for the linked wallet and sent unsigned, as a closed pop-up would leave it.
    const wire = await w.built(w.phantom.address, null);
    const sent = await w.call("/v1/transactions/send", { transaction: wire }, id);
    expect(sent.status).toBe(403);
    expect(sent.body).toMatchObject({ error: { code: "not_signed" } });
    expect(w.cosigned).toEqual([]);
  });

  it("refuses a wallet that was never linked, whatever it signed", async () => {
    const w = await world();
    const wire = await w.built(w.phantom.address, w.phantom);
    const sent = await w.call(
      "/v1/transactions/send",
      { transaction: wire },
      "6f1c9b8e-0000-4000-8000-000000000000",
    );
    expect(sent.status).toBe(403);
    expect(w.cosigned).toEqual([]);
  });

  it("refuses every wallet at once, before anything is checked", async () => {
    const w = await world();
    await w.link(w.phantom);
    const wire = await w.built(w.phantom.address, w.phantom);
    expect((await w.call("/v1/transactions/send", { transaction: wire }, "all")).status).toBe(400);
    expect(w.cosigned).toEqual([]);
  });
});
