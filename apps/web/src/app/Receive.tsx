import { AnimatePresence, motion } from "motion/react";
import qrcode from "qrcode-generator";
import { useMemo, useState, type ReactNode } from "react";
import { useMoney } from "../api/hooks";
import { Button } from "../ui/Button";
import { Alert, Check, Copy } from "../ui/icons";

/**
 * The address, as a code a phone can actually read.
 *
 * This was nine hard-coded squares arranged to look like a QR code. It was
 * `aria-hidden`, so it was decoration by the letter of it — but it sat in the
 * funding panel beside a real address, and the thing a person does when they
 * see a QR code next to an address is point a phone at it.
 *
 * Dark modules on white, which is the way round the spec requires. The old
 * block was white on ink and nobody noticed, because it encoded nothing;
 * inverted codes are read by some scanners and not others, and a wallet that
 * cannot read this one costs someone their deposit.
 *
 * Error correction level Q recovers a quarter of the code. For this address
 * length that is the same 33 modules as level M, so the tolerance is free.
 */
export const QUIET = 4;

/**
 * The code as one SVG path, offset by its quiet zone. Separated from the
 * component so it can be tested: a QR code that renders beautifully and
 * decodes to nothing looks exactly like one that works.
 */
export const qrPath = (value: string): { d: string; extent: number } | null => {
  if (value.length === 0) return null;
  const qr = qrcode(0, "Q");
  qr.addData(value, "Byte");
  qr.make();
  const count = qr.getModuleCount();
  let d = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) d += `M${col + QUIET} ${row + QUIET}h1v1h-1z`;
    }
  }
  return { d, extent: count + QUIET * 2 };
};

export const QrBlock = ({ value, size = 112 }: { value?: string | undefined; size?: number }) => {
  const path = useMemo(() => (value ? qrPath(value) : null), [value]);

  // No address yet. A placeholder that is plainly a placeholder, rather than
  // something that looks scannable and is not.
  if (path === null) {
    return (
      <div
        aria-hidden
        style={{ width: size, height: size }}
        className="shrink-0 rounded-lg border border-dashed border-cardline bg-ds-panel"
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${path.extent} ${path.extent}`}
      role="img"
      aria-label="Your Solana address as a QR code"
      className="shrink-0 rounded-lg bg-white"
      shapeRendering="crispEdges"
    >
      {/* The quiet zone is part of the code, not padding around it: without four
          clear modules on every side, a scanner may not find the code at all. */}
      <rect width={path.extent} height={path.extent} fill="white" />
      <path d={path.d} fill="var(--color-ds-ink)" />
    </svg>
  );
};

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
 * The Solana deposit, wherever it is shown: the one rule that loses money if
 * broken, then the address and its code on a grey panel, then the two ways to
 * hand it over. The rail card and the Add cash panel both use this.
 *
 * The rule leads. It used to sit under the buttons, below the fold of the Add
 * cash panel, where it was read after the address had already been copied —
 * and the line above it said only what to send, never what not to. One note,
 * before the address, saying both.
 */
export const DepositAddress = () => {
  const address = useMoney().data?.depositAddress;
  return (
    <>
      <p className="flex items-start gap-2 rounded-lg bg-ds-warn-chip px-4 py-3 text-[12px] leading-[1.45] text-ds-chip-warn">
        <Alert className="mt-px size-3.5 shrink-0" />
        Solana network only, and USDC only. Anything sent on another network, or in another token, is lost.
      </p>
      <div className="mt-1 flex items-center gap-4 rounded-lg bg-ds-panel p-4">
        <QrBlock value={address} />
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
    </>
  );
};
