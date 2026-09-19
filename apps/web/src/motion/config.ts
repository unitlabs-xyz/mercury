import type { Transition, Variants } from "motion/react";

/** Confident deceleration. No bounce by reflex. */
export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Press and hover feedback: fast enough to feel like cause and effect. */
export const PRESS: Transition = { type: "spring", stiffness: 480, damping: 34, mass: 0.6 };

/** A mark reacting to the pointer. */
export const MARK: Transition = { type: "spring", stiffness: 380, damping: 28, mass: 0.5 };

export const riseIn: Variants = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};

/** Cards arrive with a little more travel, because they carry more weight. */
export const cardIn: Variants = {
  hidden: { opacity: 0, y: 22 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.75, ease: EASE } },
};

export const sequence = (delayChildren = 0, staggerChildren = 0.08): Variants => ({
  hidden: {},
  shown: { transition: { delayChildren, staggerChildren } },
});
