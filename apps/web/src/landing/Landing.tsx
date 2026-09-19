import { Hero } from "./Hero";
import { TopBar } from "./TopBar";

export const Landing = () => (
  <main className="min-h-dvh bg-page p-3 sm:p-6 lg:p-8">
    <div className="overflow-hidden rounded-[22px] border border-line bg-canvas lg:rounded-[28px]">
      <TopBar />
      <Hero />
    </div>
  </main>
);
