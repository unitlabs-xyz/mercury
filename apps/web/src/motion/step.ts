import { EASE } from "./config";

/**
 * Moving between the steps of a panel: a slide that blurs as it goes.
 *
 * `custom` is the direction — 1 going in, -1 coming back. Going in, the screen
 * being left slides off to the left as the next arrives from the right; coming
 * back, the reverse, so the panel reads as pages laid side by side. The two
 * overlap (with `AnimatePresence mode="popLayout"`), which is what keeps a
 * blank frame from opening up between them.
 */
export const STEP_SLIDE = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 28, filter: "blur(6px)" }),
  center: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: (dir: number) => ({ opacity: 0, x: dir * -28, filter: "blur(6px)" }),
} as const;

export const STEP_TRANSITION = { duration: 0.26, ease: EASE } as const;
