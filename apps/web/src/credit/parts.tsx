import type { CreditMarket } from "../market/kamino";
import { XSTOCKS_MARKET } from "../market/kamino";
import { DISPLAY_NAME } from "../market/meta";
import { Alert, Clock, Layers, Lock, Refresh, Shield } from "../ui/icons";

/**
 * The content of the credit explainer, with no band or page wrapper, so the
 * public page and the in-app screen render the same words in their own shells
 * rather than drifting apart as two copies.
 */

const pctOf = (n: number) => `${Math.round(n * 100)}%`;
const EXAMPLE = 10_000;

/**
 * `wide` is the full-bleed band treatment, where the headline steps to 40px.
 * Inside the app shell the column is narrower and the headline stays at 30px.
 */
export const Heading = ({
  title,
  body,
  wide = false,
}: {
  title: string;
  body?: string;
  wide?: boolean;
}) => (
  <div className="max-w-[640px]">
    <h2
      className={`text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance ${
        wide ? "sm:text-[40px]" : ""
      }`}
    >
      {title}
    </h2>
    {body && <p className="mt-3 text-[15px] leading-[1.6] text-muted text-pretty">{body}</p>}
  </div>
);

/* ── rates ──────────────────────────────────────────────────────────── */

const ALTERNATIVES = [
  { label: "Credit card", range: "21–28%" },
  { label: "Personal loan", range: "11–20%" },
  { label: "Margin at a broker", range: "6–13%" },
];

export const RateCompare = ({ apy }: { apy: number | null | undefined }) => (
  <>
    <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
      <dl className="flex flex-wrap gap-x-10 gap-y-5">
        {ALTERNATIVES.map((a) => (
          <div key={a.label}>
            <dt className="text-[13px] text-muted">{a.label}</dt>
            <dd className="mt-1 text-[18px] font-semibold tabular-nums">{a.range}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center gap-5 lg:shrink-0">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">Borrowing here</p>
          <p className="mt-1 text-[13px] leading-[1.5] text-muted">
            Because the collateral is already on chain and nobody underwrites you
          </p>
        </div>
        <span className="shrink-0 border-b-2 border-up pb-1 text-[30px] font-semibold tracking-[-0.02em] text-up-deep tabular-nums">
          {apy == null ? "—" : `${(apy * 100).toFixed(2)}%`}
        </span>
      </div>
    </div>
    <p className="mt-6 text-[12px] leading-[1.55] text-muted">
      Alternatives are typical published ranges for context, not offers. Ours is the live USDC
      borrow rate in Kamino's xStocks market and changes with utilisation.
    </p>
  </>
);

/* ── what it is, and why ────────────────────────────────────────────── */

export const WhatItIs = () => (
  <div className="space-y-4 text-[15px] leading-[1.65] text-ink-soft">
    <p>
      Your tokenised shares sit as collateral in a lending market, and you draw dollars against
      them. The shares are not sold and not lent out. When you repay, the claim on them lifts.
    </p>
    <p>
      This is a Lombard loan — borrowing against assets you own — and it is deliberately not
      margin.{" "}
      <strong className="font-semibold text-ink">
        Money you borrow cannot buy stocks inside Harbor.
      </strong>{" "}
      That rule is enforced in code, not policy, because a credit line that funds more of the same
      position is a way to lose twice as fast.
    </p>
    <p>
      Harbor is not the lender. The market is{" "}
      <a
        href="https://app.kamino.finance"
        target="_blank"
        rel="noreferrer noopener"
        className="font-medium text-brand underline decoration-brand/30 underline-offset-[3px] transition-colors hover:decoration-brand"
      >
        Kamino
      </a>
      , the largest lender on Solana, and the rates and limits here are read from it rather than
      set by us.
    </p>
  </div>
);

const REASONS = [
  {
    icon: <Layers className="size-[18px]" />,
    title: "Stay invested",
    body: "Selling ends the position. Borrowing does not — the shares keep whatever they were going to do, up or down.",
  },
  {
    icon: <Refresh className="size-[18px]" />,
    title: "Interest only on what you draw",
    body: "A line, not a lump. Take $500 of a $4,000 limit and you pay for $500.",
  },
  {
    icon: <Lock className="size-[18px]" />,
    title: "Repay whenever",
    body: "No schedule, no instalments, no early repayment fee. Interest accrues by the second and stops when you clear it.",
  },
  {
    icon: <Shield className="size-[18px]" />,
    title: "Nobody underwrites you",
    body: "The collateral does the work, so there is no application, no income check and no credit file to mark.",
  },
];

export const Benefits = () => (
  <ul className="space-y-7">
    {REASONS.map((r) => (
      <li key={r.title} className="flex gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand-deep">
          {r.icon}
        </span>
        <span className="min-w-0">
          <span className="block text-[16px] font-semibold">{r.title}</span>
          <span className="mt-1.5 block text-[14px] leading-[1.6] text-muted text-pretty">
            {r.body}
          </span>
        </span>
      </li>
    ))}
  </ul>
);

/* ── collateral ─────────────────────────────────────────────────────── */

export const CollateralTable = ({
  market,
  loading,
}: {
  market: CreditMarket | undefined;
  loading: boolean;
}) => (
  <>
    <div className="overflow-hidden rounded-2xl border border-cardline bg-white">
      <div className="hidden items-center gap-4 border-b border-hair bg-shell px-5 py-3 text-[12px] tracking-[0.04em] text-faint uppercase sm:flex sm:px-6">
        <span className="flex-1">Holding</span>
        <span className="w-[120px] text-right">Borrow up to</span>
        <span className="w-[150px] text-right">On $10,000 held</span>
      </div>
      {loading
        ? [0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-hair px-5 py-3.5 last:border-b-0 sm:px-6"
            >
              <span className="h-4 w-40 rounded bg-chip" />
              <span className="ml-auto h-4 w-16 rounded bg-chip" />
            </div>
          ))
        : (market?.collateral ?? []).map((c) => (
            <div
              key={c.symbol}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-hair px-5 py-3.5 last:border-b-0 sm:px-6"
            >
              <span className="flex min-w-0 flex-1 items-baseline gap-2.5">
                <span className="truncate text-[15px] font-medium">
                  {DISPLAY_NAME[c.ticker] ?? c.ticker}
                </span>
                <span className="font-mono text-[12px] text-faint">{c.symbol}</span>
              </span>
              <span className="w-[120px] text-right text-[15px] font-semibold tabular-nums">
                {pctOf(c.maxLtv)}
              </span>
              <span className="w-[150px] text-right text-[15px] tabular-nums text-muted">
                ${(EXAMPLE * c.maxLtv).toLocaleString("en-US")}
              </span>
            </div>
          ))}
    </div>
    <p className="mt-4 text-[12px] leading-[1.55] text-muted">
      Read live from Kamino's xStocks market{" "}
      <span className="font-mono">
        {XSTOCKS_MARKET.slice(0, 4)}…{XSTOCKS_MARKET.slice(-4)}
      </span>
      . A holding that is not listed here cannot be borrowed against at all.
    </p>
  </>
);

/* ── steps ──────────────────────────────────────────────────────────── */

const STEPS = [
  {
    title: "See your limit",
    body: "Worked out from what you already hold. Nothing is pledged and nothing is checked.",
  },
  {
    title: "Choose an amount",
    body: "Anything up to the limit. Take less than the maximum and the buffer before trouble is larger.",
  },
  {
    title: "Pledge the holding",
    body: "One signature from your own wallet. The shares stay in your account with a claim on them.",
  },
  {
    title: "Dollars arrive",
    body: "USDC lands in your cash balance, usually inside a minute. Spend, send or hold it.",
  },
];

export const StepList = () => (
  <ol className="space-y-3">
    {STEPS.map((s, i) => (
      <li key={s.title} className="flex gap-4 rounded-2xl border border-cardline bg-white px-5 py-4">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-tint text-[13px] font-semibold text-brand-deep tabular-nums">
          {i + 1}
        </span>
        <span className="min-w-0">
          <span className="block text-[15.5px] font-semibold">{s.title}</span>
          <span className="mt-1 block text-[14px] leading-[1.55] text-muted text-pretty">
            {s.body}
          </span>
        </span>
      </li>
    ))}
  </ol>
);

/* ── risk ───────────────────────────────────────────────────────────── */

const RISKS = [
  {
    icon: <Alert className="size-[18px]" />,
    title: "You can be sold out",
    body: "If your holdings fall far enough, the market sells part of your collateral to repay the loan. It happens automatically, at whatever the price is, and you do not get asked first. Borrowing less than the maximum is what buys you room.",
  },
  {
    icon: <Clock className="size-[18px]" />,
    title: "The weekend gap is real",
    body: "The token trades all week but the exchange does not. Bad news on a Saturday has nowhere to go until Monday's open, and the price can jump straight past the level where a position would have been closed.",
  },
];

export const RiskCards = () => (
  <div className="grid gap-4 lg:grid-cols-2">
    {RISKS.map((r) => (
      <div key={r.title} className="rounded-2xl border border-warn-line bg-warn-tint px-5 py-5">
        <span className="flex items-center gap-2.5 text-warn">
          {r.icon}
          <span className="text-[16px] font-semibold">{r.title}</span>
        </span>
        <p className="mt-2.5 text-[14px] leading-[1.6] text-warn/90 text-pretty">{r.body}</p>
      </div>
    ))}
  </div>
);

export const RiskNote = () => (
  <p className="max-w-[70ch] text-[13px] leading-[1.6] text-muted">
    When this ships, the borrowing screen will show both numbers before you confirm: how far your
    holdings can fall today, and how big a Monday gap the position would survive. If you would not
    be comfortable seeing part of it sold on a morning you were asleep, borrow less or do not
    borrow.
  </p>
);
