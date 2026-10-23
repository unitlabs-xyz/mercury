# Fee-share referrals cross the securities line

Mercury cannot lawfully pay ordinary users 25–35% of its fee on their friends' xStocks trades in most of the markets it would target, unless it first holds licences it does not have. Even then, several regulators would block the design or require approval in advance. The reason is the product. xStocks are tracker certificates, which are bearer debt securities issued under an EU-approved prospectus. So nearly every market treats the referral programme as a matter of securities-distribution law. In that law, paying an unregistered person a percentage of the fees on trades they bring in is the classic sign of unlicensed brokerage or client solicitation.

In the EU, a 12-month share of the friend's fee is an ongoing third-party payment, which MiFID II treats as an "inducement" and allows only in narrow cases that are hard to meet here. Poland's regulator names fee-proportional referral pay as prohibited outright. Spain, Portugal and Italy reserve paid client acquisition to licensed firms and their registered agents. Outside the EU, the answers range from "licensed firm with regulator pre-approval" (Dubai's crypto regulator, VARA, uses Mercury's exact design as a worked example), through "registered agents only" (Brazil, Argentina, Singapore, Hong Kong, South Africa), to "banned" (Turkey, for crypto platforms).

Industry practice draws the same line. Crypto exchanges routinely pay users 20–30% of fees on crypto trades. None of the exchanges or tokenized-stock venues reviewed pays that on stock-token trades. Kraken, which agreed to buy the issuer of xStocks, excludes equities from its own referral revenue share, and every securities broker reviewed pays referrers a flat, capped bonus. No regulator has yet sanctioned a user-referral fee share specifically, so the risk is inferred from neighbouring rules. Still, enforcement keeps hitting the three things Mercury's design combines: unlicensed paid promoters, high-risk products, and firms held responsible for their affiliates. The programme also creates evidence that Mercury is actively soliciting users in each country, which weakens its main defences for the xStocks business itself.

Mercury should run two tracks instead:

- **For ordinary users:** a flat, capped, geo-fenced reward, or a fee discount for the friend.
- **For partners:** revenue share only for vetted partners under contract, only where counsel confirms it is allowed, and ideally through a licensed distributor.

## Securities law, not crypto law, governs xStocks referrals almost everywhere

The starting point is what Mercury sells. Backed Assets (JE) Limited issues each xStock as a **bearer debt instrument classified as a tracker certificate**. It carries no shareholder voting rights and is described as a structured financial instrument rather than ownership of the underlying share ([xStocks Product Legal Overview](https://docs.xstocks.fi/docs/product-legal-overview)). The EEA offer runs on a base prospectus that Liechtenstein's FMA approved on **8 May 2024** and has since supplemented, most recently on 4 August 2026 ([FMA certificate via MFSA](https://www.mfsa.mt/wp-content/uploads/2024/07/Backed-Assets-JE-Limited-Cetificate-of-Approval-of-a-Base-Prospectus-dated-08-May-2024.pdf); [MFSA, Aug 2026 supplement](https://www.mfsa.mt/wp-content/uploads/2026/08/Backed-Assets-JE-Limited-Certificate-of-Approval-of-a-Supplement-dated-04-August-2026.pdf)).

That settles the EU classification:

- An approved prospectus presupposes a MiFID II "transferable security".
- MiCA Art. 2(4)(a) excludes crypto-assets that qualify as financial instruments.
- So **a MiCA crypto licence (CASP) does not cover xStocks** ([MiFID II](https://eur-lex.europa.eu/eli/dir/2014/65/oj); [MiCA](https://eur-lex.europa.eu/eli/reg/2023/1114/oj)).

Backed itself says its passport lets _licensed_ third-party distributors offer xStocks to retail clients, and that distributors are responsible for complying with local rules ([xStocks](https://docs.xstocks.fi/docs/product-legal-overview)). The incumbents act on that reading. Every major platform offering stock tokens to EU retail does so through a MiFID investment firm:

- **Kraken** uses its CySEC-authorised Payward Europe entity, which launched xStocks alongside US equities for EEA customers on 18 August 2026 ([Kraken](https://www.kraken.com/learn/how-kraken-is-regulated); [Finance Magnates](https://www.financemagnates.com/forex/kraken-lets-european-users-hold-us-equities-and-xstocks-together/)).
- **Robinhood** uses an entity supervised by the Bank of Lithuania ([Robinhood EU KID](https://cdn.robinhood.com/assets/robinhood/legal/stock_tokens_kid_eu.pdf)).
- **Gemini** uses its Malta MiFID licence ([Yahoo Finance](https://finance.yahoo.com/news/gemini-rolls-tokenized-stocks-eu-215626728.html)).

Outside the EU the answer is the same:

- **Hong Kong:** the SFC calls tokenised securities "fundamentally traditional securities with a tokenisation wrapper" and applies the prospectus and offers-of-investments regimes to offers to the public ([SFC circular 23EC52](https://apps.sfc.hk/edistributionWeb/api/circular/list-content?refNo=23EC52&lang=EN)).
- **Singapore:** MAS's November 2025 tokenisation guide classifies tokens by economic substance and applies the same prospectus regime to tokenised securities ([Baker McKenzie](https://www.bakermckenzie.com/en/insight/publications/alerts/2025/11/singapore-mas-publishes-guide-on-tokenisation)).
- **Brazil:** the CVM treats a token that "digitally represents" a security as a security ([Mattos Filho on Parecer 40](https://www.mattosfilho.com.br/unico/cvm-parecer-criptoativos/)).
- **Nigeria:** the Investments and Securities Act 2025 classifies digital assets as securities ([Gazette NGR](https://gazettengr.com/isa-2025-bans-unregistered-digital-asset-exchanges-online-forex-platforms-sec/)).
- **Mexico:** tokens that meet the definition of a security fall under the existing securities regime ([CryptoSlate](https://cryptoslate.com/crypto-laws/mexico-securities-market-law-tokenized-securities-treatment/)).

So the rules that decide Mercury's referral question are the ones about **who may be paid to bring investors to a securities business**: broker, agent and introducer rules. The newer crypto regimes matter mainly by analogy, or for the USDC payout.

Mercury's best counter-argument is that it is software, not a broker: users sign every transaction from their own wallets. One Swiss law firm argues a passive non-custodial front-end is not "reception and transmission of orders" (RTO), the MiFID service of passing client orders to someone else to execute. The same analysis warns that "active" front-ends which build transactions for users may need authorisation. No ESMA or national regulator has ruled on the point ([Lexr](https://www.lexr.com/en-ch/blog/defi-frontend-regulation/)). Mercury's facts lean toward the regulated end: a 0.5% fee on every trade, an app that builds and routes Jupiter swaps, and a branded retail product. That question comes before the referral question, and the referral programme affects how it gets answered.

**A paid referral programme is evidence that Mercury solicits users in their own countries.**

- **EU:** ESMA's February 2025 reverse-solicitation guidelines say any remuneration to a third party is a strong indication that it acts on the firm's behalf, and that disclaimers cannot override the facts ([ESMA guidelines](https://www.esma.europa.eu/sites/default/files/2025-02/ESMA35-1872330276-2030_Guidelines_on_reverse_solicitation_under_MiCA.pdf)). "Reverse solicitation" is the exemption for clients who approach a foreign firm on their own initiative.
- **Brazil:** for internet offers, the CVM asks whether effective measures stop Brazilian public access ([Mattos Filho](https://www.mattosfilho.com.br/unico/cvm-parecer-criptoativos/)).
- **UAE:** VARA's test for "targeting the UAE" counts UAE influencers, community channels and whether geoblocking is used ([VARA Marketing Guidance](https://rulebooks.vara.ae/sites/default/files/en_net_file_store/VARA_EN_388_VER1.pdf)).

Paying Brazilians to recruit Brazilians, or Emiratis to recruit Emiratis, builds the record a regulator would use to find that Mercury targets that market. The fee share does not just carry its own risk. It raises the risk of the core xStocks business everywhere it pays out.

## The EU treats a 12-month fee share as an inducement and reserved activity

If Mercury, or an EU partner distributing xStocks for it, is a MiFID firm, the core rule is **MiFID II Art. 24(9)**. A firm fails its duty to act in the client's best interest if it pays or receives any fee "in connection with" a service to a client, to or from anyone other than the client or a person acting for the client. The only exception is a payment designed to enhance the quality of the service, disclosed before the service is provided ([MiFID II](https://eur-lex.europa.eu/eli/dir/2014/65/oj)). Delegated Directive 2017/593 Art. 11(2) makes the test concrete: the payment must fund an additional or higher-level service to the relevant client, and an **ongoing** payment needs an **ongoing benefit to that client** ([Delegated Directive 2017/593](https://eur-lex.europa.eu/eli/dir_del/2017/593/oj)).

The referrer is neither the friend nor acting for the friend. So 25–35% of the friend's fee, paid for 12 months, is an ongoing third-party payment tied to the friend's trades. It would have to deliver a continuing benefit to the friend, and a marketing reward to someone else cannot plausibly do that.

**Poland's regulator, the UKNF, gives the most explicit answer.** Its position on referral and affiliate programmes says:

- Fee-proportional payments ("cost-per-sale" tied to the spread, commission or transaction value) are prohibited inducements.
- So are per-client payments ("cost-per-action", per registration, contract or deposit).
- A one-off or fixed monthly fee for posting material is allowed only if it does not depend on how many clients sign up or how much they trade.
- A paid referring client is doing active direct marketing on the firm's behalf, which Polish law reserves to the firm or its registered tied agents.
- Sharing a code within a social-network or messenger group does not count as addressing an unspecified audience.

([UKNF position](https://www.knf.gov.pl/knf/en/komponenty/img/Position%20of%20the%20UKNF%20on%20referral%20programmes%20and%20affiliate%20programmes_84448.pdf))

On **12 November 2024 CySEC told Cyprus investment firms to comply** with the UKNF position. That shows the rule reaching firms that operate in Poland on an EU passport from elsewhere ([Finance Magnates](https://www.financemagnates.com/forex/cysec-alerts-cifs-to-uknf-restrictions-on-referral-and-affiliate-programmes/)).

Other Member States reach similar results through rules reserving client acquisition to licensed firms. ESMA's 2023 discussion paper catalogues them ([ESMA DP](https://www.esma.europa.eu/sites/default/files/2023-12/ESMA35-43-3682_Discussion_Paper_on_MiFID_II_investor_protection_topics_linked_to_digitalisation.pdf)):

- **Spain:** only investment firms or tied agents may recruit clients. The CNMV called affiliate client-acquisition programmes "unacceptable" in 2020.
- **Portugal:** an affiliate must be a tied agent or merely a channel for the firm's labelled adverts.
- **Italy:** pay based on results, such as transactions closed, signals that an introducer has exceeded what is allowed.

The tied-agent route that would legalise individual referrers does not work for retail users. Each tied agent must be publicly registered, of good repute and knowledgeable, must act for only one firm, and the firm carries full responsibility for them ([MiFID II](https://eur-lex.europa.eu/eli/dir/2014/65/oj)).

Germany and France leave narrow exemptions:

- **Germany:** a "Tippgeber" who only names a provider, without working on the investor's decision to buy, is not doing licensed brokerage ([IHK Merkblatt](https://www.ihk.de/blueprint/servlet/resource/blob/1478582/76c84c3893fb0d44f97c6530b918b47e/merkblatt-erlaubnis-u-registrierungspflicht-fuer-finanzanlagen-data.pdf)). BaFin's August 2026 guidance for influencers requires them to disclose any payment for promotion and treats personalised recommendations as licensable advice ([Regulation Tomorrow](https://www.regulationtomorrow.com/2026/08/bafin-published-five-points-to-note-for-influencers/)).
- **France:** a business introducer stays unregulated only if they do pure introduction, without advice or canvassing ([AFG guide](https://www.afg.asso.fr/app/uploads/2015/06/2015_06_Guide_Professionnel_clarification_statut_intermediaire-1.pdf)).

A revenue share that pays more the more the friend trades is hard to fit inside either exemption.

Brokers' own terms show how they read these rules. **Interactive Brokers' member-to-member referral excludes residents of Spain, Portugal and Poland**, three of the four Member States ESMA lists as reserving paid acquisition. It also bars referrers from helping set up the friend's account or acting as the friend's point of contact ([IBKR UK referral](https://www.interactivebrokers.co.uk/en/index.php?f=48074)). eToro's European refer-a-friend country list leaves out Poland and Portugal ([eToro RAF T&Cs, Sept 2026](https://www.etoro.com/wp-content/uploads/2026/09/RAF-Program-TCs-September-2026.pdf)).

EU-licensed brokers that do run referrals keep them small and detached from trading:

- **Trade Republic** pays a fixed €5–200 after a €300 deposit, caps each referrer at 40 referrals or €2,000, and bans posting links publicly (YouTube, WhatsApp groups, forums), with clawback if discovered ([Trade Republic NL T&Cs, May 2026](https://assets.traderepublic.com/documents/NL/TERMS_AND_CONDITIONS_REFERRAL_20260511222002.pdf)).
- **Scalable Capital** pays €25–50, up to 10 rewards, after the friend trades €250 and stays six months ([Scalable](https://help.scalable.capital/en/referral-programme-81610247/how-and-when-will-i-receive-my-reward-8684f27e)).

The rules are tightening. The **Retail Investment Strategy** (RIS), the EU's package of retail-investor reforms, was politically agreed on 18 December 2025 ([Council](https://www.consilium.europa.eu/en/press/press-releases/2025/12/18/retail-investment-strategy-council-and-parliament-agree-on-package-to-empower-consumers-while-boosting-markets/)):

- It keeps inducements but requires a tangible client benefit and separate disclosure of their cost, and lets Member States ban them nationally ([CMS](https://cms.law/en/aut/legal-updates/eu-retail-investment-strategy-political-agreement-key-points-and-implications-for-eu-and-non-eu-firms)).
- A new MiFID II Art. 24c requires written agreements with finfluencers, plus records of their content, channels and identities.
- Formal adoption is expected in Q4 2026, with application around mid-2029 ([Skadden, Oct 2026](https://www.skadden.com/insights/publications/2026/10/social-media-meets-financial-regulation)).

Some of this is already in force:

- **ESMA's January 2026 finfluencer factsheet** makes creators responsible for their content and says "not financial advice" disclaimers do not neutralise their obligations ([ESMA factsheet](https://www.esma.europa.eu/sites/default/files/2026-01/Finfluencers_factsheet_EN.pdf)).
- **EU consumer law (the UCPD)** treats anyone acting on behalf of a trader as a trader. Paid referrers' posts therefore need commercial labelling, and the UCPD bans pyramid promotional schemes outright, which matters if the programme ever adds friends-of-friends tiers ([UCPD](https://eur-lex.europa.eu/eli/dir/2005/29/oj)).
- **MiFIR Art. 39a** now bans payment for order flow, which matters if Mercury ever accepts routing rebates ([Regulation (EU) 2024/791](https://eur-lex.europa.eu/eli/reg/2024/791/oj)).

Two fallback readings do not rescue the design. **If xStocks were treated as crypto**, MiCA has no general inducement test, but:

- CASPs still owe conduct and marketing duties under Art. 66.
- Art. 80(2) bans payments for routing client orders ([MiCA](https://eur-lex.europa.eu/eli/reg/2023/1114/oj); [ESMA Art. 80](https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mica/article-80-reception-and-transmission-orders)).
- Spain's Circular 1/2022 explicitly reaches people who promote crypto "through referral programmes, offers or commissions of any kind" ([CNMV Circular 1/2022](https://internet.cnmv.es/DocPortal/Legislacion/Circulares/Circular_1_2022_EN.pdf)).

**If Mercury stays an unlicensed non-EU provider**, the fee share is exactly the remunerated third-party activity that ESMA says defeats reverse solicitation.

The USDC payout itself is the least of the problems. USDC is a MiCA-compliant e-money token ([Circle](https://www.circle.com/pressroom/circle-is-first-global-stablecoin-issuer-to-comply-with-mica-eus-landmark-crypto-law)). If Mercury became a CASP, though, payouts over €1,000 to self-hosted wallets would trigger the Transfer of Funds Regulation's ownership check ([TFR](https://eur-lex.europa.eu/eli/reg/2023/1113/oj)), and the EU's crypto tax-reporting directive, DAC8, has applied since 1 January 2026 ([DAC8](https://eur-lex.europa.eu/eli/dir/2023/2226/oj)).

## Outside the EU, answers run from pre-approval to outright ban

No market reviewed clearly lets an offshore, unlicensed platform pay unlicensed retail users an ongoing share of trading fees for bringing in investors in tokenized US equities. The table gives the comparison. The risk column is a judgement drawn from the sources cited in this section, not a regulator's rating.

| Market               | How tokenized US stocks are treated                                                 | Fee share to unlicensed referrers                                                             | Risk for Mercury                |
| -------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------- |
| EU/EEA               | MiFID transferable securities; outside MiCA                                         | Third-party inducement; prohibited in Poland; reserved activity in Spain, Portugal, Italy     | High                            |
| Brazil               | Security if it digitally represents one (CVM Parecer 40)                            | Effectively barred: client prospecting reserved to registered _assessores_ (Res. CVM 178)     | High                            |
| Argentina            | Only via the CNV tokenization regime and registered PSAVs (virtual-asset providers) | Registered agents only (AP regime; RG 1048 on client referral)                                | Medium-high                     |
| Mexico               | Existing securities law; public offer needs RNV registration and CNBV authorisation | Not verified; a mass campaign strengthens a public-offer finding                              | Medium-high                     |
| Singapore            | Capital markets product (MAS guide, Nov 2025)                                       | Only introducers appointed by a licensed firm; referral incentives banned for crypto services | High                            |
| Hong Kong            | "Traditional securities with a tokenisation wrapper"                                | Commission-based introducing likely needs a Type 1 dealing licence (secondary source)         | High                            |
| India                | Grey area (LRS remittance channel, VDA tax regime)                                  | SEBI-regulated firms barred from money or referral ties with unregistered promoters           | High                            |
| Turkey               | Capital Markets Law 6362                                                            | Banned for crypto platforms (benefits to those who bring in customers)                        | High                            |
| Philippines, Vietnam | Local licence required; unlicensed platforms blocked or slated to become illegal    | Moot until licensed                                                                           | High                            |
| UAE                  | Securities (SCA, DFSA, FSRA); VARA for virtual assets                               | Licensed firm only, with regulator approval of the programme                                  | Medium if licensed; high if not |
| Saudi Arabia         | No framework; crypto dealing declared unlicensed                                    | Not available                                                                                 | High                            |
| Nigeria              | Digital assets are securities (ISA 2025)                                            | Not available without SEC registration                                                        | High                            |
| South Africa         | Crypto is a financial product under FAIS                                            | Commission-style lead arrangements treated as intermediary services                           | Medium-high                     |

### Latin America

**Brazil is the clearest no.** Resolution CVM 178, in force since 1 June 2023:

- defines _prospecção e captação de clientes_ (prospecting and capturing clients) as activity of the _assessor de investimento_;
- requires assessores to be registered, credentialed and acting as agent of an authorised intermediary;
- requires the assessor firm's responsible director to prevent unregistered persons from doing that work.

([CVM Res. 178](https://conteudo.cvm.gov.br/export/sites/cvm/legislacao/resolucoes/anexos/100/resol178.pdf))

The CVM enforces this. In the Nova Futura matter it treated as irregular an unregistered person who invited people to open accounts through a link tagged with their ID. It has fined defendants R$35.4m in a 2024 case that combined fraud, irregular assessor activity and an unregistered offer ([OKAI](https://okai.com.br/noticia/2024-09-10/cvm-multa-em-mais-de-r-35-4-milhoes-acusados-por-operacao-fraudulenta-atuacao-irregular-de-assessores-de-investimento-e-oferta-publica-sem-registro)). It also issued stop orders against Binance and Bybit for offering derivatives to Brazilians without authorisation ([The Block](https://www.theblock.co/linked/70481/brazil-binance-derivatives-regulators); [InfoMoney](https://www.infomoney.com.br/mercados/cvm-ordena-suspensao-de-servicos-da-exchange-cripto-bybit-no-brasil/)).

The payout leg has its own problem. Under the central bank's new virtual-asset rules, transfers to and from self-custody wallets fall within the FX market. From **30 October 2026**, authorised institutions may not deal with Brazilian counterparties that are neither authorised nor applying for authorisation, with some exceptions ([Mattos Filho](https://www.mattosfilho.com.br/unico/normas-regulamentacao-ativos-virtuais/)).

**Argentina** sends client capture through CNV-registered _agentes productores_ ([CNV RG 709](https://www.consejosalta.org.ar/wp-content/uploads/CNV-709-1.pdf)). It has regulated client referral and third-party advertising under RG 1048 ([RankiaPro](https://rankiapro.com/latam/insights/comision-nacional-de-valores-de-argentina-reglamenta-referenciamiento-de-clientes-a-activos-virtuales/)), and allows tokenized securities to trade only through CNV-registered virtual-asset providers inside a CNV regime ([CriptoNoticias](https://criptonoticias.com/regulacion/exchanges-argentina-podran-ofrecer-acciones-tokenizadas)).

**Mexico** requires CNBV authorisation for any public offer of unregistered securities ([CryptoSlate](https://cryptoslate.com/crypto-laws/mexico-securities-market-law-tokenized-securities-treatment/)). A paid campaign aimed at Mexican residents is the kind of fact that turns a passive listing into a public offer.

**Chile's** fintech law brings order routing and investment advice under CMF registration ([Carey](https://www.carey.cl/api/archivo/nueva-ley-fintech-marco-regulatorio-open-banking-y-entrada-en-vigencia?lang=es)). **Colombia** was not covered by the research.

### Asia and Turkey

**Singapore** has the most pointed crypto rule. MAS guideline PS-G03, effective 19 June 2025, says crypto (DPT) service providers should not offer any incentive "to any person (e.g., existing customers or celebrities) to promote and/or refer" their services to retail customers. Illustration 4 treats a reward for a successful referral as a banned referral incentive ([MAS PS-G03](https://www.mas.gov.sg/-/media/mas-media-library/regulation/guidelines/pso/ps-g03-guidelines-on-consumer-protection-measures-by-digital-payment-token-service-providers/guidelines-on-provision-of-consumer-protection-safeguards-by-digital-payment-token-service-providers.pdf)).

xStocks are most likely capital markets products rather than crypto tokens, so the ban probably does not apply directly. It still shows exactly how MAS views referral rewards on speculative retail products. On the securities side, the licensing exemption for introducers covers only introducers appointed by a licensed firm, who give no advice and disclose their pay ([MAS Notice FAA-N02](https://www.mas.gov.sg/regulation/notices/notice-faa-n02)).

**Hong Kong:**

- Law-firm commentary says introducing clients to a securities dealer for commission is dealing in securities and needs a Type 1 licence. This rests on a secondary source the research could not open in full ([Charltons](https://www.charltonslaw.com/?p=331)).
- The 2023 JPEX case shows that promoters themselves face criminal exposure: police arrested influencers who had promoted an unlicensed crypto platform ([Decrypt](https://decrypt.co/197573/hong-kong-influencer-arrested-over-jpex-exchange-promotion)).

**India** bars SEBI-regulated firms from "association" with unregistered advisers or anyone making unapproved return claims, defined to include "transaction involving money or money's worth" and "referral of a client" ([MetaLegal](https://www.metalegal.in/post/sebi-strengthens-regulations-for-persons-associated-with-the-securities-market)). India's Financial Intelligence Unit has fined Binance about US$2.25m and has sought to block unregistered offshore platforms ([Gulf News](https://gulfnews.com/amp/business/markets/india-financial-watchdog-imposes-225-million-penalty-on-crypto-exchange-binance-1.1718881007051); [The Block](https://www.theblock.co/post/269551/indias-financial-intelligence-unit-issues-compliance-notices-to-offshore-crypto-exchanges-including-binance-kraken)).

**Turkey's** Capital Markets Board banned crypto-platform campaigns that "provide a benefit to the customer or those who bring in customers through customer acquisition" in September 2024 ([Mondaq](https://www.mondaq.com/turkey/fin-tech/1531394/bulletin-on-the-decision-of-the-capital-markets-board-regarding-crypto-asset-service-providers)).

**The Philippines and Vietnam** are closed to unlicensed offshore platforms. In August 2025 the Philippine SEC asked for ten exchanges to be blocked, Kraken and Bybit among them ([BitPinas](https://bitpinas.com/regulation/sec-flags-10/)), and Vietnam's pilot licenses only local, VND-denominated exchanges ([LuatVietnam](https://english.luatvietnam.vn/legal-updates/resolution-on-piloting-the-crypto-trading-market-in-vietnam-for-five-years-892-103974-article.html)).

### Middle East and Africa

**The UAE is the only market reviewed whose regulator describes Mercury's design almost word for word.** VARA's 2024 marketing guidance includes a case study of a referral programme where "the referrer gets a fixed percentage of trading fees generated by users that sign up using their referral code". It concludes the programme "would need to be approved by VARA as part of its licensing application" ([VARA Marketing Guidance, p.49](https://rulebooks.vara.ae/sites/default/files/en_net_file_store/VARA_EN_388_VER1.pdf)). The design is therefore not illegal in itself. It is something a licensed firm does with the regulator's sign-off.

Because xStocks are securities, the competent UAE regulator is more likely the SCA onshore, or the DFSA or FSRA in the financial free zones, than VARA. Each of Mercury's promoting users would face their own layers:

- SCA Resolution 10/RM of 2025 requires anyone giving financial promotions on regulated products through social media to hold an SCA licence ([Hadef & Partners](https://hadefpartners.com/news-insights/insights/regulating-influence-the-uae-s-new-compliance-regime-for-finfluencers/)).
- The Media Council's Advertiser Permit has been mandatory for online promotion since early 2026 ([Gulf News](https://gulfnews.com/uae/new-uae-law-advertiser-permit-now-mandatory-for-influencers-and-creators-for-social-media-1.500427938)).

A 2025 federal decree-law reportedly brings anyone who "facilitates" a licensed financial activity, DeFi included, into the licensing perimeter. Its transition period ran to September 2026 (secondary reporting, [Cointelegraph](https://cointelegraph.com/news/uae-new-financial-law-defi-regulatory-scope)). **Saudi Arabia** has no licensed route, and a CMA-chaired committee has stated that no one is licensed to deal in virtual currencies ([CMA](https://cma.gov.sa/en/MediaCenter/PR/Pages/DC1.aspx)).

**Nigeria's** SEC ordered capital-market operators in 2021 to stop brokering foreign securities through partner apps, naming Bamboo, Chaka, Risevest and Trove ([TechCabal](https://techcabal.com/2021/04/09/sec-online-trading-platforms/)). Its 2025 Act makes running an unregistered digital-asset exchange an offence ([Gazette NGR](https://gazettengr.com/isa-2025-bans-unregistered-digital-asset-exchanges-online-forex-platforms-sec/)).

**South Africa** declared crypto assets a financial product under its FAIS advisory and intermediary law in 2022. Anyone providing intermediary services as a regular part of their business must be an authorised provider or an appointed representative ([Cliffe Dekker Hofmeyr](https://www.cliffedekkerhofmeyr.com/en/news/publications/2022/Practice/Finance/finance-and-banking-alert-20-october-2022-fsca-declares-crypto-assets-as-a-financial-product-.html)). A High Court decision reportedly characterised commission-style lead arrangements as intermediary services; the research saw only article previews of that analysis ([Moonstone](https://www.moonstone.co.za/tag/referralarrangements/)).

One theme runs through these markets: **the risk lands on Mercury's users as well as on Mercury.** UAE referrers need personal licences and permits, Hong Kong influencers were arrested, and Brazilian unregistered "assessores" were sanctioned. A programme that tells ordinary users to post their links invites them into that exposure. That is a consumer-protection problem and a reputational one, on top of the regulatory one.

## Exchanges share fees on crypto trades, never on stock tokens

On rate and duration alone, Mercury's plan is ordinary for a crypto exchange:

- **Bybit** pays referrers 20%, rising to 25–30%, of the referee's net trading fee for 365 days. It caps each referrer at $5,000 a quarter, holds rewards for a 3-day risk review, and runs region-specific programmes outside "Bybit Global" ([Bybit Referral FAQ, Oct 2026](https://www.bybit.com/en/help-center/article/Bybit-Referral-Program-General-FAQ)).
- **OKX** defaults affiliates to 30%. It pays nothing to unverified affiliates and excludes traders in "non-commissionable countries" ([OKX rules, Sept 2026](https://www.okx.com/help/okx-affiliate-program-rules)).
- **Coinbase** pays approved affiliates 50% for three months, and says terms "may differ" for EU activities subject to MiFID ([Coinbase Affiliates](https://www.coinbase.com/affiliates)).
- **Binance and KuCoin** pay vetted affiliates up to 50% and over 60% respectively ([Binance](https://www.binance.com/fr/learn/affiliate-evaluation); [KuCoin](https://www.kucoin.com/announcement/id-kucoin-affiliate-program-2025-latest-guide-earn-up-to-60-commissions-higher-rewards-faster-upgrades-lower-thresholds)).

That is the strongest case for Mercury's design: a 25–35% share for 12 months is the market standard in crypto.

The precedent stops at the product boundary. **Kraken's referral revenue share explicitly excludes "equities"**, and its affiliate programme lists Spot, Margin, Futures, Prop and DEX as commissionable, not xStocks ([Kraken Referral Programs](https://www.kraken.com/legal/referrals); [Kraken Affiliate](https://www.kraken.com/affiliate)). That matters because **Kraken agreed in December 2025 to acquire Backed**, the company behind xStocks ([Business Wire](https://www.businesswire.com/news/home/20251202666578/en/Kraken-to-Acquire-Backed-Accelerating-xStocks-Expansion-and-Unlocking-Global-Demand-for-Tokenized-Equities)). The owner of Mercury's supplier keeps stock tokens out of its own fee-share engine. It ran an xStocks futures competition only for "Rest of World", excluding the EU/EEA, US, UK, Canada and Australia ([Kraken competition T&Cs](https://support.kraken.com/articles/xstocks-futures-trading-competition-terms-conditions)). Its retail Kraken Pro referral pays a **flat $20, capped at $200** ([Kraken Pro referrals](https://support.kraken.com/articles/kraken-pro-app-referrals)).

Bybit's referral terms name "Direct Stocks" but not xStocks ([Bybit](https://www.bybit.com/en/help-center/article/Bybit-Referral-Program-General-FAQ)). Kraken charges no trading fee on xStocks bought with USDG ([Kraken xStocks FAQ](https://support.kraken.com/articles/xstocks-faq)), so there is often no fee to share at all.

Where tokenized-stock venues promote, they use flat or in-kind rewards with long holding periods:

- Robinhood EU's stock-token giveaways require holding the tokens **180 days** ([Robinhood EU giveaway terms](https://cdn.robinhood.com/assets/robinhood/legal/public_company_stock_token_giveaway_terms_eu.pdf)).
- Bybit gave new users NVIDIA tokenized equity in April 2026 ([PR Newswire](https://tools.prnewswire.com/en-us/live/20823/release/20260401EN24715)).
- Gemini's EU sign-up offer is €15 in BTC, not tied to its stock tokens ([Gemini](https://www.gemini.com/start)).

The only fee-sharing mechanism in the xStocks ecosystem is **Jupiter's integrator fee**. Apps charge 50–255 basis points on swaps and Jupiter keeps 20%, though Jupiter's docs conflict on the details ([Jupiter fees](https://developers.jup.ag/docs/swap/fees)). That is a business-to-business arrangement with an identifiable app, closer to an introducing-broker deal than to paying anonymous retail users.

Securities brokers go further and pay individuals only flat amounts:

- **eToro** pays $50–250 depending on the referrer's own balance, caps rewards at 10–50, and locks withdrawals for 90 days ([eToro RAF T&Cs](https://www.etoro.com/wp-content/uploads/2026/09/RAF-Program-TCs-September-2026.pdf)).
- **IBKR** pays $200 for a friend who deposits $10,000 and keeps it there for a year ([IBKR](https://www.interactivebrokers.co.uk/en/index.php?f=48074)).
- **Robinhood's** free-share programme is the strongest public growth datapoint: organic and referral channels together drove **more than 80% of new funded accounts** in 2020 and Q1 2021, though the S-1 does not separate the two ([Robinhood S-1](https://www.sec.gov/Archives/edgar/data/1783879/000162828021013318/robinhoods-1.htm)).

The reason brokers keep individual referrals flat is a rule found almost everywhere. In the US reference case, transaction-based compensation is the hallmark of broker activity. FINRA Rule 2040 bars member firms from paying unregistered persons whose receipt of the money would require registration, with a narrow exception for foreign finders who only make the initial referral ([FINRA 2040](https://www.finra.org/rules-guidance/rulebooks/finra-rules/2040); [WSGR](https://www.wsgr.com/en/insights/no-commission-without-permission-sec-reinforces-focus-on-sales-activities-and-transaction-based-compensation-as-hallmarks-of-broker-dealer-status-in-recent-settlements.html)). Tying the reward to the friend's later trading is precisely what turns a customer into an unlicensed intermediary.

### Enforcement hits paid promoters and the firms behind them

No regulator was found to have ruled on a self-custodial app paying users a share of fees on tokenized-stock trades. What enforcement shows instead is a consistent target:

- **UK:** the FCA banned "refer a friend" bonuses for crypto promotions from 8 October 2023 ([FCA](https://www.fca.org.uk/news/press-releases/fca-introduces-tough-new-rules-marketing-cryptoassets)), and said holding periods do not cure a banned incentive ([FCA multi-firm review](https://www.fca.org.uk/publications/multi-firm-reviews/financial-promotions-high-risk-investments/printable/print)). Seven influencers were sentenced at Southwark Crown Court on 20 February 2026 for promoting an unauthorised trading scheme, and FCA actions against finfluencers reportedly rose 174% in 2025 ([fintech.global](https://fintech.global/2026/02/23/fca-cracks-down-on-unauthorised-social-media-ads/)).
- **Australia:** the Federal Court found that the "ASX Wolf" finfluencer ran an unlicensed financial services business ([Baker McKenzie](https://insightplus.bakermckenzie.com/bm/financial-institutions_1/australia-federal-court-finds-finfluencer-to-have-carried-on-financial-service-business-without-afsl)).
- **Cyprus:** CySEC fined BDSwiss €100,000 for letting associated offshore companies use the Cyprus firm's status to win clients ([investment-international](https://investment-international.com/News/cyprus-regulator-imposes-100000-fine-on-bdswiss-holding/)).

The pattern is an **unauthorised promoter, paid to push a high-risk product, with the firm held responsible for that promoter**. An uncapped fee share paid to a referrer with a large audience hits all three. A friend inviting a friend is lower risk in practice, but none of the rules (MAS, FCA, VARA) exempts small-scale referrals.

Measured against industry guardrails, Mercury's plan already has two: a short hold and clawbacks for quick round trips. It lacks the rest:

- KYC on the referrer before any payout;
- a per-referrer cap (Bybit's is $5,000 a quarter);
- a net-fee basis that excludes discounted or rebated flow;
- an inactivity cutoff (Bybit and OKX use 180 days);
- one-per-household and one-per-payment-method rules;
- clawback of profits, not just rewards ([eToro](https://www.etoro.com/wp-content/uploads/2026/09/RAF-Program-TCs-September-2026.pdf); [Kraken](https://www.kraken.com/legal/referrals)).

Its 7-day hold is far shorter than broker lock-ups, which run from 30 days to a year.

The economics are smaller than they look. A friend trading $10,000 a month generates $50 in fees, so a 30% share is $15 a month, or about **$180 over 12 months**. That is roughly what eToro or IBKR pay as a one-off flat reward, except that theirs is capped, gated on deposits and locked up.

## A two-track programme keeps the growth and sheds the exposure

Mercury's licensing path is undecided, so the right programme is one that works on every path. It should avoid creating evidence of solicitation in markets Mercury is not licensed for, and leave room to add fee share later where a licence and regulator approval allow it. The structures below are ordered roughly from highest to lowest risk for xStocks referrals. The "where it's used" and legal-position entries draw on the sources cited in the sections above.

| Structure                                                                       | Where it is used                                               | Legal position                                                                                                                                                                                                                                                                                                                        | Trade-off for Mercury                                                                                         |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Current plan:** 25–35% of fee to any user, 12 months, monthly USDC            | Bybit, OKX, Coinbase, on crypto only                           | Highest risk: ongoing pay tied to transactions, to unvetted people, for securities trades; prohibited in Poland; needs pre-approval in Dubai                                                                                                                                                                                          | Strongest pull for super-referrers; uncapped cost (about 0.125–0.175% of friend volume); invites wash trading |
| **Crypto-only fee share** that excludes xStocks trades                          | Kraken excludes equities                                       | No general MiCA inducement test, but banned for crypto in the UK, Singapore and Turkey; VARA pre-clearance                                                                                                                                                                                                                            | Keeps the fee-share mechanic, but not on Mercury's main revenue line                                          |
| **Revenue share for vetted, contracted partners only**                          | Kraken, Coinbase, Binance, eToro Partners; Jupiter integrators | Lower than open revenue share; firm stays responsible for partner content; partners must be licensed where required                                                                                                                                                                                                                   | Scales through a few big partners; needs firm-prepared content, written agreements and monitoring             |
| **Flat, capped reward to the inviter** after the friend funds, trades and holds | eToro, IBKR, Trade Republic, Scalable, Kraken Pro              | Standard practice at licensed brokers; still a per-client payment Poland prohibits; still an "incentive" under UK and Singapore crypto rules and VARA                                                                                                                                                                                 | Predictable cost ($20–250 benchmarks); needs holds and caps against multi-accounting                          |
| **In-kind stock-token reward** with a holding period                            | Robinhood EU (180 days), Trading 212, Bybit                    | Same as flat cash; giving away xStocks is still distributing a security                                                                                                                                                                                                                                                               | Robinhood's free-share era is the best public growth evidence; reward value moves with the market             |
| **Fee discount for the friend**, time-limited and not tiered by volume          | Bybit EU coupons; Kraken referee cashback                      | A benefit to the client falls outside MiFID Art. 24(9); Hong Kong's crypto-platform rules carve out fee discounts ([Slaughter and May](https://slaughterandmay.com/media/z1wjejxt/new_regulatory_requirements_for_virtual_asset_trading_platform_operators_come_into_effect_4391pdf.pdf)); still a trading incentive under MAS PS-G03 | No cash leaves Mercury; can push overtrading during the window                                                |
| **Fixed creator fees** not tied to conversions                                  | Expressly accepted by the UKNF                                 | Lowest inducement risk                                                                                                                                                                                                                                                                                                                | No performance link; labelling and pre-approval duties remain                                                 |

The recommended design has two tracks.

**Track 1, for every user**, pairs two rewards:

- **For the friend:** a time-limited fee discount, the same for every new user and not tiered by volume.
- **For the inviter:** a flat, capped reward paid only after the friend funds, trades and keeps the position or balance for 30–90 days, which is closer to broker lock-ups than the current 7 days.

The anchors are Kraken Pro's $20 with a $200 cap and Trade Republic's 40 referrals or €2,000. The terms should include:

- private sharing only, with no public posting of links (Trade Republic's rule);
- a same-country rule for inviter and friend (Kraken's rule);
- a single tier with nothing paid to join;
- no "earn" or "passive income" framing.

**Track 2, for partners**, is application-only:

- referrers are KYC'd and under contract;
- they use firm-prepared or pre-approved content;
- their agreements are written to anticipate RIS Art. 24c;
- payouts are capped and monitored.

Revenue share is acceptable on this track only in jurisdictions counsel clears. Where local rules demand it, the partner should hold the local status itself: a tied agent in the EU, an _assessor_ in Brazil, an SCA-licensed finfluencer in the UAE. Alternatively, Track 2 can run through a licensed distributor's own affiliate programme.

**Geography comes before generosity.** Brazil, Turkey, the Philippines, Vietnam, India, Saudi Arabia and Nigeria should be excluded from any referral reward, or from the app, because there the referral programme sharpens a licensing problem that already exists. The EU/EEA, Singapore, Hong Kong and the UAE should be excluded from any fee share until Mercury or a partner holds the relevant licence. The US, UK, Canada and Australia, which Kraken excludes from xStocks entirely, need the same treatment.

None of this works unless Mercury knows who and where its referrers are. A self-custodial app has to add KYC and sanctions screening before payout, and link each payout wallet to a verified person, before it can enforce country rules that every platform reviewed relies on. Rewards are also taxable income to recipients in most markets.

These are the questions to put to counsel, in roughly the order they decide the design:

| #   | Question for counsel                                                                                                                                                                                                                                                                 | Why it decides the design                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 1   | Does Mercury's front-end, which builds Jupiter swaps and takes 0.5% per trade, perform reception and transmission of orders (EU), dealing or arranging (Hong Kong, Singapore), or intermediation (Brazil) in each target market?                                                     | If yes, the referral question is downstream of a licence Mercury lacks            |
| 2   | Do Backed's base prospectus, Final Terms or distributor terms limit who may distribute xStocks to retail (for example, MiFID-authorised firms only), or how distributors may incentivise purchases? Are KIDs available?                                                              | The issuer's terms may rule out any referral reward regardless of local law       |
| 3   | Which countries must be blocked from the app entirely, and which only from referrals? Does Mercury's geo-fencing count as "effective measures" under CVM Pareceres 32/05 and 33/05 and VARA's targeting factors?                                                                     | Sets the excluded-country list and the technical controls behind it               |
| 4   | For each EU state served, is a flat per-referral reward to a client a prohibited per-client (cost-per-action) inducement or reserved client acquisition? Is excluding Poland, Spain, Portugal and Italy enough, and what about the Netherlands and France (canvassing rules)?        | Decides whether Track 1 can run in the EU at all                                  |
| 5   | Does a fee discount given only to the referred friend fall outside the inducement rule and local incentive bans in each market?                                                                                                                                                      | It is the lowest-risk growth lever if it holds                                    |
| 6   | Does running any paid referral programme turn Mercury's presence into a public offer or solicitation (Mexico, Nigeria, Brazil, the EU under reverse-solicitation rules)?                                                                                                             | The programme can raise the risk of the core business, not just the referral line |
| 7   | What personal licensing or permit duties fall on Mercury's referrers (UAE SCA licence and Media Council permit, UK financial-promotion rules, Hong Kong), and what must Mercury tell them?                                                                                           | Avoids exposing users to criminal or administrative liability                     |
| 8   | Can a partner revenue-share track run through tied agents, assessores or introducers appointed by a licensed partner, and which partner would accept that?                                                                                                                           | Decides whether Track 2 is viable and where                                       |
| 9   | What is Mercury's status for USDC payouts under DAC8 and CARF (crypto tax reporting), the Transfer of Funds Regulation, Brazil's FX rules for self-custody transfers, and the UAE's 2025 decree-law? Does it carry any withholding, VAT or tax-reporting duty for referrers' income? | Determines the KYC and reporting work that every payout carries                   |
| 10  | Does Mercury receive, or could it receive, any routing rebate or third-party payment (Jupiter, market makers) that MiFIR Art. 39a or MiCA Art. 80(2) would ban?                                                                                                                      | A separate inducement exposure that the fee share could compound                  |
| 11  | If Mercury goes the licensed route (EU subsidiary, partner distributor, UAE licence), which referral designs will that regulator approve, and on what conditions?                                                                                                                    | Fee share returns as a feature to unlock, not a launch default                    |

## Conclusion

The referral decision is really a licensing decision. VARA's case study shows that a fee-share referral is not illegal in itself; it is a feature that licensed firms run with the regulator's approval. For an unlicensed front-end it does something worse than carry its own risk. It turns "users find us" into a documented record of paid solicitation in every country where it pays out, and that record would be used against the xStocks business itself. The cheapest compliance step available is to make the programme country-aware before making it generous.

Giving up the fee share also costs less than it seems. For a typical active friend, 12 months of fee share comes to about what brokers pay as a single flat reward. What the fee share uniquely buys is uncapped upside for super-referrers and influencers, the channel regulators are now prosecuting in London, arresting in Hong Kong and licensing in the UAE. The flat-reward-plus-partner design keeps most of the growth while moving the risky slice into contracts Mercury can monitor and end. The regulatory direction strengthens that choice: the EU's 2029 finfluencer rules, Member State options to ban inducements, and the Digital Fairness Act, still untabled and aimed at influencer marketing and addictive design ([European Parliament](https://www.europarl.europa.eu/legislative-train/theme-protecting-our-democracy-upholding-our-values/file-digital-fairness-act)), all push toward the structure recommended here.
