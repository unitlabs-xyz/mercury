import type { ReactNode } from "react";
import { AuthProvider } from "../auth/AuthContext";
import { AuthModal } from "../auth/AuthModal";
import { LoanAlert } from "./LoanAlert";
import { TopBar, type NavKey } from "./TopBar";

export const AppShell = ({
  current,
  title,
  aside,
  actions,
  quiet = false,
  children,
}: {
  current: NavKey;
  title: string;
  aside?: ReactNode;
  actions?: ReactNode;
  /** The top bar already names the page; a dashboard leads with its figures instead of repeating it. */
  quiet?: boolean;
  children: ReactNode;
}) => (
  <AuthProvider>
    {/* Every dashboard screen sets its text at -2% letter spacing, per the design. */}
    <div className="min-h-dvh bg-page tracking-[-0.02em]">
      <TopBar current={current} />

      <main className="px-5 pt-6 pb-8 sm:px-10">
        <div className="mx-auto w-full max-w-[1440px]">
          <LoanAlert />
          {quiet ? (
            <h1 className="sr-only">{title}</h1>
          ) : (
            <header className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3.5">
                <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
                {aside}
              </div>
              {actions && <div className="flex items-center gap-2.5">{actions}</div>}
            </header>
          )}

          {children}
        </div>
      </main>
    </div>
    <AuthModal />
  </AuthProvider>
);
