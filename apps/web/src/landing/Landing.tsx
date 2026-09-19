import { CustodyStrip, StatsBand } from "./Bands";
import { CallToAction, Footer } from "./Closing";
import { Faq } from "./Faq";
import { MarketHours } from "./MarketHours";
import { Portfolio } from "./Portfolio";
import { Features } from "./Features";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { IssuerComparison } from "./IssuerComparison";
import { TopBar } from "./TopBar";
import { Trust } from "./Trust";

export const Landing = () => (
  <>
    <TopBar />
    <main>
      {/* The first screen is exactly one viewport: hero, with the partner strip
          on its floor. Nothing below it peeks in. */}
      <div className="flex min-h-[calc(100dvh-var(--bar-h))] flex-col">
        <Hero />
        <CustodyStrip />
      </div>
      <StatsBand />
      <Portfolio />
      <HowItWorks />
      <IssuerComparison />
      <Features />
      <MarketHours />
      <Trust />
      <Faq />
      <CallToAction />
    </main>
    <Footer />
  </>
);
