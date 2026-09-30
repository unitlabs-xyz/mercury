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

/**
 * The one loading state, for a button that has been pressed and is waiting.
 *
 * Drawn from `currentColor` so it inherits whichever variant it sits in, and at
 * the stroke width the surrounding button already imposes on every glyph.
 */
const Spinner = () => (
  <svg viewBox="0 0 16 16" className="animate-spin" role="presentation">
    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" opacity="0.3" />
    <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeLinecap="round" />
  </svg>
);

type Common = {
  variant?: ButtonVariant;
  size?: "md" | "lg";
  /** The icon's size: 18px by default: the +, arrow and card glyphs fill only the middle half of their box, so this draws them about 9px beside the 14px label. "md" (16px) for an icon that fills its box, like copy. Either way the line is 1px on screen, however large the icon draws. */
  iconSize?: "sm" | "md";
  /** A glyph before the label, 18px unless `iconSize` says otherwise. */
  icon?: ReactNode;
  /**
   * Pressed, and waiting.
   *
   * The label and icon give way to one spinner — not to a sequence of them
   * naming each internal step, which is what the order sheet used to do. Those
   * names churned across the parts that took no time and then held still on the
   * part that did. Also disables the button: a second press on an order already
   * in flight is never what anyone meant.
   */
  loading?: boolean;
  children: ReactNode;
  className?: string;
};

/*
 * A loading button keeps its full strength, and is the one disabled button that
 * does. Everywhere else the half-tint means "not available to you"; here it
 * would mean "working", and the spinner is the only thing left saying so — a
 * faded spinner reads as a stalled one. Written as an omission rather than an
 * override because two `disabled:opacity-*` utilities have equal specificity,
 * and which of them won would be decided by Tailwind's own output order.
 */
const classes = (
  variant: ButtonVariant,
  size: "md" | "lg",
  iconSize: "sm" | "md",
  className = "",
  loading = false,
) =>
  `button-${variant} inline-flex ${size === "lg" ? "h-10" : "h-8 max-sm:h-10"} shrink-0 items-center justify-center gap-1 rounded-full px-6 text-[14px] font-medium whitespace-nowrap select-none ${loading ? "cursor-wait" : "disabled:cursor-not-allowed disabled:opacity-50"} ${iconSize === "md" ? "[&_svg]:size-4" : "[&_svg]:size-[18px]"} [&_svg]:[stroke-width:1] [&_svg_*]:[vector-effect:non-scaling-stroke] ${className}`;

export const Button = ({
  variant = "secondary",
  size = "md",
  iconSize = "sm",
  icon,
  loading = false,
  children,
  className,
  type = "button",
  disabled,
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    type={type}
    className={classes(variant, size, iconSize, className, loading)}
    disabled={disabled === true || loading}
    aria-busy={loading || undefined}
    {...rest}
  >
    {loading ? (
      <Spinner />
    ) : (
      <>
        {icon}
        {children}
      </>
    )}
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
