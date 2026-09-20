import { AuthProvider } from "../auth/AuthContext";
import { AuthModal } from "../auth/AuthModal";
import { CallToAction, Footer } from "../landing/Closing";
import { TopBar } from "../landing/TopBar";
import { useCreditMarket } from "../market/hooks";
import { Section } from "../ui/Section";
import { Check } from "../ui/icons";
import {
  Benefits,
  CollateralTable,
  Heading,
  RateCompare,
  RiskCards,
  RiskNote,
  StepList,
  WhatItIs,
} from "./parts";

const ASSURANCES = ["No credit check", "No paperwork", "Nothing sold"];

/** The same explainer as the in-app Borrow screen, for someone without an account. */
export const Credit = () => {
  const market = useCreditMarket();
  const apy = market.data?.borrowApy;

  return (
    <AuthProvider>
      <TopBar />
      <main>
        <Section inner="py-16 sm:py-20 lg:py-24">
          <div className="mx-auto max-w-[760px] text-center">
            <h1 className="text-[40px] leading-[1.06] font-semibold tracking-[-0.035em] text-balance">
              Borrow against your stocks
            </h1>
            <p className="mx-auto mt-5 max-w-[54ch] text-[17px] leading-[1.55] text-muted text-pretty">
              Cash without selling. Your shares stay yours, stay invested, and keep whatever they
              were going to do next. Arriving in version two.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4">
              <span className="inline-flex flex-wrap items-baseline justify-center gap-2.5 rounded-2xl border border-cardline bg-white px-5 py-3.5">
                <span className="text-[14px] text-muted">Borrowing costs</span>
                <span className="text-[26px] font-semibold tracking-[-0.02em] text-up-deep tabular-nums">
                  {apy == null ? "—" : `${(apy * 100).toFixed(2)}%`}
                </span>
                <span className="text-[14px] text-muted">a year, right now</span>
              </span>
              <p className="text-[13px] text-faint">
                Read live from Kamino's xStocks market. It floats with demand.
              </p>
            </div>
            <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5">
              {ASSURANCES.map((a) => (
                <li key={a} className="flex items-center gap-2 text-[14px] text-ink-soft">
                  <Check className="size-4 text-brand" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section tone="white" inner="py-8 sm:py-9">
          <RateCompare apy={apy} />
        </Section>

        <Section inner="py-16 sm:py-20">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <Heading wide title="What borrowing against stocks actually is" />
              <div className="mt-5">
                <WhatItIs />
              </div>
            </div>
            <Benefits />
          </div>
        </Section>

        <Section tone="white" inner="py-16 sm:py-20">
          <Heading
            wide
            title="What counts as collateral, and for how much"
            body="Not every holding is worth the same as security. A broad index is steadier than one company, so more of it can be borrowed against. These are the live limits — Kamino sets them and moves them when risk changes."
          />
          <div className="mt-8">
            <CollateralTable market={market.data} loading={market.isLoading} />
          </div>
        </Section>

        <Section inner="py-16 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
            <Heading
              wide
              title="Cash against your stocks in four steps"
              body="No forms, because there is nothing to assess. The collateral is already on chain and so is the lending market."
            />
            <StepList />
          </div>
        </Section>

        <Section tone="white" inner="py-16 sm:py-20">
          <Heading
            wide
            title="What can go wrong"
            body="Borrowing against an investment makes a good outcome better and a bad one worse. Two things are worth understanding before you use any of this."
          />
          <div className="mt-8 space-y-6">
            <RiskCards />
            <RiskNote />
          </div>
        </Section>

        <CallToAction />
      </main>
      <Footer />
      <AuthModal />
    </AuthProvider>
  );
};
