/**
 * Everything about the site that is not a section of the page.
 * Section copy lives at the top of each component in `src/components/sections`.
 */
export const site = {
  name: "Mercury",
  // The landing domain. It feeds canonical URLs, OG tags and the sitemap.
  url: "https://trymercury.xyz",
  // The web app. Nothing links to it while signup is a waitlist. Its own domain
  // (app.trymercury.xyz) once DNS points there; the Vercel address until then.
  app: "https://mercury-web-nine.vercel.app/",
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
    heading: "Follow",
    links: site.socials,
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
    ],
  },
] as const;
