import { MotionConfig } from "motion/react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Activity } from "./app/Activity";
import { Invest } from "./app/Invest";
import { Money } from "./app/Money";
import { Portfolio } from "./app/Portfolio";
import { Stock } from "./app/Stock";
import { Landing } from "./landing/Landing";
import { EASE } from "./motion/config";

export const App = () => (
  // reducedMotion="user" makes every Motion animation honour the OS setting.
  <MotionConfig reducedMotion="user" transition={{ duration: 0.4, ease: EASE }}>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/invest" element={<Invest />} />
        <Route path="/invest/:ticker" element={<Stock />} />
        <Route path="/money" element={<Money />} />
        <Route path="/activity" element={<Activity />} />
      </Routes>
    </BrowserRouter>
  </MotionConfig>
);
