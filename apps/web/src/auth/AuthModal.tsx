import NumberFlow from "@number-flow/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { EASE, noteIn, sequence } from "../motion/config";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { MercuryLogo } from "../ui/Logo";
import { Alert, Blocks, Check, Clock, Close, Key, Lock, Mail, Sliders } from "../ui/icons";
import { useAuthModal } from "./AuthContext";
import { CHECK_MS, CREATE_MS, NOT_INVITED, SEND_MS, useEmailLogin } from "./useEmailLogin";
import { COUNTRIES, UNCHOSEN } from "./countries";
import { Select } from "../ui/Select";
import { nextWave, waveClock, waveParts } from "./waves";
import { joinWaitlist } from "../api/waitlist";
import { CodeInput } from "./CodeInput";

type Step = "email" | "code" | "beta" | "ready";

const RESEND_SECONDS = 30;

/**
 * The countdown to the next door opening, ticking once a second.
 *
 * Mounted only on the beta screen, which is the only one that asks.
 */
const useTimeToWave = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const wave = nextWave(now);
  return { wave, left: wave.getTime() - now.getTime() };
};

/**
 * One unit of the clock, built like the code boxes so the sheet has one box.
 *
 * The digits roll rather than swap. NumberFlow does the rolling — it animates
 * only the places that changed, so the seconds move while the hours sit still,
 * and it honours a reduced-motion preference on its own.
 */
const TimeBox = ({ value, unit }: { value: number; unit: string }) => (
  <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
    <div className="grid h-[60px] w-full place-items-center overflow-hidden rounded-lg bg-ds-panel text-[26px] font-medium text-ds-ink tabular-nums">
      <NumberFlow value={value} format={{ minimumIntegerDigits: 2 }} trend={-1} />
    </div>
    <span className="text-[11px] leading-none text-ds-muted">{unit}</span>
  </div>
);

/* Its own box height, so it centres against the digits and not the labels. */
const Colon = () => (
  <span
    aria-hidden
    className="grid h-[60px] shrink-0 place-items-center text-[22px] leading-none font-medium text-ds-muted"
  >
    :
  </span>
);

/**
 * The clock, with its own state.
 *
 * The tick used to live in the step, so every second re-rendered the country
 * list and both inputs, and the sheet's resize observer fired with them — the
 * whole panel twitched once a second. Isolated here, a tick repaints digits.
 */
const WaveClock = () => {
  const { wave, left } = useTimeToWave();
  const { hours, minutes, seconds } = waveParts(left);
  return (
    <div className="mt-6">
      <div className="flex items-start gap-1.5">
        <TimeBox value={hours} unit="hours" />
        <Colon />
        <TimeBox value={minutes} unit="minutes" />
        <Colon />
        <TimeBox value={seconds} unit="seconds" />
      </div>
      <p className="mt-3 text-center text-[12px] leading-none text-ds-muted">
        Next wave opens {waveClock(wave)}
      </p>
    </div>
  );
};

/** A field on the beta screen, set like the email field above it. */
const Field = ({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) => (
  <label className="flex h-11 min-w-0 flex-1 items-center rounded-md bg-white px-3 outline-1 outline-transparent focus-within:outline-black/10">
    <span className="sr-only">{label}</span>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="min-w-0 flex-1 bg-transparent text-[14px] text-ds-ink outline-none placeholder:text-ds-muted/70"
    />
  </label>
);

/**
 * The screen an uninvited address lands on, in place of the code step.
 *
 * It replaces the sheet rather than sitting under the email field because the
 * answer is not "fix your address" — there is nothing to fix, and the next
 * thing to do is join a queue and be told when it moves.
 */
const BetaStep = ({
  email,
  reduce,
  onBack,
  headingId,
}: {
  email: string;
  reduce: boolean;
  onBack: () => void;
  headingId: string;
}) => {
  const [country, setCountry] = useState(UNCHOSEN);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const join = async (e: FormEvent) => {
    e.preventDefault();
    if (joining || country === UNCHOSEN) return;
    setJoining(true);
    setFailed(null);
    try {
      await joinWaitlist({
        email,
        country,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(handle.trim() ? { handle: handle.trim() } : {}),
      });
      setJoined(true);
    } catch (cause) {
      setFailed(cause instanceof Error ? cause.message : "That didn't work. Try again in a moment.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <>
      <h2 id={headingId} className="text-[20px] leading-[1.2] font-medium text-ds-ink text-balance">
        {joined ? "You're on the list" : "Mercury is invite-only right now"}
      </h2>
      <p className="mt-3 text-[14px] leading-[1.5] text-ds-muted text-pretty">
        {joined ? (
          <>
            We'll let <span className="text-ds-ink">{email}</span> in at the next wave. Come back then and
            sign in with the same address.
          </>
        ) : (
          <>
            <span className="text-ds-ink">{email}</span> isn't on the list yet. Join below and you'll be let
            in at the next wave.
          </>
        )}
      </p>

      <WaveClock />

      {joined ? (
        <button
          type="button"
          onClick={onBack}
          className="mt-6 h-11 w-full rounded-lg bg-ds-panel text-[14px] font-medium text-ds-ink transition-colors hover:bg-ds-tag"
        >
          Use a different email
        </button>
      ) : (
        <form onSubmit={join} className="mt-6">
          <div className="flex flex-col gap-1 rounded-lg bg-ds-panel p-1">
            <Select
              label="Country"
              value={country}
              options={COUNTRIES}
              onChange={setCountry}
              widthClass="w-full"
              placement="top"
              field
            />
            {/* Optional, and last, because they only enrich the founding card. */}
            <div className="flex flex-col gap-1 min-[380px]:flex-row">
              <Field value={name} onChange={setName} placeholder="Name (optional)" label="Name" />
              <Field value={handle} onChange={setHandle} placeholder="X handle (optional)" label="X handle" />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={joining || country === UNCHOSEN}
            aria-busy={joining}
            className="mt-3 w-full"
          >
            {joining ? "Joining the waitlist" : "Join the waitlist"}
          </Button>

          <AnimatePresence initial={false}>
            {failed && (
              <Notice key="join-error" tone="down" reduce={reduce}>
                <Alert className="mt-px size-3.5 shrink-0" />
                {failed}
              </Notice>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={onBack}
            className="mt-3 w-full text-[13px] leading-none text-ds-muted transition-colors hover:text-ds-ink"
          >
            Use a different email
          </button>
        </form>
      )}
    </>
  );
};

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

  // The one refusal the person cannot fix by trying again, so it takes the
  // whole sheet rather than sitting under the field as something to correct.
  const notInvited = rejected?.code === NOT_INVITED;
  useEffect(() => {
    if (notInvited) setStep("beta");
  }, [notInvited]);

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

                      {!invalid && rejected && !notInvited && (
                        <Notice key="send-error" tone="down" reduce={!!reduce}>
                          <Alert className="mt-px size-3.5 shrink-0" />
                          We couldn't send a code to that address. Check it, or try again in a moment.
                        </Notice>
                      )}
                    </AnimatePresence>
                  </>
                )}

                {step === "beta" && (
                  <BetaStep
                    email={email}
                    reduce={!!reduce}
                    headingId={heading}
                    onBack={() => {
                      reset();
                      setStep("email");
                    }}
                  />
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
                        ) : rejected ? (
                          <p role="alert" className="flex items-start gap-2 text-[14px] text-ds-down">
                            <Alert className="mt-0.5 size-[15px] shrink-0" />
                            That code didn't work. Check it and enter it again.
                          </p>
                        ) : resent ? (
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
                              <span className="text-[14px] text-ds-muted">
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
                                className="text-[14px] font-medium text-ds-link transition-opacity hover:opacity-80"
                              >
                                Resend the code
                              </button>
                            )}
                          </p>
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
