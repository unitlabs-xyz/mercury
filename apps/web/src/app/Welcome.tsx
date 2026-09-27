import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PRESS } from "../motion/config";
import { Dialog } from "../ui/Dialog";
import { Plus } from "../ui/icons";

const SEEN = "harbor.welcome.seen";

const STEPS = [
  {
    title: "Add cash",
    body: "Send USDC on Solana. It starts earning 4.1% the moment it lands, and keeps earning until you buy something.",
  },
  {
    title: "Pick what to hold",
    body: "A single company, or a whole basket in one action. Harbor quotes both issuers and routes to whichever is genuinely cheaper at your size.",
  },
  {
    title: "Watch it work",
    body: "Positions, returns and dividends in one place — including the shares you gain when a token's multiplier rises.",
  },
];

export const Welcome = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // First arrival only. Storage can throw in a private window, so never let it
  // decide whether the app renders.
  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN, "1");
    } catch {
      /* not worth surfacing */
    }
  };

  return (
    <Dialog open={open} onClose={dismiss} labelledBy="welcome-heading" className="max-w-[560px]">
      <div className="p-7 sm:p-10">
        <h2
          id="welcome-heading"
          className="text-[26px] leading-[1.15] font-semibold tracking-[-0.03em] text-balance sm:text-[34px]"
        >
          Three steps and you own shares
        </h2>
        <p className="mt-3 text-[15px] leading-[1.55] text-muted text-pretty">
          Your wallet is live and empty. Here is what happens next.
        </p>

        <ol className="mt-8 grid gap-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-tint text-[13px] font-semibold text-brand-deep">
                {i + 1}
              </span>
              <div>
                <p className="text-[16px] font-semibold tracking-[-0.01em]">{s.title}</p>
                <p className="mt-1 text-[14px] leading-[1.5] text-muted text-pretty">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-9 flex flex-col-reverse items-stretch gap-3 border-t border-hair pt-6 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={dismiss}
            className="flex min-h-11 items-center justify-center rounded-[10px] px-3 text-[14px] font-medium text-muted transition-colors hover:bg-shell hover:text-ink"
          >
            Look around first
          </button>
          <motion.button
            type="button"
            onClick={() => {
              dismiss();
              navigate("/money#receive");
            }}
            whileTap={{ scale: 0.97 }}
            transition={PRESS}
            className="flex items-center justify-center gap-2 rounded-[9px] bg-brand px-5 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-brand-deep"
          >
            <Plus className="size-4" />
            Add cash
          </motion.button>
        </div>
      </div>
    </Dialog>
  );
};
