import { AuthProvider } from "../auth/AuthContext";
import { AuthModal } from "../auth/AuthModal";
import { Footer } from "../landing/Closing";
import { TopBar } from "../landing/TopBar";
import {
  CardClosing,
  CardHero,
  EarnWhileYouSpend,
  HowItWorks,
  NonCustodial,
  Plans,
  Platinum,
  Rates,
  TwoModes,
} from "./sections";

/**
 * Card and credit are one product: the line is secured on the shares you hold,
 * and the card is how you spend it. They were two pages telling half the story
 * each.
 */
export const Cards = () => (
  <AuthProvider>
    <TopBar />
    <main>
      <CardHero />
      <Rates />
      <HowItWorks />
      <TwoModes />
      <EarnWhileYouSpend />
      <Plans />
      <Platinum />
      <NonCustodial />
      <CardClosing />
    </main>
    <Footer />
    <AuthModal />
  </AuthProvider>
);
