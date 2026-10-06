import { useMemo, useRef, useState } from "react";
import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import type { ManagedBasketTemplate } from "@mercury/types";
import { usd, usdCompact } from "@mercury/view";
import { Link, useParams } from "react-router-dom";
import { basketEnrollmentEnabled, useBasketEnrollment, useBasketEnrollmentAction, useBasketInsights, useBasketTemplate } from "../api/baskets";
import { useHistories, useInstruments, usePrices, type Instrument } from "../market/hooks";
import { Chevron, GlideTable, MoveChip, RailCard, RailHead, RangeSwitch, StatusChip } from "../ui/ds";
import { AppShell } from "./AppShell";
import { DotChart } from "./DotChart";
import { AssetIcon } from "./baskets/AssetIcon";
import { allocationRows } from "./baskets/allocation";
import { displayBasketName } from "./baskets/catalog";
import { EnrollmentRail } from "./baskets/EnrollmentRail";
import { EnrollmentSheet } from "./baskets/EnrollmentSheet";
import { modeledSeries } from "./baskets/performance";

type Range = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "All";
const RANGES: readonly Range[] = ["1D", "1W", "1M", "3M", "6M", "1Y", "All"];
const WINDOW: Record<Range, string> = {
  "1D": "1d",
  "1W": "1w",
  "1M": "1m",
  "3M": "3m",
  "6M": "6m",
  "1Y": "12m",
  All: "all",
};
const weight = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.00$/, "")}%`;
const returnLabel = (value: string) => `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)}%`;
const TILE_TONES = [
  "bg-[#e9f2ed]",
  "bg-[#e9edf5]",
  "bg-[#f4eee7]",
  "bg-[#eeeaf4]",
  "bg-[#e7f1f1]",
  "bg-[#f3f1e9]",
  "bg-ds-tag",
];

const IconCluster = ({
  template,
  instruments,
}: {
  template: ManagedBasketTemplate;
  instruments: ReadonlyMap<string, Instrument>;
}) => {
  const assets = [...template.allocations].sort((a, b) => b.weightBps - a.weightBps);
  return (
    <div
      role="img"
      aria-label={`Top holdings: ${assets
        .slice(0, 6)
        .map((a) => a.ticker)
        .join(", ")}`}
      className="flex items-center -space-x-3 pl-1"
    >
      {assets.slice(0, 6).map((asset, index) => (
        <span key={asset.assetId} className="relative shrink-0" style={{ zIndex: 6 - index }}>
          <AssetIcon
            asset={asset}
            source={instruments.get(asset.ticker)}
            className="size-12 rounded-full bg-ds-panel object-contain ring-[3px] ring-white"
          />
        </span>
      ))}
      {assets.length > 6 && (
        <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-ds-panel pl-2 text-[12px] text-ds-muted ring-[3px] ring-white">
          +{assets.length - 6}
        </span>
      )}
    </div>
  );
};

export const Basket = () => {
  const { slug = "" } = useParams();
  const [range, setRange] = useState<Range>("1Y");
  const [enrollmentOpen, setEnrollmentOpen] = useState(false);
  const [checkingEnrollment, setCheckingEnrollment] = useState(false);
  const enrollmentRequestActive = useRef(false);
  const result = useBasketTemplate(slug);
  const insights = useBasketInsights(slug);
  const { ready, authenticated } = usePrivy();
  const { identityToken } = useIdentityToken();
  const signedIn = basketEnrollmentEnabled(ready, authenticated, identityToken !== null);
  const enrollment = useBasketEnrollment(slug);
  const enrollAction = useBasketEnrollmentAction(slug);
  const template = result.data;
  const tickers = useMemo(() => template?.allocations.map((item) => item.ticker) ?? [], [template]);
  const mints = useMemo(() => template?.allocations.map((item) => item.mint) ?? [], [template]);
  const instruments = useInstruments(tickers);
  const prices = usePrices(mints);
  const dayHistory = useHistories(tickers, "1D");
  const weekHistory = useHistories(tickers, "1W");
  const byTicker = useMemo(
    () => new Map((instruments.data ?? []).map((item) => [item.ticker, item])),
    [instruments.data],
  );
  const name = template ? displayBasketName(template.name) : "Basket";
  const enrollmentBusy = checkingEnrollment || enrollAction.isPending;
  const closeEnrollment = () => {
    if (enrollmentBusy) return;
    setEnrollmentOpen(false);
    enrollAction.reset();
  };
  const confirmEnrollment = async () => {
    if (enrollmentRequestActive.current) return;
    enrollmentRequestActive.current = true;
    setCheckingEnrollment(true);
    try {
      // A previous submission may have succeeded upstream even if its response failed.
      const current = await enrollment.refetch();
      if (!current.isError && !current.data) await enrollAction.mutateAsync();
    } catch {
      // The mutation retains the error for the review sheet to display.
    } finally {
      setCheckingEnrollment(false);
      enrollmentRequestActive.current = false;
    }
  };

  if (result.isLoading || !template)
    return (
      <AppShell current="baskets" title={name} quiet>
        <div className="rounded-xl bg-white px-6 py-12 text-center text-ds-muted">
          {result.isLoading ? "Loading strategy…" : "This strategy is unavailable."}
          {!result.isLoading && (
            <Link to="/baskets" className="ml-2 text-ds-link">
              Back to baskets
            </Link>
          )}
        </div>
      </AppShell>
    );

  const performance = template.performance;
  const selectedWindow = performance?.windows.find((item) => item.window === WINDOW[range]);
  const since = selectedWindow?.since ?? (range === "All" ? performance?.points[0]?.date : undefined);
  const chart =
    selectedWindow === undefined && range !== "All" ? [] : modeledSeries(performance?.points ?? [], since);
  const allocations = [...template.allocations].sort((a, b) => b.weightBps - a.weightBps);
  const mosaic = allocationRows(allocations);
  const totalWeight = allocations.reduce((sum, asset) => sum + asset.weightBps, 0);
  const year = performance?.windows.find((item) => item.window === "12m");

  return (
    <AppShell current="baskets" title={name} quiet>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-[14px] text-ds-muted md:mb-6">
        <Link to="/baskets" className="hover:text-ds-ink">
          Baskets
        </Link>
        <Chevron />
        <span className="text-ds-ink">{name}</span>
      </nav>
      <div className="grid items-start gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_416px]">
        <div className="flex min-w-0 flex-col gap-4 md:gap-6">
          <section
            aria-label="Strategy overview and modeled performance"
            className="min-w-0 rounded-xl bg-white p-1"
          >
            <div className="px-5 pt-5 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-[20px] leading-tight font-medium text-ds-ink">{name}</h1>
                    <StatusChip tone={template.status === "enabled" ? "up" : "neutral"} size="md">
                      {template.status === "enabled" ? "Available" : template.status === "candidate" ? "Enrollment pilot" : "Preview"}
                    </StatusChip>
                  </div>
                  <p className="mt-2 text-[13px] text-ds-muted">Glider strategy · Solana</p>
                </div>
                <IconCluster template={template} instruments={byTicker} />
              </div>
              <p className="mt-5 max-w-[680px] text-[14px] leading-relaxed text-ds-muted">
                {template.description}
              </p>
              <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[12px] text-ds-muted">Modeled 1-year return</p>
                  <p
                    className={`mt-1 text-[32px] leading-none font-medium ${year ? (Number(year.percentChange) < 0 ? "text-ds-fall" : "text-ds-up") : "text-ds-ink"}`}
                  >
                    {year ? returnLabel(year.percentChange) : "Unavailable"}
                  </p>
                </div>
                <div className="max-w-full overflow-x-auto">
                  <RangeSwitch options={RANGES} value={range} onChange={setRange} />
                </div>
              </div>
              <div className="mt-4 h-[340px]">
                {chart.length > 1 ? (
                  <DotChart series={chart} label={range} scale="percent" />
                ) : (
                  <div className="grid h-full place-items-center rounded-lg bg-ds-panel text-[13px] text-ds-muted">
                    Modeled history is unavailable for this range.
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-lg bg-ds-panel px-5 py-3 text-[12px] leading-relaxed text-ds-muted">
              Glider model{performance ? ` · as of ${new Date(performance.asOf).toLocaleDateString()}` : ""}.
              This is target-allocation history, not a live portfolio return. Past modeled performance does
              not predict future results.
            </div>
          </section>

          <section
            aria-label="Strategy composition"
            className="overflow-hidden rounded-xl bg-white p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-medium text-ds-ink">Strategy composition</h2>
                <p className="mt-1 text-[12px] text-ds-muted">
                  Target weights; actual holdings can drift between rebalances.
                </p>
              </div>
              <span className="text-[12px] text-ds-muted">{allocations.length} target assets</span>
            </div>
            <div className="mt-5 overflow-x-auto rounded-lg bg-ds-panel p-1">
              <GlideTable
                columns="grid-cols-[minmax(180px,1fr)_75px_95px_95px_75px_75px] gap-x-3"
                minWidth="min-w-[680px]"
                headings={
                  <>
                    <span>Asset</span>
                    <span className="text-right">Weight</span>
                    <span className="text-right">Share price</span>
                    <span className="text-right">Company cap</span>
                    <span className="text-right">1D</span>
                    <span className="text-right">1W</span>
                  </>
                }
              >
                {allocations.map((asset) => {
                  const sharePrice = byTicker.get(asset.ticker)?.quote.fair;
                  const companyCap = prices.data?.get(asset.mint)?.underlyingMarketCapUsd;
                  return (
                    <li
                      key={asset.assetId}
                      data-row
                      className="relative z-[1] grid grid-cols-[minmax(180px,1fr)_75px_95px_95px_75px_75px] items-center gap-x-3 rounded-md px-4 py-3 text-[13px]"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <AssetIcon
                          asset={asset}
                          source={byTicker.get(asset.ticker)}
                          className="size-9 shrink-0 rounded-full bg-ds-panel object-contain"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ds-ink">
                            {byTicker.get(asset.ticker)?.name ?? asset.ticker}
                          </span>
                          <span className="text-[11px] text-ds-muted">{asset.ticker}</span>
                        </span>
                      </span>
                      <span className="text-right font-medium text-ds-ink">{weight(asset.weightBps)}</span>
                      <span className="text-right text-ds-ink">
                        {sharePrice == null ? "—" : usd(sharePrice)}
                      </span>
                      <span className="text-right text-ds-muted">
                        {companyCap == null ? "—" : usdCompact(companyCap.toNumber())}
                      </span>
                      <span className="flex justify-end">
                        <MoveChip value={dayHistory.data?.get(asset.ticker)?.changePct ?? null} light />
                      </span>
                      <span className="flex justify-end">
                        <MoveChip value={weekHistory.data?.get(asset.ticker)?.changePct ?? null} light />
                      </span>
                    </li>
                  );
                })}
              </GlideTable>
            </div>
            <p className="mt-3 text-[11px] text-ds-muted">
              Share price, company cap and 1D/1W moves describe the underlying companies, not the Solana
              tokens held by this strategy. Unavailable data is shown as —.
            </p>
          </section>

          <section
            aria-label="About and allocation"
            className="overflow-hidden rounded-xl bg-white p-5 sm:p-6"
          >
            <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-8">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 text-[11px] text-ds-muted">
                  <span className="rounded-full bg-ds-panel px-3 py-1">Glider strategy</span>
                  <span>Solana</span>
                </div>
                <h2 className="mt-5 text-[18px] font-medium text-ds-ink">About {name}</h2>
                <p className="mt-3 text-[13px] leading-[1.7] text-ds-muted">
                  This Solana strategy follows Glider’s target weights with tokenized assets held in your own
                  smart account. Glider rebalances daily; your actual holdings can drift between rebalances.
                </p>
                <p className="mt-5 text-[12px] font-medium text-ds-ink">Where it invests</p>
                {insights.data?.allocation?.sectors.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {insights.data.allocation.sectors.map((sector) => (
                      <span
                        key={sector.label}
                        className="rounded-md bg-ds-panel px-2.5 py-1.5 text-[11px] text-ds-muted"
                      >
                        {sector.label}{" "}
                        <span className="font-medium text-ds-ink">
                          {Number(sector.weightPercent).toFixed(1)}%
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[12px] text-ds-muted">Provider classification is unavailable.</p>
                )}
                {!!insights.data?.allocation?.unclassifiedCount && (
                  <p className="mt-3 text-[11px] text-ds-muted">
                    {insights.data.allocation.unclassifiedCount} holdings lack a sector classification.
                  </p>
                )}
                {!!insights.data?.allocation?.lowConfidenceCount && (
                  <p className="mt-1 text-[11px] text-ds-muted">
                    {insights.data.allocation.lowConfidenceCount} sector labels are estimates.
                  </p>
                )}
              </div>
              <div className="rounded-xl bg-ds-panel p-2.5">
                <div className="flex items-center justify-between px-2 pb-2 text-[11px] text-ds-muted">
                  <span>Target allocation</span>
                  <span>{allocations.length} assets</span>
                </div>
                <div
                  className="flex h-[290px] flex-col gap-1.5"
                  role="img"
                  aria-label={`Target allocation: ${allocations.map((asset) => `${asset.ticker} ${weight(asset.weightBps)}`).join(", ")}`}
                >
                  {mosaic.map((row, rowIndex) => {
                    const rowWeight = row.reduce((sum, tile) => sum + tile.weightBps, 0);
                    return (
                      <div
                        key={rowIndex}
                        className="flex min-h-0 gap-1.5"
                        style={{ flexGrow: rowWeight, flexBasis: 0 }}
                      >
                        {row.map((tile, index) => (
                          <div
                            key={tile.ticker}
                            className="basket-allocation-tile group min-w-0 overflow-hidden rounded-lg px-2.5 transition-[transform,box-shadow,filter] duration-300 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-sm motion-reduce:transition-none sm:px-3"
                            style={{ flexGrow: tile.weightBps, flexBasis: 0 }}
                            title={`${tile.ticker}: ${weight(tile.weightBps)} target weight`}
                          >
                            <span
                              aria-hidden="true"
                              className={`basket-allocation-color pointer-events-none absolute -inset-3 ${TILE_TONES[(rowIndex * 2 + index) % TILE_TONES.length]}`}
                            />
                            <span className="basket-allocation-content">
                              {tile.kind === "asset" ? (
                                <AssetIcon
                                  asset={tile.asset}
                                  source={byTicker.get(tile.ticker)}
                                  className="size-6 shrink-0 rounded-full object-contain transition-transform duration-300 motion-safe:group-hover:scale-110 motion-reduce:transition-none"
                                />
                              ) : (
                                <span className="flex shrink-0 items-center -space-x-2 pl-0.5">
                                  {tile.assets.slice(0, 3).map((asset) => (
                                    <AssetIcon
                                      key={asset.assetId}
                                      asset={asset}
                                      source={byTicker.get(asset.ticker)}
                                      className="size-6 rounded-full bg-white object-contain ring-2 ring-white"
                                    />
                                  ))}
                                </span>
                              )}
                              <span className="flex min-w-0 flex-col">
                                <span className="truncate text-[12px] font-medium text-ds-ink">
                                  {tile.ticker}
                                </span>
                                <span className="text-[11px] text-ds-muted">
                                  {weight(tile.weightBps)}
                                  {tile.kind === "other" ? ` · ${tile.assets.length} assets` : ""}
                                </span>
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <p className="px-2 pt-2 text-[10px] text-ds-muted">
                  Target weights{totalWeight !== 10_000 ? ` · ${weight(totalWeight)} assigned` : ""}; not live
                  holdings.
                </p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-ds-divider pt-5 text-[12px] sm:grid-cols-4">
              <div>
                <p className="text-ds-muted">Diversified exposure</p>
                <p className="mt-1 font-medium text-ds-ink">{allocations.length} assets</p>
              </div>
              <div>
                <p className="text-ds-muted">Rebalancing</p>
                <p className="mt-1 font-medium text-ds-ink">Daily</p>
              </div>
              <div>
                <p className="text-ds-muted">Custody</p>
                <p className="mt-1 font-medium text-ds-ink">Your smart account</p>
              </div>
              <div>
                <p className="text-ds-muted">Integrator swap fee</p>
                <p className="mt-1 font-medium text-ds-ink">
                  {insights.data?.integratorSwapFeeBps == null
                    ? "Not available"
                    : `${(insights.data.integratorSwapFeeBps / 100).toFixed(2)}%`}
                </p>
              </div>
            </div>
          </section>
          <details className="group rounded-xl bg-white p-5 sm:p-6">
            <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-medium text-ds-ink [&::-webkit-details-marker]:hidden">
              Risks and disclosures{" "}
              <span aria-hidden className="text-ds-muted transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <p className="mt-4 text-[13px] leading-relaxed text-ds-muted">
              These are tokenized assets held in a user-owned Glider smart account, not shares in a pooled
              basket token. Prices, available liquidity, swap costs and actual execution can differ from the
              modeled strategy. This template is not available for funding until its end-to-end lifecycle has
              been verified.
            </p>
          </details>
        </div>

        <aside className="flex flex-col gap-4 md:gap-6 xl:sticky xl:top-20">
          <EnrollmentRail
            name={name}
            assetCount={allocations.length}
            portfolio={signedIn ? enrollment.data ?? null : null}
            signedIn={signedIn}
            checking={enrollment.isLoading}
            blocked={template.status === "disabled"}
            busy={enrollmentBusy}
            error={enrollment.error?.message}
            onReview={() => {
              enrollAction.reset();
              setEnrollmentOpen(true);
            }}
          />
          <RailCard label="Your position">
            <RailHead title="Your position" />
            <div className="mt-5 rounded-lg bg-ds-panel px-4 py-5 text-center">
              <p className="text-[13px] font-medium text-ds-ink">No connected portfolio</p>
              <p className="mt-2 text-[12px] leading-relaxed text-ds-muted">
                Balances and returns will appear after portfolio tracking is available.
              </p>
            </div>
          </RailCard>
          <RailCard label="Rebalancing">
            <RailHead title="Rebalancing" meta="Daily" />
            <div className="mt-5 flex items-center justify-between gap-3 rounded-lg bg-ds-panel p-4 text-[12px]">
              <span className="text-ds-muted">Next rebalance</span>
              <span className="font-medium text-ds-ink">After enrollment</span>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-ds-muted">
              Timing is specific to each portfolio. No schedule is connected yet.
            </p>
          </RailCard>
          <RailCard label="Recent activity">
            <RailHead title="Recent activity" />
            <div className="mt-5 rounded-lg bg-ds-panel px-4 py-5 text-center">
              <p className="text-[13px] font-medium text-ds-ink">No activity to show</p>
              <p className="mt-2 text-[12px] leading-relaxed text-ds-muted">
                Deposits, rebalances, and withdrawals will appear when tracking is connected.
              </p>
            </div>
          </RailCard>
          <Link to="/baskets" className="text-[13px] font-medium text-ds-link hover:underline">
            Explore more strategies →
          </Link>
        </aside>
      </div>
      <EnrollmentSheet
        open={enrollmentOpen}
        name={name}
        assetCount={allocations.length}
        walletReady={enrollAction.walletReady}
        busy={enrollmentBusy}
        completed={Boolean(enrollment.data || enrollAction.data)}
        error={enrollAction.error?.message ?? enrollment.error?.message}
        onClose={closeEnrollment}
        onConfirm={() => void confirmEnrollment()}
      />
    </AppShell>
  );
};
