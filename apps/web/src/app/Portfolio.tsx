import { useState } from "react";
import { useBorrow } from "../api/borrow";
import { useDashboard } from "../api/dashboard";
import { useMoney, usePortfolio, useSignedIn } from "../api/hooks";
import { useCreditMarket, useInstruments } from "../market/hooks";
import { Alert } from "../ui/icons";
import { AppShell } from "./AppShell";
import { Borrowing } from "./portfolio/Borrowing";
import { CardPanel } from "./portfolio/CardPanel";
import { Recent, Upcoming } from "./portfolio/Feed";
import { Holdings, type BasketHolding } from "./portfolio/Holdings";
import { useBasketReturns, useBaskets } from "../api/baskets";
import { USDC_ASSET_ID } from "@mercury/view";
import { AssetIcon } from "./baskets/AssetIcon";
import { displayBasketName } from "./baskets/catalog";
import { useModel } from "./portfolio/model";
import { AccountHeader, Allocation, Performance } from "./portfolio/Summary";
import { useEvents } from "./useEvents";
import type { Range } from "./ValueChart";
import { Welcome } from "./Welcome";

/**
 * The whole account on one screen: worth, performance, where it sits, what it
 * could borrow and has borrowed, the card, and what is next. Each panel reads
 * the same derived model, so a figure in the strip and the panel below it can
 * never disagree.
 */
export const Portfolio = () => {
  /*
   * A day, not a month. The chart is built from hourly readings we started
   * taking on 30 September 2026, so the longer ranges are mostly empty and
   * will be until there is a month of them to show. A day is also the range
   * the figure beside it answers — "how did I do today" is the question
   * somebody opens this screen with.
   */
  const [range, setRange] = useState<Range>("1D");
  const signedIn = useSignedIn();
  const portfolio = usePortfolio();
  const money = useMoney();
  const dash = useDashboard();
  // The backend owns basket valuation; templates only supply the two marks.
  const templates = useBaskets();
  const basketTemplates = (portfolio.data?.baskets ?? []).flatMap((b) => {
    const t = templates.data?.find((x) => x.slug === b.slug);
    const value = Number(b.valueUsd);
    return value > 0 ? [{ b, t, value }] : [];
  });
  const basketReturns = useBasketReturns(basketTemplates.length > 0);
  const returnsByPortfolio = new Map(
    basketReturns.data?.map((item) => [item.portfolioId, item.percentChange]),
  );
  const markTickers = basketTemplates.flatMap(({ t }) =>
    [...(t?.allocations ?? [])]
      .sort((a, z) => z.weightBps - a.weightBps)
      .slice(0, 2)
      .map((a) => a.ticker),
  );
  const universe = useInstruments([
    ...new Set([...(portfolio.data?.holdings.map((h) => h.ticker) ?? []), ...markTickers]),
  ]);
  const byTicker = new Map((universe.data ?? []).map((i) => [i.ticker, i]));
  const baskets: BasketHolding[] = basketTemplates.map(({ b, t, value }) => ({
    portfolioId: b.portfolioId,
    slug: b.slug,
    name: displayBasketName(b.name),
    value,
    assetCount: t?.allocations.length ?? b.holdings.length,
    todayPct: b.changePct24h === null ? null : Number(b.changePct24h),
    /*
     * Our own basis first, in dollars, because that is the figure the rest of
     * the page is in and the only one we can show beside a holding's. Glider's
     * money-weighted percentage stands in when we have no basis — a basket
     * funded by a path we never witnessed — and it is all they give us.
     */
    pnlUsd: b.pnlUsd === undefined ? null : Number(b.pnlUsd),
    costBasisUsd: b.costBasisUsd === undefined ? null : Number(b.costBasisUsd),
    basisIsComplete: b.basisIsComplete ?? true,
    returnPct:
      b.returnPct != null
        ? Number(b.returnPct)
        : b.holdings.length > 0 && b.holdings.every((asset) => asset.assetId === USDC_ASSET_ID)
          ? null
          : returnsByPortfolio.get(b.portfolioId) == null
            ? null
            : Number(returnsByPortfolio.get(b.portfolioId)),
    marks: [...(t?.allocations ?? [])]
      .sort((a, z) => z.weightBps - a.weightBps)
      .slice(0, 2)
      .map((a) => (
        <AssetIcon
          key={a.ticker}
          asset={a}
          source={byTicker.get(a.ticker)}
          className="size-6 rounded-full bg-white object-contain ring-2 ring-ds-panel"
        />
      )),
  }));
  const credit = useCreditMarket();
  const { events, loading: eventsLoading } = useEvents();

  const borrow = useBorrow();
  const m = useModel(portfolio.data, universe.data, credit.data, dash.data, borrow.data);
  const failed = portfolio.isError;
  const apr = Number(money.data?.yieldApr ?? 0);

  return (
    <AppShell current="portfolio" title="Portfolio" quiet>
      <Welcome />

      {failed && (
        <div className="mb-4 flex items-center gap-3 rounded-xl md:mb-6 border border-down-line bg-down-tint px-4 py-3 text-[13px] text-down-deep">
          <Alert className="size-4 shrink-0" />
          <p className="flex-1">
            {portfolio.data
              ? "Account refresh failed. Showing your last available values."
              : "We could not reach your account. The figures below are missing, not zero."}
          </p>
          <button
            type="button"
            onClick={() => void portfolio.refetch()}
            className="rounded-lg border border-down-line px-3 py-1 text-[12px] font-medium hover:bg-white"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 md:gap-6">
        {/* 2 — the account, and what you can do with it. */}
        <AccountHeader m={m} dash={dash.data} apr={apr} failed={failed} />

        <div className="grid grid-cols-1 items-start gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_416px]">
          {/* 3 — what you own, then how it has moved and where it sits. */}
          <div className="flex min-w-0 flex-col gap-4 md:gap-6">
            <Holdings m={m} signedIn={signedIn} failed={failed} baskets={baskets} />
            <div className="grid grid-cols-1 items-stretch gap-4 md:gap-6 lg:grid-cols-2">
              <Performance m={m} range={range} setRange={setRange} />
              <Allocation m={m} />
            </div>
          </div>

          {/* 4 — the things you manage, each led by its action, then what happened. */}
          <div className="flex flex-col gap-4 md:gap-6">
            <CardPanel m={m} card={dash.data?.card} loading={dash.isLoading} />
            <Borrowing m={m} loading={signedIn && borrow.isLoading} />
            <Upcoming items={dash.data?.upcoming ?? []} loading={dash.isLoading} />
            <Recent events={events} loading={eventsLoading || (signedIn && portfolio.isLoading && !failed)} />
          </div>
        </div>
      </div>
    </AppShell>
  );
};
