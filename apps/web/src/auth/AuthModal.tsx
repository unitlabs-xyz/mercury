import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { EASE, noteIn, sequence } from "../motion/config";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { MercuryLogo } from "../ui/Logo";
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
    body: "Your shares and your cash live on Solana, not on Mercury.",
  },
  {
    icon: <Sliders className="size-[18px]" />,
    title: "You're in control.",
    body: "Transactions need your approval. Mercury cannot move your funds.",
  },
  {
    icon: <Key className="size-[18px]" />,
    title: "Recover easily.",
    body: "Your email restores access. Export to another wallet whenever you like.",
  },
];

/**
 * A notice under the email field. `down` is something to correct; `quiet` is
 * something to know, which is not the same and should not look alarmed.
 */
const Notice = ({
  id,
  tone,
  reduce,
  children,
}: {
  id?: string;
  tone: "down" | "quiet";
  reduce: boolean;
  children: ReactNode;
}) => (
  <motion.div
    {...(id ? { id } : {})}
    role="alert"
    initial={{ opacity: 0, y: reduce ? 0 : -4 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.18, ease: EASE }}
    className={
      tone === "down"
        ? "mt-3 flex items-start gap-2 rounded-lg bg-ds-down-chip px-3 py-2.5 text-[12px] leading-[1.45] text-ds-chip-down"
        : "mt-3 rounded-lg bg-ds-panel px-3.5 py-3"
    }
  >
    {children}
  </motion.div>
);

const PrivyMark = () => (
  <span className="flex items-center gap-2 text-[12px] text-ds-muted">
    Secured by
    <span className="flex items-center gap-[5px]">
      <span className="size-[11px] rounded-full bg-ds-ink" />
      <span className="text-[14px] font-medium text-ds-ink">privy</span>
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
  const [resendFailed, setResendFailed] = useState(false);
  const [height, setHeight] = useState<number | "auto">("auto");
  const [resizing, setResizing] = useState(false);
  const emailField = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) return undefined;
    const t = setTimeout(() => {
      setStep("email");
      reset();
      setEmail("");
      setCode("");
      setInvalid(false);
      setResent(false);
      setResendFailed(false);
      setHeight("auto");
    }, 250);
    return () => clearTimeout(t);
  }, [isOpen, reset]);

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
    setResendFailed(false);
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

  /*
   * The stale digits go first, and a rejected code does not hide this: an
   * expired code is exactly when someone needs another, and the error used to
   * take the link's place until the page was closed.
   */
  const resend = () => {
    setCode("");
    setResendFailed(false);
    void send(email, true).then((ok) => {
      setResendFailed(!ok);
      if (!ok) return;
      setSeconds(RESEND_SECONDS);
      setResent(true);
    });
  };

  const sending = pending === "sending";
  const reading = pending === "checking" || pending === "creating";
  const heading = `auth-heading-${step}`;
  const enter = { duration: 0.28, ease: EASE, delay: 0.1 };
  const leave = { duration: 0.14, ease: "easeIn" as const };

  return (
    <Dialog open={isOpen} onClose={close} labelledBy={heading} className="max-w-[440px] !rounded-xl">
      <div className="relative flex flex-col px-6 pt-6 pb-5">
        {/* The mark, as the site opens with it, and the way out. */}
        <div className="mb-7 flex items-center justify-between">
          <MercuryLogo className="h-6 w-auto text-ds-ink" />
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-2 grid size-8 place-items-center rounded-lg text-ds-muted transition-colors hover:bg-black/[0.06] hover:text-ds-ink"
          >
            <Close className="size-3.5" />
          </button>
        </div>

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
                      className="text-[20px] leading-[1.2] font-medium text-ds-ink text-balance"
                    >
                      Enter your email to connect or create a wallet
                    </h2>
                    <p className="mt-3 text-[14px] leading-[1.5] text-ds-muted text-pretty">
                      We'll email you a one-time code. No seed phrase to write down, and you can export the
                      wallet whenever you like.
                    </p>

                    <form onSubmit={submitEmail} noValidate className="mt-6">
                      <div className="rounded-lg bg-ds-panel p-1">
                        <label
                          className={`flex h-12 items-center gap-2.5 rounded-md bg-white px-4 outline-1 ${
                            invalid ? "outline-ds-down" : "outline-transparent focus-within:outline-black/10"
                          }`}
                        >
                          <Mail className={`size-4 shrink-0 ${invalid ? "text-ds-down" : "text-ds-muted"}`} />
                          <input
                            ref={emailField}
                            type="email"
                            value={email}
                            onChange={(e) => {
                              setEmail(e.target.value);
                              if (invalid) setInvalid(false);
                              if (rejected) reset();
                            }}
                            placeholder="you@email.com"
                            aria-label="Email address"
                            aria-invalid={invalid}
                            {...(invalid ? { "aria-describedby": "email-error" } : {})}
                            className="min-w-0 flex-1 bg-transparent text-[16px] text-ds-ink outline-none placeholder:text-ds-muted/70"
                          />
                        </label>
                      </div>
                      <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        disabled={sending}
                        aria-busy={sending}
                        className="relative mt-3 w-full overflow-hidden"
                      >
                        {sending ? "Sending the code" : "Get code"}
                        {sending && (
                          <Fill ms={SEND_MS} className="absolute inset-x-0 bottom-0 h-[2px] bg-white/55" />
                        )}
                      </Button>
                    </form>

                    <AnimatePresence initial={false}>
                      {invalid && (
                        <Notice key="email-error" id="email-error" tone="down" reduce={!!reduce}>
                          <Alert className="mt-px size-3.5 shrink-0" />
                          That doesn't look like an email address yet. Check it for a typo.
                        </Notice>
                      )}

                      {!invalid && rejected && (
                        <Notice key="send-error" tone="down" reduce={!!reduce}>
                          <Alert className="mt-px size-3.5 shrink-0" />
                          We couldn't send a code to that address. Check it, or try again in a moment.
                        </Notice>
                      )}
                    </AnimatePresence>
                  </>
                )}

                {step === "code" && (
                  <>
                    <h2
                      id={heading}
                      className="text-[20px] leading-[1.2] font-medium text-ds-ink text-balance"
                    >
                      Check your email for the 6-digit code
                    </h2>
                    <p className="mt-3 text-[14px] leading-[1.5] text-ds-muted text-pretty">
                      Sent to <span className="font-medium text-ds-ink">{email}</span>. This creates your new
                      wallet, or connects the one you already have.
                    </p>

                    {/* Width comes from the boxes, so the progress rule measures the code. */}
                    <div className="mt-6">
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
                            <span className="relative block h-[2px] overflow-hidden rounded-full bg-ds-divider">
                              <Fill
                                ms={CHECK_MS + CREATE_MS}
                                className="absolute inset-0 rounded-full bg-ds-ink"
                              />
                            </span>
                            <p className="mt-3.5 text-[14px] text-ds-muted">
                              {pending === "checking" ? "Checking your code" : "Creating your wallet"}
                            </p>
                          </motion.div>
                        ) : (
                          <>
                            {rejected && (
                              <p
                                role="alert"
                                className="mb-3 flex items-start gap-2 text-[14px] text-ds-down"
                              >
                                <Alert className="mt-0.5 size-[15px] shrink-0" />
                                {resendFailed
                                  ? "We couldn't send a new code. Try again in a moment."
                                  : "That code didn't work. Check it, or send a new one."}
                              </p>
                            )}
                            {resent ? (
                              <p className="flex items-center gap-2 text-[14px] text-ds-up">
                                <Check className="size-[15px] shrink-0" />A new code is on its way
                              </p>
                            ) : pending === "resending" ? (
                              <p className="flex items-center gap-2 text-[14px] text-ds-muted">
                                <Clock className="size-[15px] shrink-0 text-ds-muted" />
                                Sending a new code
                              </p>
                            ) : (
                              <p className="flex items-center gap-2">
                                <Clock className="size-[15px] shrink-0 text-ds-muted" />
                                {seconds > 0 ? (
                                  /* A clock, not a new value: without the opt-out the
                                     value flash dimmed the whole line on every tick. */
                                  <span data-no-flash className="text-[14px] text-ds-muted">
                                    Didn't get a code? Resend in {seconds}s
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={resend}
                                    className="text-[14px] font-medium text-ds-link transition-opacity hover:opacity-80"
                                  >
                                    Resend the code
                                  </button>
                                )}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <p className="mt-6 flex items-center gap-2.5 rounded-lg bg-ds-panel px-4 py-3 text-[12px] leading-[1.45] text-ds-muted">
                      <Lock className="size-3.5 shrink-0 text-ds-ink" />
                      Only you can approve transactions. Neither Mercury nor Privy can move your funds.
                    </p>
                  </>
                )}

                {step === "ready" && (
                  <>
                    <h2
                      id={heading}
                      className="text-[28px] leading-[1.1] font-medium text-ds-ink text-balance"
                    >
                      Your account is ready
                    </h2>
                    <p className="mt-3 text-[14px] leading-[1.5] text-ds-muted text-pretty">
                      A Solana wallet now holds your cash and your shares.
                    </p>

                    <motion.ul
                      className="mt-6 flex flex-col gap-1 rounded-lg bg-ds-panel p-1"
                      variants={sequence(0.14, 0.07)}
                      initial="hidden"
                      animate="shown"
                    >
                      {ASSURANCES.map((a) => (
                        <motion.li
                          key={a.title}
                          className="flex gap-3 rounded-md bg-white px-4 py-3"
                          variants={noteIn}
                        >
                          <span className="mt-px shrink-0 text-ds-ink [&_svg]:size-4">{a.icon}</span>
                          <div>
                            <p className="text-[14px] leading-none font-medium text-ds-ink">{a.title}</p>
                            <p className="mt-1.5 text-[12px] leading-[1.45] text-ds-muted text-pretty">
                              {a.body}
                            </p>
                          </div>
                        </motion.li>
                      ))}
                    </motion.ul>

                    <motion.div
                      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                      animate={{ opacity: 1, y: 0, transition: { duration: 0.34, ease: EASE, delay: 0.42 } }}
                    >
                      <Button
                        variant="primary"
                        size="lg"
                        onClick={() => {
                          close();
                          navigate("/portfolio");
                        }}
                        className="mt-6 w-full"
                      >
                        Get started
                      </Button>
                    </motion.div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        <div className="mt-6 flex items-center justify-center border-t border-ds-divider pt-4">
          <PrivyMark />
        </div>
      </div>
    </Dialog>
  );
};
