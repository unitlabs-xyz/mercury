import { Section } from "../ui/Section";
import { Clock } from "../ui/icons";

export const MarketHours = () => (
  <Section inner="grid items-center gap-12 py-[76px] lg:grid-cols-[1fr_0.9fr] lg:gap-16">
    <div>
      <h2 className="text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[40px]">
        Open every hour. Priced as though the exchange were open.
      </h2>
      <p className="mt-[18px] max-w-[52ch] text-[16px] leading-[1.6] text-muted text-pretty">
        The US market trades about a third of the week. These tokens trade all of it. While the
        exchange is shut nobody can create or redeem them against real shares, so the price can
        drift — and once in a while it dislocates badly.
      </p>
      <p className="mt-4 max-w-[52ch] text-[16px] leading-[1.6] text-muted text-pretty">
        Most apps ignore that. Harbor shows the last real share price, and when a token is trading
        more than one percent above it, offers to place the order for when it comes back in line
        instead of filling at the inflated one.
      </p>
      <p className="mt-6 border-l-2 border-brand pl-4 text-[17px] leading-[1.5] font-semibold text-balance">
        We buy you shares at the real price, not the panic price.
      </p>
    </div>

    <article className="rounded-2xl border border-cardline bg-white p-6 sm:p-7">
      <div className="flex items-center justify-between gap-4 border-b border-hair pb-4">
        <span className="stamp">US MARKET</span>
        <span className="flex items-center gap-2 rounded-full bg-warn-tint px-2.5 py-1 text-[12px] font-semibold text-warn">
          <Clock className="size-3.5" />
          Closed · weekend
        </span>
      </div>

      <dl className="grid gap-3.5 pt-4">
        {[
          { k: "Real share price, last close", v: "$222.33", tone: "" },
          { k: "NVDAx trading now", v: "$226.90", tone: "" },
          { k: "Premium against the real price", v: "+2.06%", tone: "text-down" },
        ].map((row) => (
          <div key={row.k} className="flex items-baseline justify-between gap-4">
            <dt className="text-[14px] text-muted">{row.k}</dt>
            <dd className={`font-mono text-[14px] font-semibold ${row.tone}`}>{row.v}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 rounded-xl bg-shell p-4 text-[13px] leading-[1.55] text-ink-soft">
        Above tolerance. Harbor offers to wait and fill at $222.33 when the market reopens on
        Monday at 9:30 AM New York time — the order rests on chain, whether or not the app is open.
      </p>
    </article>
  </Section>
);
