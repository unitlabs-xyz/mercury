# EU legal frame for a revenue-share referral programme on tokenized US stocks (xStocks), as of 21 October 2026

Scope note: these notes describe rules and how they are likely to apply. They are not legal advice. The design under review: Mercury (a self-custodial Solana app) charges 0.5% per xStocks trade routed through Jupiter. The inviting user would get 25–35% of Mercury's fee on the friend's trades for 12 months, after a 7-day hold, with clawbacks, paid monthly in USDC. Unless stated otherwise, "MiFID II" means Directive 2014/65/EU as currently in force. The Retail Investment Strategy (RIS) amendments are agreed but not yet in force.

## Key Question 1: How are xStocks classified in the EU, does distributing them to EU retail need a MiFID licence, and how do other platforms structure it?

### Takeaway

xStocks are issued as tracker certificates, which are bearer debt securities under an EU base prospectus approved by Liechtenstein's FMA. In the EU that makes them MiFID II transferable securities, and probably PRIIPs-style structured products, rather than MiCA crypto-assets. A MiCA CASP licence does not cover them. Every major platform offering stock tokens to EU retail does so through a MiFID investment firm: Kraken through CySEC, Robinhood through the Bank of Lithuania, Gemini through the MFSA in Malta. Whether a purely non-custodial interface that charges a fee is performing a MiFID service, most likely reception and transmission of orders (RTO), is unresolved. No regulator has ruled on it.

### Cited Findings

**Issuer and legal nature of xStocks**

- The issuer is Backed Assets (JE) Limited, a Jersey company registered with the JFSC. Each xStock is described as a bearer debt instrument classified as a tracker certificate. It gives no shareholder voting rights. The product is described as a structured financial instrument, not direct equity ownership. — [xStocks Product Legal Overview](https://docs.xstocks.fi/docs/product-legal-overview)
- The EEA offer runs on a base prospectus approved by the Liechtenstein FMA under the EU Prospectus Regulation, with separate Final Terms for each product. Backed says the approval is passportable across the EEA and lets licensed third-party distributors offer xStocks to retail clients. It adds that distributors are responsible for complying with the rules where they operate, and that some other jurisdictions may classify the tokens as crypto-assets. The page does not mention MiCA. — [xStocks Product Legal Overview](https://docs.xstocks.fi/docs/product-legal-overview)
- Approval dates:
  - FMA approved the base prospectus on 8 May 2024 (ref. 20240508_351548). — [FMA certificate, hosted by MFSA](https://www.mfsa.mt/wp-content/uploads/2024/07/Backed-Assets-JE-Limited-Cetificate-of-Approval-of-a-Base-Prospectus-dated-08-May-2024.pdf)
  - FMA approved a supplement on 11 April 2025. — [MFSA](https://www.mfsa.mt/wp-content/uploads/2025/04/Backed-Assets-JE-Limited-Certificate-of-Approval-of-a-Supplement-dated-11-April-2025.pdf)
  - FMA approved a further supplement on 4 August 2026. — [MFSA](https://www.mfsa.mt/wp-content/uploads/2026/08/Backed-Assets-JE-Limited-Certificate-of-Approval-of-a-Supplement-dated-04-August-2026.pdf)
  - The prospectus has been passported to Norway and Belgium. — [Finanstilsynet](https://www.finanstilsynet.no/en/approved-prospectuses/2024/base-prospectus-backed-assets-je-limited-1717081309); [FSMA](https://www.fsma.be/en/prospectus/backed-assets-je-limited)
  - Search results also pointed to a new base prospectus dated 8 May 2026 in Romanian ASF passport files. I did not verify it directly.
- Kraken agreed on 2 December 2025 to acquire Backed Finance AG, the company behind xStocks. At the time xStocks had passed $10bn in combined exchange and on-chain volume and covered more than 60 equities and ETFs on Solana and Ethereum. — [Business Wire, 2 Dec 2025](https://www.businesswire.com/news/home/20251202666578/en/Kraken-to-Acquire-Backed-Accelerating-xStocks-Expansion-and-Unlocking-Global-Demand-for-Tokenized-Equities); [Ledger Insights](https://www.ledgerinsights.com/kraken-acquires-backed-after-xstocks-tokenized-securities-volumes-hit-10-billion/)

**EU legal tests that decide the classification** (primary texts)

- **MiFID II Art. 4(1)(44):** "transferable securities" include bonds and other securitised debt, and securities giving rise to a cash settlement determined by reference to transferable securities. Annex I Section C(1) lists transferable securities as financial instruments. — [MiFID II, EUR-Lex](https://eur-lex.europa.eu/eli/dir/2014/65/oj)
- **MiCA Art. 2(4)(a):** MiCA does not apply to crypto-assets that qualify as MiFID financial instruments. — [MiCA, Regulation (EU) 2023/1114](https://eur-lex.europa.eu/eli/reg/2023/1114/oj)
- **Prospectus Regulation Art. 2(a):** the Regulation applies to "securities", meaning MiFID transferable securities. An FMA-approved prospectus therefore presupposes that the instrument is a transferable security. — [Prospectus Regulation (EU) 2017/1129](https://eur-lex.europa.eu/eli/reg/2017/1129/oj)
- **MiFID II Art. 25(4):** execution-only (no appropriateness test) is limited to non-complex instruments. Bonds and securitised debt that incorporate a derivative or a structure that makes the risk hard to understand are excluded from that category. Art. 16(3) and 24(2) require product-governance target-market work by distributors. — [MiFID II](https://eur-lex.europa.eu/eli/dir/2014/65/oj)
- **MiFID II Annex I Section A:** the licensable services include (1) reception and transmission of orders, (2) execution of orders on behalf of clients, (5) investment advice, and (6)/(7) placing. Art. 5 makes provision of these services "as a regular occupation or business" subject to authorisation. — [MiFID II](https://eur-lex.europa.eu/eli/dir/2014/65/oj)

**ESMA's stance on tokenised stocks**

- On 1 September 2025, ESMA Executive Director Natasha Cazenave said tokenised stocks offer always-on access and fractionalisation but typically confer no shareholder rights. She warned this creates a risk of investor misunderstanding. — [ESMA keynote, 1 Sep 2025](https://www.esma.europa.eu/sites/default/files/2025-09/ESMA75-1322421554-607_Natasha_Cazenave_s_Keynote_Speech_at_Capital_Markets_in_Digital_Age__1-2_September_2025.pdf); [Cointelegraph coverage](https://cointelegraph.com/news/investors-misunderstand-tokenized-stocks-eu-markets-watchdog)
- On 30 September 2026, in its response to the Commission's MiCA review consultation, ESMA asked for binding token-classification rules and clearer decentralisation criteria. — [ESMA response, 30 Sep 2026](https://www.esma.europa.eu/sites/default/files/2026-09/ESMA75-113276571-1721_Response_to_the_EC_consultation_MiCA_regulation_review.pdf)

**How other platforms structure EU stock-token offers**

- **Kraken:**
  - Obtained a MiFID licence in February 2025 by acquiring a CySEC-authorised Cypriot investment firm. — [Kraken blog](https://blog.kraken.com/news/eu-mifid-license); [CoinDesk, 4 Feb 2025](https://www.coindesk.com/policy/2025/02/04/kraken-secures-license-to-enter-eu-derivatives-market)
  - The entity is Payward Europe Digital Solutions (CY) Ltd, CySEC licence 342/17. Kraken's MiCA authorisation is separate and comes from the Central Bank of Ireland. — [Kraken, How Kraken is regulated](https://www.kraken.com/learn/how-kraken-is-regulated)
  - On 18 August 2026 Kraken launched US equities for eligible EEA customers alongside xStocks, through the CySEC-authorised Payward Europe Digital Solutions entity. — [Finance Magnates, 18 Aug 2026](https://www.financemagnates.com/forex/kraken-lets-european-users-hold-us-equities-and-xstocks-together/)
- **Robinhood:**
  - EU stock tokens are offered through Robinhood Europe UAB, supervised by the Bank of Lithuania. Robinhood's EU KID describes them as OTC derivatives under MiFID II. — [Robinhood EU KID](https://cdn.robinhood.com/assets/robinhood/legal/stock_tokens_kid_eu.pdf)
  - In July 2025 the Bank of Lithuania sought clarification on the OpenAI and SpaceX tokens. — [CNBC, 7 Jul 2025](https://www.cnbc.com/2025/07/07/robinhood-stock-tokens-face-scrutiny-in-the-eu-after-openai-warning.html)
  - A secondary source reports that a newer 1:1-backed "Stock Tokens" product is issued by a Jersey entity as a tokenised debt security. — [eco.com explainer](https://eco.com/support/en/articles/15083160-robinhood-tokenized-stocks-what-s-live-and-how-it-works)
- **Gemini:** EU tokenised stocks are Dinari "dShares", described as unleveraged OTC derivatives. They are offered under Gemini's Malta (MFSA) MiFID II licence, launched in mid-2025. — [Yahoo Finance](https://finance.yahoo.com/news/gemini-rolls-tokenized-stocks-eu-215626728.html); [Cryptopolitan](https://www.cryptopolitan.com/gemini-brings-wall-street-to-the-eu/)
- **Bybit:**
  - Lists xStocks and describes them as tracker certificates under an EU prospectus. — [Bybit Learn](https://learn.bybit.com/en/bybit-guide/trade-xstocks-on-bybit-spot)
  - Bybit EU GmbH holds a MiCA CASP licence from the Austrian FMA (May 2025). — [Cointelegraph](https://cointelegraph.com/news/bybit-secures-mica-license-establishes-eu-hq-in-vienna)
  - I found no source confirming that xStocks are offered to EEA retail on Bybit EU, or under which MiFID permission.

**Non-custodial front-ends**

- One law-firm view (Lexr) is that a non-custodial front-end is not RTO, because the user's own wallet signs and submits the transaction. The same analysis flags that "active" front-ends which build transactions for users may need authorisation. — [Lexr](https://www.lexr.com/en-ch/blog/defi-frontend-regulation/)
- I found no ESMA or national regulator statement on non-custodial front-ends routing tokenised MiFID instruments. — same source and searches

### Inferences

- Because the instrument is prospectus-approved securitised debt, the EU starting point is MiFID II plus PRIIPs, not MiCA. A tracker certificate whose return depends on a reference share is a typical PRIIP, so a retail KID is expected under Regulation (EU) No 1286/2014 ([EUR-Lex](https://eur-lex.europa.eu/eli/reg/2014/1286/oj)). Counsel should check that Backed publishes KIDs for each xStock and in which languages.
- A MiCA CASP licence would not let Mercury distribute xStocks. The reverse route does exist: under MiCA Art. 60(3), a MiFID firm can add crypto services by notification. Licensing for xStocks therefore points to a MiFID authorisation (RTO, and possibly execution) or to operating under an authorised EU distributor.
- Mercury's facts weigh towards a regulated service: a per-trade 0.5% fee, an app that builds and routes swaps through Jupiter, and a branded product aimed at retail. That makes the "pure software" defence uncertain, and paid referral marketing aimed at EU residents makes the business look more like a regular activity directed at the EU (see Key Question 3 on solicitation).
- Every incumbent with EU retail stock tokens uses a MiFID entity. None appears to rely on a MiCA licence or an unlicensed front-end.

### Gaps

- I did not read the Backed base prospectus or Final Terms for the selling restrictions, the distributor conditions (for example, whether distributors must be MiFID-authorised), the target-market definition, or the KID availability.
- I found no FMA Liechtenstein publication on secondary distribution of xStocks via DEXs or wallets.
- Whether Bybit EU offers xStocks to EEA retail, and under which licence, is unverified.
- I found no regulator guidance on whether a self-custodial wallet with an integrated DEX route and a fee performs RTO under MiFID.

## Key Question 2: MiFID II inducements and tied agents. Can a firm share commissions with an unlicensed person who brings clients, and what do ESMA, national regulators and the RIS say about affiliates, finfluencers and refer-a-friend?

### Takeaway

If Mercury, or a partner distributor, is a MiFID firm, paying a referring user 25–35% of the friend's trading fees for 12 months is an ongoing third-party payment "in connection with" an investment service to the friend. It falls under the Art. 24(9) inducement rule, must pass the quality-enhancement test and must be disclosed. Poland's UKNF says outright that fee-proportional and per-client referral payments are prohibited inducements. Spain, Portugal, Italy and Poland also reserve individualised client acquisition to the firm or its registered tied agents. The RIS, politically agreed on 18 December 2025 and not yet in force, keeps inducements but tightens the test, lets Member States ban them, and makes firms contractually responsible for finfluencers.

### Cited Findings

**Primary MiFID II rules**

- **MiFID II Art. 24(9):** a firm fails its best-interest duty if it pays or receives any fee, commission or non-monetary benefit in connection with an investment or ancillary service to or from any party other than the client, or a person acting on the client's behalf. The exception requires that the payment is designed to enhance the quality of the service to the client and does not impair the duty to act in the client's best interest. The existence, nature and amount of the payment must be clearly disclosed to the client before the service is provided. — [MiFID II](https://eur-lex.europa.eu/eli/dir/2014/65/oj)
- **Delegated Directive (EU) 2017/593 Art. 11(2):** a payment counts as quality-enhancing only if it:
  - (a) is justified by an additional or higher-level service to the relevant client, proportional to the inducement;
  - (b) does not directly benefit the recipient firm, its shareholders or employees without a tangible benefit to the relevant client;
  - (c) is justified, if it is an ongoing inducement, by an ongoing benefit to the relevant client.

  Art. 11(5) sets the disclosure mechanics. — [Delegated Directive 2017/593](https://eur-lex.europa.eu/eli/dir_del/2017/593/oj)

- **CESR's 2007 Level 3 recommendations (CESR/07-228b):** these were the first to treat third-party payments under the inducements article, requiring prior disclosure and a quality-enhancement purpose. They are pre-MiFID II but are still cited as interpretive background. — [CESR/07-228b](https://www.esma.europa.eu/sites/default/files/library/2015/11/07_228b.pdf)
- **Tied agents, MiFID II Art. 4(1)(29) and Art. 29:**
  - A tied agent acts under the full and unconditional responsibility of only one investment firm. It promotes that firm's investment or ancillary services, receives and transmits orders, places instruments or gives advice on the firm's behalf.
  - Tied agents must be entered in a public register, be of good repute, and have appropriate knowledge and competence.
  - The firm remains fully responsible for them, and they must disclose the capacity in which they act.

  — [MiFID II](https://eur-lex.europa.eu/eli/dir/2014/65/oj)

- **Delegated Regulation (EU) 2017/565 Art. 44:** sets the "fair, clear and not misleading" conditions for marketing information, including fair and prominent risk indication. — [Delegated Regulation 2017/565](https://eur-lex.europa.eu/eli/reg_del/2017/565/oj)

**ESMA Discussion Paper ESMA35-43-3682 (14 December 2023)**

- **Affiliate model:** ESMA describes affiliate marketing as a firm rewarding an affiliate per client brought in, typically with a commission per sale or lead. It says whether that compensation is an unauthorised inducement must be assessed case by case (footnote 42). — [ESMA DP, 14 Dec 2023](https://www.esma.europa.eu/sites/default/files/2023-12/ESMA35-43-3682_Discussion_Paper_on_MiFID_II_investor_protection_topics_linked_to_digitalisation.pdf)
- **Firm responsibility:**
  - Firms select affiliates, so they remain responsible for how affiliates communicate and must monitor them (para. 64).
  - An affiliate praising a service without fair and prominent risk information breaches Art. 44 of Delegated Regulation 2017/565, and the post must be identified as an advertisement (para. 49).
  - Firms should ensure there is no conflict of interest in an influencer's remuneration scheme, and management should take responsibility for selecting affiliates (paras. 80–81).
  - Risky or complex instruments should not be marketed through finfluencers (para. 82).

  — [ESMA DP](https://www.esma.europa.eu/sites/default/files/2023-12/ESMA35-43-3682_Discussion_Paper_on_MiFID_II_investor_protection_topics_linked_to_digitalisation.pdf)

- **National regimes ESMA catalogued (paras. 65–70):**
  - _Portugal:_ only an authorised intermediary or a tied agent may do advertising and prospecting. An affiliate must be a tied agent or a mere channel for the firm's labelled adverts.
  - _Spain:_ only investment firms or tied agents may professionally market investment services and recruit clients. The CNMV's public statement of 24 November 2020 called affiliate programmes for client acquisition by others "unacceptable".
  - _France:_ the June 2023 influencer law (see Key Question 3).
  - _Poland:_ individualised client solicitation is reserved to the firm or its agent unless it is addressed to a broad or unspecified audience.
  - _Italy:_ online promotion is reserved to authorised entities under Art. 32 TUF and CONSOB Regulation 20307/2018. Affiliates ("segnalatori di pregi", per CONSOB Communication DIN/2049119 of 15 July 2002) may only present the firm's name and qualities generically. Pay based on results, such as transactions closed, is an indicator that the allowed scope has been exceeded.

  — [ESMA DP](https://www.esma.europa.eu/sites/default/files/2023-12/ESMA35-43-3682_Discussion_Paper_on_MiFID_II_investor_protection_topics_linked_to_digitalisation.pdf)

**Poland: UKNF position on referral and affiliate programmes** (dated October 2023 per CySEC's relay; the English PDF was last modified July 2024). This is the most specific regulator text found on refer-a-friend.

- It describes referral programmes in which the firm rewards clients with free instruments, cash or fee discounts for each new client acquired through codes or links. Under Art. 79(2a) of the Polish Act on Trading in Financial Instruments, client acquisition is reserved to the firm or its registered tied agent. — [UKNF position](https://www.knf.gov.pl/knf/en/komponenty/img/Position%20of%20the%20UKNF%20on%20referral%20programmes%20and%20affiliate%20programmes_84448.pdf)
- A referring client's activity is treated as active direct marketing carried out for and on behalf of the firm, because the client is paid for it. Sharing a code or link with specific people, or within a social-network or messenger group, is not "addressing an unspecified audience". — [UKNF position](https://www.knf.gov.pl/knf/en/komponenty/img/Position%20of%20the%20UKNF%20on%20referral%20programmes%20and%20affiliate%20programmes_84448.pdf)
- **Inducements (Art. 83d(1), Poland's transposition of MiFID Art. 24(9)):**
  - Cost-per-action payments (per registration, contract or deposit) are prohibited inducements.
  - So are cost-per-sale payments proportional to the spread, the firm's commission or the transaction value.
  - Payments made only for marketing activity cannot be quality-enhancing.
  - A one-off or fixed monthly fee for posting material is permitted if it does not depend on the number of clients or their activity.

  — [UKNF position](https://www.knf.gov.pl/knf/en/komponenty/img/Position%20of%20the%20UKNF%20on%20referral%20programmes%20and%20affiliate%20programmes_84448.pdf)

- Referral participants are not "relevant persons" under Delegated Regulation 2017/565, so payments to them are not staff remuneration and are analysed as inducements. — [UKNF position](https://www.knf.gov.pl/knf/en/komponenty/img/Position%20of%20the%20UKNF%20on%20referral%20programmes%20and%20affiliate%20programmes_84448.pdf)
- On 12 November 2024 CySEC reminded Cyprus investment firms (CIFs) to comply with the UKNF position. — [Finance Magnates, 12 Nov 2024](https://www.financemagnates.com/forex/cysec-alerts-cifs-to-uknf-restrictions-on-referral-and-affiliate-programmes/)

**Other national positions**

- **Cyprus:** CySEC Circular C217 (26 June 2017, "Use of Affiliates") requires affiliate material to be prepared by the CIF, or pre-approved and monitored by it. CySEC also announced a warning list of non-compliant affiliates. — [LeapRate reproduction of C217](https://www.leaprate.com/forex/regulations/cysec-publish-list-outlawed-binary-options-fx-affiliates/)
- **Germany:**
  - A pure "Tippgeber" who only names an opportunity or a provider, without deliberately working on the investor's willingness to buy, is not doing licensed brokerage (Anlagevermittlung). — [IHK Merkblatt](https://www.ihk.de/blueprint/servlet/resource/blob/1478582/76c84c3893fb0d44f97c6530b918b47e/merkblatt-erlaubnis-u-registrierungspflicht-fuer-finanzanlagen-data.pdf)
  - BaFin reads brokerage broadly. The BGH (5 Dec 2013, III ZR 73/12) treated as a broker someone who prepared a transaction so far that the client only had to sign. — [cash-online](https://www.cash-online.de/a/tippgeber-oder-vermittler-306884/2/)
  - BaFin's "five points for influencers" (19 August 2026) require disclosure of any inducement received for promotion. They treat personalised recommendations as licensable investment advice, and BaFin says it will keep scrutinising collaborations between firms and finfluencers. — [Regulation Tomorrow summary, 25 Aug 2026](https://www.regulationtomorrow.com/2026/08/bafin-published-five-points-to-note-for-influencers/)
- **France:** the AFG professional guide (2015) describes an apporteur d'affaires (business introducer) as an unregulated activity only if it is pure introduction, with no advice and no canvassing. It can become regulated financial canvassing (démarchage bancaire et financier) when the introducer is mandated to find investors. — [AFG guide](https://www.afg.asso.fr/app/uploads/2015/06/2015_06_Guide_Professionnel_clarification_statut_intermediaire-1.pdf)
- **ESMA finfluencer factsheet (January 2026):**
  - Finfluencers are responsible for their content even without qualifications, and must prominently disclose compensation.
  - "Not financial advice" disclaimers do not neutralise obligations.
  - National authorities republished it: CONSOB on 12 January 2026, AMF and ARPP on 9 January 2026, FMA Austria.
  - The AMF asks firms to ensure that the influencers they use hold ARPP certification.

  — [ESMA factsheet](https://www.esma.europa.eu/sites/default/files/2026-01/Finfluencers_factsheet_EN.pdf); [CONSOB, 12 Jan 2026](https://www.consob.it/documents/d/asset-library-1912910/pr_20260112); [ARPP, 9 Jan 2026](https://www.arpp.org/actualite/amf-et-esma-publient-des-conseils-a-destination-des-finfluenceurs-pour-une-promotion-responsable-sur-les-reseaux-sociaux/); [FMA Austria](https://www.fma.gv.at/en/esma-factsheet-for-finfluencers-tips-for-responsible-financial-promotion/)

**Market practice of EU-licensed brokers**

- **Trade Republic Bank GmbH** (Dutch terms of 12 May 2026):
  - The referrer gets a fixed €5–200 cash bonus, or a 3% interest bonus on cash for 3 months (capped at 4 uses). Payment is triggered by the new customer depositing €300.
  - Each referrer is capped at 40 referrals or €2,000.
  - The programme is for personal, non-commercial use only. Public distribution of links (YouTube, WhatsApp groups, podcasts, forums, coupon sites) is banned, with clawback if it is discovered after payment.
  - The reward is not linked to the referee's trading fees or volume.

  — [Trade Republic NL referral T&Cs, May 2026](https://assets.traderepublic.com/documents/NL/TERMS_AND_CONDITIONS_REFERRAL_20260511222002.pdf)

- **Scalable Capital:** a fixed €25 (broker) or €50 (wealth) reward, up to 10 rewards. It requires the referee to trade €250 and stay a client for 6 months, and public posting can lead to rewards being withheld. — [Scalable help centre](https://help.scalable.capital/en/referral-programme-81610247/how-and-when-will-i-receive-my-reward-8684f27e)

**Retail Investment Strategy (RIS) status and content**

- **18 December 2025:** Council and Parliament reached a political agreement. — [Council press release](https://www.consilium.europa.eu/en/press/press-releases/2025/12/18/retail-investment-strategy-council-and-parliament-agree-on-package-to-empower-consumers-while-boosting-markets/)
- **Inducements:**
  - The proposed partial ban for execution-only and non-advised sales appears to have been dropped.
  - Inducements must confer a tangible client benefit, and their cost must be disclosed clearly and separately.
  - Member States may impose national bans.

  — [CMS, 19 Dec 2025](https://cms.law/en/aut/legal-updates/eu-retail-investment-strategy-political-agreement-key-points-and-implications-for-eu-and-non-eu-firms); [KPMG](https://kpmg.com/de/en/insights/corporate-governance-and-compliance/retail-investment-strategy-2026.html)

- **New MiFID II Art. 24c (marketing communications and practices):**
  - Marketing must be identifiable, name the responsible firm, and be balanced.
  - Firms using finfluencers need written agreements defining the scope of the activity, and must keep records of content, channels, dates and third-party identities.
  - A proposed Art. 16(3a) adds governance over marketing.
  - Formal adoption by Parliament is expected in Q4 2026, with application about 30 months after entry into force (around mid-2029).
  - On 24 August 2026 the Commission sent ESMA a call for advice, due 1 October 2027.

  — [Skadden, 7 Oct 2026](https://www.skadden.com/insights/publications/2026/10/social-media-meets-financial-regulation); [Regulation Tomorrow, Aug 2026](https://www.regulationtomorrow.com/2026/08/european-commission-publishes-request-to-esma-for-advice-on-the-retail-investment-strategy/)

- **Procedural timeline:** the Council endorsed the text in June 2026, ECON approved it on 23 June 2026, and the plenary was indicatively scheduled for 11 November 2026. Neither text was binding as of 12 August 2026. Transposition is due 24 months after entry into force, with application at 30 months. — [Licentium, Aug 2026 (secondary)](https://www.licentium.io/post/eu-retail-investment-strategy-the-2026-compromise-on-value-for-money-inducements-advice-marketing-and-priips); [CMS](https://cms.law/en/aut/legal-updates/eu-retail-investment-strategy-political-agreement-key-points-and-implications-for-eu-and-non-eu-firms)
- **Related ban already in force (MiFIR Art. 39a):** inserted by Regulation (EU) 2024/791, it bans payment for order flow. Firms acting for retail clients may not receive third-party payments for forwarding orders to a venue or third party. The Member State opt-out ran to 30 June 2026. This matters if Mercury ever receives rebates from Jupiter, Backed or market makers. — [Regulation (EU) 2024/791](https://eur-lex.europa.eu/eli/reg/2024/791/oj)

### Inferences

- **Under Art. 24(9) as written today,** the referrer is neither the friend nor acting on the friend's behalf. So 25–35% of the friend's fee is a third-party payment connected to the friend's RTO or execution service. The 12-month duration makes it an "ongoing" inducement, which needs an ongoing benefit to the friend under Delegated Directive Art. 11(2)(c). That is hard to show for a pure marketing payment.
- **The UKNF position** is the most explicit regulator text found. Fee-proportional payments are cost-per-sale, so in Poland they are prohibited outright. CySEC's 2024 relay shows the position is being applied cross-border to passported firms.
- **Spain, Portugal, Italy and Poland** reserve individualised, remunerated client acquisition to authorised firms or tied agents. In those countries a user paid per converted friend is likely doing reserved activity unless registered as a tied agent. Tied-agent registration per user is impractical at retail scale because of registration, good-repute and knowledge requirements, exclusivity, and the firm's full liability.
- **EU-licensed brokers' practice** (Trade Republic, Scalable) suggests the most defensible model is a small, fixed, capped, one-off reward that is not linked to the referee's trading, with private sharing only and no public link posting. Even this could be challenged under the UKNF cost-per-action reasoning in Poland.
- **The 0.5% fee has a second exposure.** If the referrer nudges the friend to trade more, a 12-month fee share creates the conflict of interest ESMA flagged (DP para. 80). It also risks fair, clear and not misleading breaches in posts for which Mercury is responsible.
- **The RIS will not legalise revenue share.** It hardens the "tangible client benefit" test, adds Art. 24c written-agreement duties for finfluencers, and lets Member States go further. From about 2029 the bar rises, and national bans are possible earlier.

### Gaps

- I did not retrieve the full text of the CNMV statement of 24 November 2020, CONSOB Communication DIN/2049119/2002, or the CMVM warnings; their content here comes from ESMA's summary.
- I found no AMF doctrine specifically on "parrainage" (refer-a-friend) rewards paid by investment firms to clients. The French Code monétaire et financier provisions on démarchage (Art. L.341-1 et seq.) were not checked on Légifrance.
- I found no BaFin, CSSF or FMA Liechtenstein statement specifically on client refer-a-friend payments.
- The Dutch general inducement ban was not verified in this research and should be checked by counsel.
- The final RIS legal text (article numbering, finfluencer definition, whether payments to finfluencers count as inducements) was not available. The European Parliament plenary vote had not been confirmed as of 21 October 2026.

## Key Question 3: If the tokens were treated as crypto-assets, what do MiCA (Arts. 7, 29, 53, 61, 66, 80), ESMA guidance and national crypto-marketing rules say about referral incentives?

### Takeaway

MiCA has no general MiFID-style inducement ban. It does impose:

- conduct and marketing duties on CASPs (Art. 66);
- marketing-communication rules on issuers and offerors (Arts. 7, 29, 53);
- a routing-inducement ban for order transmission (Art. 80(2));
- strict reverse-solicitation limits for non-EU firms (Art. 61).

ESMA's February 2025 guidelines treat any remunerated third party, influencers and affiliates included, as soliciting on the firm's behalf. A paid referral programme reaching EU residents would therefore defeat a reverse-solicitation defence. Spain's CNMV Circular 1/2022 expressly covers people who promote crypto through referral programmes, and France's 2023 influencer law limits crypto promotion to authorised providers. For xStocks in particular, MiCA is mostly a fallback analysis: the EU classification points to MiFID.

### Cited Findings

**MiCA texts**

- **Art. 66:** CASPs must act honestly, fairly and professionally in clients' best interests. Information, including marketing communications, must be fair, clear and not misleading and identified as marketing, and must not mislead about the advantages of crypto-assets. CASPs must warn of risks and publish their pricing and fee policies. — [MiCA](https://eur-lex.europa.eu/eli/reg/2023/1114/oj)
- **Arts. 7, 29 and 53:** marketing communications by offerors and issuers (other crypto-assets, ARTs and EMTs respectively) must be clearly identifiable, fair, clear and not misleading, and consistent with the white paper. — [MiCA](https://eur-lex.europa.eu/eli/reg/2023/1114/oj)
- **Art. 80(2):** CASPs doing reception and transmission of orders may not receive remuneration, discounts or non-monetary benefits for routing client orders to a particular platform or CASP. ESMA Q&A 2087 (29 January 2024) confirms the ban also applies when executing orders. — [ESMA Interactive Single Rulebook, Art. 80](https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mica/article-80-reception-and-transmission-orders)
- **Transitional period:** under MiCA Art. 143(3), grandfathered CASPs could operate only until 1 July 2026 at the latest. As of October 2026, crypto services in the EU require MiCA authorisation. — [MiCA](https://eur-lex.europa.eu/eli/reg/2023/1114/oj); CySEC's relay of the deadline: [Finance Magnates](https://www.financemagnates.com/forex/cysec-alerts-cifs-to-uknf-restrictions-on-referral-and-affiliate-programmes/)

**ESMA guidance**

- **Reverse solicitation guidelines (ESMA35-1872330276-2030, published 26 February 2025, applicable 60 days later):**
  - Solicitation is read broadly and covers affiliates, influencers and celebrities acting on the firm's behalf, whether by contract or informal arrangement.
  - Any remuneration or benefit, monetary or not, is a strong indication that the third party acts on the firm's behalf.
  - Directing audiences to the firm, providing means of access, and offering promotional deals are further indicators.
  - Disclaimers cannot override the facts.

  — [ESMA Guidelines](https://www.esma.europa.eu/sites/default/files/2025-02/ESMA35-1872330276-2030_Guidelines_on_reverse_solicitation_under_MiCA.pdf); [Maples summary](https://maples.com/regulatory-round-up/esma-reverse-solicitation-guidance-mica)

- **Non-MiCA stablecoins:**
  - On 8 October 2026 ESMA issued an opinion that MiCA-authorised CASPs must stop services in non-MiCA-compliant stablecoins (reportedly affecting USDT and PYUSD). Remaining holdings must be wound down within three months, and buying or promoting those tokens is no longer allowed. — [ESMA press release](https://www.esma.europa.eu/press-news/esma-news/esma-sets-out-supervisory-expectations-services-related-unauthorised); [CryptoTimes, 8 Oct 2026](https://www.cryptotimes.io/2026/10/08/esma-sets-three-month-deadline-for-eu-firms-with-non-mica-tokens/)
  - An earlier ESMA statement of 17 January 2025 set a Q1 2025 compliance deadline. — [ESMA statement](https://www.esma.europa.eu/sites/default/files/2025-01/ESMA75-223375936-6099_Statement_on_stablecoins.pdf)
- **USDC:** became MiCA-compliant on 1 July 2024 via Circle's French e-money institution (EMI) licence from the ACPR. — [Circle press release](https://www.circle.com/pressroom/circle-is-first-global-stablecoin-issuer-to-comply-with-mica-eus-landmark-crypto-law)
- **Unregulated products sold by regulated firms:** the December 2023 DP cites ESMA's 25 May 2023 statement that firms must clearly distinguish unregulated from regulated products on their sites. — [ESMA DP, para. 48 and fn. 30](https://www.esma.europa.eu/sites/default/files/2023-12/ESMA35-43-3682_Discussion_Paper_on_MiFID_II_investor_protection_topics_linked_to_digitalisation.pdf)
- **Market abuse:** finfluencers can breach MiCA market-abuse rules by spreading information they knew, or should have known, was false. — [Skadden, 7 Oct 2026](https://www.skadden.com/insights/publications/2026/10/social-media-meets-financial-regulation)

**National crypto-marketing rules**

- **Spain, CNMV Circular 1/2022 (in force 17 February 2022):**
  - The definition of persons involved in advertising expressly includes individuals perceived as influencers who disseminate content on crypto as an investment "through referral programmes, offers or commissions of any kind".
  - A "mass campaign" means one aimed at more than 100,000 people, and such campaigns face prior notification.
  - Rule 15 warns against calling an incentive a "gift" where it has a tax impact.
  - Crypto-assets that are financial instruments are excluded and fall under CNMV Circular 2/2020 on advertising of investment products.

  — [CNMV Circular 1/2022 (EN)](https://internet.cnmv.es/DocPortal/Legislacion/Circulares/Circular_1_2022_EN.pdf); [BOE-A-2022-666](https://www.boe.es/buscar/doc.php?id=BOE-A-2022-666)

- **France, Loi n° 2023-451 of 9 June 2023:**
  - Influencers may not promote the riskiest financial contracts (the CMF L.533-12-7 products, i.e., leveraged CFDs and forex).
  - They may promote digital-asset services only where the provider is registered or authorised.
  - Permitted promotions must be visibly labelled "publicité" or "collaboration commerciale".
  - The AMF's sanction powers were extended to influencers.

  — [ESMA DP, para. 68](https://www.esma.europa.eu/sites/default/files/2023-12/ESMA35-43-3682_Discussion_Paper_on_MiFID_II_investor_protection_topics_linked_to_digitalisation.pdf); [Revue Banque](https://www.revue-banque.fr/espace-banque-droit/les-aspects-financiers-de-la-loi-du-9-juin-2023-sur-l-influence-commerciale-JH17106179); [TGS Avocats](https://www.tgs-avocats.fr/blog/regulation-contenus-marketing-influence)
  - Sources disagree on the criminal penalties (two years versus higher figures). Check the text on Légifrance. — [TGS Avocats](https://www.tgs-avocats.fr/blog/regulation-contenus-marketing-influence)

- **Italy:** on 12–13 January 2026 CONSOB stressed that EU investment-recommendation and advertising rules fully apply to crypto and "get rich quick" content. It referred back to its own warning of 6 June 2025 (Richiamo di attenzione n. 2/25). — [CONSOB press release, 12 Jan 2026](https://www.consob.it/documents/d/asset-library-1912910/pr_20260112); [Cointelegraph](https://cointelegraph.com/news/italy-consob-esma-crypto-finfluencers-advertising-rules)

### Inferences

- **If Mercury held only a MiCA CASP licence,** a referral programme on crypto swaps would face Art. 66 conduct and marketing duties, Art. 80(2) if Mercury does RTO, and national rules (Spain's Circular 1/2022 expressly reaches referral-programme promoters, plus the French influencer law). There is no general MiCA inducement test. Fee-share referral on crypto-only trades is therefore less constrained under MiCA than under MiFID. It still does not reach xStocks, which remain financial instruments.
- **If Mercury is a non-EU, unlicensed provider,** a paid referral programme whose rewards depend on EU-resident friends' trades is, under ESMA's MiCA guidelines and by analogy under MiFID Art. 42, strong evidence of solicitation. It removes any argument that EU users come on their own initiative.
- **Paying in USDC fits MiCA.** USDC is a MiCA-compliant EMT. Paying in a non-compliant stablecoin would clash with ESMA's 8 October 2026 opinion if Mercury becomes a CASP.

### Gaps

- I did not determine whether Circular 1/2022 was amended or repealed after MiCA became fully applicable on 30 December 2024. Its interaction with MiCA Art. 66 needs checking.
- I did not find a specific ESMA Q&A on crypto referral rewards or "earn by inviting" programmes under MiCA.
- I did not check national MiCA-era rules in Italy, for example AGCOM influencer guidelines, or Germany for crypto referral programmes.
- I found no official referral terms for MiCA-licensed exchanges such as Bybit EU or OKX EU. Affiliate-site claims were unreliable.

## Key Question 4: Consumer protection and promotion rules: unfair commercial practices, incentive and gamification bans, the RIS and the Digital Fairness Act

### Takeaway

No EU-wide rule bans trading incentives for plain securities such as tracker certificates. The product-intervention bans on bonuses and incentives cover CFDs, and the national measures that replaced ESMA's 2018 decision, not tokenised debt securities. Horizontal consumer law still applies:

- the UCPD on hidden advertising and influencer disclosure;
- the UCPD ban on pyramid promotional schemes;
- the UCPD rule on traders falsely posing as consumers.

ESMA has repeatedly flagged gamification and finfluencers as risk drivers. The RIS adds marketing-practice rules from about 2029, and the Digital Fairness Act proposal is still expected in Q4 2026.

### Cited Findings

- **CFD incentive ban:**
  - ESMA's CFD product-intervention decision (Decision (EU) 2018/796, applicable from 1 August 2018) made CFD sales to retail conditional on the provider not giving any payment, monetary benefit or "excluded non-monetary benefit" (anything other than information and research tools) in relation to marketing, distribution or sale. — [Decision (EU) 2018/796](https://eur-lex.europa.eu/eli/dec/2018/796/oj); [FCA summary](https://www.fca.org.uk/news/statements/fca-statement-esma-temporary-product-intervention-retail-cfd-binary-options)
  - ESMA's Q&A confirms that account-opening bonuses and volume-based fee rebates are caught. Lower fees that are not volume-linked and are offered to all retail clients are allowed. — [ESMA Q&A](https://www.esma.europa.eu/publications-data/questions-answers/1982)
- **Cyprus bonus prohibition:** a 2026 compliance vendor summary says CySEC prohibits monetary and non-monetary benefits to retail clients in connection with CFD trading. This is a secondary source. — [Sedric](https://www.sedric.ai/blog/cysec-marketing-compliance-guide-2026)
- **ESMA on gamification:**
  - The December 2023 DP covered gamification, nudging, push notifications and dark patterns. It cited research linking gamified rewards and bonuses to gambling-like behaviour, and said ESMA would develop a position. — [ESMA DP](https://www.esma.europa.eu/sites/default/files/2023-12/ESMA35-43-3682_Discussion_Paper_on_MiFID_II_investor_protection_topics_linked_to_digitalisation.pdf)
  - ESMA's 2025 Annual Report (12 June 2026) cites heightened retail vulnerability from social-media gamification of trading. — [ESMA Annual Report 2025](https://www.esma.europa.eu/sites/default/files/2026-06/ESMA22-50751485-1657_2025_Annual_Report.pdf)
  - ESMA's March 2026 report on the retail investor journey reportedly names gamification, finfluencer marketing and the low explicit costs of neo-brokers as drivers of speculative behaviour. — [ESMA report](https://www.esma.europa.eu/sites/default/files/2026-03/ESMA35-243228190-7410_-_Report_CfE_on_retail_investor_journey.pdf); [CPDS summary (secondary)](https://cpds.academy/blog/esma-retail-investor-journey-report-2026)
- **UCPD (Directive 2005/29/EC):**
  - Art. 7(2) treats failure to identify commercial intent as misleading.
  - Annex I point 11 bans undisclosed paid editorial content, point 14 bans pyramid promotional schemes, and point 22 bans falsely claiming not to act for business purposes or posing as a consumer.
  - Art. 3(9) lets Member States impose stricter rules for financial services.
  - The definition of "trader" includes anyone acting in the name of or on behalf of a trader.

  — [UCPD](https://eur-lex.europa.eu/eli/dir/2005/29/oj)
  - The Commission's 2021 UCPD Guidance covers influencer marketing disclosure. — [Commission Notice 2021/C 526/01](<https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52021XC1229(05)>)
  - ESMA notes that finfluencers already must disclose paid collaborations under UCPD Annex I. — [ESMA DP, fn. 60](https://www.esma.europa.eu/sites/default/files/2023-12/ESMA35-43-3682_Discussion_Paper_on_MiFID_II_investor_protection_topics_linked_to_digitalisation.pdf)

- **Digital Fairness Act:** as of September 2026 the Commission had not tabled the proposal. It is listed for Q4 2026 and targets misleading influencer marketing, dark patterns and addictive design. — [European Parliament Legislative Train](https://www.europarl.europa.eu/legislative-train/theme-protecting-our-democracy-upholding-our-values/file-digital-fairness-act); [Wikipedia (status summary)](https://en.wikipedia.org/wiki/Digital_Fairness_Act)
- **RIS on marketing:** strengthened "fair, clear and not misleading" marketing rules, an explicit focus on finfluencers, and Art. 24c written agreements and records. Application is expected around mid-2029. — [CMS](https://cms.law/en/aut/legal-updates/eu-retail-investment-strategy-political-agreement-key-points-and-implications-for-eu-and-non-eu-firms); [Skadden](https://www.skadden.com/insights/publications/2026/10/social-media-meets-financial-regulation)
- **UK comparison (not EU):** the FCA treats a firm as having caused a promotion when a finfluencer posts its referral link. For cryptoassets, a "restricted mass market investment", the FCA bans incentives to invest. — [Skadden](https://www.skadden.com/insights/publications/2026/10/social-media-meets-financial-regulation)

### Inferences

- **Pyramid rule:** a single-tier referral with no fee to join is unlikely to be a UCPD "pyramid promotional scheme", which requires consideration paid for the chance of compensation from recruiting others. Any multi-tier override, such as rewards on friends-of-friends, or a paid membership tier to unlock referral rates, would sharply raise that risk.
- **Users as traders:** paid users who post links are likely "acting on behalf of" Mercury under the UCPD. Their posts then need clear commercial labelling ("ad", "referral, I earn X%"), and Mercury carries responsibility.
- **CFD-style rules by analogy:** CFD incentive bans do not apply to xStocks directly. Regulators could still lean on them, given ESMA's tokenised-stock warnings. Robinhood's and Gemini's derivative-format stock tokens are closer to the CFD perimeter than xStocks are.
- **Design features:** the 12-month fee share, with monthly USDC drops and a 7-day hold, has features ESMA associates with digital engagement practices: recurring rewards tied to others' trading activity. That is likely to draw supervisory attention even where it is not prohibited.

### Gaps

- I did not verify the numbers and status of national permanent CFD measures (BaFin, AMF, CNMV, CySEC), or whether any extend incentive bans to turbos, certificates or other products.
- ESMA has not issued a final position on digital engagement practices following the 2023 DP. None was found as of October 2026.
- The content of the Digital Fairness Act is unknown until it is tabled.

## Key Question 5: Tax and AML basics for paying referral income in USDC (DAC8, Transfer of Funds Regulation, AMLR)

### Takeaway

Referral rewards are taxable income for EU recipients under national law. Mercury's own reporting duties depend on its status. As a MiCA CASP it would be a reporting crypto-asset service provider (RCASP) under DAC8, applicable from 1 January 2026, and an obliged entity for the Transfer of Funds Regulation (TFR) travel rule and AML purposes. As non-EU, non-custodial software it is probably neither, although counterparties' CASPs will report incoming transfers. USDC is a MiCA-compliant EMT. DAC8's treatment of EMTs and of tokenised securities needs case-by-case confirmation.

### Cited Findings

- **DAC8 (Council Directive (EU) 2023/2226):**
  - Transposition was due by 31 December 2025. It applies from 1 January 2026, with self-certification for new customers from that date and existing customers caught up by 1 January 2027.
  - Reportable retail payment transactions are crypto transfers for goods or services above USD 50,000.

  — [DAC8](https://eur-lex.europa.eu/eli/dir/2023/2226/oj); [Mondaq](https://www.mondaq.com/fin-tech/1466366/dac-8-reporting-for-crypto-assets-a-new-regulatory-framework)
  - Example: Romania transposed DAC8 by GEO 71/2025, with first reports for 2026 due in 2027. — [PwC Romania](https://www.pwc.ro/en/tax-legal/alerts/Reporting-of-Crypto-Asset-Transactions-Transposition-of-DAC-8-GEO-no-71-2025.html)

- **EMTs under DAC8:** Maples says the MiCA-based definition brings EMTs into scope, and that e-money and CBDCs are excluded unless used for payment or investment. Simmons & Simmons says electronic money is excluded. — [Maples](https://maples.com/knowledge/dac8-eu-tax-reporting-framework-for-crypto-asset-income-and-revenue); contradicted in part by [Simmons & Simmons](https://www.simmons-simmons.com/en/publications/clnx74han00zgu6x4twcnwuqg/dac8-adopted)
- **Tax framing of incentives (Spain):** CNMV Circular 1/2022 Rule 15 notes that trading incentives may have tax consequences as remuneration in kind and should not be called "gifts". — [CNMV Circular 1/2022 (EN)](https://internet.cnmv.es/DocPortal/Legislacion/Circulares/Circular_1_2022_EN.pdf)
- **Transfer of Funds Regulation (Regulation (EU) 2023/1113):**
  - Applies from 30 December 2024. CASPs must attach originator and beneficiary information to every crypto transfer.
  - For transfers above €1,000 to or from a self-hosted address, the CASP must verify that the address is owned or controlled by its customer.

  — [TFR](https://eur-lex.europa.eu/eli/reg/2023/1113/oj)

- **AMLR (Regulation (EU) 2024/1624):** applies from 10 July 2027 and lists CASPs as obliged entities. — [AMLR](https://eur-lex.europa.eu/eli/reg/2024/1624/oj)
- **USDC:** MiCA-compliant since 1 July 2024 through Circle's ACPR EMI licence. — [Circle](https://www.circle.com/pressroom/circle-is-first-global-stablecoin-issuer-to-comply-with-mica-eus-landmark-crypto-law)

### Inferences

- **As a CASP,** monthly USDC payouts to users' self-hosted wallets above €1,000 would trigger TFR self-hosted-address verification. Reward payouts and users' crypto transactions would also feed DAC8 reporting, including reward-type transfers, subject to national guidance.
- **As non-custodial non-EU software,** Mercury still needs KYC-grade data on payees to manage sanctions, self-referral and fraud, and to support recipients' tax reporting, because the reward is income to the user. The 7-day hold and clawbacks help against wash and self-referral abuse but do not replace screening.
- **xStocks themselves:** DAC8 might also capture xStocks if they count as "crypto-assets" under the broad MiCA definition used for tax purposes, even though MiCA's regulatory scope excludes them. This is an open point; possible overlap with CRS reporting needs checking.

### Gaps

- I did not verify national income-tax treatment of referral rewards (for example in Germany, France, Spain and Italy) or any withholding or third-party information duties on the payer.
- I did not verify whether VAT applies to referral services supplied by individuals.
- The DAC8 treatment of EMTs and tokenised securities was not confirmed from the directive's annex text.

## Key Question 6: What would it take to run the proposed design lawfully in the EU, and which alternative designs carry lower risk?

### Takeaway

The proposed design pays 25–35% of the friend's fee for 12 months to unlicensed users. On xStocks for EU residents it sits at the high-risk end on every licensing path:

- **Under MiFID:** it is an ongoing third-party inducement that is hard to justify, and in several Member States it is reserved client-acquisition activity.
- **For a non-EU unlicensed provider:** it is solicitation that defeats reverse solicitation.
- **Under a MiCA-only licence:** it does not cure the MiFID issue at all.

Lower-risk options:

- exclude the EU, or EU xStocks trades, from fee-share;
- switch to small fixed, capped, one-off rewards not tied to trading, with private sharing only (the Trade Republic and Scalable model);
- give benefits to the referred client rather than the referrer;
- pay creators fixed fees not tied to conversions, with labelling, pre-approval and written agreements.

### Cited Findings

- **Fee-share in Poland:** fee-proportional (cost-per-sale) and per-client (cost-per-action) referral payments are prohibited inducements. Fixed payments not dependent on clients acquired or their activity are allowed. Individualised acquisition by clients is reserved to the firm or its tied agents. — [UKNF position](https://www.knf.gov.pl/knf/en/komponenty/img/Position%20of%20the%20UKNF%20on%20referral%20programmes%20and%20affiliate%20programmes_84448.pdf)
- **Affiliates elsewhere:** Spain treats affiliate client acquisition by anyone other than authorised firms or tied agents as unacceptable. Portugal requires affiliates to be tied agents or mere advertising channels. Italy sees results-based affiliate pay as exceeding what is allowed. — [ESMA DP paras. 66–70](https://www.esma.europa.eu/sites/default/files/2023-12/ESMA35-43-3682_Discussion_Paper_on_MiFID_II_investor_protection_topics_linked_to_digitalisation.pdf)
- **Ongoing payments:** an ongoing inducement must be justified by an ongoing benefit to the relevant client and disclosed in advance. — [Delegated Directive 2017/593 Art. 11](https://eur-lex.europa.eu/eli/dir_del/2017/593/oj); [MiFID II Art. 24(9)](https://eur-lex.europa.eu/eli/dir/2014/65/oj)
- **Market benchmarks for compliant refer-a-friend:**
  - Trade Republic: €5–200 fixed, after a €300 deposit, capped at 40 referrals or €2,000, no public link distribution, clawback.
  - Scalable: €25/€50, max 10 rewards, minimum trading of €250 and a 6-month retention period.

  — [Trade Republic T&Cs, May 2026](https://assets.traderepublic.com/documents/NL/TERMS_AND_CONDITIONS_REFERRAL_20260511222002.pdf); [Scalable](https://help.scalable.capital/en/referral-programme-81610247/how-and-when-will-i-receive-my-reward-8684f27e)

- **Non-EU firms:** any remuneration to a third party is a strong indication of solicitation on behalf of a third-country firm under MiCA. — [ESMA reverse-solicitation guidelines, Feb 2025](https://www.esma.europa.eu/sites/default/files/2025-02/ESMA35-1872330276-2030_Guidelines_on_reverse_solicitation_under_MiCA.pdf)
- **Benefits to the referred client:** Art. 24(9) excludes payments to the client itself from the third-party inducement rule. — [MiFID II](https://eur-lex.europa.eu/eli/dir/2014/65/oj)
  - For CFDs only, ESMA treats account-opening bonuses and volume-based rebates as banned incentives, while flat fee reductions for all retail clients are allowed. — [ESMA Q&A](https://www.esma.europa.eu/publications-data/questions-answers/1982)
- **Finfluencer duties from about 2029:** written agreements, records, management oversight and identifiable marketing (RIS Art. 24c). Several Member States already require pre-approval and monitoring of affiliate content today, for example CySEC's C217. — [Skadden](https://www.skadden.com/insights/publications/2026/10/social-media-meets-financial-regulation); [LeapRate on C217](https://www.leaprate.com/forex/regulations/cysec-publish-list-outlawed-binary-options-fx-affiliates/)

### Inferences

**What a lawful EU version of the current design would need (counsel to confirm)**

1. **Licensing:** a MiFID authorisation covering at least RTO, likely through an EU subsidiary or an authorised distributor partner, with product governance, an appropriateness test and the KID for xStocks. A MiCA licence alone does not suffice.
2. **Inducement analysis:** a documented Art. 24(9) and Art. 11 assessment showing a tangible, ongoing benefit to the referred client, plus ex-ante disclosure of the amount (25–35% of fee). Realistically, fee-proportional pay fails in Poland outright and is high-risk elsewhere.
3. **Reserved activity:** either register referrers as tied agents, which is not workable for retail users, or limit what referrers do to non-individualised, generic sharing of firm-approved content. Poland treats even sharing within social or messenger groups as individualised, so this may not be achievable there at all.
4. **Marketing controls:** firm-prepared or pre-approved content; mandatory "ad/referral" labelling; no personalised recommendations from referrers (that would be investment advice); monitoring and records. From about 2029, Art. 24c written agreements for anyone acting as a finfluencer.
5. **Country carve-outs** at minimum for Poland, Spain, Portugal and Italy, with France checked for démarchage and influencer-law issues. Plus stricter national inducement regimes, including any new RIS-based bans.

**Lower-risk alternatives, ranked roughly from lowest to higher risk (inference)**

- A. **EU fee-share off.** Geo-fence EU/EEA residents, as referrer or referee, out of the revenue-share programme, or compute fee-share only on non-EU users' trades. This removes the MiFID inducement and reserved-activity issues and avoids creating solicitation evidence. It does not fix any underlying licensing gap for xStocks in the EU.
- B. **Benefit to the new client, not the referrer.** For example, a time-limited fee discount offered to every new user, not volume-tiered. Payments to the client fall outside Art. 24(9). Keep it non-volume-linked to stay away from the CFD-style "trade more" incentive logic, and keep it fair and not misleading.
- C. **Small fixed, capped, one-off referrer reward** (Trade Republic/Scalable pattern): triggered by onboarding or a deposit rather than by the friend's fees or volume. Private sharing only, a public-posting ban with clawback, and caps per referrer. Lower risk than revenue share. Poland still treats per-client payments as inducements, so carve Poland out.
- D. **Creator or affiliate deals on fixed fees** not dependent on conversions, which the UKNF explicitly accepts, with firm-approved content, clear labelling, a written agreement, records and ARPP-certified influencers in France.
- E. **Crypto-only referral fee-share** (for example non-security swaps) under a MiCA CASP licence. MiCA lacks a general inducement test, but Art. 66, Art. 80(2) where relevant, Spain's Circular 1/2022 and France's influencer law apply, and xStocks trades must be excluded from the fee-share base.

Under any variant: keep the programme single-tier with no consideration to join, to stay clear of the UCPD pyramid ban. Also avoid "earn/passive income" framing and anything resembling a gamified recurring reward tied to friends' trading activity.

**USDC payment mechanics:**

- MiCA-compatible, since USDC is an authorised EMT.
- If Mercury becomes a CASP, add TFR self-hosted-wallet checks above €1,000 and DAC8 reporting.
- In all cases, collect recipient data sufficient for sanctions screening and tax information.

### Gaps

- I found no EU regulator text addressing a user-to-user revenue share paid by a non-custodial app (as opposed to a licensed broker).
- I found no enforcement case on refer-a-friend payments by EU investment firms.
- I found no confirmation of how the incumbents (Kraken EU, Bybit EU, Robinhood EU, Gemini EU) treat xStocks or stock-token trades in their referral programmes, for example whether they exclude them from rewards.
- National positions for Germany, France, the Netherlands, Ireland, Luxembourg and Liechtenstein on client refer-a-friend payments were not located and need country-by-country counsel review.
