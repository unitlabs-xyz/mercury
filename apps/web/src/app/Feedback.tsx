import { usePrivy } from "@privy-io/react-auth";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { sendFeedback, shrinkImage, type FeedbackImage } from "../api/feedback";
import { ApiError } from "../api/client";
import { EASE } from "../motion/config";
import { Button } from "../ui/Button";
import { Check, Close, ImageIcon, Message } from "../ui/icons";

const MAX_IMAGES = 3;
/** Larger than this, the browser is not asked to decode it: phones run out of memory first. */
const MAX_PICK_MB = 20;
/** What the server takes per image, after shrinking. Matches services/api/src/routes/feedback.ts. */
const MAX_SEND_BYTES = 1_500_000;
const base64Bytes = (data: string) => Math.floor((data.length * 3) / 4);
const tooLarge = (names: string[]) =>
  `${names.length === 1 ? `"${names[0]}" is` : `${names.length} images are`} too large to send. Compress ${names.length === 1 ? "it" : "them"} or take a smaller screenshot, then add again.`;

type Shot = FeedbackImage & { readonly key: string };

/**
 * The feedback button, bottom right on every dashboard screen. Opens a small
 * panel: a message, up to three screenshots, Send. It goes to our inbox with
 * the page they were on, and Reply-To set to them when they are signed in.
 */
export const Feedback = () => {
  const { user } = usePrivy();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    if (state !== "sent") field.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, state]);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    setReading(true);
    try {
      const room = MAX_IMAGES - shots.length;
      const images = [...files].filter((f) => f.type.startsWith("image/"));
      const huge = images.filter((f) => f.size > MAX_PICK_MB * 1_000_000);
      const picked = images.filter((f) => !huge.includes(f)).slice(0, room);
      const shrunk = await Promise.all(picked.map(shrinkImage));
      /* Shrinking nearly always lands well under the cap; a huge panorama may not. */
      const fits = shrunk.filter((x) => base64Bytes(x.data) <= MAX_SEND_BYTES);
      const refused = [
        ...huge.map((f) => f.name),
        ...shrunk.filter((x) => !fits.includes(x)).map((x) => x.name),
      ];
      setShots((s) => [...s, ...fits.map((x) => ({ ...x, key: crypto.randomUUID() }))].slice(0, MAX_IMAGES));
      if (refused.length > 0) setError(tooLarge(refused));
      else if (images.length > room) setError(`Up to ${MAX_IMAGES} images.`);
    } catch {
      setError("We couldn't read that image. Try a PNG or JPEG.");
    } finally {
      setReading(false);
      if (picker.current) picker.current.value = "";
    }
  };

  const submit = async () => {
    if (!message.trim() || state === "sending") return;
    setState("sending");
    setError(null);
    try {
      await sendFeedback({
        message: message.trim(),
        ...(user?.email?.address ? { email: user.email.address } : {}),
        page: pathname,
        images: shots.map(({ name, type, data }) => ({ name, type, data })),
      });
      setState("sent");
      setMessage("");
      setShots([]);
    } catch (e) {
      setState("idle");
      setError(
        e instanceof ApiError && e.status !== 502
          ? e.message
          : "We couldn't send that just now. Try again in a moment.",
      );
    }
  };

  const restart = () => {
    setState("idle");
    setError(null);
  };

  /* One surface that grows from the pill into the panel and back, rather than
     a panel appearing above a button. The content fades in once the shape has
     mostly arrived, so nothing is seen stretching. */
  const morph = { type: "spring", bounce: 0.12, duration: 0.42 } as const;
  const fade = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.18, delay: 0.1, ease: EASE } },
    exit: { opacity: 0, transition: { duration: 0.08 } },
  };

  return (
    <div
      ref={panel}
      className="pointer-events-none fixed right-4 bottom-4 z-40 flex justify-end max-sm:left-4 sm:right-6 sm:bottom-6"
    >
      <motion.div
        layout
        transition={morph}
        initial={false}
        animate={{ backgroundColor: open ? "#ffffff" : "#141614" }}
        style={{ borderRadius: open ? 16 : 999 }}
        className={`pointer-events-auto overflow-hidden shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_2px_6px_rgba(0,0,0,0.06),0_16px_40px_-12px_rgba(0,0,0,0.22)] ${
          open ? "w-full sm:w-[360px]" : ""
        }`}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {!open ? (
            <motion.button
              key="pill"
              layout="position"
              {...fade}
              type="button"
              onClick={() => {
                if (state === "sent") restart();
                setOpen(true);
              }}
              aria-expanded={false}
              aria-controls={id}
              className="inline-flex h-10 items-center gap-2 px-4 text-[14px] font-medium whitespace-nowrap text-white"
            >
              <Message className="size-4 [stroke-width:1.5]" />
              Feedback
            </motion.button>
          ) : (
            <motion.div
              key="panel"
              layout="position"
              {...fade}
              id={id}
              role="dialog"
              aria-label="Send feedback"
            >
              <div className="flex items-center justify-between pt-3.5 pr-3 pb-1 pl-4">
                <p className="text-[14px] font-medium text-ds-ink">
                  {state === "sent" ? "Thank you" : "Send us feedback"}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close feedback"
                  className="grid size-7 place-items-center rounded-full text-ds-muted transition-colors hover:bg-ds-panel hover:text-ds-ink"
                >
                  <Close className="size-3.5" />
                </button>
              </div>

              {state === "sent" ? (
                <div className="flex flex-col items-center px-6 pt-5 pb-6 text-center">
                  <span className="grid size-10 place-items-center rounded-full bg-ds-up-chip text-ds-up">
                    <Check className="size-5" />
                  </span>
                  <p className="mt-4 text-[14px] font-medium text-ds-ink">Got it, thank you.</p>
                  <p className="mt-1.5 max-w-[34ch] text-[13px] leading-relaxed text-ds-muted">
                    It went straight to the team. If you're signed in, we'll reply to your email when there's
                    something to say.
                  </p>
                  <Button className="mt-5" onClick={restart}>
                    Send another
                  </Button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                  className="px-3 pt-2 pb-3"
                >
                  <textarea
                    ref={field}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
                    }}
                    onPaste={(e) => {
                      if (e.clipboardData.files.length > 0) {
                        e.preventDefault();
                        void addFiles(e.clipboardData.files);
                      }
                    }}
                    rows={4}
                    maxLength={5000}
                    placeholder="An idea, something confusing, or something broken. Screenshots help."
                    aria-label="Your feedback"
                    className="block w-full resize-none rounded-lg bg-ds-panel px-3 py-2.5 text-[14px] leading-[1.45] text-ds-ink outline-none placeholder:text-ds-muted"
                  />

                  {shots.length > 0 && (
                    <ul className="mt-2 flex gap-2">
                      {shots.map((shot) => (
                        <li key={shot.key} className="relative">
                          <img
                            src={`data:${shot.type};base64,${shot.data}`}
                            alt={shot.name}
                            className="size-14 rounded-md bg-white object-cover outline-1 outline-black/10"
                          />
                          <button
                            type="button"
                            onClick={() => setShots((s) => s.filter((x) => x.key !== shot.key))}
                            aria-label={`Remove ${shot.name}`}
                            className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-ds-ink text-white"
                          >
                            <Close className="size-2.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {error && (
                    <p role="alert" className="mt-2 text-[12px] text-ds-down">
                      {error}
                    </p>
                  )}

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <input
                      ref={picker}
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={(e) => void addFiles(e.target.files)}
                    />
                    <button
                      type="button"
                      onClick={() => picker.current?.click()}
                      disabled={shots.length >= MAX_IMAGES || reading}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] text-ds-muted transition-colors hover:bg-ds-panel hover:text-ds-ink disabled:opacity-50 disabled:hover:bg-transparent max-sm:h-10"
                    >
                      <ImageIcon className="size-4 [stroke-width:1.5]" />
                      {reading
                        ? "Adding…"
                        : shots.length > 0
                          ? `${shots.length}/${MAX_IMAGES} images`
                          : "Add images"}
                    </button>
                    <Button
                      type="submit"
                      variant="primary"
                      loading={state === "sending"}
                      disabled={!message.trim() || reading}
                    >
                      Send
                    </Button>
                  </div>
                </form>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
