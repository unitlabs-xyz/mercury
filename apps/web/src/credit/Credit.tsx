import { AuthProvider } from "../auth/AuthContext";
import { AuthModal } from "../auth/AuthModal";
import { CallToAction, Footer } from "../landing/Closing";
import { TopBar } from "../landing/TopBar";
import { Collateral } from "./Collateral";
import { CreditHero } from "./CreditHero";
import { Explainer } from "./Explainer";
import { RateBand } from "./RateBand";
import { Risk } from "./Risk";
import { Steps } from "./Steps";

export const Credit = () => (
  <AuthProvider>
    <TopBar />
    <main>
      <CreditHero />
      <RateBand />
      <Explainer />
      <Collateral />
      <Steps />
      <Risk />
      <CallToAction />
    </main>
    <Footer />
    <AuthModal />
  </AuthProvider>
);
