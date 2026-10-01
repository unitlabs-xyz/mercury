/**
 * The design tokens, tracking `apps/web/src/tokens.css`.
 *
 * Copied rather than imported: the web's are CSS custom properties and only a
 * browser reads those. Names match one for one, so a change there is a findable
 * change here.
 *
 * The shape — colour, spacing, radius, type — follows the reference app's
 * `src/theme`, because that organisation survived a real app and this one is
 * about to need the same things.
 */
export const color = {
  /* page and furniture */
  page: "#F3F3F3",
  surface: "#FFFFFF",
  shell: "#F7F6F2",
  ink: "#171717",
  muted: "#656565",
  faint: "#9A9A9A",
  divider: "#E6E6E6",
  panel: "#F7F7F7",
  tile: "#F3F3F3",
  chevron: "#5C5C5C",
  link: "#007681",

  /* movement. The chip tints are the web's `--color-ds-*-chip`. */
  up: "#1D7D1F",
  upTint: "#E2F4E9",
  down: "#C0442F",
  downTint: "#FBECE9",
  warn: "#925A0A",
  warnTint: "#FDF3D9",

  /* brand */
  brand: "#0F7480",
  brandDeep: "#0B5C66",
  brandTint: "#E5F4F5",

  /* the dark band between the two home cards, and anything that sits on it */
  band: "#171717",
  onBand: "#FFFFFF",
} as const;

export const space = { xs: 4, sm: 8, md: 12, screen: 20, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, card: 28, pill: 999 } as const;

/**
 * ABC Diatype, the brand face, the same outlines the web serves — converted
 * from its woff2 to the ttf a phone can load. Diatype has nothing between
 * Medium and Bold, so 600 takes Medium rather than jumping to Bold, exactly as
 * the `@font-face` block in `tokens.css` declares.
 *
 * React Native does not synthesise a weight from a family the way a browser
 * does, so the weight IS the family name here. Nothing in the app sets
 * `fontWeight`; it sets `fontFamily`.
 */
export const font = {
  regular: "Diatype",
  medium: "DiatypeMedium",
  bold: "DiatypeBold",
} as const;

/**
 * Weight carries the hierarchy as much as size does, which is the web's rule
 * too. Tracking is -2% of the size, as `AppShell` sets for the whole dashboard;
 * the display sizes take a little more, because tracking that reads as tight at
 * 15px reads as loose at 44.
 */
export const type = {
  /** The onboarding headline. Three stacked lines, flush left. */
  display: { fontFamily: font.bold, fontSize: 44, lineHeight: 48, letterSpacing: -1.5 },
  /** The balance. `HeroBalance` overrides the size to fit the width. */
  hero: { fontFamily: font.medium, fontSize: 44, lineHeight: 50, letterSpacing: -1.4 },
  title: { fontFamily: font.medium, fontSize: 24, lineHeight: 29, letterSpacing: -0.5 },
  figure: { fontFamily: font.medium, fontSize: 20, lineHeight: 24, letterSpacing: -0.4 },
  headline: { fontFamily: font.medium, fontSize: 16, lineHeight: 20, letterSpacing: -0.32 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, letterSpacing: -0.3 },
  label: { fontFamily: font.medium, fontSize: 14, lineHeight: 18, letterSpacing: -0.28 },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, letterSpacing: -0.26 },
  tiny: { fontFamily: font.medium, fontSize: 12, lineHeight: 15, letterSpacing: -0.2 },
  /** Over-small caps, for a tile's heading. Tracking goes positive here. */
  over: { fontFamily: font.medium, fontSize: 10, lineHeight: 12, letterSpacing: 0.6 },
} as const;
