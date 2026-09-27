import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { useMoney } from "../api/hooks";
import { Button } from "../ui/Button";
import { InfoTip, RailHead } from "../ui/ds";
import { Alert, Check, Copy } from "../ui/icons";

/** Stands in until a real address encoder is wired up. */
export const QrBlock = ({ size = 112 }: { size?: number }) => (
  <div
    aria-hidden
    style={{ width: size, height: size }}
    className="grid shrink-0 grid-cols-7 grid-rows-7 gap-[2px] rounded-lg bg-ds-ink p-2.5"
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

/** A button's contents crossfading to what it says now, instead of snapping. */
const Swap = ({ k, children }: { k: string; children: ReactNode }) => (
  <AnimatePresence mode="wait" initial={false}>
    <motion.span
      key={k}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
      className="inline-flex items-center gap-1.5"
    >
      {children}
    </motion.span>
  </AnimatePresence>
);

/** A button that says it worked for a moment after it did. */
const useFlag = () => {
  const [on, setOn] = useState(false);
  return [on, () => (setOn(true), setTimeout(() => setOn(false), 1600))] as const;
};

export const CopyAddress = () => {
  const address = useMoney().data?.depositAddress ?? "";
  const [copied, flag] = useFlag();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      flag();
    } catch {
      /* no clipboard permission: nothing to report */
    }
  };
  return (
    <Button variant="primary" onClick={copy} disabled={!address} iconSize="md">
      <Swap k={copied ? "copied" : "copy"}>
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy address"}
      </Swap>
    </Button>
  );
};

/**
 * Uses the platform share sheet where there is one, and falls back to copying.
 * A button that looked like it shared and did nothing was worse than no button.
 */
const ShareAddress = () => {
  const address = useMoney().data?.depositAddress ?? "";
  const [done, flag] = useFlag();
  const share = async () => {
    const text = `My Mercury address: ${address}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Mercury address", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      flag();
    } catch {
      /* dismissed, or no permission: nothing to report */
    }
  };
  return (
    <Button onClick={share} disabled={!address}>
      <Swap k={done ? "done" : "share"}>{done ? "Copied to share" : "Share"}</Swap>
    </Button>
  );
};

/**
 * The Solana deposit, wherever it is shown: the address and its code on a grey
 * panel, the two ways to hand it over, then the one rule that loses money if
 * broken. The rail card and the Add cash panel both use this.
 */
export const DepositAddress = () => {
  const address = useMoney().data?.depositAddress;
  return (
    <>
      <div className="flex items-center gap-4 rounded-lg bg-ds-panel p-4">
        <QrBlock />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] leading-none text-ds-muted">Your Solana address</p>
          <p className="mt-2 font-mono text-[13px] leading-[1.5] break-all text-ds-ink">
            {address ?? "Sign in to see your address"}
          </p>
        </div>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1">
        <CopyAddress />
        <ShareAddress />
      </div>
      <p className="mt-4 flex items-start gap-2 rounded-lg bg-ds-warn-chip px-4 py-3 text-[12px] leading-[1.45] text-ds-chip-warn">
        <Alert className="mt-px size-3.5 shrink-0" />
        Solana network only, and USDC only. Anything sent on another network, or in another token, is lost.
      </p>
    </>
  );
};

/** Adding cash, as a rail card: the one instruction, then the deposit address. */
export const Receive = () => (
  <section id="receive" aria-label="Add cash" className="min-w-0 scroll-mt-20 rounded-xl bg-white p-1">
    <div className="px-5 pt-4">
      <RailHead
        title="Add cash"
        meta={
          <span className="flex items-center gap-2 text-ds-muted">
            USDC on Solana
            <InfoTip label="Other ways to add cash">
              Bank transfers and debit cards are coming, through Bridge. Until then, send USDC on Solana from
              any wallet or exchange.
            </InfoTip>
          </span>
        }
      />
      <p className="mt-[13px] text-[14px] leading-[1.45] text-ds-muted">
        Send USDC to this address. It starts earning the moment it arrives.
      </p>
    </div>
    <div className="mt-4">
      <DepositAddress />
    </div>
  </section>
);
