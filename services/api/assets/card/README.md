# Founding card assets

Read at runtime by `src/waitlist/card.ts`, and copied beside the function by
`scripts/build-vercel.mjs`.

- `backgrounds/` — the blurred photos a card is drawn on. Drop in any `.jpg` or
  `.png`, ideally 1200 × 630 or larger. Each signup is given one at random, and
  keeps it: the file name is stored on their row, so adding or removing a photo
  later never changes a card someone has already shared.
- `fonts/` — ABC Diatype, as TTF (the renderer cannot read WOFF2).
- `logo.svg` — the logo drawn on the card, cut from the layout file (`cardcollayoutref.svg`).
- `wordmark.svg` — the white wordmark the welcome email puts on its badge.
