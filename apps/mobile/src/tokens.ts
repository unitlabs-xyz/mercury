/**
 * The palette, tracking `apps/web/src/tokens.css`.
 *
 * Copied rather than imported: the web's tokens are CSS custom properties,
 * which only a browser reads. The names match one for one so a change there is
 * a findable change here, and the comment above each group says which block of
 * that file it mirrors.
 */
export const c = {
  /* the page and its furniture */
  page: "#F3F3F3",
  white: "#FFFFFF",
  ink: "#171717",
  muted: "#656565",
  divider: "#E6E6E6",
  panel: "#F7F7F7",
  chevron: "#5C5C5C",
  link: "#007681",

  /* movement */
  up: "#1D7D1F",
  down: "#C0442F",

  /* brand */
  brand: "#0F7480",
  brandDeep: "#0B5C66",
} as const;

/** The type scale the web header uses, in points rather than rem. */
export const t = {
  hero: 36,
  title: 24,
  figure: 20,
  body: 15,
  label: 14,
  small: 13,
  tiny: 12,
} as const;
