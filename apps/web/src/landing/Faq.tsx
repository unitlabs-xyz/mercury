import { useState } from "react";
import { Section } from "../ui/Section";
import { ChevronDown, Plus } from "../ui/icons";

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
    a: "Baskets carry 0.5% a year, charged on the position. Individual orders pay only the cost of the on-chain route, which is shown in full — price per share, premium and fee — before you confirm anything.",
  },
  {
    q: "Can I move my shares somewhere else?",
    a: "Yes. Every holding sits in your own wallet, including baskets, which are a single token you can send like any other. Harbor cannot stop you leaving and does not need to be running for you to hold them.",
  },
];

export const Faq = () => {
  const [open, setOpen] = useState(0);

  return (
    <Section
      id="faqs"
      inner="grid items-start gap-10 py-[76px] lg:grid-cols-[0.7fr_1.3fr] lg:gap-16"
    >
      <div>
        <p className="eyebrow mb-4">QUESTIONS</p>
        <h2 className="text-[28px] leading-[1.12] font-semibold tracking-[-0.03em] text-balance sm:text-[36px]">
          The ones people actually ask.
        </h2>
      </div>

      <div className="border-t border-navline">
        {ITEMS.map((item, i) => {
          const isOpen = open === i;
          return (
            <div
              key={item.q}
              className={i < ITEMS.length - 1 ? "border-b border-navline" : ""}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? -1 : i)}
                className="flex w-full items-center justify-between gap-6 py-6 text-left"
              >
                <span className="text-[16px] font-semibold tracking-[-0.01em] sm:text-[18px]">
                  {item.q}
                </span>
                {isOpen ? (
                  <ChevronDown className="size-[18px] shrink-0 text-faint" />
                ) : (
                  <Plus className="size-[18px] shrink-0 text-faint" />
                )}
              </button>
              {isOpen && (
                <p className="max-w-[34rem] pb-6 text-[15px] leading-[1.6] text-muted text-pretty">
                  {item.a}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
};
