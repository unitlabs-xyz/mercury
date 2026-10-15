# The waitlist (archived)

**Status:** removed, 15 October 2026, when the beta opened to everyone.
**Last commit with the code:** `a52ad7ba20425aa7c2de2e26e7177327041b071a` on `main`.
**Data:** the `waitlist` table is kept, rows and all. Only the code that read and wrote it is gone.

Before the beta was public, Mercury ran a waitlist with a founding card: everyone who signed up got
a numbered image to share on X, a welcome email with that card, and later a place in a "wave" that
let them into the app. This page is what to read before building it again. The code itself is in
the commit above and comes back with one command (see [Restoring the code](#restoring-the-code)).

## How it worked

```
landing form ─┐                                ┌─> founding card PNG (satori + resvg)
              ├─> POST /waitlist ─> waitlist ──┼─> welcome email, card attached (Resend)
sign-in sheet ┘      (API)          (table)    └─> share page /f/:slug ─> X unfurl
                                       │
                 scripts/allowlist ────┴─> Privy allowlist ─> only listed emails get a code
                 scripts/beta-mail ───────> "Mercury is live" email, stamped beta_mailed_at
```

1. **Signing up.** Two forms posted to the same public route, `POST /waitlist`:
   - the landing page's form (`apps/landing/src/components/Waitlist.astro`): email, country, and
     optionally a name and an X handle, on one row;
   - the web app's sign-in sheet. When Privy refused to send a code with `allowlist_rejected`, the
     sheet swapped to a "Mercury is invite-only right now" step with the same fields and a countdown
     to the next wave.
2. **Validation.** Zod on the way in. The handle was accepted with or without `@`, or pasted as a
   profile link, and stripped to X's own rule (letters, digits, `_`, at most 15). The email's domain
   had to accept mail: an MX record, or failing that an A record, with a 3-second timeout that let
   the signup through. Only a definite "no such domain" refused, because losing a real person is
   worse than keeping a typo. The landing form also suggested fixes for common misspellings
   (`gmial.com` → `gmail.com`).
3. **The row.** One per email (unique, lower-cased). `position` from a sequence, so two signups in
   the same instant never share a number. `slug` random, so share links cannot be walked to list
   everyone. `background` is the card photo chosen at signup and stored, so a shared card never
   changes.
4. **The answer.** A first signup got its card back (image URL, share page, X compose link) and a
   welcome email. A repeat got `{ ok: true }` and nothing else, so the form could not be used to read
   someone else's card or fill their inbox.
5. **Sharing.** `/f/:slug` served an HTML page with Open Graph and Twitter tags pointing at
   `/waitlist/cards/:slug.png`. Crawlers read the tags; a person was sent on to
   `trymercury.xyz/?ref=<slug>` by a meta refresh. `?preview` stayed on the page to check the unfurl.
   X takes no image from an intent link, so "Share on X" opened a compose window whose URL unfurled
   into the card.
6. **The gate.** It had to live inside Privy: `sendCode` goes from the browser straight to Privy,
   so nothing in our API can stand in front of it. `pnpm --filter @mercury/api allowlist` pushed
   the whole table to Privy's allowlist each run. Privy upserts, so re-sending was free.
7. **Waves.** From midnight IST on 10 October 2026, one wave every six hours. The first admitted
   everyone already listed; each later wave took whoever joined since. The web app read the first
   wave from `VITE_FIRST_WAVE` so a slipped launch was a config change, not a release.
8. **Launch email.** `pnpm --filter @mercury/api beta-mail` sent "Mercury is live" in signup order,
   with `--preview`, `--test <email>`, a dry run by default and `--go` to send. Each send stamped
   `waitlist.beta_mailed_at`, so a run that died halfway could restart without mailing anyone twice.
9. **Admin.** `GET /admin/waitlist` (JSON, or `?format=csv`) and `POST /admin/waitlist/welcome` to
   re-send one person's welcome email, both behind `WAITLIST_ADMIN_TOKEN`, and a 404 when unset.

## Data model

`waitlist`, created by migrations `0004_waitlist`, `0011_waitlist_card` and `0014_beta_mailed_at`,
and still in the database:

| Column           | Type              | Notes                                                                |
| ---------------- | ----------------- | -------------------------------------------------------------------- |
| `id`             | uuid              | Primary key                                                          |
| `email`          | text              | Lower-cased; unique                                                  |
| `name`           | text, null        | Shown on the card only when there is no handle                       |
| `country`        | text              | English name, as sent by both forms                                  |
| `created_at`     | timestamptz       | Decides the signup's wave                                            |
| `position`       | serial            | Place in line from 1; unique. The first 500 were the founding cohort |
| `handle`         | text, null        | X handle without `@`                                                 |
| `slug`           | text              | Random; unique; the share link's name                                |
| `background`     | text, null        | Card photo file name; null falls back to one chosen by position      |
| `beta_mailed_at` | timestamptz, null | When the launch email went                                           |

## Design

### The founding card

- 1200 × 630, X's large-image ratio, which email clients also show well.
- Drawn with **Satori** (layout to SVG) and **resvg-wasm** (SVG to PNG), server-side, on demand,
  cached a day. Layout from the design file `cardcollayoutref.svg`.
- **Type:** ABC Diatype Regular and Medium, as TTF (Satori cannot read WOFF2). Every text box has a
  line height of 1, so the baseline sits 0.85 × size below the box top; positions were set by
  baseline from the design.
- **Layers:** a full-bleed blurred photo (one of ten, never the same as the previous signup's), a
  left-to-right shade (`rgba(0,0,0,.28)` → `.12` at 45% → clear at 75%) so text reads on bright
  photos, then the white logo at 64,64 (180 × 40).
- **Text:** "Early access" (founding) or "On the list" at 24px `#D4D4D4`; the number `#612` at 134px
  `#FCFCFF` with "/ 500" at 40px beside it for the founding cohort; the handle (or name) at 36px;
  "Money that stays invested and spendable." at 24px; "trymercury.xyz" at 20px, right-aligned.
  All medium weight, letter-spacing −0.02em.
- **Assets** in `services/api/assets/card/`: `backgrounds/card-01.jpg` to `card-10.jpg`,
  `fonts/ABCDiatype-{Regular,Medium}.ttf`, `logo.svg` (for the card), `wordmark.svg` (the white
  wordmark for the email badge). The fonts and the logo are still used by the `og-image` and
  `price-gap` scripts, and `card-05.jpg` by `og-image`; all three now live in
  `services/api/assets/brand/`, the photo as `og-photo.jpg`.

### The emails

- Built in tables with every colour inline, because that is all most clients read. A
  `prefers-color-scheme: dark` block overrides the same colours by class (`mx-bg`, `mx-fg`,
  `mx-muted`, `mx-label`, `mx-line`, `mx-btn`, `mx-fine`). Gmail ignores it and shows light.
- **Light:** background `#ffffff`, text `#141614`, muted `#4f554d`, label `#7a8077`, rule `#e4e7e1`,
  fine print `#7f867c`, button `#141614` on white. **Dark:** background `#0f120f`, text `#f1f3ef`,
  muted `#b5bbb2`, label `#848b81`, rule `#262b25`, button white on `#0f120f`.
- System font stack, 30px medium headline at −0.03em, 15px body, one pill button (999px radius).
- The welcome email carried the card as an inline attachment (`cid:card`) and no other image: a
  logo above the headline was a second attachment and a spam signal for no gain. The launch email
  had no images at all, so it read as a letter rather than a campaign.
- Both sent `List-Unsubscribe` (Gmail and Yahoo file bulk mail without it as spam) and replied to
  `hello@trymercury.xyz`.

### The sign-in sheet step

Built from the app's design system (`ds-*` tokens, `Button`, `Select`, `Dialog`): the clock was three
boxes styled like the code-entry boxes (60px tall, `bg-ds-panel`, 26px tabular digits) with digits
rolled by `@number-flow/react`, and the tick isolated in its own component so the sheet did not
repaint every second. Optional fields came last, because they only enriched the card.

### The landing form

Four fields and a button on one row wherever they fit; a native `<select>` restyled with no OS
chrome; status messages hung below the form out of flow, so a message never moved anything. After
signing up, the card opened in a top-layer `<dialog>` with a sheen played over it, a preview of
the X post, and Share / Download actions. The signup was remembered in `localStorage` so a return
visit showed the card instead of the form.

## Lessons the code carried

- **Look the email up before inserting.** An insert that loses to the unique index still spends a
  number from the sequence, which left a gap in the line.
- **Await side effects on a function host.** Vercel stops the process once the response is sent,
  so the welcome email was awaited, and its failure was logged without losing the signup.
- **A random slug, not the position, in public URLs**, or the list can be enumerated.
- **The gate belongs to the identity provider** when the client talks to it directly.
- **One stamp in the database for "already emailed"**, not a file beside the sender: two senders
  have to agree.

## Restoring the code

Everything below is at the commit above. To bring a file or folder back:

```bash
git checkout a52ad7ba20425aa7c2de2e26e7177327041b071a -- <path>
```

| Path                                                          | What it was                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `services/api/src/routes/waitlist.ts`, `waitlist.test.ts`     | The routes: join, card image, share page, admin export and re-send |
| `services/api/src/waitlist/card.ts`, `card.test.ts`           | The founding card renderer and wave rules                          |
| `services/api/src/waitlist/share.ts`                          | The share page and the welcome email                               |
| `services/api/src/waitlist/beta.ts`                           | The "Mercury is live" email                                        |
| `services/api/scripts/allowlist-waitlist.ts`                  | Push the list to Privy's allowlist                                 |
| `services/api/scripts/beta-mail.ts`                           | Send the launch email                                              |
| `services/api/scripts/waitlist-local.ts`                      | The waitlist alone on in-memory Postgres, emails written to disk   |
| `services/api/assets/card/`                                   | Card photos, fonts, logo and wordmark                              |
| `apps/web/src/api/waitlist.ts`                                | The web app's client for `POST /waitlist`                          |
| `apps/web/src/auth/AuthModal.tsx`                             | The sign-in sheet, with its invite-only step                       |
| `apps/web/src/auth/waves.ts`, `waves.test.ts`, `countries.ts` | Wave clock and the country list                                    |
| `apps/landing/src/components/Waitlist.astro`                  | The landing form and the card dialog                               |

Wiring that also went: the route in `services/api/src/app.ts`, `WaitlistDeps` and the
`WAITLIST_ADMIN_TOKEN` / `WAITLIST_PUBLIC_URL` config in `services/api/src/deps.ts`, the card files
copied by `services/api/scripts/build-vercel.mjs`, `VITE_WAITLIST_API_URL` in the web app's
Dockerfile, and `site.api` in the landing config. Shared links to `/f/:slug` now redirect to
trymercury.xyz.
