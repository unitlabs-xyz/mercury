/**
 * The mark is solid rather than stroked: a logo carries more weight than the
 * UI icon set, and the crossbar and upturned flukes are what make it read as
 * an anchor at 15px rather than a tuning fork.
 */
export const AnchorMark = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <circle cx="12" cy="4.3" r="2.6" />
    <rect x="10.9" y="7.4" width="2.2" height="14.3" rx="1.1" />
    <rect x="7.2" y="9.3" width="9.6" height="2.1" rx="1.05" />
    <path d="M3.1 12.4a1.15 1.15 0 0 1 2.3 0 6.6 6.6 0 0 0 13.2 0 1.15 1.15 0 0 1 2.3 0 8.9 8.9 0 0 1-17.8 0Z" />
  </svg>
);

export const Logo = ({ size = "sm" }: { size?: "sm" | "md" }) => {
  const tile = size === "md" ? "size-7 rounded-[9px]" : "size-[26px] rounded-lg";
  const mark = size === "md" ? "size-[17px]" : "size-4";
  const word = size === "md" ? "text-[17px]" : "text-[16px]";
  return (
    <>
      <span
        className={`grid ${tile} place-items-center bg-brand text-white transition-colors duration-200 group-hover:bg-brand-deep`}
      >
        <AnchorMark className={mark} />
      </span>
      <span className={`${word} font-semibold tracking-[-0.01em]`}>Harbor</span>
    </>
  );
};
