import { motion } from "motion/react";
import { useState } from "react";
import { PRESS } from "../motion/config";
import { Alert, Check, Copy } from "../ui/icons";
import { ADDRESS } from "./data";

/** Stands in until a real address encoder is wired up. */
export const QrBlock = ({ size = 128 }: { size?: number }) => (
  <div
    aria-hidden
    style={{ width: size, height: size }}
    className="grid shrink-0 grid-cols-7 grid-rows-7 gap-[2px] rounded-xl bg-ink p-3"
  >
    {[
      "col-start-1 col-end-4 row-start-1 row-end-4 rounded-sm",
      "col-start-5 col-end-8 row-start-1 row-end-4 rounded-sm",
      "col-start-1 col-end-4 row-start-5 row-end-8 rounded-sm",
      "col-start-5 col-end-6 row-start-5 row-end-6",
      "col-start-7 col-end-8 row-start-5 row-end-6",
      "col-start-6 col-end-7 row-start-6 row-end-7",
      "col-start-5 col-end-6 row-start-7 row-end-8",
      "col-start-7 col-end-8 row-start-7 row-end-8",
      "col-start-4 col-end-5 row-start-4 row-end-5",
    ].map((cls) => (
      <span key={cls} className={`bg-white ${cls}`} />
    ))}
  </div>
);

export const CopyAddress = () => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <motion.button
      type="button"
      onClick={copy}
      whileTap={{ scale: 0.97 }}
      transition={PRESS}
      className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep max-sm:min-h-11"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy address"}
    </motion.button>
  );
};

/**
 * Uses the platform share sheet where there is one, and falls back to copying.
 * A button that looked like it shared and did nothing was worse than no button.
 */
const ShareAddress = () => {
  const [done, setDone] = useState(false);
  const share = async () => {
    const text = `My Harbor address: ${ADDRESS}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Harbor address", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      /* dismissed, or no permission: nothing to report */
    }
  };
  return (
    <motion.button
      type="button"
      onClick={share}
      whileTap={{ scale: 0.97 }}
      transition={PRESS}
      className="rounded-lg border border-btnline px-3.5 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:border-faint max-sm:min-h-11"
    >
      {done ? "Copied to share" : "Share"}
    </motion.button>
  );
};

export const Receive = () => (
  <section
    id="receive"
    aria-label="Receive"
    className="rounded-2xl border border-cardline bg-white p-6 sm:p-7"
  >
    <h2 className="text-[15px] font-semibold">Add cash</h2>
    <p className="mt-1.5 text-[14px] leading-[1.5] text-muted text-pretty">
      Send USDC to this address. It starts earning the moment it arrives.
    </p>

    <div className="mt-6 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
      <QrBlock />
      <div className="min-w-0 flex-1">
        <p className="mb-2 text-[12px] font-medium text-faint">Your Solana address</p>
        <p className="font-mono text-[14px] leading-[1.6] break-all">{ADDRESS}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <CopyAddress />
          <ShareAddress />
        </div>
      </div>
    </div>

    <p className="mt-6 flex items-start gap-2.5 rounded-xl bg-warn-tint px-4 py-3 text-[13px] leading-[1.5] text-warn">
      <Alert className="mt-px size-4 shrink-0" />
      Solana network only, and USDC only. Anything sent on another network, or in another token,
      is lost.
    </p>

    <p className="mt-4 text-[13px] leading-[1.5] text-faint text-pretty">
      There is no bank transfer and no card top-up, by choice. Harbor never touches fiat, which is
      why there is nothing to verify and no country to be approved in.
    </p>
  </section>
);
