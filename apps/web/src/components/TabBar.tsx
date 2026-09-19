import { NavLink, useLocation } from "react-router-dom";
import { cx } from "../ui/primitives";

const TABS = [
  { to: "/", label: "Home", d: "M3 10.5 12 3l9 7.5V21H3z" },
  { to: "/invest", label: "Invest", d: "M4 18 9.5 11l4 4L20 6" },
  { to: "/money", label: "Money", d: "M3 8h18v10H3zM3 8l9-4 9 4" },
  { to: "/activity", label: "Activity", d: "M3 12h4l3-7 4 14 3-7h4" },
] as const;

const ROOTS = new Set<string>(TABS.map((t) => t.to));

export function TabBar() {
  const { pathname } = useLocation();
  if (!ROOTS.has(pathname)) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-[var(--color-hairline)] bg-black/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="grid grid-cols-4">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end
            className={({ isActive }) => cx("flex flex-col items-center gap-1 py-2.5 transition-colors",
              isActive ? "text-white" : "text-[var(--color-faint)]")}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={t.d} />
            </svg>
            <span className="text-[10px] font-semibold tracking-wide">{t.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
