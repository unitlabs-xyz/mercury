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
import { Holdings } from "./portfolio/Holdings";
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
  const [range, setRange] = useState<Range>("1M");
  const signedIn = useSignedIn();
  const portfolio = usePortfolio();
  const money = useMoney();
  const dash = useDashboard();
  // The holdings' own instruments, featured or not, for their names, logos and sectors.
  const universe = useInstruments(portfolio.data?.holdings.map((h) => h.ticker) ?? []);
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
          <p className="flex-1">We could not reach your account. The figures below are missing, not zero.</p>
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
        <AccountHeader m={m} dash={dash.data} apr={apr} />

        <div className="grid items-start gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_416px]">
          {/* 3 — what you own, then how it has moved and where it sits. */}
          <div className="flex min-w-0 flex-col gap-4 md:gap-6">
            <Holdings m={m} signedIn={signedIn} failed={failed} />
            <div className="grid items-stretch gap-4 md:gap-6 lg:grid-cols-2">
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
