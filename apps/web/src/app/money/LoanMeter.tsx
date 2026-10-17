import type { Borrow, BorrowRow } from "../../api/borrow";
import { SegmentMeter } from "../../ui/ds";

const pctOf = (x: number) => `${Math.round(x * 100)}%`;

/** How much of a given set of deposits the loan uses, and the target and liquidation lines for that set. */
export const loanShape = (b: Borrow, debt: number, deposits: (r: BorrowRow) => number) => {
  const held = b.collateral.map((r) => ({ r, usd: deposits(r) * r.pricePerToken })).filter((x) => x.usd > 0);
  const pledged = held.reduce((s, x) => s + x.usd, 0);
  const weigh = (f: (r: BorrowRow) => number) =>
    pledged > 0 ? held.reduce((s, x) => s + x.usd * f(x.r), 0) / pledged : 0;
  return {
    pledged,
    ltv: pledged > 0 ? debt / pledged : 0,
    target: weigh((r) => r.ltv * b.safetyTarget),
    liquidation: weigh((r) => r.liquidationThreshold),
  };
};

/**
 * The loan's health as the portfolio's segmented meter: solid for what the
 * loan uses, then the room up to our 80% target, the warning zone and the
 * danger zone where Kamino sells. With `next`, the change being typed shows a
 * shade lighter. Hover anywhere along it for what that point means.
 */
export const LoanMeter = ({
  now,
  next,
  of = "current collateral",
}: {
  now: ReturnType<typeof loanShape>;
  next?: ReturnType<typeof loanShape> | undefined;
  /** What the loan is measured against, for the caption and tooltip. */
  of?: string | undefined;
}) => {
  // One scale for both, so the preview lands where it will on the same bar.
  const liquidation = Math.max(now.liquidation, next?.liquidation ?? 0) || 1;
  const target = next ? next.target : now.target;
  const marginCall = liquidation * 0.85;
  const at = (x: number) => Math.min(1, Math.max(0, x / liquidation));
  const changed = next && Math.abs(next.ltv - now.ltv) > 0.0005;

  const tip = (f: number) => {
    const ltv = f * liquidation;
    const near = (x: number) => Math.abs(f - at(x)) < 0.025;
    const zone =
      ltv <= target
        ? "Inside our 80% safety target: room to borrow"
        : ltv <= marginCall
          ? "Past the target: new borrowing and withdrawals pause"
          : "Close to where Kamino sells your collateral";
    return (
      <>
        <span className="block font-medium">
          {changed && near(next.ltv)
            ? `After this: ${pctOf(next.ltv)} of ${of}`
            : near(now.ltv)
              ? `Now: ${pctOf(now.ltv)} of ${of}`
              : `${pctOf(ltv)} of ${of}`}
        </span>
        <span className="block opacity-80">{zone}</span>
        {near(target) && <span className="block opacity-80">Safety target {pctOf(target)}</span>}
        {near(liquidation) && <span className="block opacity-80">Kamino sells at {pctOf(liquidation)}</span>}
      </>
    );
  };

  return (
    <div>
      <SegmentMeter
        label={`Loan is ${pctOf(now.ltv)} of ${of}${changed ? `, ${pctOf(next.ltv)} after this` : ""}; target ${pctOf(target)}, Kamino sells at ${pctOf(liquidation)}`}
        value={at(now.ltv)}
        preview={changed ? at(next.ltv) : undefined}
        tip={tip}
        zones={[
          { to: at(target), color: "var(--color-ds-meter-room)", used: "var(--color-ds-meter-used)" },
          { to: at(marginCall), color: "var(--color-ds-meter-warn)", used: "var(--color-ds-meter-warn)" },
          { to: 1, color: "var(--color-ds-meter-danger)", used: "var(--color-ds-meter-danger)" },
        ]}
      />
      <p className="mt-[9px] flex flex-wrap justify-between gap-2 text-[12px] leading-none text-ds-muted">
        <span>
          {changed ? (
            <>
              {pctOf(now.ltv)} <span aria-hidden>→</span>{" "}
              <span className="font-medium text-ds-ink">{pctOf(next.ltv)}</span> of {of}
            </>
          ) : (
            `Loan is ${pctOf(now.ltv)} of ${of}`
          )}
        </span>
        <span>
          Target {pctOf(target)} · Kamino sells at {pctOf(liquidation)}
        </span>
      </p>
    </div>
  );
};

/** The loan now, as `loanShape` reads it: today's debt against today's deposits. */
export const loanNow = (b: Borrow) => loanShape(b, b.debtUsd, (r) => r.depositedTokens);
