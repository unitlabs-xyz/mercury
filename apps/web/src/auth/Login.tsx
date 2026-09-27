import { usePrivy } from "@privy-io/react-auth";
import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Logo } from "../ui/Logo";
import { AuthProvider, useAuthModal } from "./AuthContext";
import { AuthModal } from "./AuthModal";
import { SAMPLE } from "../dev/sample";

/** Opens the sign-in sheet as soon as the page loads; it is the page's only job. */
const OpenOnArrival = () => {
  const { open } = useAuthModal();
  useEffect(() => open(), [open]);
  return null;
};

const SignInAgain = () => {
  const { open } = useAuthModal();
  return (
    <button
      type="button"
      onClick={open}
      className="mt-6 rounded-[10px] bg-brand px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-deep"
    >
      Sign in
    </button>
  );
};

/**
 * The web app's front door. The marketing site is its own app (apps/landing);
 * here a visitor signs in, and someone already signed in goes straight to their
 * portfolio. Closing the sheet leaves a single way back into it.
 */
export const Login = () => {
  const { ready, authenticated } = usePrivy();
  // Back to where they were headed before being asked to sign in.
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/portfolio";
  if (SAMPLE) return <Navigate to={from} replace />;
  if (!ready) return <div className="min-h-dvh bg-page" />;
  if (authenticated) return <Navigate to={from} replace />;
  return (
    <AuthProvider>
      <main className="grid min-h-dvh place-items-center bg-page px-6">
        <div className="flex flex-col items-center text-center">
          <Logo />
          <p className="mt-4 max-w-[36ch] text-[14px] leading-[1.55] text-muted">
            Real stocks, held in your own wallet. Sign in with your email to continue.
          </p>
          <SignInAgain />
        </div>
      </main>
      <OpenOnArrival />
      <AuthModal />
    </AuthProvider>
  );
};

/** App screens are for signed-in accounts; anyone else is sent to sign in, then brought back. */
export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { ready, authenticated } = usePrivy();
  const location = useLocation();
  if (SAMPLE) return <>{children}</>;
  if (!ready) return <div className="min-h-dvh bg-page" />;
  if (!authenticated) return <Navigate to="/" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
};
