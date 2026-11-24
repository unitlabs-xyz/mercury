import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usd } from "@mercury/view";
import { useActingWallet } from "../../api/acting-wallet";
import { useOutsideBaskets, type OutsideBasket } from "../../api/move";
import { Button } from "../../ui/Button";
import { usePanels } from "../Panels";
import {
  chosenHandoff,
  handoffSteps,
  nextStep,
  rememberHandoff,
  SHARES_INSTEAD_NOTE,
  USDC_COST_NOTE,
  type HandoffChoice,
} from "./handoff";

/** Glider's own app, where a basket made there is withdrawn. */
export const GLIDER_APP_URL = "https://glider.fi";

/** "1.5 TSLAx · 20 USDC", the largest first, and how many more past three. */
export const holdingsLine = (b: Pick<OutsideBasket, "holdings">): string => {
  const shown = b.holdings
    .slice(0, 3)
    .map((h) => `${Number(h.amount).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${h.symbol}`);
  const more = b.holdings.length - shown.length;
  return more > 0 ? `${shown.join(" · ")} · ${more} more` : shown.join(" · ");
};

const storage = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

/**
 * One basket made outside Mercury: what it holds, a choice of how to bring it
 * in, and the step that comes next. Mercury can't withdraw it (only the app
 * that made it can ask Glider to), so the first step happens on Glider; what
 * lands in the wallet then is Mercury's to move, and, as USDC, to reinvest in
 * a Mercury basket that rebalances itself.
 */
const Basket = ({ basket, wallet }: { basket: OutsideBasket; wallet: string }) => {
  const panels = usePanels();
  const navigate = useNavigate();
  const { choose, wallets } = useActingWallet();
  const [choice, setChoice] = useState<HandoffChoice>(() => chosenHandoff(basket.address, storage()));
  const next = nextStep(basket);
  const pick = (c: HandoffChoice) => {
    setChoice(c);
    rememberHandoff(basket.address, c, storage());
  };
  // Invested from the Mercury wallet, where the money was moved: chosen first, then the basket opened.
  const investHere = (slug: string | null) => {
    const mercury = wallets.find((w) => w.isPrimary);
    if (mercury !== undefined) choose(mercury.id);
    navigate(slug === null ? "/baskets" : `/baskets/${encodeURIComponent(slug)}`);
  };

  if (next.kind !== "withdraw") {
    const landed = basket.arrived!.holdings;
    const landedUsd = landed.reduce((s, h) => s + Number(h.valueUsd), 0);
    return (
      <li className="flex flex-col gap-3 rounded-lg bg-ds-panel px-4 py-4">
        <p className="text-[13px] font-medium text-ds-ink" role="status">
          {usd(landedUsd)} arrived in {wallet} from this basket: {holdingsLine({ holdings: landed })}.
        </p>
        {next.kind === "move-shares" ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={panels.move}>
              Move shares to Mercury
            </Button>
          </div>
        ) : (
          <>
            <p className="text-[13px] leading-[1.45] text-ds-muted">
              Move it to your Mercury wallet, then invest it in{" "}
              {next.invest === null ? "a Mercury basket" : next.invest.name}, rebalanced for you every day.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={panels.move}>
                Move USDC to Mercury
              </Button>
              <Button onClick={() => investHere(next.invest?.slug ?? null)}>
                {next.invest === null ? "See Mercury baskets" : `Invest in ${next.invest.name}`}
              </Button>
            </div>
          </>
        )}
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg bg-ds-panel px-4 py-4">
      <div className="flex justify-between gap-3 text-[13px]">
        <span className="min-w-0 truncate text-ds-muted">{holdingsLine(basket)}</span>
        <span className="shrink-0 font-medium text-ds-ink">{usd(Number(basket.valueUsd))}</span>
      </div>
      <div
        role="radiogroup"
        aria-label="How to bring it in"
        className="grid grid-cols-2 gap-1 rounded-lg bg-white p-1 text-[13px]"
      >
        {(
          [
            ["shares", "Keep the shares"],
            ["usdc", "Sell, reinvest here"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={choice === value}
            onClick={() => pick(value)}
            className={`rounded-md px-2 py-2 font-medium ${choice === value ? "bg-ds-panel text-ds-ink" : "text-ds-muted hover:text-ds-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <ol className="flex flex-col gap-1.5 text-[13px] leading-[1.45] text-ds-ink">
        {handoffSteps(choice, wallet, basket.similar).map((step, i) => (
          <li key={step}>
            <span className="font-medium">{i + 1}.</span> {step}
          </li>
        ))}
      </ol>
      {choice === "usdc" && (
        <p className="text-[12px] leading-[1.45] text-ds-muted">
          {USDC_COST_NOTE} {SHARES_INSTEAD_NOTE}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <a
          href={GLIDER_APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center rounded-full bg-white px-4 text-[13px] font-semibold text-ds-ink hover:bg-black/5"
        >
          Open Glider ↗
        </a>
      </div>
    </li>
  );
};

/**
 * Baskets a linked wallet runs on Glider outside Mercury. Mercury can see
 * them on the chain but can't withdraw them: a basket belongs to the app that
 * made it, and only that app's Glider account can ask for a withdrawal. So the
 * card says what they hold and guides the person, the way they choose: keep
 * the shares and move them here, or sell to USDC and reinvest in a Mercury
 * basket. It follows along: once the withdrawal lands, it asks for the next
 * step. Shares moved here are costed at the price when they arrived, since
 * Mercury never saw what the basket cost.
 */
export const OutsideBaskets = ({ name }: { name: string }) => {
  const baskets = useOutsideBaskets();
  const list = baskets.data ?? [];
  if (list.length === 0) return null;
  const total = list.reduce((s, b) => s + Number(b.valueUsd), 0);
  const waiting = list.filter((b) => nextStep(b).kind === "withdraw").length;

  return (
    <section
      aria-label="Baskets on Glider"
      className="flex flex-col gap-4 rounded-xl bg-white px-4 py-4 sm:px-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-medium text-ds-ink">
          {list.length === 1 ? "A basket on Glider" : `${list.length} baskets on Glider`}
        </h2>
        {total > 0 && <p className="text-[16px] font-medium text-ds-ink">{usd(total)}</p>}
      </div>
      {waiting > 0 && (
        <p className="text-[13px] leading-[1.45] text-ds-muted">
          Made in Glider's own app, so Mercury can see {waiting === 1 ? "it" : "them"} but can't withdraw{" "}
          {waiting === 1 ? "it" : "them"} for you. Choose how to bring {waiting === 1 ? "it" : "them"} here:
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {list.map((b) => (
          <Basket key={b.address} basket={b} wallet={name} />
        ))}
      </ul>
    </section>
  );
};
