import { CustodyStrip, StatsBand } from "./Bands";
import { CallToAction, Footer } from "./Closing";
import { Faq } from "./Faq";
import { Features } from "./Features";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { IssuerComparison } from "./IssuerComparison";
import { TopBar } from "./TopBar";
import { Trust } from "./Trust";

export const Landing = () => (
  <div className="min-h-dvh bg-page lg:p-8">
    <div className="mx-auto max-w-[1440px] overflow-hidden bg-shell lg:rounded-2xl lg:border lg:border-edge lg:shadow-[0_1px_3px_rgba(27,26,23,.05)]">
      <TopBar />
      <Hero />
      <CustodyStrip />
      <StatsBand />
      <HowItWorks />
      <IssuerComparison />
      <Features />
      <Trust />
      <Faq />
      <CallToAction />
      <Footer />
    </div>
  </div>
);
