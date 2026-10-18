import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Plus } from "../ui/icons";
import { MercuryLogo } from "../ui/Logo";

const SEEN = "harbor.welcome.seen";

const STEPS = [
  {
    title: "Add cash",
    body: "Send USDC on Solana, or bring it from any chain. Turn on Earn and idle cash earns a variable rate until you buy something.",
  },
  {
    title: "Pick what to hold",
    body: "A single company, or a whole basket in one action. Mercury quotes both issuers and routes to whichever is genuinely cheaper at your size.",
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
    <Dialog open={open} onClose={dismiss} labelledBy="welcome-heading" className="max-w-[440px] !rounded-xl">
      <div className="px-6 pt-6 pb-6">
        <MercuryLogo className="h-6 w-auto text-ds-ink" />
        <h2
          id="welcome-heading"
          className="mt-7 text-[20px] leading-[1.2] font-medium text-ds-ink text-balance"
        >
          Three steps and you own shares
        </h2>
        <p className="mt-3 text-[14px] leading-[1.5] text-ds-muted text-pretty">
          Your wallet is live and empty. Here is what happens next.
        </p>

        {/* The steps as rows on the grey panel, as the app's lists are set. */}
        <ol className="mt-6 flex flex-col gap-1 rounded-lg bg-ds-panel p-1">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3 rounded-md bg-white px-4 py-3.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ds-panel text-[12px] leading-none font-medium text-ds-ink">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[14px] leading-6 font-medium text-ds-ink">{s.title}</p>
                <p className="mt-1 text-[12px] leading-[1.5] text-ds-muted text-pretty">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 grid grid-cols-2 gap-1">
          <Button onClick={dismiss} className="w-full">
            Look around first
          </Button>
          <Button
            variant="primary"
            icon={<Plus />}
            onClick={() => {
              dismiss();
              // Opens the Add cash panel over this page.
              navigate({ search: "?add=cash" });
            }}
            className="w-full"
          >
            Add cash
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
