import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Activity } from "./app/Activity";
import { Borrow } from "./app/Borrow";
import { Credit } from "./credit/Credit";
import { Invest } from "./app/Invest";
import { Money } from "./app/Money";
import { Portfolio } from "./app/Portfolio";
import { Stock } from "./app/Stock";
import { Landing } from "./landing/Landing";
import { EASE } from "./motion/config";

/** Live market data is polled, so a refetch on every window focus would be noise. */
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export const App = () => (
  // reducedMotion="user" makes every Motion animation honour the OS setting.
  <MotionConfig reducedMotion="user" transition={{ duration: 0.4, ease: EASE }}>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/credit" element={<Credit />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/invest" element={<Invest />} />
          <Route path="/invest/:ticker" element={<Stock />} />
          <Route path="/borrow" element={<Borrow />} />
          <Route path="/money" element={<Money />} />
          <Route path="/activity" element={<Activity />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </MotionConfig>
);
