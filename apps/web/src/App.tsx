import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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
const Basket = lazy(() => import("./app/Basket").then((m) => ({ default: m.Basket })));
const Money = lazy(() => import("./app/Money").then((m) => ({ default: m.Money })));
const Activity = lazy(() => import("./app/Activity").then((m) => ({ default: m.Activity })));
const Cards = lazy(() => import("./cards/Cards").then((m) => ({ default: m.Cards })));
/** The side panels (Add cash, Send, Borrow), drawn over any page; see app/Panels. */
const GlobalPanels = lazy(() => import("./app/Panels").then((m) => ({ default: m.GlobalPanels })));

/** Live market data is polled, so a refetch on every window focus would be noise. */
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

/** Holds the page ground while a route chunk arrives, so nothing flashes white. */
const RouteFallback = () => <div className="min-h-dvh bg-page" />;

export const App = () => (
  // reducedMotion="user" makes every Motion animation honour the OS setting.
  <MotionConfig reducedMotion="user" transition={{ duration: 0.4, ease: EASE }}>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/cards" element={<Cards />} />
            {/* Card and credit are one page now; the old link still resolves. */}
            <Route path="/credit" element={<Navigate to="/cards" replace />} />
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
                  <Basket />
                </RequireAuth>
              }
            />
            <Route path="/borrow" element={<Navigate to="/cards" replace />} />
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
