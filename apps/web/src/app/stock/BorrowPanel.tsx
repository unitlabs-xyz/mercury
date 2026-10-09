import { useBorrow } from "../../api/borrow";
import { useSignedIn } from "../../api/hooks";
import { ButtonLink } from "../../ui/Button";
import { RailCard, RailFigure, RailHead } from "../../ui/ds";
import { pct, usd } from "@mercury/view";
import { HeaderFigure } from "../portfolio/Summary";
import { Fact, FigureCard } from "./Panels";
import { useHeldAs } from "./heldAs";

/**
 * What this stock is worth as collateral, as a rail card: how much it lends at
 * our 80% safety target, how far it could then fall before Kamino sells, and,
 * for a holder, the dollar figure they could borrow against it right now.
 */
export const BorrowPanel = ({ ticker, name }: { ticker: string; name: string }) => {
  const signedIn = useSignedIn();
  const borrow = useBorrow();
  const row = borrow.data?.collateral.find((r) => r.isStock && r.ticker === ticker);
  /* Kamino takes the xStocks token of a ticker, never the Ondo one. The rows
     above are xStocks only, so the Ondo part of a position is what they miss. */
  const { lendableShares, unlendableShares, unlendableUsd } = useHeldAs(ticker);

  if (!signedIn || !borrow.data) return null;
  if (!row) {
    return (
      <RailCard label="Borrow against it">
        <RailHead title="Borrow against it" />
        <p className="mt-[15px] text-[14px] leading-[1.45] text-ds-muted">{name} isn’t borrowable yet.</p>
      </RailCard>
    );
  }

  const target = row.ltv * borrow.data.safetyTarget;
  const holds = row.depositedTokens > 0 || row.depositableTokens > 0;
  const TONE_TEXT = { up: "text-ds-up", warn: "text-warn", down: "text-ds-down", none: "" } as const;
  const distanceTone =
    row.liquidationDistance === null
      ? undefined
      : row.liquidationDistance < 0.1
        ? ("down" as const)
        : row.liquidationDistance < 0.2
          ? ("warn" as const)
          : ("up" as const);

  /*
   * Held, but only as tokens Kamino does not take. The terms are still worth
   * showing — as what this holding would lend if it were on xStocks, against
   * their own figure rather than a round one. Saying only that it cannot be
   * borrowed leaves the reader with a dead card and no sense of the stakes.
   */
  if (!holds && unlendableShares > 0) {
    const wouldLend = unlendableUsd * target;
    return (
      <FigureCard
        label="Borrow against it"
        head={<RailHead title="Borrow against it" meta={`${pct(borrow.data.borrowApy * 100, 1)} a year`} />}
        value={usd(wouldLend)}
        sub={`What your ${usd(unlendableUsd)} of ${name} would lend, held on xStocks`}
        wide={3}
      >
        <HeaderFigure
          size="md"
          label="Held as"
          value="Ondo"
          sub={`${unlendableShares.toFixed(4)} shares, not borrowable`}
        />
        <HeaderFigure
          size="md"
          label="Kamino lends up to"
          value={pct(row.ltv * 100, 0)}
          sub={`We stop at ${pct(target * 100, 0)}, for headroom`}
        />
        <HeaderFigure
          size="md"
          label="Safe unless it falls"
          value={pct(row.cushionAtTarget * 100, 0)}
          sub={`Borrowing the full ${usd(wouldLend)}, before Kamino sells`}
        />
      </FigureCard>
    );
  }

  // Holding it: the rail card, what you can borrow now and the lines under it.
  if (holds) {
    return (
      // Set like Your position: the figure, then its facts in a grey panel. A column,
      // so the button sits 24px from the sides and 20px from the foot however tall the row is.
      <section aria-label="Borrow against it" className="flex min-w-0 flex-col rounded-xl bg-white p-1">
        <div className="px-3 sm:px-5 pt-4">
          <RailHead title="Borrow against it" meta={`${pct(borrow.data.borrowApy * 100, 1)} a year`} />
          <div className="mt-[15px]">
            <RailFigure
              value={usd(row.borrowableUsd)}
              sub={`Against your ${name} on xStocks, without selling it`}
            />
          </div>
        </div>
        <dl className="mt-4 grid flex-1 grid-cols-2 content-center gap-x-6 gap-y-5 rounded-lg bg-ds-panel px-5 py-5">
          <Fact k="Lends up to">
            {pct(target * 100, 1)}{" "}
            <span className="text-[12px] font-normal text-ds-muted">max {pct(row.ltv * 100, 0)}</span>
          </Fact>
          <Fact k="Safe unless it falls">{pct(row.cushionAtTarget * 100, 0)}</Fact>
          {/* Which shares the figure is of. Only xStocks count; the Ondo part is named, not hidden. */}
          {lendableShares > 0 && <Fact k="On xStocks">{lendableShares.toFixed(4)} shares</Fact>}
          {unlendableShares > 0 && (
            <Fact k="On Ondo" tip="Shares on Ondo aren’t borrowable. Only your xStocks shares count here.">
              {unlendableShares.toFixed(4)} shares
            </Fact>
          )}
          {row.depositedTokens > 0 && <Fact k="Pledged">{usd(row.depositedUsd)}</Fact>}
          {row.depositedTokens > 0 && row.liquidationPrice !== null && row.liquidationDistance !== null && (
            <Fact k="Sold if it reaches">
              <span className={TONE_TEXT[distanceTone ?? "none"]}>
                {usd(row.liquidationPrice)}{" "}
                <span className="text-[12px] font-normal text-ds-muted">
                  {pct(row.liquidationDistance * 100, 0)} away
                </span>
              </span>
            </Fact>
          )}
        </dl>
        {row.borrowableUsd > 0 && (
          <div className="mt-auto px-3 sm:px-5 pt-4 pb-4">
            <ButtonLink
              to={`?borrow=borrow&ticker=${encodeURIComponent(ticker)}&only=1`}
              size="lg"
              className="w-full"
            >
              Borrow against {ticker}
            </ButtonLink>
          </div>
        )}
      </section>
    );
  }

  // Not held yet: what it would lend, the figures up front in a grey panel.
  //
  // Three figures, and each one has to earn its place by saying something the
  // card does not already say. The loan is the headline in dollars and the rate
  // is in the header, so a "lends up to 44%" and an "interest 5.8%" would be
  // those two facts printed twice. What is left is the margin we keep under
  // Kamino, how far the price can fall, and what the loan costs in money.
  const loan = 1000 * target;
  return (
    <FigureCard
      label="Borrow against it"
      head={<RailHead title="Borrow against it" meta={`${pct(borrow.data.borrowApy * 100, 1)} a year`} />}
      value={usd(loan, 0)}
      sub={`Loan against every $1,000 of ${name} you hold`}
      wide={3}
    >
      {/* Kamino's ceiling, not ours: the number worth showing is the one we do
          not use. We stop short of it so a normal fall does not sell the stock. */}
      <HeaderFigure
        size="md"
        label="Kamino lends up to"
        value={pct(row.ltv * 100, 0)}
        sub={`We stop at ${pct(target * 100, 0)}, for headroom`}
      />
      {/* The liquidation, in the only terms a reader can act on. Deliberately
          untinted: green would read as a verdict on a position they do not hold,
          and the held card colours it by their real distance instead. */}
      <HeaderFigure
        size="md"
        label="Safe unless it falls"
        value={pct(row.cushionAtTarget * 100, 0)}
        sub={`Borrowing the full ${usd(loan, 0)}, before Kamino sells`}
      />
      {/* The rate as money. The header already gives the percentage; what it
          does not give is what a year of it costs against the loan above. */}
      <HeaderFigure
        size="md"
        label="Interest"
        value={`${usd(loan * borrow.data.borrowApy, 0)} a year`}
        sub={`On the full ${usd(loan, 0)}, variable`}
      />
    </FigureCard>
  );
};
