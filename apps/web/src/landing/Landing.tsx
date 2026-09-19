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
  <>
    <TopBar />
    <main>
      <Hero />
      <CustodyStrip />
      <StatsBand />
      <HowItWorks />
      <IssuerComparison />
      <Features />
      <Trust />
      <Faq />
      <CallToAction />
    </main>
    <Footer />
  </>
);
