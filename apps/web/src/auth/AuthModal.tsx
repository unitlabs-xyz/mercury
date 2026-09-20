import { motion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { PRESS } from "../motion/config";
import { Dialog, DottedPanel } from "../ui/Dialog";
import { Blocks, Clock, Close, Key, Lock, Mail, Sliders } from "../ui/icons";
import { useAuthModal } from "./AuthContext";
import { CodeInput } from "./CodeInput";

type Step = "email" | "code" | "ready";

const RESEND_SECONDS = 30;

/** What the wallet is, in the three terms that actually matter to someone new. */
const ASSURANCES: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <Blocks className="size-[18px]" />,
    title: "It's on-chain.",
    body: "Your shares and your cash live on Solana, not on Harbor.",
  },
  {
    icon: <Sliders className="size-[18px]" />,
    title: "You're in control.",
    body: "Transactions need your approval. Harbor cannot move your funds.",
  },
  {
    icon: <Key className="size-[18px]" />,
    title: "Recover easily.",
    body: "Your email restores access. Export to another wallet whenever you like.",
  },
];

const PrivyMark = () => (
  <span className="flex items-center gap-[9px] text-[13px] text-muted">
    Powered and protected by
    <span className="flex items-center gap-[5px]">
      <span className="size-[13px] rounded-full bg-ink" />
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">privy</span>
    </span>
  </span>
);

export const AuthModal = () => {
  const { isOpen, close } = useAuthModal();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const emailField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) return undefined;
    const t = setTimeout(() => {
      setStep("email");
      setCode("");
    }, 250);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && step === "email") emailField.current?.focus();
  }, [isOpen, step]);

  useEffect(() => {
    if (!isOpen || step !== "code" || seconds <= 0) return undefined;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [isOpen, step, seconds]);

  useEffect(() => {
    if (code.length < 6) return undefined;
    const t = setTimeout(() => setStep("ready"), 220);
    return () => clearTimeout(t);
  }, [code]);

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
    setSeconds(RESEND_SECONDS);
    setStep("code");
  };

  const heading = `auth-heading-${step}`;

  return (
    <Dialog
      open={isOpen}
      onClose={close}
      labelledBy={heading}
      className={`max-w-[880px] lg:grid lg:grid-cols-[1.25fr_0.75fr] ${
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
              We'll email you a one-time code. No seed phrase to write down, and you can export the
              wallet whenever you like.
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
              Sent to <span className="font-semibold text-ink">{email}</span>. This creates your new
              wallet, or connects the one you already have.
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
              Only you can approve transactions. Neither Harbor nor Privy can move your funds.
            </p>
          </>
        )}

        {step === "ready" && (
          <>
            <h2
              id={heading}
              className="text-[26px] leading-[1.15] font-semibold tracking-[-0.03em] text-balance sm:text-[34px]"
            >
              Your account is ready
            </h2>
            <p className="mt-3 max-w-[430px] text-[16px] leading-[1.55] text-muted text-pretty">
              A Solana wallet now holds your cash and your shares.
            </p>

            <ul className="mt-8 grid gap-6">
              {ASSURANCES.map((a) => (
                <li key={a.title} className="flex gap-3.5">
                  <span className="mt-0.5 shrink-0 text-brand">{a.icon}</span>
                  <div>
                    <p className="text-[16px] font-semibold tracking-[-0.01em]">{a.title}</p>
                    <p className="mt-1 max-w-[46ch] text-[14px] leading-[1.5] text-muted text-pretty">
                      {a.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <motion.button
              type="button"
              onClick={() => {
                close();
                navigate("/portfolio");
              }}
              whileTap={{ scale: 0.97 }}
              transition={PRESS}
              className="mt-9 self-start rounded-[9px] bg-ink px-6 py-3 text-[14px] font-semibold tracking-[0.02em] text-white transition-colors hover:bg-ink-soft"
            >
              Get started
            </motion.button>
          </>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t border-hair pt-7">
          <PrivyMark />
          <span
            aria-hidden
            className="grid size-[26px] place-items-center rounded-full bg-chip text-[12px] font-semibold text-faint"
          >
            i
          </span>
        </div>
      </div>

      <DottedPanel />
    </Dialog>
  );
};
