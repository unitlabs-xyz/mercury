import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUp, Plus, Trend } from "../ui/icons";
import { AppShell } from "./AppShell";
import { useMoney } from "../api/hooks";
import { pct, usd } from "./format";
import { Receive } from "./Receive";
import { Send } from "./Send";

export const Money = () => {
  const [sending, setSending] = useState(false);
  const money = useMoney();

  return (
    <AppShell
      current="money"
      title="Money"
      actions={
        <>
          <button
            type="button"
            onClick={() => setSending(true)}
            className="flex items-center gap-[7px] rounded-[9px] border border-btnline bg-white px-3.5 py-2.5 max-sm:min-h-11 text-[13px] font-medium text-ink-soft transition-colors hover:border-faint"
          >
            <ArrowUp className="size-[15px] rotate-45" />
            Send
          </button>
          <a
            href="#receive"
            className="flex items-center gap-[7px] rounded-[9px] bg-brand px-4 py-2.5 max-sm:min-h-11 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep"
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
            {usd(money.data?.balanceUsd)}
          </p>
          <p className="mt-2.5 flex flex-wrap items-center gap-2.5">
            <span className="rounded-md bg-up-tint px-2 py-[3px] text-[14px] font-semibold text-up-deep">
              Earning {pct(Number(money.data?.yieldApr ?? 0) * 100)}
            </span>
            <span className="text-[13px] text-faint">paid into this balance</span>
          </p>

          <dl className="mt-7 grid gap-3 border-t border-hair pt-5">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[13px] text-ink-soft">Interest earned this year</dt>
              <dd className="text-[13px] font-semibold tabular-nums">
                {usd(money.data?.interestEarnedYtdUsd)}
              </dd>
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

      <Send open={sending} onClose={() => setSending(false)} />
    </AppShell>
  );
};
