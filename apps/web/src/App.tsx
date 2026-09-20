import { MotionConfig } from "motion/react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Portfolio } from "./app/Portfolio";
import { Landing } from "./landing/Landing";
import { EASE } from "./motion/config";

export const App = () => (
  // reducedMotion="user" makes every Motion animation honour the OS setting.
  <MotionConfig reducedMotion="user" transition={{ duration: 0.4, ease: EASE }}>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/portfolio" element={<Portfolio />} />
      </Routes>
    </BrowserRouter>
  </MotionConfig>
);
