import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnchorMark } from "../ui/Logo";
import { Card, Clock, Cog, Grid, Help, List, PieChart, Repeat, Trend } from "../ui/icons";
import { useSession } from "../market/hooks";


export type NavKey =
  | "portfolio"
  | "invest"
  | "baskets"
  | "recurring"
  | "money"
  | "activity";

type Item = { key: NavKey | "settings" | "help"; icon: ReactNode; label: string; to?: string };

const NAV: Item[] = [
  { key: "portfolio", icon: <PieChart className="size-[17px]" />, label: "Portfolio", to: "/portfolio" },
  { key: "invest", icon: <Trend className="size-[17px]" />, label: "Invest", to: "/invest" },
  { key: "baskets", icon: <Grid className="size-[17px]" />, label: "Baskets" },
  { key: "recurring", icon: <Repeat className="size-[17px]" />, label: "Recurring" },
  { key: "money", icon: <Card className="size-[17px]" />, label: "Money", to: "/money" },
  { key: "activity", icon: <List className="size-[17px]" />, label: "Activity", to: "/activity" },
];

const FOOT: Item[] = [
  { key: "settings", icon: <Cog className="size-[17px]" />, label: "Settings" },
  { key: "help", icon: <Help className="size-[17px]" />, label: "Help" },
];

const MarketStamp = () => {
  const session = useSession();
  const open = session.data?.isOpen === true;
  const when = open ? session.data?.nextClose : session.data?.nextOpen;
  return (
    <section className="mt-7 rounded-xl border border-cardline bg-white/70 p-3.5">
      <p className="flex items-center gap-1.5">
        <span
          className={`size-[7px] shrink-0 rounded-full ${open ? "bg-up" : "bg-faint"}`}
          aria-hidden
        />
        <span className="stamp">{open ? "Market open" : "Market closed"}</span>
      </p>
      <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-[1.45] text-muted">
        <Clock className="mt-px size-3.5 shrink-0 text-faint" />
        {when
          ? `${open ? "Closes" : "Opens"} ${when.toLocaleString("en-US", {
              weekday: "short",
              hour: "numeric",
              minute: "2-digit",
              timeZone: "America/New_York",
              timeZoneName: "short",
            })}`
          : "Checking the exchange calendar"}
      </p>
    </section>
  );
};

const style = (current: boolean) =>
  `flex w-full items-center gap-[11px] rounded-[9px] px-3 py-2.5 text-left text-[14px] transition-colors ${
    current
      ? "bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(27,26,23,0.06)]"
      : "font-medium text-muted hover:bg-white/60 hover:text-ink"
  }`;

/** Items without a route are inert until their screen exists. */
const NavItem = ({ item, current }: { item: Item; current: boolean }) => {
  const body = (
    <>
      <span className={current ? "text-brand" : "text-faint"}>{item.icon}</span>
      {item.label}
    </>
  );
  return item.to ? (
    <Link to={item.to} aria-current={current ? "page" : undefined} className={style(current)}>
      {body}
    </Link>
  ) : (
    <button type="button" aria-disabled className={style(false)}>
      {body}
    </button>
  );
};

export const Sidebar = ({ current }: { current: NavKey }) => (
  <aside className="flex w-[236px] shrink-0 flex-col border-r border-navline px-4 pt-[26px] pb-5">
    <Link to="/" className="mb-[26px] flex items-center gap-2.5 px-2.5">
      <span className="grid size-7 place-items-center rounded-lg bg-brand text-white">
        <AnchorMark className="size-4" />
      </span>
      <span className="text-[17px] font-semibold tracking-[-0.01em]">Harbor</span>
    </Link>

    <nav className="flex flex-col gap-0.5">
      {NAV.map((item) => (
        <NavItem key={item.key} item={item} current={item.key === current} />
      ))}
    </nav>

    <MarketStamp />

    <div className="mt-auto flex flex-col gap-0.5 pt-6">
      {FOOT.map((item) => (
        <NavItem key={item.key} item={item} current={false} />
      ))}
    </div>
  </aside>
);
