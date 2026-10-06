# Assets

Two homes, and the difference matters.

**`src/assets/` — anything Astro should optimise.** Photographs, blurred backdrops,
product screenshots, textures. Import the file, pass it to `<Media>` or `<Image>`, and
the build converts it to WebP, emits a hashed filename, writes `srcset` for the widths
that are actually used, and sets `width`/`height` so the page never shifts as it loads.
A file in here that nothing imports is never shipped.

**`public/` — anything that needs a fixed, guessable URL.** Favicons, the OG image
(social crawlers fetch a literal URL and will not follow a hash), `robots.txt`,
third-party logos as SVG. Files here are copied to the output byte for byte: no
optimisation, no hashing, no dead-file pruning.

> Rule of thumb: if a _person_ reaches it through the page, `src/assets`. If a
> _machine_ reaches it by typing the URL, `public`.

## Where each kind goes

| What                                              | Where                     | Notes                                                                                                                                                       |
| ------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Section artwork, hero, blurred backdrops          | `src/assets/backgrounds/` | The big photographic panels                                                                                                                                 |
| Product screenshots, UI crops                     | `src/assets/ui/`          | Export at 2× the slot's CSS width                                                                                                                           |
| Grain, paper, noise, fabric                       | `src/assets/textures/`    | Tileable. A generated grain already exists — see below                                                                                                      |
| Our own mark, in-page illustrations               | `src/assets/brand/`       | Import an SVG and render it as a component: `import Logo from "…/Logo.svg"` then `<Logo />`. It inlines, so it costs no request and can take `currentColor` |
| Web fonts (`.woff2`)                              | `src/assets/fonts/`       | Declared in `styles/global.css`; hashed by the build                                                                                                        |
| Partner and issuer logos                          | `public/logos/`           | SVG. Backed, Ondo, xStocks, Solana and Privy are already here                                                                                               |
| Favicons, `og-mercury-v2.png`, `site.webmanifest` | `public/`                 | Fixed names, referenced in `Base.astro`                                                                                                                     |

## Using one

```astro
---
import Media from "../Media.astro";
import field from "../../assets/backgrounds/hero-field.jpg";
---

<!-- Plain artwork -->
<Media label="Hero image" src={field} alt="Morning light across a field" ratio="2.2 / 1" priority />

<!-- A blurred backdrop with a card on top of it -->
<Media label="Yield tile" src={field} blur texture ratio="5 / 4">
  <div class="absolute inset-x-4 bottom-4 rounded-[14px] bg-white/92 p-4">…</div>
</Media>
```

`<Media>` props: `src` `alt` `blur` `texture` `ratio` `position` `priority` `sizes` `tone`.
`blur` takes `true` (24px) or a number. `priority` belongs on the hero image and
nothing else. Drop `src` entirely and you get the gradient placeholder back.

`sizes` defaults to `(min-width: 1024px) 50vw, 100vw`, which is right for the
two-up and three-up slots. A panel that spans the band — the hero, the portfolio
strip — should pass `sizes="100vw"` so the browser does not pick an image half the
width it needs.

## Sizing and format

- **Photographs:** JPEG or WebP in, 2400px on the long edge is plenty. The build makes
  the smaller sizes; shipping a 6000px original just slows the build down.
- **Screenshots:** PNG, exported at twice the width the slot renders at. A card tile is
  about 420px wide on a large screen, so 840px.
- **Textures:** PNG or WebP, tileable, 256–512px square. Keep them to a few KB — a
  texture that costs 300KB is a texture nobody waits for.
- **Logos and diagrams:** SVG. Run them through SVGO and strip the editor metadata.
- **Anything blurred:** export it _small_. A backdrop under a 24px blur can be 600px
  wide and nobody can tell, which makes it the cheapest image on the page.

## The grain

`class="grain"` (in `styles/global.css`) lays a generated noise over a surface at 22%
with `overlay` blending — no file, no request. `<Media texture>` applies it. Replace the
`background-image` in that utility with a real texture from `src/assets/textures/` if
you want a photographed one.

## Naming

Lowercase, hyphenated, and named for what it _is_ rather than where it currently sits:
`hero-field.jpg`, not `section-1-bg.jpg`. Artwork gets moved; sections get renumbered.
