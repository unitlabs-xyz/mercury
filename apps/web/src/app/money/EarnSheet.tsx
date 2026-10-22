import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  earnErrorText,
  useAcceptEarnRisk,
  useEarn,
  useEarnAction,
  useEarnVaults,
  type Earn,
  type EarnHolding,
  type EarnVault,
} from "../../api/earn";
import { VaultMark, rate } from "../earn/VaultMark";
import { floorCents } from "../earn/moves";
import { RISKS, RiskConsent } from "../earn/RiskConsent";
import { Button } from "../../ui/Button";
import { PanelHeader, SidePanel } from "../../ui/Dialog";
import { Alert, Check } from "../../ui/icons";
import { pct, usd } from "@mercury/view";
import { Skeleton } from "../portfolio/ui";
import { RailLine } from "../stock/Panels";
import { chip } from "../stock/Ticket";

export type EarnTab = "add" | "withdraw";

/**
 * Which vault a move is for. Into: the one asked for, else the last one moved
 * into, else Mercury's first pick. Out of: the one asked for, else the one
 * holding most.
 */
const pickVault = (
  e: Earn,
  vaults: readonly EarnVault[],
  tab: EarnTab,
  asked: string | undefined,
): (EarnVault & { balanceUsd: number }) | undefined => {
  if (tab === "withdraw") {
    const held: EarnHolding | undefined =
      e.holdings.find((h) => h.address === asked) ??
      [...e.holdings].sort((a, b) => b.balanceUsd - a.balanceUsd)[0];
    return held;
  }
  const v = vaults.find((x) => x.address === (asked ?? e.selected)) ?? vaults[0];
  return v === undefined
    ? undefined
    : { ...v, balanceUsd: e.holdings.find((h) => h.address === v.address)?.balanceUsd ?? 0 };
};

/**
 * Move cash into Earn, or take it back. The amount well and presets are the
 * borrow sheet's; the figures under them are only what this move changes.
 */
export const EarnSheet = ({
  open,
  onClose,
  tab,
  vault,
}: {
  open: boolean;
  onClose: () => void;
  tab: EarnTab;
  /** The vault to move into or out of. Left out: the chosen one, or for a withdrawal the one holding most. */
  vault?: string | undefined;
}) => {
  const earn = useEarn();
  const vaults = useEarnVaults();
  const action = useEarnAction();
  const accept = useAcceptEarnRisk();
  const [amount, setAmount] = useState("");
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setAgreed(false);
    action.reset();
    accept.reset();
    // Only on opening: the action object is new each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `action` and `accept` on purpose, per above
  }, [open, tab]);

  const e = earn.data;
  const target = e && vaults.data ? pickVault(e, vaults.data, tab, vault) : undefined;
  const adding = tab === "add";
  const max = e && target ? floorCents(adding ? e.walletUsd : target.balanceUsd) : 0;
  const value = Number(amount) || 0;
  const busy = action.isPending || accept.isPending;
  // Money going in asks first, until the current wording is accepted. Money coming out never does.
  const asking = adding && e !== undefined && !e.riskAccepted;
  const close = () => {
    if (!busy) onClose();
  };

  const tooMuch = value > max + 1e-9;
  const tooLittle = adding && e !== undefined && value > 0 && value < (target?.minDepositUsd ?? 0);
  const canSubmit =
    !!target &&
    !(adding && target.full) &&
    value > 0 &&
    !tooMuch &&
    !tooLittle &&
    !busy &&
    (!asking || agreed) &&
    action.walletReady;
  const all = !adding && e !== undefined && value >= max - 0.005;

  const submit = async () => {
    if (!e || !target) return;
    if (asking) {
      // Shown below if it fails; nothing moves without it.
      const ok = await accept.mutateAsync(RISKS.version).then(
        () => true,
        () => false,
      );
      if (!ok) return;
    }
    action.mutate({
      intents: [
        adding
          ? { kind: "deposit", usd: value.toFixed(2), vault: target.address }
          : { kind: "withdraw", usd: all ? "all" : value.toFixed(2), vault: target.address },
      ],
    });
  };

  const label = tooMuch
    ? adding
      ? "Not enough cash"
      : "More than in Earn"
    : adding && target?.full
      ? "This vault is full"
      : tooLittle
        ? `At least ${usd(target?.minDepositUsd ?? 0)}`
        : adding
          ? value > 0
            ? `Move ${usd(value)} in`
            : "Move cash in"
          : `Withdraw ${value > 0 ? usd(value) : ""}`.trim();

  const presets = [
    { label: "25%", v: floorCents(max * 0.25) },
    { label: "50%", v: floorCents(max * 0.5) },
    { label: "Max", v: max },
  ];

  return (
    <SidePanel open={open} onClose={close} labelledBy="earn-title">
      <PanelHeader
        id="earn-title"
        title={adding ? "Move cash to Earn" : "Withdraw from Earn"}
        sub={adding ? "It starts earning as soon as it lands." : "Usually back in your cash in seconds."}
        onClose={close}
      />

      <div className="px-6 pt-1 pb-6">
        {target && !action.isSuccess && (
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-ds-panel px-3 py-3">
            <VaultMark vault={target} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] leading-[18px] font-medium text-ds-ink">
                {target.name}
              </span>
              <span className="mt-0.5 block text-[12px] leading-4 text-ds-muted">
                {rate(target.apy)} a year now · {rate(target.apy30d)} over 30 days
              </span>
            </span>
            {adding && !vault && (
              <Link to="/earn" onClick={close} className="shrink-0 text-[12px] text-ds-link">
                Change
              </Link>
            )}
          </div>
        )}
        {!e || !target ? (
          earn.isError || vaults.isError ? (
            <p className="mt-5 text-[14px] text-ds-muted">Could not reach Kamino.</p>
          ) : e && vaults.data && !target ? (
            <p className="mt-5 text-[14px] text-ds-muted">Nothing in Earn to withdraw.</p>
          ) : (
            <div className="mt-5 flex flex-col gap-2">
              <Skeleton className="h-15 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          )
        ) : action.isSuccess ? (
          <div className="mt-8 flex flex-col items-center text-center">
            <span className="grid size-11 place-items-center rounded-full bg-ds-up-chip text-ds-up">
              <Check className="size-5" />
            </span>
            <p className="mt-4 text-[20px] leading-none font-medium text-ds-ink">Done</p>
            <p className="mt-3 text-[14px] leading-[1.45] text-ds-muted">
              {adding ? `Earning in ${target?.name ?? "Earn"}.` : "Back in your cash."}
            </p>
            <Button variant="primary" size="lg" onClick={onClose} className="mt-6 w-full">
              Close
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-lg bg-ds-panel p-1">
              <label className="flex h-15 items-center gap-1 rounded-md bg-white px-4 focus-within:outline-1 focus-within:outline-black/10">
                <span className="text-[28px] leading-none font-medium text-ds-muted">$</span>
                <input
                  value={amount}
                  onChange={(ev) => {
                    const v = ev.target.value.replace(/[^0-9.]/g, "");
                    setAmount(v.startsWith(".") ? `0${v}` : v);
                  }}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Amount in dollars"
                  className="w-full min-w-0 bg-transparent text-[28px] leading-none font-medium text-ds-ink outline-none placeholder:text-ds-muted/50"
                />
                <span className="shrink-0 text-[12px] text-ds-muted">USD</span>
              </label>
              <div
                className="mt-1 grid auto-cols-fr grid-flow-col gap-1"
                role="group"
                aria-label="Amount presets"
              >
                {presets.map((q) => {
                  const v = q.v.toFixed(2);
                  const on = amount !== "" && amount === v;
                  return (
                    <button
                      key={q.label}
                      type="button"
                      disabled={q.v <= 0}
                      onClick={() => setAmount(v)}
                      aria-pressed={on}
                      className={`${chip(on)} truncate px-2`}
                    >
                      {q.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="mt-2.5 px-1 text-[12px] leading-[1.45] text-ds-muted">
              {adding ? `${usd(e.walletUsd)} cash` : `${usd(target.balanceUsd)} in this vault`}
            </p>

            <dl className="mt-5 flex flex-col gap-3 px-1">
              {adding ? (
                <>
                  <RailLine k="Rate">{pct(target.apy * 100)} a year, variable</RailLine>
                  <RailLine k="Earns about">
                    {value > 0 ? `${usd((value * target.apy) / 12)} a month` : "—"}
                  </RailLine>
                </>
              ) : (
                <>
                  <RailLine k="Left in Earn">
                    {usd(Math.max(0, all ? 0 : target.balanceUsd - value))}
                  </RailLine>
                  <RailLine k="Arrives">Usually in seconds</RailLine>
                </>
              )}
              <RailLine k="Network fee">Paid by Mercury</RailLine>
            </dl>

            {asking && <RiskConsent agreed={agreed} onAgreed={setAgreed} className="mt-5" />}

            {!busy && (action.error ?? accept.error) && (
              <p className="mt-4 flex gap-2 rounded-lg bg-ds-down-chip px-3 py-2.5 text-[12px] leading-[1.45] text-ds-chip-down">
                <Alert className="mt-px size-3.5 shrink-0" />
                {earnErrorText(action.error ?? accept.error)}
              </p>
            )}

            <Button
              variant="primary"
              size="lg"
              disabled={!canSubmit}
              loading={busy}
              onClick={() => void submit()}
              className="mt-6 w-full"
            >
              {label}
            </Button>
          </>
        )}
      </div>
    </SidePanel>
  );
};
