import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { EASE, PRESS } from "../motion/config";
import { Alert, Check, Clock, Close, Copy, Lock, Mail } from "../ui/icons";
import { useAuthModal } from "./AuthContext";
import { CodeInput } from "./CodeInput";

type Step = "email" | "code" | "fund";

const WALLETS = [
  { name: "Phantom", swatch: "bg-ink" },
  { name: "Solflare", swatch: "bg-muted" },
  { name: "Backpack", swatch: "bg-bar-soft" },
];

const ADDRESS = "7xQmF4d8Vn2pLs9jKcRb3TyWuAeH6gZxMq1NdP4Rk9";
const RESEND_SECONDS = 30;

/** Privy's own lockup, so the trust signal reads as theirs rather than ours. */
const PrivyMark = () => (
  <span className="flex items-center gap-[9px] text-[13px] text-muted">
    Powered and protected by
    <span className="flex items-center gap-[5px]">
      <span className="size-[13px] rounded-full bg-ink" />
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">privy</span>
    </span>
  </span>
);

/** The decorative QR stands in until a real address encoder is wired up. */
const QrPlaceholder = () => (
  <div
    aria-hidden
    className="grid size-[104px] shrink-0 grid-cols-7 grid-rows-7 gap-[2px] rounded-[10px] bg-ink p-2.5"
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

export const AuthModal = () => {
  const { isOpen, close } = useAuthModal();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [copied, setCopied] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const emailField = useRef<HTMLInputElement>(null);
  const opener = useRef<Element | null>(null);

  // Reset to the first step whenever the modal is dismissed.
  useEffect(() => {
    if (isOpen) {
      opener.current = document.activeElement;
      return undefined;
    }
    const t = setTimeout(() => {
      setStep("email");
      setCode("");
      setCopied(false);
    }, 250);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && step === "email") emailField.current?.focus();
  }, [isOpen, step]);

  // Resend countdown, only while the code step is showing.
  useEffect(() => {
    if (!isOpen || step !== "code" || seconds <= 0) return undefined;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [isOpen, step, seconds]);

  // Escape closes; Tab stays inside the dialog.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [isOpen, close]);

  useEffect(() => {
    if (code.length < 6) return undefined;
    const t = setTimeout(() => setStep("fund"), 220);
    return () => clearTimeout(t);
  }, [code]);

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
    setSeconds(RESEND_SECONDS);
    setStep("code");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const heading = `auth-heading-${step}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-100 grid place-items-center overflow-y-auto bg-ink/45 p-4 backdrop-blur-[2px] sm:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={heading}
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: 0.32, ease: EASE }}
            className={`grid w-full max-w-[880px] overflow-hidden rounded-[20px] bg-white shadow-[0_24px_60px_rgba(27,26,23,0.28)] lg:grid-cols-[1.25fr_0.75fr] ${
              step === "code" ? "border-[1.5px] border-[#7EC0C9]" : ""
            }`}
          >
            <div className="relative flex flex-col p-7 sm:p-11 sm:pb-7">
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="absolute top-5 right-5 grid size-8 place-items-center rounded-full text-faint transition-colors hover:bg-shell hover:text-ink lg:hidden"
              >
                <Close className="size-[18px]" />
              </button>

              {step === "email" && (
                <>
                  <h2
                    id={heading}
                    className="max-w-[15ch] text-[26px] leading-[1.15] font-semibold tracking-[-0.03em] text-balance sm:text-[34px]"
                  >
                    Enter your email to connect or create a wallet
                  </h2>
                  <p className="mt-4 max-w-[420px] text-[16px] leading-[1.55] text-muted text-pretty">
                    We'll email you a one-time code. No seed phrase to write down, and you can
                    export the wallet whenever you like.
                  </p>

                  <form
                    onSubmit={submitEmail}
                    className="mt-9 flex items-center gap-2.5 rounded-xl border border-cardline bg-shell p-2 pl-4 focus-within:border-brand"
                  >
                    <Mail className="size-[18px] shrink-0 text-faint" />
                    <input
                      ref={emailField}
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@email.com"
                      aria-label="Email address"
                      className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint"
                    />
                    <motion.button
                      type="submit"
                      whileTap={{ scale: 0.97 }}
                      transition={PRESS}
                      className="shrink-0 rounded-[9px] bg-brand px-4 py-3 text-[14px] font-semibold tracking-[0.02em] whitespace-nowrap text-white transition-colors hover:bg-brand-deep sm:px-[22px]"
                    >
                      Get code
                    </motion.button>
                  </form>

                  <div className="mt-6 flex items-center gap-3.5">
                    <span className="h-px flex-1 bg-hair" />
                    <span className="text-[12px] text-faint">or</span>
                    <span className="h-px flex-1 bg-hair" />
                  </div>

                  <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
                    {WALLETS.map((w) => (
                      <button
                        key={w.name}
                        type="button"
                        className="flex flex-1 items-center justify-center gap-[9px] rounded-[10px] border border-cardline py-3.5 text-[14px] font-medium text-ink-soft transition-colors hover:border-faint hover:bg-shell"
                      >
                        <span className={`size-4 rounded ${w.swatch}`} />
                        {w.name}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {step === "code" && (
                <>
                  <h2
                    id={heading}
                    className="text-[26px] leading-[1.15] font-semibold tracking-[-0.03em] text-balance sm:text-[34px]"
                  >
                    Check your email for the 6-digit code
                  </h2>
                  <p className="mt-4 max-w-[430px] text-[16px] leading-[1.55] text-muted text-pretty">
                    Sent to <span className="font-semibold text-ink">{email}</span>. This creates
                    your new wallet, or connects the one you already have.
                  </p>

                  <div className="mt-8">
                    <CodeInput value={code} onChange={setCode} />
                  </div>

                  <div className="mt-5 flex items-center gap-2">
                    <Clock className="size-[15px] shrink-0 text-faint" />
                    {seconds > 0 ? (
                      <span className="text-[14px] text-muted">
                        Didn't get a code? Resend in {seconds}s
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSeconds(RESEND_SECONDS)}
                        className="text-[14px] font-semibold text-brand underline-offset-4 hover:underline"
                      >
                        Resend the code
                      </button>
                    )}
                  </div>

                  <p className="mt-8 flex items-center gap-[11px] rounded-xl border border-[#CBE4E7] bg-[#F1F7F8] px-4 py-3.5 text-[14px] leading-[1.45] text-brand-deep">
                    <Lock className="size-[17px] shrink-0" />
                    Only you can approve transactions. Neither Harbor nor Privy can move your
                    funds.
                  </p>
                </>
              )}

              {step === "fund" && (
                <>
                  <p className="mb-5 flex items-center gap-2.5">
                    <span className="grid size-[30px] place-items-center rounded-full bg-up-tint text-up-deep">
                      <Check className="size-4" />
                    </span>
                    <span className="text-[14px] font-semibold text-up-deep">Wallet ready</span>
                  </p>

                  <h2
                    id={heading}
                    className="text-[26px] leading-[1.15] font-semibold tracking-[-0.03em] text-balance sm:text-[34px]"
                  >
                    Send stablecoins to start investing
                  </h2>
                  <p className="mt-4 max-w-[430px] text-[16px] leading-[1.55] text-muted text-pretty">
                    Any USDC on Solana. It earns 4.1% sitting here until you buy something.
                  </p>

                  <div className="mt-8 flex flex-col items-start gap-4 rounded-[14px] border border-cardline p-[18px] sm:flex-row sm:items-center sm:gap-[18px]">
                    <QrPlaceholder />
                    <div className="min-w-0 flex-1">
                      <p className="mb-[7px] text-[12px] font-medium text-faint">
                        Your Solana address
                      </p>
                      <p className="font-mono text-[14px] leading-[1.5] break-all text-ink">
                        {ADDRESS}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <motion.button
                          type="button"
                          onClick={copy}
                          whileTap={{ scale: 0.97 }}
                          transition={PRESS}
                          className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep"
                        >
                          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                          {copied ? "Copied" : "Copy"}
                        </motion.button>
                        <button
                          type="button"
                          className="rounded-lg border border-btnline px-3.5 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:border-faint"
                        >
                          Share
                        </button>
                      </div>
                    </div>
                  </div>

                  <p className="mt-4 flex items-start gap-2.5 text-[13px] leading-[1.5] text-muted">
                    <Alert className="mt-0.5 size-[15px] shrink-0 text-[#B07813]" />
                    Solana network only. Sending on another network will lose the funds.
                  </p>
                </>
              )}

              <div className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t border-hair pt-7">
                {step === "fund" ? (
                  <>
                    <span className="text-[13px] text-muted">
                      Already funded elsewhere?{" "}
                      <button
                        type="button"
                        onClick={close}
                        className="font-semibold text-brand underline-offset-4 hover:underline"
                      >
                        Skip for now
                      </button>
                    </span>
                    <motion.button
                      type="button"
                      onClick={close}
                      whileTap={{ scale: 0.97 }}
                      transition={PRESS}
                      className="rounded-[9px] bg-ink px-6 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-ink-soft"
                    >
                      Go to portfolio
                    </motion.button>
                  </>
                ) : (
                  <>
                    <PrivyMark />
                    <span
                      aria-hidden
                      className="grid size-[26px] place-items-center rounded-full bg-chip text-[12px] font-semibold text-faint"
                    >
                      i
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* The dotted field from the design, decorative only. */}
            <div
              aria-hidden
              className="hidden border-l border-hair bg-[#FBFAF7] bg-[radial-gradient(var(--color-dash)_1.6px,transparent_1.6px)] bg-[length:18px_18px] lg:block"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
