/**
 * Everything about the site that is not a section of the page.
 * Section copy lives at the top of each component in `src/components/sections`.
 */
export const site = {
  name: "Mercury",
  // The landing domain. It feeds canonical URLs, OG tags and the sitemap.
  url: "https://trymercury.xyz",
  // The web app, where Login and every "get started" button go. Its own domain
  // (app.trymercury.xyz) once DNS points there; the Vercel address until then.
  app: "https://mercury-web-nine.vercel.app/",
  tagline: "The financial account built for the onchain world.",
  description:
    "Hold stablecoins, buy tokenized US shares, spend with a card, and borrow against what you own — all from a wallet you control.",
  locale: "en",
  twitter: "@mercury",
} as const;

export const nav = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Baskets", href: "#baskets" },
  { label: "Card", href: "#card" },
  { label: "FAQs", href: "#faqs" },
] as const;

export const footerNav = [
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
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
    ],
  },
] as const;
