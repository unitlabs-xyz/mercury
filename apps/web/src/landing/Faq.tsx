import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { EASE } from "../motion/config";
import { Section } from "../ui/Section";
import { ChevronDown } from "../ui/icons";

/**
 * The handoff supplies the first answer only; the other four are collapsed in the
 * design with no body copy. The answers below are drawn from docs/02-product.md
 * and the ADRs, and should be reviewed before launch.
 */
const ITEMS = [
  {
    q: "Do I actually own the shares?",
    a: "You own a token that is backed one-for-one by a real share held at a regulated custodian. Dividends arrive as extra shares rather than cash, because the token's multiplier rises.",
  },
  {
    q: "What happens when the US market is shut?",
    a: "The tokens keep trading, but the reference price stops moving, so the quoted price can drift. Harbor checks every order against the last real share price. If the drift is larger than our tolerance we offer to queue the order until the market reopens instead of filling it at a premium.",
  },
  {
    q: "Do I need to verify my identity?",
    a: "No. Harbor never touches bank rails or fiat, so there is nothing to verify. Your wallet is your account, and it works the same from anywhere in the world.",
  },
  {
    q: "What does Harbor charge?",
    a: "Baskets carry 0.5% a year, charged on the position. On an individual order Harbor takes a small spread, the way every retail broker does. Either way the whole cost is on the confirmation screen — price per share, the premium against the real share price, and the fee — before you commit to anything.",
  },
  {
    q: "Can I move my shares somewhere else?",
    a: "Yes. Every holding sits in your own wallet, including baskets, which are a single token you can send like any other. Harbor cannot stop you leaving and does not need to be running for you to hold them.",
  },
];

export const Faq = () => {
  const [open, setOpen] = useState(0);

  return (
    <Section id="faqs" inner="grid items-start gap-10 py-[76px] lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
      <div>
        <h2 className="text-[30px] leading-[1.12] font-semibold tracking-[-0.03em] text-balance sm:text-[40px]">
          The ones people actually ask.
        </h2>
      </div>

      <div className="border-t border-navline">
        {ITEMS.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={item.q} className={i < ITEMS.length - 1 ? "border-b border-navline" : ""}>
              <h3>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`faq-${i}`}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className="group flex w-full items-center justify-between gap-6 py-6 text-left"
                >
                  <span
                    className={`text-[16px] font-semibold tracking-[-0.01em] transition-colors duration-200 group-hover:text-brand sm:text-[18px] ${
                      isOpen ? "text-ink" : "text-ink-soft"
                    }`}
                  >
                    {item.q}
                  </span>
                  <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.32, ease: EASE }}
                    className="inline-flex shrink-0 text-faint group-hover:text-brand"
                  >
                    <ChevronDown className="size-[18px]" />
                  </motion.span>
                </button>
              </h3>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    id={`faq-${i}`}
                    role="region"
                    key="answer"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{
                      height: { duration: 0.34, ease: EASE },
                      opacity: { duration: isOpen ? 0.28 : 0.14, delay: isOpen ? 0.08 : 0 },
                    }}
                    className="overflow-hidden"
                  >
                    <p className="max-w-[34rem] pb-6 text-[15px] leading-[1.6] text-muted text-pretty">
                      {item.a}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </Section>
  );
};
