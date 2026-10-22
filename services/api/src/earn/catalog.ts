/**
 * Mercury's picks: offered first, in this order, with our own words beside
 * them. Every other USDC vault on Kamino that clears the bar in `directory.ts`
 * is offered after these, as Kamino lists it.
 *
 * Kamino lists over a hundred USDC vaults. Most are small, new, or lend into
 * markets a person cannot judge from a name. These eight were chosen on
 * 18 October 2026 from Kamino's own figures: over a million dollars in, a
 * history, many depositors, a known curator, and a sponsored deposit that
 * simulated cleanly. What each lends into was read off the chain that day.
 *
 * Left out on purpose: the 7–8% vaults (private credit, commodities, single
 * borrowers), vaults under a million dollars, and two that refused a deposit
 * when tested (Elemental USDC Turbo, Neutral Trade USDC Max Yield).
 *
 * `kind` is what the money is lent against, which is the risk worth knowing:
 * loans against crypto (liquidated on-chain when collateral falls), or credit
 * to real-world borrowers through OnRe, Huma and others (repaid off-chain).
 * `blurb` is ours, not the curator's. `logo` is a file the web app ships; the
 * curator's own mark, or none where the curator is not named. The first is
 * the default.
 */
export interface VaultListing {
  readonly address: string;
  readonly curator: string | null;
  readonly kind: "crypto" | "real-world" | "mixed";
  readonly blurb: string;
  readonly logo: string | null;
}

export const EARN_VAULTS: readonly VaultListing[] = [
  {
    address: "HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E",
    curator: "Steakhouse Financial",
    kind: "crypto",
    blurb: "Loans against SOL, Bitcoin and JLP on Kamino's largest markets.",
    logo: "steakhouse",
  },
  {
    address: "3SMNuqK7m13KorY9gX8DzjQAVXGbhgRVni65Pk6LTBgC",
    curator: "Solana Mobile",
    kind: "crypto",
    blurb: "All in Kamino's main market: loans against SOL and Bitcoin.",
    logo: "solanamobile",
  },
  {
    address: "3DBvs2MraKsXoLdSGsQDue3RUQKxM6dp5KWWC6PWtUcg",
    curator: "Squads",
    kind: "crypto",
    blurb: "All in Kamino's main market: loans against SOL and Bitcoin.",
    logo: "squads",
  },
  {
    address: "BEEfo7xwgK2ZP13Pxo7qqTPzAteKJmXjVWtMWcXSvbn2",
    curator: "Steakhouse Financial",
    kind: "mixed",
    blurb: "Mostly SOL and Bitcoin loans, with some tokenized funds.",
    logo: "steakhouse",
  },
  {
    address: "A1USdzqDHmw5oz97AkqAGLxEQZfFjASZFuy4T6Qdvnpo",
    curator: "Allez Labs",
    kind: "mixed",
    blurb: "Spread wide: OnRe reinsurance, stablecoin credit and crypto loans.",
    logo: "allez",
  },
  {
    address: "2TNCzzYJt3uHmpFpqeeJkza4pQUK9xoLa79DJH9AdgGA",
    curator: "Marinade",
    kind: "mixed",
    blurb: "Mostly OnRe reinsurance credit, the rest SOL and Bitcoin loans.",
    logo: "marinade",
  },
  {
    address: "DWSXb18xZApz29vnQpgR2m6MynCT7PznaXt7Ut7M7KaP",
    curator: null,
    kind: "real-world",
    blurb: "Real-world credit through OnRe and Huma.",
    logo: null,
  },
  {
    address: "EPC2N3AAv84P9TKsnDt2x41p6T7c5vTewBhQbh4RVx4r",
    curator: "MEV Capital",
    kind: "real-world",
    blurb: "All in OnRe reinsurance credit.",
    logo: "mevcapital",
  },
];

/**
 * Who runs a vault Mercury did not pick, read off its name. Kamino lists no
 * curator, but curators name their vaults after themselves ("Gauntlet
 * Frontier", "Galaxy USDC"), and a name nobody recognises keeps no logo.
 * The marks ship with the web app under /earn.
 */
export const CURATORS: readonly {
  readonly match: RegExp;
  readonly curator: string;
  readonly logo: string | null;
}[] = [
  { match: /steakhouse/i, curator: "Steakhouse Financial", logo: "steakhouse" },
  { match: /\bkamino\b/i, curator: "Kamino", logo: "kamino" },
  { match: /gauntlet/i, curator: "Gauntlet", logo: "gauntlet" },
  { match: /galaxy/i, curator: "Galaxy", logo: "galaxy" },
  { match: /\bre7\b/i, curator: "Re7 Labs", logo: "re7" },
  { match: /hyperithm/i, curator: "Hyperithm", logo: "hyperithm" },
  { match: /allez/i, curator: "Allez Labs", logo: "allez" },
  { match: /marinade/i, curator: "Marinade", logo: "marinade" },
  { match: /mev capital/i, curator: "MEV Capital", logo: "mevcapital" },
  { match: /squads/i, curator: "Squads", logo: "squads" },
  { match: /solana mobile/i, curator: "Solana Mobile", logo: "solanamobile" },
  { match: /elaris/i, curator: "Elaris", logo: null },
];

export const curatorOf = (name: string) => CURATORS.find((c) => c.match.test(name)) ?? null;

/**
 * Never offered. Both refused a sponsored deposit with the vault program's
 * error 7026 when tested on 18 October 2026 — closed to new money — and a
 * vault nobody can deposit into is not a choice.
 */
export const HIDDEN_VAULTS: ReadonlySet<string> = new Set([
  "A3hTCWdnfV6uiQLxRmnv17EpiEtmc93v1AGQnWy44Mup", // Elemental USDC Turbo
  "67dqmR76uAbjX6e81A1ganKv3ou31WUMEdeWJkwVfeXy", // Neutral Trade USDC Max Yield
]);
