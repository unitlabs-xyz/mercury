import type { ReactNode } from "react";

/**
 * Full-bleed band with the 1440 / 80px content measure from the design inside it.
 * Bands span the viewport; only their contents are constrained.
 */
export const Section = ({
  id,
  tone = "shell",
  inner = "",
  className = "",
  children,
}: {
  id?: string;
  tone?: "shell" | "white";
  inner?: string;
  className?: string;
  children: ReactNode;
}) => (
  <section
    {...(id ? { id } : {})}
    className={`${tone === "white" ? "border-y border-rule bg-white" : ""} ${className}`}
  >
    <div className={`gutter mx-auto w-full max-w-[1440px] ${inner}`}>{children}</div>
  </section>
);
