/**
 * Everything about the site that is not a section of the page.
 * Section copy lives at the top of each component in `src/components/sections`.
 */
export const site = {
  name: "Mercury",
  // The landing domain. It feeds canonical URLs, OG tags and the sitemap.
  url: "https://trymercury.xyz",
  // The web app, open in beta. Every call to action on the page sends people here.
  app: "https://beta.trymercury.xyz",
  // The API the waitlist form posts to. Set PUBLIC_API_URL on the Vercel project;
  // unset, it is the API running locally.
  api: (import.meta.env.PUBLIC_API_URL ?? "http://localhost:8787").replace(/\/$/, ""),
  // The tagline, description and every other word live in src/i18n, per language.
  twitter: "@trymercury_",
  socials: [{ label: "X", href: "https://x.com/trymercury_" }],
};

// Labels are keys into the dictionary's `nav` and `footer`, so the links are
// defined once and read in every language.
export const nav = [
  { key: "howItWorks", href: "#how-it-works" },
  { key: "baskets", href: "#baskets" },
  { key: "card", href: "#card" },
  { key: "faqs", href: "#faqs" },
] as const;

// Links without an href are pages that do not exist yet: shown, not clickable.
export const footerNav = [
  {
    heading: "explore",
    links: [
      { key: "howItWorks", href: "#how-it-works" },
      { key: "baskets", href: "#baskets" },
      { key: "faqs", href: "#faqs" },
    ],
  },
  { heading: "company", links: [{ key: "about" }, { key: "contact" }] },
  { heading: "follow", links: site.socials.map((s) => ({ label: s.label, href: s.href })) },
  { heading: "legal", links: [{ key: "terms" }, { key: "privacy" }] },
] as const;
