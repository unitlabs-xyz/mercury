import { useBorrow, type Borrow } from "../api/borrow";
import { useEarn } from "../api/earn";
import { useMoney, useSignedIn } from "../api/hooks";
import { Button, ButtonLink } from "../ui/Button";
import { ArrowUp, Plus, Trend } from "../ui/icons";
import { AppShell } from "./AppShell";
import { usePanels } from "./Panels";
import { interestText, pct, usd } from "@mercury/view";
import { BorrowSection } from "./money/BorrowSection";
import { EarnSection } from "./money/EarnSection";
import { HeaderFigure } from "./portfolio/Summary";
import { Skeleton } from "./portfolio/ui";

/**
 * What the Spendable figure says underneath itself.
 *
 * Spendable is defined by the server as cash plus what could be borrowed
 * (`spendableUsd: input.cashUsd.add(borrowableUsd)`, services/api/src/lending/
 * capacity.ts), so this line is not a caption — it is the arithmetic behind
 * the figure above it, and it carries the cents for the same reason that
 * figure does.
 *
 * Rounded to whole dollars it read "Cash + $9 borrowing" beneath $8.66, so
 * the card plainly failed to add up, and a breakdown that does not add up
 * invites somebody to doubt every other number on the screen. It rounded
 * upward as well, which on a credit line is the wrong direction to be wrong
 * in: it offered a third of a dollar the account could not have borrowed.
 */
export const spendableSub = (borrow: Borrow | undefined): string =>
  borrow === undefined ? "Cash and borrowing" : `Cash + ${usd(borrow.borrowableUsd)} borrowing`;

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
  const earn = useEarn();
  const m = money.data;
  const b = borrow.data;
  const e = earn.data;

  return (
    <AppShell current="money" title="Money" quiet>
      <div className="flex flex-col gap-4 md:gap-6">
        <section aria-label="Cash" className="flex flex-col rounded-xl bg-white xl:min-h-[189px] xl:flex-row">
          {/* Wider than the portfolio's 395px, so all four verbs sit on one line. */}
          <div className="shrink-0 p-4 sm:p-6 xl:w-[500px]">
            <p className="text-[14px] leading-none font-medium text-ds-ink">Cash</p>
            {m ? (
              <p className="mt-[9px] text-[36px] leading-none font-medium text-ds-ink">{usd(m.balanceUsd)}</p>
            ) : (
              <Skeleton className="mt-2 h-9 w-48" />
            )}
            {/* Only money in Earn earns. Cash in the wallet is said to, nowhere. */}
            {e && e.balanceUsd > 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-[12px] leading-none">
                <span className="inline-flex h-5 items-center rounded-md bg-ds-up-chip px-2 text-ds-up">
                  <span className="opacity-80">+ {usd(e.balanceUsd)} in Earn</span>
                </span>
                {e.apy !== null && <span className="text-ds-ink/80">at {pct(e.apy * 100)} a year</span>}
              </p>
            )}
            <div className="scroll-row mt-[22px] flex flex-wrap gap-2 max-sm:-mx-4 max-sm:w-[calc(100%+2rem)] max-sm:px-4">
              <ButtonLink to="/invest" variant="primary">
                Invest
              </ButtonLink>
              <Button icon={<Plus />} onClick={panels.addCash}>
                Add cash
              </Button>
              <Button icon={<ArrowUp className="rotate-45" />} onClick={panels.send}>
                Send
              </Button>
              {/* Earn opens its own page: picking a vault is a choice worth a screen. */}
              <ButtonLink to="/earn" icon={<Trend />}>
                Earn
              </ButtonLink>
            </div>
          </div>

          <dl className="m-1 grid grid-cols-2 gap-x-6 gap-y-5 rounded-lg bg-ds-panel px-5 py-5 sm:grid-cols-3 xl:flex xl:flex-1 xl:items-center xl:justify-between xl:py-0 xl:pr-[61px] xl:pl-[85px]">
            {e && e.holdings.length > 0 ? (
              <>
                <HeaderFigure
                  label="In Earn"
                  value={usd(e.balanceUsd)}
                  sub={`${e.apy !== null ? pct(e.apy * 100) : "—"} a year, variable`}
                />
                <HeaderFigure
                  label="Earned so far"
                  value={e.earnedUsd > 0 ? interestText(e.earnedUsd) : usd(0)}
                  sub="Added to your Earn balance"
                  tone={e.earnedUsd > 0 ? "up" : undefined}
                />
              </>
            ) : (
              /* Nothing in Earn: no Earn figures. The Earn button is the way in. */
              <>
                <HeaderFigure
                  label="Can borrow"
                  value={b ? usd(b.borrowableUsd) : "—"}
                  sub="Against your stocks"
                  loading={!b && borrow.isLoading}
                />
                <HeaderFigure
                  label="Pledged"
                  value={b ? usd(b.collateralUsd) : "—"}
                  sub="Still yours, still moving"
                  loading={!b && borrow.isLoading}
                />
              </>
            )}
            <HeaderFigure label="Spendable" value={b ? usd(b.spendableUsd) : "—"} sub={spendableSub(b)} />
          </dl>
        </section>

        {/* Only once there is money in Earn: before that, the Earn button is the way in. */}
        {signedIn && e && e.holdings.length > 0 && <EarnSection />}
        {signedIn && <BorrowSection />}
      </div>
    </AppShell>
  );
};
