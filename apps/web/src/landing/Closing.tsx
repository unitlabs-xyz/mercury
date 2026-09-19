import { motion } from "motion/react";
import { PRESS } from "../motion/config";
import { Section } from "../ui/Section";
import { Anchor, ArrowRight } from "../ui/icons";

export const CallToAction = () => (
  <Section inner="pb-[76px]">
    <div className="flex flex-col items-start justify-between gap-8 rounded-[20px] border border-cardline bg-white p-8 sm:p-[60px] lg:flex-row lg:items-center lg:gap-12">
      <div>
        <h2 className="text-[28px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[38px]">
          Open an investment account in about a minute.
        </h2>
        <p className="mt-3.5 text-[16px] text-muted">
          No paperwork, no waiting, no bank. Start with $3 if you want to.
        </p>
      </div>
      <motion.button
        type="button"
        whileHover="hover"
        whileTap={{ scale: 0.97 }}
        transition={PRESS}
        className="flex shrink-0 items-center gap-2.5 rounded-[11px] bg-brand px-7 py-4 text-[16px] font-semibold text-white transition-colors duration-200 hover:bg-brand-deep"
      >
        Connect wallet
        <motion.span variants={{ hover: { x: 3 } }} transition={PRESS} className="inline-flex">
          <ArrowRight className="size-[17px]" />
        </motion.span>
      </motion.button>
    </div>
  </Section>
);

/* Every link here goes somewhere. The four under Explore are sections on this
   page; Company and Legal are routes still to be built. */
const COLUMNS = [
  {
    heading: "Explore",
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Both issuers", href: "#issuers" },
      { label: "Baskets", href: "#baskets" },
      { label: "Questions", href: "#faqs" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
    ],
  },
];

export const Footer = () => (
  <footer className="border-t border-rule">
    <div className="gutter mx-auto grid w-full max-w-[1440px] gap-10 pt-[52px] pb-10 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
      <div>
        <a href="#top" className="group inline-flex items-center gap-2.5">
          <span className="grid size-[26px] place-items-center rounded-lg bg-brand text-shell transition-colors duration-200 group-hover:bg-brand-deep">
            <Anchor className="size-[15px]" />
          </span>
          <span className="text-[16px] font-semibold tracking-[-0.01em]">Harbor</span>
        </a>
      </div>

      {COLUMNS.map((col) => (
        <nav key={col.heading} aria-label={col.heading}>
          <p className="mb-3.5 text-[13px] font-semibold">{col.heading}</p>
          <ul className="grid gap-0 lg:gap-[11px]">
            {col.links.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  className="flex min-h-11 items-center text-[13px] text-muted underline-offset-4 transition-colors duration-200 hover:text-ink hover:underline focus-visible:text-ink lg:inline-block lg:min-h-0"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ))}
    </div>

    <div className="gutter mx-auto w-full max-w-[1440px] border-t border-hair py-8">
      <div className="grid max-w-[70ch] gap-2.5 text-[13px] leading-[1.6] text-faint">
        <p>
          Harbor is an interface to tokenised securities issued by Backed and Ondo Global
          Markets. It is not a broker and not a custodian: it cannot move, freeze or borrow
          against anything you hold.
        </p>
        <p>
          Investing carries risk. The value of your holdings can fall as well as rise, and past
          performance does not guarantee future results. Nothing on this page is investment
          advice.
        </p>
        <p>Harbor is not affiliated with Backed, Ondo, Solana or Privy.</p>
      </div>
    </div>

    <div className="gutter mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 border-t border-hair py-6">
      <span className="text-[13px] text-faint">© 2026 Harbor</span>
      <span className="text-[13px] text-faint">Prices measured 19 September 2026</span>
    </div>
  </footer>
);
