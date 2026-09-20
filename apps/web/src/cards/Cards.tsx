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
  Playbook,
  TwoModes,
} from "./sections";

/** The card page for someone who does not have an account yet. */
export const Cards = () => (
  <AuthProvider>
    <TopBar />
    <main>
      <CardHero />
      <Playbook />
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
