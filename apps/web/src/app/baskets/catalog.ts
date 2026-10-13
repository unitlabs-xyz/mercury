import type { BasketTag } from "@mercury/types";
import { visibleStrategies, type ShelfBasket } from "@mercury/view";

/** Shared blurred, right-revealing treatment for theme artwork. */
const THEME_MASK = "linear-gradient(to right, transparent 0%, #000 72%)";
export const THEME_ART_TREATMENT = {
  filter: "blur(2px)",
  transform: "scale(1.04)",
  opacity: 0.82,
  maskImage: THEME_MASK,
  WebkitMaskImage: THEME_MASK,
} as const;

export const themes: readonly {
  tag: BasketTag;
  title: string;
  description: string;
  image: string;
}[] = [
  {
    tag: "theme:technology",
    title: "Technology",
    description: "Computing and the next generation internet.",
    image: "/baskets/themes/1.webp",
  },
  {
    tag: "theme:energy",
    title: "Energy",
    description: "Powering a changing world.",
    image: "/baskets/themes/7.webp",
  },
  {
    tag: "theme:defense",
    title: "Defense",
    description: "Security for a more stable tomorrow.",
    image: "/baskets/themes/4.webp",
  },
  {
    tag: "theme:consumer",
    title: "Consumer",
    description: "The brands people live with.",
    image: "/baskets/themes/2.webp",
  },
  {
    tag: "theme:finance",
    title: "Finance",
    description: "The future of financial services.",
    image: "/baskets/themes/6.webp",
  },
  {
    tag: "theme:hard-assets",
    title: "Hard assets",
    description: "Materials and real-world infrastructure.",
    image: "/baskets/themes/3.webp",
  },
  {
    tag: "theme:healthcare",
    title: "Healthcare",
    description: "Science and modern medicine.",
    image: "/baskets/themes/5.webp",
  },
];

export const investors = [
  { slug: "nancy-pelosi-tracker", image: "/baskets/investors/3.webp" },
  { slug: "warren-buffett-tracker", image: "/baskets/investors/4.webp" },
  { slug: "cathie-wood-tracker", image: "/baskets/investors/1.webp" },
  { slug: "leopold-aschenbrenner-tracker", image: "/baskets/investors/2.webp" },
] as const;

/* Shared with the phone: @mercury/view's baskets.ts. */
export { displayBasketName } from "@mercury/view";

export const curatedShelves = (templates: readonly ShelfBasket[]) => ({
  themes: themes.map((theme) => ({
    ...theme,
    count: templates.filter((template) => template.tags.includes(theme.tag)).length,
  })),
  pros: investors
    .map((investor) => ({ ...investor, template: templates.find((item) => item.slug === investor.slug) }))
    .filter((item): item is typeof item & { template: ShelfBasket } => item.template !== undefined)
    .map((item) => ({ ...item.template, image: item.image })),
  featured: templates.filter((template) => template.tags.includes("shelf:featured")),
});

export { visibleStrategies };

/**
 * A strategy matches on anything a person might type for it: its own name and
 * blurb, its themes, the tickers it holds, and those tickers' company names
 * once the market read has them. The search spans the whole catalog, so a
 * ticker found on the featured shelf still turns up the strategies behind it.
 */
export { searchStrategies } from "@mercury/view";

/** Only ask the market API for logos that discovery currently shows. */
export const discoveryLogoTickers = (
  templates: readonly ShelfBasket[],
  selected: BasketTag | null,
  showAll: boolean,
) => [
  ...new Set(
    [
      ...templates.filter((item) => item.tags.includes("shelf:pros")),
      ...visibleStrategies(templates, selected, showAll),
    ]
      .flatMap((item) => [...item.allocations].sort((a, b) => b.weightBps - a.weightBps).slice(0, 5))
      .map((asset) => asset.ticker),
  ),
];
