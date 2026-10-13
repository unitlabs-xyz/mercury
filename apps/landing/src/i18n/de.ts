import type { Dict } from "./en";

export const de: Dict = {
  meta: {
    tagline: "Das Finanzkonto für die Onchain-Welt.",
    description:
      "Besitze echte Aktien aus aller Welt ab $5, investiere mit Baskets in ganze Themen und leih dir Geld gegen deine Aktien, statt sie zu verkaufen. Alles aus einer Wallet, die dir gehört.",
    ogAlt: "Mercury, das Finanzkonto für die Onchain-Welt.",
  },

  ui: {
    skip: "Zum Inhalt springen",
    home: "Mercury Startseite",
    mainNav: "Hauptmenü",
    menuNav: "Menü",
    openMenu: "Menü öffnen",
    closeMenu: "Menü schließen",
    language: "Sprache",
    cta: "Beta testen",
  },

  nav: {
    howItWorks: "So funktioniert’s",
    baskets: "Baskets",
    card: "Karte",
    faqs: "FAQ",
  },

  footer: {
    explore: "Entdecken",
    company: "Unternehmen",
    follow: "Folgen",
    legal: "Rechtliches",
    about: "Über uns",
    contact: "Kontakt",
    terms: "AGB",
    privacy: "Datenschutz",
    rights: "Global · Alle Rechte vorbehalten.",
  },

  hero: {
    heading: ["Das Finanzkonto", "für die Onchain-Welt."],
    lead: "Besitze echte Aktien aus aller Welt ab $5, investiere mit Baskets in ganze Themen und leih dir Geld gegen deine Aktien, statt sie zu verkaufen. Alles aus einer Wallet, die dir gehört, eröffnet mit nur einer E-Mail.",
    imageLabel: "Titelbild",
  },

  trust: {
    caption: "Aktien verwahrt und tokenisiert von",
  },

  everything: {
    heading: ["Alles, was dein Geld kann,", "in einem Konto."],
    lead: "Kein Depot, keine Identitätsprüfung, keine Bankwege. Wenn du einen Stablecoin halten kannst, kannst du auch Nvidia halten.",
    hold: {
      stamp: "HALTEN",
      title: "Dein Geld bleibt in deiner Wallet.",
      body: "Melde dich mit einer E-Mail an und Mercury erstellt eine Wallet, die nur dir gehört. Keine Seed-Phrase, keine Erweiterung.",
      points: [
        "USDC auf Solana, rein und raus, ohne Bank dazwischen.",
        "Senden und empfangen rund um die Uhr, auch am Wochenende",
        "Gehen kostet eine Transaktion und niemandes Erlaubnis",
      ],
      alt: "Geld einzahlen: eine Solana-Einzahlungsadresse mit QR-Code.",
    },
    invest: {
      stamp: "INVESTIEREN",
      title: "Mach aus Stablecoins echte Aktien.",
      body: "Über 450 globale Aktien und ETFs. Bei jeder Order vergleichen wir die Preise mehrerer Anbieter und wählen den besten für dich.",
      points: [
        "Ab $5, in Aktienbruchteilen",
        "Immer der beste Preis aller Anbieter",
        "Orders weit weg vom echten Aktienkurs warten oder werden abgelehnt",
      ],
      alt: "Nvidia kaufen: Kurse von zwei Emittenten, mit Kostenaufschlüsselung.",
    },
  },

  addCash: {
    title: "Geld einzahlen",
    lede: "Sende USDC an diese Adresse. Es kommt als Cash an, bereit zum Investieren.",
    addressLabel: "Deine Solana-Adresse",
    qrAlt: "Solana-Einzahlungsadresse {address} als QR-Code",
    copy: "Adresse kopieren",
    copied: "Adresse kopiert",
  },

  buyQuote: {
    youPay: "Du zahlst",
    pricePerShare: "Preis pro Aktie",
    shares: "Aktien",
    route: "Route",
  },

  pillars: {
    grow: {
      stamp: "Wachsen",
      title: "Dividenden werden zu Aktien.",
      body: "Dividenden kommen als zusätzliche Aktienanteile an. Mercury zählt die echten Aktien hinter jedem Token, damit deine Zahl stimmt.",
      alt: "Eine Aktienanzahl, die nach einer Dividende gestiegen ist.",
      label: "Nvidia, tatsächliche Position",
      value: "{n} Aktien",
      pill: "+{n}",
      note: "durch Dividenden hinzugekommen",
    },
    borrow: {
      stamp: "Leihen",
      title: "Cash, ohne zu verkaufen.",
      body: "Brauchst du Dollar? Leih dir Geld gegen deine Aktien, statt sie zu verkaufen. Das Cash landet in deinem Guthaben, und die Aktien bleiben deine.",
      alt: "Beleihungsrahmen gegen die gehaltenen Aktien.",
      label: "Beleihungsrahmen",
      note: "Gegen {amount} Bestand",
    },
    spend: {
      stamp: "Ausgeben · Demnächst",
      title: "Eine Karte für dein Guthaben.",
      body: "Als Nächstes kommt die Mercury Karte: dein Cash-Guthaben, einsetzbar in jedem Geschäft der Welt, damit deine Investments investiert bleiben.",
      alt: "Die Mercury Karte, bald verfügbar.",
      label: "Mercury Karte",
      note: "Bald verfügbar",
    },
  },

  baskets: {
    heading: ["Ein ganzes Thema,", "in einem Basket."],
    lead: "Wähle ein Thema wie die Magnificent Seven, KI oder Kernenergie und investiere mit einer einzigen Zahlung. Der Basket liegt in deinem eigenen Konto, wird täglich neu gewichtet und kommt zu dir zurück, sobald du aussteigst.",
    alt: "Der Magnificent Seven Basket und wie ein Basket funktioniert",
    kind: "Basket · Technologie",
    name: "Magnificent Seven",
    holdings: "{n} Positionen",
    note: "Täglich neu gewichtet",
    weights: "Zielgewichte",
    howTitle: "So funktioniert ein Basket",
    how: [
      { label: "Wo er liegt", value: "In deinem eigenen Konto" },
      { label: "Mit anderen gebündelt", value: "Nie" },
    ],
    leave: { label: "Beim Ausstieg", value: "In Aktien oder als Cash" },
    howNote: "{n} Baskets live, von KI bis Gold, dazu Strategien nach dem Vorbild bekannter Investoren.",
  },

  custody: {
    heading: ["Verwahrt von Verwahrern.", "Kontrolliert von dir."],
    lead: "Jeder Token ist eins zu eins durch eine echte Aktie bei einem regulierten Verwahrer gedeckt. Wir halten nie deine Schlüssel, und kein Teil dieses Produkts kann dein Geld ohne dich bewegen.",
    alt: "Eine Aktie beim Verwahrer, gespiegelt als Token auf Solana, in deiner Wallet",
    pins: ["Deine Wallet", "Token auf Solana", "Aktie beim Verwahrer"],
    columns: [
      {
        title: "Eins zu eins gedeckt",
        body: "Jeder Token steht für eine echte Aktie bei einem namentlich genannten Verwahrer, und wir zeigen dir vor dem Kauf, von welchem Anbieter er stammt.",
      },
      {
        title: "Jede Zahl hat eine Quelle",
        body: "Preise zeigen, wo und wann sie abgerufen wurden. Eine Zahl ohne Herkunft zeigen wir dir nicht.",
      },
      {
        title: "Lieber abgelehnt als schlecht ausgeführt",
        body: "Kostet der Token mehr, als die Aktie wert ist, wartet die Order oder wird abgelehnt. Eine schlechte Ausführung ist schlimmer als keine.",
      },
    ],
  },

  faqs: {
    title: "FAQ",
    items: [
      {
        q: "Gehören mir die Aktien wirklich?",
        a: "Jeder Token ist eins zu eins durch eine echte Aktie bei einem regulierten Verwahrer gedeckt. Du hältst den Token in deiner eigenen Wallet und kannst ihn jederzeit abziehen.",
      },
      {
        q: "Was passiert, wenn die Börse geschlossen ist?",
        a: "Token werden weiter gehandelt, wenn die Börse ruht, daher kann der Preis von der echten Aktie abweichen. Wir vergleichen beide und warten, statt dir eine Aktie zum Panikpreis zu kaufen.",
      },
      {
        q: "Muss ich meine Identität bestätigen?",
        a: "Nein. Du meldest dich mit einer E-Mail an und bekommst eine Wallet. Keine Dokumente, keine Formulare.",
      },
      {
        q: "Was kostet Mercury?",
        a: "Keine Kontogebühr und keine Mercury-Gebühr auf Trades. Du zahlst den Marktpreis des Tokens, und jeder Aufschlag und jede Netzwerkgebühr wird angezeigt, bevor du bestätigst.",
      },
      {
        q: "Was ist ein Basket?",
        a: "Ein fertiges Portfolio rund um ein Thema, etwa die Magnificent Seven. Eine Zahlung kauft jede Position in ihrem Zielgewicht, in einem Konto, das nur dir gehört, und der Basket wird täglich neu gewichtet.",
      },
      {
        q: "Kann ich meine Aktien woanders hin übertragen?",
        a: "Ja. Es sind Token in deiner Wallet, kein Eintrag in unserem Buch. Sende sie überall hin, wo sie akzeptiert werden, ohne dass wir zustimmen müssen.",
      },
    ],
  },

  cta: {
    heading: ["Mercury ist da.", "Teste die Beta heute."],
    note: "Melde dich mit einer E-Mail an und besitze in wenigen Minuten deine erste Aktie.",
    label: "Mercury Beta testen",
  },
};
