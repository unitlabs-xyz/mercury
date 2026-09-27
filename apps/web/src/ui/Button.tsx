import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * The design system's button, two variants, from the portfolio header design:
 *
 *  - primary: a 1px black edge over a #2E2E2E → #0F0F0F fall, with a 1px
 *    inner highlight at 20% white. The one thing to do next.
 *  - secondary: a 1px #E9E9E5 edge over white → #EEEEEE, with a 1px inner
 *    line at 5% black. Everything else.
 *
 * Both are 32px pills with 24px sides; an icon sits 6px before the label. The
 * look is in `button-*` classes in tokens.css, so a Link and a button match.
 * `size="lg"` (40px) is for a card's one full-width action, where 32px reads
 * thin across the card; buttons in a row keep the 32px default.
 */
export type ButtonVariant = "primary" | "secondary";

type Common = {
  variant?: ButtonVariant;
  size?: "md" | "lg";
  /** The icon's size: 18px by default: the +, arrow and card glyphs fill only the middle half of their box, so this draws them about 9px beside the 14px label. "md" (16px) for an icon that fills its box, like copy. Either way the line is 1px on screen, however large the icon draws. */
  iconSize?: "sm" | "md";
  /** A glyph before the label, 18px unless `iconSize` says otherwise. */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
};

const classes = (variant: ButtonVariant, size: "md" | "lg", iconSize: "sm" | "md", className = "") =>
  `button-${variant} inline-flex ${size === "lg" ? "h-10" : "h-8 max-sm:h-10"} shrink-0 items-center justify-center gap-1 rounded-full px-6 text-[14px] font-medium whitespace-nowrap select-none disabled:cursor-not-allowed disabled:opacity-50 ${iconSize === "md" ? "[&_svg]:size-4" : "[&_svg]:size-[18px]"} [&_svg]:[stroke-width:1] [&_svg_*]:[vector-effect:non-scaling-stroke] ${className}`;

export const Button = ({
  variant = "secondary",
  size = "md",
  iconSize = "sm",
  icon,
  children,
  className,
  type = "button",
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button type={type} className={classes(variant, size, iconSize, className)} {...rest}>
    {icon}
    {children}
  </button>
);

/** The same button as a route link. */
export const ButtonLink = ({
  variant = "secondary",
  size = "md",
  iconSize = "sm",
  icon,
  children,
  className,
  to,
}: Common & { to: string }) => (
  <Link to={to} className={classes(variant, size, iconSize, className)}>
    {icon}
    {children}
  </Link>
);
