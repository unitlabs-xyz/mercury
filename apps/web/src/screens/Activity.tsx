import { AssetRow, Bar, Glyph, Screen, SectionTitle } from "../ui/primitives";
import { ACTIVITY, type ActivityItem } from "../mock/data";
import { dayOf, signed, when } from "../lib/format";

const GLYPH: Record<ActivityItem["kind"], { text: string; tint: string }> = {
  buy: { text: "↓", tint: "#3b82f6" },
  sell: { text: "↑", tint: "#f59e0b" },
  basket: { text: "◆", tint: "#00d26b" },
  dividend: { text: "+", tint: "#00d26b" },
  receive: { text: "→", tint: "#a78bfa" },
  queued: { text: "◷", tint: "#ffb020" },
};

export function Activity() {
  const days = ACTIVITY.reduce<Record<string, ActivityItem[]>>((acc, item) => {
    (acc[dayOf(item.at)] ??= []).push(item);
    return acc;
  }, {});

  return (
    <Screen>
      <Bar title="Activity" />
      {Object.entries(days).map(([day, items], i) => (
        <section key={day} className="mt-3 enter" style={{ animationDelay: `${i * 40}ms` }}>
          <SectionTitle>{day}</SectionTitle>
          <div className="flex flex-col gap-2 px-4">
            {items.map((item) => (
              <AssetRow key={item.id}
                icon={<Glyph text={GLYPH[item.kind].text} tint={GLYPH[item.kind].tint} />}
                title={item.title} sub={item.subtitle}
                value={item.amountUsd === null ? "—" : signed(item.amountUsd)}
                foot={when(item.at).split(", ")[1]} />
            ))}
          </div>
        </section>
      ))}
      <p className="m-0 px-4 pt-6 text-center text-[13px] text-[var(--color-faint)]">
        Every line here is a transaction you can open on chain.
      </p>
    </Screen>
  );
}
