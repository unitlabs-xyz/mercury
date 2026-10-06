import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useBasketTemplate } from "../api/basket-templates";
import { useInstruments } from "../market/hooks";
import { ArrowRight } from "../ui/icons";
import { AppShell } from "./AppShell";
import { AssetIcon } from "./baskets/AssetIcon";
import { displayBasketName, themes } from "./baskets/catalog";

const percent = (basisPoints: number) => `${(basisPoints / 100).toFixed(2).replace(/\.00$/, "")}%`;

export const Basket = () => {
  const { slug = "" } = useParams();
  const result = useBasketTemplate(slug);
  const template = result.data;
  const tickers = useMemo(() => template?.allocations.map((item) => item.ticker) ?? [], [template]);
  const instruments = useInstruments(tickers);
  const instrumentsByTicker = useMemo(
    () => new Map((instruments.data ?? []).map((item) => [item.ticker, item])),
    [instruments.data],
  );
  const theme = themes.find((item) => template?.tags.includes(item.tag));
  const name = template ? displayBasketName(template.name) : "Basket";

  return (
    <AppShell current="baskets" title={name} quiet>
      <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-2 text-[13px] text-ds-muted">
        <Link to="/baskets" className="hover:text-ds-ink">
          Baskets
        </Link>
        <span aria-hidden>›</span>
        <span className="text-ds-ink">{name}</span>
      </nav>
      {result.isLoading ? (
        <div className="rounded-xl bg-white px-6 py-12 text-center text-ds-muted">Loading strategy…</div>
      ) : !template ? (
        <div className="rounded-xl bg-white px-6 py-12 text-center">
          <p className="font-medium text-ds-ink">This strategy is unavailable</p>
          <Link to="/baskets" className="mt-3 inline-block text-[13px] text-blue-600">
            Back to baskets
          </Link>
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <header
              style={theme ? { backgroundImage: `url(${theme.image})` } : undefined}
              className="rounded-xl border border-white bg-white bg-cover bg-center px-6 py-8 shadow-sm sm:px-9"
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Glider managed portfolio · Solana
              </p>
              <h2 className="mt-3 max-w-xl text-[32px] leading-tight font-medium text-ds-ink">{name}</h2>
              <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-slate-600">
                {template.description}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/75 px-3 py-1.5 text-[12px] text-ds-ink">
                  {template.allocations.length} assets
                </span>
                <span className="rounded-full bg-white/75 px-3 py-1.5 text-[12px] text-ds-ink">
                  Daily rebalancing
                </span>
                <span className="rounded-full bg-white/75 px-3 py-1.5 text-[12px] text-ds-ink">
                  {template.canEnroll ? "Available" : "Preview"}
                </span>
              </div>
            </header>
            <section
              aria-label="Target holdings"
              className="overflow-hidden rounded-xl bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[19px] font-medium text-ds-ink">Target holdings</h2>
                <p className="text-[12px] text-ds-muted">Weights can drift between rebalances</p>
              </div>
              <ul className="mt-4 divide-y divide-ds-divider">
                {[...template.allocations]
                  .sort((a, b) => b.weightBps - a.weightBps)
                  .map((asset) => (
                    <li key={asset.assetId} className="flex items-center gap-3 py-3.5">
                      <AssetIcon
                        asset={asset}
                        source={instrumentsByTicker.get(asset.ticker)}
                        className="size-9 shrink-0 rounded-full bg-ds-panel object-contain"
                      />
                      <span className="min-w-0 flex-1 text-[14px] font-medium text-ds-ink">
                        {asset.ticker}
                      </span>
                      <span className="text-[13px] text-ds-muted">{percent(asset.weightBps)}</span>
                      <span aria-hidden className="h-1.5 w-24 overflow-hidden rounded-full bg-ds-panel">
                        <span
                          className="block h-full rounded-full bg-slate-500"
                          style={{ width: `${asset.weightBps / 100}%` }}
                        />
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          </div>
          <aside className="space-y-5">
            <section className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="text-[18px] font-medium text-ds-ink">How this works</h2>
              <p className="mt-3 text-[13px] leading-relaxed text-ds-muted">
                Glider creates a portfolio in your own smart account. Its strategy sets target weights and
                rebalances daily. This is not one pooled basket token.
              </p>
              <p className="mt-4 rounded-lg bg-ds-panel p-3 text-[12px] leading-relaxed text-ds-muted">
                This strategy is a preview. Enrollment and deposits are not available in Mercury yet.
              </p>
            </section>
            {template.performance && (
              <section className="rounded-xl bg-white p-6 shadow-sm">
                <h2 className="text-[18px] font-medium text-ds-ink">Modeled strategy performance</h2>
                <p className="mt-2 text-[12px] leading-relaxed text-ds-muted">
                  Glider model, not this portfolio’s live return. As of{" "}
                  {new Date(template.performance.asOf).toLocaleDateString()}.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {template.performance.windows.map((window) => (
                    <div key={window.window} className="rounded-lg bg-ds-panel p-3">
                      <p className="text-[11px] uppercase text-ds-muted">{window.window}</p>
                      <p className="mt-1 text-[17px] font-medium text-ds-ink">
                        {Number(window.percentChange) > 0 ? "+" : ""}
                        {Number(window.percentChange).toFixed(2)}%
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-ds-muted">
                  Modeled history is not a guarantee of future results.
                </p>
              </section>
            )}
            <Link
              to="/baskets"
              className="inline-flex items-center gap-2 text-[13px] font-medium text-blue-600"
            >
              Explore more strategies
              <ArrowRight className="size-4" />
            </Link>
          </aside>
        </div>
      )}
    </AppShell>
  );
};
