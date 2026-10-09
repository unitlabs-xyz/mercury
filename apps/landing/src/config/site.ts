/**
 * Everything about the site that is not a section of the page.
 * Section copy lives at the top of each component in `src/components/sections`.
 */
export const site = {
  name: "Mercury",
  // The landing domain. It feeds canonical URLs, OG tags and the sitemap.
  url: "https://trymercury.xyz",
  // The web app, open in beta. The hero and the bar send people here first;
  // the waitlist stays for anyone not yet let in.
  app: "https://beta.trymercury.xyz",
  // The API the waitlist form posts to. Set PUBLIC_API_URL on the Vercel project;
  // unset, it is the API running locally.
  api: (import.meta.env.PUBLIC_API_URL ?? "http://localhost:8787").replace(/\/$/, ""),
  // Where every "join" button scrolls to: the form in the closing band.
  waitlist: "#waitlist",
  tagline: "The financial account built for the onchain world.",
  description:
    "Hold stablecoins, buy tokenized US shares, spend with a card, and borrow against what you own — all from a wallet you control.",
  locale: "en",
  twitter: "@trymercury_",
  socials: [{ label: "X", href: "https://x.com/trymercury_" }],
};

export const nav = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Baskets", href: "#baskets" },
  { label: "Card", href: "#card" },
  { label: "FAQs", href: "#faqs" },
] as const;

// Links without an href are pages that do not exist yet: shown, not clickable.
export const footerNav: readonly { heading: string; links: readonly { label: string; href?: string }[] }[] = [
  {
    heading: "Explore",
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Baskets", href: "#baskets" },
      { label: "FAQs", href: "#faqs" },
    ],
  },
  {
    heading: "Company",
    links: [{ label: "About" }, { label: "Contact" }],
  },
  {
    heading: "Follow",
    links: site.socials,
  },
  {
    heading: "Legal",
    links: [{ label: "Terms" }, { label: "Privacy" }],
  },
];
