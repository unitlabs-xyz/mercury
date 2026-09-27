import { usePrivy } from "@privy-io/react-auth";
import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Button } from "../ui/Button";
import { MercuryLogo } from "../ui/Logo";
import { AuthProvider, useAuthModal } from "./AuthContext";
import { AuthModal } from "./AuthModal";
import { SAMPLE_NO_LOGIN } from "../dev/sample";

/** Opens the sign-in sheet as soon as the page loads; it is the page's only job. */
const OpenOnArrival = () => {
  const { open } = useAuthModal();
  useEffect(() => open(), [open]);
  return null;
};

const SignInAgain = () => {
  const { open } = useAuthModal();
  return (
    <Button variant="primary" size="lg" onClick={open} className="mt-6 min-w-[160px]">
      Sign in
    </Button>
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
  if (SAMPLE_NO_LOGIN) return <Navigate to={from} replace />;
  if (!ready) return <div className="min-h-dvh bg-page" />;
  if (authenticated) return <Navigate to={from} replace />;
  return (
    <AuthProvider>
      <main className="grid min-h-dvh place-items-center bg-page px-6">
        <div className="flex flex-col items-center text-center">
          <MercuryLogo className="h-8 w-auto text-ds-ink" />
          <p className="mt-5 max-w-[36ch] text-[14px] leading-[1.5] text-ds-muted">
            The financial account built for the onchain world. Sign in with your email to continue.
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
  if (SAMPLE_NO_LOGIN) return <>{children}</>;
  if (!ready) return <div className="min-h-dvh bg-page" />;
  if (!authenticated) return <Navigate to="/" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
};
