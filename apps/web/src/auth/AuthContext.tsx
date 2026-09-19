import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type AuthModal = { isOpen: boolean; open: () => void; close: () => void };

const Ctx = createContext<AuthModal | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useAuthModal = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuthModal must be used inside AuthProvider");
  return ctx;
};
