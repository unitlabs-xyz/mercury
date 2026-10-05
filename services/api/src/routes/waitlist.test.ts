import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing.js";
import type { Notice } from "../notify/ports.js";
import { dnsAcceptsMail, pgWaitlist, waitlistRoutes } from "./waitlist.js";

const anyDomain = async () => true;

/** No drawing in these tests: the card's bytes are the slug, so a test can tell which was drawn. */
const fakeRender = async (card: { slug: string }) => Buffer.from(card.slug);

const withCards = async (sent: Notice[] = []) =>
  waitlistRoutes(
    pgWaitlist(await testDb(), "secret", anyDomain, {
      render: fakeRender,
      wordmark: async () => Buffer.from("wordmark"),
      pick: async () => "a.jpg",
      publicBase: "https://cards.test",
      notifier: { send: async (n) => (sent.push(n), true) },
    }),
  );

type Joined = {
  ok: true;
  card?: {
    position: number;
    handle: string | null;
    founding: boolean;
    image: string;
    page: string;
    intent: string;
  };
};

const post = (app: ReturnType<typeof waitlistRoutes>, body: unknown) =>
  app.request("/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("waitlist", () => {
  it("stores an email once, whatever its case", async () => {
    const app = waitlistRoutes(pgWaitlist(await testDb(), "secret", anyDomain));

    expect((await post(app, { email: "Ada@Example.com", name: "Ada", country: "India" })).status).toBe(200);
    expect((await post(app, { email: "ada@example.com", country: "Spain" })).status).toBe(200);

    const res = await app.request("/admin/waitlist", { headers: { authorization: "Bearer secret" } });
    const body = (await res.json()) as { count: number; entries: { email: string; country: string }[] };
    expect(body.count).toBe(1);
    expect(body.entries[0]).toMatchObject({ email: "ada@example.com", country: "India" });
  });

  it("refuses a bad email or a missing country", async () => {
    const app = waitlistRoutes(pgWaitlist(await testDb(), "secret", anyDomain));
    expect((await post(app, { email: "nope", country: "India" })).status).toBe(400);
    expect((await post(app, { email: "a@b.co" })).status).toBe(400);
  });

  it("hides the export without the token, and when none is configured", async () => {
    const db = await testDb();
    const guarded = waitlistRoutes(pgWaitlist(db, "secret", anyDomain));
    expect((await guarded.request("/admin/waitlist")).status).toBe(404);
    expect(
      (await guarded.request("/admin/waitlist", { headers: { authorization: "Bearer wrong" } })).status,
    ).toBe(404);

    const open = waitlistRoutes(pgWaitlist(db, undefined, anyDomain));
    expect(
      (await open.request("/admin/waitlist", { headers: { authorization: "Bearer undefined" } })).status,
    ).toBe(404);
  });

  it("exports CSV", async () => {
    const app = waitlistRoutes(pgWaitlist(await testDb(), "secret", anyDomain));
    await post(app, { email: "a@b.co", name: 'Quote "Q"', country: "India" });
    const res = await app.request("/admin/waitlist?format=csv", {
      headers: { authorization: "Bearer secret" },
    });
    const text = await res.text();
    expect(text.split("\n")[0]).toBe("position,email,name,handle,country,created_at");
    expect(text).toContain('"Quote ""Q"""');
  });

  it("refuses a domain that cannot take mail, and stores nothing", async () => {
    const db = await testDb();
    const app = waitlistRoutes(pgWaitlist(db, "secret", async (d) => d !== "nowhere.invalid"));
    const res = await post(app, { email: "a@nowhere.invalid", country: "India" });
    expect(res.status).toBe(400);
    const list = await app.request("/admin/waitlist", { headers: { authorization: "Bearer secret" } });
    expect(((await list.json()) as { count: number }).count).toBe(0);
  });

  it("knows a reserved domain has no mail, and does not wait on DNS forever", async () => {
    expect(await dnsAcceptsMail("nowhere.invalid")).toBe(false);
    expect(await dnsAcceptsMail("example.com", 1)).toBe(true);
  });

  it("numbers signups in the order they join, from 1", async () => {
    const app = await withCards();
    const first = (await (await post(app, { email: "a@b.co", country: "India" })).json()) as Joined;
    const second = (await (await post(app, { email: "c@d.co", country: "India" })).json()) as Joined;
    expect(first.card?.position).toBe(1);
    expect(second.card?.position).toBe(2);
    expect(first.card?.founding).toBe(true);
  });

  it("hands a repeat signup nothing back, and sends no second email", async () => {
    const sent: Notice[] = [];
    const app = await withCards(sent);
    await post(app, { email: "a@b.co", country: "India", handle: "ada" });
    const again = (await (await post(app, { email: "A@B.co", country: "India" })).json()) as Joined;
    expect(again).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
  });

  it("takes a handle with an @, or as a profile link, and stores it bare", async () => {
    const app = await withCards();
    const at = (await (
      await post(app, { email: "a@b.co", country: "India", handle: "@Ada_99" })
    ).json()) as Joined;
    const link = (await (
      await post(app, { email: "c@d.co", country: "India", handle: "https://x.com/grace" })
    ).json()) as Joined;
    const blank = (await (
      await post(app, { email: "e@f.co", country: "India", handle: "  " })
    ).json()) as Joined;
    expect(at.card?.handle).toBe("Ada_99");
    expect(link.card?.handle).toBe("grace");
    expect(blank.card?.handle).toBeNull();
  });

  it("refuses something that cannot be an X handle", async () => {
    const app = await withCards();
    const res = await post(app, { email: "a@b.co", country: "India", handle: "not a handle!" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/X handle/);
  });

  it("emails the card inline, with the post one click away", async () => {
    const sent: Notice[] = [];
    const app = await withCards(sent);
    const { card } = (await (
      await post(app, { email: "a@b.co", country: "India", handle: "ada" })
    ).json()) as Joined;
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "a@b.co", subject: "You're in. Spot #1 of 500 is yours" });
    expect(sent[0]!.attachments?.map((a) => a.contentId)).toEqual(["card", "wordmark"]);
    expect(sent[0]!.attachments?.[0]?.filename).toBe("mercury-1.png");
    // Both images inline, and the spot's details above the card.
    expect(sent[0]!.html).toContain('src="cid:card"');
    expect(sent[0]!.html).toContain('src="cid:wordmark"');
    expect(sent[0]!.html).toContain("prefers-color-scheme: dark");
    expect(sent[0]!.html).toContain("@ada");
    expect(sent[0]!.html).toContain("First, 1–100");
    expect(sent[0]!.body).toContain("Held by: @ada");
    expect(sent[0]!.body).toContain(card!.intent);
  });

  it("serves the card by its slug, and the share page that unfurls into it", async () => {
    const app = await withCards();
    const { card } = (await (
      await post(app, { email: "a@b.co", country: "India", handle: "ada" })
    ).json()) as Joined;
    const slug = card!.page.split("/f/")[1]!;
    expect(card!.image).toBe(`https://cards.test/waitlist/cards/${slug}.png`);

    const png = await app.request(`/waitlist/cards/${slug}.png`);
    expect(png.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await png.arrayBuffer()).toString()).toBe(slug);

    const page = await (await app.request(`/f/${slug}`)).text();
    expect(page).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(page).toContain(`content="${card!.image}"`);
    expect(new URL(card!.intent).searchParams.get("url")).toBe(card!.page);

    expect(page).toContain('http-equiv="refresh"');
    const preview = await (await app.request(`/f/${slug}?preview`)).text();
    expect(preview).not.toContain('http-equiv="refresh"');
    expect(preview).toContain(`<img src="${card!.image}"`);

    expect((await app.request("/waitlist/cards/nobody.png")).status).toBe(404);
  });

  it("keeps a signup when the email cannot be sent", async () => {
    const app = waitlistRoutes(
      pgWaitlist(await testDb(), "secret", anyDomain, {
        render: fakeRender,
        pick: async () => null,
        notifier: { send: async () => Promise.reject(new Error("down")) },
      }),
    );
    const res = await post(app, { email: "a@b.co", country: "India" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Joined).card?.position).toBe(1);
  });
});
