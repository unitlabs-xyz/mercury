import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { EASE, PRESS, noteIn, sequence } from "../motion/config";
import { Dialog, RuledSheet } from "../ui/Dialog";
import { Alert, Blocks, Check, Clock, Close, Key, Lock, Mail, Sliders } from "../ui/icons";
import { useAuthModal } from "./AuthContext";
import { CHECK_MS, CREATE_MS, SEND_MS, useEmailLogin } from "./useEmailLogin";
import { CodeInput } from "./CodeInput";

type Step = "email" | "code" | "ready";

const RESEND_SECONDS = 30;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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

/**
 * The one loading material in this dialog, and the same material the rest of
 * the system builds structure from — which is why there is no spinner in here.
 *
 * The first segment is the honest fill, over exactly the minimum display
 * duration. Everything after it only ever plays when the response has
 * outlived that floor, because the element unmounts the moment the wait ends.
 * A full bar that has stopped moving reads as broken within about a second.
 */
const Fill = ({ ms, className }: { ms: number; className: string }) => (
  <motion.span
    aria-hidden
    className={`origin-left ${className}`}
    initial={{ scaleX: 0 }}
    animate={{ scaleX: [0, 1, 0.12, 1] }}
    transition={{
      duration: (ms / 1000) * 2.6,
      times: [0, 1 / 2.6, 1.35 / 2.6, 1],
      ease: "linear",
      repeat: Infinity,
      repeatDelay: 0,
    }}
  />
);

export const AuthModal = () => {
  const { isOpen, close } = useAuthModal();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [step, setStep] = useState<Step>("email");
  const { pending, rejected, send, submit, reset } = useEmailLogin();
  const [email, setEmail] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [resent, setResent] = useState(false);
  const [height, setHeight] = useState<number | "auto">("auto");
  const [resizing, setResizing] = useState(false);
  const emailField = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) return undefined;
    const t = setTimeout(() => {
      setStep("email");
      reset();
      setCode("");
      setInvalid(false);
      setResent(false);
      setHeight("auto");
    }, 250);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && step === "email") emailField.current?.focus();
  }, [isOpen, step]);

  /* The sheet resizes between steps rather than snapping to the next one. */
  useEffect(() => {
    const el = body.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen]);

  /* Clip for the length of the resize and no longer. Tying this to the
     animation's own completion callback means a frame loop that stops — a
     backgrounded tab — leaves the sheet clipped shut. */
  useEffect(() => {
    if (height === "auto") return undefined;
    setResizing(true);
    const t = setTimeout(() => setResizing(false), 280);
    return () => clearTimeout(t);
  }, [height]);

  useEffect(() => {
    if (!resent) return undefined;
    const t = setTimeout(() => setResent(false), 2600);
    return () => clearTimeout(t);
  }, [resent]);

  useEffect(() => {
    if (!isOpen || step !== "code" || pending || seconds <= 0) return undefined;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [isOpen, step, pending, seconds]);

  /* Six digits is the submit. Privy decides what happens next, not a timer. */
  useEffect(() => {
    if (step !== "code" || pending || code.length !== 6) return;
    void submit(code).then((ok) => {
      if (ok) setStep("ready");
      else setCode("");
    });
  }, [code, step, pending, submit]);

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (!EMAIL.test(email)) {
      setInvalid(true);
      emailField.current?.focus();
      return;
    }
    setInvalid(false);
    void send(email).then((ok) => {
      if (!ok) return;
      setSeconds(RESEND_SECONDS);
      setStep("code");
    });
  };

  const sending = pending === "sending";
  const reading = pending === "checking" || pending === "creating";
  const heading = `auth-heading-${step}`;
  const enter = { duration: 0.28, ease: EASE, delay: 0.1 };
  const leave = { duration: 0.14, ease: "easeIn" as const };

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

        {/* Clipped only while the sheet is resizing, so taller incoming content
            never overhangs the footer — and focus rings are never clipped at rest. */}
        <motion.div
          initial={false}
          animate={{ height }}
          transition={reduce ? { duration: 0 } : { duration: 0.24, ease: EASE }}
          className={resizing ? "overflow-hidden" : ""}
        >
          <div ref={body}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, y: reduce ? 0 : 10 }}
                animate={{ opacity: 1, y: 0, transition: enter }}
                exit={{ opacity: 0, y: reduce ? 0 : -6, transition: leave }}
              >
                {step === "email" && (
                  <>
                    <h2
                      id={heading}
                      className="max-w-[26ch] text-[22px] leading-[1.2] font-semibold tracking-[-0.02em] text-balance"
                    >
                      Enter your email to connect or create a wallet
                    </h2>
                    <p className="mt-3 max-w-[46ch] text-[15px] leading-[1.6] text-muted text-pretty">
                      We'll email you a one-time code. No seed phrase to write down, and you can export the
                      wallet whenever you like.
                    </p>

                    <form
                      onSubmit={submitEmail}
                      noValidate
                      className={`mt-9 flex items-center gap-2.5 rounded-xl border bg-shell p-2 pl-4 ${
                        invalid ? "border-down" : "border-cardline focus-within:border-brand"
                      }`}
                    >
                      <Mail className={`size-[18px] shrink-0 ${invalid ? "text-down" : "text-faint"}`} />
                      <input
                        ref={emailField}
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (invalid) setInvalid(false);
                        }}
                        placeholder="you@email.com"
                        aria-label="Email address"
                        aria-invalid={invalid}
                        {...(invalid ? { "aria-describedby": "email-error" } : {})}
                        className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint"
                      />
                      <motion.button
                        type="submit"
                        disabled={sending}
                        aria-busy={sending}
                        {...(sending ? {} : { whileTap: { scale: 0.97 } })}
                        transition={PRESS}
                        className="relative inline-flex min-w-[104px] shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-brand px-4 py-3 text-[14px] font-semibold tracking-[0.02em] whitespace-nowrap text-white transition-colors hover:bg-brand-deep disabled:hover:bg-brand sm:min-w-[116px] sm:px-[22px]"
                      >
                        {sending ? "Sending" : "Get code"}
                        {sending && (
                          <Fill ms={SEND_MS} className="absolute inset-x-0 bottom-0 h-[2px] bg-white/55" />
                        )}
                      </motion.button>
                    </form>

                    <AnimatePresence initial={false}>
                      {invalid && (
                        <motion.p
                          key="email-error"
                          id="email-error"
                          role="alert"
                          initial={{ opacity: 0, y: reduce ? 0 : -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.18, ease: EASE }}
                          className="mt-3 flex items-center gap-2 text-[13px] text-down-deep"
                        >
                          <Alert className="size-[15px] shrink-0" />
                          That doesn't look like an email address yet. Check it for a typo.
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </>
                )}

                {step === "code" && (
                  <>
                    <h2
                      id={heading}
                      className="max-w-[26ch] text-[22px] leading-[1.2] font-semibold tracking-[-0.02em] text-balance"
                    >
                      Check your email for the 6-digit code
                    </h2>
                    <p className="mt-3 max-w-[46ch] text-[15px] leading-[1.6] text-muted text-pretty">
                      Sent to <span className="font-semibold text-ink">{email}</span>. This creates your new
                      wallet, or connects the one you already have.
                    </p>

                    {/* Width comes from the boxes, so the progress rule measures the code. */}
                    <div className="mt-7">
                      <CodeInput
                        value={code}
                        onChange={setCode}
                        status={
                          pending === "creating" ? "done" : pending === "checking" ? "checking" : "idle"
                        }
                      />

                      <span className="sr-only" role="status">
                        {pending === "checking"
                          ? "Checking your code"
                          : pending === "creating"
                            ? "Creating your wallet"
                            : rejected
                              ? "That code didn't work"
                              : resent
                                ? "A new code is on its way"
                                : ""}
                      </span>

                      <div className="mt-5">
                        {reading ? (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.2 }}
                          >
                            <span className="relative block h-[2px] overflow-hidden rounded-full bg-hair">
                              <Fill
                                ms={CHECK_MS + CREATE_MS}
                                className="absolute inset-0 rounded-full bg-brand"
                              />
                            </span>
                            <p className="mt-3.5 text-[14px] text-muted">
                              {pending === "checking" ? "Checking your code" : "Creating your wallet"}
                            </p>
                          </motion.div>
                        ) : rejected ? (
                          <p role="alert" className="flex items-start gap-2 text-[14px] text-down-deep">
                            <Alert className="mt-0.5 size-[15px] shrink-0" />
                            That code didn't work. Check it and enter it again.
                          </p>
                        ) : resent ? (
                          <p className="flex items-center gap-2 text-[14px] text-up-deep">
                            <Check className="size-[15px] shrink-0" />A new code is on its way
                          </p>
                        ) : pending === "resending" ? (
                          <p className="flex items-center gap-2 text-[14px] text-muted">
                            <Clock className="size-[15px] shrink-0 text-faint" />
                            Sending a new code
                          </p>
                        ) : (
                          <p className="flex items-center gap-2">
                            <Clock className="size-[15px] shrink-0 text-faint" />
                            {seconds > 0 ? (
                              <span className="text-[14px] text-muted">
                                Didn't get a code? Resend in {seconds}s
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  void send(email, true).then((ok) => {
                                    if (!ok) return;
                                    setSeconds(RESEND_SECONDS);
                                    setResent(true);
                                  });
                                }}
                                className="text-[14px] font-semibold text-brand underline-offset-4 hover:underline"
                              >
                                Resend the code
                              </button>
                            )}
                          </p>
                        )}
                      </div>
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
                    <p className="mt-3 max-w-[46ch] text-[15px] leading-[1.6] text-muted text-pretty">
                      A Solana wallet now holds your cash and your shares.
                    </p>

                    <motion.ul
                      className="mt-8 grid gap-6"
                      variants={sequence(0.14, 0.07)}
                      initial="hidden"
                      animate="shown"
                    >
                      {ASSURANCES.map((a) => (
                        <motion.li key={a.title} className="flex gap-3.5" variants={noteIn}>
                          <span className="mt-0.5 shrink-0 text-brand">{a.icon}</span>
                          <div>
                            <p className="text-[16px] font-semibold tracking-[-0.01em]">{a.title}</p>
                            <p className="mt-1 max-w-[46ch] text-[14px] leading-[1.5] text-muted text-pretty">
                              {a.body}
                            </p>
                          </div>
                        </motion.li>
                      ))}
                    </motion.ul>

                    <motion.button
                      type="button"
                      onClick={() => {
                        close();
                        navigate("/portfolio");
                      }}
                      whileTap={{ scale: 0.97 }}
                      transition={PRESS}
                      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        transition: { duration: 0.34, ease: EASE, delay: 0.42 },
                      }}
                      className="mt-9 inline-flex items-center rounded-[9px] bg-ink px-6 py-3 text-[14px] font-semibold tracking-[0.02em] text-white transition-colors hover:bg-ink-soft"
                    >
                      Get started
                    </motion.button>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-4 pt-7">
          <PrivyMark />
          <span
            aria-hidden
            className="grid size-[26px] place-items-center rounded-full bg-chip text-[12px] font-semibold text-faint"
          >
            i
          </span>
        </div>
      </div>

      <RuledSheet />
    </Dialog>
  );
};
