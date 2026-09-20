import type { ReactNode } from "react";
import { HeaderChrome } from "./HeaderChrome";
import { Sidebar, type NavKey } from "./Sidebar";

export const AppShell = ({
  current,
  title,
  aside,
  actions,
  children,
}: {
  current: NavKey;
  title: string;
  aside?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) => (
  <div className="flex min-h-dvh bg-page">
    <Sidebar current={current} />

    <main className="min-w-0 flex-1 px-5 py-6 sm:px-8 sm:py-7">
      <div className="mx-auto w-full max-w-[1280px]">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3.5">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
            {aside}
          </div>
          <div className="flex items-center gap-2.5">
            {actions}
            {/* A rule, so page actions and global chrome do not read as one row. */}
            {actions && <span aria-hidden className="h-6 w-px bg-navline" />}
            <HeaderChrome />
          </div>
        </header>

        {children}
      </div>
    </main>
  </div>
);
