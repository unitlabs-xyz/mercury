import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AssetRow, Bar, Card, Glyph, Screen, SectionTitle } from "../ui/primitives";
import { MarketBanner } from "../components/MarketBanner";
import { BASKETS, INSTRUMENTS } from "../mock/data";
import { pct, usd } from "../lib/format";

export function Invest() {
  const nav = useNavigate();
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const needle = q.trim().toUpperCase();
    if (needle === "") return INSTRUMENTS;
    return INSTRUMENTS.filter((i) => i.ticker.includes(needle) || i.name.toUpperCase().includes(needle));
  }, [q]);

  const movers = useMemo(
    () => [...INSTRUMENTS].sort((a, b) => Math.abs(b.changePct24h) - Math.abs(a.changePct24h)).slice(0, 3),
    [],
  );

  return (
    <Screen>
      <Bar title="Invest" />
      <div className="px-4 pt-1">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
          className="w-full rounded-[var(--radius-pill)] bg-[var(--color-surface)] px-4 py-3 text-[15px] outline-none placeholder:text-[var(--color-faint)]" />
      </div>

      <MarketBanner />

      {q === "" && (
        <>
          <section className="mt-6">
            <SectionTitle>Baskets</SectionTitle>
            <div className="flex gap-2.5 overflow-x-auto px-4 pb-1">
              {BASKETS.map((b) => (
                <div key={b.slug} className="w-[230px] shrink-0">
                  <Card onClick={() => nav(`/basket/${b.slug}`)} className="h-full">
                    <Glyph text={b.name} tint="#00d26b" />
                    <p className="m-0 mt-3 text-[16px] font-semibold">{b.name}</p>
                    <p className="m-0 mt-1 text-[13px] leading-snug text-[var(--color-muted)]">{b.tagline}</p>
                    <p className="num m-0 mt-3 text-[14px] font-semibold text-[var(--color-up)]">
                      {pct(b.performance12m)} <span className="font-normal text-[var(--color-faint)]">12 months</span>
                    </p>
                  </Card>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <SectionTitle>Biggest movers</SectionTitle>
            <div className="flex flex-col gap-2 px-4">
              {movers.map((i) => (
                <AssetRow key={i.ticker} icon={<Glyph text={i.ticker} />} title={i.name} sub={i.sector}
                  value={usd(Number(i.pricePerShare))} foot={pct(i.changePct24h)}
                  tone={i.changePct24h >= 0 ? "up" : "down"} onClick={() => nav(`/stock/${i.ticker}`)} />
              ))}
            </div>
          </section>
        </>
      )}

      <section className="mt-6">
        <SectionTitle>{q === "" ? "All stocks" : `${results.length} results`}</SectionTitle>
        <div className="flex flex-col gap-2 px-4">
          {results.map((i) => (
            <AssetRow key={i.ticker} icon={<Glyph text={i.ticker} />} title={i.name}
              sub={`${i.ticker} · ${i.wrappers.length} ${i.wrappers.length === 1 ? "issuer" : "issuers"}`}
              value={usd(Number(i.pricePerShare))} foot={pct(i.changePct24h)}
              tone={i.changePct24h >= 0 ? "up" : "down"} onClick={() => nav(`/stock/${i.ticker}`)} />
          ))}
        </div>
      </section>
    </Screen>
  );
}
