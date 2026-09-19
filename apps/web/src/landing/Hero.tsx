import { motion } from "motion/react";
import { Section } from "../ui/Section";
import { PRESS, cardIn, riseIn, sequence } from "../motion/config";
import { ArrowRight, Lock } from "../ui/icons";
import { DividendChip, IssuerCard, PortfolioCard } from "./HeroCards";

export const Hero = () => (
  <Section
    id="top"
    inner="grid items-center gap-14 py-16 lg:min-h-[820px] lg:grid-cols-2 lg:pt-20 lg:pb-[90px]"
  >
    <motion.div variants={sequence(0.05, 0.085)} initial="hidden" animate="shown">
      <motion.p
        variants={riseIn}
        className="mb-6 inline-flex items-center gap-[7px] rounded-full border border-navline bg-white px-[13px] py-1.5 text-[12px] font-medium text-muted"
      >
        <span className="size-1.5 shrink-0 rounded-full bg-up" />
        590 US stocks and funds · open every hour of the week
      </motion.p>

      <motion.h1
        variants={riseIn}
        className="text-[40px] leading-[1.06] font-semibold tracking-[-0.035em] text-balance sm:text-[50px] lg:text-[58px]"
      >
        Your investment account, in your own wallet.
      </motion.h1>

      <motion.p
        variants={riseIn}
        className="mt-[22px] max-w-[480px] text-[17px] leading-[1.55] text-muted text-pretty"
      >
        Hold stablecoins, buy real shares of Nvidia, Apple or the S&P 500. No brokerage account,
        no bank transfer, no minimum beyond a few dollars.
      </motion.p>

      <motion.div
        variants={riseIn}
        className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
      >
        <motion.button
          type="button"
          whileHover="hover"
          whileTap={{ scale: 0.97 }}
          transition={PRESS}
          className="flex items-center justify-center gap-2 rounded-[10px] bg-brand px-6 py-3.5 text-[15px] font-semibold text-white transition-colors duration-200 hover:bg-brand-deep"
        >
          Connect wallet
          <motion.span
            variants={{ hover: { x: 3 } }}
            transition={PRESS}
            className="inline-flex"
          >
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
      </motion.div>

      <motion.p
        variants={riseIn}
        className="mt-[26px] flex items-start gap-[9px] text-[13px] text-muted sm:items-center"
      >
        <Lock className="mt-px size-[15px] shrink-0 text-faint sm:mt-0" />
        Shares held with regulated custodians. Harbor never holds your keys.
      </motion.p>
    </motion.div>

    {/* The focal sequence: the base card lands, its line draws itself, then the
        issuer check and the dividend note settle onto its two edges. */}
    <motion.div
      variants={sequence(0.25, 0.16)}
      initial="hidden"
      animate="shown"
      className="relative flex flex-col gap-4 lg:block lg:gap-0 lg:pt-7 lg:pb-10"
    >
      <motion.div variants={cardIn}>
        <PortfolioCard />
      </motion.div>
      <motion.div variants={cardIn} className="lg:relative lg:z-10 lg:-mt-2.5 lg:w-[62%]">
        <IssuerCard />
      </motion.div>
      <motion.div variants={cardIn} className="lg:absolute lg:-top-5 lg:right-0">
        <DividendChip />
      </motion.div>
    </motion.div>
  </Section>
);
