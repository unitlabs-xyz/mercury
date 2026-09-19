import { motion } from "motion/react";
import { Section } from "../ui/Section";
import { PRESS } from "../motion/config";
import { ArrowRight, Lock } from "../ui/icons";
import { VaultIllustration } from "../illustrations/Vault";

export const Hero = () => (
  <Section
    id="top"
    inner="grid items-center gap-14 py-16 lg:min-h-[820px] lg:grid-cols-2 lg:pt-20 lg:pb-[90px]"
  >
    <div>
      <p className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-navline bg-white py-1.5 pr-4 pl-1.5 shadow-[0_1px_2px_rgba(27,26,23,0.05)]">
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-up-tint px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap text-up-deep">
          <span className="size-1.5 shrink-0 rounded-full bg-up" />
          Open now
        </span>
        {/* The full sentence needs more room than a phone gives it. */}
        <span className="text-[13px] whitespace-nowrap text-ink-soft sm:hidden">
          590 stocks, any hour
        </span>
        <span className="hidden text-[13px] whitespace-nowrap text-ink-soft sm:inline">
          590 US stocks and funds, any hour of the week
        </span>
      </p>

      <h1 className="text-[40px] leading-[1.06] font-semibold tracking-[-0.035em] text-balance sm:text-[50px] lg:text-[58px]">
        Your investment account, in your own wallet.
      </h1>

      <p className="mt-[22px] max-w-[480px] text-[17px] leading-[1.55] text-muted text-pretty">
        Hold stablecoins, buy real shares of Nvidia, Apple or the S&P 500. No brokerage account,
        no bank transfer, no minimum beyond a few dollars.
      </p>

      <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <motion.button
          type="button"
          whileHover="hover"
          whileTap={{ scale: 0.97 }}
          transition={PRESS}
          className="flex items-center justify-center gap-2 rounded-[10px] bg-brand px-6 py-3.5 text-[15px] font-semibold text-white transition-colors duration-200 hover:bg-brand-deep"
        >
          Connect wallet
          <motion.span variants={{ hover: { x: 3 } }} transition={PRESS} className="inline-flex">
            <ArrowRight className="size-4" />
          </motion.span>
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          transition={PRESS}
          className="rounded-[10px] border border-btnline bg-white px-[22px] py-3.5 text-[15px] font-medium text-ink-soft transition-colors duration-200 hover:border-faint"
        >
          See how it works
        </motion.button>
      </div>

      <p className="mt-[26px] flex items-start gap-[9px] text-[13px] text-muted sm:items-center">
        <Lock className="mt-px size-[15px] shrink-0 text-faint sm:mt-0" />
        Shares held with regulated custodians. Harbor never holds your keys.
      </p>
    </div>

    <div className="mx-auto w-full max-w-[460px] lg:mr-0 lg:ml-auto">
      <VaultIllustration />
    </div>
  </Section>
);
