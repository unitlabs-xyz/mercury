import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUp, Lock, Plus, Trend } from "../ui/icons";
import { AppShell } from "./AppShell";
import { BORROWING, CASH } from "./data";
import { Receive } from "./Receive";
import { Send } from "./Send";

export const Money = () => {
  const [sending, setSending] = useState(false);

  return (
    <AppShell
      current="money"
      title="Money"
      actions={
        <>
          <button
            type="button"
            onClick={() => setSending(true)}
            className="flex items-center gap-[7px] rounded-[9px] border border-btnline bg-white px-3.5 py-2.5 text-[13px] font-medium text-ink-soft transition-colors hover:border-faint"
          >
            <ArrowUp className="size-[15px] rotate-45" />
            Send
          </button>
          <a
            href="#receive"
            className="flex items-center gap-[7px] rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep"
          >
            <Plus className="size-[15px]" />
            Add cash
          </a>
        </>
      }
    >
      <section className="mt-6 grid gap-[18px] xl:grid-cols-[392px_minmax(0,1fr)]">
        <article className="flex flex-col rounded-2xl border border-cardline bg-white px-6 py-[22px]">
          <p className="text-[13px] font-medium text-muted">Available to invest</p>
          <p className="mt-2 text-[42px] leading-[1.1] font-semibold tracking-[-0.035em] tabular-nums">
            {CASH.available}
          </p>
          <p className="mt-2.5 flex flex-wrap items-center gap-2.5">
            <span className="rounded-md bg-up-tint px-2 py-[3px] text-[14px] font-semibold text-up-deep">
              Earning {CASH.rate}
            </span>
            <span className="text-[13px] text-faint">paid into this balance</span>
          </p>

          <dl className="mt-7 grid gap-3 border-t border-hair pt-5">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[13px] text-ink-soft">Interest earned this year</dt>
              <dd className="text-[13px] font-semibold tabular-nums">{CASH.earnedThisYear}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[13px] text-ink-soft">Last paid</dt>
              <dd className="text-[13px] tabular-nums text-muted">{CASH.lastPaid}</dd>
            </div>
          </dl>

          <Link
            to="/portfolio"
            className="mt-auto flex items-center justify-center gap-2 rounded-[10px] bg-brand px-5 py-3 pt-3 text-[14px] font-semibold text-white transition-colors hover:bg-brand-deep"
          >
            <Trend className="size-4" />
            Put it to work
          </Link>
        </article>

        <Receive />
      </section>

      <section
        aria-label="Borrowing"
        className="mt-[18px] rounded-2xl border border-cardline bg-white p-6 sm:p-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2.5 text-[15px] font-semibold">
            <Lock className="size-4 text-faint" />
            Borrowing
          </h2>
          <span className="rounded-full bg-chip px-2.5 py-1 text-[12px] font-semibold text-faint">
            Not switched on yet
          </span>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
          <p className="max-w-[60ch] text-[14px] leading-[1.6] text-muted text-pretty">
            Pledge the stocks you already hold, draw stablecoins against them, and keep the
            position and anything it goes on to earn. It is a loan against your holdings, not a
            sale, so you are never forced out of a company to raise cash. Kamino already runs this
            market on Solana with the weekend protections we would want, so it is an integration
            rather than something to build.
          </p>

          <dl className="grid gap-3 rounded-xl bg-shell p-5">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[13px] text-ink-soft">Eligible holdings</dt>
              <dd className="text-[13px] font-semibold tabular-nums">{BORROWING.collateral}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[13px] text-ink-soft">At {BORROWING.ltv} of value</dt>
              <dd className="text-[13px] font-semibold tabular-nums">{BORROWING.power}</dd>
            </div>
            <p className="mt-1 border-t border-cardline pt-3 text-[12px] leading-[1.5] text-faint">
              Illustrative. Shown so the roadmap is legible, not as an offer.
            </p>
          </dl>
        </div>
      </section>

      <Send open={sending} onClose={() => setSending(false)} />
    </AppShell>
  );
};
