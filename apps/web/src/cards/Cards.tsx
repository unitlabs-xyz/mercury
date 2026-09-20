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
      {/* The first screen is exactly one viewport: the card, with the rate it
          undercuts on its floor. Nothing below it peeks in. */}
      <div className="flex min-h-[calc(100dvh-var(--bar-h))] flex-col">
        <CardHero />
        <Rates />
      </div>
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
