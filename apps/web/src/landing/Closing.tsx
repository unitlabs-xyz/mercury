import { Section } from "../ui/Section";
import { Anchor, ArrowRight } from "../ui/icons";

const COLUMNS = [
  { heading: "Product", links: ["Stocks", "Baskets", "Recurring", "Cash"] },
  { heading: "Learn", links: ["How it works", "Issuers", "Fees", "FAQs"] },
  { heading: "Company", links: ["About", "Terms", "Privacy", "Contact"] },
];

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
      <button
        type="button"
        className="group flex shrink-0 items-center gap-2.5 rounded-[11px] bg-brand px-7 py-4 text-[16px] font-semibold text-white transition-colors hover:bg-brand-deep"
      >
        Connect wallet
        <ArrowRight className="size-[17px] transition-transform duration-300 ease-(--ease-out) group-hover:translate-x-0.5" />
      </button>
    </div>
  </Section>
);

export const Footer = () => (
  <footer className="border-t border-rule">
    <div className="gutter mx-auto grid w-full max-w-[1440px] gap-10 pt-[52px] pb-10 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="grid size-[26px] place-items-center rounded-lg bg-brand text-shell">
            <Anchor className="size-[15px]" />
          </span>
          <span className="text-[16px] font-semibold tracking-[-0.01em]">Harbor</span>
        </div>
        <p className="mt-4 max-w-[300px] text-[13px] leading-[1.6] text-faint text-pretty">
          Investing carries risk and past performance does not guarantee future results. Harbor is
          an interface to tokenised securities issued by third parties.
        </p>
      </div>

      {COLUMNS.map((col) => (
        <div key={col.heading} className="grid content-start gap-0 lg:gap-[11px]">
          <p className="mb-[3px] text-[13px] font-semibold">{col.heading}</p>
          {col.links.map((link) => (
            <a
              key={link}
              href="#top"
              className="flex min-h-11 items-center text-[13px] text-muted transition-colors hover:text-ink lg:block lg:min-h-0"
            >
              {link}
            </a>
          ))}
        </div>
      ))}
    </div>

    <div className="gutter mx-auto flex w-full max-w-[1440px] items-center justify-between pt-[18px] pb-[34px]">
      <span className="font-mono text-[11px] text-faint">© 2026 HARBOR</span>
      <span className="font-mono text-[11px] text-faint">BUILT ON SOLANA</span>
    </div>
  </footer>
);
