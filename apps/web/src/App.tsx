import { BrowserRouter, Route, Routes } from "react-router-dom";
import { TabBar } from "./components/TabBar";
import { Home } from "./screens/Home";
import { Invest } from "./screens/Invest";
import { Stock } from "./screens/Stock";
import { BasketScreen } from "./screens/BasketScreen";
import { Money } from "./screens/Money";
import { Activity } from "./screens/Activity";
import { Exposure } from "./screens/Exposure";

export function App() {
  return (
    <BrowserRouter>
      <div className="mx-auto min-h-dvh max-w-[480px]">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/invest" element={<Invest />} />
          <Route path="/stock/:ticker" element={<Stock />} />
          <Route path="/basket/:slug" element={<BasketScreen />} />
          <Route path="/exposure/:ticker" element={<Exposure />} />
          <Route path="/money" element={<Money />} />
          <Route path="/activity" element={<Activity />} />
        </Routes>
        <TabBar />
      </div>
    </BrowserRouter>
  );
}
