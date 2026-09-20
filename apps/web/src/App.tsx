import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Landing } from "./landing/Landing";
import { EASE } from "./motion/config";

/**
 * The landing ships eagerly because it is the first paint for anyone arriving
 * cold. Everything behind the account is split off, so a visitor reading the
 * marketing page no longer downloads the execution engine, the charts and the
 * whole app shell before it renders.
 */
const Portfolio = lazy(() => import("./app/Portfolio").then((m) => ({ default: m.Portfolio })));
const Invest = lazy(() => import("./app/Invest").then((m) => ({ default: m.Invest })));
const Stock = lazy(() => import("./app/Stock").then((m) => ({ default: m.Stock })));
const Money = lazy(() => import("./app/Money").then((m) => ({ default: m.Money })));
const Activity = lazy(() => import("./app/Activity").then((m) => ({ default: m.Activity })));
const Cards = lazy(() => import("./cards/Cards").then((m) => ({ default: m.Cards })));

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
            <Route path="/" element={<Landing />} />
            <Route path="/cards" element={<Cards />} />
            {/* Card and credit are one page now; the old link still resolves. */}
            <Route path="/credit" element={<Navigate to="/cards" replace />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/invest" element={<Invest />} />
            <Route path="/invest/:ticker" element={<Stock />} />
            <Route path="/borrow" element={<Navigate to="/cards" replace />} />
            <Route path="/money" element={<Money />} />
            <Route path="/activity" element={<Activity />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  </MotionConfig>
);
