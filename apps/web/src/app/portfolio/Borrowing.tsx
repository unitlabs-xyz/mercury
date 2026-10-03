import { ButtonLink } from "../../ui/Button";
import { RailCard, RailFigure, RailHead, SegmentMeter, StatusChip, type Tone } from "../../ui/ds";
import { pct, usd, usdCompact } from "@mercury/view";
import type { Model } from "./model";
import { Skeleton } from "./ui";

const pctOf = (n: number) => `${Math.round(n * 100)}%`;

const STATE: Record<Model["health"], { label: string; tone: Tone }> = {
  healthy: { label: "Healthy", tone: "up" },
  over_limit: { label: "Past limit · locked", tone: "warn" },
  margin_call: { label: "Margin call", tone: "down" },
  liquidation: { label: "Being liquidated", tone: "down" },
};

/**
 * One question: how much do I owe against my shares, and am I safe? Built to
 * borrowing.svg. The meter runs from nothing to Kamino's liquidation line:
 * solid for what the loan uses, then the room up to our 80% limit, the warning
 * zone up to the margin call, and the danger zone where Kamino sells.
 */
export const Borrowing = ({ m, loading }: { m: Model | undefined; loading: boolean }) => {
  if (!m || loading) {
    return (
      <RailCard label="Borrowing">
        <RailHead title="Borrowing" to="/money" linkLabel="Manage" />
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-full" />
        </div>
      </RailCard>
    );
  }

  if (m.borrowed <= 0) {
    return (
      <RailCard label="Borrowing">
        <RailHead
          title="Borrowing"
          meta={m.borrowApy > 0 ? `${pct(m.borrowApy * 100, 1)} a year` : undefined}
          to="/money"
          linkLabel="Manage"
        />
        <div className="mt-4">
          <RailFigure
            value={usd(m.available)}
            sub={
              m.available > 0
                ? "Available to borrow, at the 80% safety limit"
                : "Buy a stock Kamino accepts to borrow against it"
            }
          />
        </div>
        {m.available > 0 && (
          <ButtonLink to="?borrow=borrow" variant="primary" size="lg" className="mt-5 w-full">
            Borrow up to {usdCompact(m.available)}
          </ButtonLink>
        )}
      </RailCard>
    );
  }

  const state = STATE[m.health];
  const end = m.ltvLiquidation > 0 ? m.ltvLiquidation : 1;
  const at = (ltv: number) => Math.min(1, Math.max(0, ltv / end));
  const marginCall = m.ltvLiquidation * 0.85;

  return (
    <RailCard label="Borrowing">
      <RailHead
        title="Borrowing"
        meta={<StatusChip tone={state.tone}>{state.label}</StatusChip>}
        to="/money"
        linkLabel="Manage"
      />

      <div className="mt-4">
        <RailFigure
          value={usd(m.borrowed)}
          sub={
            m.health === "healthy"
              ? `Safe unless your shares fall ${pctOf(m.safeUntilDrop ?? 0)}`
              : `Kamino sells if your shares fall ${pctOf(m.safeUntilDrop ?? 0)}`
          }
          tone={m.health === "margin_call" || m.health === "liquidation" ? "down" : undefined}
        />
      </div>

      <div className="mt-[11px]">
        <SegmentMeter
          label={`Using ${pctOf(m.ltvNow)} of the collateral, limit ${pctOf(m.ltvMax)}`}
          value={at(m.ltvNow)}
          zones={[
            { to: at(m.ltvMax), color: "var(--color-ds-meter-room)", used: "var(--color-ds-meter-used)" },
            { to: at(marginCall), color: "var(--color-ds-meter-warn)", used: "var(--color-ds-meter-warn)" },
            { to: 1, color: "var(--color-ds-meter-danger)", used: "var(--color-ds-meter-danger)" },
          ]}
        />
        <p className="mt-[7px] flex justify-between text-[10px] leading-none text-ds-muted">
          <span>Using {pctOf(m.ltvNow)}</span>
          <span>Limit {pctOf(m.ltvMax)}</span>
        </p>
      </div>

      <div className="mt-[11px] grid grid-cols-2 gap-1">
        <ButtonLink to="?borrow=repay" variant="primary" className="w-full">
          Repay
        </ButtonLink>
        <ButtonLink to="?borrow=borrow" className="w-full">
          Borrow {usdCompact(m.available)}
        </ButtonLink>
      </div>
    </RailCard>
  );
};
