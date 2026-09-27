import { useBorrow } from "../../api/borrow";
import { useSignedIn } from "../../api/hooks";
import { ButtonLink } from "../../ui/Button";
import { RailCard, RailFigure, RailHead } from "../../ui/ds";
import { pct, usd } from "../format";
import { HeaderFigure } from "../portfolio/Summary";
import { Fact, FigureCard } from "./Panels";

/**
 * What this stock is worth as collateral, as a rail card: how much it lends at
 * our 80% safety target, how far it could then fall before Kamino sells, and,
 * for a holder, the dollar figure they could borrow against it right now.
 */
export const BorrowPanel = ({ ticker, name }: { ticker: string; name: string }) => {
  const signedIn = useSignedIn();
  const borrow = useBorrow();
  const row = borrow.data?.collateral.find((r) => r.isStock && r.ticker === ticker);

  if (!signedIn || !borrow.data) return null;
  if (!row) {
    return (
      <RailCard label="Borrow against it">
        <RailHead title="Borrow against it" />
        <p className="mt-[15px] text-[14px] leading-[1.45] text-ds-muted">
          Kamino does not accept {name} as collateral, so you cannot borrow against it.
        </p>
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

  // Holding it: the rail card, what you can borrow now and the lines under it.
  if (holds) {
    return (
      // Set like Your position: the figure, then its facts in a grey panel. A column,
      // so the button sits 24px from the sides and 20px from the foot however tall the row is.
      <section aria-label="Borrow against it" className="flex min-w-0 flex-col rounded-xl bg-white p-1">
        <div className="px-5 pt-4">
          <RailHead title="Borrow against it" meta={`${pct(borrow.data.borrowApy * 100, 1)} a year`} />
          <div className="mt-[15px]">
            <RailFigure
              value={usd(row.borrowableUsd)}
              sub={`You can borrow against your ${name}, without selling it`}
            />
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 rounded-lg bg-ds-panel px-5 py-5">
          <Fact k="Lends up to">
            {pct(target * 100, 1)}{" "}
            <span className="text-[12px] font-normal text-ds-muted">max {pct(row.ltv * 100, 0)}</span>
          </Fact>
          <Fact k="Safe unless it falls">{pct(row.cushionAtTarget * 100, 0)}</Fact>
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
          <div className="mt-auto px-5 pt-4 pb-4">
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
  return (
    <FigureCard
      label="Borrow against it"
      head={<RailHead title="Borrow against it" meta={`${pct(borrow.data.borrowApy * 100, 1)} a year`} />}
      value={usd(1000 * target, 0)}
      sub={`Loan against every $1,000 of ${name} you hold`}
    >
      <HeaderFigure
        size="md"
        label="Lends up to"
        value={pct(target * 100, 1)}
        sub={`Of its value · Kamino max ${pct(row.ltv * 100, 0)}`}
      />
      <HeaderFigure
        size="md"
        label="Safe unless it falls"
        value={pct(row.cushionAtTarget * 100, 0)}
        sub="Borrowing the full amount"
        tone="up"
      />
      <HeaderFigure
        size="md"
        label="Interest"
        value={pct(borrow.data.borrowApy * 100, 1)}
        sub="A year, variable"
      />
      <HeaderFigure
        size="md"
        label="Kamino sells at"
        value={pct(row.liquidationThreshold * 100, 0)}
        sub="Loan to value, nothing pledged yet"
      />
    </FigureCard>
  );
};
