import { Link } from "react-router-dom";
import { MercuryLogo } from "../ui/Logo";
import { AccountMenu } from "./AccountMenu";
import { HeaderChrome } from "./HeaderChrome";

/*
 * "admin" is a page, not a nav item: it is deliberately absent from NAV below,
 * so the bar shows nothing for it and no item reads as active while it is
 * open. Its way in is the account menu, and only when the API says so.
 */
export type NavKey = "portfolio" | "invest" | "baskets" | "money" | "activity" | "admin";

type Item = { key: NavKey; label: string; to: string };

/** Text only, as in the design: the current section is ink, the rest muted. */
const NAV: Item[] = [
  { key: "portfolio", label: "Portfolio", to: "/portfolio" },
  { key: "invest", label: "Invest", to: "/invest" },
  { key: "baskets", label: "Baskets", to: "/baskets" },
  { key: "money", label: "Money", to: "/money" },
  { key: "activity", label: "Activity", to: "/activity" },
];

const style = (current: boolean) =>
  `shrink-0 text-[15px] font-medium whitespace-nowrap transition-colors ${
    current ? "text-ds-ink" : "text-ds-muted hover:text-ds-ink"
  }`;

const NavItem = ({ item, current }: { item: Item; current: boolean }) => (
  <Link to={item.to} aria-current={current ? "page" : undefined} className={style(current)}>
    {item.label}
  </Link>
);

const Nav = ({ current, className }: { current: NavKey; className: string }) => (
  <nav aria-label="Main" className={className}>
    {NAV.map((item) => (
      <NavItem key={item.key} item={item} current={item.key === current} />
    ))}
  </nav>
);

/** A 1px × 28px rule between groups of controls, as in the design. */
const Divider = () => <span aria-hidden className="hidden h-7 w-px bg-ds-divider sm:block" />;

/**
 * The app's one bar, to the nav design: logo, then the sections as plain text
 * 32px apart; on the right the global controls and the account, 12px apart
 * with a rule between them. Below `lg` the sections drop to a
 * second, scrollable row rather than hiding, so every screen stays one tap away.
 */
export const TopBar = ({ current }: { current: NavKey }) => (
  <header className="sticky top-0 z-30 border-b border-ds-divider bg-page/55 backdrop-blur-md backdrop-saturate-150">
    {/* The rule runs edge to edge; everything inside keeps 40px sides and 16px above and below. */}
    <div className="px-5 sm:px-10">
      <div className="flex w-full items-center py-4">
        <Link
          to="/portfolio"
          className="flex shrink-0 items-center text-ds-ink"
          aria-label="Mercury, portfolio"
        >
          <MercuryLogo className="h-7 w-auto" />
        </Link>

        <Nav current={current} className="ml-12 hidden items-center gap-8 lg:flex" />

        <div className="ml-auto flex items-center gap-3">
          <HeaderChrome />
          <Divider />
          <AccountMenu />
        </div>
      </div>

      <Nav
        current={current}
        className="flex items-center gap-7 overflow-x-auto pb-3 [scrollbar-width:none] lg:hidden"
      />
    </div>
  </header>
);
