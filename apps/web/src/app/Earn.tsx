import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  earnErrorText,
  useEarn,
  useEarnAction,
  useEarnVault,
  useEarnVaults,
  type Earn as EarnData,
  type EarnVault,
  type VaultRange,
} from "../api/earn";
import { Button } from "../ui/Button";
import { PanelHeader, SidePanel } from "../ui/Dialog";
import { InfoTip, RangeSwitch, StatusChip } from "../ui/ds";
import { Alert, ChevronDown, Plus, Search } from "../ui/icons";
import { interestText, pct, usd, usdCompact } from "@mercury/view";
import { AppShell } from "./AppShell";
import { DotChart } from "./DotChart";
import { KIND_LABEL, VaultMark, rate } from "./earn/VaultMark";
import { floorCents } from "./earn/moves";
import { usePanels } from "./Panels";
import { HeaderFigure } from "./portfolio/Summary";
import { Skeleton } from "./portfolio/ui";
import { Sparkline } from "./Sparkline";
import { chip } from "./stock/Ticket";

const RANGES: readonly VaultRange[] = ["1M", "3M", "1Y"];
const SINCE: Record<VaultRange, string> = {
  "1M": "the past month",
  "3M": "the past 3 months",
  "1Y": "the past year",
};
const PAGE = 8;

type Sort = "picks" | "rate" | "size";
const SORTS: readonly { key: Sort; label: string }[] = [
  { key: "picks", label: "Recommended" },
  { key: "rate", label: "Highest rate" },
  { key: "size", label: "Largest" },
];

const KIND_NOTE: Record<NonNullable<EarnVault["kind"]>, string> = {
  crypto:
    "Lent to people borrowing against SOL, Bitcoin and other crypto, sold on-chain if it falls too far.",
  mixed: "Part crypto loans, part credit to real-world borrowers.",
  "real-world": "Lent to real-world borrowers through protocols like OnRe and Huma, and repaid off-chain.",
};

/** How it works, for somebody with nothing in yet: three lines, then the vaults. */
const STEPS = [
  { title: "Pick a vault", body: "Mercury's picks are first. Each lends USDC on Kamino." },
  { title: "Move cash in", body: "One tap to sign. Mercury pays the network fee." },
  { title: "Withdraw any time", body: "Your cash and what it earned, back in seconds." },
] as const;

/**
 * Earn, its own tab: idle cash lent out through Kamino vaults. Nothing moves
 * on its own — money goes in when you move it in, and comes out when you
 * withdraw. At the top, what you have in it (or how it works, before you do);
 * below, every vault on offer, Mercury's picks first, to search and page
 * through. A vault opens in full in a side panel.
 */
export const Earn = () => {
  const earn = useEarn();
  const vaults = useEarnVaults();
  const action = useEarnAction();
  const panels = usePanels();
  const e = earn.data;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("picks");
  const [page, setPage] = useState(0);
  // The open vault lives in the URL, so a vault can be linked to and Back closes it.
  const [params, setParams] = useSearchParams();
  const open = params.get("v");
  const setOpen = (vault: string | null) =>
    setParams(
      (p) => {
        if (vault === null) p.delete("v");
        else p.set("v", vault);
        return p;
      },
      { replace: vault === null },
    );
  // The vault the panel last showed, so it keeps its contents while it slides away.
  const [last, setLast] = useState<string | null>(null);
  if (open !== null && open !== last) setLast(open);

  const busy = action.isPending;
  const idle = e ? floorCents(e.walletUsd) : 0;
  const earning = (e?.holdings.length ?? 0) > 0;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (vaults.data ?? []).filter(
      (v) => q === "" || v.name.toLowerCase().includes(q) || (v.curator ?? "").toLowerCase().includes(q),
    );
    if (sort === "rate") return [...list].sort((a, b) => b.apy - a.apy);
    if (sort === "size") return [...list].sort((a, b) => b.tvlUsd - a.tvlUsd);
    return list;
  }, [vaults.data, query, sort]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const at = Math.min(page, pages - 1);
  // A vault held after it left the list is not among the vaults on offer, and still opens.
  const panelVault =
    vaults.data?.find((v) => v.address === (open ?? last)) ??
    e?.holdings.find((h) => h.address === (open ?? last)) ??
    null;

  /**
   * Everything in Earn moves to this vault: out of each other one, then what
   * came out goes in. Only that: the wallet's own cash stays where it is.
   */
  const moveAllTo = (v: EarnVault) => {
    if (!e || busy) return;
    const elsewhere = e.holdings.filter((h) => h.address !== v.address);
    action.mutate({
      intents: [
        ...elsewhere.map((h) => ({ kind: "withdraw", usd: "all", vault: h.address }) as const),
        { kind: "deposit", usd: { cameOutUpTo: elsewhereUsd(e, v) }, vault: v.address },
      ],
    });
  };

  return (
    <AppShell current="earn" title="Earn" quiet>
      <div className="flex flex-col gap-4 md:gap-6">
        <section aria-label="Earn" className="flex flex-col rounded-xl bg-white xl:min-h-[189px] xl:flex-row">
          <div className="shrink-0 p-4 sm:p-6 xl:w-[395px]">
            {earning && e ? (
              <>
                <p className="text-[14px] leading-none font-medium text-ds-ink">In Earn</p>
                <p className="mt-[9px] text-[36px] leading-none font-medium text-ds-ink">
                  {usd(e.balanceUsd)}
                </p>
                <p className="mt-3 flex h-5 items-center gap-1.5 text-[12px] leading-none">
                  <span className="inline-flex h-5 items-center rounded-md bg-ds-up-chip px-2 text-ds-up">
                    <span className="opacity-80">
                      {e.earnedUsd > 0 ? `+ ${interestText(e.earnedUsd)}` : "Earning"}
                    </span>
                  </span>
                  <span className="text-ds-ink/80">
                    {e.earnedUsd > 0 ? "earned so far" : `${e.apy !== null ? pct(e.apy * 100) : "—"} a year`}
                  </span>
                </p>
              </>
            ) : (
              <>
                <p className="text-[14px] leading-none font-medium text-ds-ink">Earn</p>
                <p className="mt-[9px] text-[28px] leading-[1.15] font-medium text-ds-ink">
                  Put idle cash to work
                </p>
                <p className="mt-2 max-w-[320px] text-[14px] leading-[1.45] text-ds-muted">
                  Lend your USDC through a Kamino vault. It earns by the second, and nothing moves until you
                  move it.
                </p>
              </>
            )}
            <div className="mt-[22px] flex flex-wrap gap-2">
              {idle >= 0.1 ? (
                <Button variant="primary" disabled={busy || !e} onClick={() => panels.earn("add")}>
                  Move {usd(idle)} in
                </Button>
              ) : (
                <Button variant="primary" icon={<Plus />} onClick={panels.addCash}>
                  Add cash
                </Button>
              )}
              {earning && (
                <Button disabled={busy} onClick={() => panels.earn("withdraw")}>
                  Withdraw
                </Button>
              )}
            </div>
          </div>

          <div className="m-1 flex flex-1 flex-col justify-center rounded-lg bg-ds-panel p-1 xl:px-1">
            {!e ? (
              <div className="grid gap-3 p-4 sm:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : earning ? (
              <div className="flex flex-col gap-1">
                {e.holdings.map((h) => (
                  <button
                    key={h.address}
                    type="button"
                    onClick={() => setOpen(h.address)}
                    className="flex h-[60px] items-center gap-3 rounded-md px-4 text-left hover:bg-white/60"
                  >
                    <VaultMark vault={h} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] leading-[18px] font-medium text-ds-ink">
                        {h.name}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-4 text-ds-muted">
                        {rate(h.apy)} a year now
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[14px] leading-[18px] font-medium text-ds-ink">
                        {usd(h.balanceUsd)}
                      </span>
                      <span
                        className={`mt-0.5 block text-[12px] leading-4 ${h.earnedUsd > 0 ? "text-ds-up" : "text-ds-muted"}`}
                      >
                        {h.earnedUsd > 0 ? `+ ${interestText(h.earnedUsd)}` : "Just started"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <ol className="grid gap-6 px-5 py-5 sm:grid-cols-3 xl:px-8">
                {STEPS.map((s, i) => (
                  <li key={s.title} className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-[12px] font-medium text-ds-ink">
                      {i + 1}
                    </span>
                    <span>
                      <span className="block text-[14px] leading-6 font-medium text-ds-ink">{s.title}</span>
                      <span className="mt-1 block text-[12px] leading-[1.45] text-ds-muted">{s.body}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        {(busy || action.error) && (
          <p
            className={`flex gap-2 rounded-lg px-4 py-3 text-[12px] leading-[1.45] ${busy ? "bg-white text-ds-muted" : "bg-ds-down-chip text-ds-chip-down"}`}
          >
            {!busy && <Alert className="mt-px size-3.5 shrink-0" />}
            {busy ? "Moving your cash… confirm in your wallet if it asks." : earnErrorText(action.error)}
          </p>
        )}

        <section aria-label="Vaults" className="min-w-0">
          <header className="flex flex-wrap items-center justify-between gap-3 pb-3">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[16px] leading-none font-medium text-ds-ink">Vaults</h2>
              {vaults.data && <span className="text-[14px] leading-none text-ds-muted">{shown.length}</span>}
              <InfoTip label="Which vaults are here" align="start">
                Every USDC vault on Kamino with over $50k in it and real depositors. Mercury&apos;s picks come
                first: large, long-running, with a known curator. Rates move every day. Not a bank account and
                not insured.
              </InfoTip>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md bg-white px-3 outline-1 -outline-offset-1 outline-black/5 focus-within:outline-black/15 sm:w-56 sm:flex-none max-sm:h-10">
                <Search className="size-3.5 shrink-0 text-ds-muted" />
                <input
                  value={query}
                  onChange={(ev) => (setQuery(ev.target.value), setPage(0))}
                  placeholder="Search vaults or curators"
                  aria-label="Search vaults"
                  className="w-full min-w-0 bg-transparent text-[14px] text-ds-ink outline-none placeholder:text-ds-muted"
                />
              </label>
              <div role="group" aria-label="Sort" className="flex gap-1">
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={sort === s.key}
                    onClick={() => (setSort(s.key), setPage(0))}
                    className={`${chip(sort === s.key)} shrink-0 px-3`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </header>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {!vaults.data
              ? Array.from({ length: PAGE }, (_, i) => (
                  <Skeleton key={i} className="h-[224px] w-full rounded-xl" />
                ))
              : shown
                  .slice(at * PAGE, at * PAGE + PAGE)
                  .map((v) => (
                    <VaultCard
                      key={v.address}
                      vault={v}
                      held={e?.holdings.find((h) => h.address === v.address)?.balanceUsd ?? 0}
                      onOpen={() => setOpen(v.address)}
                    />
                  ))}
          </div>
          {vaults.data && shown.length === 0 && (
            <p className="flex h-24 items-center justify-center rounded-xl bg-white text-[14px] text-ds-muted">
              No vault matches “{query}”.
            </p>
          )}
          {vaults.isError && (
            <p className="flex h-24 items-center justify-center rounded-xl bg-white text-[14px] text-ds-muted">
              Could not reach Kamino. Try again in a moment.
            </p>
          )}

          {pages > 1 && (
            <nav aria-label="Pages" className="mt-4 flex items-center justify-center gap-1">
              <button
                type="button"
                disabled={at === 0}
                onClick={() => setPage(at - 1)}
                className={`${chip(false)} px-3`}
              >
                Previous
              </button>
              {Array.from({ length: pages }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-current={i === at ? "page" : undefined}
                  onClick={() => setPage(i)}
                  className={`${chip(i === at)} w-8`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                type="button"
                disabled={at >= pages - 1}
                onClick={() => setPage(at + 1)}
                className={`${chip(false)} px-3`}
              >
                Next
              </button>
            </nav>
          )}
        </section>
      </div>

      {panelVault && e && (
        <VaultPanel
          open={open !== null}
          onClose={() => setOpen(null)}
          vault={panelVault}
          earn={e}
          busy={busy}
          onMoveIn={() => {
            setOpen(null);
            panels.earn("add", panelVault.address);
          }}
          onWithdraw={() => {
            setOpen(null);
            panels.earn("withdraw", panelVault.address);
          }}
          onMoveAll={() => {
            moveAllTo(panelVault);
            setOpen(null);
          }}
        />
      )}
    </AppShell>
  );
};

/** What sits in every vault but this one: the figure the switch button shows, and the most it moves. */
const elsewhereUsd = (e: EarnData, v: EarnVault) =>
  floorCents(e.holdings.filter((h) => h.address !== v.address).reduce((s, h) => s + h.balanceUsd, 0));

/** One vault as a card: its mark, the rate in large type, a month of it as dots, and its size. */
const VaultCard = ({ vault, held, onOpen }: { vault: EarnVault; held: number; onOpen: () => void }) => {
  const history = useEarnVault(vault.address, "1M", true);
  const values = history.data?.points.map((p) => p.apy) ?? null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 flex-col rounded-xl bg-white p-1 text-left transition-shadow hover:shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]"
    >
      <span className="flex items-start gap-3 px-4 pt-4">
        <VaultMark vault={vault} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] leading-[18px] font-medium text-ds-ink">
            {vault.name}
          </span>
          <span className="mt-0.5 block truncate text-[12px] leading-4 text-ds-muted">
            {vault.curator ?? "Kamino vault"}
          </span>
        </span>
        {held > 0 ? (
          <StatusChip tone="up">{usd(held)}</StatusChip>
        ) : vault.full ? (
          <StatusChip tone="neutral">Full</StatusChip>
        ) : vault.picked ? (
          <StatusChip tone="owned">Pick</StatusChip>
        ) : null}
      </span>
      <span className="mt-5 flex items-end justify-between gap-3 px-4">
        <span>
          <span className="block text-[28px] leading-none font-medium text-ds-ink">{rate(vault.apy)}</span>
          <span className="mt-2 block text-[12px] leading-none text-ds-muted">
            30d {rate(vault.apy30d)} · 1y {rate(vault.apy365d)}
          </span>
        </span>
        <span className="h-9 w-24 shrink-0">
          {values && values.length > 1 && <Sparkline values={values} className="h-full w-full" />}
        </span>
      </span>
      <span className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-ds-panel px-3 py-2.5 text-[12px] leading-none">
        <span className="truncate text-ds-ink">{vault.kind ? KIND_LABEL[vault.kind] : "Not reviewed"}</span>
        <span className="shrink-0 text-ds-muted">
          {usdCompact(vault.tvlUsd)} · {vault.holders.toLocaleString("en-US")} in
        </span>
      </span>
    </button>
  );
};

/** A vault in full: its rate over time, what it is made of, and what you can do with it. */
const VaultPanel = ({
  open,
  onClose,
  vault,
  earn,
  busy,
  onMoveIn,
  onWithdraw,
  onMoveAll,
}: {
  open: boolean;
  onClose: () => void;
  vault: EarnVault;
  earn: EarnData;
  busy: boolean;
  onMoveIn: () => void;
  onWithdraw: () => void;
  onMoveAll: () => void;
}) => {
  const [range, setRange] = useState<VaultRange>("1M");
  const history = useEarnVault(open ? vault.address : null, range);
  const held = earn.holdings.find((h) => h.address === vault.address);
  const elsewhere = elsewhereUsd(earn, vault);
  const chart = (history.data?.points ?? []).map((p) => ({
    label: new Date(p.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: p.apy * 100,
  }));

  return (
    <SidePanel open={open} onClose={onClose} labelledBy="vault-title">
      <PanelHeader
        id="vault-title"
        title={
          <span className="flex items-center gap-3">
            <VaultMark vault={vault} size={32} />
            <span className="min-w-0 truncate">{vault.name}</span>
          </span>
        }
        sub={
          !vault.offered
            ? "No longer on Mercury's list."
            : (vault.blurb ?? "Listed as Kamino reports it. Not reviewed by Mercury.")
        }
        onClose={onClose}
      />
      <div className="pt-1 pb-6">
        <div className="mt-4 flex items-end justify-between gap-3 px-6">
          <div>
            <p className="text-[12px] leading-none text-ds-muted">Rate now, after fees</p>
            <p className="mt-2 text-[32px] leading-none font-medium text-ds-ink">{rate(vault.apy)}</p>
          </div>
          <RangeSwitch options={RANGES} value={range} onChange={setRange} />
        </div>
        <div className="mt-4 h-[200px] px-6">
          {chart.length > 1 ? (
            <DotChart series={chart} label={SINCE[range]} scale="rate" />
          ) : history.isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <div className="grid h-full place-items-center rounded-lg bg-ds-panel text-[13px] text-ds-muted">
              No history for this range.
            </div>
          )}
        </div>

        {/*
         * The grey cards sit 4px in from the panel's edge, as the rail cards'
         * panels do, and their contents on the same 24px line as the header.
         */}
        <div className="mt-10 flex flex-col gap-1 px-1">
          {/*
           * Off the list, what Kamino's API says about its size and averages is
           * not known here, and nothing more can go in. What is in it is still
           * this person's, and comes out the usual way.
           */}
          {!vault.offered && (
            <p className="rounded-lg bg-ds-panel px-5 py-4 text-[12px] leading-[1.5] text-ds-muted">
              Mercury no longer lists this vault, so nothing more can go in. What you have here is still yours
              and still earning, and you can withdraw it.
            </p>
          )}
          {vault.offered && (
            <div className="rounded-lg bg-ds-panel px-5 py-5">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
                <HeaderFigure
                  size="md"
                  label="30-day average"
                  value={rate(vault.apy30d)}
                  sub={`1 year ${rate(vault.apy365d)}`}
                />
                <HeaderFigure
                  size="md"
                  label="Deposits"
                  value={usdCompact(vault.tvlUsd)}
                  sub={`${vault.holders.toLocaleString("en-US")} depositors`}
                />
                <HeaderFigure
                  size="md"
                  label="Fee"
                  value={pct(vault.performanceFee * 100, 0)}
                  sub={
                    vault.managementFee > 0
                      ? `Of interest, plus ${pct(vault.managementFee * 100)} a year`
                      : "Of interest, to the curator"
                  }
                />
                <HeaderFigure
                  size="md"
                  label="Curator"
                  value={vault.curator ?? "—"}
                  sub={vault.kind ? KIND_LABEL[vault.kind] : "Not reviewed by Mercury"}
                />
              </dl>
              {vault.kind && (
                <p className="mt-5 border-t border-black/5 pt-4 text-[12px] leading-[1.5] text-ds-muted">
                  {KIND_NOTE[vault.kind]}
                </p>
              )}
            </div>
          )}

          {/* Keyed by vault, so a newly opened vault starts folded. */}
          <Allocation key={vault.address} allocation={history.data?.allocation ?? null} />
          {held && (
            <p className="flex items-center justify-between rounded-lg bg-ds-up-chip px-5 py-3.5 text-[14px] text-ds-up">
              <span>You have {usd(held.balanceUsd)} here</span>
              {held.earnedUsd > 0 && <span>+ {interestText(held.earnedUsd)}</span>}
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2 px-6">
          {vault.offered && (
            <Button
              variant="primary"
              size="lg"
              disabled={busy || vault.full}
              onClick={onMoveIn}
              className="w-full"
            >
              {vault.full ? "This vault is full" : held ? "Move more in" : "Move cash in"}
            </Button>
          )}
          {held && (
            <Button size="lg" disabled={busy} onClick={onWithdraw} className="w-full">
              Withdraw
            </Button>
          )}
          {elsewhere > 0 && !vault.full && vault.offered && (
            <Button size="lg" disabled={busy} onClick={onMoveAll} className="w-full">
              Move my {usd(elsewhere)} from other vaults here
            </Button>
          )}
        </div>
      </div>
    </SidePanel>
  );
};

/** Shades of ink for the markets, largest first: one colour, so no market reads as good or bad. */
const SHADES = [1, 0.7, 0.5, 0.36, 0.25, 0.16];

/**
 * Where a vault's money is lent, folded to one row: the split bar, the largest
 * market and how many there are. Opened, a row for each market.
 */
const Allocation = ({
  allocation,
}: {
  allocation: { market: string; name: string; share: number }[] | null;
}) => {
  const [open, setOpen] = useState(false);
  const rows = (allocation ?? []).filter((a) => a.share >= 0.005).slice(0, 6);
  const top = rows[0];
  const many = rows.length > 1;
  return (
    <div className="rounded-lg bg-ds-panel">
      <button
        type="button"
        disabled={!many}
        aria-expanded={many ? open : undefined}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-col gap-3 px-5 py-4 text-left disabled:cursor-default"
      >
        <span className="flex w-full items-center justify-between gap-3 text-[14px] leading-none">
          <span className="font-medium text-ds-ink">Where it lends</span>
          {allocation !== null && top && (
            <span className="flex min-w-0 items-center gap-1.5 text-ds-muted">
              <span className="truncate">
                {many
                  ? `${top.name} ${pct(top.share * 100, 0)} · ${rows.length - 1} more`
                  : `All in ${top.name}`}
              </span>
              {many && (
                <ChevronDown
                  className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                />
              )}
            </span>
          )}
        </span>
        {allocation === null ? (
          <Skeleton className="h-2 w-full rounded-full" />
        ) : rows.length === 0 ? (
          <span className="text-[12px] text-ds-muted">Nothing lent out right now.</span>
        ) : (
          <span className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
            {rows.map((a, i) => (
              <span
                key={a.market}
                className="h-full bg-ds-ink first:rounded-l-full last:rounded-r-full"
                style={{ flexGrow: a.share, opacity: SHADES[i] ?? 0.16 }}
              />
            ))}
          </span>
        )}
      </button>
      {open && many && (
        <ul className="flex flex-col gap-2.5 px-5 pb-4">
          {rows.map((a, i) => (
            <li key={a.market} className="flex items-center gap-2.5 text-[14px] leading-none">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full bg-ds-ink"
                style={{ opacity: SHADES[i] ?? 0.16 }}
              />
              <span className="min-w-0 flex-1 truncate text-ds-ink">{a.name}</span>
              <span className="shrink-0 font-medium text-ds-ink">{pct(a.share * 100, 0)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
