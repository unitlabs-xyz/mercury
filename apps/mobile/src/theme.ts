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
  ink: "#171717",
  muted: "#656565",
  divider: "#E6E6E6",
  panel: "#F7F7F7",
  chevron: "#5C5C5C",
  link: "#007681",

  /* movement */
  up: "#1D7D1F",
  down: "#C0442F",
  warn: "#925A0A",
  warnTint: "#FDF3D9",

  /* brand */
  brand: "#0F7480",
  brandDeep: "#0B5C66",
  brandTint: "#E5F4F4",
} as const;

export const space = { xs: 4, sm: 8, md: 12, screen: 20, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

/**
 * Weight carries the hierarchy as much as size does, which is the web's rule
 * too: the headline figure is 600 at 36, and a label is 500 at 14. Nothing here
 * is 700 — the web app has no bold.
 */
export const type = {
  hero: { fontSize: 36, fontWeight: "600", letterSpacing: -0.8 },
  title: { fontSize: 24, fontWeight: "600", letterSpacing: -0.3 },
  figure: { fontSize: 20, fontWeight: "600", letterSpacing: -0.3 },
  headline: { fontSize: 16, fontWeight: "600", letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: "400", letterSpacing: -0.1 },
  label: { fontSize: 14, fontWeight: "500", letterSpacing: -0.1 },
  small: { fontSize: 13, fontWeight: "400", letterSpacing: 0 },
  tiny: { fontSize: 12, fontWeight: "500", letterSpacing: 0 },
} as const;
