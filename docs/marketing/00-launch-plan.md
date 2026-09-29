# Mercury · Launch marketing plan (X first, Instagram second)

Written 29 September 2026. Covers the tease, the Colosseum submission (11–12 Oct), the judging
window (to 23 Oct), and what comes after. Landing CTA switches from Login to **Join the waitlist**.

---

## 1 · What we are saying

**One line:** Your investment account, in your own wallet, open every hour of the week.

**Plain version:** Hold stablecoins, buy real US stocks and ETFs, put money into ready-made
baskets, invest on a schedule. Later: borrow against what you own, and spend with a card
without selling.

**Message ladder** (reveal in this order; each phase adds one rung):

| Rung           | Message                                                                                                          | Proof we can show                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1. The problem | Tokenized stocks are real, but the same share can cost you 7x through the wrong token, and nothing warns you     | `docs/01-evidence.md`, Finding 2               |
| 2. The product | An investment account in your wallet: stocks, baskets, recurring, one portfolio                                  | The web app                                    |
| 3. The edge    | We check both issuers on every order; we wait rather than fill at a weekend premium; we count shares, not tokens | Issuer comparison, queue state, exposure sheet |
| 4. The trust   | Your wallet, your keys. Leaving is trivial and we say so                                                         | Custody section, send flow                     |
| 5. The future  | Borrow without selling. Spend without selling. Creator baskets                                                   | Roadmap only, labelled "coming"                |

**Lead with investing, not the card.** The Colosseum page and the landing hero lead with
spending and the Mercury Visa, but the card is version two at the earliest. Marketing the card
first sets up a promise the waitlist cannot redeem. Card = rung 5, always marked "coming".

---

## 2 · Guardrails (from PRODUCT.md, non-negotiable in public)

- **No invented traction.** No user counts, testimonials, "thousands on the waitlist", partner
  logos. Protocols are _named_ (Jupiter, Kamino, Symmetry, Backed, Ondo), never implied as partners.
- **Re-run every number the day it is posted.** The evidence doc says so itself. Always state the
  order size ("on a $1,000 buy") and the date read. Screenshot the raw quote and keep it.
- **No return figures, no yield promises.** Returns are placeholders in the product. The 4.1%
  cash rate moves; don't put it in a post that lives forever.
- **Don't oversell the premium gate.** Weekend drift is usually under 0.15%. The gate is
  insurance, not a daily saving. The wrapper problem (Finding 2) is the strong story.
- **Jurisdictions.** Backed and Ondo tokens are not offered to US persons, among others. Don't
  target US users with "buy stocks here"; the audience is global crypto holders outside the
  restricted list. Check issuer terms before any paid promotion. (Not legal advice.)
- **Name collision.** Mercury (mercury.com) is a large US fintech with a card. "Mercury card"
  will be confused with theirs, and search is theirs. Always pair the name with context
  ("Mercury, on Solana", @trymercury_). Get a trademark check done before spending on brand.

---

## 3 · Fix before the first post

- [ ] `apps/landing/src/config/site.ts`: `twitter` is `"@mercury"` → change to `"@trymercury_"`
      (OG/Twitter cards currently credit someone else's handle).
- [ ] Landing hero eyebrow says **"Open now"** → change to waitlist wording; primary CTA → waitlist.
- [ ] Pillars "Spend" and "Borrow" cards: add a "Coming" stamp.
- [ ] Waitlist form: email (required), wallet address (optional), one question —
      _"What would you buy first?"_ (free text). That answer is research and content.
- [ ] Confirmation screen with a share-to-X link prefilled with the teaser line.
- [ ] OG image: the issuer-comparison card on true black.
- [ ] X bio: `An investment account that lives in your wallet. Real US stocks, onchain. Building for @colosseum. Waitlist ↓` + trymercury.xyz
- [ ] Instagram bio: same line, link to waitlist, handle as close to `trymercury` as available.
- [ ] Founder accounts (Rakesh, Sainath, Adithya) add "building @trymercury_" to bios.

---

## 4 · Phases

### Phase 1 · Tease (30 Sep – 5 Oct)

Goal: people know the problem exists and that someone is fixing it. Product barely shown.

| Date       | X                                                                                                                                                                             | Instagram                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Wed 30 Sep | **Post 1**: the Nvidia wrapper post (below). Pin it.                                                                                                                          | Same fact as a 3-slide carousel          |
| Thu 1 Oct  | "Your broker closes Friday at 4pm. Your wallet doesn't." + blurred app shot                                                                                                   | Story: countdown sticker                 |
| Sat 3 Oct  | Weekend post: live screenshot of the market-closed banner, "US market is shut. These tokens aren't. Here's what that does to price." Short thread with real Saturday readings | Reel: 10s screen recording of the banner |
| Mon 5 Oct  | Multiplier explainer: "You don't hold 58 Nvidia tokens. You hold 22 shares."                                                                                                  | Carousel: "tokens ≠ shares"              |

### Phase 2 · Build in public (6 – 10 Oct)

Goal: show it working, real money, small sizes. One 15–30s clip per day.

- Buy $5 of NVDAx end to end, real fill, transaction link in reply.
- The three outcomes: filled / queued / refused. "Most apps only design the first one."
- A basket invested in one action, held as one token.
- The exposure sheet: two wrappers, one true position.
- Founders reply under every post with the "why" behind the screen (ADRs make great replies).

### Phase 3 · Submission (11 – 12 Oct)

- **11 Oct:** launch thread, 6–8 posts, the 4-minute demo video native on X (not a YouTube link),
  GitHub link (open source is a judging criterion and a credibility signal on CT), waitlist.
- Quote-post from all three founder accounts, spaced a few hours apart across time zones.
- Instagram: cut-down 45s reel of the demo + carousel of the five differentiators.

### Phase 4 · Judging window (13 – 23 Oct)

- Waitlist count and the "what would you buy first?" answers become the traction slide
  in the business plan. Real numbers only.
- Post the most interesting (anonymised) answers: "Most asked-for first buy so far: …"
- One post per ADR decision people argue about ("Why we will never build margin").

### Phase 5 · After (Nov onward)

Roadmap reveals, one rung at a time: gifting a holding by link → borrowing without selling
(with the Monday-gap risk stated up front) → the card → creator baskets.

---

## 5 · Content pillars (reuse forever)

1. **The wrapper problem** — same stock, different tokens, different price. Our sharpest story.
2. **Open all week** — the weekend gap, the queue, why we wait.
3. **Shares, not tokens** — multipliers, dividends as shares gained.
4. **Things we refuse to build** — no margin, no perps, no candlesticks. Contrarian and on-voice.
5. **Your wallet, your exit** — self-custody, leaving is trivial.

Voice: plain, specific, names what's wrong. Every number has a date and a source. No emojis
stacks, no "gm", no "LFG", no "revolutionising finance".

---

## 6 · X playbook

- **Link in the first reply, not the post.** Keep the post itself text + one image/clip.
- **Tag the protocols when we use them**, factually: @JupiterExchange for routing, @KaminoFinance
  for credit, @symmetry_fi for baskets, @xStocksFi / @OndoFinance for issuers,
  @colosseum for the hackathon. (Verify each handle before posting.) Naming them is on-brand and
  they sometimes repost builders.
- **Founder accounts do the reach, brand account does the record.** Posts from people outperform
  posts from a logo with zero followers. Brand posts; founders quote with a personal line.
- **Reply work, 20 min a day:** under tokenized-stocks news, xStocks/Ondo announcements, and
  Colosseum posts, add something specific (a measurement, a screenshot), never a pitch.
- **Timing:** Solana CT skews US/EU. 7:30–10:30pm IST (US morning, EU evening) for main posts.
- **Cadence:** 1 main post a day + replies. Threads only when there's data.

## 7 · Instagram playbook

Instagram's audience is less crypto-native, so explain more, jargon less.

- **Carousels** for explainers (problem → why → what Mercury does), 3–6 slides, true black,
  Geist, one green. Match the product exactly.
- **Reels** of the real app, 10–30s, captions burned in, no talking head needed.
- **Stories** for countdowns, polls ("Would you buy stocks from your wallet?"), waitlist link sticker.
- Aim for 3 feed posts a week, stories daily during Phases 1–3.

---

## 8 · What we measure

| Metric                                         | Why                                              |
| ---------------------------------------------- | ------------------------------------------------ |
| Waitlist signups (and % with a wallet address) | Traction for judges; wallet = real crypto holder |
| Signups per post (UTM per post)                | Which pillar actually converts                   |
| X profile visits / followers per post          | Reach of the tease                               |
| "What would you buy first?" answers            | Decides baskets and future content               |

UTM every link: `?utm_source=x&utm_campaign=tease&utm_content=post1`.

---

## 9 · Post copy, ready to use

### Post 1 · X (recommended first post)

> Same Nvidia share.
> Two tokens on Solana.
>
> Buy $1,000 through one: ~$222 a share.
> Through the other: ~$1,524.
>
> Nothing on screen tells you which is which.
>
> We're building the investment account that checks, every time.
>
> Mercury. Soon.

Image: two rows on true black, "Backed · NVDAx $222.33/share · 0.02% impact · BEST" and
"Ondo · NVDAon $1,523.66/share · 85% impact · AVOIDED", with "Jupiter quotes, $1,000 buy,
read <date>" in small type.
First reply: `Waitlist: trymercury.xyz?utm_source=x&utm_campaign=tease&utm_content=post1`
**Re-run the quote the morning you post and update both numbers and the date.**

### Alternate A · pure tease (less info, more mood)

> Your broker closes Friday at 4pm.
> Your wallet doesn't.
>
> Mercury — an investment account that lives in your wallet.

### Alternate B · product-first

> Own Nvidia from your wallet.
> No bank. No paperwork. $5 to start.
>
> Mercury. Waitlist open.

### Instagram · carousel for Post 1

1. "Same share. Two prices." (big type)
2. "Nvidia exists as two different tokens on Solana."
3. The comparison card, with source and date.
4. "Pick the wrong one and you overpay. Nothing warns you."
5. "Mercury checks both, every order. Waitlist in bio."

Caption: _Tokenized stocks let anyone with a crypto wallet own real US shares. But the same
share can trade as different tokens at very different prices. We're building the investment
account that picks the right one for you. Waitlist link in bio._

---

## 10 · Validation teasers (replaces Post 1 as the opener)

Goal: ask, don't announce. Mercury is named only in the bio, never pitched in the post.
2–4 tags per post, tag people _in a reply_ ("curious what @x and @y think") rather than stacking
10 handles in the post, which X treats as spam and suppresses. Verify every handle before posting.

| #   | Post                                                                                                           | Format                                                                      | Validates                         | Tag                              |
| --- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------- | -------------------------------- |
| 1   | If you already hold USDC, would you buy real US stocks from the same wallet?                                   | Poll: Yes, already do / Yes if it was easy / No, I use a broker / No, never | Core demand                       | @xStocksFi @OndoFinance          |
| 2   | Same share. Two tokens. Different price. Which do you buy? (NVDAx vs NVDAon, prices shown, no answer)          | Image quiz, answer in a reply 24h later                                     | Wrapper problem awareness         | @JupiterExchange                 |
| 3   | Onchain stocks don't need another trading terminal. They need a boring brokerage account. Agree?               | Hot take                                                                    | Investing-not-trading positioning | @solana @colosseum               |
| 4   | It's Saturday. US market is shut. Your tokenized Nvidia is trading. Buy now or wait for Monday's price?        | Poll, post on a weekend                                                     | Queue / premium gate              | @xStocksFi @PythNetwork          |
| 5   | Pick 5 stocks you'd hold for 10 years without looking. Best answers become a basket.                           | Open reply thread                                                           | Basket demand + content           | Quote-tag 3–4 investors you know |
| 6   | Would you rather sell your stocks to pay for something, or borrow against them and keep them?                  | Poll                                                                        | V2 borrowing / card               | @KaminoFinance                   |
| 7   | Outside the US: what's actually stopped you from owning US stocks?                                             | Poll: Can't open an account / Fees / Minimums / Never thought about it      | Global thesis                     | Founder accounts only            |
| 8   | Building something for people who hold crypto but want to own real companies. What's the one thing it must do? | Open question                                                               | Feature priorities                | @colosseum                       |

---

## 11 · Intro posts (the very first week, before any polls or data)

Introduce Mercury as a brand and an idea. Little detail, no numbers.

- **A · Mark reveal:** wordmark on true black, text: "soon." Pin it.
- **B · The question:** "What if your money never had to choose between growing and being spendable? We've been working on an answer. Mercury. Soon."
- **C · Two lines:** "Money that grows. Money you can spend. Right now you pick one. Mercury — soon."
- **D · Open all week:** "Stock markets close on Friday. Your wallet never does. Mercury is coming."
- **E · Not this:** "Not an exchange. Not a trading app. Not a bank. Something you'd actually keep your money in. Mercury."
- **F · Idle USDC:** "Your USDC is just sitting there. It could own a piece of Nvidia. Mercury — soon."
- **G · Hello:** "Hello, world. We're Mercury. An investment account that lives in your wallet. More soon."
- **H · Founder intro (Rakesh's account):** why we're building it, what it is in one line, building for @colosseum, "tell us what you think".

Order: A → B → E → G → H, then section 10's validation posts.
Instagram: A, B, C as the first three grid posts so they read as one row.
