/**
 * Where the front door sends someone signed in: back to where they were
 * headed before being asked to sign in, or the portfolio. Either way with the
 * query the link carried, so a link from the phone ("Manage on web",
 * `?wallet=…&move=1`) still opens what it asked for after the hop.
 */
export const landingAfterSignIn = (state: unknown, search: string): string => {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === "string" && from.startsWith("/") ? from : `/portfolio${search}`;
};

/** What to remember of a page someone was sent away from to sign in: its path and its query. */
export const returnTo = (location: { readonly pathname: string; readonly search: string }): string =>
  `${location.pathname}${location.search}`;
