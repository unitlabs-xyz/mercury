import type { ManagedBasketOperation } from "@mercury/types";
import { motion, useReducedMotion } from "motion/react";
import { Alert } from "../../ui/icons";

const stopped = (state: ManagedBasketOperation["state"] | undefined) =>
  state === "failed" || state === "cancelled";

export const OperationStatus = ({
  name,
  state,
  label,
  unavailable = false,
}: {
  name: string;
  state: ManagedBasketOperation["state"] | undefined;
  label: string;
  unavailable?: boolean;
}) => {
  const reducedMotion = useReducedMotion();
  const complete = state === "completed";
  const failed = stopped(state);
  const tone = complete
    ? "text-ds-up"
    : failed
      ? "text-ds-down"
      : unavailable
        ? "text-ds-chip-warn"
        : "text-ds-link";

  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      <span className={`grid size-5 shrink-0 place-items-center ${tone}`} aria-hidden="true">
        {complete ? (
          <motion.svg
            viewBox="0 0 24 24"
            fill="none"
            className="size-5"
            stroke="currentColor"
            strokeWidth="2.4"
          >
            <motion.circle
              cx="12"
              cy="12"
              r="9"
              initial={reducedMotion ? false : { opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            />
            <motion.path
              d="m7.5 12.5 3 3L16.5 9"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reducedMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.15, duration: 0.25 }}
            />
          </motion.svg>
        ) : failed ? (
          <Alert className="size-5" />
        ) : (
          <svg
            viewBox="0 0 16 16"
            className="size-5 motion-safe:animate-spin"
            fill="none"
            stroke="currentColor"
          >
            <circle cx="8" cy="8" r="6" opacity="0.3" />
            <path d="M8 2a6 6 0 0 1 6 6" strokeLinecap="round" />
          </svg>
        )}
      </span>
      <span className="text-ds-muted">{name}</span>
      <span className={`font-medium capitalize ${tone}`}>{label}</span>
    </div>
  );
};
