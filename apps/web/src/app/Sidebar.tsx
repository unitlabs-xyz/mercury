import type { ReactNode } from "react";
import { AnchorMark } from "../ui/Logo";
import { Card, Cog, Grid, Help, List, PieChart, Repeat, Shield, Trend } from "../ui/icons";
import { ISSUER_MIX } from "./data";

type Item = { icon: ReactNode; label: string; current?: boolean };

const NAV: Item[] = [
  { icon: <PieChart className="size-[17px]" />, label: "Portfolio", current: true },
  { icon: <Trend className="size-[17px]" />, label: "Invest" },
  { icon: <Grid className="size-[17px]" />, label: "Baskets" },
  { icon: <Repeat className="size-[17px]" />, label: "Recurring" },
  { icon: <Card className="size-[17px]" />, label: "Money" },
  { icon: <List className="size-[17px]" />, label: "Activity" },
];

const FOOT: Item[] = [
  { icon: <Cog className="size-[17px]" />, label: "Settings" },
  { icon: <Help className="size-[17px]" />, label: "Help" },
];

/** Only Portfolio is built; the rest are inert until their screens exist. */
const NavItem = ({ item }: { item: Item }) => (
  <button
    type="button"
    aria-current={item.current ? "page" : undefined}
    aria-disabled={item.current ? undefined : true}
    className={`flex w-full items-center gap-[11px] rounded-[9px] px-3 py-2.5 text-left text-[14px] transition-colors ${
      item.current
        ? "bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(27,26,23,0.06)]"
        : "font-medium text-muted hover:bg-white/60 hover:text-ink"
    }`}
  >
    <span className={item.current ? "text-brand" : "text-faint"}>{item.icon}</span>
    {item.label}
  </button>
);

export const Sidebar = () => (
  <aside className="flex w-[236px] shrink-0 flex-col border-r border-navline px-4 pt-[26px] pb-5">
    <a href="/" className="mb-[26px] flex items-center gap-2.5 px-2.5">
      <span className="grid size-7 place-items-center rounded-lg bg-brand text-white">
        <AnchorMark className="size-4" />
      </span>
      <span className="text-[17px] font-semibold tracking-[-0.01em]">Harbor</span>
    </a>

    <nav className="flex flex-col gap-0.5">
      {NAV.map((item) => (
        <NavItem key={item.label} item={item} />
      ))}
    </nav>

    <section className="mt-7 rounded-xl border border-cardline bg-white/70 p-3.5">
      <p className="mb-2.5 flex items-center gap-1.5">
        <Shield className="size-[13px] text-faint" />
        <span className="stamp text-[10px]">ISSUER MIX</span>
      </p>
      <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full">
        {ISSUER_MIX.map((m, i) => (
          <span
            key={m.name}
            style={{ width: `${m.share}%` }}
            className={i === 0 ? "rounded-l-full bg-brand" : "rounded-r-full bg-brand-soft"}
          />
        ))}
      </div>
      <p className="mt-2.5 flex justify-between text-[12px] text-muted">
        {ISSUER_MIX.map((m) => (
          <span key={m.name}>
            {m.name} {m.share}%
          </span>
        ))}
      </p>
    </section>

    <div className="mt-auto flex flex-col gap-0.5 pt-6">
      {FOOT.map((item) => (
        <NavItem key={item.label} item={item} />
      ))}
    </div>
  </aside>
);
