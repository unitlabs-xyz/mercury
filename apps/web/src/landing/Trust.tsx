import type { ReactNode } from "react";
import { Clock, Layers, Lock, Shield } from "../ui/icons";

const CARDS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <Shield className="size-5" />,
    title: "Real shares, real custodians",
    body: "Every token is backed one-for-one by stock held at a regulated custodian, published daily.",
  },
  {
    icon: <Lock className="size-5" />,
    title: "Your keys, your account",
    body: "Harbor is an interface. It cannot move, freeze or borrow against anything you hold.",
  },
  {
    icon: <Layers className="size-5" />,
    title: "Spread across issuers",
    body: "Hold the same stock through both issuers. Harbor adds it up and warns when one holds too much.",
  },
  {
    icon: <Clock className="size-5" />,
    title: "Refused, not filled badly",
    body: "When no route is usable at your size, the order is turned down and nothing is spent.",
  },
];

export const Trust = () => (
  <section className="gutter grid items-center gap-12 border-y border-rule bg-white py-[76px] lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
    <div>
      <p className="eyebrow mb-4">WHO HOLDS WHAT</p>
      <h2 className="text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[40px]">
        Built so nobody has to trust us.
      </h2>
      <div className="mt-[26px] grid h-50 place-items-center rounded-[14px] border border-dashed border-dash bg-[repeating-linear-gradient(135deg,var(--color-shell)_0_8px,#fff_8px_16px)]">
        <span className="px-4 text-center font-mono text-[11px] tracking-[0.08em] text-faint">
          ISOMETRIC ILLUSTRATION — CUSTODY CHAIN
        </span>
      </div>
    </div>

    <div className="grid overflow-hidden rounded-2xl border border-cardline sm:grid-cols-2">
      {CARDS.map((card, i) => (
        <div
          key={card.title}
          className={`p-7 ${i % 2 === 0 ? "sm:border-r sm:border-hair" : ""} ${
            i < 2 ? "border-b border-hair" : "max-sm:border-b max-sm:border-hair last:border-b-0"
          }`}
        >
          <span className="block text-brand">{card.icon}</span>
          <h3 className="mt-3.5 text-[16px] font-semibold">{card.title}</h3>
          <p className="mt-[7px] text-[14px] leading-[1.55] text-muted text-pretty">{card.body}</p>
        </div>
      ))}
    </div>
  </section>
);
