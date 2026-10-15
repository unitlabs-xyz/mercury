import { usePrivy } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { Suspense, lazy, useEffect, useLayoutEffect, useRef } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigationType } from "react-router-dom";
import { Login, RequireAuth } from "./auth/Login";
import { EASE } from "./motion/config";

/**
 * Sign-in ships eagerly because it is the first paint for anyone arriving cold.
 * Everything behind the account is split off, so the login does not download
 * the execution engine, the charts and the whole app shell before it renders.
 * The marketing site is its own app, apps/landing.
 */
const Portfolio = lazy(() => import("./app/Portfolio").then((m) => ({ default: m.Portfolio })));
const Invest = lazy(() => import("./app/Invest").then((m) => ({ default: m.Invest })));
const Stock = lazy(() => import("./app/Stock").then((m) => ({ default: m.Stock })));
const Baskets = lazy(() => import("./app/Baskets").then((m) => ({ default: m.Baskets })));
const BasketDetail = lazy(() => import("./app/Basket").then((m) => ({ default: m.BasketDetail })));
const Money = lazy(() => import("./app/Money").then((m) => ({ default: m.Money })));
const Activity = lazy(() => import("./app/Activity").then((m) => ({ default: m.Activity })));
/** The side panels (Add cash, Send, Borrow), drawn over any page; see app/Panels. */
const GlobalPanels = lazy(() => import("./app/Panels").then((m) => ({ default: m.GlobalPanels })));

/**
 * Market data is polled, so a refetch on every window focus would be noise.
 *
 * This is a default, not a rule. The account reads in `api/hooks.ts` set it
 * back on for themselves: coming back to the tab is exactly when somebody has
 * just done something in a wallet popup, and is the moment their balances are
 * most likely to be wrong.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

/** Holds the page ground while a route chunk arrives, so nothing flashes white. */
const RouteFallback = () => <div className="min-h-dvh bg-page" />;

/**
 * A new page opens at its top. Only a new path counts: a query change is a
 * panel opening over the same page, and Back/Forward (POP) leave the browser
 * to put you back where you were.
 */
const ScrollToTop = () => {
  const { pathname } = useLocation();
  const type = useNavigationType();
  useLayoutEffect(() => {
    if (type !== "POP") window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, type]);
  return null;
};

/**
 * Forgets the account when its owner signs out. The account reads are keyed by
 * what they are, not whose, so without this the next person to sign in on the
 * same browser is shown the last one's balance, holdings and deposit address
 * until their own reads come back.
 */
const ForgetOnSignOut = () => {
  const { ready, authenticated } = usePrivy();
  const signedIn = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (signedIn.current && !authenticated) queryClient.clear();
    signedIn.current = authenticated;
  }, [ready, authenticated]);
  return null;
};

export const App = () => (
  // reducedMotion="user" makes every Motion animation honour the OS setting.
  <MotionConfig reducedMotion="user" transition={{ duration: 0.4, ease: EASE }}>
    <QueryClientProvider client={queryClient}>
      <ForgetOnSignOut />
      <BrowserRouter>
        <ScrollToTop />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Login />} />
            {/* The card is coming soon and its marketing page lives in apps/landing; old links land on the portfolio. */}
            <Route path="/cards" element={<Navigate to="/portfolio" replace />} />
            <Route path="/credit" element={<Navigate to="/portfolio" replace />} />
            <Route
              path="/portfolio"
              element={
                <RequireAuth>
                  <Portfolio />
                </RequireAuth>
              }
            />
            <Route
              path="/invest"
              element={
                <RequireAuth>
                  <Invest />
                </RequireAuth>
              }
            />
            <Route
              path="/invest/:ticker"
              element={
                <RequireAuth>
                  <Stock />
                </RequireAuth>
              }
            />
            <Route
              path="/baskets"
              element={
                <RequireAuth>
                  <Baskets />
                </RequireAuth>
              }
            />
            <Route
              path="/baskets/:slug"
              element={
                <RequireAuth>
                  <BasketDetail />
                </RequireAuth>
              }
            />
            <Route path="/borrow" element={<Navigate to="/portfolio" replace />} />
            <Route
              path="/money"
              element={
                <RequireAuth>
                  <Money />
                </RequireAuth>
              }
            />
            <Route
              path="/activity"
              element={
                <RequireAuth>
                  <Activity />
                </RequireAuth>
              }
            />
          </Routes>
        </Suspense>
        {/* Over whatever route is open, and loaded on its own so sign-in stays light. */}
        <Suspense fallback={null}>
          <GlobalPanels />
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  </MotionConfig>
);
