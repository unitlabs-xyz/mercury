import { usePrivy } from "@privy-io/react-auth";
import { Dashboard } from "./Dashboard";
import { useSignedIn } from "./auth";

/**
 * Sign in, then the dashboard. There are no other screens.
 *
 * No router: one app, one page. `react-router-dom` would be a dependency and
 * a chunk for a surface with nowhere to navigate to.
 */
export const App = () => {
  const { ready, login, logout } = usePrivy();
  const signedIn = useSignedIn();

  /* Privy decides first. Rendering a sign-in button before it has answered
     shows a signed-in admin a login screen for a moment on every reload. */
  if (!ready) return <div className="min-h-dvh" />;

  if (!signedIn) {
    return (
      <main className="grid min-h-dvh place-items-center px-5">
        <div className="w-full max-w-[320px] text-center">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Mercury admin</h1>
          <p className="mt-2 text-[13px] leading-[1.5] text-muted">
            Sign in with the email on your Mercury account.
          </p>
          <button
            type="button"
            onClick={login}
            className="mt-5 h-10 w-full rounded-full bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep"
          >
            Sign in
          </button>
        </div>
      </main>
    );
  }

  return <Dashboard onSignOut={() => void logout()} />;
};
