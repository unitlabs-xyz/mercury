import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Landing } from "./landing/Landing";

export const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Landing />} />
    </Routes>
  </BrowserRouter>
);
