import { useBorrow } from "../api/borrow";
import { useMoney, useSignedIn } from "../api/hooks";
import { Button, ButtonLink } from "../ui/Button";
import { ArrowUp, Plus } from "../ui/icons";
import { AppShell } from "./AppShell";
import { usePanels } from "./Panels";
import { pct, usd } from "@mercury/view";
import { BorrowSection } from "./money/BorrowSection";
import { HeaderFigure } from "./portfolio/Summary";
import { Skeleton } from "./portfolio/ui";

/**
 * Cash, set like the portfolio: the header card leads with what you can spend
 * on shares and the three verbs, the figures that follow from it in a grey
 * panel on the right; then borrowing against your stocks.
 *
 * Adding cash is a verb up there, not a card down here. The rail used to hold
 * a second copy of the deposit panel — the same address, the same QR code and
 * the same warning as the side panel the Add cash button opens, a scroll below
 * the button that opens it.
 */
export const Money = () => {
  // Add cash and Send are the app's side panels, opened on top of this page.
  const panels = usePanels();
  const signedIn = useSignedIn();
  const money = useMoney();
  const borrow = useBorrow();
  const m = money.data;
  const b = borrow.data;
  const apr = Number(m?.yieldApr ?? 0);

  return (
    <AppShell current="money" title="Money" quiet>
      <div className="flex flex-col gap-4 md:gap-6">
        <section aria-label="Cash" className="flex flex-col rounded-xl bg-white xl:min-h-[189px] xl:flex-row">
          <div className="shrink-0 p-6 xl:w-[395px]">
            <p className="text-[14px] leading-none font-medium text-ds-ink">Cash</p>
            {m ? (
              <p className="mt-[9px] text-[36px] leading-none font-medium text-ds-ink">{usd(m.balanceUsd)}</p>
            ) : (
              <Skeleton className="mt-2 h-9 w-48" />
            )}
            <p className="mt-3 flex items-center gap-1.5 text-[12px] leading-none">
              <span className="inline-flex h-5 items-center rounded-md bg-ds-up-chip px-2 text-ds-up">
                <span className="opacity-80">Earning {pct(apr * 100)}</span>
              </span>
              <span className="text-ds-ink/80">paid into this balance</span>
            </p>
            <div className="mt-[22px] flex flex-wrap gap-2">
              <ButtonLink to="/invest" variant="primary">
                Invest
              </ButtonLink>
              <Button icon={<Plus />} onClick={panels.addCash}>
                Add cash
              </Button>
              <Button icon={<ArrowUp className="rotate-45" />} onClick={panels.send}>
                Send
              </Button>
            </div>
          </div>

          <dl className="m-1 grid grid-cols-2 gap-x-6 gap-y-5 rounded-lg bg-ds-panel px-5 py-5 sm:grid-cols-3 xl:flex xl:flex-1 xl:items-center xl:justify-between xl:py-0 xl:pr-[61px] xl:pl-[85px]">
            <HeaderFigure
              label="Interest this year"
              value={m ? usd(m.interestEarnedYtdUsd) : "—"}
              sub="Paid into your cash"
              tone={m && Number(m.interestEarnedYtdUsd) > 0 ? "up" : undefined}
            />
            <HeaderFigure label="Yield" value={pct(apr * 100)} sub="A year, variable" />
            <HeaderFigure
              label="Spendable"
              value={b ? usd(b.spendableUsd) : "—"}
              sub={b ? `Cash + ${usd(b.borrowableUsd, 0)} borrowing` : "Cash and borrowing"}
            />
          </dl>
        </section>

        {signedIn && <BorrowSection />}
      </div>
    </AppShell>
  );
};
