# @mercury/landing

The marketing site. **Astro 7 on bun**, static output, Tailwind 4 on the same design
tokens the app uses.

```bash
bun install
bun run dev        # http://localhost:3000
bun run build      # static HTML into dist/
bun run preview
bun run typecheck  # astro check
```

From the repo root: `pnpm dev:landing` and `pnpm build:landing` shell into here and
call bun, so you never have to remember which installer owns this app.

> This app is **outside the pnpm workspace** (`!apps/landing` in `pnpm-workspace.yaml`)
> so pnpm and bun never fight over `node_modules`. It therefore has no
> `workspace:*` dependencies, and `turbo build` at the root does not include it.

## Why Astro

Every route ships as prerendered HTML with no client JavaScript unless a component
asks for it. The FAQ accordion and the mobile menu are `<details>` elements, so the
page currently ships **zero** bytes of JS.

## Layout

```
src/
  pages/index.astro         The page: eight sections, in order
  layouts/Base.astro        <head>, SEO, JSON-LD, header and footer
  components/
    sections/               One file per band of the page
    Band.astro              Full-width band, content in the 1000px column
    Button.astro            ink · primary · secondary · onDark
    Media.astro             Artwork slot, gradient placeholder until the asset lands
    Header.astro Footer.astro Wordmark.astro Check.astro
  config/
    site.ts                 Brand name, domain, nav, footer links, meta
    faqs.ts                 FAQ copy — also feeds the FAQPage JSON-LD
  styles/global.css         Design tokens + utilities (mirrors apps/web/src/tokens.css)
  assets/                   Artwork the build optimises — see src/assets/README.md
    backgrounds/ ui/ textures/ brand/ fonts/
public/                     Fixed URLs only: favicons, og-image, robots.txt, logos/
```

## Where the artwork goes

`src/assets/` for anything a person sees through the page — photographs, blurred
backdrops, screenshots, textures. Import it and pass it to `<Media>`: the build emits
WebP, a hashed name, a `srcset`, and the dimensions that stop the page shifting.

`public/` for anything a machine fetches by URL — favicons, `og-image.png`,
`robots.txt`, partner logos.

[src/assets/README.md](src/assets/README.md) has the table, the sizes to export at,
and the `<Media>` props.

**Section copy lives in a `content` object at the top of each section component.**
Open the file, edit the object, leave the markup alone.

## Placeholders to replace

- `site.url` in `src/config/site.ts` — feeds canonical URLs, OG tags and the sitemap,
  and is also hardcoded in `public/robots.txt`.
- The mark in `Wordmark.astro`.
- Every `<Media>` — they render a gradient and carry a `data-placeholder` attribute
  naming what belongs there. Import a file from `src/assets` and pass it as `src`.
  Find them with `grep -rn "<Media" src`.
- `public/og-image.png` is the app's, not the landing's.

## Design

`DESIGN.md` at the repo root is the system: warm paper ground, hairlines instead of
shadows, Harbour Teal on under a tenth of the screen, tabular figures. `global.css`
here and `apps/web/src/tokens.css` are two copies of one token set — change both.

Three deliberate differences from the app, so nobody "corrects" them back:

- **One 1000px column.** Every band's ground runs edge to edge, but its content sits
  in the shared `column` utility — 1000px, centred, so the page reads as a single
  vertical run. It insets 20/40px below 1100px and is not otherwise responsive yet.

- **Ground is `#f7f7f5`**, not the app's Fresh Sheet `#f7f6f2`, and the whole page is
  that one colour. White is for cards, not for bands.
- **Tabular figures are opt-in**, via the `figures` utility, where DESIGN.md puts
  them on `body`. Diatype's `tnum` also swaps the space for a figure-width one, so
  globally it stretches every gap between words. Never put `figures` on prose.
- **Type is ABC Diatype and TT Artnik**, not Instrument Sans. Body, UI and figures are
  Diatype (`font-sans`); titles are Artnik (`font-display`, applied by the `display`
  and `headline` utilities); tickers and stamps stay JetBrains Mono.

### The fonts, and two catches

Files live in `src/assets/fonts` and are declared in `styles/global.css`. Diatype is
subset to Latin — 75KB to 19KB a weight — so if you ever need glyphs outside that
range, re-subset from the source `.otf` rather than editing the woff2.

1. **TT Artnik Demo has 55 characters: A–Z, a–z and a space.** No digits, no full
   stop, no comma, no apostrophe. Every other character falls through to Diatype, so a
   heading like "Everything your money does, in one account." sets its letters in
   Artnik and its comma and full stop in Diatype. Live it with, avoid punctuation in
   titles, or license the full family.
2. **Both faces are unlicensed builds.** Diatype reports its own family name as
   "ABC Diatype Unlicensed Trial" (Dinamo); Artnik is TypeType's demo. Fine to design
   against, not fine to ship — buy the licences before this goes to a real domain.
