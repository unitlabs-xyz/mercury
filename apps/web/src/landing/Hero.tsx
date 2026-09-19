import { ArrowRight, Lock } from "../ui/icons";
import { QuoteCard } from "./QuoteCard";

export const Hero = () => (
  <section className="grid items-center gap-12 px-6 py-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:gap-16 lg:px-9 lg:py-[clamp(5rem,16vh,12rem)]">
    <div>
      <p className="rise inline-flex items-center gap-2.5 rounded-full border border-line bg-card px-4 py-2 text-[12.5px] text-ink-soft sm:text-[13.5px]">
        <span className="size-[7px] rounded-full bg-up" />
        590 US stocks and funds · open every hour of the week
      </p>

      <h1 className="rise mt-7 max-w-[8.9em] text-[clamp(2.75rem,6.4vw,5.1rem)] leading-[0.96] font-bold tracking-[-0.035em] [animation-delay:90ms]">
        Your investment account, in your own wallet.
      </h1>

      <p className="rise mt-7 max-w-[32.5rem] text-[clamp(1.0625rem,1.25vw,1.2rem)] leading-[1.55] text-muted [animation-delay:180ms]">
        Hold stablecoins, buy real shares of Nvidia, Apple or the S&P 500. No brokerage account,
        no bank transfer, no minimum beyond a few dollars.
      </p>

      <div className="rise mt-9 flex flex-wrap items-center gap-3 [animation-delay:270ms]">
        <button
          type="button"
          className="group flex w-full items-center justify-center gap-2.5 rounded-[11px] bg-brand px-6 py-3.5 text-[15.5px] font-semibold text-white transition-colors duration-200 hover:bg-brand-hover sm:w-auto sm:justify-start"
        >
          Connect wallet
          <ArrowRight className="size-[18px] transition-transform duration-300 ease-(--ease-out) group-hover:translate-x-1" />
        </button>
        <button
          type="button"
          className="w-full rounded-[11px] border border-line bg-card px-6 py-3.5 text-[15.5px] font-semibold transition-colors duration-200 hover:border-ink/25 sm:w-auto"
        >
          See how it works
        </button>
      </div>

      <p className="rise mt-7 flex items-start gap-2.5 text-[13.5px] text-muted [animation-delay:360ms] sm:items-center">
        <Lock className="mt-px size-4 shrink-0 text-faint sm:mt-0" />
        Shares held with regulated custodians. Harbor never holds your keys.
      </p>
    </div>

    <div className="rise [animation-delay:200ms]">
      <QuoteCard />
    </div>
  </section>
);
