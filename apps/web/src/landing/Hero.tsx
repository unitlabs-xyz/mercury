import { Section } from "../ui/Section";
import { ArrowRight, Lock } from "../ui/icons";
import { DividendChip, IssuerCard, PortfolioCard } from "./HeroCards";

export const Hero = () => (
  <Section
    id="top"
    inner="grid items-center gap-14 py-16 lg:min-h-[820px] lg:grid-cols-2 lg:pt-20 lg:pb-[90px]"
  >
    <div>
      <p className="rise mb-6 inline-flex items-center gap-[7px] rounded-full border border-navline bg-white px-[13px] py-1.5 text-[12px] font-medium text-muted">
        <span className="size-1.5 shrink-0 rounded-full bg-up" />
        590 US stocks and funds · open every hour of the week
      </p>

      <h1 className="rise text-[40px] leading-[1.06] font-semibold tracking-[-0.035em] text-balance [animation-delay:90ms] sm:text-[50px] lg:text-[58px]">
        Your investment account, in your own wallet.
      </h1>

      <p className="rise mt-[22px] max-w-[480px] text-[17px] leading-[1.55] text-muted text-pretty [animation-delay:180ms]">
        Hold stablecoins, buy real shares of Nvidia, Apple or the S&P 500. No brokerage account,
        no bank transfer, no minimum beyond a few dollars.
      </p>

      <div className="rise mt-8 flex flex-col items-stretch gap-3 [animation-delay:270ms] sm:flex-row sm:items-center">
        <button
          type="button"
          className="group flex items-center justify-center gap-2 rounded-[10px] bg-brand px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-deep"
        >
          Connect wallet
          <ArrowRight className="size-4 transition-transform duration-300 ease-(--ease-out) group-hover:translate-x-0.5" />
        </button>
        <button
          type="button"
          className="rounded-[10px] border border-btnline bg-white px-[22px] py-3.5 text-[15px] font-medium text-ink-soft transition-colors hover:border-faint"
        >
          See how it works
        </button>
      </div>

      <p className="rise mt-[26px] flex items-start gap-[9px] text-[13px] text-muted [animation-delay:360ms] sm:items-center">
        <Lock className="mt-px size-[15px] shrink-0 text-faint sm:mt-0" />
        Shares held with regulated custodians. Harbor never holds your keys.
      </p>
    </div>

    {/* Layered cards. The issuer card is offset left and clears the figures above it. */}
    <div className="relative flex flex-col gap-4 lg:block lg:gap-0 lg:pt-[26px] lg:pb-10 lg:pl-[34px]">
      <PortfolioCard />
      <IssuerCard />
      <DividendChip />
    </div>
  </Section>
);
