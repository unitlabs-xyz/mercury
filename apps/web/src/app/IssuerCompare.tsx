/**
 * The issuers, by the name a person would use.
 *
 * This file used to hold a second issuer-comparison table, rendered only by the
 * buy dialog. It predated the design system and kept its own everything:
 * uppercase column headers, monospace symbols, a solid green chip, and a white
 * card nested inside the dialog's white card. `stock/Routes.tsx` renders the
 * same decision on the page, so the dialog uses that instead — one table, one
 * set of facts, one way of showing them. What is left is the mapping four
 * screens still need.
 */
export const ISSUER_NAME = { backed: "Backed", ondo: "Ondo" } as const;
